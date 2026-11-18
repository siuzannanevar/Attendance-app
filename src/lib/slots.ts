import type { Api } from "grammy";
import { sql } from "@/lib/db";
import { normalizeMapUrl } from "@/lib/map-url";
import { refreshPoll } from "@/lib/rsvp";
import { runTick } from "@/lib/tick";

export type SlotFields = {
  weekday: number; // 1 = понедельник ... 7 = воскресенье
  time: string; // «19:00»
  need: number;
  place: string;
  mapUrl: string; // как ввёл человек; пусто = без ссылки
};

// Изменяет день расписания и все его будущие тренировки.
// Возвращает код для сообщения на сайте: slot_saved, slot_exists, slot_badmap или err.
export async function updateSlot(
  api: Api,
  team: { id: string | number; timezone: string },
  slotId: string,
  f: SlotFields
): Promise<string> {
  const need = Math.max(0, Math.min(999, Math.trunc(f.need) || 0));
  const place = f.place.replace(/\s+/g, " ").trim().slice(0, 100);
  const mapRaw = f.mapUrl.trim();
  const mapUrl = mapRaw ? normalizeMapUrl(mapRaw) : null;
  if (mapRaw && !mapUrl) return "slot_badmap";

  const tm = f.time.match(/^(\d{1,2}):(\d{2})/);
  if (!Number.isInteger(f.weekday) || f.weekday < 1 || f.weekday > 7 || !tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) {
    return "err";
  }
  const newTime = `${tm[1].padStart(2, "0")}:${tm[2]}`;

  const [old] = await sql`select weekday, start_time from schedules where id = ${slotId} and team_id = ${team.id}`;
  if (!old) return "err";
  const dayChanged = Number(old.weekday) !== f.weekday;
  const timeChanged = String(old.start_time).slice(0, 5) !== newTime;

  try {
    await sql.begin(async (tx) => {
      await tx`
        update schedules
        set weekday = ${f.weekday}, start_time = ${newTime}::time, place = ${place || null},
            map_url = ${mapUrl}, needed_players = ${need || null}
        where id = ${slotId}`;
      if (dayChanged) {
        // другой день недели: будущие тренировки без опубликованного опроса пересоздаст планировщик,
        // а уже опубликованные остаются на своей дате (меняем только место, ссылку и число мест)
        await tx`
          delete from trainings
          where schedule_id = ${slotId} and poll_message_id is null and starts_at > now()`;
        await tx`
          update trainings
          set place = ${place || null}, map_url = ${mapUrl}, needed_players = ${need || null}
          where schedule_id = ${slotId} and starts_at > now()`;
      } else {
        // тот же день: правим будущие тренировки на месте (ответы игроков сохраняются).
        // Отменённые тоже сдвигаем, чтобы планировщик не «воскресил» их в новое время.
        await tx`
          update trainings
          set place = ${place || null}, map_url = ${mapUrl}, needed_players = ${need || null},
              starts_at = case when ${timeChanged}::boolean
                then ((starts_at at time zone ${team.timezone})::date + ${newTime}::time) at time zone ${team.timezone}
                else starts_at end
          where schedule_id = ${slotId} and starts_at > now()`;
      }
    });
  } catch (e) {
    // 23505: такой день и время в расписании уже есть
    return (e as { code?: string }).code === "23505" ? "slot_exists" : "err";
  }

  // Создаём недостающие тренировки и публикуем опросы, если уже пора
  try {
    await runTick(api, team.id);
  } catch (e) {
    console.error("runTick after slot edit:", e);
  }
  // Перерисовываем уже опубликованные опросы: новое время, место, кнопка карты
  const published = await sql`
    select id from trainings
    where schedule_id = ${slotId} and starts_at > now() and cancelled_at is null and poll_message_id > 0`;
  for (const r of published) await refreshPoll(api, r.id);

  return "slot_saved";
}
