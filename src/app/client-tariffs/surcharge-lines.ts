import type { TariffSurcharge } from "@/lib/backend/types";
import { formatNumber, formatPrice } from "@/lib/format";

/**
 * Надбавки плана в виде, который читается без знания схемы калькулятора.
 *
 * Калькулятор складывает все подходящие к заказу надбавки, поэтому строки
 * можно объединять, не меняя смысла:
 * - правила с одинаковым условием — в одну строку с суммой всех частей
 *   («+40 000» и «+1 000 за кг» → «+40 000 и +1 000 за каждый кг»);
 * - соседние диапазоны веса с одинаковыми суммами («6–20» и «от 21» → «от 6»).
 *   Границы у калькулятора включительные, вес округляется вверх до целого,
 *   поэтому диапазоны соседние, когда следующий начинается с `до + 1`;
 * - одинаковые строки для разных услуг — в одну со списком услуг;
 * - города с одинаковыми строками — в одну группу со списком городов
 *   (так в калькуляторе заводят исключения: шесть городов, у каждого свои
 *   строки с теми же суммами).
 */

export type Endpoint = "hub" | "district" | "any";

/** Доплата, скидка (все части с минусом) или поправка (есть и плюс, и минус). */
export type SurchargeKind = "surcharge" | "discount" | "adjustment";

export interface SurchargeAmounts {
  /** За заказ. */
  fixed: number;
  /** За каждый килограмм веса (округлённого вверх). */
  perKg: number;
  /** За каждое место. */
  perBox: number;
  /** Процент от цены. */
  percent: number;
  /** За каждый килограмм сверх порога: порог → ставка. */
  perKgOver: Array<{ overKg: number; amount: number }>;
  /** Типы, которых страница не знает, — показываются как есть. */
  other: Array<{ type: string; amount: number }>;
}

export interface SurchargeLine {
  key: string;
  from: Endpoint;
  to: Endpoint;
  /** `null` — куда угодно (с учётом `to`); иначе только в эти города. */
  toCities: string[] | null;
  /** `null` — любая услуга. */
  serviceTypeIds: number[] | null;
  weightFrom: number;
  weightTo: number | null;
  amounts: SurchargeAmounts;
  kind: SurchargeKind;
  /** Человеческие названия из калькулятора, без технических «migrated id=…». */
  names: string[];
  ruleIds: number[];
}

export interface SurchargeGroup {
  key: string;
  /** Маршрут словами: «Из хаба в район», «Доставка в Tashkent». */
  title: string;
  lines: SurchargeLine[];
}

function endpoint(isHub: boolean | null): Endpoint {
  if (isHub === true) return "hub";
  if (isHub === false) return "district";
  return "any";
}

function emptyAmounts(): SurchargeAmounts {
  return { fixed: 0, perKg: 0, perBox: 0, percent: 0, perKgOver: [], other: [] };
}

function addAmount(target: SurchargeAmounts, item: TariffSurcharge): void {
  switch (item.amountType) {
    case "FIXED":
      target.fixed += item.amount;
      return;
    case "PER_KG":
      target.perKg += item.amount;
      return;
    case "PER_BOX":
      target.perBox += item.amount;
      return;
    case "PERCENT":
      target.percent += item.amount;
      return;
    case "PER_KG_OVER": {
      const overKg = item.overKg ?? 0;
      const existing = target.perKgOver.find((part) => part.overKg === overKg);
      if (existing) existing.amount += item.amount;
      else target.perKgOver.push({ overKg, amount: item.amount });
      return;
    }
    default: {
      // Тип, которого страница не знает: складываем по типу, как и остальные части.
      const existing = target.other.find((part) => part.type === item.amountType);
      if (existing) existing.amount += item.amount;
      else target.other.push({ type: item.amountType, amount: item.amount });
    }
  }
}

