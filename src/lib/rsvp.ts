import type { Api } from "grammy";
import { sql } from "@/lib/db";
import { render } from "@/bot/trainings";
import { t, isLang, type Lang } from "@/bot/i18n";
import { formatWhen } from "@/bot/format";
import { loadSeats, splitSeats, type Seat } from "@/lib/seats";

export type AnswerResult =
  | "ok" | "same" | "notfound" | "past" | "cancelled" | "notmember" | "toomany";
export type AnswerStatus = "going" | "not_going" | "later";
export type AnswerOutcome = {
  result: AnswerResult;
  placement?: "confirmed" | "waitlist";
  position?: number;
};
export type GuestsOutcome = {
  result: AnswerResult;
  hostIn?: boolean;
  guestsIn?: number;
  guestsQueued?: number;
};

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

type TrainingInfo = {
  id: string;
  team_id: string;
  starts_at: Date;
  needed_players: number | null;
  team_name: string;
  timezone: string;
  language: string;
};

// Проверяет тренировку и членство; возвращает данные тренировки или код ошибки
async function checkTraining(
  userId: string,
  trainingId: string,
  teamId?: string
): Promise<{ tr: TrainingInfo } | { error: AnswerResult }> {
  const [tr] = await sql`
    select tr.id, tr.team_id, tr.starts_at, tr.cancelled_at, tr.needed_players,
           tm.name as team_name, tm.timezone, tm.language
    from trainings tr join teams tm on tm.id = tr.team_id
    where tr.id = ${trainingId}`;
  if (!tr || (teamId && String(tr.team_id) !== String(teamId))) return { error: "notfound" };
  if (tr.cancelled_at) return { error: "cancelled" };
  if (tr.starts_at < new Date()) return { error: "past" };
  const [member] = await sql`
    select 1 as ok from memberships where team_id = ${tr.team_id} and user_id = ${userId}`;
  if (!member) return { error: "notmember" };
  return { tr: tr as unknown as TrainingInfo };
}

function seatName(s: Seat, lang: Lang) {
  return s.guestId ? `${s.name || t(lang, "guest_unnamed")} (${s.hostName})` : s.name;
}

