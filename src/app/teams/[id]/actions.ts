"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bot } from "@/bot";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { publishTraining } from "@/bot/trainings";
import { runAction } from "@/bot/schedule";
import { isLang, t, type Lang } from "@/bot/i18n";
import { addGuests, applyAnswer, cancelTraining, removeGuest } from "@/lib/rsvp";
import { parseGuestNames } from "@/lib/seats";
import { runTick } from "@/lib/tick";
import { removeMember, setOrganizer, togglePlays } from "@/lib/members";

// Проверяет вход и доступ к команде (admin = true: только организатор)
async function requireMember(teamId: string, admin: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!/^\d+$/.test(teamId)) redirect("/dashboard");
  const [team] = await sql`
    select tm.id, tm.name, tm.timezone, tm.language, tm.chat_id,
           tm.poll_hours_before, tm.remind_hours_before, m.role
    from teams tm join memberships m on m.team_id = tm.id
    where tm.id = ${teamId} and m.user_id = ${user.id}`;
  if (!team || (admin && team.role !== "admin")) redirect("/dashboard");
  return { user, team };
}

// Возврат на страницу команды с кодом сообщения
function done(teamId: string, code: string): never {
  revalidatePath(`/teams/${teamId}`);
  redirect(`/teams/${teamId}?n=${code}`);
}

// ---------- Ответ «Иду / Не иду / Отвечу позже» с сайта
export async function answerAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const trainingId = String(formData.get("training") ?? "");
  const status = String(formData.get("status") ?? "");
  const { user } = await requireMember(teamId, false);

  if (
    !/^\d+$/.test(trainingId) ||
    (status !== "going" && status !== "not_going" && status !== "later")
  ) {
    done(teamId, "err");
  }

  const res = await applyAnswer(bot.api, user.id, trainingId, status, teamId);
  if (res.result === "ok") {
    if (status === "going") done(teamId, res.placement === "waitlist" ? "queue" : "in");
    if (status === "later") done(teamId, "later_saved");
    done(teamId, "out");
  }
  if (res.result === "same") done(teamId, "saved");
  if (res.result === "cancelled") done(teamId, "was_cancelled");
  if (res.result === "past") done(teamId, "past");
  done(teamId, "err");
}

// ---------- Новая разовая тренировка
export async function createTrainingAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const { user, team } = await requireMember(teamId, true);

  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const need = Math.max(0, Math.min(999, Number(formData.get("need") ?? 0) || 0));
  const place = String(formData.get("place") ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !tm) done(teamId, "format");

  // дата не в прошлом и не дальше чем через год
  const today = new Date().toISOString().slice(0, 10);
  const daysAhead = (new Date(date + "T00:00:00Z").getTime() - Date.now()) / 86400000;
  if (date < today || daysAhead > 360) done(teamId, "baddate");

  const argsText = `${Number(d[3])}.${Number(d[2])} ${Number(tm[1])}:${tm[2]} ${need} ${place}`;
  const result = await publishTraining(bot.api, team, user.id, argsText);
  done(teamId, result === "ok" ? "created" : result);
}

// ---------- Добавить дни в расписание
export async function addScheduleAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const { user, team } = await requireMember(teamId, true);

  const days = formData.getAll("day").map(String).filter((x) => /^[1-7]$/.test(x));
  const time = String(formData.get("time") ?? "");
  const need = Math.max(0, Math.min(999, Number(formData.get("need") ?? 0) || 0));
  const place = String(formData.get("place") ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (days.length === 0 || !/^\d{1,2}:\d{2}$/.test(time)) done(teamId, "err");

  const lang: Lang = isLang(user.language) ? user.language : (team.language as Lang);
  const text = await runAction(bot.api, "schedule", team, user.id, lang, `${days.join(",")} ${time} ${need} ${place}`);
  const okPrefix = t(lang, "schedule_added", { slots: "", poll: 0, remind: 0 }).slice(0, 12);
  done(teamId, text.startsWith(okPrefix) ? (team.chat_id ? "sched_ok" : "sched_nogroup") : "err");
}

