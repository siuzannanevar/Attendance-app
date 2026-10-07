"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bot } from "@/bot";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { publishTraining } from "@/bot/trainings";
import { runAction } from "@/bot/schedule";
import { isLang, type Lang } from "@/bot/i18n";
import { saveAnswer, cancelTraining } from "@/lib/rsvp";

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

// ---------- Ответ «Иду / Не иду» с сайта
export async function answerAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const trainingId = String(formData.get("training") ?? "");
  const status = String(formData.get("status") ?? "");
  const { user } = await requireMember(teamId, false);

  if (!/^\d+$/.test(trainingId) || (status !== "going" && status !== "not_going")) {
    done(teamId, "err");
  }
  const res = await saveAnswer(bot.api, user.id, trainingId, teamId, status);
  done(teamId, res === "ok" || res === "same" ? "saved" : res === "cancelled" ? "was_cancelled" : res);
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
  done(teamId, text.startsWith("✅") ? (text.includes("⚠️") ? "sched_nogroup" : "sched_ok") : "err");
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
