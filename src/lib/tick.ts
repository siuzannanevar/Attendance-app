import { InlineKeyboard } from "grammy";
import type { Api } from "grammy";
import { sql } from "@/lib/db";
import { render } from "@/bot/trainings";
import { t, isLang, type Lang } from "@/bot/i18n";
import { formatWhen } from "@/bot/format";
import { loadSeats } from "@/lib/seats";

// Ошибки, после которых имеет смысл повторить отправку позже: сбой сети, лимит Telegram (429), ошибки сервера (5xx).
// 400/403 (бот не в группе, человек не начинал диалог с ботом) повторять бессмысленно.
function isRetryable(e: unknown): boolean {
  const code = (e as { error_code?: number } | null)?.error_code;
  return code === undefined || code === 429 || code >= 500;
}

// «Тик» планировщика. Безопасно вызывать сколько угодно раз: повторно ничего не отправит.
//  A) создаёт ближайшие тренировки по расписанию (на 14 дней вперёд);
//  B) публикует опросы, у которых наступило время;
//  C) предупреждает организаторов (в личку) о недоборе и пишет, кто ещё не ответил;
//  D) возвращает «Отвечу позже» через час;
//  E) при недоборе пишет запасным игрокам лично, по очереди.
export async function runTick(api: Api, onlyTeamId?: string | number) {
  const stats = { created: 0, published: 0, reminded: 0, alerts: 0, laters: 0, reserves: 0, errors: 0 };
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
      and tr.cancelled_at is null
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
      and tr.cancelled_at is null
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
        select u.first_name
        from memberships m join users u on u.id = m.user_id
        where m.team_id = ${row.team_id} and m.plays
          and not exists (
            select 1 from rsvps r
            where r.training_id = ${row.id} and r.user_id = m.user_id
              and (r.status in ('going', 'not_going') or r.remind_at > now())
          )
        order by u.first_name`;
      const going = (await loadSeats(row.id)).length; // занято мест: участники и гости

      // Если игроков не хватает, пишем ТОЛЬКО организаторам (в личку), в группу ничего не отправляем.
      // В сообщении: сколько идёт, сколько не хватает и кто ещё не ответил.
      const needed = row.needed_players as number | null;
      if (needed && going < needed) {
        const admins = await sql`
          select u.telegram_id, u.language
          from memberships m join users u on u.id = m.user_id
          where m.team_id = ${row.team_id} and m.role = 'admin'`;
        let sent = 0;
        let retryable = 0;
        for (const a of admins) {
          const lang: Lang = isLang(a.language) ? a.language : teamLang;
          let text = t(lang, "alert_shortage", {
            team: row.team_name,
            when: formatWhen(row.starts_at, row.timezone, lang),
            going,
            needed,
            missing: needed - going,
          });
          if (unanswered.length > 0) {
            text += "\n" + t(lang, "alert_unanswered", { names: unanswered.map((u) => u.first_name).join(", ") });
          }
          const kb = new InlineKeyboard()
            .text(t(lang, "btn_call"), `sf:call:${row.id}`)
            .row()
            .text(t(lang, "btn_invite_text"), `sf:text:${row.id}`);
          try {
            await api.sendMessage(a.telegram_id, text, { reply_markup: kb });
            stats.alerts++;
            sent++;
          } catch (e) {
            console.error("tick alert (организатор не начал диалог с ботом?):", e);
            if (isRetryable(e)) retryable++;
          }
        }
        // Никому не дошло из-за временного сбоя: не теряем предупреждение, следующий запуск повторит
        if (sent === 0 && retryable > 0) {
          stats.errors++;
          await sql`update trainings set reminded_at = null where id = ${row.id}`;
          continue;
        }
      }
    } catch (e) {
      console.error("tick remind:", e);
      stats.errors++;
    }
  }

  // ---------- D. «Отвечу позже»: через час снова присылаем опрос тем, кто просил напомнить
  const laters = await sql`
    select r.training_id, r.user_id, u.telegram_id, u.language, tm.language as team_language,
           exists (
             select 1 from memberships m
             where m.team_id = tr.team_id and m.user_id = r.user_id
               and m.reserve_order is not null and not m.plays
           ) as is_reserve
    from rsvps r
    join users u on u.id = r.user_id
    join trainings tr on tr.id = r.training_id
    join teams tm on tm.id = tr.team_id
    where r.status = 'later' and r.remind_at is not null and r.remind_at <= now()
      and tr.starts_at > now() and tr.cancelled_at is null
      ${teamFilter}`;

  for (const l of laters) {
    const [claim] = await sql`
      update rsvps set remind_at = null
      where training_id = ${l.training_id} and user_id = ${l.user_id}
        and remind_at is not null and remind_at <= now()
      returning 1 as ok`;
    if (!claim) continue;
    try {
      const { text, keyboard } = await render(l.training_id, { noGuests: !!l.is_reserve });
      const lang: Lang = isLang(l.language) ? l.language : (l.team_language as Lang);
      await api.sendMessage(l.telegram_id, t(lang, "later_reminder") + "\n\n" + text, {
        reply_markup: keyboard,
      });
      stats.laters++;
    } catch (e) {
      console.error("tick later:", e);
      stats.errors++;
      if (isRetryable(e)) {
        await sql`
          update rsvps set remind_at = now() + interval '5 minutes'
          where training_id = ${l.training_id} and user_id = ${l.user_id}
            and status = 'later' and remind_at is null`;
      }
    }
  }

  // ---------- E. Запасные: при недоборе бот сам пишет им лично, по очереди из списка запасных.
  // Спрашиваем столько человек, сколько не хватает. Кто отказался или не ответил за 2 часа, того заменяет следующий.
  const short = await sql`
    select tr.id, tr.team_id, tr.needed_players, tr.starts_at,
           tm.name as team_name, tm.timezone, tm.language
    from trainings tr join teams tm on tm.id = tr.team_id
    where tr.cancelled_at is null and tr.needed_players is not null
      and tr.poll_message_id > 0
      and tr.starts_at > now() + interval '1 hour'
      and tr.starts_at - make_interval(hours => tm.remind_hours_before) <= now()
      and exists (select 1 from memberships m where m.team_id = tr.team_id and m.reserve_order is not null)
      ${teamFilter}`;

  for (const tr of short) {
    try {
      const missing = Number(tr.needed_players) - (await loadSeats(tr.id)).length;
      if (missing <= 0) continue;

      // Уже спросили, ответа ждём (не дольше 2 часов)
      const [waiting] = await sql`
        select count(*)::int as n from reserve_asks a
        where a.training_id = ${tr.id} and a.asked_at > now() - interval '2 hours'
          and not exists (
            select 1 from rsvps r
            where r.training_id = a.training_id and r.user_id = a.user_id and r.status in ('going', 'not_going'))`;
      const need = missing - waiting.n;
      if (need <= 0) continue;

      const next = await sql`
        select u.id, u.telegram_id, u.language, u.first_name
        from memberships m join users u on u.id = m.user_id
        where m.team_id = ${tr.team_id} and m.reserve_order is not null
          and not exists (select 1 from reserve_asks a where a.training_id = ${tr.id} and a.user_id = m.user_id)
          and not exists (
            select 1 from rsvps r
            where r.training_id = ${tr.id} and r.user_id = m.user_id and r.status in ('going', 'not_going'))
        order by m.reserve_order
        limit ${need}`;

      const asked: string[] = [];
      for (const c of next) {
        const [claim] = await sql`
          insert into reserve_asks (training_id, user_id) values (${tr.id}, ${c.id})
          on conflict do nothing returning user_id`;
        if (!claim) continue;
        try {
          const lang: Lang = isLang(c.language) ? c.language : (tr.language as Lang);
          const { text, keyboard } = await render(tr.id, { noGuests: true }); // запасным: только «Иду / Не иду / Отвечу позже»
          const intro = t(lang, "reserve_ask", {
            when: formatWhen(tr.starts_at, tr.timezone, lang),
            team: tr.team_name,
          });
          await api.sendMessage(c.telegram_id, intro + "\n\n" + text, { reply_markup: keyboard });
          asked.push(c.first_name);
          stats.reserves++;
        } catch (e) {
          console.error("tick reserve:", e);
          stats.errors++;
          if (isRetryable(e)) {
            await sql`delete from reserve_asks where training_id = ${tr.id} and user_id = ${c.id}`; // повторим
          } else {
            // не удалось написать (не открывал бота): не ждём его ответа, следующий запасной будет спрошен
            await sql`
              update reserve_asks set asked_at = now() - interval '3 hours'
              where training_id = ${tr.id} and user_id = ${c.id}`;
          }
        }
      }

      // Организаторам: кому из запасных написали
      if (asked.length > 0) {
        const admins = await sql`
          select u.telegram_id, u.language
          from memberships m join users u on u.id = m.user_id
          where m.team_id = ${tr.team_id} and m.role = 'admin'`;
        for (const a of admins) {
          const lang: Lang = isLang(a.language) ? a.language : (tr.language as Lang);
          try {
            await api.sendMessage(
              a.telegram_id,
              t(lang, "reserve_org_asked", {
                when: formatWhen(tr.starts_at, tr.timezone, lang),
                team: tr.team_name,
                names: asked.join(", "),
              })
            );
          } catch {
            /* организатор не начинал диалог с ботом */
          }
        }
      }
    } catch (e) {
      console.error("tick reserve step:", e);
      stats.errors++;
    }
  }

  return stats;
}
