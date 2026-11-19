import type { TariffPriceCell, TariffZoneGrid } from "@/lib/backend/types";

/**
 * Черновик правки цен по зонам — без обращения к серверу.
 *
 * Одно правило калькулятора даёт цену нескольким строкам сетки: правило «от 5
 * кг» отвечает и за «5–20 кг», и за строки ниже, если у них нет своего
 * правила. Поэтому править можно только первую строку правила в столбце
 * («якорь»), а строки ниже пересчитываются по той же формуле, что у
 * калькулятора: цена при весе w = цена правила + (w − порог правила) × доплата.
 *
 * Черновик хранит поля самого правила, а не цену ячейки: правило без услуги
 * попадает в сетки всех услуг, и якорь у него в разных сетках может стоять на
 * разном весе. Цена любой ячейки всегда выводится из полей правила.
 */

/** Правка одного правила — в его собственных полях, как в калькуляторе. */
export interface RuleDraft {
  /** Цена при пороге веса правила; у цены за место — цена за место. */
  basePrice: number;
  /** Доплата за каждый следующий килограмм (у цены за место — 0). */
  extraPerKg: number;
}

/** Исходные значения правила — чтобы показать «было» и понять, менялось ли. */
export interface RuleOrigin {
  ruleId: number;
  perUnit: boolean;
  ruleWeightFrom: number;
  /** Вес строки-якоря в этой сетке. */
  anchorWeight: number;
  /** Цена правила при его пороге веса (у цены за место — цена за место). */
  basePrice: number;
  extraPerKg: number;
}

/** Ячейка в режиме правки. */
export type EditableCell =
  | { kind: "anchor"; origin: RuleOrigin }
  /** Цену даёт правило из строки выше — здесь она только пересчитывается. */
  | { kind: "derived"; origin: RuleOrigin; weight: number }
  /** Два правила с одним приоритетом: калькулятор возьмёт любое — править нельзя. */
  | { kind: "locked"; reason: string };

/**
 * Разметка сетки: какая ячейка — якорь правила, какая пересчитывается от него,
 * какую править нельзя. Ключ — `строка:столбец`.
 */
export function layoutGrid(grid: TariffZoneGrid): Map<string, EditableCell> {
  const layout = new Map<string, EditableCell>();
  const anchors = new Map<number, RuleOrigin>();

  grid.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, columnIndex) => {
      if (!cell) return;
      const key = `${rowIndex}:${columnIndex}`;
      if (cell.ambiguous) {
        layout.set(key, { kind: "locked", reason: "Два правила с одним приоритетом — сначала поправьте это в калькуляторе" });
        return;
      }
      if (cell.price === null) {
        layout.set(key, { kind: "locked", reason: "У правила нет цены — его правят в калькуляторе" });
        return;
      }
      const anchor = anchors.get(cell.ruleId);
      if (anchor) {
        layout.set(key, { kind: "derived", origin: anchor, weight: row.weightFrom });
        return;
      }
      const origin = originOf(cell, row.weightFrom);
      anchors.set(cell.ruleId, origin);
      layout.set(key, { kind: "anchor", origin });
    });
  });
  return layout;
}

/** На сколько килограммов вес строки-якоря выше порога правила (порог 0 и строка «1 кг» — на один). */
function anchorOffset(origin: RuleOrigin): number {
  return origin.perUnit ? 0 : Math.max(0, origin.anchorWeight - origin.ruleWeightFrom);
}

function originOf(cell: TariffPriceCell, anchorWeight: number): RuleOrigin {
  const origin: RuleOrigin = {
    ruleId: cell.ruleId,
    perUnit: cell.perUnit,
    ruleWeightFrom: cell.ruleWeightFrom,
    anchorWeight,
    basePrice: 0,
    extraPerKg: cell.perUnit ? 0 : cell.extraPerKg,
  };
  origin.basePrice = roundMoney((cell.price ?? 0) - anchorOffset(origin) * origin.extraPerKg);
  return origin;
}

/** Действующие поля правила: из черновика, если он есть. */
function current(origin: RuleOrigin, draft: RuleDraft | undefined): RuleDraft {
  return draft ?? { basePrice: origin.basePrice, extraPerKg: origin.extraPerKg };
}

/** Цена правила при весе `weight` — с учётом черновика, если он есть. */
export function priceAt(origin: RuleOrigin, draft: RuleDraft | undefined, weight: number): number {
  const { basePrice, extraPerKg } = current(origin, draft);
  if (origin.perUnit) return basePrice;
  return roundMoney(basePrice + Math.max(0, weight - origin.ruleWeightFrom) * extraPerKg);
}

/** Человек ввёл цену в ячейку-якорь: доплата за кг остаётся прежней. */
export function withAnchorPrice(origin: RuleOrigin, draft: RuleDraft | undefined, price: number): RuleDraft {
  const { extraPerKg } = current(origin, draft);
  return { basePrice: roundMoney(price - anchorOffset(origin) * extraPerKg), extraPerKg };
}

/** Человек ввёл доплату за кг: цена в ячейке-якоре остаётся той, что он видит. */
export function withExtraPerKg(origin: RuleOrigin, draft: RuleDraft | undefined, extraPerKg: number): RuleDraft {
  const anchorPrice = priceAt(origin, draft, origin.anchorWeight);
  return { basePrice: roundMoney(anchorPrice - anchorOffset(origin) * extraPerKg), extraPerKg };
}

export function isChanged(origin: RuleOrigin, draft: RuleDraft | undefined): boolean {
  if (!draft) return false;
  return draft.basePrice !== origin.basePrice || (!origin.perUnit && draft.extraPerKg !== origin.extraPerKg);
}

/** Правка для сервера — в полях правила калькулятора. */
export interface PriceChangeInput {
  ruleId: number;
  basePrice?: number;
  extraPerKg?: number;
  pricePerUnit?: number;
}

/** Черновик → правки правил для сервера. */
export function toChanges(
  origins: Map<number, RuleOrigin>,
  drafts: Map<number, RuleDraft>,
): PriceChangeInput[] {
  const changes: PriceChangeInput[] = [];
  for (const [ruleId, draft] of drafts) {
    const origin = origins.get(ruleId);
    if (!origin || !isChanged(origin, draft)) continue;
    if (origin.perUnit) {
      changes.push({ ruleId, pricePerUnit: draft.basePrice });
      continue;
    }
    changes.push({ ruleId, basePrice: draft.basePrice, extraPerKg: draft.extraPerKg });
  }
  return changes;
}

/** Все правила-якоря всех сеток версии: правило без услуги может быть в нескольких. */
export function collectOrigins(layouts: Array<Map<string, EditableCell>>): Map<number, RuleOrigin> {
  const origins = new Map<number, RuleOrigin>();
  for (const layout of layouts) {
    for (const cell of layout.values()) {
      if (cell.kind === "anchor" && !origins.has(cell.origin.ruleId)) {
        origins.set(cell.origin.ruleId, cell.origin);
      }
    }
  }
  return origins;
}

/** Деньги с точностью до тийина — без хвостов двоичной дроби. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Сумма из поля ввода: «46 000», «46000», «89 285,71». Пустое или не число —
 * `null`: такое значение не сохраняется.
 */
export function parseMoney(text: string): number | null {
  const normalized = text.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}
