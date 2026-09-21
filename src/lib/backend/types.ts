/**
 * Формы данных бэкенда.
 *
 * Повторяют то, что отдаёт API, — а он, в свою очередь, повторяет выгрузку
 * Shipox один в один. Ничего не выводится и не переименовывается по дороге:
 * если поле называется так в файле, оно так же называется и здесь.
 */

/** Строка списка заказов. */
export interface ShipoxOrderRow {
  id: string;
  shipoxId: string;
  orderNumber: string;
  /** Код статуса Shipox: accepted, in_sorting_facility, order_completed, … */
  status: string;
  /** Подпись статуса как в выгрузке Shipox. */
  statusLabel: string;
  courierType: string | null;
  ruleName: string | null;
  pieceCount: number;
  weight: number;
  volumetricWeight: number;
  chargeableWeight: number;
  createdDate: string;
  deliveredDate: string | null;
  customerName: string | null;
  customerId: string | null;
  senderCity: string | null;
  receiverName: string | null;
  receiverCity: string | null;
  warehouseName: string | null;
  /** «Имя водителя»: текущий водитель, у доставленного — кто доставил. */
  driverName: string | null;
  /** Курьер, который забрал заказ у клиента. В Shipox указан не у всех заказов. */
  pickUpDriverName: string | null;
  pickUpDriverId: string | null;
  demo: boolean;
  price: OrderPrice | null;
  /** Действующие приёмки на складах. Кто забрал — см. pickupReceipt. */
  receipts: ReceiptSummary[];
  pickUpWarehouse: string | null;
}

/** Приёмка на складе в ответах по заказам. */
export interface ReceiptSummary {
  id: string;
  warehouse: string;
  receivedAt: string;
  courier: { id: string; name: string; shipoxDriverId: string | null };
}

/** Приёмка в карточке заказа — со всеми подробностями, включая отмену. */
export interface OrderReceipt extends ReceiptSummary {
  receivedBy: string;
  scannedCode: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
}

/** Карточка заказа: всё, что лежит в базе, включая сырой ответ Shipox. */
export interface ShipoxOrderDetail extends Omit<ShipoxOrderRow, "receipts"> {
  /** Все приёмки, включая отменённые, от ранней к поздней. */
  receipts: OrderReceipt[];
  /** Начисления курьерам за забор и доставку. */
  courierPayouts: CourierPayout[];
  /** Плечи межгородней перевозки по порядку. */
  transitLegs: OrderTransitLeg[];
  publicId: string | null;
  referenceId: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  lastStatusDate: string | null;
  shipped: string | null;
  parcelValue: number | null;
  amount: number | null;
  driverId: string | null;
  pickUpDriverId: string | null;
  senderAddress: string | null;
  receiverAddress: string | null;
  receiverPhone: string | null;
  pickUpWarehouse: string | null;
  destinationWarehouse: string | null;
  raw: Record<string, unknown> | null;
  sourceHash: string;
  syncedAt: string;
}

export type PricingStatus = "PRICED" | "NO_TARIFF" | "SKIPPED" | "FAILED";
export type PricingSource = "MATCHED" | "DEFAULT_PLAN" | "MANUAL" | "LOCAL_RULE";

/** Расчёт стоимости доставки для клиента. */
export interface OrderPrice {
  amount: string | null;
  currency: string;
  status: PricingStatus;
  source: PricingSource;
  error: string | null;
}

export interface PricingClientRow {
  customerId: string;
  customerName: string;
  orders: number;
  priced: number;
  unpriced: number;
  total: number;
  /** Считается по плану по умолчанию — сумма предварительная. */
  provisional: boolean;
}

export interface PricingSummary {
  clients: PricingClientRow[];
  totals: {
    orders: number;
    priced: number;
    unpriced: number;
    amount: number;
    provisionalAmount: number;
  };
}

export interface UnmatchedClient {
  shipoxCustomerId: string;
  shipoxCustomerName: string;
  orders: number;
}

export interface PricingProblem {
  status: PricingStatus;
  error: string | null;
  calculatedAt: string;
  order: {
    id: string;
    orderNumber: string;
    customerName: string | null;
    senderCity: string | null;
    receiverCity: string | null;
    courierType: string | null;
    chargeableWeight: number;
    createdDate: string;
  };
}

export interface PricingRunResult {
  considered: number;
  priced: number;
  noTariff: number;
  skipped: number;
  failed: number;
  byDefaultPlan: number;
  warnings: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
}

export interface OrdersStats {
  total: number;
  delivered: number;
  pieces: number;
  weightKg: number;
  chargeableWeightKg: number;
  byStatus: Array<{ status: string; label: string; count: number }>;
}

export interface CustomerRef {
  id: string;
  name: string;
  orders: number;
}

export interface CityRef {
  name: string;
  orders: number;
}

