-- Этап 4: участники команды (удаление, выход, «организатор не играет»)
-- plays = false: человек состоит в команде, но не играет (не попадает в «не ответили» и напоминания)
alter table memberships add column plays boolean not null default true;
