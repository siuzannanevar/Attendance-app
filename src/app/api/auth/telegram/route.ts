import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { makeSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const dynamic = "force-dynamic";

// Проверка подписи Telegram Login Widget:
// https://core.telegram.org/widgets/login#checking-authorization
function verify(params: URLSearchParams): boolean {
  const hash = params.get("hash");
  if (!hash) return false;
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  const dataCheckString = pairs.sort().join("\n");
  const secret = createHash("sha256").update(process.env.TELEGRAM_BOT_TOKEN!).digest();
  const calc = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(calc);
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const authDate = Number(p.get("auth_date"));

  // подпись неверна или данные старше суток
  if (!verify(p) || !authDate || Date.now() / 1000 - authDate > 86400) {
    return NextResponse.redirect(new URL("/?error=1", url));
  }

  const [user] = await sql`
    insert into users (telegram_id, first_name, username)
    values (${Number(p.get("id"))}, ${p.get("first_name") ?? ""}, ${p.get("username")})
    on conflict (telegram_id) do update
      set first_name = excluded.first_name, username = excluded.username
    returning id`;

  const res = NextResponse.redirect(new URL("/dashboard", url));
  res.cookies.set(SESSION_COOKIE, makeSessionValue(String(user.id)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
