import { LOCALES, type Lang } from "./i18n";

// «чт, 15.10, 19:00» — в часовом поясе команды и на языке команды
export function formatWhen(date: Date, tz: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(date);
}

// Короткое название дня недели по номеру (1 = понедельник ... 7 = воскресенье)
export function weekdayShort(lang: Lang, isoDay: number): string {
  // 1 января 2024 — понедельник
  return new Intl.DateTimeFormat(LOCALES[lang], { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, isoDay))
  );
}

const ALIASES: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  // русский
  "пн": 1, "вт": 2, "ср": 3, "чт": 4, "пт": 5, "сб": 6, "вс": 7,
  "понедельник": 1, "вторник": 2, "среда": 3, "четверг": 4, "пятница": 5, "суббота": 6, "воскресенье": 7,
  // английский
  "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6, "sun": 7,
  "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6, "sunday": 7,
  // эстонский
  "e": 1, "t": 2, "k": 3, "n": 4, "r": 5, "l": 6, "p": 7,
  "esmaspäev": 1, "teisipäev": 2, "kolmapäev": 3, "neljapäev": 4, "reede": 5, "laupäev": 6, "pühapäev": 7,
};

// «ср, пт» → { days: [3, 5] } или { bad: "непонятное слово" }
export function parseWeekdays(text: string): { days: number[] } | { bad: string } {
  const days = new Set<number>();
  for (const raw of text.split(",")) {
    const word = raw.trim().toLowerCase();
    const n = ALIASES[word];
    if (!n) return { bad: raw.trim() };
    days.add(n);
  }
  return { days: [...days].sort((a, b) => a - b) };
}
