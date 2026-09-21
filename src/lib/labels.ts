import type {
  CourierGroup,
  CourierKind,
  LegStatus,
  LegType,
  OrderStatus,
  PaymentMethod,
  RegisterStatus,
} from "@/lib/types";

/** Подписи доменных значений. Держим в одном месте, чтобы термины не расходились. */

export const LEG_TYPE_LABEL: Record<LegType, string> = {
  pickup: "Забор",
  linehaul: "Транзит",
  last_mile: "Доставка",
};

export const LEG_TYPE_HINT: Record<LegType, string> = {
  pickup: "От отправителя до сортировочного центра",
  linehaul: "Междугороднее плечо между сортировочными центрами",
  last_mile: "От сортировочного центра до двери получателя",
};

export const LEG_STATUS_LABEL: Record<LegStatus, string> = {
  planned: "Запланировано",
  in_progress: "В работе",
  completed: "Выполнено",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  created: "Создан",
  in_transit: "В пути",
  delivered: "Доставлен",
  returned: "Возврат",
  cancelled: "Отменён",
};

export const COURIER_KIND_LABEL: Record<CourierKind, string> = {
  courier: "Курьер",
  driver: "Водитель",
};

export const COURIER_GROUP_LABEL: Record<CourierGroup, string> = {
  staff: "Штатный",
  partner: "Партнёр",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank: "Банк",
  cash: "Наличные",
  card: "Карта",
};

export const REGISTER_STATUS_LABEL: Record<RegisterStatus, string> = {
  draft: "Черновик",
  approved: "Утверждён",
  paid: "Выплачен",
};
