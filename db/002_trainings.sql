-- Этап 2: тренировки, ответы игроков, история ответов

-- У команды есть часовой пояс и привязанная Telegram-группа
alter table teams add column timezone text not null default 'Europe/Tallinn';
alter table teams add column chat_id bigint;
create unique index teams_chat_id_key on teams(chat_id) where chat_id is not null;

create table trainings (
  id bigserial primary key,
  team_id bigint not null references teams(id) on delete cascade,
  starts_at timestamptz not null,
  place text,
  needed_players int,
  created_by bigint not null references users(id),
  poll_chat_id bigint,
  poll_message_id bigint,
  created_at timestamptz not null default now()
);
create index trainings_team_starts_idx on trainings(team_id, starts_at);

-- Текущий ответ каждого игрока (одна строка на игрока и тренировку)
create table rsvps (
  training_id bigint not null references trainings(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  status text not null check (status in ('going', 'not_going')),
  updated_at timestamptz not null default now(),
  primary key (training_id, user_id)
);

-- История: каждое изменение ответа (кто, что, когда)
create table rsvp_events (
  id bigserial primary key,
  training_id bigint not null references trainings(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  status text not null check (status in ('going', 'not_going')),
  created_at timestamptz not null default now()
);
