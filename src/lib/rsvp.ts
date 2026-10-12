import type { Api } from "grammy";
import { sql } from "@/lib/db";
import { render } from "@/bot/trainings";
import { t, isLang, type Lang } from "@/bot/i18n";
import { formatWhen } from "@/bot/format";

export type AnswerResult = "ok" | "same" | "notfound" | "past" | "cancelled" | "notmember";

// Перерисовывает опрос в Telegram-группе после изменений (ответ с сайта, отмена и т. д.)
export async function refreshPoll(api: Api, trainingId: string | number) {
  const [r] = await sql`select poll_chat_id, poll_message_id from trainings where id = ${trainingId}`;
  if (!r || !r.poll_chat_id || Number(r.poll_message_id) <= 0) return;
  try {
    const { text, keyboard } = await render(trainingId);
    await api.editMessageText(r.poll_chat_id, Number(r.poll_message_id), text, {
      reply_markup: keyboard,
    });
  } catch {
    /* текст не изменился или сообщение удалено — не страшно */
  }
}

export type AnswerStatus = "going" | "not_going" | "later";
export type AnswerOutcome = {
  result: AnswerResult;
  placement?: "confirmed" | "waitlist";
  position?: number;
};

// Очередь желающих пойти: кто нажал «Иду» раньше, тот выше. Первые N (по числу мест) идут, остальные ждут.
async function goingQueue(trainingId: string | number): Promise<string[]> {
  const rows = await sql`
    select user_id from rsvps
    where training_id = ${trainingId} and status = 'going'
    order by going_at nulls last, updated_at`;
  return rows.map((r) => String(r.user_id));
}

// Записывает ответ (иду / не иду / отвечу позже) из бота или с сайта.
// Двигает очередь, уведомляет тех, кто получил место, и организаторов, и обновляет опрос в группе.
export async function applyAnswer(
  api: Api,
  userId: string,
  trainingId: string,
  status: AnswerStatus,
  teamId?: string
): Promise<AnswerOutcome> {
  const [tr] = await sql`
    select tr.id, tr.team_id, tr.starts_at, tr.cancelled_at, tr.needed_players,
           tm.name as team_name, tm.timezone, tm.language
    from trainings tr join teams tm on tm.id = tr.team_id
    where tr.id = ${trainingId}`;
  if (!tr || (teamId && String(tr.team_id) !== String(teamId))) return { result: "notfound" };
  if (tr.cancelled_at) return { result: "cancelled" };
  if (tr.starts_at < new Date()) return { result: "past" };

  const [member] = await sql`
    select 1 as ok from memberships where team_id = ${tr.team_id} and user_id = ${userId}`;
  if (!member) return { result: "notmember" };

  const [current] = await sql`
    select status from rsvps where training_id = ${trainingId} and user_id = ${userId}`;
  if (current && current.status === status && status !== "later") return { result: "same" };

  const cap = tr.needed_players ? Number(tr.needed_players) : 0; // 0 = мест без ограничения
  const me = String(userId);
  const before = await goingQueue(trainingId);
  const confirmedBefore = cap ? before.slice(0, cap) : before;

  await sql.begin(async (tx) => {
    await tx`
      insert into rsvps (training_id, user_id, status, going_at, remind_at)
      values (
        ${trainingId}, ${userId}, ${status}::text,
        case when ${status}::text = 'going' then now() else null end,
        case when ${status}::text = 'later' then now() + interval '1 hour' else null end
      )
      on conflict (training_id, user_id) do update set
        status = excluded.status,
        going_at = case
          when excluded.status = 'going'
            then coalesce(case when rsvps.status = 'going' then rsvps.going_at end, now())
          else null end,
        remind_at = excluded.remind_at,
        updated_at = now()`;
    await tx`
      insert into rsvp_events (training_id, user_id, status)
      values (${trainingId}, ${userId}, ${status})`;
  });

  const after = await goingQueue(trainingId);
  const confirmedAfter = cap ? after.slice(0, cap) : after;
  const idx = after.indexOf(me);

  const outcome: AnswerOutcome = { result: "ok" };
  if (status === "going") {
    outcome.placement = !cap || idx < cap ? "confirmed" : "waitlist";
    if (outcome.placement === "waitlist") outcome.position = idx - cap + 1;
  }

  // Кто получил место благодаря этому изменению (подвинулась очередь)
  const promotedIds = confirmedAfter.filter((id) => !confirmedBefore.includes(id) && id !== me);
  const wasGoing = before.includes(me);
  const teamLang = tr.language as Lang;

  try {
    const promoted = promotedIds.length
      ? await sql`select id, first_name, telegram_id, language from users where id in ${sql(promotedIds)}`
      : [];

    for (const u of promoted) {
      const lang: Lang = isLang(u.language) ? u.language : teamLang;
      try {
        await api.sendMessage(
          u.telegram_id,
          t(lang, "promoted_dm", { when: formatWhen(tr.starts_at, tr.timezone, lang), team: tr.team_name })
        );
      } catch {
        /* человек не начинал диалог с ботом */
      }
    }

    // Организаторам: кто-то перестал идти
    if (wasGoing && status !== "going") {
      const [actor] = await sql`select first_name from users where id = ${userId}`;
      const admins = await sql`
        select u.telegram_id, u.language
        from memberships m join users u on u.id = m.user_id
        where m.team_id = ${tr.team_id} and m.role = 'admin' and m.user_id <> ${userId}`;
      for (const a of admins) {
        const lang: Lang = isLang(a.language) ? a.language : teamLang;
        const count = cap ? `${confirmedAfter.length}/${cap}` : `${confirmedAfter.length}`;
        let text = t(lang, "org_left", {
          name: actor?.first_name ?? "",
          when: formatWhen(tr.starts_at, tr.timezone, lang),
          count,
        });
        if (cap) text += " " + t(lang, "org_free", { free: Math.max(0, cap - confirmedAfter.length) });
        if (promoted.length > 0) {
          text += "\n" + t(lang, "org_promoted", { names: promoted.map((p) => p.first_name).join(", ") });
        }
        try {
          await api.sendMessage(a.telegram_id, text);
        } catch {
          /* организатор не начинал диалог с ботом */
        }
      }
    }
  } catch (e) {
    console.error("applyAnswer notify:", e);
  }

  await refreshPoll(api, trainingId);
  return outcome;
}

// Отменяет тренировку: помечает в базе, убирает опрос из группы и пишет туда сообщение об отмене
export async function cancelTraining(api: Api, trainingId: string): Promise<boolean> {
  const [tr] = await sql`
    select tr.id, tr.starts_at, tr.poll_chat_id, tr.poll_message_id,
           tm.timezone, tm.language
    from trainings tr join teams tm on tm.id = tr.team_id
    where tr.id = ${trainingId} and tr.cancelled_at is null`;
  if (!tr) return false;

  await sql`update trainings set cancelled_at = now() where id = ${trainingId}`;

  if (tr.poll_chat_id && Number(tr.poll_message_id) > 0) {
    try {
      await api.deleteMessage(tr.poll_chat_id, Number(tr.poll_message_id));
    } catch {
      /* сообщение уже удалено или нет прав */
    }
    try {
      const lang = tr.language as Lang;
      await api.sendMessage(
        tr.poll_chat_id,
        t(lang, "training_cancelled", { when: formatWhen(tr.starts_at, tr.timezone, lang) })
      );
    } catch {
      /* бот не в группе — не страшно */
    }
  }
  return true;
}
