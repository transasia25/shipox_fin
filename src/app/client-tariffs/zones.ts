import type { TariffZoneMatrix } from "@/lib/backend/types";

type Hub = TariffZoneMatrix["hubs"][number];

/** Зона маршрута «хаб → хаб» по матрице; `undefined` — зоны нет. */
export type ZoneLookup = (fromHubId: number, toHubId: number) => number | undefined;

export function zoneLookup(matrix: TariffZoneMatrix): ZoneLookup {
  const zoneOf = new Map(matrix.cells.map((cell) => [`${cell.fromHubId}|${cell.toHubId}`, cell.zone]));
  return (fromHubId, toHubId) => zoneOf.get(`${fromHubId}|${toHubId}`);
}

/** Хаб, от которого удобнее всего объяснять зоны: Ташкент, если он есть. */
export function referenceHub(matrix: TariffZoneMatrix): Hub | null {
  return matrix.hubs.find((hub) => /tashkent|toshkent|ташкент/i.test(hub.name)) ?? matrix.hubs[0] ?? null;
}

/** Куда из хаба `fromHubId` в какой зоне: зона → хабы назначения. */
export function destinationsByZone(matrix: TariffZoneMatrix, fromHubId: number): Map<number, Hub[]> {
  const hubById = new Map(matrix.hubs.map((hub) => [hub.id, hub]));
  const result = new Map<number, Hub[]>();
  for (const cell of matrix.cells) {
    if (cell.fromHubId !== fromHubId) continue;
    const hub = hubById.get(cell.toHubId);
    if (!hub) continue;
    result.set(cell.zone, [...(result.get(cell.zone) ?? []), hub]);
  }
  for (const hubs of result.values()) hubs.sort((a, b) => a.name.localeCompare(b.name));
  return new Map([...result.entries()].sort(([a], [b]) => a - b));
}

export interface ZoneHint {
  title: string;
  lines: string[];
}

/** «Nukus», «Nukus или Termez», «Andijan, Fergana или Samarkand». */
function joinOr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} или ${items[items.length - 1]}`;
}

const ZONE_ORDER_NOTE = "Зона зависит от хабов отправителя и получателя: чем больше номер, тем дальше.";

const ZONE_ZERO_HINT: ZoneHint = {
  title: "Зона 0 — внутри одного хаба",
  lines: [
    "Отправитель и получатель относятся к одному хабу: сам город-хаб и районы при нём.",
    "Например, Ташкент → Ташкент или Ташкент → Чирчик.",
  ],
};

/**
 * Пояснения к заголовкам «Зона N» в таблице цен — сразу для всех зон таблицы,
 * чтобы матрица разбиралась один раз, а не на каждый заголовок.
 */
export function zoneHints(matrix: TariffZoneMatrix | null, zones: number[]): Map<number, ZoneHint> {
  const hints = new Map<number, ZoneHint>();
  const reference = matrix ? referenceHub(matrix) : null;
  const lookup = matrix ? zoneLookup(matrix) : null;
  const byZone = matrix && reference ? destinationsByZone(matrix, reference.id) : new Map<number, Hub[]>();
  const hubName = new Map(matrix?.hubs.map((hub) => [hub.id, hub.name]) ?? []);

  for (const zone of zones) {
    if (zone === 0) {
      hints.set(zone, ZONE_ZERO_HINT);
      continue;
    }
    const lines: string[] = [];
    const destinations = byZone.get(zone) ?? [];
    if (reference && lookup && destinations.length > 0) {
      lines.push(`Например, из ${reference.name} в ${joinOr(destinations.map((hub) => hub.name))}.`);
      // Обратный путь может оказаться в другой зоне или без зоны — это ошибки
      // матрицы, но цену они меняют, поэтому говорим о них прямо здесь.
      for (const hub of destinations) {
        const back = lookup(hub.id, reference.id);
        if (back === undefined) {
          lines.push(`Обратно, из ${hub.name} в ${reference.name}, зоны нет — такой заказ по зонам не посчитается.`);
        } else if (back !== zone) {
          lines.push(`Обратно, из ${hub.name} в ${reference.name}, — зона ${back}.`);
        }
      }
    } else if (matrix) {
      const examples = matrix.cells
        .filter((cell) => cell.zone === zone && hubName.has(cell.fromHubId) && hubName.has(cell.toHubId))
        .slice(0, 3)
        .map((cell) => `${hubName.get(cell.fromHubId)} → ${hubName.get(cell.toHubId)}`);
      if (examples.length > 0) lines.push(`Например: ${examples.join(", ")}.`);
    }
    lines.push(ZONE_ORDER_NOTE);
    hints.set(zone, { title: `Зона ${zone}`, lines });
  }
  return hints;
}

export interface ZoneIssues {
  /** Пары, где «туда» и «обратно» — разные зоны, а значит, и разная цена. */
  asymmetric: Array<{ a: string; b: string; there: number; back: number }>;
  /** Направления между хабами из матрицы, для которых зоны нет: такие заказы не посчитаются. */
  missing: Array<{ from: string; to: string }>;
  /** Хабы, для которых в матрице нет ни одной зоны: заказы через них по зонам не посчитаются. */
  withoutZones: string[];
}

/** Что в матрице выглядит как ошибка заполнения. */
export function zoneIssues(matrix: TariffZoneMatrix): ZoneIssues {
  const lookup = zoneLookup(matrix);
  const withZones = new Set(matrix.cells.flatMap((cell) => [cell.fromHubId, cell.toHubId]));
  const covered = matrix.hubs.filter((hub) => withZones.has(hub.id));

  const asymmetric: ZoneIssues["asymmetric"] = [];
  const missing: ZoneIssues["missing"] = [];
  for (const [index, a] of covered.entries()) {
    if (lookup(a.id, a.id) === undefined) missing.push({ from: a.name, to: a.name });
    for (const b of covered.slice(index + 1)) {
      const there = lookup(a.id, b.id);
      const back = lookup(b.id, a.id);
      if (there === undefined) missing.push({ from: a.name, to: b.name });
      if (back === undefined) missing.push({ from: b.name, to: a.name });
      if (there !== undefined && back !== undefined && there !== back) {
        asymmetric.push({ a: a.name, b: b.name, there, back });
      }
    }
  }
  const withoutZones = matrix.hubs.filter((hub) => !withZones.has(hub.id)).map((hub) => hub.name);
  return { asymmetric, missing, withoutZones };
}
