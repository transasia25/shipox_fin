import type { Zone } from "@/lib/types";

/**
 * География: города (они же сортировочные центры) и районы внутри городов.
 * Плечи забора и доставки привязаны к районам, транзитные — к городам.
 */

export const CITIES: Zone[] = [
  { id: "tashkent", name: "Ташкент", kind: "city" },
  { id: "jizzakh", name: "Джизак", kind: "city" },
  { id: "samarkand", name: "Самарканд", kind: "city" },
  { id: "bukhara", name: "Бухара", kind: "city" },
  { id: "namangan", name: "Наманган", kind: "city" },
  { id: "andijan", name: "Андижан", kind: "city" },
  { id: "fergana", name: "Фергана", kind: "city" },
  { id: "urgench", name: "Ургенч", kind: "city" },
  { id: "nukus", name: "Нукус", kind: "city" },
  { id: "termez", name: "Термез", kind: "city" },
];

export const DISTRICTS: Zone[] = [
  { id: "tas-yunusabad", name: "Юнусабадский", kind: "district", parentId: "tashkent" },
  { id: "tas-chilanzar", name: "Чиланзарский", kind: "district", parentId: "tashkent" },
  { id: "tas-mirzo", name: "Мирзо-Улугбекский", kind: "district", parentId: "tashkent" },
  { id: "tas-yashnabad", name: "Яшнабадский", kind: "district", parentId: "tashkent" },
  { id: "tas-sergeli", name: "Сергелийский", kind: "district", parentId: "tashkent" },
  { id: "tas-uchtepa", name: "Учтепинский", kind: "district", parentId: "tashkent" },
  { id: "jiz-center", name: "Джизак-центр", kind: "district", parentId: "jizzakh" },
  { id: "jiz-zafarabad", name: "Зафарабад", kind: "district", parentId: "jizzakh" },
  { id: "sam-siab", name: "Сиабский", kind: "district", parentId: "samarkand" },
  { id: "sam-center", name: "Самарканд-центр", kind: "district", parentId: "samarkand" },
  { id: "buk-center", name: "Бухара-центр", kind: "district", parentId: "bukhara" },
  { id: "buk-kagan", name: "Каган", kind: "district", parentId: "bukhara" },
  { id: "nam-center", name: "Наманган-центр", kind: "district", parentId: "namangan" },
  { id: "nam-chust", name: "Чуст", kind: "district", parentId: "namangan" },
  { id: "and-center", name: "Андижан-центр", kind: "district", parentId: "andijan" },
  { id: "and-asaka", name: "Асака", kind: "district", parentId: "andijan" },
  { id: "fer-center", name: "Фергана-центр", kind: "district", parentId: "fergana" },
  { id: "fer-margilan", name: "Маргилан", kind: "district", parentId: "fergana" },
  { id: "urg-center", name: "Ургенч-центр", kind: "district", parentId: "urgench" },
  { id: "nuk-center", name: "Нукус-центр", kind: "district", parentId: "nukus" },
  { id: "ter-center", name: "Термез-центр", kind: "district", parentId: "termez" },
];

export const ZONES: Zone[] = [...CITIES, ...DISTRICTS];

export const ZONES_BY_ID = new Map(ZONES.map((z) => [z.id, z]));

export function zoneName(id: string): string {
  return ZONES_BY_ID.get(id)?.name ?? id;
}

/** Город, к которому относится зона (для района — родительский город). */
export function cityIdOf(zoneId: string): string {
  const zone = ZONES_BY_ID.get(zoneId);
  if (!zone) return zoneId;
  return zone.kind === "city" ? zone.id : (zone.parentId ?? zone.id);
}

export function cityNameOf(zoneId: string): string {
  return zoneName(cityIdOf(zoneId));
}

export function districtsOf(cityId: string): Zone[] {
  return DISTRICTS.filter((d) => d.parentId === cityId);
}

/**
 * Магистральная сеть: расстояние между соседними сортировочными центрами.
 * Дальние города достигаются через промежуточные хабы — отсюда и берутся
 * заказы с несколькими транзитными плечами.
 */
const LINKS: Array<[string, string, number]> = [
  ["tashkent", "jizzakh", 200],
  ["jizzakh", "samarkand", 130],
  ["samarkand", "bukhara", 280],
  ["samarkand", "termez", 420],
  ["bukhara", "urgench", 460],
  ["bukhara", "nukus", 640],
  ["tashkent", "namangan", 290],
  ["namangan", "andijan", 80],
  ["namangan", "fergana", 70],
];

const LINK_DISTANCE = new Map<string, number>();
for (const [a, b, km] of LINKS) {
  LINK_DISTANCE.set(`${a}|${b}`, km);
  LINK_DISTANCE.set(`${b}|${a}`, km);
}

export function linkDistance(fromCityId: string, toCityId: string): number {
  return LINK_DISTANCE.get(`${fromCityId}|${toCityId}`) ?? 0;
}

/** Маршрут от Ташкента до каждого города по магистральной сети. */
const FROM_TASHKENT: Record<string, string[]> = {
  tashkent: ["tashkent"],
  jizzakh: ["tashkent", "jizzakh"],
  samarkand: ["tashkent", "jizzakh", "samarkand"],
  bukhara: ["tashkent", "jizzakh", "samarkand", "bukhara"],
  termez: ["tashkent", "jizzakh", "samarkand", "termez"],
  urgench: ["tashkent", "jizzakh", "samarkand", "bukhara", "urgench"],
  nukus: ["tashkent", "jizzakh", "samarkand", "bukhara", "nukus"],
  namangan: ["tashkent", "namangan"],
  andijan: ["tashkent", "namangan", "andijan"],
  fergana: ["tashkent", "namangan", "fergana"],
};

/**
 * Цепочка сортировочных центров между двумя городами. Все маршруты в сети
 * проходят через Ташкент, поэтому путь склеивается из двух веток.
 */
export function routeBetween(fromCityId: string, toCityId: string): string[] {
  if (fromCityId === toCityId) return [fromCityId];
  const a = FROM_TASHKENT[fromCityId] ?? ["tashkent", fromCityId];
  const b = FROM_TASHKENT[toCityId] ?? ["tashkent", toCityId];

  // Общий префикс от Ташкента отбрасываем — это точка разветвления.
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  const pivotIndex = common - 1;
  const head = a.slice(pivotIndex).reverse();
  const tail = b.slice(common);
  return [...head, ...tail];
}

/** Общее расстояние маршрута по магистральной сети, км. */
export function routeDistance(fromCityId: string, toCityId: string): number {
  const route = routeBetween(fromCityId, toCityId);
  let total = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    total += linkDistance(route[i], route[i + 1]);
  }
  return total;
}
