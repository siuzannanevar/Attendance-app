-- Языки: личный язык пользователя и язык сообщений группы команды
alter table users add column language text check (language in ('et', 'ru', 'en'));
alter table teams add column language text not null default 'ru' check (language in ('et', 'ru', 'en'));
