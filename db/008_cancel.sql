-- Этап 6: отмена тренировки (запись остаётся, чтобы расписание не создало её заново)
alter table trainings add column cancelled_at timestamptz;
