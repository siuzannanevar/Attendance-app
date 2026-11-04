-- Расписание «раз в N недель» (например, пятница через неделю).
-- week_interval: 1 = каждую неделю, 2 = через неделю, 3 = раз в три недели, 4 = раз в четыре.
-- week_anchor: понедельник «недели с тренировкой»; считаем недели от него.
-- Для уже существующих дней расписания всё остаётся как раньше (каждую неделю).
alter table schedules add column week_interval smallint not null default 1
  check (week_interval between 1 and 4);
alter table schedules add column week_anchor date not null default date '2024-01-01'; -- 2024-01-01 — понедельник
