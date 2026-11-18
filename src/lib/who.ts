import { sql } from "@/lib/db";

// Кто и как ответил на тренировку. Показывается только организаторам.
export type Who = {
  not_going: string[]; // нажали «Не иду»
  later: string[]; // «Отвечу позже»
  no_answer: string[]; // игроки команды, которые ещё ничего не ответили
};

export async function loadWho(ids: (string | number)[]): Promise<Record<string, Who>> {
  const out: Record<string, Who> = {};
  if (ids.length === 0) return out;
  for (const id of ids) out[String(id)] = { not_going: [], later: [], no_answer: [] };

  const answered = await sql`
    select r.training_id, r.status, u.first_name
    from rsvps r join users u on u.id = r.user_id
    where r.training_id in ${sql(ids)} and r.status in ('not_going', 'later')
    order by u.first_name`;
  for (const r of answered) {
    out[String(r.training_id)][r.status as "not_going" | "later"].push(r.first_name);
  }

  // «Не ответили» считаем так же, как счётчик на карточке: игроки (не запасные) без ответа
  const silent = await sql`
    select tr.id as training_id, u.first_name
    from trainings tr
    join memberships m on m.team_id = tr.team_id and m.plays
    join users u on u.id = m.user_id
    where tr.id in ${sql(ids)}
      and not exists (select 1 from rsvps r where r.training_id = tr.id and r.user_id = m.user_id)
    order by u.first_name`;
  for (const r of silent) out[String(r.training_id)].no_answer.push(r.first_name);

  return out;
}
