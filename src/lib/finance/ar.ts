import type { Client, Order, Payment } from "@/lib/types";

/**
 * Расчёты с клиентами (дебиторская задолженность).
 *
 * Начисление возникает в момент доставки заказа, срок оплаты — дата доставки
 * плюс отсрочка по договору. Оплаты гасят начисления методом FIFO: самая
 * старая непогашенная накладная закрывается первой. Так же считает
 * бухгалтерия вручную, поэтому цифры сходятся с актом сверки.
 */

export interface LedgerEntry {
  id: string;
  date: string;
  kind: "charge" | "payment";
  title: string;
  /** Начислено (для kind === 'charge'). */
  debit: number;
  /** Оплачено (для kind === 'payment'). */
  credit: number;
  /** Сальдо после этой операции. */
  balance: number;
  orderId?: string;
}

export interface AgingBuckets {
  /** Срок оплаты ещё не наступил. */
  current: number;
  d0_30: number;
  d31_60: number;
  d60plus: number;
}

export interface ClientLedger {
  clientId: string;
  charged: number;
  paid: number;
  balance: number;
  aging: AgingBuckets;
  overdue: number;
  entries: LedgerEntry[];
  ordersCount: number;
  /** Дата самой старой непогашенной накладной. */
  oldestUnpaidDate: string | null;
}

/** Заказ формирует начисление только когда доставлен. */
export function isBillable(order: Order): boolean {
  return order.status === "delivered" && order.deliveredAt !== null;
}

export function chargeDate(order: Order): string {
  return order.deliveredAt ?? order.createdAt;
}

export function dueDate(order: Order, client: Client | undefined): string {
  const base = new Date(chargeDate(order));
  base.setDate(base.getDate() + (client?.paymentTermDays ?? 0));
  return base.toISOString();
}

function emptyAging(): AgingBuckets {
  return { current: 0, d0_30: 0, d31_60: 0, d60plus: 0 };
}

/**
 * Полная карта расчётов с клиентом: лента операций с нарастающим сальдо
 * и разложение долга по срокам просрочки на дату `asOf`.
 */
export function clientLedger(
  clientId: string,
  orders: Order[],
  payments: Payment[],
  client: Client | undefined,
  asOf: Date,
): ClientLedger {
  const charges = orders
    .filter((o) => o.clientId === clientId && isBillable(o))
    .map((o) => ({ order: o, date: chargeDate(o), amount: o.clientCharge, unpaid: o.clientCharge }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const clientPayments = payments
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => a.date.localeCompare(b.date));

  // FIFO-погашение: каждая оплата закрывает самые старые начисления.
  let cursor = 0;
  for (const payment of clientPayments) {
    let rest = payment.amount;
    while (rest > 0 && cursor < charges.length) {
      const applied = Math.min(rest, charges[cursor].unpaid);
      charges[cursor].unpaid -= applied;
      rest -= applied;
      if (charges[cursor].unpaid === 0) cursor += 1;
    }
  }

  const aging = emptyAging();
  let oldestUnpaidDate: string | null = null;
  for (const charge of charges) {
    if (charge.unpaid <= 0) continue;
    if (!oldestUnpaidDate) oldestUnpaidDate = charge.date;
    const due = new Date(dueDate(charge.order, client));
    const overdueDays = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000);
    if (overdueDays <= 0) aging.current += charge.unpaid;
    else if (overdueDays <= 30) aging.d0_30 += charge.unpaid;
    else if (overdueDays <= 60) aging.d31_60 += charge.unpaid;
    else aging.d60plus += charge.unpaid;
  }

  const charged = charges.reduce((sum, c) => sum + c.amount, 0);
  const paid = clientPayments.reduce((sum, p) => sum + p.amount, 0);

  const entries: LedgerEntry[] = [
    ...charges.map((c) => ({
      id: `charge-${c.order.id}`,
      date: c.date,
      kind: "charge" as const,
      title: `Заказ ${c.order.orderNumber}`,
      debit: c.amount,
      credit: 0,
      balance: 0,
      orderId: c.order.id,
    })),
    ...clientPayments.map((p) => ({
      id: `payment-${p.id}`,
      date: p.date,
      kind: "payment" as const,
      title: p.note,
      debit: 0,
      credit: p.amount,
      balance: 0,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "charge" ? -1 : 1));

  let running = 0;
  for (const entry of entries) {
    running += entry.debit - entry.credit;
    entry.balance = running;
  }

  return {
    clientId,
    charged,
    paid,
    balance: charged - paid,
    aging,
    overdue: aging.d0_30 + aging.d31_60 + aging.d60plus,
    entries,
    ordersCount: charges.length,
    oldestUnpaidDate,
  };
}

export function sumAging(buckets: AgingBuckets[]): AgingBuckets {
  return buckets.reduce<AgingBuckets>(
    (acc, b) => ({
      current: acc.current + b.current,
      d0_30: acc.d0_30 + b.d0_30,
      d31_60: acc.d31_60 + b.d31_60,
      d60plus: acc.d60plus + b.d60plus,
    }),
    emptyAging(),
  );
}
