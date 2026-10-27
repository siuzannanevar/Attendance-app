-- Календарь: события команды (турниры, матчи, встречи и др.). Тренировки в календарь берутся из таблицы trainings.
create table events (
  id bigserial primary key,
  team_id bigint not null references teams(id) on delete cascade,
  kind text not null default 'other' check (kind in ('tournament', 'match', 'meeting', 'other')),
  title text not null,
  starts_at timestamptz not null,
  place text,
  description text,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index events_team_time on events (team_id, starts_at);
