-- Этап 10: «Иду с кем-то» — гости занимают отдельные места и стоят в общей очереди
create table rsvp_guests (
  id bigserial primary key,
  training_id bigint not null references trainings(id) on delete cascade,
  host_id bigint not null references users(id) on delete cascade, -- кто привёл гостя
  name text,
  created_at timestamptz not null default now()
);
create index rsvp_guests_training_idx on rsvp_guests(training_id, host_id);
