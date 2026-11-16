import type { TariffZoneMatrix } from "@/lib/backend/types";

type Hub = TariffZoneMatrix["hubs"][number];

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

/** Пояснение к заголовку «Зона N» в таблице цен. */
export function zoneHint(matrix: TariffZoneMatrix | null, zone: number): ZoneHint {
  if (zone === 0) {
    return {
      title: "Зона 0 — внутри одного хаба",
      lines: [
        "Отправитель и получатель относятся к одному хабу: сам город-хаб и районы при нём.",
        "Например, Ташкент → Ташкент или Ташкент → Чирчик.",
      ],
    };
  }

  const lines: string[] = [];
  const reference = matrix ? referenceHub(matrix) : null;
  if (matrix && reference) {
    const destinations = destinationsByZone(matrix, reference.id).get(zone) ?? [];
    if (destinations.length > 0) {
      lines.push(`Из ${reference.name}: ${destinations.map((hub) => hub.name).join(", ")}.`);
    } else {
      const hubName = new Map(matrix.hubs.map((hub) => [hub.id, hub.name]));
      const examples = matrix.cells
        .filter((cell) => cell.zone === zone)
        .slice(0, 3)
        .map((cell) => `${hubName.get(cell.fromHubId)} → ${hubName.get(cell.toHubId)}`);
      if (examples.length > 0) lines.push(`Например: ${examples.join(", ")}.`);
    }
  }
  lines.push("Зона зависит от хабов отправителя и получателя: чем больше номер, тем дальше.");
  return { title: `Зона ${zone}`, lines };
}

export interface ZoneIssues {
  /** Пары, где «туда» и «обратно» — разные зоны, а значит, и разная цена. */
  asymmetric: Array<{ a: string; b: string; there: number; back: number }>;
  /** Хабы, для которых в матрице нет ни одной зоны: заказы через них по зонам не посчитаются. */
  withoutZones: string[];
}

/** Что в матрице выглядит как ошибка заполнения. */
export function zoneIssues(matrix: TariffZoneMatrix): ZoneIssues {
  const zoneOf = new Map(matrix.cells.map((cell) => [`${cell.fromHubId}|${cell.toHubId}`, cell.zone]));
  const asymmetric: ZoneIssues["asymmetric"] = [];
  for (const [index, a] of matrix.hubs.entries()) {
    for (const b of matrix.hubs.slice(index + 1)) {
      const there = zoneOf.get(`${a.id}|${b.id}`);
      const back = zoneOf.get(`${b.id}|${a.id}`);
      if (there !== undefined && back !== undefined && there !== back) {
        asymmetric.push({ a: a.name, b: b.name, there, back });
      }
    }
  }
  const withZones = new Set(matrix.cells.flatMap((cell) => [cell.fromHubId, cell.toHubId]));
  const withoutZones = matrix.hubs.filter((hub) => !withZones.has(hub.id)).map((hub) => hub.name);
  return { asymmetric, withoutZones };
}
