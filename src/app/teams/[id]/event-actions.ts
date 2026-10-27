"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// Только организатор команды
async function requireAdmin(teamId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!/^\d+$/.test(teamId)) redirect("/dashboard");
  const [team] = await sql`
    select tm.id, tm.timezone, m.role
    from teams tm join memberships m on m.team_id = tm.id
    where tm.id = ${teamId} and m.user_id = ${user.id}`;
  if (!team || team.role !== "admin") redirect("/dashboard");
  return { user, team };
}

function done(teamId: string, code: string): never {
  revalidatePath(`/teams/${teamId}`);
  redirect(`/teams/${teamId}?n=${code}`);
}

// ---------- Добавить турнир в календарь
export async function createEventAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const { user, team } = await requireAdmin(teamId);

  const title = String(formData.get("title") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const place = String(formData.get("place") ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const description = String(formData.get("description") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 1000);
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");

  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) {
    done(teamId, "format");
  }

  try {
    // дата и время задаются в часовом поясе команды
    await sql`
      insert into events (team_id, kind, title, starts_at, place, description, created_by)
      values (${team.id}, 'tournament', ${title},
              ((${date}::date + ${time}::time) at time zone ${team.timezone}),
              ${place || null}, ${description || null}, ${user.id})`;
  } catch {
    done(teamId, "err");
  }
  done(teamId, "event_created");
}

// ---------- Удалить событие
export async function deleteEventAction(formData: FormData): Promise<void> {
  const teamId = String(formData.get("team") ?? "");
  const eventId = String(formData.get("event") ?? "");
  const { team } = await requireAdmin(teamId);
  if (!/^\d+$/.test(eventId)) done(teamId, "err");
  await sql`delete from events where id = ${eventId} and team_id = ${team.id}`;
  done(teamId, "event_deleted");
}
