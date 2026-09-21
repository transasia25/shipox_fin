import type { CarrierKind, TransitProblemStatus } from "@/lib/backend/types";

/** Подписи межгорода — одинаковые на всех экранах. */

export const CARRIER_KIND_LABEL: Record<CarrierKind, string> = {
  COMPANY: "ООО",
  ENTREPRENEUR: "ИП",
};

export const TRANSIT_PROBLEM_LABEL: Record<TransitProblemStatus, string> = {
  NO_WAREHOUSE: "не заполнен склад отправления или назначения",
  NO_ROUTE: "склад не стоит ни на одном направлении",
};

/**
 * Короткое имя склада: «01 - 001 TASHKENT  WAREHOUSE» → «TASHKENT».
 * Полное название всё равно показывается подсказкой — по нему плечи и
 * сходятся с Shipox.
 */
export function shortWarehouse(name: string): string {
  return (
    name
      .replace(/^[\d\s-]+/, "")
      .replace(/\s*warehouse\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim() || name
  );
}

/** Плечо одной строкой: «Ташкент → Самарканд». */
export function legLabel(from: string, to: string): string {
  return `${shortWarehouse(from)} → ${shortWarehouse(to)}`;
}
