import { Badge } from "@/components/ui/badge";
import {
  COURIER_GROUP_LABEL,
  COURIER_KIND_LABEL,
  LEG_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  REGISTER_STATUS_LABEL,
} from "@/lib/labels";
import type { CourierGroup, CourierKind, LegType, OrderStatus, RegisterStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost";

const ORDER_STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = {
  created: "outline",
  in_transit: "secondary",
  delivered: "default",
  returned: "destructive",
  cancelled: "ghost",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={ORDER_STATUS_VARIANT[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

const REGISTER_STATUS_VARIANT: Record<RegisterStatus, BadgeVariant> = {
  draft: "outline",
  approved: "secondary",
  paid: "default",
};

export function RegisterStatusBadge({ status }: { status: RegisterStatus }) {
  return <Badge variant={REGISTER_STATUS_VARIANT[status]}>{REGISTER_STATUS_LABEL[status]}</Badge>;
}

/**
 * Цвет типа плеча — чтобы цепочка доставки читалась одним взглядом.
 * Оттенки совпадают со слотами палитры графиков (синий / оранжевый /
 * бирюзовый), поэтому таблицы и диаграммы говорят на одном языке.
 */
const LEG_TYPE_CLASS: Record<LegType, string> = {
  pickup: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  linehaul: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  last_mile: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
};

export function LegTypeBadge({ type, className }: { type: LegType; className?: string }) {
  return (
    <Badge variant="ghost" className={cn(LEG_TYPE_CLASS[type], className)}>
      {LEG_TYPE_LABEL[type]}
    </Badge>
  );
}

export function CourierKindBadge({ kind }: { kind: CourierKind }) {
  return <Badge variant="outline">{COURIER_KIND_LABEL[kind]}</Badge>;
}

export function CourierGroupBadge({ group }: { group: CourierGroup }) {
  return (
    <Badge variant={group === "staff" ? "secondary" : "outline"}>{COURIER_GROUP_LABEL[group]}</Badge>
  );
}

/** Плечо без подходящего правила тарифа — требует внимания бухгалтерии. */
export function NoTariffBadge() {
  return <Badge variant="destructive">Нет тарифа</Badge>;
}
