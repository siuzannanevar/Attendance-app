import { createHmac, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { sql } from "@/lib/db";
import { isLang, pickLang, type Lang } from "@/bot/i18n";

export const SESSION_COOKIE = "session";
export const LANG_COOKIE = "lang";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180 дней
function sign(payload: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("base64url");
}

// Значение cookie: «данные.подпись». Подделать без SESSION_SECRET нельзя.
export function makeSessionValue(uid: string) {
  const payload = Buffer.from(
    JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readSessionValue(value?: string): string | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now() / 1000) return null;
    return String(data.uid);
  } catch {
    return null;
  }
}

// Текущий пользователь сайта (или null, если не вошёл)
export async function getCurrentUser() {
  const store = await cookies();
  const uid = readSessionValue(store.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const [user] = await sql`select id, first_name, username, language from users where id = ${uid}`;
  return user ?? null;
}

// Язык сайта: выбранный на сайте → сохранённый в профиле (общий с ботом) → язык браузера
export async function getLang(user?: { language?: string | null } | null): Promise<Lang> {
  const store = await cookies();
  const c = store.get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  if (user && isLang(user.language)) return user.language;
  const h = await headers();
  return pickLang(h.get("accept-language"));
}
