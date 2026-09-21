/**
 * Доменная модель финансовой платформы.
 *
 * Ключевая идея: один заказ (Order) везут несколько исполнителей, поэтому
 * доставка разбита на плечи (Leg). Каждое плечо тарифицируется отдельно
 * правилом TariffRule, результат расчёта — PayoutCalc с разбором суммы.
 *
 * Все денежные значения — целые числа в сумах (UZS), без копеек.
 */

export type Currency = "UZS";

export type ZoneKind = "city" | "district";

export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  /** Для района — id города, к которому он относится. */
  parentId?: string;
}

export interface Client {
  id: string;
  name: string;
  inn: string;
  contractNo: string;
  /** Отсрочка платежа по договору, дней. Используется для расчёта просрочки. */
  paymentTermDays: number;
  currency: Currency;
}

/** Курьер — работает внутри города; водитель — междугородние транзитные плечи. */
export type CourierKind = "courier" | "driver";

/** Группа влияет на ставку: штатные и партнёры тарифицируются по-разному. */
export type CourierGroup = "staff" | "partner";

export interface Courier {
  id: string;
  fullName: string;
  phone: string;
  kind: CourierKind;
  group: CourierGroup;
  /** Город приписки. */
  homeZoneId: string;
  vehicle: string;
  active: boolean;
}

/**
 * Тип плеча:
 *  - pickup    — забор у отправителя и сдача в сортировочный центр;
 *  - linehaul  — междугородний транзит между сортировочными центрами
 *                (плеч может быть несколько: Ташкент → Джизак → Самарканд);
 *  - last_mile — доставка от сортировочного центра до двери получателя.
 */
export type LegType = "pickup" | "linehaul" | "last_mile";

export type LegStatus = "planned" | "in_progress" | "completed";

/** Одна строка разбора расчёта, чтобы бухгалтер видел, из чего сложилась сумма. */
export interface PayoutBreakdownLine {
  label: string;
  value: number;
}

export interface PayoutCalc {
  amount: number;
  ruleId: string;
  ruleName: string;
  breakdown: PayoutBreakdownLine[];
}

export interface Leg {
  id: string;
  orderId: string;
  /** Порядок плеча в цепочке, начиная с 1. */
  seq: number;
  type: LegType;
  courierId: string;
  fromZoneId: string;
  toZoneId: string;
  distanceKm: number;
  startedAt: string;
  completedAt: string | null;
  status: LegStatus;
  /** null — подходящее правило тарифа не найдено, плечо требует внимания. */
  payout: PayoutCalc | null;
}

export type OrderStatus = "created" | "in_transit" | "delivered" | "returned" | "cancelled";

export interface Order {
  id: string;
  /** Идентификатор заказа в Shipox — точка связи при синхронизации. */
  shipoxId: string;
  orderNumber: string;
  clientId: string;
  createdAt: string;
  deliveredAt: string | null;
  status: OrderStatus;
  fromZoneId: string;
  toZoneId: string;
  fromAddress: string;
  toAddress: string;
  receiverName: string;
  weightKg: number;
  places: number;
  volumeM3: number;
  /** Наложенный платёж — деньги получателя, к нашей выручке не относятся. */
  codAmount: number;
  /** Сколько клиент должен заплатить нам за доставку этого заказа. */
  clientCharge: number;
  currency: Currency;
  legs: Leg[];
}

/** Условия применения правила. Незаданное поле означает «любое значение». */
export interface TariffMatch {
  fromZoneId?: string;
  toZoneId?: string;
  courierGroup?: CourierGroup;
  clientId?: string;
  weightMin?: number;
  weightMax?: number;
  placesMin?: number;
  placesMax?: number;
}

/**
 * Формула расчёта:
 *   base
 * + perKg    × max(0, вес − includedKg)
 * + perPlace × max(0, места − includedPlaces)
 * + perKm    × км
 * затем ограничение min/max.
 */
export interface TariffFormula {
  base: number;
  perKg: number;
  includedKg: number;
  perPlace: number;
  includedPlaces: number;
  perKm: number;
  min?: number;
  max?: number;
}

export interface TariffRule {
  id: string;
  name: string;
  /** Больше — важнее. При равном приоритете побеждает более специфичное правило. */
  priority: number;
  active: boolean;
  legType: LegType;
  match: TariffMatch;
  formula: TariffFormula;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export type PaymentMethod = "bank" | "cash" | "card";

export interface Payment {
  id: string;
  clientId: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  note: string;
}

export type RegisterStatus = "draft" | "approved" | "paid";

export interface PayoutAdjustment {
  id: string;
  reason: string;
  /** Положительное — бонус, отрицательное — штраф. */
  amount: number;
}

export interface PayoutRegisterLine {
  courierId: string;
  legIds: string[];
  /** Сумма по плечам, без корректировок. */
  legsAmount: number;
  adjustments: PayoutAdjustment[];
}

export interface PayoutRegister {
  id: string;
  title: string;
  periodFrom: string;
  periodTo: string;
  courierKind: CourierKind | "all";
  status: RegisterStatus;
  createdAt: string;
  lines: PayoutRegisterLine[];
}

/** Период, по которому фильтруются все экраны. */
export interface DateRange {
  from: string;
  to: string;
}
