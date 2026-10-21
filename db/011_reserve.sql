-- Запасные игроки: люди вне группы, которым бот пишет лично, если не хватает игроков.
-- reserve_order: null = не запасной; 1, 2, 3... = очередь (бот спрашивает по порядку).
alter table memberships add column reserve_order int;

-- Отдельный код приглашения для запасных
alter table invite_codes add column reserve boolean not null default false;

-- Кому из запасных уже написали по конкретной тренировке (чтобы не спрашивать дважды)
create table reserve_asks (
  training_id bigint not null references trainings(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  asked_at timestamptz not null default now(),
  primary key (training_id, user_id)
);
