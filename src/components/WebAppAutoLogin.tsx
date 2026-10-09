"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData: string; ready: () => void } };
  }
}

// Если сайт открыт внутри Telegram (кнопка меню бота), входит автоматически, без ссылок и паролей.
// В обычном браузере ничего не делает.
export default function WebAppAutoLogin() {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.onload = async () => {
      const app = window.Telegram?.WebApp;
      if (!app || !app.initData) return; // обычный браузер
      app.ready();
      try {
        const res = await fetch("/api/auth/webapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: app.initData }),
        });
        if (res.ok) window.location.replace("/dashboard");
      } catch {
        /* остаётся обычная страница входа */
      }
    };
    document.head.appendChild(s);
    return () => {
      s.remove();
    };
  }, []);

  return null;
}
