import { redirect } from "next/navigation";
import Header from "@/components/Header";
import TelegramLogin from "@/components/TelegramLogin";
import { getCurrentUser, getLang } from "@/lib/session";
import { wt } from "@/lib/web-i18n";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const lang = await getLang(null);
  const { error } = await searchParams;

  return (
    <>
      <Header lang={lang} next="/" />
      <main className="mx-auto max-w-md space-y-4 p-6 text-center">
        <h1 className="text-2xl font-bold">{wt(lang, "login_title")}</h1>
        <p className="text-gray-500">{wt(lang, "login_hint")}</p>
        {error && <p className="text-red-600">{wt(lang, "login_failed")}</p>}
        <div className="flex justify-center">
          <TelegramLogin botUsername="attendance_team2026_bot" />
        </div>
      </main>
    </>
  );
}
