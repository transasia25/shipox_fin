import { describe, expect, it } from "vitest";
import type { TariffSurcharge } from "@/lib/backend/types";
import {
  amountLabels,
  buildSurchargeGroups,
  surchargeWeightLabel,
  withoutCity,
  type SurchargeLine,
} from "./surcharge-lines";

let nextId = 1;
function rule(partial: Partial<TariffSurcharge>): TariffSurcharge {
  return {
    id: nextId++,
    name: null,
    serviceTypeId: null,
    fromIsHub: null,
    toIsHub: null,
    toCity: null,
    weightFrom: 0,
    weightTo: null,
    amount: 0,
    amountType: "FIXED",
    overKg: null,
    priority: null,
    ...partial,
  };
}

/** Пробелы-разделители тысяч у Intl — неразрывные; в ожиданиях пишем обычные. */
const plain = (labels: string[]) => labels.map((label) => label.replace(/[  ]/g, " "));

// Надбавки плана по умолчанию (Standard Default) — как в калькуляторе.
const STANDARD: TariffSurcharge[] = [
  rule({ fromIsHub: true, toIsHub: false, weightFrom: 0, weightTo: 5, amount: 45000, name: "Route surcharge (fixed) — migrated id=2" }),
  rule({ fromIsHub: false, toIsHub: true, weightFrom: 0, weightTo: 5, amount: 45000 }),
  rule({ fromIsHub: false, toIsHub: false, weightFrom: 0, weightTo: 5, amount: 90000 }),
  rule({ fromIsHub: true, toIsHub: false, weightFrom: 6, weightTo: 20, amount: 40000 }),
  rule({ fromIsHub: false, toIsHub: true, weightFrom: 6, weightTo: 20, amount: 40000 }),
  rule({ fromIsHub: false, toIsHub: false, weightFrom: 6, weightTo: 20, amount: 85000 }),
  rule({ fromIsHub: true, toIsHub: false, weightFrom: 21, amount: 40000 }),
  rule({ fromIsHub: false, toIsHub: true, weightFrom: 21, amount: 40000 }),
  rule({ fromIsHub: false, toIsHub: false, weightFrom: 21, amount: 85000 }),
  rule({ fromIsHub: true, toIsHub: false, weightFrom: 6, weightTo: 20, amount: 1000, amountType: "PER_KG" }),
  rule({ fromIsHub: false, toIsHub: true, weightFrom: 6, weightTo: 20, amount: 1000, amountType: "PER_KG" }),
  rule({ fromIsHub: false, toIsHub: false, weightFrom: 6, weightTo: 20, amount: 1000, amountType: "PER_KG" }),
  rule({ fromIsHub: true, toIsHub: false, weightFrom: 21, amount: 1000, amountType: "PER_KG" }),
  rule({ fromIsHub: false, toIsHub: true, weightFrom: 21, amount: 1000, amountType: "PER_KG" }),
  rule({ fromIsHub: false, toIsHub: false, weightFrom: 21, amount: 1000, amountType: "PER_KG" }),
];

// ALIF MOLIYA: доплата за доставку в район и её отмена для отдельных городов.
const ALIF: TariffSurcharge[] = [
  rule({ toIsHub: false, weightFrom: 4, weightTo: 5, amount: 45000, name: "Доп город 4-5кг" }),
  rule({ toIsHub: false, weightFrom: 6, amount: 40000, name: "Доп город 6+кг base" }),
  rule({ toIsHub: false, weightFrom: 6, amount: 1000, amountType: "PER_KG", name: "Доп город 6+кг per-kg" }),
  rule({ toCity: "Nurafshon shahri", weightFrom: 4, weightTo: 5, amount: -45000, name: "Исключение доп.город: Nurafshon shahri" }),
  rule({ toCity: "Nurafshon shahri", weightFrom: 6, amount: -40000, name: "Исключение доп.город: Nurafshon shahri" }),
  rule({ toCity: "Nurafshon shahri", weightFrom: 6, amount: -1000, amountType: "PER_KG", name: "Исключение доп.город: Nurafshon shahri" }),
  rule({ toCity: "Qibray", weightFrom: 4, weightTo: 5, amount: -45000, name: "Исключение доп.город: Qibray" }),
  rule({ toCity: "Qibray", weightFrom: 6, amount: -40000, name: "Исключение доп.город: Qibray" }),
  rule({ toCity: "Qibray", weightFrom: 6, amount: -1000, amountType: "PER_KG", name: "Исключение доп.город: Qibray" }),
];

// KUIKO TRADING: поправка к базовой цене, плюс за заказ и минус за кг.
const KUIKO: TariffSurcharge[] = [
  rule({ fromIsHub: true, toIsHub: false, amount: 7000, name: "Одна сторона не хаб: 40 000 + 3 000/кг, база" }),
  rule({ fromIsHub: true, toIsHub: false, amount: -2000, amountType: "PER_KG", name: "Одна сторона не хаб: 40 000 + 3 000/кг, за кг" }),
];

