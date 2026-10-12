-- Этап 8: очередь на места, «отвечу позже», порядок ответов

-- новый статус ответа: later («отвечу позже»)
alter table rsvps drop constraint if exists rsvps_status_check;
alter table rsvps add constraint rsvps_status_check check (status in ('going', 'not_going', 'later'));
alter table rsvp_events drop constraint if exists rsvp_events_status_check;
alter table rsvp_events add constraint rsvp_events_status_check check (status in ('going', 'not_going', 'later'));

-- going_at: когда человек нажал «Иду» (определяет порядок: первые N получают места, остальные в очереди)
-- remind_at: когда повторно прислать опрос тому, кто выбрал «отвечу позже»
alter table rsvps add column going_at timestamptz;
alter table rsvps add column remind_at timestamptz;
update rsvps set going_at = updated_at where status = 'going' and going_at is null;
