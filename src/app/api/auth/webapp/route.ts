import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { makeSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const dynamic = "force-dynamic";

// Проверка подписи данных Telegram Mini App:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function verify(initData: string): URLSearchParams | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  const dataCheckString = pairs.sort().join("\n");

  const secret = createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN!).digest();
  const calc = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(calc);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return params;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const params = body && typeof body.initData === "string" ? verify(body.initData) : null;
  const authDate = Number(params?.get("auth_date"));
  if (!params || !authDate || Date.now() / 1000 - authDate > 86400) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let tg: { id?: number; first_name?: string; username?: string } | null = null;
  try {
    tg = JSON.parse(params.get("user") ?? "");
  } catch {
    tg = null;
  }
  if (!tg || !tg.id) return NextResponse.json({ ok: false }, { status: 401 });

  const [user] = await sql`
    insert into users (telegram_id, first_name, username)
    values (${tg.id}, ${tg.first_name ?? ""}, ${tg.username ?? null})
    on conflict (telegram_id) do update
      set first_name = excluded.first_name, username = excluded.username
    returning id`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, makeSessionValue(String(user.id)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
