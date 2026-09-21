import type {
  Courier,
  Leg,
  LegType,
  Order,
  PayoutBreakdownLine,
  PayoutCalc,
  TariffMatch,
  TariffRule,
} from "@/lib/types";

/**
 * Движок тарификации плеч.
 *
 * Чистые функции без побочных эффектов — используются в трёх местах:
 * предпросмотр в редакторе тарифа, карточка заказа и формирование реестра
 * начислений. Одна и та же функция везде гарантирует, что бухгалтерия и
 * управляющая компания видят одинаковые цифры.
 */

/** Контекст плеча — всё, от чего может зависеть ставка. */
export interface LegContext {
  legType: LegType;
  fromZoneId: string;
  toZoneId: string;
  distanceKm: number;
  weightKg: number;
  places: number;
  courierGroup?: Courier["group"];
  clientId?: string;
  /** Дата, на которую действует правило. По умолчанию — начало плеча. */
  date: Date;
}

/** Собирает контекст из заказа, плеча и исполнителя. */
export function legContext(leg: Leg, order: Order, courier: Courier | undefined): LegContext {
  return {
    legType: leg.type,
    fromZoneId: leg.fromZoneId,
    toZoneId: leg.toZoneId,
    distanceKm: leg.distanceKm,
    weightKg: order.weightKg,
    places: order.places,
    courierGroup: courier?.group,
    clientId: order.clientId,
    date: new Date(leg.startedAt),
  };
}

/** Действует ли правило на указанную дату. */
function isEffective(rule: TariffRule, date: Date): boolean {
  const time = date.getTime();
  if (time < new Date(rule.effectiveFrom).getTime()) return false;
  if (rule.effectiveTo && time > new Date(rule.effectiveTo).getTime()) return false;
  return true;
}

/** Проверка условий. Незаданное поле match означает «подходит любое значение». */
function matches(rule: TariffRule, ctx: LegContext): boolean {
  const m = rule.match;
  if (rule.legType !== ctx.legType) return false;
  if (m.fromZoneId && m.fromZoneId !== ctx.fromZoneId) return false;
  if (m.toZoneId && m.toZoneId !== ctx.toZoneId) return false;
  if (m.courierGroup && m.courierGroup !== ctx.courierGroup) return false;
  if (m.clientId && m.clientId !== ctx.clientId) return false;
  if (m.weightMin !== undefined && ctx.weightKg < m.weightMin) return false;
  if (m.weightMax !== undefined && ctx.weightKg > m.weightMax) return false;
  if (m.placesMin !== undefined && ctx.places < m.placesMin) return false;
  if (m.placesMax !== undefined && ctx.places > m.placesMax) return false;
  return true;
}

/**
 * Специфичность — количество заданных условий. При равном приоритете
 * побеждает более узкое правило: «Ташкент → Самарканд, партнёр» важнее,
 * чем «любой транзит».
 */
export function specificity(match: TariffMatch): number {
  return (Object.keys(match) as (keyof TariffMatch)[]).filter(
    (key) => match[key] !== undefined && match[key] !== "",
  ).length;
}

/** Все правила, подходящие под контекст, в порядке применения (первое — победитель). */
export function findMatchingRules(ctx: LegContext, rules: TariffRule[]): TariffRule[] {
  return rules
    .filter((rule) => rule.active && isEffective(rule, ctx.date) && matches(rule, ctx))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const bySpecificity = specificity(b.match) - specificity(a.match);
      if (bySpecificity !== 0) return bySpecificity;
      // Последний стабилизатор, чтобы порядок не зависел от порядка в массиве.
      return a.id.localeCompare(b.id);
    });
}

/** Правило, которое будет применено, либо null, если подходящих нет. */
export function findRule(ctx: LegContext, rules: TariffRule[]): TariffRule | null {
  return findMatchingRules(ctx, rules)[0] ?? null;
}

/** Расчёт по конкретному правилу — с разбором, который показывается в UI. */
export function applyRule(rule: TariffRule, ctx: LegContext): PayoutCalc {
  const f = rule.formula;
  const breakdown: PayoutBreakdownLine[] = [];
  let amount = 0;

  if (f.base) {
    breakdown.push({ label: "База", value: f.base });
    amount += f.base;
  }

  const billableKg = Math.max(0, ctx.weightKg - f.includedKg);
  if (f.perKg && billableKg > 0) {
    const value = Math.round(f.perKg * billableKg);
    breakdown.push({
      label: `Вес: ${round1(billableKg)} кг сверх ${round1(f.includedKg)} кг × ${f.perKg}`,
      value,
    });
    amount += value;
  }

  const billablePlaces = Math.max(0, ctx.places - f.includedPlaces);
  if (f.perPlace && billablePlaces > 0) {
    const value = Math.round(f.perPlace * billablePlaces);
    breakdown.push({
      label: `Места: ${billablePlaces} сверх ${f.includedPlaces} × ${f.perPlace}`,
      value,
    });
    amount += value;
  }

  if (f.perKm && ctx.distanceKm > 0) {
    const value = Math.round(f.perKm * ctx.distanceKm);
    breakdown.push({
      label: `Расстояние: ${round1(ctx.distanceKm)} км × ${f.perKm}`,
      value,
    });
    amount += value;
  }

  amount = Math.round(amount);

  if (f.min !== undefined && amount < f.min) {
    breakdown.push({ label: `Подтянуто до минимума ${f.min}`, value: f.min - amount });
    amount = f.min;
  }
  if (f.max !== undefined && amount > f.max) {
    breakdown.push({ label: `Ограничено максимумом ${f.max}`, value: f.max - amount });
    amount = f.max;
  }

  return { amount, ruleId: rule.id, ruleName: rule.name, breakdown };
}

/** Итоговый расчёт плеча: подобрать правило и применить. */
export function calcLeg(ctx: LegContext, rules: TariffRule[]): PayoutCalc | null {
  const rule = findRule(ctx, rules);
  return rule ? applyRule(rule, ctx) : null;
}

/** Удобная обёртка для карточки заказа и реестров. */
export function calcLegPayout(
  leg: Leg,
  order: Order,
  courier: Courier | undefined,
  rules: TariffRule[],
): PayoutCalc | null {
  return calcLeg(legContext(leg, order, courier), rules);
}

/** Пересчитать все плечи заказа по текущим правилам. */
export function recalcOrder(
  order: Order,
  rules: TariffRule[],
  couriersById: Map<string, Courier>,
): Order {
  return {
    ...order,
    legs: order.legs.map((leg) => ({
      ...leg,
      payout: calcLegPayout(leg, order, couriersById.get(leg.courierId), rules),
    })),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