// ---------- Удалить день расписания
export async function deleteSlotAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const slotId = String(formData.get("slot") ?? "");
  await requireMember(teamId, true);
  if (!/^\d+$/.test(slotId)) done(teamId, "err");

  const [s] = await sql`select id from schedules where id = ${slotId} and team_id = ${teamId}`;
  if (!s) done(teamId, "err");

  await sql.begin(async (tx) => {
    // будущие тренировки без опубликованного опроса удаляем вместе с днём
    await tx`
      delete from trainings
      where schedule_id = ${slotId} and poll_message_id is null and starts_at > now()`;
    await tx`delete from schedules where id = ${slotId}`;
  });
  done(teamId, "slot_deleted");
}

// ---------- Отменить тренировку
export async function cancelTrainingAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const trainingId = String(formData.get("training") ?? "");
  await requireMember(teamId, true);
  if (!/^\d+$/.test(trainingId)) done(teamId, "err");

  const [tr] = await sql`select id from trainings where id = ${trainingId} and team_id = ${teamId}`;
  if (!tr) done(teamId, "err");

  await cancelTraining(bot.api, trainingId);
  done(teamId, "cancelled");
}

// ---------- Время опроса и напоминания
export async function updateTimingAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  await requireMember(teamId, true);

  const poll = Number(formData.get("poll"));
  const remind = Number(formData.get("remind"));
  if (
    !Number.isInteger(poll) || !Number.isInteger(remind) ||
    poll < 1 || poll > 336 || remind < 1 || remind > 336 || poll < remind
  ) {
    done(teamId, "timing_bad");
  }

  await sql`
    update teams set poll_hours_before = ${poll}, remind_hours_before = ${remind}
    where id = ${teamId}`;

  // Сразу применяем новое время: если опрос уже «пора» публиковать, он уйдёт в группу
  try {
    await runTick(bot.api, teamId);
  } catch (e) {
    console.error("runTick after timing:", e);
  }
  done(teamId, "timing_ok");
}

// ---------- Участники: удалить, назначить / снять организатора, «я не играю»
export async function removeMemberAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const targetId = String(formData.get("target") ?? "");
  const { user } = await requireMember(teamId, true);
  if (!/^\d+$/.test(targetId)) done(teamId, "err");

  const res = await removeMember(bot.api, teamId, user.id, targetId);
  done(teamId, res === "ok" ? "member_removed" : res === "owner_only" ? "owner_only" : res === "self" ? "self" : "err");
}

export async function setOrganizerAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const targetId = String(formData.get("target") ?? "");
  const makeAdmin = String(formData.get("mode") ?? "make") !== "remove";
  const { user } = await requireMember(teamId, true);
  if (!/^\d+$/.test(targetId)) done(teamId, "err");

  const res = await setOrganizer(bot.api, teamId, user.id, targetId, makeAdmin);
  if (res === "ok") done(teamId, makeAdmin ? "org_added" : "org_removed");
  done(teamId, res === "owner_only" ? "owner_only" : "err");
}

export async function togglePlaysAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const { user } = await requireMember(teamId, true);
  const plays = await togglePlays(bot.api, teamId, user.id);
  done(teamId, plays === null ? "err" : plays ? "plays_on" : "plays_off");
}

// ---------- «Иду с кем-то»: добавить гостей / убрать гостя
export async function addGuestsAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const trainingId = String(formData.get("training") ?? "");
  const { user } = await requireMember(teamId, false);
  if (!/^\d+$/.test(trainingId)) done(teamId, "err");

  const count = Math.max(1, Math.min(5, Number(formData.get("count") ?? 1) || 1));
  const names = parseGuestNames(String(formData.get("names") ?? ""), count);

  const res = await addGuests(bot.api, user.id, trainingId, names, teamId);
  if (res.result === "ok") done(teamId, res.guestsQueued ? "guests_queue" : "guests_in");
  if (res.result === "toomany") done(teamId, "guests_many");
  done(teamId, res.result === "cancelled" ? "was_cancelled" : res.result === "past" ? "past" : "err");
}

export async function removeGuestAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const trainingId = String(formData.get("training") ?? "");
  const guestId = String(formData.get("guest") ?? "");
  const { user } = await requireMember(teamId, false);
  if (!/^\d+$/.test(trainingId) || !/^\d+$/.test(guestId)) done(teamId, "err");

  const res = await removeGuest(bot.api, user.id, trainingId, guestId, teamId);
  done(teamId, res.result === "ok" ? "guest_removed" : "err");
}
