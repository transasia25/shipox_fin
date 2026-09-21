import { describe, expect, it } from "vitest";
import { applyRule, calcLeg, findRule, specificity, type LegContext } from "./engine";
import type { TariffFormula, TariffRule } from "@/lib/types";

const emptyFormula: TariffFormula = {
  base: 0,
  perKg: 0,
  includedKg: 0,
  perPlace: 0,
  includedPlaces: 0,
  perKm: 0,
};

function rule(partial: Partial<TariffRule> & { id: string }): TariffRule {
  return {
    name: partial.id,
    priority: 0,
    active: true,
    legType: "linehaul",
    match: {},
    formula: emptyFormula,
    effectiveFrom: "2025-01-01T00:00:00.000Z",
    effectiveTo: null,
    ...partial,
  };
}

const ctx: LegContext = {
  legType: "linehaul",
  fromZoneId: "tashkent",
  toZoneId: "samarkand",
  distanceKm: 300,
  weightKg: 12,
  places: 3,
  courierGroup: "staff",
  clientId: "c1",
  date: new Date("2026-06-01T10:00:00.000Z"),
};

describe("подбор правила", () => {
  it("не находит правило другого типа плеча", () => {
    expect(findRule(ctx, [rule({ id: "r1", legType: "pickup" })])).toBeNull();
  });

  it("возвращает null, когда подходящих правил нет", () => {
    expect(calcLeg(ctx, [])).toBeNull();
  });

  it("игнорирует выключенные правила", () => {
    expect(findRule(ctx, [rule({ id: "r1", active: false })])).toBeNull();
  });

  it("игнорирует правила вне срока действия", () => {
    const expired = rule({ id: "r1", effectiveTo: "2026-01-01T00:00:00.000Z" });
    const future = rule({ id: "r2", effectiveFrom: "2027-01-01T00:00:00.000Z" });
    expect(findRule(ctx, [expired, future])).toBeNull();
  });

  it("приоритет важнее специфичности", () => {
    const specific = rule({
      id: "specific",
      priority: 1,
      match: { fromZoneId: "tashkent", toZoneId: "samarkand", courierGroup: "staff" },
    });
    const general = rule({ id: "general", priority: 10, match: {} });
    expect(findRule(ctx, [specific, general])?.id).toBe("general");
  });

  it("при равном приоритете побеждает более специфичное правило", () => {
    const specific = rule({
      id: "specific",
      match: { fromZoneId: "tashkent", toZoneId: "samarkand" },
    });
    const general = rule({ id: "general", match: {} });
    expect(findRule(ctx, [general, specific])?.id).toBe("specific");
  });

  it("отсекает правило по несовпадающему направлению", () => {
    const wrongDirection = rule({ id: "r1", match: { toZoneId: "bukhara" } });
    expect(findRule(ctx, [wrongDirection])).toBeNull();
  });

  it("учитывает вилку веса", () => {
    const light = rule({ id: "light", match: { weightMax: 10 } });
    const heavy = rule({ id: "heavy", match: { weightMin: 10 } });
    expect(findRule(ctx, [light, heavy])?.id).toBe("heavy");
  });

  it("учитывает группу курьера", () => {
    const partner = rule({ id: "partner", match: { courierGroup: "partner" } });
    const staff = rule({ id: "staff", match: { courierGroup: "staff" } });
    expect(findRule(ctx, [partner, staff])?.id).toBe("staff");
  });

  it("специфичность считает заданные условия", () => {
    expect(specificity({})).toBe(0);
    expect(specificity({ fromZoneId: "a", toZoneId: "b", weightMin: 1 })).toBe(3);
  });
});

describe("расчёт суммы", () => {
  it("складывает базу, вес, места и километры", () => {
    const r = rule({
      id: "r1",
      formula: {
        base: 100_000,
        perKg: 2_000,
        includedKg: 10,
        perPlace: 5_000,
        includedPlaces: 1,
        perKm: 300,
      },
    });
    // 100000 + (12-10)*2000 + (3-1)*5000 + 300*300 = 100000 + 4000 + 10000 + 90000
    expect(applyRule(r, ctx).amount).toBe(204_000);
  });

  it("не начисляет за вес и места в пределах включённого объёма", () => {
    const r = rule({
      id: "r1",
      formula: { ...emptyFormula, base: 50_000, perKg: 2_000, includedKg: 20, perPlace: 5_000, includedPlaces: 5 },
    });
    const calc = applyRule(r, ctx);
    expect(calc.amount).toBe(50_000);
    expect(calc.breakdown).toHaveLength(1);
  });

  it("подтягивает сумму до минимума", () => {
    const r = rule({ id: "r1", formula: { ...emptyFormula, base: 5_000, min: 20_000 } });
    expect(applyRule(r, ctx).amount).toBe(20_000);
  });

  it("ограничивает сумму максимумом", () => {
    const r = rule({ id: "r1", formula: { ...emptyFormula, base: 500_000, max: 200_000 } });
    expect(applyRule(r, ctx).amount).toBe(200_000);
  });

  it("возвращает разбор, сумма строк которого равна итогу", () => {
    const r = rule({
      id: "r1",
      formula: { base: 30_000, perKg: 1_500, includedKg: 5, perPlace: 2_000, includedPlaces: 0, perKm: 100 },
    });
    const calc = applyRule(r, ctx);
    const sum = calc.breakdown.reduce((acc, line) => acc + line.value, 0);
    expect(sum).toBe(calc.amount);
  });

  it("сохраняет ссылку на применённое правило", () => {
    const r = rule({ id: "r1", name: "Транзит Ташкент → Самарканд", formula: { ...emptyFormula, base: 1 } });
    const calc = calcLeg(ctx, [r]);
    expect(calc?.ruleId).toBe("r1");
    expect(calc?.ruleName).toBe("Транзит Ташкент → Самарканд");
  });
});

describe("несколько транзитных плеч в одном заказе", () => {
  it("тарифицирует каждое направление своим правилом", () => {
    const rules = [
      rule({
        id: "tas-jiz",
        match: { fromZoneId: "tashkent", toZoneId: "jizzakh" },
        formula: { ...emptyFormula, base: 80_000 },
      }),
      rule({
        id: "jiz-sam",
        match: { fromZoneId: "jizzakh", toZoneId: "samarkand" },
        formula: { ...emptyFormula, base: 60_000 },
      }),
    ];
    const first = calcLeg({ ...ctx, toZoneId: "jizzakh", distanceKm: 200 }, rules);
    const second = calcLeg({ ...ctx, fromZoneId: "jizzakh", distanceKm: 130 }, rules);
    expect(first?.amount).toBe(80_000);
    expect(second?.amount).toBe(60_000);
  });
});
