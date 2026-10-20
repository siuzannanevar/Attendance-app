import { createHash } from "crypto";

// Вход в обычном браузере (в том числе на телефоне) через бота.
// Браузер получает секрет в cookie, а в ссылку на бота кладётся только «код» = хэш этого секрета.
// Когда человек подтверждает вход в боте, бот записывает код в login_links, а браузер
// (единственный, у кого есть секрет) забирает вход и получает сессию уже у себя.
export const WL_COOKIE = "wl_s";
export const WL_MAX_AGE = 60 * 10; // 10 минут

export const isWlSecret = (s?: string): s is string => !!s && /^[0-9a-f]{64}$/.test(s);
export const isWlCode = (c: string) => /^[0-9a-f]{32}$/.test(c);
export const wlCode = (secret: string) => createHash("sha256").update(secret).digest("hex").slice(0, 32);
export const wlKey = (code: string) => `wl:${code}`;