// UZ-DONG YANG: одинаковые надбавки, заведённые отдельно для трёх услуг.
const UZ_DONG: TariffSurcharge[] = [1, 2, 3].flatMap((serviceTypeId) => [
  rule({ serviceTypeId, toIsHub: false, weightFrom: 0, weightTo: 3, amount: 30000, name: "Доп. город до 3 кг" }),
  rule({ serviceTypeId, toIsHub: false, weightFrom: 4, amount: 27000, name: "Доп. город 4+ кг, база" }),
  rule({ serviceTypeId, toIsHub: false, weightFrom: 4, amount: 1000, amountType: "PER_KG", name: "Доп. город 4+ кг, за кг" }),
]);

// GENAU: у «6–20» и «от 21» разные суммы — склеивать нельзя.
const GENAU: TariffSurcharge[] = [
  rule({ fromIsHub: true, toIsHub: false, weightFrom: 6, weightTo: 20, amount: 30000 }),
  rule({ fromIsHub: true, toIsHub: false, weightFrom: 21, amount: 3000 }),
  rule({ fromIsHub: true, toIsHub: false, weightFrom: 6, weightTo: 20, amount: 500, amountType: "PER_KG" }),
  rule({ fromIsHub: true, toIsHub: false, weightFrom: 21, amount: 500, amountType: "PER_KG" }),
];

describe("buildSurchargeGroups", () => {
  it("сводит 15 правил стандартного плана к шести строкам по трём маршрутам", () => {
    const groups = buildSurchargeGroups(STANDARD);
    expect(groups.map((group) => group.title)).toEqual([
      "Из хаба в район",
      "Из района в хаб",
      "Из района в район",
    ]);
    const hubToDistrict = groups[0].lines;
    expect(hubToDistrict.map((line) => surchargeWeightLabel(line.weightFrom, line.weightTo))).toEqual([
      "до 5 кг",
      "от 6 кг",
    ]);
    expect(plain(amountLabels(hubToDistrict[1].amounts))).toEqual(["+40 000", "+1 000 за каждый кг"]);
    expect(groups.flatMap((group) => group.lines).every((line) => line.kind === "surcharge")).toBe(true);
    // Технические названия «migrated id=…» не показываются.
    expect(hubToDistrict[0].names).toEqual([]);
  });

  it("показывает отмену доплаты для городов как скидку со знаком минус, города с одинаковыми строками — вместе", () => {
    const groups = buildSurchargeGroups(ALIF);
    expect(groups.map((group) => group.title)).toEqual([
      "Доставка в район",
      "Доставка в Nurafshon shahri, Qibray",
    ]);
    const city = groups[1].lines;
    expect(city).toHaveLength(2);
    expect(city.every((line) => line.kind === "discount")).toBe(true);
    expect(plain(amountLabels(city[1].amounts))).toEqual(["−40 000", "−1 000 за каждый кг"]);
    expect(city[1].names).toEqual(["Исключение доп.город"]);
    // «base» и «per-kg» — части одной надбавки, название одно.
    expect(groups[0].lines[1].names).toEqual(["Доп город 6+кг"]);
  });

  it("помечает строку с плюсом и минусом как поправку", () => {
    const [group] = buildSurchargeGroups(KUIKO);
    expect(group.lines).toHaveLength(1);
    expect(group.lines[0].kind).toBe("adjustment");
    expect(plain(amountLabels(group.lines[0].amounts))).toEqual(["+7 000", "−2 000 за каждый кг"]);
    expect(group.lines[0].names).toEqual(["Одна сторона не хаб: 40 000 + 3 000/кг"]);
  });

  it("объединяет одинаковые строки разных услуг", () => {
    const [group] = buildSurchargeGroups(UZ_DONG);
    expect(group.lines.map((line) => line.serviceTypeIds)).toEqual([
      [1, 2, 3],
      [1, 2, 3],
    ]);
  });

  it("при склейке городов не путает строки с одним весом и разной суммой", () => {
    const cityRules = (city: string) => [
      rule({ toCity: city, weightFrom: 0, weightTo: 5, amount: 100, name: `A ${city}` }),
      rule({ toCity: city, weightFrom: 6, weightTo: 10, amount: 100, name: `A ${city}` }),
      rule({ toCity: city, weightFrom: 0, weightTo: 10, amount: 50, name: `B ${city}` }),
    ];
    const [group] = buildSurchargeGroups([...cityRules("Xiva"), ...cityRules("Yangiyer")]);
    expect(group.title).toBe("Доставка в Xiva, Yangiyer");
    const byAmount = Object.fromEntries(group.lines.map((line) => [line.amounts.fixed, line.names]));
    expect(byAmount).toEqual({ 100: ["A"], 50: ["B"] });
    expect(group.lines.flatMap((line) => line.ruleIds)).toHaveLength(6);
  });

  it("складывает части неизвестного типа, а не повторяет их", () => {
    const [group] = buildSurchargeGroups([
      rule({ amount: 5000, amountType: "PER_PALLET" }),
      rule({ amount: 5000, amountType: "PER_PALLET" }),
    ]);
    expect(plain(amountLabels(group.lines[0].amounts))).toEqual(["+10 000 (PER_PALLET)"]);
  });

  it("вырезает из названия город только отдельным словом", () => {
    expect(withoutCity("Исключение доп.город: Kogon", "Kogon")).toBe("Исключение доп.город");
    expect(withoutCity("Kogon — исключение", "Kogon")).toBe("исключение");
    expect(withoutCity("Kogonsk tariff: Kogon", "Kogon")).toBe("Kogonsk tariff");
    expect(withoutCity("G'uzor (исключение)", "G'uzor")).toBe("(исключение)");
  });

  it("не склеивает соседние диапазоны с разными суммами", () => {
    const [group] = buildSurchargeGroups(GENAU);
    expect(group.lines.map((line) => surchargeWeightLabel(line.weightFrom, line.weightTo))).toEqual([
      "6–20 кг",
      "от 21 кг",
    ]);
  });
});

