/** Форматирование денег, дат и чисел. Единый вид во всех таблицах и карточках. */

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 250000 → «250 000 сум». */
export function formatMoney(value: number): string {
  return `${numberFormatter.format(Math.round(value))} сум`;
}

/** То же, но без валюты — для плотных таблиц, где валюта вынесена в заголовок. */
export function formatAmount(value: number): string {
  return numberFormatter.format(Math.round(value));
}

/** Компактный вид для KPI-плиток: 12 400 000 → «12,4 млн сум». */
export function formatMoneyShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${decimalFormatter.format(value / 1_000_000_000)} млрд сум`;
  if (abs >= 1_000_000) return `${decimalFormatter.format(value / 1_000_000)} млн сум`;
  if (abs >= 1_000) return `${numberFormatter.format(Math.round(value / 1_000))} тыс сум`;
  return formatMoney(value);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatWeight(kg: number): string {
  return `${decimalFormatter.format(kg)} кг`;
}

export function formatPercent(value: number): string {
  return `${decimalFormatter.format(value)}%`;
}

/** ISO-строка → «07.09.2026». */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** ISO-строка → «07.09.2026 14:30». */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateRange(from: string, to: string): string {
  return `${formatDate(from)} — ${formatDate(to)}`;
}

/**
 * Для <input type="date"> — дата по местному времени. Срез ISO-строки дал бы
 * дату по UTC: в Ташкенте начало суток 8 сентября — это 7 сентября 19:00 UTC,
 * и поле показывало бы 7-е, хотя заказы за 7-е в период не входят.
 */
export function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Начало дня в ISO — нижняя граница периода. */
export function startOfDayISO(date: Date | string): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Конец дня в ISO — верхняя граница периода (включительно). */
export function endOfDayISO(date: Date | string): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Склонение существительного: plural(5, 'заказ', 'заказа', 'заказов') → «заказов». */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
