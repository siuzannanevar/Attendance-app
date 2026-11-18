-- Ссылка на карту (Google Maps, OpenStreetMap и т.п.) рядом с местом тренировки или турнира.
-- Хранится отдельно от текста места; пусто = ссылки нет.
alter table trainings add column map_url text;
alter table schedules add column map_url text;
alter table events add column map_url text;
