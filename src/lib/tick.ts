import { InlineKeyboard } from "grammy";
import type { Api } from "grammy";
import { sql } from "@/lib/db";
import { render } from "@/bot/trainings";
import { t, isLang, type Lang } from "@/bot/i18n";
import { formatWhen } from "@/bot/format";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// «Тик» планировщика. Безопасно вызывать сколько угодно раз: повторно ничего не отправит.
//  A) создаёт ближайшие тренировки по расписанию (на 14 дней вперёд);
//  B) публикует опросы, у которых наступило время;
//  C) напоминает тем, кто не ответил, и предупреждает организатора о недоборе.
export async function runTick(api: Api, onlyTeamId?: string | number) {
  const stats = { created: 0, published: 0, reminded: 0, alerts: 0, errors: 0 };
  const teamFilter = onlyTeamId ? sql`and tm.id = ${onlyTeamId}` : sql``;

  // ---------- A. Создать тренировки по расписанию
  const created = await sql`
    insert into trainings (team_id, starts_at, place, needed_players, created_by, schedule_id)
    select s.team_id, ((x.d + s.start_time) at time zone tm.timezone),
           s.place, s.needed_players, s.created_by, s.id
    from schedules s
    join teams tm on tm.id = s.team_id
    cross join generate_series(0, 14) as g(n)
    cross join lateral (select ((now() at time zone tm.timezone)::date + g.n) as d) x
    where s.active
      and extract(isodow from x.d) = s.weekday
      and ((x.d + s.start_time) at time zone tm.timezone) > now()
      ${teamFilter}
    on conflict (schedule_id, starts_at) do nothing
    returning id`;
  stats.created = created.length;

  // ---------- B. Опубликовать опросы, которым пора
  const due = await sql`
    select tr.id, tm.chat_id
    from trainings tr join teams tm on tm.id = tr.team_id
    where tr.schedule_id is not null
      and tr.poll_message_id is null
      and tr.starts_at > now()
      and tr.starts_at - make_interval(hours => tm.poll_hours_before) <= now()
      and tm.chat_id is not null
      ${teamFilter}
    order by tr.starts_at`;

  for (const row of due) {
    // «Занимаем» тренировку, чтобы два тика одновременно не отправили опрос дважды
    const [claim] = await sql`
      update trainings set poll_message_id = 0
      where id = ${row.id} and poll_message_id is null
      returning id`;
    if (!claim) continue;
    try {
      const { text, keyboard } = await render(row.id);
      const msg = await api.sendMessage(row.chat_id, text, { reply_markup: keyboard });
      await sql`
        update trainings
        set poll_chat_id = ${row.chat_id}, poll_message_id = ${msg.message_id}, poll_posted_at = now()
        where id = ${row.id}`;
      stats.published++;
    } catch (e) {
      console.error("tick publish:", e);
      await sql`update trainings set poll_message_id = null where id = ${row.id}`;
      stats.errors++;
    }
  }

  // ---------- C. Напоминания и предупреждения о недоборе
  const toRemind = await sql`
    select tr.id, tr.starts_at, tr.place, tr.needed_players, tr.poll_message_id,
           tm.id as team_id, tm.name as team_name, tm.chat_id, tm.language, tm.timezone
    from trainings tr join teams tm on tm.id = tr.team_id
    where tr.poll_message_id > 0
      and tr.reminded_at is null
      and tr.starts_at > now()
      and tr.starts_at - make_interval(hours => tm.remind_hours_before) <= now()
      and coalesce(tr.poll_posted_at, tr.created_at) < now() - interval '1 hour'
      ${teamFilter}
    order by tr.starts_at`;

  for (const row of toRemind) {
    const [claim] = await sql`
      update trainings set reminded_at = now()
      where id = ${row.id} and reminded_at is null
      returning id`;
    if (!claim) continue;

    const teamLang = row.language as Lang;
    try {
      const unanswered = await sql`
        select u.first_name, u.telegram_id
        from memberships m join users u on u.id = m.user_id
        where m.team_id = ${row.team_id} and m.plays
          and not exists (
            select 1 from rsvps r where r.training_id = ${row.id} and r.user_id = m.user_id
          )
        order by u.first_name`;
      const [{ going }] = await sql`
        select count(*)::int as going from rsvps
        where training_id = ${row.id} and status = 'going'`;

      // 1) Напоминание в группу с «упоминаниями» (приходит как заметное уведомление)
      if (unanswered.length > 0 && row.chat_id) {
        const names = unanswered
          .map((u) => `<a href="tg://user?id=${u.telegram_id}">${esc(u.first_name)}</a>`)
          .join(", ");
        const text = t(teamLang, "reminder_group", {
          when: esc(formatWhen(row.starts_at, row.timezone, teamLang)),
          count: going,
          names,
        });
        await api.sendMessage(row.chat_id, text, {
          parse_mode: "HTML",
          reply_parameters: { message_id: Number(row.poll_message_id), allow_sending_without_reply: true },
        });
        stats.reminded++;
      }

      // 2) Предупреждение организаторам, если игроков не хватает
      const needed = row.needed_players as number | null;
      if (needed && going < needed) {
        const admins = await sql`
          select u.telegram_id, u.language
          from memberships m join users u on u.id = m.user_id
          where m.team_id = ${row.team_id} and m.role = 'admin'`;
        for (const a of admins) {
          const lang: Lang = isLang(a.language) ? a.language : teamLang;
          const text = t(lang, "alert_shortage", {
            team: row.team_name,
            when: formatWhen(row.starts_at, row.timezone, lang),
            going,
            needed,
            missing: needed - going,
          });
          const kb = new InlineKeyboard()
            .text(t(lang, "btn_call"), `sf:call:${row.id}`)
            .row()
            .text(t(lang, "btn_invite_text"), `sf:text:${row.id}`);
          try {
            await api.sendMessage(a.telegram_id, text, { reply_markup: kb });
            stats.alerts++;
          } catch (e) {
            console.error("tick alert (организатор не начал диалог с ботом?):", e);
          }
        }
      }
    } catch (e) {
      console.error("tick remind:", e);
      stats.errors++;
    }
  }

  return stats;
}