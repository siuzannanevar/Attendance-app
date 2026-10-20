import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { WL_COOKIE, WL_MAX_AGE, isWlSecret, wlCode } from "@/lib/weblogin";

export const dynamic = "force-dynamic";

// Начало входа из браузера: выдаёт код для ссылки на бота, а секрет кладёт в cookie этого браузера.
// Если секрет уже есть (страницу перезагрузили, пока человек подтверждал в Telegram), он сохраняется.
export async function POST(req: NextRequest) {
  const existing = req.cookies.get(WL_COOKIE)?.value;
  const secret = isWlSecret(existing) ? existing : randomBytes(32).toString("hex");

  const res = NextResponse.json({ code: wlCode(secret) }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(WL_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: WL_MAX_AGE,
  });
  return res;
}
