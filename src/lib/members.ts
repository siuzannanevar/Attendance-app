import type { Api } from "grammy";
import { sql } from "@/lib/db";
import { applyAnswer, refreshPoll } from "@/lib/rsvp";
import { t, isLang, type Lang } from "@/bot/i18n";

export type MemberResult = "ok" | "notfound" | "self" | "owner_only";

async function loadTarget(teamId: string, targetId: string) {
  const [team] = await sql`select created_by, name, language from teams where id = ${teamId}`;
  const [target] = await sql`
    select m.role, u.first_name, u.telegram_id, u.language
    from memberships m join users u on u.id = m.user_id
    where m.team_id = ${teamId} and m.user_id = ${targetId}`;
  return { team, target };
}

function langOf(u: { language?: unknown }, team: { language?: unknown }): Lang {
  return isLang(u.language) ? u.language : (team.language as Lang);
}

// Удалить участника. Только организатор; организаторов удаляет только создатель команды.
// Если человек шёл на тренировки, место освобождается: очередь двигается, все получают уведомления.
export async function removeMember(
  api: Api,
  teamId: string,
  actorId: string,
  targetId: string
): Promise<MemberResult> {
  const { team, target } = await loadTarget(teamId, targetId);
  if (!team || !target) return "notfound";
  if (String(targetId) === String(actorId)) return "self";
  if (target.role === "admin" && String(team.created_by) !== String(actorId)) return "owner_only";

  // 1) как будто человек отказался от всех будущих тренировок (двигаем очередь, уведомляем)
  const going = await sql`
    select tr.id from trainings tr join rsvps r on r.training_id = tr.id
    where tr.team_id = ${teamId} and r.user_id = ${targetId} and r.status = 'going'
      and tr.starts_at > now() and tr.cancelled_at is null`;
  for (const g of going) {
    try {
      await applyAnswer(api, String(targetId), String(g.id), "not_going", teamId);
    } catch (e) {
      console.error("removeMember applyAnswer:", e);
    }
  }

  // 2) удаляем его ответы на будущие тренировки команды и сам состав
  await sql.begin(async (tx) => {
    await tx`
      delete from rsvps r using trainings tr
      where r.training_id = tr.id and tr.team_id = ${teamId}
        and r.user_id = ${targetId} and tr.starts_at > now()`;
    await tx`delete from memberships where team_id = ${teamId} and user_id = ${targetId}`;
  });

  // 3) обновляем опросы в группе (счётчики)
  const polls = await sql`
    select id from trainings
    where team_id = ${teamId} and starts_at > now() and cancelled_at is null and poll_message_id > 0`;
  for (const p of polls) await refreshPoll(api, p.id);

  // 4) сообщаем человеку (если он начинал диалог с ботом)
  try {
    const lang = langOf(target, team);
    await api.sendMessage(target.telegram_id, t(lang, "you_were_removed", { team: team.name }));
  } catch {
    /* не начинал диалог с ботом */
  }
  return "ok";
}

// Назначить организатором (makeAdmin = true) или снять роль (false; только создатель команды)
export async function setOrganizer(
  api: Api,
  teamId: string,
  actorId: string,
  targetId: string,
  makeAdmin: boolean
): Promise<MemberResult> {
  const { team, target } = await loadTarget(teamId, targetId);
  if (!team || !target) return "notfound";
  if (String(targetId) === String(actorId)) return "self";
  if (!makeAdmin && String(team.created_by) !== String(actorId)) return "owner_only";

  const role = makeAdmin ? "admin" : "player";
  if (target.role === role) return "ok";
  await sql`update memberships set role = ${role} where team_id = ${teamId} and user_id = ${targetId}`;

  try {
    const lang = langOf(target, team);
    await api.sendMessage(
      target.telegram_id,
      t(lang, makeAdmin ? "you_are_organizer" : "you_not_organizer", { team: team.name })
    );
  } catch {
    /* не начинал диалог с ботом */
  }
  return "ok";
}

// «Я играю / не играю»: переключает, считать ли человека в «не ответили» и напоминаниях
export async function togglePlays(api: Api, teamId: string, userId: string): Promise<boolean | null> {
  const [m] = await sql`
    update memberships set plays = not plays
    where team_id = ${teamId} and user_id = ${userId}
    returning plays`;
  if (!m) return null;

  const polls = await sql`
    select id from trainings
    where team_id = ${teamId} and starts_at > now() and cancelled_at is null and poll_message_id > 0`;
  for (const p of polls) await refreshPoll(api, p.id);
  return m.plays as boolean;
}
