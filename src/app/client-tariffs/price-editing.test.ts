import { describe, expect, it } from "vitest";
import type { TariffPriceCell, TariffZoneGrid } from "@/lib/backend/types";
import {
  collectOrigins,
  isChanged,
  layoutGrid,
  parseMoney,
  priceAt,
  toChanges,
  withAnchorPrice,
  withExtraPerKg,
} from "./price-editing";

const cell = (ruleId: number, price: number | null, patch: Partial<TariffPriceCell> = {}): TariffPriceCell => ({
  ruleId,
  price,
  perUnit: false,
  extraPerKg: 3000,
  ruleWeightFrom: 4,
  priority: 10,
  ambiguous: false,
  ...patch,
});

// Как у ALIF: правило зоны 2 «от 4 кг» даёт цену строкам «4 кг» и «5–20 кг»,
// в зоне 3 у «5–20 кг» своё правило.
const GRID: TariffZoneGrid = {
  serviceTypeId: 1,
  zones: [2, 3],
  rows: [
    { weightFrom: 1, weightTo: 3, cells: [cell(10, 35000, { ruleWeightFrom: 0, extraPerKg: 0 }), cell(20, 35000, { ruleWeightFrom: 0, extraPerKg: 0 })] },
    { weightFrom: 4, weightTo: 4, cells: [cell(11, 44000), cell(21, 49000)] },
    { weightFrom: 5, weightTo: 20, cells: [cell(11, 47000), cell(22, 52000, { ruleWeightFrom: 5, ambiguous: true })] },
  ],
};

describe("layoutGrid", () => {
  it("якорь — первая строка правила, строки ниже пересчитываются, спорные заблокированы", () => {
    const layout = layoutGrid(GRID);
    expect(layout.get("1:0")).toMatchObject({ kind: "anchor", origin: { ruleId: 11, anchorWeight: 4 } });
    expect(layout.get("2:0")).toMatchObject({ kind: "derived", weight: 5, origin: { ruleId: 11 } });
    expect(layout.get("2:1")).toMatchObject({ kind: "locked" });
  });
});

describe("черновик", () => {
  const layout = layoutGrid(GRID);
  const origins = collectOrigins([layout]);

  it("пересчитывает зависимые строки по формуле калькулятора", () => {
    const origin = origins.get(11)!;
    expect(priceAt(origin, undefined, 5)).toBe(47000);
    const draft = withExtraPerKg(origin, withAnchorPrice(origin, undefined, 46000), 3500);
    expect(priceAt(origin, draft, 4)).toBe(46000);
    expect(priceAt(origin, draft, 5)).toBe(49500);
  });

  it("переводит цену якоря в цену правила с учётом порога веса", () => {
    // Порог правила 0 кг, якорь — строка «1 кг»: цена правила на одну доплату меньше.
    const zeroBased = collectOrigins([
      layoutGrid({ serviceTypeId: 1, zones: [1], rows: [{ weightFrom: 1, weightTo: null, cells: [cell(30, 36000, { ruleWeightFrom: 0, extraPerKg: 1000 })] }] }),
    ]);
    const origin = zeroBased.get(30)!;
    expect(origin.basePrice).toBe(35000);
    // Ввели 40 000 в ячейку «1 кг», потом доплату 2 000 — в ячейке остаются 40 000.
    const draft = withExtraPerKg(origin, withAnchorPrice(origin, undefined, 40000), 2000);
    expect(priceAt(origin, draft, 1)).toBe(40000);
    expect(toChanges(zeroBased, new Map([[30, draft]]))).toEqual([{ ruleId: 30, basePrice: 38000, extraPerKg: 2000 }]);
  });

  it("не отправляет правила без изменений и цену за место — отдельным полем", () => {
    expect(toChanges(origins, new Map([[11, { basePrice: 44000, extraPerKg: 3000 }]]))).toEqual([]);
    const perUnit = collectOrigins([
      layoutGrid({ serviceTypeId: 1, zones: [1], rows: [{ weightFrom: 1, weightTo: null, cells: [cell(40, 89285.71, { perUnit: true, extraPerKg: 0 })] }] }),
    ]);
    expect(toChanges(perUnit, new Map([[40, { basePrice: 84821.42, extraPerKg: 0 }]]))).toEqual([{ ruleId: 40, pricePerUnit: 84821.42 }]);
    expect(isChanged(perUnit.get(40)!, { basePrice: 89285.71, extraPerKg: 5 })).toBe(false);
  });

  it("правило без услуги с разными якорями в двух сетках показывает одну и ту же цену", () => {
    const shared = (rows: TariffZoneGrid["rows"]) => collectOrigins([layoutGrid({ serviceTypeId: 1, zones: [1], rows })]).get(50)!;
    // В одной сетке правило «от 3 кг» впервые видно в строке «3 кг», в другой — в строке «4 кг».
    const a = shared([{ weightFrom: 3, weightTo: null, cells: [cell(50, 30000, { ruleWeightFrom: 3, extraPerKg: 1000 })] }]);
    const b = shared([{ weightFrom: 4, weightTo: null, cells: [cell(50, 31000, { ruleWeightFrom: 3, extraPerKg: 1000 })] }]);
    const draft = withAnchorPrice(a, undefined, 33000);
    expect(priceAt(a, draft, 10)).toBe(priceAt(b, draft, 10));
    expect(priceAt(b, draft, 4)).toBe(34000);
  });
});

describe("parseMoney", () => {
  it("понимает пробелы и запятую, отвергает мусор и лишние знаки", () => {
    expect(parseMoney("46 000")).toBe(46000);
    expect(parseMoney("89 285,71")).toBe(89285.71);
    expect(parseMoney("1 000")).toBe(1000);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("1.005")).toBeNull();
    expect(parseMoney("12abc")).toBeNull();
  });
});
