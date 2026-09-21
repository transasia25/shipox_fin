import type { CourierLeg, CourierPayoutStatus, CourierRateKind } from "@/lib/backend/types";

/** Подписи для начислений курьерам — одни и те же на всех экранах. */

export const LEG_LABEL: Record<CourierLeg, string> = {
  PICKUP: "Забор",
  DELIVERY: "Доставка",
};

export const RATE_KIND_LABEL: Record<CourierRateKind, string> = {
  CITY: "город",
  DISTRICT: "район",
  HEAVY: "тяжёлый",
};

/** Почему у начисления нет суммы. */
export const PAYOUT_STATUS_LABEL: Record<CourierPayoutStatus, string> = {
  CALCULATED: "начислено",
  CITY_NOT_FOUND: "города нет в справочнике",
  NOT_PAYABLE: "служебная учётка",
  NO_TARIFF: "нет тарифа на дату",
};

/** Город начисления: у района — ещё и хаб, к которому он относится. */
export function payoutCityLabel(payout: {
  city: string | null;
  hubName: string | null;
  rateKind: CourierRateKind | null;
}): string {
  if (!payout.city) return "город не указан";
  return payout.rateKind === "DISTRICT" && payout.hubName
    ? `${payout.city} (район, хаб ${payout.hubName})`
    : payout.city;
}

export const PAYOUT_SOURCE_LABEL = {
  RECEIPT: "по приёмке на складе",
  SHIPOX: "по данным Shipox",
} as const;

/**
 * Приёмка, которая считается забором, — то же правило, что в расчёте
 * начислений: приёмка на складе забора, иначе самая ранняя.
 */
export function pickupReceipt<T extends { warehouse: string; receivedAt: string; cancelledAt?: string | null }>(
  receipts: T[],
  pickUpWarehouse: string | null,
): T | null {
  const active = receipts
    .filter((receipt) => !receipt.cancelledAt)
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  return active.find((receipt) => receipt.warehouse === pickUpWarehouse) ?? active[0] ?? null;
}
