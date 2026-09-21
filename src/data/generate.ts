import { calcLegPayout } from "@/lib/tariff/engine";
import type { Courier, Leg, Order, OrderStatus, Payment, PaymentMethod } from "@/lib/types";
import { CLIENTS } from "./clients";
import { COURIERS, COURIERS_BY_ID } from "./couriers";
import { TARIFF_RULES } from "./tariff-rules";
import { CITIES, cityIdOf, districtsOf, linkDistance, routeBetween } from "./zones";

/**
 * Генератор демо-данных.
 *
 * Полностью детерминирован (seeded PRNG), поэтому сервер и клиент получают
 * одинаковый набор — при рендере не возникает расхождений. Данные привязаны к
 * сегодняшней дате по UTC, чтобы демонстрация всегда выглядела актуальной.
 *
 * Начисления по плечам «замораживаются» в момент генерации — так же, как в
 * реальном учёте: изменение тарифа не переписывает прошлые начисления задним
 * числом, для этого есть явная операция пересчёта.
 */

/** mulberry32 — короткий детерминированный PRNG. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return function random(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const now = new Date();
/** Полночь сегодняшнего дня по UTC — общая точка отсчёта для всех дат. */
export const DATA_ANCHOR = new Date(
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
);

/** Глубина истории демо-данных, дней. */
export const HISTORY_DAYS = 120;

function shiftDays(base: Date, days: number, hours = 0, minutes = 0): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

const STREETS = [
  "ул. Амира Темура",
  "ул. Бунёдкор",
  "ул. Мустакиллик",
  "ул. Навои",
  "ул. Шота Руставели",
  "ул. Фаробий",
  "ул. Кичик халка йули",
  "ул. Бабура",
  "ул. Осиё",
  "ул. Чинобод",
];

const RECEIVER_NAMES = [
  "Азиза Рахимова",
  "Бахтиёр Салимов",
  "Гулнора Юсупова",
  "Дилноза Каримова",
  "Жахонгир Аминов",
  "Зухра Тошева",
  "Илхом Рустамов",
  "Камола Насырова",
  "Лазиз Хакимов",
  "Малика Ибрагимова",
  "Нодир Шарипов",
  "Озода Мирзаева",
  "Пулат Ниязов",
  "Рано Атаева",
  "Сардор Кучкаров",
];

/** Коэффициент цены по договору. Ниже 1 — клиент с сильной скидкой. */
const CLIENT_PRICE_FACTOR: Record<string, number> = {
  "cl-01": 1.0,
  "cl-02": 0.92,
  "cl-03": 1.08,
  "cl-04": 0.86,
  "cl-05": 1.02,
  "cl-06": 0.9,
  "cl-07": 0.72, // крупный клиент с агрессивной скидкой — источник убыточных заказов
  "cl-08": 1.1,
  "cl-09": 0.95,
  "cl-10": 1.05,
  "cl-11": 0.88,
  "cl-12": 1.0,
};

/** Доля объёма, приходящаяся на клиента. Первые клиенты крупнее. */
const CLIENT_WEIGHTS = [16, 14, 11, 9, 8, 8, 7, 6, 6, 5, 5, 5];

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

