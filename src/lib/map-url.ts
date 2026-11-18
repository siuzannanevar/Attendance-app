// Ссылка на карту рядом с местом тренировки или турнира.

const URL_IN_TEXT = /https?:\/\/[^\s<>"]+/i;
const MAX_LEN = 500;

// Проверяет ссылку и возвращает её в нормальном виде, либо null.
// Пускаем только http/https (никаких javascript: и т.п.), с настоящим доменом:
// иначе Telegram отклонит кнопку со ссылкой и сообщение не отправится.
export function normalizeMapUrl(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > MAX_LEN) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Достаёт ссылку из текста места: «Спортзал колледжа https://maps.app.goo.gl/abc»
// → { place: «Спортзал колледжа», mapUrl: «https://maps.app.goo.gl/abc» }.
// Если ссылки нет или она некорректная, текст остаётся как был.
export function splitPlaceAndMap(text: string): { place: string; mapUrl: string | null } {
  const m = text.match(URL_IN_TEXT);
  if (!m) return { place: text.trim(), mapUrl: null };
  // в конце ссылки часто стоит знак препинания из предложения
  const candidate = m[0].replace(/[.,;:!?)\]»”]+$/, "");
  const mapUrl = normalizeMapUrl(candidate);
  if (!mapUrl) return { place: text.trim(), mapUrl: null };
  const place = (text.slice(0, m.index) + " " + text.slice((m.index ?? 0) + candidate.length))
    .replace(/\(\s*\)|\[\s*\]/g, "") // остались пустые скобки вокруг ссылки
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:\s]+/, "")
    .trim();
  return { place, mapUrl };
}
