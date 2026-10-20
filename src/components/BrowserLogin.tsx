"use client";

import { useEffect, useState } from "react";

// Кнопка входа для обычного браузера (в том числе на телефоне).
// Открывает бота, где нужно подтвердить вход; после подтверждения эта страница сама входит.
export default function BrowserLogin({
  botUsername,
  labels,
}: {
  botUsername: string;
  labels: { button: string; preparing: string; waiting: string };
}) {
  const [code, setCode] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  // Получаем код для ссылки (секрет остаётся в cookie этого браузера)
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/start", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.code) setCode(d.code);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Проверяем, не подтвердил ли человек вход в боте (и сразу, когда он вернулся на вкладку)
  useEffect(() => {
    if (!code) return;
    let stop = false;
    const started = Date.now();

    async function check() {
      if (stop || document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/auth/poll", { cache: "no-store" });
        const data = await res.json();
        if (data.ok) {
          stop = true;
          window.location.replace("/dashboard");
        }
      } catch {
        /* попробуем при следующей проверке */
      }
    }

    const timer = setInterval(() => {
      if (Date.now() - started > 15 * 60 * 1000) {
        clearInterval(timer);
        return;
      }
      void check();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [code]);

  return (
    <>
      {code ? (
        <a
          href={`https://t.me/${botUsername}?start=lg_${code}`}
          className="btn btn-primary btn-lg"
          onClick={() => setWaiting(true)}
        >
          {labels.button}
        </a>
      ) : (
        <span className="btn btn-primary btn-lg" aria-disabled="true">
          {labels.preparing}
        </span>
      )}
      {waiting && <p className="faint small">{labels.waiting}</p>}
    </>
  );
}
