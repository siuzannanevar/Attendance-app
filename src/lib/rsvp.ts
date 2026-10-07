import type { Api } from "grammy";
import { sql } from "@/lib/db";
import { render } from "@/bot/trainings";
import { t, type Lang } from "@/bot/i18n";
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

// Записывает ответ «иду / не иду» (с сайта) и обновляет опрос в группе
export async function saveAnswer(
  api: Api,
  userId: string,
  trainingId: string,
  teamId: string,
  status: "going" | "not_going"
): Promise<AnswerResult> {
  const [tr] = await sql`
    select team_id, starts_at, cancelled_at from trainings
    where id = ${trainingId} and team_id = ${teamId}`;
  if (!tr) return "notfound";
  if (tr.cancelled_at) return "cancelled";
  if (tr.starts_at < new Date()) return "past";

  const [member] = await sql`
    select 1 as ok from memberships where team_id = ${teamId} and user_id = ${userId}`;
  if (!member) return "notmember";

  const [current] = await sql`
    select status from rsvps where training_id = ${trainingId} and user_id = ${userId}`;
  if (current && current.status === status) return "same";

  await sql.begin(async (tx) => {
    await tx`
      insert into rsvps (training_id, user_id, status)
      values (${trainingId}, ${userId}, ${status})
      on conflict (training_id, user_id)
      do update set status = excluded.status, updated_at = now()`;
    await tx`
      insert into rsvp_events (training_id, user_id, status)
      values (${trainingId}, ${userId}, ${status})`;
  });
  await refreshPoll(api, trainingId);
  return "ok";
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
