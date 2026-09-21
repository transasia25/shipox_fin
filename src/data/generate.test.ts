import { describe, expect, it } from "vitest";
import { ORDERS, PAYMENTS } from "./generate";
import { hasUntariffedLeg, orderMargin, ordersMargin } from "@/lib/finance/margin";
import { routeBetween, routeDistance } from "./zones";

/**
 * Демо-набор должен показывать все ситуации, ради которых строится платформа.
 * Если генератор перестанет их создавать, экраны потеряют смысл — поэтому это
 * проверяется тестом, а не глазами.
 */

describe("маршрутизация по сети сортировочных центров", () => {
  it("строит цепочку через промежуточные хабы", () => {
    expect(routeBetween("tashkent", "samarkand")).toEqual(["tashkent", "jizzakh", "samarkand"]);
    expect(routeBetween("samarkand", "namangan")).toEqual([
      "samarkand",
      "jizzakh",
      "tashkent",
      "namangan",
    ]);
  });

  it("внутри одного города транзита нет", () => {
    expect(routeBetween("tashkent", "tashkent")).toEqual(["tashkent"]);
    expect(routeDistance("tashkent", "tashkent")).toBe(0);
  });

  it("суммирует расстояние по звеньям", () => {
    expect(routeDistance("tashkent", "samarkand")).toBe(330);
  });
});

describe("демо-набор заказов", () => {
  it("содержит достаточный объём", () => {
    expect(ORDERS.length).toBe(240);
    expect(PAYMENTS.length).toBeGreaterThan(20);
  });

  it("у каждого заказа есть забор и доставка до двери", () => {
    for (const order of ORDERS) {
      expect(order.legs[0].type).toBe("pickup");
      expect(order.legs[order.legs.length - 1].type).toBe("last_mile");
      expect(order.legs.map((l) => l.seq)).toEqual(order.legs.map((_, i) => i + 1));
    }
  });

  it("есть заказы с несколькими транзитными плечами", () => {
    const multiLeg = ORDERS.filter(
      (o) => o.legs.filter((l) => l.type === "linehaul").length >= 2,
    );
    expect(multiLeg.length).toBeGreaterThan(20);
  });

  it("есть внутригородские заказы без транзита", () => {
    const intracity = ORDERS.filter((o) => o.legs.every((l) => l.type !== "linehaul"));
    expect(intracity.length).toBeGreaterThan(20);
  });

  it("есть плечи без подходящего тарифа — их должна увидеть бухгалтерия", () => {
    const untariffed = ORDERS.filter((o) => o.status !== "cancelled" && hasUntariffedLeg(o));
    expect(untariffed.length).toBeGreaterThan(0);
  });

  it("есть убыточные заказы", () => {
    const loss = ORDERS.filter((o) => o.status === "delivered" && orderMargin(o).margin < 0);
    expect(loss.length).toBeGreaterThan(0);
  });

  it("в целом бизнес прибыльный", () => {
    const total = ordersMargin(ORDERS.filter((o) => o.status === "delivered"));
    expect(total.margin).toBeGreaterThan(0);
    expect(total.marginPct).toBeGreaterThan(10);
  });

  it("отменённые заказы не выставляются клиенту и не тарифицируются", () => {
    for (const order of ORDERS.filter((o) => o.status === "cancelled")) {
      expect(order.clientCharge).toBe(0);
      expect(order.legs.every((l) => l.payout === null)).toBe(true);
    }
  });
});

describe("оплаты клиентов", () => {
  it("не превышают начисленное — иначе сальдо стало бы отрицательным", () => {
    for (const client of new Set(PAYMENTS.map((p) => p.clientId))) {
      const charged = ORDERS.filter(
        (o) => o.clientId === client && o.status === "delivered",
      ).reduce((sum, o) => sum + o.clientCharge, 0);
      const paid = PAYMENTS.filter((p) => p.clientId === client).reduce(
        (sum, p) => sum + p.amount,
        0,
      );
      expect(paid).toBeLessThanOrEqual(charged);
    }
  });

  it("оставляют непогашенную задолженность", () => {
    const charged = ORDERS.filter((o) => o.status === "delivered").reduce(
      (sum, o) => sum + o.clientCharge,
      0,
    );
    const paid = PAYMENTS.reduce((sum, p) => sum + p.amount, 0);
    expect(charged - paid).toBeGreaterThan(0);
  });
});