// Тем, кто получил место из-за сдвига очереди (участникам и хозяевам гостей)
async function notifyPromoted(
  api: Api,
  tr: TrainingInfo,
  before: Seat[],
  after: Seat[],
  cap: number,
  actorId: string
): Promise<Seat[]> {
  const bKeys = new Set(splitSeats(before, cap).confirmed.map((s) => s.key));
  const promoted = splitSeats(after, cap).confirmed.filter(
    (s) => !bKeys.has(s.key) && s.hostId !== actorId
  );
  if (promoted.length === 0) return promoted;

  const hostIds = [...new Set(promoted.map((s) => s.hostId))];
  const hosts = await sql`select id, telegram_id, language from users where id in ${sql(hostIds)}`;
  const byId = new Map<string, { telegram_id: string; language: string | null }>();
  for (const h of hosts) byId.set(String(h.id), { telegram_id: h.telegram_id, language: h.language });

  for (const s of promoted) {
    const h = byId.get(s.hostId);
    if (!h) continue;
    const lang: Lang = isLang(h.language) ? h.language : (tr.language as Lang);
    const when = formatWhen(tr.starts_at, tr.timezone, lang);
    const text = s.guestId
      ? t(lang, "promoted_guest_dm", {
          name: s.name || t(lang, "guest_unnamed"),
          when,
          team: tr.team_name,
        })
      : t(lang, "promoted_dm", { when, team: tr.team_name });
    try {
      await api.sendMessage(h.telegram_id, text);
    } catch {
      /* человек не начинал диалог с ботом */
    }
  }
  return promoted;
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
  const chk = await checkTraining(userId, trainingId, teamId);
  if ("error" in chk) return { result: chk.error };
  const tr = chk.tr;

  const [current] = await sql`
    select status from rsvps where training_id = ${trainingId} and user_id = ${userId}`;
  if (current && current.status === status && status !== "later") return { result: "same" };

  const cap = tr.needed_players ? Number(tr.needed_players) : 0; // 0 = мест без ограничения
  const me = String(userId);
  const before = await loadSeats(trainingId);

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
    if (status !== "going") {
      // если человек не идёт, гости уходят вместе с ним
      await tx`delete from rsvp_guests where training_id = ${trainingId} and host_id = ${userId}`;
    }
    await tx`
      insert into rsvp_events (training_id, user_id, status)
      values (${trainingId}, ${userId}, ${status})`;
  });

  const after = await loadSeats(trainingId);
  const { confirmed } = splitSeats(after, cap);
  const idx = after.findIndex((s) => s.key === `h:${me}`);

  const outcome: AnswerOutcome = { result: "ok" };
  if (status === "going") {
    outcome.placement = !cap || idx < cap ? "confirmed" : "waitlist";
    if (outcome.placement === "waitlist") outcome.position = idx - cap + 1;
  }

  const wasGoing = before.some((s) => s.key === `h:${me}`);
  const teamLang = tr.language as Lang;

  try {
    const promoted = await notifyPromoted(api, tr, before, after, cap, me);

    // Организаторам: кто-то перестал идти
    if (wasGoing && status !== "going") {
      const [actor] = await sql`select first_name from users where id = ${userId}`;
      const admins = await sql`
        select u.telegram_id, u.language
        from memberships m join users u on u.id = m.user_id
        where m.team_id = ${tr.team_id} and m.role = 'admin' and m.user_id <> ${userId}`;
      for (const a of admins) {
        const lang: Lang = isLang(a.language) ? a.language : teamLang;
        const count = cap ? `${confirmed.length}/${cap}` : `${confirmed.length}`;
        let text = t(lang, "org_left", {
          name: actor?.first_name ?? "",
          when: formatWhen(tr.starts_at, tr.timezone, lang),
          count,
        });
        if (cap) text += " " + t(lang, "org_free", { free: Math.max(0, cap - confirmed.length) });
        if (promoted.length > 0) {
          text += "\n" + t(lang, "org_promoted", { names: promoted.map((p) => seatName(p, lang)).join(", ") });
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

// «Иду с кем-то»: записывает участника (если ещё не записан) и добавляет гостей отдельными местами.
// Гости встают в конец общей очереди; если мест не хватает, часть гостей остаётся в очереди.
export async function addGuests(
  api: Api,
  userId: string,
  trainingId: string,
  names: (string | null)[],
  teamId?: string
): Promise<GuestsOutcome> {
  const chk = await checkTraining(userId, trainingId, teamId);
  if ("error" in chk) return { result: chk.error };
  const tr = chk.tr;
  const cap = tr.needed_players ? Number(tr.needed_players) : 0;
  const me = String(userId);

  const list = names.slice(0, 5);
  const [{ c }] = await sql`
    select count(*)::int as c from rsvp_guests where training_id = ${trainingId} and host_id = ${userId}`;
  if (list.length === 0 || c + list.length > 10) return { result: "toomany" };

  const [current] = await sql`
    select status from rsvps where training_id = ${trainingId} and user_id = ${userId}`;

  await sql.begin(async (tx) => {
    await tx`
      insert into rsvps (training_id, user_id, status, going_at)
      values (${trainingId}, ${userId}, 'going', now())
      on conflict (training_id, user_id) do update set
        status = 'going',
        going_at = coalesce(case when rsvps.status = 'going' then rsvps.going_at end, now()),
        remind_at = null,
        updated_at = now()`;
    if (!current || current.status !== "going") {
      await tx`
        insert into rsvp_events (training_id, user_id, status)
        values (${trainingId}, ${userId}, 'going')`;
    }
    for (const name of list) {
      await tx`
        insert into rsvp_guests (training_id, host_id, name)
        values (${trainingId}, ${userId}, ${name})`;
    }
  });

  const after = await loadSeats(trainingId);
  const idx = after.findIndex((s) => s.key === `h:${me}`);
  const mine = after.map((s, i) => ({ s, i })).filter((x) => x.s.hostId === me && x.s.guestId);
  const guestsIn = mine.filter((x) => !cap || x.i < cap).length;

  await refreshPoll(api, trainingId);
  return {
    result: "ok",
    hostIn: !cap || idx < cap,
    guestsIn,
    guestsQueued: mine.length - guestsIn,
  };
}

// Убрать одного своего гостя; очередь двигается, освободившееся место получает следующий
export async function removeGuest(
  api: Api,
  userId: string,
  trainingId: string,
  guestId: string,
  teamId?: string
): Promise<AnswerOutcome> {
  const chk = await checkTraining(userId, trainingId, teamId);
  if ("error" in chk) return { result: chk.error };
  const tr = chk.tr;
  const cap = tr.needed_players ? Number(tr.needed_players) : 0;

  const before = await loadSeats(trainingId);
  await sql`
    delete from rsvp_guests
    where id = ${guestId} and training_id = ${trainingId} and host_id = ${userId}`;
  const after = await loadSeats(trainingId);

  try {
    await notifyPromoted(api, tr, before, after, cap, String(userId));
  } catch (e) {
    console.error("removeGuest notify:", e);
  }
  await refreshPoll(api, trainingId);
  return { result: "ok" };
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