/** Все ненулевые части суммы — для знака строки и для сравнения строк. */
export function amountParts(amounts: SurchargeAmounts): number[] {
  return [
    amounts.fixed,
    amounts.perKg,
    amounts.perBox,
    amounts.percent,
    ...amounts.perKgOver.map((part) => part.amount),
    ...amounts.other.map((part) => part.amount),
  ].filter((value) => value !== 0);
}

function kindOf(amounts: SurchargeAmounts): SurchargeKind {
  const parts = amountParts(amounts);
  if (parts.length > 0 && parts.every((value) => value < 0)) return "discount";
  if (parts.some((value) => value < 0) && parts.some((value) => value > 0)) return "adjustment";
  return "surcharge";
}

function amountsSignature(amounts: SurchargeAmounts): string {
  const over = [...amounts.perKgOver]
    .sort((a, b) => a.overKg - b.overKg)
    .map((part) => `${part.overKg}:${part.amount}`);
  const other = amounts.other.map((part) => `${part.type}:${part.amount}`).sort();
  return [amounts.fixed, amounts.perKg, amounts.perBox, amounts.percent, over.join(","), other.join(",")].join(
    "|",
  );
}

/**
 * «Доп. город 4+ кг, база» и «Доп. город 4+ кг, за кг» — одна надбавка из двух
 * частей; после склейки достаточно одного названия.
 */
function cleanName(name: string | null): string | null {
  if (!name) return null;
  if (/migrated id=/i.test(name)) return null;
  return name.replace(/[,\s]+(база|за кг|base|per-kg)$/i, "").trim() || null;
}

function routeKey(line: Pick<SurchargeLine, "from" | "to" | "toCities">): string {
  return `${line.from}>${line.to}>${line.toCities?.join("|") ?? ""}`;
}

function serviceKey(ids: number[] | null): string {
  return ids === null ? "*" : ids.join(",");
}

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Шаг 1: правила с одним и тем же условием — в одну строку. */
function sumByCondition(surcharges: TariffSurcharge[]): SurchargeLine[] {
  const lines = new Map<string, SurchargeLine>();
  for (const item of surcharges) {
    const from = endpoint(item.fromIsHub);
    const to = endpoint(item.toIsHub);
    const serviceTypeIds = item.serviceTypeId === null ? null : [item.serviceTypeId];
    const toCities = item.toCity === null ? null : [item.toCity];
    const key = [
      routeKey({ from, to, toCities }),
      serviceKey(serviceTypeIds),
      item.weightFrom,
      item.weightTo ?? "",
    ].join("#");
    let line = lines.get(key);
    if (!line) {
      line = {
        key,
        from,
        to,
        toCities,
        serviceTypeIds,
        weightFrom: item.weightFrom,
        weightTo: item.weightTo,
        amounts: emptyAmounts(),
        kind: "surcharge",
        names: [],
        ruleIds: [],
      };
      lines.set(key, line);
    }
    addAmount(line.amounts, item);
    const name = cleanName(item.name);
    if (name && !line.names.includes(name)) line.names.push(name);
    line.ruleIds.push(item.id);
  }
  return [...lines.values()];
}

function mergeInto(target: SurchargeLine, source: SurchargeLine): void {
  target.names = uniq([...target.names, ...source.names]);
  target.ruleIds = [...target.ruleIds, ...source.ruleIds];
}

/** Шаг 2: соседние диапазоны веса с одинаковой суммой. */
function mergeWeights(lines: SurchargeLine[]): SurchargeLine[] {
  const buckets = new Map<string, SurchargeLine[]>();
  for (const line of lines) {
    const key = [routeKey(line), serviceKey(line.serviceTypeIds), amountsSignature(line.amounts)].join("#");
    buckets.set(key, [...(buckets.get(key) ?? []), line]);
  }
  const result: SurchargeLine[] = [];
  for (const bucket of buckets.values()) {
    const sorted = [...bucket].sort((a, b) => a.weightFrom - b.weightFrom);
    let current = { ...sorted[0] };
    for (const next of sorted.slice(1)) {
      if (current.weightTo !== null && next.weightFrom === current.weightTo + 1) {
        current.weightTo = next.weightTo;
        mergeInto(current, next);
      } else {
        result.push(current);
        current = { ...next };
      }
    }
    result.push(current);
  }
  return result;
}

