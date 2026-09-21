"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { LegTimeline } from "@/components/orders/leg-timeline";
import { PageHeader } from "@/components/ui-kit/page-header";
import { OrderStatusBadge } from "@/components/ui-kit/status-badge";
import { zoneName } from "@/data/zones";
import { useLookups, useOrder } from "@/hooks/use-data";
import { orderMargin } from "@/lib/finance/margin";
import { formatDate, formatDateTime, formatMoney, formatPercent, formatWeight } from "@/lib/format";
import { useFinanceStore } from "@/lib/store";
import { calcLegPayout } from "@/lib/tariff/engine";
import type { PayoutCalc } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function OrderDetailPage({ params }: PageProps<"/demo/orders/[id]">) {
  const { id } = use(params);
  const { order, loading } = useOrder(id);
  const { clientsById, couriersById } = useLookups();

  const rules = useFinanceStore((s) => s.rules);
  const overrides = useFinanceStore((s) => s.overrides);
  const applyRecalc = useFinanceStore((s) => s.applyRecalc);
  const clearRecalc = useFinanceStore((s) => s.clearRecalc);

  /** Суммы до пересчёта — показываем их рядом, чтобы разница была очевидна. */
  const [previousAmounts, setPreviousAmounts] = useState<Map<string, number | null>>();

  const margin = useMemo(() => (order ? orderMargin(order) : null), [order]);

  if (loading) return <Skeleton className="h-96" />;
  if (!order) {
    return (
      <div className="space-y-4">
        <PageHeader title="Заказ не найден" />
        <Button variant="outline" render={<Link href="/demo/orders" />}>
          К списку заказов
        </Button>
      </div>
    );
  }

  const client = clientsById.get(order.clientId);
  const recalculated = Boolean(overrides[order.id]);

  const handleRecalc = () => {
    const before = new Map<string, number | null>(
      order.legs.map((leg) => [leg.id, leg.payout?.amount ?? null]),
    );
    const payouts: Record<string, PayoutCalc | null> = {};
    for (const leg of order.legs) {
      payouts[leg.id] = calcLegPayout(leg, order, couriersById.get(leg.courierId), rules);
    }
    const after = order.legs.reduce((sum, leg) => sum + (payouts[leg.id]?.amount ?? 0), 0);
    const diff = after - order.legs.reduce((sum, leg) => sum + (leg.payout?.amount ?? 0), 0);

    applyRecalc(order.id, payouts);
    setPreviousAmounts(before);
    toast.success(
      diff === 0
        ? "Пересчёт выполнен: суммы не изменились"
        : `Пересчёт выполнен: выплаты ${diff > 0 ? "выросли" : "снизились"} на ${formatMoney(Math.abs(diff))}`,
    );
  };

  const handleReset = () => {
    clearRecalc(order.id);
    setPreviousAmounts(undefined);
    toast.info("Возвращены исходные начисления");
  };

  return (
    <div className="space-y-5">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2"
          render={<Link href="/demo/orders" />}
        >
          <ArrowLeft className="size-4" />
          Заказы
        </Button>
        <PageHeader
          title={`Заказ ${order.orderNumber}`}
          description={`Shipox #${order.shipoxId} · создан ${formatDateTime(order.createdAt)}`}
          actions={
            <>
              {recalculated && (
                <Button variant="ghost" onClick={handleReset}>
                  <RotateCcw className="size-4" />
                  Вернуть исходные
                </Button>
              )}
              <Button onClick={handleRecalc}>
                <RefreshCw className="size-4" />
                Пересчитать по текущим тарифам
              </Button>
            </>
          }
        />
      </div>

      {recalculated && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Начисления по заказу пересчитаны по действующим правилам тарификации и отличаются от сумм,
          зафиксированных при выполнении плеч.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Цепочка доставки</CardTitle>
              <p className="text-sm text-muted-foreground">
                {order.legs.length} {order.legs.length === 1 ? "плечо" : "плеча"} · начисление по
                каждому исполнителю рассчитано отдельным правилом
              </p>
            </CardHeader>
            <CardContent>
              <LegTimeline
                legs={order.legs}
                couriersById={couriersById}
                previousAmounts={previousAmounts}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Финансовый итог</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="К оплате клиентом" value={formatMoney(margin!.revenue)} strong />
              <Row
                label="Выплаты исполнителям"
                value={`− ${formatMoney(margin!.payouts)}`}
                muted
              />
              <Separator />
              <Row
                label="Маржа"
                value={`${formatMoney(margin!.margin)} · ${formatPercent(margin!.marginPct)}`}
                strong
                tone={margin!.margin < 0 ? "negative" : "positive"}
              />
              {order.codAmount > 0 && (
                <>
                  <Separator />
                  <Row
                    label="Наложенный платёж"
                    value={formatMoney(order.codAmount)}
                    muted
                    hint="Деньги получателя, к выручке не относятся"
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Заказ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Статус" value={<OrderStatusBadge status={order.status} />} />
              <Row
                label="Клиент"
                value={
                  <Link href={`/demo/clients/${order.clientId}`} className="hover:underline">
                    {client?.name ?? order.clientId}
                  </Link>
                }
              />
              {client && <Row label="Договор" value={client.contractNo} muted />}
              <Separator />
              <Row label="Откуда" value={`${zoneName(order.fromZoneId)}, ${order.fromAddress}`} />
              <Row label="Куда" value={`${zoneName(order.toZoneId)}, ${order.toAddress}`} />
              <Row label="Получатель" value={order.receiverName} />
              <Separator />
              <Row label="Вес" value={formatWeight(order.weightKg)} />
              <Row label="Мест" value={String(order.places)} />
              <Row label="Объём" value={`${order.volumeM3} м³`} />
              {order.deliveredAt && (
                <Row label="Доставлен" value={formatDate(order.deliveredAt)} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  tone,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
  strong?: boolean;
  tone?: "positive" | "negative";
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">
        <span
          className={cn(
            "tabular-nums",
            strong && "font-medium",
            muted && "text-muted-foreground",
            tone === "negative" && "text-destructive",
            tone === "positive" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {value}
        </span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}