export type ExportKind = "DAILY" | "WEEKLY";
export type RunStatus = "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";

/** Запись журнала выгрузок. */
export interface ExportRun {
  id: string;
  kind: ExportKind;
  status: RunStatus;
  /** Файл собран на демо-данных, а не на выгрузке из Shipox. */
  demo: boolean;
  periodFrom: string;
  periodTo: string;
  fileName: string | null;
  filePath: string | null;
  fileSize: number | null;
  rowCount: number;
  ordersFetched: number;
  ordersCreated: number;
  ordersUpdated: number;
  ordersSkipped: number;
  ordersFailed: number;
  syncRunId: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface SyncRun {
  id: string;
  resource: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  windowFrom: string | null;
  windowTo: string | null;
  error: string | null;
}

export interface SyncState {
  resource: string;
  running: boolean;
  state: {
    resource: string;
    status: RunStatus;
    cursor: string | null;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    message: string | null;
  } | null;
  lastRuns: SyncRun[];
}

export interface Health {
  status: string;
  database: string;
  shipox: { mode: string; baseUrl: string | null };
  time: string;
}

// ──────────────────────── Приёмка на складе ────────────────────────

export interface Courier {
  id: string;
  /** Тот же id, что у водителя в заказах Shipox. */
  shipoxDriverId: string | null;
  name: string;
  phone: string | null;
  /** Позывной Shipox. */
  referenceId: string | null;
  /** Склад приписки. */
  warehouse: string | null;
  active: boolean;
  /** Начислять ли выплаты. Снят у служебных учёток Shipox. */
  payable: boolean;
  /** MANUAL — заведён или исправлен руками, импорт его не перетирает. */
  source: "SHIPOX_IMPORT" | "MANUAL";
  createdAt: string;
  updatedAt: string;
  _count: { receipts: number };
}

export interface CourierInput {
  name: string;
  shipoxDriverId?: string | null;
  phone?: string | null;
  referenceId?: string | null;
  warehouse?: string | null;
  active?: boolean;
  payable?: boolean;
}

/** Итог загрузки выгрузки водителей Shipox. */
export interface CourierImportResult {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  /** Исправлены у нас вручную — импорт их не перезаписал. */
  keptManual: Array<{ shipoxDriverId: string; name: string }>;
  problems: Array<{ line: number; reason: string }>;
}

export interface WarehouseRef {
  name: string;
  orders: number;
}

/** Исход скана. Все четыре — нормальная работа склада, а не ошибка запроса. */
export type ReceiveStatus =
  | "ACCEPTED"
  | "ALREADY_ACCEPTED"
  | "CONFLICT"
  /** Заказ доставлен, выдан или отменён — принимать нечего. */
  | "CLOSED"
  | "NOT_FOUND";

export interface Receipt {
  id: string;
  warehouse: string;
  receivedBy: string;
  receivedAt: string;
  scannedCode: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  courier: { id: string; name: string; referenceId: string | null; shipoxDriverId: string | null };
}

export interface ReceiptOrder {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  customerName: string | null;
  senderCity: string | null;
  receiverCity: string | null;
  pieceCount: number;
  pickUpWarehouse: string | null;
  destinationWarehouse: string | null;
}

export interface ReceiveResult {
  status: ReceiveStatus;
  code: string;
  message: string;
  /** Коробки заказа: принято на складе и всего по Shipox. Многоместный заказ сканируют по коробке. */
  pieces: { accepted: number; total: number } | null;
  order: ReceiptOrder | null;
  /** Созданная приёмка, при повторном скане — уже существующая. */
  receipt: Receipt | null;
  /** При CONFLICT — действующая приёмка другого курьера; при замене — отменённая. */
  previous: Receipt | null;
  warnings: string[];
}

/** Строка журнала приёмок. */
export interface ReceiptJournalRow extends Receipt {
  order: Pick<
    ReceiptOrder,
    "id" | "orderNumber" | "customerName" | "senderCity" | "receiverCity" | "pieceCount" | "statusLabel"
  >;
}

// ──────────────────────── Тариф и начисления курьерам ────────────────────────

export type CourierLeg = "PICKUP" | "DELIVERY";
export type CourierRateKind = "CITY" | "DISTRICT" | "HEAVY";
export type CourierPayoutStatus = "CALCULATED" | "CITY_NOT_FOUND" | "NOT_PAYABLE" | "NO_TARIFF";

/** Версия тарифа курьеров. Деньги приходят строкой — это Decimal. */
export interface CourierTariff {
  id: string;
  validFrom: string;
  cityRate: string;
  districtRate: string;
  heavyRate: string;
  heavyFromKg: number;
  note: string | null;
  createdAt: string;
  /** Действует сегодня. */
  current: boolean;
  _count: { payouts: number };
}

export interface CourierTariffInput {
  /** YYYY-MM-DD по времени компании. */
  validFrom: string;
  cityRate: number;
  districtRate: number;
  heavyRate: number;
  heavyFromKg: number;
  note?: string;
}

/** Город справочника Supabase и ставка по текущему тарифу. */
export interface TariffCity {
  name: string;
  normalized: string;
  isHub: boolean;
  hubName: string | null;
  rate: number | null;
}

export interface CourierPayout {
  id: string;
  orderId: string;
  leg: CourierLeg;
  courierId: string | null;
  shipoxDriverId: string | null;
  courierName: string;
  /** RECEIPT — по приёмке на складе, SHIPOX — по данным Shipox. */
  source: "RECEIPT" | "SHIPOX";
  city: string | null;
  hubName: string | null;
  rateKind: CourierRateKind | null;
  weightKg: number;
  amount: string | null;
  status: CourierPayoutStatus;
  tariffId: string | null;
  earnedAt: string;
  calculatedAt: string;
  order?: {
    id: string;
    orderNumber: string;
    customerName: string | null;
    senderCity: string | null;
    receiverCity: string | null;
    statusLabel: string;
  };
}

export interface CourierPayoutCounts {
  pickups: number;
  deliveries: number;
  heavy: number;
  amount: number;
  notPayable: number;
  cityNotFound: number;
  noTariff: number;
}

export interface CourierPayoutSummaryRow extends CourierPayoutCounts {
  courierId: string | null;
  shipoxDriverId: string | null;
  courierName: string;
}

export interface CourierPayoutSummary {
  totals: CourierPayoutCounts;
  couriers: CourierPayoutSummaryRow[];
}

export interface CourierPayoutRunResult {
  orders: number;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  byStatus: Record<string, number>;
}

// ──────────────────────── Межгород: перевозчики ────────────────────────

export type CarrierKind = "COMPANY" | "ENTREPRENEUR";
export type TransitDirection = "FORWARD" | "REVERSE";
/** Почему заказ не разложился на плечи. */
export type TransitProblemStatus = "NO_WAREHOUSE" | "NO_ROUTE";

export interface TransitRouteRef {
  id: string;
  code: string;
  name: string;
}

export interface TransitRoute extends TransitRouteRef {
  /** Склады по порядку следования. */
  stops: string[];
  active: boolean;
  carriers: Array<{ id: string; name: string }>;
  _count: { legs: number; trips: number };
}

export interface Carrier {
  id: string;
  name: string;
  kind: CarrierKind;
  phone: string | null;
  /** Водитель Shipox, если перевозчик заведён и там. Только подсказка. */
  shipoxDriverId: string | null;
  active: boolean;
  note: string | null;
  routes: TransitRouteRef[];
  _count: { trips: number };
  createdAt: string;
  updatedAt: string;
}

export interface CarrierInput {
  name: string;
  kind: CarrierKind;
  phone?: string | null;
  shipoxDriverId?: string | null;
  routeIds?: string[];
  note?: string | null;
  active?: boolean;
}

/** Заказ в списках межгорода. */
export interface TransitOrderBrief {
  id: string;
  orderNumber: string;
  customerName: string | null;
  senderCity: string | null;
  receiverCity: string | null;
  statusLabel: string;
  status: string;
  weight: number;
  pieceCount: number;
  createdDate: string;
  driverId: string | null;
  pickUpWarehouse: string | null;
  destinationWarehouse: string | null;
}

export interface PendingLeg {
  id: string;
  sequence: number;
  fromWarehouse: string;
  toWarehouse: string;
  direction: TransitDirection;
  detachedFromTripId: string | null;
  detachedAt: string | null;
  route: TransitRouteRef;
  order: TransitOrderBrief;
  /** Перевозчик по данным Shipox — подсказка, а не назначение. */
  shipoxCarrier: { id: string; name: string; shipoxDriverId: string | null } | null;
  /** Отметка сканера на складе погрузки. Пусто — коробку не пробивали. */
  scan: OrderScanMark | null;
}

/** Чем подтверждено, что коробка на складе. */
export interface OrderScanMark {
  /** RECEIPT — приёмка от курьера, TRANSIT — скан на отправку в ПВЗ. */
  kind: "RECEIPT" | "TRANSIT";
  at: string;
  by: string;
  courier: { id: string; name: string } | null;
}

/** Строка «где ждёт груз рейса»: склад погрузки в порядке движения. */
export interface PendingWarehouse {
  warehouse: string;
  scanned: number;
  unscanned: number;
}

/** Исход скана коробки на отправку в транзит. */
export type TransitLoadStatus =
  | "ACCEPTED"
  | "ALREADY_SCANNED"
  | "CLOSED"
  | "NO_TRANSIT"
  | "IN_TRIP"
  | "NOT_FOUND";

export interface TransitLoadLeg {
  id: string;
  fromWarehouse: string;
  toWarehouse: string;
  direction: TransitDirection;
  route: TransitRouteRef;
  trip: { id: string; departedAt: string; carrier: { name: string } } | null;
}

export interface TransitLoadScan {
  id: string;
  warehouse: string;
  scannedBy: string;
  scannedCode: string;
  scannedAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
}

export interface TransitLoadResult {
  status: TransitLoadStatus;
  code: string;
  message: string;
  order: ReceiptOrder | null;
  leg: TransitLoadLeg | null;
  scan: TransitLoadScan | null;
  pieces: { accepted: number; total: number } | null;
  warnings: string[];
}

/** Строка журнала сканов на отправку. */
export interface TransitScanJournalRow extends TransitLoadScan {
  order: {
    id: string;
    orderNumber: string;
    customerName: string | null;
    senderCity: string | null;
    receiverCity: string | null;
    pieceCount: number;
    destinationWarehouse: string | null;
  };
}

/** Рейс, который ещё предстоит отправить: направление целиком в одну сторону. */
/** Строка дневного листа склада: рейс отсюда и что в нём готово к погрузке. */
export interface ReadyRun {
  route: TransitRouteRef | null;
  direction: TransitDirection;
  fromWarehouse: string;
  toWarehouse: string;
  /** Пробито сканером за выбранный день. */
  scannedInPeriod: number;
  /** Пробито раньше и до сих пор не уехало — лежит на складе. */
  scannedEarlier: number;
  /** Идут через склад по маршруту, но сканером не пробиты. */
  unscanned: number;
}

export interface PendingLegGroup {
  route: TransitRouteRef | null;
  direction: TransitDirection;
  /** Концы хода машины, а не отдельного заказа. */
  fromWarehouse: string;
  toWarehouse: string;
  orders: number;
}

export interface TransitTrip {
  id: string;
  carrierId: string;
  routeId: string;
  direction: TransitDirection;
  /** Концы хода машины на момент отправки. */
  fromWarehouse: string;
  toWarehouse: string;
  departedAt: string;
  /** Кто за рулём и на какой машине — вписывает кладовщик при отправке. */
  driverName: string | null;
  vehicleNumber: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  carrier: { id: string; name: string; kind: CarrierKind };
  route: TransitRouteRef;
  _count: { legs: number };
}

export interface TransitTripDetail extends Omit<TransitTrip, "_count"> {
  legs: Array<{
    id: string;
    sequence: number;
    direction: TransitDirection;
    /** Где заказ сел в машину и где сходит. */
    fromWarehouse: string;
    toWarehouse: string;
    /** Кто поставил заказ в рейс: обратную машину грузят несколько ПВЗ. */
    attachedBy: string | null;
    attachedAt: string | null;
    order: TransitOrderBrief;
  }>;
}

export interface TransitSummary {
  totals: { orders: number; weightKg: number; trips: number; carriers: number };
  carriers: Array<{
    carrierId: string;
    carrierName: string;
    kind: CarrierKind;
    orders: number;
    weightKg: number;
    trips: number;
    routes: Array<{ code: string; name: string; orders: number }>;
  }>;
}

export interface TransitProblem {
  order: TransitOrderBrief;
  status: TransitProblemStatus;
}

export interface DetachedLeg {
  id: string;
  sequence: number;
  fromWarehouse: string;
  toWarehouse: string;
  detachedAt: string | null;
  route: { code: string; name: string };
  order: TransitOrderBrief;
}

export interface TransitRebuildResult {
  orders: number;
  created: number;
  unchanged: number;
  removed: number;
  detached: number;
  byStatus: Record<string, number>;
}

/** Плечо заказа в его карточке. */
export interface OrderTransitLeg {
  id: string;
  sequence: number;
  fromWarehouse: string;
  toWarehouse: string;
  direction: TransitDirection;
  detachedFromTripId: string | null;
  route: TransitRouteRef;
  trip: {
    id: string;
    departedAt: string;
    carrier: { id: string; name: string; kind: CarrierKind };
  } | null;
}

/** Роль сотрудника: от неё зависят доступные экраны и действия. */
export type UserRole = "ADMIN" | "DISPATCHER" | "STOREKEEPER" | "ACCOUNTANT" | "VIEWER";

/** Кто вошёл. Имя подписывает приёмки, сканы и рейсы. */
export interface Session {
  id: string;
  login: string;
  name: string;
  role: UserRole;
  /** Склад кладовщика. У офиса пусто — он работает с любым. */
  warehouse: string | null;
}

/** Сотрудник в справочнике администратора. */
export interface User extends Session {
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Сколько устройств сейчас с его сессией. */
  _count: { sessions: number };
}
