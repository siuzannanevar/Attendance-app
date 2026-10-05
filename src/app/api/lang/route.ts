import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isLang } from "@/bot/i18n";
import { getCurrentUser, LANG_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

// Переключение языка сайта: /api/lang?l=et&next=/dashboard
export async function GET(req: Request) {
  const url = new URL(req.url);
  const l = url.searchParams.get("l");
  let next = url.searchParams.get("next") ?? "/";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/"; // только внутренние адреса

  const res = NextResponse.redirect(new URL(next, url));
  if (isLang(l)) {
    res.cookies.set(LANG_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    // язык сохраняется и в профиле, поэтому бот тоже заговорит на нём
    const user = await getCurrentUser();
    if (user) await sql`update users set language = ${l} where id = ${user.id}`;
  }
  return res;
}