/** Шаг 3: одна и та же строка для разных услуг. */
function mergeServices(lines: SurchargeLine[]): SurchargeLine[] {
  const result: SurchargeLine[] = [];
  const byKey = new Map<string, SurchargeLine>();
  for (const line of lines) {
    if (line.serviceTypeIds === null) {
      result.push(line);
      continue;
    }
    const key = [routeKey(line), line.weightFrom, line.weightTo ?? "", amountsSignature(line.amounts)].join("#");
    const existing = byKey.get(key);
    if (existing && existing.serviceTypeIds) {
      existing.serviceTypeIds = uniq([...existing.serviceTypeIds, ...line.serviceTypeIds]).sort((a, b) => a - b);
      mergeInto(existing, line);
    } else {
      const copy = { ...line };
      byKey.set(key, copy);
      result.push(copy);
    }
  }
  return result;
}

const ROUTE_ORDER: Record<string, number> = {
  "any>any": 0,
  "hub>district": 1,
  "district>hub": 2,
  "district>district": 3,
  "any>district": 4,
  "hub>hub": 5,
  "hub>any": 6,
  "district>any": 7,
  "any>hub": 8,
};

const ROUTE_TITLE: Record<string, string> = {
  "any>any": "Любой маршрут",
  "hub>district": "Из хаба в район",
  "district>hub": "Из района в хаб",
  "district>district": "Из района в район",
  "any>district": "Доставка в район",
  "hub>hub": "Из хаба в хаб",
  "hub>any": "Отправка из хаба",
  "district>any": "Отправка из района",
  "any>hub": "Доставка в хаб",
};

const FROM_TITLE: Record<Endpoint, string> = {
  hub: "из хаба",
  district: "из района",
  any: "",
};

export function routeTitle(line: Pick<SurchargeLine, "from" | "to" | "toCities">): string {
  if (line.toCities) {
    const from = FROM_TITLE[line.from];
    const cities = line.toCities.join(", ");
    return from ? `Доставка в ${cities} ${from}` : `Доставка в ${cities}`;
  }
  return ROUTE_TITLE[`${line.from}>${line.to}`];
}

const SEPARATORS = "\\s:,;—–-";

/**
 * Город из названия больше не нужен, когда он в заголовке группы:
 * «Исключение доп.город: Kogon» → «Исключение доп.город». Вырезается только
 * отдельное слово: «Kogonsk» при городе «Kogon» остаётся как есть.
 */
export function withoutCity(name: string, city: string): string {
  const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = new RegExp(`(^|[${SEPARATORS}])${escaped}(?=$|[${SEPARATORS}])`, "gu");
  return name
    .replace(word, "$1")
    .replace(new RegExp(`^[${SEPARATORS}]+|[${SEPARATORS}]+$`, "gu"), "")
    .replace(/\s{2,}/g, " ");
}

