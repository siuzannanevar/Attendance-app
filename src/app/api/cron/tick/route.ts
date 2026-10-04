import { bot } from "@/bot";
import { runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";

// Vercel Cron (и любой внешний планировщик) вызывает этот адрес.
// Доступ только с заголовком Authorization: Bearer <CRON_SECRET>.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const stats = await runTick(bot.api);
  return Response.json({ ok: true, ...stats });
}
