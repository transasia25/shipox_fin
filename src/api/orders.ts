import { ORDERS } from "@/data/generate";
import type { Order, OrderStatus } from "@/lib/types";
import { hasUntariffedLeg, orderMargin } from "@/lib/finance/margin";
import { cityIdOf } from "@/data/zones";

export interface OrderFilter {
  /** Нижняя граница периода по дате создания заказа, ISO. */
  from?: string;
  /** Верхняя граница периода, ISO. */
  to?: string;
  clientId?: string;
  status?: OrderStatus;
  /** Город отправления или назначения. */
  cityId?: string;
  /** Только убыточные заказы. */
  onlyLoss?: boolean;
  /** Только заказы, где есть плечо без подходящего тарифа. */
  onlyUntariffed?: boolean;
  /** Поиск по номеру заказа, id Shipox или получателю. */
  search?: string;
}

function matchesFilter(order: Order, filter: OrderFilter): boolean {
  if (filter.from && order.createdAt < filter.from) return false;
  if (filter.to && order.createdAt > filter.to) return false;
  if (filter.clientId && order.clientId !== filter.clientId) return false;
  if (filter.status && order.status !== filter.status) return false;
  if (filter.cityId) {
    const from = cityIdOf(order.fromZoneId);
    const to = cityIdOf(order.toZoneId);
    if (from !== filter.cityId && to !== filter.cityId) return false;
  }
  if (filter.onlyUntariffed && !hasUntariffedLeg(order)) return false;
  if (filter.onlyLoss && orderMargin(order).margin >= 0) return false;
  if (filter.search) {
    const needle = filter.search.trim().toLowerCase();
    const haystack = `${order.orderNumber} ${order.shipoxId} ${order.receiverName} ${order.toAddress}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export async function listOrders(filter: OrderFilter = {}): Promise<Order[]> {
  return ORDERS.filter((order) => matchesFilter(order, filter));
}

export async function getOrder(id: string): Promise<Order | null> {
  return ORDERS.find((order) => order.id === id) ?? null;
}

/** Все плечи за период — основа реестров начислений и карточки курьера. */
export async function listLegs(filter: OrderFilter = {}): Promise<Array<{ order: Order; legIndex: number }>> {
  const orders = await listOrders(filter);
  return orders.flatMap((order) => order.legs.map((_, legIndex) => ({ order, legIndex })));
}
