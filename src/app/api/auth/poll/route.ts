import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { makeSessionValue, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { WL_COOKIE, isWlSecret, wlCode, wlKey } from "@/lib/weblogin";

export const dynamic = "force-dynamic";

// Браузер спрашивает: подтвердил ли человек вход в боте? Если да, выдаём сессию этому браузеру.
export async function GET(req: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  const secret = req.cookies.get(WL_COOKIE)?.value;
  if (!isWlSecret(secret)) return NextResponse.json({ ok: false }, { headers: noStore });

  // Подтверждение действует 10 минут и забирается один раз
  const [row] = await sql`
    update login_links set used_at = now()
    where secret = ${wlKey(wlCode(secret))} and used_at is null and created_at > now() - interval '10 minutes'
    returning user_id`;
  if (!row) return NextResponse.json({ ok: false }, { headers: noStore });

  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(SESSION_COOKIE, makeSessionValue(String(row.user_id)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  res.cookies.delete(WL_COOKIE);
  return res;
}
