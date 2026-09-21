import type { Leg, Order } from "@/lib/types";

/** Маржинальность заказа: сколько осталось компании после выплат исполнителям. */

export interface OrderMargin {
  /** Сколько должен заплатить клиент. */
  revenue: number;
  /** Сумма начислений по всем плечам. */
  payouts: number;
  /** revenue − payouts. */
  margin: number;
  /** Маржа в процентах от выручки. */
  marginPct: number;
  /** Есть плечи, для которых не нашлось правила тарифа. */
  hasUntariffedLeg: boolean;
}

export function legPayoutAmount(leg: Leg): number {
  return leg.payout?.amount ?? 0;
}

export function legsTotal(legs: Leg[]): number {
  return legs.reduce((sum, leg) => sum + legPayoutAmount(leg), 0);
}

export function hasUntariffedLeg(order: Order): boolean {
  return order.legs.some((leg) => leg.payout === null);
}

export function orderMargin(order: Order): OrderMargin {
  const revenue = order.clientCharge;
  const payouts = legsTotal(order.legs);
  const margin = revenue - payouts;
  return {
    revenue,
    payouts,
    margin,
    marginPct: revenue === 0 ? 0 : (margin / revenue) * 100,
    hasUntariffedLeg: hasUntariffedLeg(order),
  };
}

/** Сводка по набору заказов — для дашборда и шапок таблиц. */
export function ordersMargin(orders: Order[]): OrderMargin {
  const revenue = orders.reduce((sum, o) => sum + o.clientCharge, 0);
  const payouts = orders.reduce((sum, o) => sum + legsTotal(o.legs), 0);
  const margin = revenue - payouts;
  return {
    revenue,
    payouts,
    margin,
    marginPct: revenue === 0 ? 0 : (margin / revenue) * 100,
    hasUntariffedLeg: orders.some(hasUntariffedLeg),
  };
}