/** Шаг 4: города с одинаковым набором строк — в одну группу. */
function mergeCityGroups(groups: SurchargeGroup[]): SurchargeGroup[] {
  const lineSignature = (line: SurchargeLine) =>
    [
      line.from,
      line.to,
      serviceKey(line.serviceTypeIds),
      line.weightFrom,
      line.weightTo ?? "",
      amountsSignature(line.amounts),
    ].join("#");
  const signature = (group: SurchargeGroup) => group.lines.map(lineSignature).sort().join("/");

  const result: SurchargeGroup[] = [];
  const bySignature = new Map<string, SurchargeGroup[]>();
  for (const group of groups) {
    const cities = group.lines[0].toCities;
    if (!cities || cities.length !== 1) {
      result.push(group);
      continue;
    }
    const key = signature(group);
    bySignature.set(key, [...(bySignature.get(key) ?? []), group]);
  }

  for (const similar of bySignature.values()) {
    if (similar.length === 1) {
      result.push(similar[0]);
      continue;
    }
    const cities = similar.map((group) => group.lines[0].toCities![0]).sort((a, b) => a.localeCompare(b));
    const [first, ...rest] = similar;
    // Пару строке ищем по полной подписи (включая сумму) и забираем её из
    // списка: у двух строк с одним весом, но разной суммой пары не перепутаются.
    const pools = rest.map((group) => [...group.lines]);
    const lines = first.lines.map((line) => {
      const sig = lineSignature(line);
      const twins = pools.map((pool) => pool.splice(pool.findIndex((other) => lineSignature(other) === sig), 1)[0]);
      const names = uniq(
        [line, ...twins].flatMap((item) => item.names.map((name) => withoutCity(name, item.toCities![0]))),
      ).filter(Boolean);
      return {
        ...line,
        toCities: cities,
        key: `${line.key}+${cities.join("|")}`,
        names,
        ruleIds: [line, ...twins].flatMap((item) => item.ruleIds),
      };
    });
    result.push({ key: routeKey(lines[0]), title: routeTitle(lines[0]), lines });
  }
  return result;
}

/** Надбавки плана, сгруппированные по маршруту: сначала общие, потом по городам. */
export function buildSurchargeGroups(surcharges: TariffSurcharge[]): SurchargeGroup[] {
  const lines = mergeServices(mergeWeights(sumByCondition(surcharges))).map((line) => ({
    ...line,
    kind: kindOf(line.amounts),
  }));

  const groups = new Map<string, SurchargeGroup>();
  for (const line of lines) {
    const key = routeKey(line);
    const group = groups.get(key) ?? { key, title: routeTitle(line), lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }

  const rank = (group: SurchargeGroup) => {
    const line = group.lines[0];
    return line.toCities ? 100 : (ROUTE_ORDER[`${line.from}>${line.to}`] ?? 50);
  };
  const ordered = mergeCityGroups([...groups.values()]).sort(
    (a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, "ru"),
  );
  for (const group of ordered) {
    group.lines.sort(
      (a, b) =>
        serviceKey(a.serviceTypeIds).localeCompare(serviceKey(b.serviceTypeIds)) ||
        a.weightFrom - b.weightFrom,
    );
  }
  return ordered;
}

/** «до 5 кг», «4–5 кг», «от 6 кг», «любой вес». Вес у калькулятора — целые кг, округлённые вверх. */
export function surchargeWeightLabel(from: number, to: number | null): string {
  if (to === null) return from <= 1 ? "любой вес" : `от ${formatNumber(from)} кг`;
  if (from <= 1) return `до ${formatNumber(to)} кг`;
  if (from === to) return `${formatNumber(from)} кг`;
  return `${formatNumber(from)}–${formatNumber(to)} кг`;
}

/** Знак всегда виден: «+40 000», «−40 000» (настоящий минус, не дефис). */
export function signedPrice(value: number): string {
  return `${value < 0 ? "−" : "+"}${formatPrice(Math.abs(value))}`;
}

/** Сумма строки по частям, каждая — отдельной строчкой в ячейке. */
export function amountLabels(amounts: SurchargeAmounts): string[] {
  const labels: string[] = [];
  if (amounts.fixed !== 0) labels.push(signedPrice(amounts.fixed));
  if (amounts.perKg !== 0) labels.push(`${signedPrice(amounts.perKg)} за каждый кг`);
  for (const part of amounts.perKgOver) {
    if (part.amount !== 0) {
      labels.push(`${signedPrice(part.amount)} за каждый кг сверх ${formatNumber(part.overKg)}`);
    }
  }
  if (amounts.perBox !== 0) labels.push(`${signedPrice(amounts.perBox)} за каждое место`);
  if (amounts.percent !== 0) {
    labels.push(`${amounts.percent < 0 ? "−" : "+"}${formatNumber(Math.abs(amounts.percent))}% от цены`);
  }
  for (const part of amounts.other) labels.push(`${signedPrice(part.amount)} (${part.type})`);
  return labels.length > 0 ? labels : ["0"];
}
