import { describe, expect, it } from "vitest";
import type { TariffPriceCell, TariffVersionDetail } from "@/lib/backend/types";
import {
  draftFromDetail,
  examples,
  parseSteps,
  priceFor,
  stepLabel,
  stepRow,
  toServicePrices,
  unsupportedRules,
  type ServicePricesDraft,
} from "./service-prices";

const cell = (ruleId: number, price: number, extraPerKg: number, ruleWeightFrom: number): TariffPriceCell => ({
  ruleId,
  price,
  perUnit: false,
  extraPerKg,
  ruleWeightFrom,
  priority: 100,
  ambiguous: false,
});

/** Как копия стандарта у MORE DISTRIBUTE: дверь-дверь, строки 1, 2 и 20 кг, две зоны. */
const plan = {
  versionId: 81,
  planName: "ООО MORE DISTRIBUTE",
  serviceTypes: [1, 2, 3, 4].map((id) => ({ id, code: `s${id}`, name: `услуга ${id}` })),
  zoneGrids: [
    {
      serviceTypeId: 1,
      zones: [0, 1],
      rows: [
        { weightFrom: 1, weightTo: 1, cells: [cell(1, 27500, 0, 1), cell(4, 33000, 0, 1)] },
        { weightFrom: 2, weightTo: 19, cells: [cell(2, 30800, 0, 2), cell(5, 36300, 0, 2)] },
        { weightFrom: 20, weightTo: null, cells: [cell(3, 90200, 5000, 20), cell(6, 95700, 5000, 20)] },
      ],
    },
  ],
  routeRules: [
    { id: 9, kind: "CITY", serviceTypeId: 1, from: "Tashkent", to: "Tashkent", fromCityId: 1, toCityId: 1, isLocal: null, weightFrom: 1, basePrice: 107142.86, extraPerKg: 0, pricePerUnit: null, priority: 300 },
    { id: 10, kind: "HUB", serviceTypeId: 4, from: null, to: "Tashkent", isLocal: true, weightFrom: 1, basePrice: 1, extraPerKg: 0, pricePerUnit: null, priority: 20 },
  ],
  surcharges: [],
} as unknown as TariffVersionDetail;

describe("цены услуги заново", () => {
  it("черновик из плана: шаги по зонам и маршруты, как калькулятор считает сейчас", () => {
    const draft = draftFromDetail(plan, 1, [0, 1, 2]);
    expect(draft.sameForAllZones).toBe(false);
    expect(draft.zones.map((zone) => [zone.zone, zone.enabled, zone.steps.length])).toEqual([
      [0, true, 3],
      [1, true, 3],
      [2, false, 1],
    ]);
    expect(parseSteps(draft.zones[0].steps).steps).toEqual([
      { weightFrom: 1, basePrice: 27500, extraPerKg: 0 },
      { weightFrom: 2, basePrice: 30800, extraPerKg: 0 },
      { weightFrom: 20, basePrice: 90200, extraPerKg: 5000 },
    ]);
    expect(draft.routes).toHaveLength(1);
    expect(parseSteps(draft.routes[0].steps).steps).toEqual([{ weightFrom: 1, basePrice: 107142.86, extraPerKg: 0 }]);
    expect(unsupportedRules(plan, 1)).toBe(0);
    expect(unsupportedRules(plan, 4)).toBe(1);
  });

  it("MORE DISTRIBUTE: регионы 40 000 + 3 000/кг, Ташкент 107 142,86 до 30 кг и 133 928,57 до 55", () => {
    const draft: ServicePricesDraft = {
      serviceTypeId: 1,
      sameForAllZones: true,
      common: [stepRow(1, 40000, 3000)],
      zones: [0, 1].map((zone) => ({ zone, enabled: true, steps: [] })),
      routes: [{ key: "r", fromCityId: 1, toCityId: 1, steps: [stepRow(1, 107142.86, 0), stepRow(31, 133928.57, 0)] }],
    };
    const input = toServicePrices(draft);
    expect(input.errors).toEqual([]);
    expect(input.zones).toEqual([0, 1].map((zone) => ({ zone, steps: [{ weightFrom: 1, basePrice: 40000, extraPerKg: 3000 }] })));
    const tashkent = input.routes[0].steps;
    expect([0.3, 30, 31, 55].map((weight) => priceFor(tashkent, weight))).toEqual([107142.86, 107142.86, 133928.57, 133928.57]);
    expect([1, 2, 10].map((weight) => priceFor(input.zones[0].steps, weight))).toEqual([40000, 43000, 67000]);
    expect(stepLabel(tashkent, 0)).toMatch(/^1–30 кг: 107\s142,86 за заказ$/);
    expect(stepLabel(tashkent, 1)).toMatch(/^от 31 кг: 133\s928,57 за заказ$/);
    expect(stepLabel(input.zones[0].steps, 0)).toMatch(/^от 1 кг: 40\s000 за 1 кг, \+3\s000 за каждый следующий$/);
    expect(examples(tashkent).map((item) => item.weight)).toEqual([1, 30, 31, 41]);
  });

  it("ошибки: первый шаг не с 1 кг, шаги не по возрастанию, нет цены, не выбран город, пусто", () => {
    expect(parseSteps([stepRow(2, 100, 0)]).error).toMatch(/с 1 кг/);
    expect(parseSteps([stepRow(1, 100, 0), stepRow(31, 200, 0), stepRow(20, 300, 0)]).error).toMatch(/возрастанию/);
    expect(parseSteps([stepRow(1, null, 0)]).error).toMatch(/укажите цену/);
    expect(parseSteps([{ ...stepRow(1, 100), extraText: "" }]).steps).toEqual([{ weightFrom: 1, basePrice: 100, extraPerKg: 0 }]);
    const empty: ServicePricesDraft = { serviceTypeId: 1, sameForAllZones: false, common: [], zones: [], routes: [] };
    expect(toServicePrices(empty).errors).toEqual([expect.stringMatching(/ни одной цены/)]);
    expect(
      toServicePrices({ ...empty, routes: [{ key: "r", fromCityId: 1, toCityId: null, steps: [stepRow(1, 100, 0)] }] }).errors,
    ).toEqual(["Маршрут 1: выберите города"]);
  });
});
