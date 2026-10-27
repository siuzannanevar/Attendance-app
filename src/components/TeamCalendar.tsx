"use client";

import { useMemo, useState } from "react";

export type CalKind = "training" | "tournament";

// Одно событие календаря (тренировка или событие, добавленное организатором)
export type CalItem = {
  key: string;
  type: "training" | "event";
  kind: CalKind;
  day: string; // YYYY-MM-DD в часовом поясе команды
  time: string; // HH:MM
  title: string;
  place: string | null;
  description: string | null;
  going?: number;
  cap?: number;
  free?: number;
  queue?: number;
  my?: string;
  planned?: boolean; // тренировка по расписанию, которую бот ещё не создал
  note?: string;
  eventId?: string;
};

export type CalLabels = {
  hint: string;
  empty: string;
  prev: string;
  next: string;
  going: string;
  free: string;
  waitlist: string;
  yourAnswer: string;
  planned: string;
  places: string;
  del: string;
  confirmDel: string;
  kinds: Record<CalKind, string>;
};

type Props = {
  items: CalItem[];
  locale: string;
  todayKey: string;
  teamId: string;
  canEdit: boolean;
  deleteAction: (formData: FormData) => Promise<void>;
  labels: CalLabels;
};

const pad = (n: number) => String(n).padStart(2, "0");
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function TeamCalendar({ items, locale, todayKey, teamId, canEdit, deleteAction, labels }: Props) {
  const [ty, tm] = todayKey.split("-").map(Number);
  const [cursor, setCursor] = useState({ y: ty, m: tm - 1 });
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of items) {
      const list = map.get(it.day) ?? [];
      list.push(it);
      map.set(it.day, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [items]);

  const utc = (o: Intl.DateTimeFormatOptions, d: Date) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: "UTC" }).format(d);

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
  const offset = (first.getUTCDay() + 6) % 7; // неделя начинается с понедельника
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`);

  const weekdays = Array.from({ length: 7 }, (_, i) => utc({ weekday: "short" }, new Date(Date.UTC(2024, 0, 1 + i))));

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(cursor.y, cursor.m + delta, 1));
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };

  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];
  let selectedTitle = "";
  if (selected) {
    const [sy, sm, sd] = selected.split("-").map(Number);
    selectedTitle = cap1(
      utc({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, new Date(Date.UTC(sy, sm - 1, sd))),
    );
  }

  return (
    <div className="cal">
      <div className="cal-nav">
        <button type="button" className="cal-arrow" onClick={() => shift(-1)} aria-label={labels.prev}>
          ‹
        </button>
        <div className="cal-month">{cap1(utc({ month: "long", year: "numeric" }, first))}</div>
        <button type="button" className="cal-arrow" onClick={() => shift(1)} aria-label={labels.next}>
          ›
        </button>
      </div>

      <div className="cal-grid">
        {weekdays.map((w, i) => (
          <div key={i} className="cal-wd">
            {w}
          </div>
        ))}
        {cells.map((key, i) => {
          if (!key) return <div key={`e${i}`} className="cal-day is-out" />;
          const list = byDay.get(key) ?? [];
          const kinds = Array.from(new Set(list.map((x) => x.kind))).slice(0, 4);
          const cls = ["cal-day"];
          if (key === todayKey) cls.push("is-today");
          if (key === selected) cls.push("is-selected");
          if (list.length) cls.push("has-items");
          return (
            <button
              key={key}
              type="button"
              className={cls.join(" ")}
              onClick={() => setSelected(key === selected ? null : key)}
              aria-pressed={key === selected}
            >
              <span className="cal-num">{Number(key.slice(8))}</span>
              {kinds.length > 0 && (
                <span className="cal-dots">
                  {kinds.map((k) => (
                    <span key={k} className={`cal-dot k-${k}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        {(Object.keys(labels.kinds) as CalKind[]).map((k) => (
          <span key={k} className="cal-legend-item">
            <span className={`cal-dot k-${k}`} />
            {labels.kinds[k]}
          </span>
        ))}
      </div>

      <div className="cal-details">
        {!selected ? (
          <p className="cal-hint">{labels.hint}</p>
        ) : (
          <>
            <h3 className="cal-details-title">{selectedTitle}</h3>
            {selectedItems.length === 0 ? (
              <p className="cal-hint">{labels.empty}</p>
            ) : (
              <div className="cal-list">
                {selectedItems.map((it) => (
                  <article key={it.key} className={`cal-item k-${it.kind}`}>
                    <div className="cal-item-top">
                      <span className={`cal-badge k-${it.kind}`}>{labels.kinds[it.kind]}</span>
                      <span className="cal-time">{it.time}</span>
                    </div>
                    {it.title && <div className="cal-item-title">{it.title}</div>}
                    {it.place && <div className="cal-item-place">{it.place}</div>}
                    {it.description && <p className="cal-item-desc">{it.description}</p>}
                    {it.planned && (
                      <>
                        <div className="cal-item-meta">
                          <span>{labels.planned}</span>
                          {it.cap ? (
                            <span>
                              {labels.places}: <b>{it.cap}</b>
                            </span>
                          ) : null}
                        </div>
                        {it.note && <div className="cal-item-place">{it.note}</div>}
                      </>
                    )}
                    {it.type === "training" && !it.planned && (
                      <div className="cal-item-meta">
                        <span>
                          {labels.going}: <b>{it.going ?? 0}</b>
                          {it.cap ? `/${it.cap}` : ""}
                        </span>
                        {it.free !== undefined && (
                          <span>
                            {labels.free}: <b>{it.free}</b>
                          </span>
                        )}
                        {it.queue ? (
                          <span>
                            {labels.waitlist}: <b>{it.queue}</b>
                          </span>
                        ) : null}
                        {it.my && (
                          <span>
                            {labels.yourAnswer}: <b>{it.my}</b>
                          </span>
                        )}
                      </div>
                    )}
                    {it.type === "event" && canEdit && it.eventId && (
                      <form
                        action={deleteAction}
                        className="cal-item-foot"
                        onSubmit={(e) => {
                          if (!window.confirm(labels.confirmDel)) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="team" value={teamId} />
                        <input type="hidden" name="event" value={it.eventId} />
                        <button type="submit" className="btn-text btn-danger-text">
                          {labels.del}
                        </button>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
