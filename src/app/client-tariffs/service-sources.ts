import type { NewTariffServiceSource, TariffVersionDetail } from "@/lib/backend/types";
import { formatNumber, formatPrice } from "@/lib/format";
import { parseMoney } from "./price-editing";
import { signedPrice, surchargeWeightLabel } from "./surcharge-lines";

/**
 * Цены нового тарифа по услугам: для каждой услуги — откуда её цены.
 * Чистая логика окна «Новый тариф клиента», без React.
 */

/** Откуда цены услуги. */
export type SourceChoice =
  | { kind: "PLAN"; versionId: number }
  | { kind: "PER_KG" }
  | { kind: "PER_ORDER" }
  | { kind: "NONE" };

/** Строка услуги, как её заполняют в окне. */
export interface ServiceRow {
  serviceTypeId: number;
  choice: SourceChoice;
  /** Своя цена: за кг — для PER_KG, за заказ — для PER_ORDER. */
  rateText: string;
  /** Новая доплата за кг сверх последнего веса — для PLAN; пусто — как в плане. */
  overMaxText: string;
  /** Брать доплаты и скидки: для PLAN — этого плана, для своей цены — нынешнего плана клиента. */
  surcharges: boolean;
}

/** Источник цен услуги — в том виде, в каком его ждёт сервер. */
export type ServiceSourceInput = NewTariffServiceSource;

/** Есть ли в плане цены для услуги: свои или «для любой услуги». */
export function planHasService(detail: TariffVersionDetail, serviceTypeId: number): boolean {
  const ids = [...detail.zoneGrids.map((grid) => grid.serviceTypeId), ...detail.routeRules.map((rule) => rule.serviceTypeId)];
  return ids.some((id) => id === null || id === serviceTypeId);
}

/** Строки по умолчанию: всё как сейчас; услуг, которых в нынешнем плане нет, нет и в новом. */
export function defaultRows(current: TariffVersionDetail): ServiceRow[] {
  return [...current.serviceTypes]
    .sort((a, b) => a.id - b.id)
    .map((type) => ({
      serviceTypeId: type.id,
      choice: planHasService(current, type.id)
        ? { kind: "PLAN", versionId: current.versionId }
        : { kind: "NONE" },
      rateText: "",
      overMaxText: "",
      surcharges: planHasService(current, type.id),
    }));
}

/** Последняя строка веса и доплата за кг сверх неё — у услуги в плане, например «свыше 20 кг: 5 000». */
export function overMaxInfo(
  detail: TariffVersionDetail,
  serviceTypeId: number,
): { weight: number; current: string } | null {
  const grids = detail.zoneGrids.filter((grid) => grid.serviceTypeId === serviceTypeId || grid.serviceTypeId === null);
  const weights = new Set<number>();
  const extras = new Set<number>();
  for (const grid of grids) {
    const last = grid.rows[grid.rows.length - 1];
    if (!last) continue;
    weights.add(last.weightFrom);
    for (const cell of last.cells) if (cell && !cell.perUnit) extras.add(cell.extraPerKg);
  }
  if (weights.size !== 1 || extras.size === 0) return null;
  const list = [...extras].sort((a, b) => a - b);
  return {
    weight: [...weights][0],
    current:
      list.length === 1
        ? `${formatPrice(list[0])} за кг`
        : `от ${formatPrice(list[0])} до ${formatPrice(list[list.length - 1])} за кг`,
  };
}

/** Доплаты и скидки плана, которые касаются услуги, по-человечески: «−10%, от 41 кг». */
export function surchargeLines(detail: TariffVersionDetail, serviceTypeId: number): string[] {
  return detail.surcharges
    .filter((item) => item.serviceTypeId === null || item.serviceTypeId === serviceTypeId)
    .map((item) => {
      const amount =
        item.amountType === "PERCENT"
          ? `${item.amount < 0 ? "−" : "+"}${formatNumber(Math.abs(item.amount))}%`
          : `${signedPrice(item.amount)}${item.amountType === "FIXED" ? "" : " за кг"}`;
      const where = item.toCity ? ` в ${item.toCity}` : item.toIsHub === false ? " в район" : "";
      return `${amount}${where}, ${surchargeWeightLabel(item.weightFrom, item.weightTo)}`;
    });
}

/** Что не так со строкой; `null` — всё в порядке. */
export function rowError(row: ServiceRow, detail: TariffVersionDetail | undefined): string | null {
  if (row.choice.kind === "PER_KG" || row.choice.kind === "PER_ORDER") {
    const rate = parseMoney(row.rateText);
    if (rate !== null && rate > 0) return null;
    return row.choice.kind === "PER_KG" ? "укажите ставку за кг" : "укажите цену за заказ";
  }
  if (row.choice.kind === "PLAN") {
    if (row.overMaxText.trim() !== "" && parseMoney(row.overMaxText) === null) return "доплата за кг — число";
    if (detail && !planHasService(detail, row.serviceTypeId)) return "в этом плане такой услуги нет";
  }
  return null;
}

/** Своя цена строки (за кг или за заказ) — у всех услуг так же, вместе с доплатами. */
export function sameForAll(rows: ServiceRow[], serviceTypeId: number): ServiceRow[] {
  const from = rows.find((row) => row.serviceTypeId === serviceTypeId);
  if (!from) return rows;
  return rows.map((row) => ({ ...row, choice: from.choice, rateText: from.rateText, surcharges: from.surcharges }));
}

/** Все ли услуги посчитаны так же, как эта строка. */
export function allSameAs(rows: ServiceRow[], serviceTypeId: number): boolean {
  const from = rows.find((row) => row.serviceTypeId === serviceTypeId);
  return (
    from !== undefined &&
    rows.every(
      (row) =>
        row.choice.kind === from.choice.kind &&
        parseMoney(row.rateText) === parseMoney(from.rateText) &&
        row.surcharges === from.surcharges,
    )
  );
}

/** Строки окна → запрос серверу. Услуги «нет у клиента» в запрос не попадают. */
export function toServiceSources(rows: ServiceRow[], currentVersionId: number): ServiceSourceInput[] {
  return rows.flatMap((row): ServiceSourceInput[] => {
    if (row.choice.kind === "NONE") return [];
    const surcharges = row.surcharges ? { surchargesFromVersionId: currentVersionId } : {};
    if (row.choice.kind === "PER_KG") {
      return [{ serviceTypeId: row.serviceTypeId, kind: "PER_KG", perKg: parseMoney(row.rateText) ?? 0, ...surcharges }];
    }
    if (row.choice.kind === "PER_ORDER") {
      return [
        { serviceTypeId: row.serviceTypeId, kind: "PER_ORDER", perOrder: parseMoney(row.rateText) ?? 0, ...surcharges },
      ];
    }
    const overMax = row.overMaxText.trim() === "" ? null : parseMoney(row.overMaxText);
    return [
      {
        serviceTypeId: row.serviceTypeId,
        kind: "PLAN",
        versionId: row.choice.versionId,
        ...(overMax !== null ? { overMaxPerKg: overMax } : {}),
        surcharges: row.surcharges,
      },
    ];
  });
}
