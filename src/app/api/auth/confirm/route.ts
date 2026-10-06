import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { makeSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const dynamic = "force-dynamic";

// Вход по одноразовой ссылке из бота: /api/auth/confirm?s=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("s") ?? "";

  // Ссылка действует один раз и 10 минут
  const [row] = await sql`
    update login_links set used_at = now()
    where secret = ${secret} and used_at is null and created_at > now() - interval '10 minutes'
    returning user_id`;
  if (!row) return NextResponse.redirect(new URL("/?error=1", url));

  const res = NextResponse.redirect(new URL("/dashboard", url));
  res.cookies.set(SESSION_COOKIE, makeSessionValue(String(row.user_id)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
