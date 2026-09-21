"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getOrder, listClients, listCouriers, listOrders, listPayments } from "@/api";
import type { OrderFilter } from "@/api/orders";
import { useAsync } from "@/hooks/use-async";
import { useFinanceStore, type RecalcOverrides } from "@/lib/store";
import type { Client, Courier, Order, Payment } from "@/lib/types";

/**
 * Хуки данных для экранов.
 *
 * Начисления по плечам приходят из данных замороженными. Если бухгалтер
 * пересчитал заказ по новым тарифам, поверх накладывается сохранённый в сторе
 * результат пересчёта — так экраны всегда показывают актуальные суммы, но
 * закрытые периоды не переписываются молча.
 */

function applyOverrides(orders: Order[], overrides: RecalcOverrides): Order[] {
  if (Object.keys(overrides).length === 0) return orders;
  return orders.map((order) => {
    const patch = overrides[order.id];
    if (!patch) return order;
    return {
      ...order,
      legs: order.legs.map((leg) => (leg.id in patch ? { ...leg, payout: patch[leg.id] } : leg)),
    };
  });
}

/**
 * Стор гидратируется вручную, чтобы серверный и первый клиентский рендер
 * совпали. Флаг берётся у самого стора, а не заводится отдельным состоянием:
 * лишний setState в эффекте вызывал бы каскадный рендер на каждом экране.
 */
export function useStoreHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (onChange) => useFinanceStore.persist.onFinishHydration(onChange),
    () => useFinanceStore.persist.hasHydrated(),
    () => false,
  );

  useEffect(() => {
    if (!hydrated) void useFinanceStore.persist.rehydrate();
  }, [hydrated]);

  return hydrated;
}

export function useOrders(filter: OrderFilter = {}) {
  const overrides = useFinanceStore((s) => s.overrides);
  const key = JSON.stringify(filter);
  const { data, loading } = useAsync<Order[]>(() => listOrders(filter), [key], []);
  const orders = useMemo(() => applyOverrides(data, overrides), [data, overrides]);
  return { orders, loading };
}

export function useOrder(id: string) {
  const overrides = useFinanceStore((s) => s.overrides);
  const { data, loading } = useAsync<Order | null>(() => getOrder(id), [id], null);
  const order = useMemo(() => (data ? applyOverrides([data], overrides)[0] : null), [data, overrides]);
  return { order, loading };
}

export function useClients() {
  const { data, loading } = useAsync<Client[]>(() => listClients(), [], []);
  return { clients: data, loading };
}

export function useCouriers() {
  const { data, loading } = useAsync<Courier[]>(() => listCouriers(), [], []);
  return { couriers: data, loading };
}

export function usePayments(clientId?: string) {
  const { data, loading } = useAsync<Payment[]>(() => listPayments(clientId), [clientId], []);
  return { payments: data, loading };
}

/** Справочники «по id» — постоянно нужны в таблицах. */
export function useLookups() {
  const { clients } = useClients();
  const { couriers } = useCouriers();
  return useMemo(
    () => ({
      clientsById: new Map(clients.map((c) => [c.id, c])),
      couriersById: new Map(couriers.map((c) => [c.id, c])),
      clients,
      couriers,
    }),
    [clients, couriers],
  );
}
