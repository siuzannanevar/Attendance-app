"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

export type MenuItem = { href: string; label: string; active?: boolean };

// Кнопка «три палочки» + выезжающее слева меню.
// Меню рисуем через портал в <body>, иначе размытая шапка обрезает его по своим границам.
export default function NavMenu({
  items,
  title,
  subtitle,
  openLabel,
  closeLabel,
}: {
  items: MenuItem[];
  title: string;
  subtitle?: string;
  openLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="burger"
        aria-label={openLabel}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span />
        <span />
        <span />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="drawer-wrap">
            <div className="drawer-backdrop" onClick={() => setOpen(false)} />
            <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
              <div className="drawer-head">
                <div className="drawer-titles">
                  <div className="drawer-title">{title}</div>
                  {subtitle && <div className="drawer-sub">{subtitle}</div>}
                </div>
                <button type="button" className="drawer-close" aria-label={closeLabel} onClick={() => setOpen(false)}>
                  ✕
                </button>
              </div>
              <nav className="drawer-nav">
                {items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={it.active ? "drawer-item active" : "drawer-item"}
                    onClick={() => setOpen(false)}
                  >
                    {it.label}
                  </Link>
                ))}
              </nav>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
