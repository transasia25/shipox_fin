import type { TariffPriceStep, TariffVersionDetail } from "@/lib/backend/types";
import { formatNumber, formatPrice } from "@/lib/format";
import { parseMoney } from "./price-editing";

/**
 * Цены одной услуги заново — шаги веса по зонам и отдельные цены по
 * маршрутам «город → город». Чистая логика окна, без React.
 *
 * Калькулятор считает так: берёт шаг с наибольшим «с N кг», не тяжелее заказа
 * (вес округляется вверх), и прибавляет доплату за каждый кг сверх N. Цена пары
 * городов перекрывает цену зоны.
 */

/** Шаг веса, как его вводят: тексты полей. */
export interface StepRow {
  key: string;
  weightText: string;
  priceText: string;
  extraText: string;
}

export interface ZoneRow {
  zone: number;
  /** Есть ли у услуги цена в этой зоне. */
  enabled: boolean;
  steps: StepRow[];
}

export interface RouteRow {
  key: string;
  fromCityId: number | null;
  toCityId: number | null;
  steps: StepRow[];
}

export interface ServicePricesDraft {
  serviceTypeId: number;
  /** Во всех зонах одни и те же шаги — правятся один раз. */
  sameForAllZones: boolean;
  common: StepRow[];
  zones: ZoneRow[];
  routes: RouteRow[];
}

let counter = 0;
/** Ключ строки для React: строки добавляются и удаляются. */
export function rowKey(): string {
  counter += 1;
  return `r${counter}`;
}

/** Сумма для поля: с тийинами, если они есть («133 928,57»). */
function money(value: number): string {
  return formatPrice(value);
}

export function stepRow(weight: number | null, price?: number | null, extra?: number | null): StepRow {
  return {
    key: rowKey(),
    weightText: weight === null ? "" : String(weight),
    priceText: price === null || price === undefined ? "" : money(price),
    extraText: extra === null || extra === undefined ? "" : money(extra),
  };
}

function sameSteps(a: StepRow[], b: StepRow[]): boolean {
  const view = (rows: StepRow[]) =>
    rows.map((row) => [Number(row.weightText), parseMoney(row.priceText), parseMoney(row.extraText) ?? 0].join("|")).join(";");
  return view(a) === view(b);
}

/**
 * Что у услуги сейчас: шаги по зонам из сетки и маршруты «город → город».
 * Шаг начинается там, где в столбце зоны начинается новое правило; цена шага —
 * цена на его первом весе, так что считается всё так же, как сейчас.
 */
export function draftFromDetail(
  detail: TariffVersionDetail,
  serviceTypeId: number,
  allZones: number[],
): ServicePricesDraft {
  const grid =
    detail.zoneGrids.find((item) => item.serviceTypeId === serviceTypeId) ??
    detail.zoneGrids.find((item) => item.serviceTypeId === null);
  const zoneList = [...new Set([...allZones, ...(grid?.zones ?? [])])].sort((a, b) => a - b);

  const zones: ZoneRow[] = zoneList.map((zone) => {
    const column = grid ? grid.zones.indexOf(zone) : -1;
    const steps: StepRow[] = [];
    if (grid && column >= 0) {
      let previousRule: number | null = null;
      for (const row of grid.rows) {
        const cell = row.cells[column];
        if (!cell || cell.perUnit || cell.price === null) {
          previousRule = null;
          continue;
        }
        if (cell.ruleId !== previousRule) steps.push(stepRow(row.weightFrom, cell.price, cell.extraPerKg));
        previousRule = cell.ruleId;
      }
    }
    return { zone, enabled: steps.length > 0, steps: steps.length > 0 ? steps : [stepRow(1)] };
  });

  const byRoute = new Map<string, RouteRow>();
  for (const rule of detail.routeRules) {
    if (rule.kind !== "CITY" || rule.serviceTypeId !== serviceTypeId || rule.pricePerUnit !== null) continue;
    if (rule.fromCityId == null || rule.toCityId == null || rule.basePrice === null) continue;
    const key = `${rule.fromCityId}-${rule.toCityId}`;
    const route = byRoute.get(key) ?? { key: rowKey(), fromCityId: rule.fromCityId, toCityId: rule.toCityId, steps: [] };
    const weight = Math.max(1, Math.ceil(rule.weightFrom));
    const extra = rule.extraPerKg ?? 0;
    route.steps.push(stepRow(weight, rule.basePrice + (weight - rule.weightFrom) * extra, extra));
    byRoute.set(key, route);
  }
  const routes = [...byRoute.values()];
  for (const route of routes) route.steps.sort((a, b) => Number(a.weightText) - Number(b.weightText));

  const enabled = zones.filter((zone) => zone.enabled);
  const sameForAllZones =
    enabled.length === zones.length && enabled.every((zone) => sameSteps(zone.steps, enabled[0].steps));
  return {
    serviceTypeId,
    sameForAllZones: sameForAllZones || enabled.length === 0,
    common: enabled[0]?.steps.map((row) => ({ ...row, key: rowKey() })) ?? [stepRow(1)],
    zones,
    routes,
  };
}

/** Цены услуги, которые окно не покажет и молча заменило бы: за место и по хабам. */
export function unsupportedRules(detail: TariffVersionDetail, serviceTypeId: number): number {
  const routes = detail.routeRules.filter(
    (rule) => rule.serviceTypeId === serviceTypeId && (rule.kind === "HUB" || rule.pricePerUnit !== null),
  ).length;
  const grid = detail.zoneGrids.find((item) => item.serviceTypeId === serviceTypeId);
  const perUnit = new Set(
    (grid?.rows ?? []).flatMap((row) => row.cells.filter((cell) => cell?.perUnit).map((cell) => cell!.ruleId)),
  ).size;
  return routes + perUnit;
}

