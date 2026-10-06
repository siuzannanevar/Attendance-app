-- Вход на сайт через бота: одноразовые ссылки
create table login_links (
  secret text primary key,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
