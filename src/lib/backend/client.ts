import type {
  Carrier,
  CarrierInput,
  CityRef,
  Courier,
  CourierPayout,
  CourierPayoutRunResult,
  CourierPayoutStatus,
  CourierPayoutSummary,
  CourierTariff,
  CourierTariffInput,
  CourierImportResult,
  TariffCity,
  CourierInput,
  CustomerRef,
  Receipt,
  ReceiptJournalRow,
  ReceiveResult,
  WarehouseRef,
  ExportKind,
  ExportRun,
  Health,
  OrdersStats,
  Page,
  ShipoxOrderDetail,
  PricingProblem,
  PricingRunResult,
  PricingSummary,
  ShipoxOrderRow,
  SyncState,
  UnmatchedClient,
  User,
  UserRole,
  DetachedLeg,
  PendingLeg,
  PendingLegGroup,
  PendingWarehouse,
  ReadyRun,
  TransitDirection,
  TransitLoadResult,
  TransitLoadScan,
  TransitProblem,
  TransitRebuildResult,
  Session,
  TransitRoute,
  TransitScanJournalRow,
  TransitSummary,
  TransitTrip,
  TransitTripDetail,
} from "./types";

/**
 * Доступ к бэкенду.
 *
 * Единственное место во фронтенде, которое знает адреса API. Экраны работают
 * с типизированными функциями и не собирают URL руками.
 */

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(
  /\/+$/,
  "",
);