function pickWeighted<T>(random: () => number, items: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

/** Цена для клиента: тариф компании, не связанный с выплатами курьерам. */
function clientPrice(
  clientId: string,
  intracity: boolean,
  routeKm: number,
  weightKg: number,
  places: number,
): number {
  const base = intracity ? 35_000 : 48_000 + 45 * routeKm;
  const weightPart = (intracity ? 1_800 : 2_200) * Math.max(0, weightKg - 5);
  const placesPart = (intracity ? 6_000 : 7_000) * (places - 1);
  const raw = (base + weightPart + placesPart) * (CLIENT_PRICE_FACTOR[clientId] ?? 1);
  return Math.round(raw / 500) * 500;
}

/** Курьеры, доступные в городе: сначала местные, иначе — ташкентские. */
function cityCouriers(cityId: string): Courier[] {
  const local = COURIERS.filter((c) => c.kind === "courier" && c.homeZoneId === cityId && c.active);
  return local.length > 0 ? local : COURIERS.filter((c) => c.kind === "courier" && c.homeZoneId === "tashkent");
}

const DRIVERS = COURIERS.filter((c) => c.kind === "driver" && c.active);

function buildLegs(
  random: () => number,
  orderId: string,
  fromZoneId: string,
  toZoneId: string,
  createdAt: Date,
  completed: boolean,
): { legs: Leg[]; finishedAt: Date } {
  const fromCity = cityIdOf(fromZoneId);
  const toCity = cityIdOf(toZoneId);
  const route = routeBetween(fromCity, toCity);

  const legs: Leg[] = [];
  let seq = 1;
  let cursor = shiftDays(createdAt, 0, randomInt(random, 10, 17), randomInt(random, 0, 59));

  const push = (leg: Omit<Leg, "id" | "orderId" | "seq" | "payout">) => {
    legs.push({
      id: `${orderId}-L${seq}`,
      orderId,
      seq,
      payout: null,
      ...leg,
    });
    seq += 1;
  };

  // 1. Забор у отправителя и сдача в сортировочный центр города отправления.
  const pickupCourier = pick(random, cityCouriers(fromCity));
  const pickupStart = cursor;
  cursor = new Date(cursor.getTime() + randomInt(random, 60, 210) * 60_000);
  push({
    type: "pickup",
    courierId: pickupCourier.id,
    fromZoneId,
    toZoneId: fromCity,
    distanceKm: randomInt(random, 4, 22),
    startedAt: pickupStart.toISOString(),
    completedAt: completed ? cursor.toISOString() : null,
    status: completed ? "completed" : "in_progress",
  });

  // 2. Междугородние транзитные плечи между сортировочными центрами.
  for (let i = 0; i < route.length - 1; i += 1) {
    const driver = pick(random, DRIVERS);
    const start = new Date(cursor.getTime() + randomInt(random, 4, 14) * 3_600_000);
    const km = linkDistance(route[i], route[i + 1]);
    const end = new Date(start.getTime() + (km / 60) * 3_600_000 + randomInt(random, 30, 120) * 60_000);
    cursor = end;
    push({
      type: "linehaul",
      courierId: driver.id,
      fromZoneId: route[i],
      toZoneId: route[i + 1],
      distanceKm: km,
      startedAt: start.toISOString(),
      completedAt: completed ? end.toISOString() : null,
      status: completed ? "completed" : "in_progress",
    });
  }

  // 3. Доставка до двери получателя.
  const lastMileCourier = pick(random, cityCouriers(toCity));
  const lastStart = new Date(cursor.getTime() + randomInt(random, 2, 20) * 3_600_000);
  const lastEnd = new Date(lastStart.getTime() + randomInt(random, 40, 180) * 60_000);
  push({
    type: "last_mile",
    courierId: lastMileCourier.id,
    fromZoneId: toCity,
    toZoneId,
    distanceKm: randomInt(random, 3, 25),
    startedAt: lastStart.toISOString(),
    completedAt: completed ? lastEnd.toISOString() : null,
    status: completed ? "completed" : "planned",
  });

  return { legs, finishedAt: lastEnd };
}

function generateOrders(count: number): Order[] {
  const random = makeRandom(20260907);
  const orders: Order[] = [];
  const clientIds = CLIENTS.map((c) => c.id);
  const cityIds = CITIES.map((c) => c.id);
  // Ташкент — основной узел: большинство отправлений начинается там.
  const cityWeights = cityIds.map((id) => (id === "tashkent" ? 45 : 8));

  for (let i = 0; i < count; i += 1) {
    const id = `ord-${String(i + 1).padStart(4, "0")}`;
    const clientId = pickWeighted(random, clientIds, CLIENT_WEIGHTS);

    const fromCity = pickWeighted(random, cityIds, cityWeights);
    const intracity = random() < 0.35;
    const toCity = intracity
      ? fromCity
      : pickWeighted(
          random,
          cityIds.filter((c) => c !== fromCity),
          cityWeights.filter((_, idx) => cityIds[idx] !== fromCity),
        );

    const fromZoneId = pick(random, districtsOf(fromCity)).id;
    const toDistricts = districtsOf(toCity).filter((d) => d.id !== fromZoneId);
    const toZoneId = (toDistricts.length > 0 ? pick(random, toDistricts) : pick(random, districtsOf(toCity))).id;

    // Вес: основная масса — мелкие отправления, немного тяжёлых и единичный крупногабарит.
    const weightRoll = random();
    const weightKg =
      weightRoll < 0.78
        ? Math.round((0.5 + random() * 14) * 10) / 10
        : weightRoll < 0.93
          ? Math.round((15 + random() * 15) * 10) / 10
          : weightRoll < 0.96
            ? Math.round((30 + random() * 45) * 10) / 10
            : Math.round((85 + random() * 70) * 10) / 10;

    const places = weightKg > 30 ? randomInt(random, 2, 6) : randomInt(random, 1, 3);
    const volumeM3 = Math.round(weightKg * (0.004 + random() * 0.004) * 1000) / 1000;

    const daysAgo = randomInt(random, 0, HISTORY_DAYS);
    const createdAt = shiftDays(DATA_ANCHOR, -daysAgo, randomInt(random, 8, 16), randomInt(random, 0, 59));

    // Свежие заказы ещё в пути, старые — закрыты. Немного возвратов и отмен.
    const statusRoll = random();
    let status: OrderStatus;
    if (daysAgo <= 1) status = statusRoll < 0.45 ? "created" : "in_transit";
    else if (daysAgo <= 4) status = statusRoll < 0.3 ? "in_transit" : "delivered";
    else if (statusRoll < 0.025) status = "returned";
    else if (statusRoll < 0.04) status = "cancelled";
    else status = "delivered";

    const completed = status === "delivered" || status === "returned";
    const { legs, finishedAt } = buildLegs(random, id, fromZoneId, toZoneId, createdAt, completed);

    const routeKm = legs
      .filter((leg) => leg.type === "linehaul")
      .reduce((sum, leg) => sum + leg.distanceKm, 0);

    const order: Order = {
      id,
      shipoxId: String(7_400_000 + i * 13),
      orderNumber: `SPX-${String(100_000 + i * 7)}`,
      clientId,
      createdAt: createdAt.toISOString(),
      deliveredAt: status === "delivered" ? finishedAt.toISOString() : null,
      status,
      fromZoneId,
      toZoneId,
      fromAddress: `${pick(random, STREETS)}, ${randomInt(random, 1, 140)}`,
      toAddress: `${pick(random, STREETS)}, ${randomInt(random, 1, 140)}, кв. ${randomInt(random, 1, 90)}`,
      receiverName: pick(random, RECEIVER_NAMES),
      weightKg,
      places,
      volumeM3,
      codAmount: random() < 0.4 ? Math.round((100_000 + random() * 3_000_000) / 1_000) * 1_000 : 0,
      clientCharge: clientPrice(clientId, intracity, routeKm, weightKg, places),
      currency: "UZS",
      legs,
    };

    // Замораживаем начисления по действующим на момент выполнения правилам.
    order.legs = order.legs.map((leg) => ({
      ...leg,
      payout: calcLegPayout(leg, order, COURIERS_BY_ID.get(leg.courierId), TARIFF_RULES),
    }));

    // Отменённые заказы не тарифицируются и не выставляются клиенту.
    if (status === "cancelled") {
      order.clientCharge = 0;
      order.legs = order.legs.map((leg) => ({ ...leg, payout: null, status: "planned" as const }));
    }

    orders.push(order);
  }

  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const ORDERS: Order[] = generateOrders(240);

/**
 * Оплаты клиентов. Каждый клиент гасит долг с задержкой и не полностью —
 * так в дебиторке появляются реальные корзины просрочки.
 */
function generatePayments(orders: Order[]): Payment[] {
  const random = makeRandom(778_899);
  const payments: Payment[] = [];
  const methods: PaymentMethod[] = ["bank", "bank", "bank", "card", "cash"];

  for (const client of CLIENTS) {
    const clientOrders = orders
      .filter((o) => o.clientId === client.id && o.status === "delivered")
      .sort((a, b) => (a.deliveredAt ?? "").localeCompare(b.deliveredAt ?? ""));
    if (clientOrders.length === 0) continue;

    const charged = clientOrders.reduce((sum, o) => sum + o.clientCharge, 0);
    // Платёжная дисциплина: от 0,45 (проблемный клиент) до 1,0 (платит вовремя).
    const discipline = 0.45 + random() * 0.55;
    const target = charged * discipline;

    let paid = 0;
    let index = 0;
    while (paid < target && index < 40) {
      const chunk = Math.min(target - paid, charged * (0.08 + random() * 0.18));
      if (chunk < 50_000) break;
      const daysAgo = Math.round(HISTORY_DAYS * (1 - (paid + chunk) / Math.max(charged, 1)) * 0.9) + randomInt(random, 0, 6);
      const date = shiftDays(DATA_ANCHOR, -Math.max(0, daysAgo), randomInt(random, 9, 18), randomInt(random, 0, 59));
      payments.push({
        id: `pay-${client.id}-${index + 1}`,
        clientId: client.id,
        date: date.toISOString(),
        amount: Math.round(chunk / 1_000) * 1_000,
        method: pick(random, methods),
        note: `Оплата по договору ${client.contractNo}`,
      });
      paid += chunk;
      index += 1;
    }
  }

  return payments.sort((a, b) => b.date.localeCompare(a.date));
}

export const PAYMENTS: Payment[] = generatePayments(ORDERS);
