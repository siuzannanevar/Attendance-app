-- Этап 3: расписание тренировок, автоматические опросы и напоминания

-- Когда публиковать опрос и когда напоминать (в часах до начала тренировки)
alter table teams add column poll_hours_before int not null default 48
  check (poll_hours_before between 1 and 336);
alter table teams add column remind_hours_before int not null default 24
  check (remind_hours_before between 1 and 336);

-- Регулярные тренировки: день недели (1 = понедельник ... 7 = воскресенье) и время
create table schedules (
  id bigserial primary key,
  team_id bigint not null references teams(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  place text,
  needed_players int,
  active boolean not null default true,
  created_by bigint not null references users(id),
  created_at timestamptz not null default now(),
  unique (team_id, weekday, start_time)
);

-- Конкретные тренировки, созданные по расписанию
alter table trainings add column schedule_id bigint references schedules(id) on delete set null;
alter table trainings add column poll_posted_at timestamptz;
alter table trainings add column reminded_at timestamptz;
create unique index trainings_schedule_slot_key on trainings(schedule_id, starts_at);

-- Выбранное действие, если организатор состоит в нескольких командах
alter table users add column pending_action text;