/** Ошибка запроса с внятным текстом: её показывают прямо на экране. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Параметры строки запроса. Пустые значения в URL не попадают. */
export type Params = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, params?: Params): string {
  const url = new URL(BASE_URL + path);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(path: string, init?: RequestInit & { params?: Params }): Promise<T> {
  const { params, ...rest } = init ?? {};
  let response: Response;

  try {
    response = await fetch(buildUrl(path, params), {
      ...rest,
      // Сессия живёт в куке бэкенда — без этого каждый запрос был бы гостевым.
      credentials: "include",
      // Для файла заголовок с границей частей проставляет сам браузер.
      headers:
        rest.body instanceof FormData
          ? rest.headers
          : { "Content-Type": "application/json", ...rest.headers },
      cache: "no-store",
    });
  } catch {
    // Сеть не ответила вовсе — чаще всего бэкенд просто не запущен.
    throw new ApiError(
      `Бэкенд недоступен по адресу ${BASE_URL}. Запустите его: cd backend && npm run start:dev`,
      0,
    );
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      // Сессия кончилась. Событием, а не прямым вызовом: клиент не должен
      // зависеть от состояния сессии, иначе импорты пойдут по кругу.
      window.dispatchEvent(new CustomEvent("sf:unauthorized"));
    }
    const body = await response.text();
    let message = `${response.status} ${response.statusText}`;
    try {
      const parsed = JSON.parse(body) as { message?: string | string[] };
      if (parsed.message) {
        message = Array.isArray(parsed.message) ? parsed.message.join("; ") : parsed.message;
      }
    } catch {
      if (body) message = body.slice(0, 300);
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

// ─────────────────────────────── Заказы ───────────────────────────────

export interface OrdersQuery extends Params {
  from?: string;
  to?: string;
  status?: string;
  customerId?: string;
  city?: string;
  search?: string;
  /** Только заказы без посчитанной стоимости. */
  unpriced?: boolean;
  /** Только заказы без действующей приёмки на складе. */
  unreceived?: boolean;
  page?: number;
  size?: number;
}

export function listOrders(query: OrdersQuery = {}): Promise<Page<ShipoxOrderRow>> {
  return request("/orders", { params: query });
}

export function getOrder(id: string): Promise<ShipoxOrderDetail> {
  return request(`/orders/${encodeURIComponent(id)}`);
}

export function getOrdersStats(query: OrdersQuery = {}): Promise<OrdersStats> {
  return request("/orders/stats", { params: query });
}

export function listCustomers(query: OrdersQuery = {}): Promise<CustomerRef[]> {
  return request("/orders/customers", { params: query });
}

export function listCities(query: OrdersQuery = {}): Promise<CityRef[]> {
  return request("/orders/cities", { params: query });
}

// ────────────────────────────── Выгрузки ──────────────────────────────

export function listExports(params: { kind?: ExportKind; limit?: number } = {}): Promise<
  ExportRun[]
> {
  return request("/exports", { params });
}

export function runExport(body: { kind: ExportKind; from?: string; to?: string }): Promise<
  ExportRun
> {
  return request("/exports/run", { method: "POST", body: JSON.stringify(body) });
}

/** Прямая ссылка на файл: скачивание идёт браузером, а не через fetch. */
export function exportDownloadUrl(id: string): string {
  return buildUrl(`/exports/${encodeURIComponent(id)}/download`);
}

// ─────────────────────────── Синхронизация ───────────────────────────

export function getSyncState(): Promise<SyncState> {
  return request("/sync/state");
}

export function getHealth(): Promise<Health> {
  return request("/health");
}

export function refreshStale(body: { olderThanDays?: number; limit?: number } = {}) {
  return request<{ status: string; updated: number; fetched: number; failed: number }>(
    "/sync/refresh-stale",
    { method: "POST", body: JSON.stringify(body) },
  );
}

// ─────────────────────── Стоимость доставки ───────────────────────

export interface PricingPeriod extends Params {
  from?: string;
  to?: string;
}

export function getPricingSummary(period: PricingPeriod = {}): Promise<PricingSummary> {
  return request("/pricing/summary", { params: period });
}

export function listUnmatchedClients(): Promise<UnmatchedClient[]> {
  return request("/pricing/unmatched");
}

export function listPricingProblems(
  period: PricingPeriod & { limit?: number } = {},
): Promise<PricingProblem[]> {
  return request("/pricing/problems", { params: period });
}

export function runPricing(
  body: { from?: string; to?: string; force?: boolean } = {},
): Promise<PricingRunResult> {
  return request("/pricing/run", { method: "POST", body: JSON.stringify(body) });
}

// ──────────────────────── Приёмка на складе ────────────────────────

export function listCouriers(
  query: { warehouse?: string; search?: string; active?: boolean } = {},
): Promise<Courier[]> {
  return request("/couriers", { params: query });
}

export function createCourier(body: CourierInput): Promise<Courier> {
  return request("/couriers", { method: "POST", body: JSON.stringify(body) });
}

export function updateCourier(id: string, body: Partial<CourierInput>): Promise<Courier> {
  return request(`/couriers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Загрузка выгрузки водителей Shipox («Driver List for all statuses»). */
export function importCouriers(file: File): Promise<CourierImportResult> {
  const body = new FormData();
  body.append("file", file);
  return request("/couriers/import", { method: "POST", body });
}

// ─────────────────────────── Вход и сотрудники ───────────────────────────

/** Нужна ли первичная настройка: в базе ещё нет ни одного сотрудника. */
export function getAuthState(): Promise<{ needsSetup: boolean }> {
  return request("/auth/state");
}

export function login(body: { login: string; password: string }): Promise<Session> {
  return request("/auth/login", { method: "POST", body: JSON.stringify(body) });
}

/** Первичная настройка: заводит администратора и сразу входит под ним. */
export function setupAdmin(body: {
  login: string;
  name: string;
  password: string;
}): Promise<Session> {
  return request("/auth/setup", { method: "POST", body: JSON.stringify(body) });
}

export function getSession(): Promise<Session> {
  return request("/auth/me");
}

export function logout(): Promise<{ ok: boolean }> {
  return request("/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

export function changeOwnPassword(body: {
  currentPassword: string;
  password: string;
}): Promise<{ ok: boolean }> {
  return request("/auth/password", { method: "POST", body: JSON.stringify(body) });
}

export function listUsers(): Promise<User[]> {
  return request("/users");
}

export function createUser(body: {
  login: string;
  name: string;
  password: string;
  role: UserRole;
  warehouse?: string | null;
}): Promise<User> {
  return request("/users", { method: "POST", body: JSON.stringify(body) });
}

export function updateUser(
  id: string,
  body: { name?: string; role?: UserRole; warehouse?: string | null; active?: boolean },
): Promise<User> {
  return request(`/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function setUserPassword(id: string, password: string): Promise<{ ok: boolean }> {
  return request(`/users/${encodeURIComponent(id)}/password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function listWarehouses(): Promise<WarehouseRef[]> {
  return request("/warehouse/warehouses");
}

export function receiveOrder(body: {
  code: string;
  courierId: string;
  /** Кладовщику подставляется его склад; офис указывает нужный. */
  warehouse?: string;
  replace?: boolean;
}): Promise<ReceiveResult> {
  return request("/warehouse/receipts", { method: "POST", body: JSON.stringify(body) });
}

/** Кто отменяет — известно из сессии, тело пустое. */
export function cancelReceipt(id: string): Promise<Receipt> {
  return request(`/warehouse/receipts/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function listReceipts(
  query: {
    warehouse?: string;
    courierId?: string;
    from?: string;
    to?: string;
    includeCancelled?: boolean;
    limit?: number;
  } = {},
): Promise<ReceiptJournalRow[]> {
  return request("/warehouse/receipts", { params: query });
}

// ──────────────────────── Тариф и начисления курьерам ────────────────────────

export function listCourierTariffs(): Promise<CourierTariff[]> {
  return request("/courier-tariffs");
}

export function createCourierTariff(
  body: CourierTariffInput,
): Promise<{ tariff: CourierTariff; recalculation: CourierPayoutRunResult }> {
  return request("/courier-tariffs", { method: "POST", body: JSON.stringify(body) });
}

export function deleteCourierTariff(id: string): Promise<{ deleted: boolean }> {
  return request(`/courier-tariffs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listTariffCities(search?: string): Promise<TariffCity[]> {
  return request("/courier-tariffs/cities", { params: { search } });
}

export function getCourierPayoutSummary(period: { from?: string; to?: string } = {}): Promise<
  CourierPayoutSummary
> {
  return request("/courier-payouts/summary", { params: period });
}

export function listCourierPayouts(
  query: {
    from?: string;
    to?: string;
    courierId?: string;
    shipoxDriverId?: string;
    status?: CourierPayoutStatus;
    limit?: number;
  } = {},
): Promise<CourierPayout[]> {
  return request("/courier-payouts", { params: query });
}

export function runCourierPayouts(
  body: { from?: string; to?: string; force?: boolean } = {},
): Promise<CourierPayoutRunResult> {
  return request("/courier-payouts/run", { method: "POST", body: JSON.stringify(body) });
}

// ──────────────────────── Межгород: перевозчики ────────────────────────

export function listCarriers(
  query: { search?: string; routeId?: string; active?: boolean } = {},
): Promise<Carrier[]> {
  return request("/carriers", { params: query });
}

export function createCarrier(body: CarrierInput): Promise<Carrier> {
  return request("/carriers", { method: "POST", body: JSON.stringify(body) });
}

export function updateCarrier(id: string, body: Partial<CarrierInput>): Promise<Carrier> {
  return request(`/carriers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listTransitRoutes(): Promise<TransitRoute[]> {
  return request("/transit/routes");
}

export function saveTransitRoute(body: {
  code: string;
  name: string;
  stops: string[];
  active?: boolean;
}): Promise<{ route: TransitRoute; rebuild: TransitRebuildResult }> {
  return request("/transit/routes", { method: "POST", body: JSON.stringify(body) });
}

export function getTransitSummary(
  period: { from?: string; to?: string } = {},
): Promise<TransitSummary> {
  return request("/transit/summary", { params: period });
}

export function listPendingLegGroups(
  period: { from?: string; to?: string } = {},
): Promise<PendingLegGroup[]> {
  return request("/transit/pending/legs", { params: period });
}

export function listPendingLegs(query: {
  routeId: string;
  direction: TransitDirection;
  /** Склад погрузки: только заказы, которые едут отсюда, и отметки сканера по ним. */
  warehouse?: string;
  scanned?: boolean;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<PendingLeg[]> {
  return request("/transit/pending", { params: query });
}

/** Где ждёт груз одного рейса: по складам погрузки, в порядке движения. */
export function listPendingWarehouses(query: {
  routeId: string;
  direction: TransitDirection;
}): Promise<PendingWarehouse[]> {
  return request("/transit/pending/warehouses", { params: query });
}

/** Скан коробки, уезжающей с этого склада межгородней машиной. */
export function scanTransitLoad(body: {
  code: string;
  warehouse?: string;
}): Promise<TransitLoadResult> {
  return request("/warehouse/transit-scans", { method: "POST", body: JSON.stringify(body) });
}

export function cancelTransitScan(id: string): Promise<TransitLoadScan> {
  return request(`/warehouse/transit-scans/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function listTransitScans(query: {
  warehouse?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<TransitScanJournalRow[]> {
  return request("/warehouse/transit-scans", { params: query });
}

/** Дневной лист склада: какие машины уходят отсюда и что для них готово. */
export function listReadyRuns(query: {
  warehouse: string;
  from?: string;
  to?: string;
}): Promise<ReadyRun[]> {
  return request("/transit/ready", { params: query });
}

export function listTransitProblems(): Promise<TransitProblem[]> {
  return request("/transit/problems");
}

export function listDetachedLegs(): Promise<DetachedLeg[]> {
  return request("/transit/detached");
}

export function rebuildTransitLegs(): Promise<TransitRebuildResult> {
  return request("/transit/legs/rebuild", { method: "POST", body: JSON.stringify({}) });
}

export function listTransitTrips(
  query: {
    carrierId?: string;
    routeId?: string;
    direction?: TransitDirection;
    from?: string;
    to?: string;
    limit?: number;
  } = {},
): Promise<TransitTrip[]> {
  return request("/transit/trips", { params: query });
}

export function getTransitTrip(id: string): Promise<TransitTripDetail> {
  return request(`/transit/trips/${encodeURIComponent(id)}`);
}

export function createTransitTrip(body: {
  carrierId: string;
  routeId: string;
  direction: TransitDirection;
  departedAt: string;
  driverName?: string;
  vehicleNumber?: string;
  note?: string;
  /** Можно не передавать: рейс заводится заранее и наполняется по пути. */
  legIds?: string[];
}): Promise<TransitTrip & { orders: number }> {
  return request("/transit/trips", { method: "POST", body: JSON.stringify(body) });
}

/** Догрузить заказы в уже идущий рейс — им пользуются ПВЗ по дороге. */
export function attachTripLegs(
  tripId: string,
  body: { legIds: string[] },
): Promise<{ orders: number }> {
  return request(`/transit/trips/${encodeURIComponent(tripId)}/legs`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function detachTripLeg(tripId: string, legId: string): Promise<{ detached: boolean }> {
  return request(
    `/transit/trips/${encodeURIComponent(tripId)}/legs/${encodeURIComponent(legId)}`,
    { method: "DELETE" },
  );
}