// ─── Склейка не меняет сумму: та же надбавка, что насчитал бы калькулятор ───

interface Order {
  fromIsHub: boolean;
  toIsHub: boolean;
  toCity: string;
  serviceTypeId: number;
  weight: number;
  boxes: number;
}

function matches(
  condition: {
    fromIsHub?: boolean | null;
    toIsHub?: boolean | null;
    toCities: string[] | null;
    weightFrom: number;
    weightTo: number | null;
  },
  order: Order,
): boolean {
  const weight = Math.ceil(order.weight);
  return (
    (condition.fromIsHub == null || condition.fromIsHub === order.fromIsHub) &&
    (condition.toIsHub == null || condition.toIsHub === order.toIsHub) &&
    (condition.toCities === null || condition.toCities.includes(order.toCity)) &&
    weight >= condition.weightFrom &&
    (condition.weightTo === null || weight <= condition.weightTo)
  );
}

function fromRules(rules: TariffSurcharge[], order: Order): number {
  const weight = Math.ceil(order.weight);
  return rules
    .filter(
      (item) =>
        (item.serviceTypeId === null || item.serviceTypeId === order.serviceTypeId) &&
        matches({ ...item, toCities: item.toCity === null ? null : [item.toCity] }, order),
    )
    .reduce((sum, item) => {
      if (item.amountType === "PER_KG") return sum + item.amount * weight;
      if (item.amountType === "PER_BOX") return sum + item.amount * order.boxes;
      return sum + item.amount;
    }, 0);
}

const ENDPOINT_HUB = { hub: true, district: false } as const;

function fromLines(lines: SurchargeLine[], order: Order): number {
  const weight = Math.ceil(order.weight);
  return lines
    .filter(
      (line) =>
        (line.serviceTypeIds === null || line.serviceTypeIds.includes(order.serviceTypeId)) &&
        matches(
          {
            fromIsHub: line.from === "any" ? null : ENDPOINT_HUB[line.from],
            toIsHub: line.to === "any" ? null : ENDPOINT_HUB[line.to],
            toCities: line.toCities,
            weightFrom: line.weightFrom,
            weightTo: line.weightTo,
          },
          order,
        ),
    )
    .reduce((sum, line) => sum + line.amounts.fixed + line.amounts.perKg * weight + line.amounts.perBox * order.boxes, 0);
}

describe("склейка строк не меняет сумму надбавок", () => {
  const plans = { STANDARD, ALIF, KUIKO, UZ_DONG, GENAU };
  for (const [name, rules] of Object.entries(plans)) {
    it(name, () => {
      const lines = buildSurchargeGroups(rules).flatMap((group) => group.lines);
      for (const fromIsHub of [true, false]) {
        for (const toIsHub of [true, false]) {
          for (const toCity of ["Nurafshon shahri", "Qibray", "Chirchiq"]) {
            for (const serviceTypeId of [1, 2, 3, 4]) {
              for (let tenth = 5; tenth <= 400; tenth += 5) {
                const order = { fromIsHub, toIsHub, toCity, serviceTypeId, weight: tenth / 10, boxes: 2 };
                expect(fromLines(lines, order), JSON.stringify(order)).toBe(fromRules(rules, order));
              }
            }
          }
        }
      }
    });
  }
});