/** Шаги из полей; `error` — что не так. */
export function parseSteps(rows: StepRow[]): { steps: TariffPriceStep[]; error: string | null } {
  const steps: TariffPriceStep[] = [];
  for (const [index, row] of rows.entries()) {
    const weight = Number(row.weightText.trim());
    if (!row.weightText.trim() || !Number.isInteger(weight) || weight < 1) {
      return { steps, error: "вес шага — целое число кг" };
    }
    if (index === 0 && weight !== 1) return { steps, error: "первый шаг — с 1 кг" };
    if (index > 0 && weight <= steps[index - 1].weightFrom) return { steps, error: "шаги веса — по возрастанию" };
    const price = parseMoney(row.priceText);
    if (price === null || price <= 0) return { steps, error: `с ${weight} кг: укажите цену` };
    const extra = row.extraText.trim() === "" ? 0 : parseMoney(row.extraText);
    if (extra === null || extra < 0) return { steps, error: `с ${weight} кг: доплата за кг — число` };
    steps.push({ weightFrom: weight, basePrice: price, extraPerKg: extra });
  }
  if (steps.length === 0) return { steps, error: "нет ни одного шага" };
  return { steps, error: null };
}

/** Цена заказа такого веса — как посчитает калькулятор. */
export function priceFor(steps: TariffPriceStep[], weight: number): number | null {
  const kg = Math.max(1, Math.ceil(weight));
  const step = [...steps].reverse().find((item) => item.weightFrom <= kg);
  if (!step) return null;
  return Math.round((step.basePrice + (kg - step.weightFrom) * step.extraPerKg) * 100) / 100;
}

/** «1–30 кг: 107 142 за заказ», «от 31 кг: 40 000 за 31 кг, +3 000 за каждый следующий». */
export function stepLabel(steps: TariffPriceStep[], index: number): string {
  const step = steps[index];
  const next = steps[index + 1];
  const range = next
    ? next.weightFrom - 1 === step.weightFrom
      ? `${formatNumber(step.weightFrom)} кг`
      : `${formatNumber(step.weightFrom)}–${formatNumber(next.weightFrom - 1)} кг`
    : `от ${formatNumber(step.weightFrom)} кг`;
  const price =
    step.extraPerKg === 0
      ? `${formatPrice(step.basePrice)} за заказ`
      : `${formatPrice(step.basePrice)} за ${formatNumber(step.weightFrom)} кг, +${formatPrice(step.extraPerKg)} за каждый следующий`;
  return `${range}: ${price}`;
}

/** Примеры цен: начало и конец каждого шага и вес потяжелее последнего. */
export function examples(steps: TariffPriceStep[]): Array<{ weight: number; price: number }> {
  const weights = new Set<number>([1]);
  steps.forEach((step, index) => {
    weights.add(step.weightFrom);
    const next = steps[index + 1];
    if (next && next.weightFrom - 1 > step.weightFrom) weights.add(next.weightFrom - 1);
  });
  const last = steps[steps.length - 1];
  if (last) weights.add(last.weightFrom + (last.weightFrom === 1 ? 9 : 10));
  return [...weights]
    .sort((a, b) => a - b)
    .slice(0, 8)
    .flatMap((weight) => {
      const price = priceFor(steps, weight);
      return price === null ? [] : [{ weight, price }];
    });
}

/** Черновик → запрос серверу; `errors` — что поправить, по местам. */
export function toServicePrices(draft: ServicePricesDraft): {
  zones: Array<{ zone: number; steps: TariffPriceStep[] }>;
  routes: Array<{ fromCityId: number; toCityId: number; steps: TariffPriceStep[] }>;
  errors: string[];
} {
  const errors: string[] = [];
  const zones: Array<{ zone: number; steps: TariffPriceStep[] }> = [];
  if (draft.sameForAllZones) {
    const parsed = parseSteps(draft.common);
    if (parsed.error) errors.push(`Зоны: ${parsed.error}`);
    else zones.push(...draft.zones.map((zone) => ({ zone: zone.zone, steps: parsed.steps })));
  } else {
    for (const zone of draft.zones.filter((item) => item.enabled)) {
      const parsed = parseSteps(zone.steps);
      if (parsed.error) errors.push(`Зона ${zone.zone}: ${parsed.error}`);
      else zones.push({ zone: zone.zone, steps: parsed.steps });
    }
  }

  const routes: Array<{ fromCityId: number; toCityId: number; steps: TariffPriceStep[] }> = [];
  const seen = new Set<string>();
  draft.routes.forEach((route, index) => {
    const label = `Маршрут ${index + 1}`;
    if (route.fromCityId === null || route.toCityId === null) {
      errors.push(`${label}: выберите города`);
      return;
    }
    const key = `${route.fromCityId}-${route.toCityId}`;
    if (seen.has(key)) {
      errors.push(`${label}: такой маршрут уже есть`);
      return;
    }
    seen.add(key);
    const parsed = parseSteps(route.steps);
    if (parsed.error) errors.push(`${label}: ${parsed.error}`);
    else routes.push({ fromCityId: route.fromCityId, toCityId: route.toCityId, steps: parsed.steps });
  });

  if (errors.length === 0 && zones.length === 0 && routes.length === 0) {
    errors.push("Нет ни одной цены — чтобы услуги не было, уберите её из плана");
  }
  return { zones, routes, errors };
}
