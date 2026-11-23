import { describe, expect, it } from "vitest";
import type { TariffPriceCell, TariffVersionDetail, TariffZoneGrid } from "@/lib/backend/types";
import {
  allSameAs,
  defaultRows,
  overMaxInfo,
  rowError,
  sameForAll,
  surchargeLines,
  toServiceSources,
  type ServiceRow,
} from "./service-sources";

const cell = (extraPerKg: number): TariffPriceCell => ({
  ruleId: 1,
  price: 100,
  perUnit: false,
  extraPerKg,
  ruleWeightFrom: 20,
  priority: 100,
  ambiguous: false,
});

const grid = (serviceTypeId: number | null, lastExtras: number[]): TariffZoneGrid => ({
  serviceTypeId,
  zones: lastExtras.map((_, index) => index),
  rows: [
    { weightFrom: 1, weightTo: 19, cells: lastExtras.map(() => cell(0)) },
    { weightFrom: 20, weightTo: null, cells: lastExtras.map((extra) => cell(extra)) },
  ],
});

/** План как стандарт: четыре услуги в справочнике, цены у дверь-дверь и ПВЗ-ПВЗ, доплата в район. */
const standard = {
  versionId: 70,
  planName: "Новый стандартный тарифы Plan",
  serviceTypes: [
    { id: 4, code: "pvz", name: "ПВЗ-ПВЗ" },
    { id: 1, code: "d2d", name: "Дверь-дверь" },
    { id: 2, code: "d2p", name: "Дверь-ПВЗ" },
  ],
  zoneGrids: [grid(1, [5000, 5000]), grid(4, [3000, 4000])],
  routeRules: [],
  surcharges: [
    { id: 1, name: null, serviceTypeId: null, fromIsHub: true, toIsHub: false, toCity: null, weightFrom: 0, weightTo: 5, amount: 45000, amountType: "FIXED", overKg: null, priority: null },
    { id: 2, name: null, serviceTypeId: 4, fromIsHub: null, toIsHub: null, toCity: null, weightFrom: 41, weightTo: null, amount: -10, amountType: "PERCENT", overKg: null, priority: null },
  ],
} as unknown as TariffVersionDetail;

describe("цены по услугам", () => {
  it("по умолчанию всё как сейчас; услуги, которой в плане нет, нет и в новом", () => {
    const rows = defaultRows(standard);
    expect(rows.map((row) => [row.serviceTypeId, row.choice.kind])).toEqual([
      [1, "PLAN"],
      [2, "NONE"],
      [4, "PLAN"],
    ]);
    expect(rows[0].choice).toEqual({ kind: "PLAN", versionId: 70 });
    expect(rows[0].surcharges).toBe(true);
  });

  it("доплата сверх последнего веса и доплаты услуги — как в плане", () => {
    expect(overMaxInfo(standard, 1)).toEqual({ weight: 20, current: expect.stringMatching(/^5\s000 за кг$/) });
    expect(overMaxInfo(standard, 4)?.current).toMatch(/^от 3\s000 до 4\s000 за кг$/);
    expect(overMaxInfo(standard, 2)).toBeNull();
    expect(surchargeLines(standard, 1)).toHaveLength(1);
    expect(surchargeLines(standard, 4)[1]).toMatch(/^−10%, от 41 кг$/);
  });

  it("Euphoria: две услуги как в RCD со своей доплатой, остальное как сейчас → запрос", () => {
    const rows: ServiceRow[] = [
      { serviceTypeId: 1, choice: { kind: "PLAN", versionId: 68 }, rateText: "", overMaxText: "4 000", surcharges: false },
      { serviceTypeId: 2, choice: { kind: "PLAN", versionId: 70 }, rateText: "", overMaxText: "", surcharges: true },
      { serviceTypeId: 3, choice: { kind: "NONE" }, rateText: "", overMaxText: "", surcharges: true },
      { serviceTypeId: 4, choice: { kind: "PER_KG" }, rateText: "3000", overMaxText: "", surcharges: false },
    ];
    expect(toServiceSources(rows, 70)).toEqual([
      { serviceTypeId: 1, kind: "PLAN", versionId: 68, overMaxPerKg: 4000, surcharges: false },
      { serviceTypeId: 2, kind: "PLAN", versionId: 70, surcharges: true },
      { serviceTypeId: 4, kind: "PER_KG", perKg: 3000 },
    ]);
    expect(toServiceSources([{ ...rows[3], surcharges: true }], 70)).toEqual([
      { serviceTypeId: 4, kind: "PER_KG", perKg: 3000, surchargesFromVersionId: 70 },
    ]);
  });

  it("ошибки строки: нет ставки, кривая доплата, услуги нет в плане", () => {
    const base: ServiceRow = { serviceTypeId: 2, choice: { kind: "PLAN", versionId: 70 }, rateText: "", overMaxText: "", surcharges: true };
    expect(rowError(base, standard)).toMatch(/такой услуги нет/);
    expect(rowError({ ...base, serviceTypeId: 1 }, standard)).toBeNull();
    expect(rowError({ ...base, serviceTypeId: 1, overMaxText: "abc" }, standard)).toMatch(/число/);
    expect(rowError({ ...base, choice: { kind: "PER_KG" }, rateText: "0" }, standard)).toMatch(/ставку/);
    expect(rowError({ ...base, choice: { kind: "PER_ORDER" }, rateText: "" }, standard)).toMatch(/цену за заказ/);
    expect(rowError({ ...base, choice: { kind: "NONE" } }, standard)).toBeNull();
  });

  it("TBC express: 80 000 за заказ — так же для всех услуг → запрос", () => {
    const rows = defaultRows(standard).map((row) =>
      row.serviceTypeId === 4 ? { ...row, choice: { kind: "PER_ORDER" as const }, rateText: "80 000", surcharges: false } : row,
    );
    expect(allSameAs(rows, 4)).toBe(false);
    const all = sameForAll(rows, 4);
    expect(allSameAs(all, 4)).toBe(true);
    expect(toServiceSources(all, 70)).toEqual([
      { serviceTypeId: 1, kind: "PER_ORDER", perOrder: 80000 },
      { serviceTypeId: 2, kind: "PER_ORDER", perOrder: 80000 },
      { serviceTypeId: 4, kind: "PER_ORDER", perOrder: 80000 },
    ]);
  });
});
