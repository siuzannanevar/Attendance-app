import { sql } from "@/lib/db";

// «Место» — один человек: участник команды или его гость.
// Места выстраиваются по времени нажатия: первые N (число мест) идут, остальные в очереди.
export type Seat = {
  key: string; // "h:12" — участник, "g:7" — гость
  hostId: string; // участник, которому принадлежит место (для гостя — кто привёл)
  guestId: string | null;
  name: string; // имя участника или гостя ("" — у гостя имя не указано)
  hostName: string;
};

export async function loadSeatsMany(ids: (string | number)[]): Promise<Record<string, Seat[]>> {
  const out: Record<string, Seat[]> = {};
  if (ids.length === 0) return out;

  const rows = await sql`
    select training_id, kind, host_id, guest_id, name, host_name from (
      select r.training_id, 'h'::text as kind, r.user_id as host_id, null::bigint as guest_id,
             u.first_name as name, u.first_name as host_name, r.going_at as seat_time, 0 as ord
      from rsvps r join users u on u.id = r.user_id
      where r.training_id in ${sql(ids)} and r.status = 'going'
      union all
      select g.training_id, 'g'::text, g.host_id, g.id,
             coalesce(g.name, ''), u.first_name, g.created_at, 1
      from rsvp_guests g
      join rsvps r on r.training_id = g.training_id and r.user_id = g.host_id and r.status = 'going'
      join users u on u.id = g.host_id
      where g.training_id in ${sql(ids)}
    ) s
    order by training_id, seat_time nulls last, ord, guest_id`;

  for (const r of rows) {
    const tid = String(r.training_id);
    (out[tid] ||= []).push({
      key: r.kind === "h" ? `h:${r.host_id}` : `g:${r.guest_id}`,
      hostId: String(r.host_id),
      guestId: r.guest_id == null ? null : String(r.guest_id),
      name: r.name ?? "",
      hostName: r.host_name,
    });
  }
  return out;
}

export async function loadSeats(trainingId: string | number): Promise<Seat[]> {
  const all = await loadSeatsMany([trainingId]);
  return all[String(trainingId)] ?? [];
}

// cap = 0 — мест без ограничения
export function splitSeats(seats: Seat[], cap: number) {
  return cap
    ? { confirmed: seats.slice(0, cap), queue: seats.slice(cap) }
    : { confirmed: seats, queue: [] as Seat[] };
}

// «Аня, Борис» → ["Аня", "Борис"]; если имён меньше, чем гостей, остальные без имени (null)
export function parseGuestNames(text: string, count: number): (string | null)[] {
  const names = text
    .split(/[,;\n]/)
    .map((s) => s.replace(/\s+/g, " ").trim().slice(0, 40))
    .filter(Boolean);
  const n = Math.min(5, Math.max(count, names.length));
  return Array.from({ length: n }, (_, i) => names[i] ?? null);
}
