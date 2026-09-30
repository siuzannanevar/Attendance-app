-- Этап 1: пользователи, команды, участники, коды приглашения

create table users (
  id bigserial primary key,
  telegram_id bigint unique not null,
  first_name text not null,
  username text,
  created_at timestamptz not null default now()
);

create table teams (
  id bigserial primary key,
  name text not null,
  created_by bigint not null references users(id),
  created_at timestamptz not null default now()
);

create table memberships (
  team_id bigint not null references teams(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  role text not null check (role in ('admin', 'player')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table invite_codes (
  id bigserial primary key,
  team_id bigint not null references teams(id) on delete cascade,
  code text unique not null,
  role text not null default 'player' check (role in ('admin', 'player')),
  created_by bigint not null references users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
