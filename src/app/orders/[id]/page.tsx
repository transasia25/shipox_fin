"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Code2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { useBackend } from "@/hooks/use-backend";
import { getOrder } from "@/lib/backend/client";
import { formatDate, formatDateTime, formatNumber, formatWeight, plural } from "@/lib/format";
import { legLabel } from "@/lib/transit";
import {
  LEG_LABEL,
  PAYOUT_SOURCE_LABEL,
  PAYOUT_STATUS_LABEL,
  RATE_KIND_LABEL,
  payoutCityLabel,
  pickupReceipt,
} from "@/lib/courier-payouts";
import { cn } from "@/lib/utils";

export default function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = use(params);
  const { data: order, loading, error, reload } = useBackend(() => getOrder(id), [id]);
  const [showRaw, setShowRaw] = useState(false);

  const back = (
    <Button variant="ghost" size="sm" className="-ml-2 mb-2" render={<Link href="/orders" />}>
      <ArrowLeft className="size-4" />
      Заказы
    </Button>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  if (loading || !order) {
    return (
      <div className="space-y-4">
        {back}
        <Skeleton className="h-96" />
      </div>
    );
  }

  const dimensions =
    order.length && order.width && order.height
      ? `${order.length} × ${order.width} × ${order.height} см`
      : null;

  // Кто забрал у клиента — по тому же правилу, что в начислениях: приёмка на
  // складе забора, иначе самая ранняя. Без приёмок остаётся отметка Shipox.
  const pickUpReceipt = pickupReceipt(order.receipts, order.pickUpWarehouse);
  const shipoxDisagrees =
    pickUpReceipt?.courier.shipoxDriverId &&
    order.pickUpDriverId &&
    pickUpReceipt.courier.shipoxDriverId !== order.pickUpDriverId;
  const pickUpHint = pickUpReceipt
    ? shipoxDisagrees
      ? `по приёмке на складе; в Shipox указан ${order.pickUpDriverName}`
      : `по приёмке: ${pickUpReceipt.warehouse}`
    : order.pickUpDriverName
      ? "по данным Shipox, на складе не принимали"
      : undefined;

  return (
    <div className="space-y-5">
      <div>
        {back}
        <PageHeader
          title={`Заказ ${order.orderNumber}`}
          description={`Shipox #${order.shipoxId} · создан ${formatDateTime(order.createdDate)}`}
          actions={
            <Button variant="outline" onClick={() => setShowRaw((v) => !v)}>
              <Code2 className="size-4" />
              {showRaw ? "Скрыть ответ Shipox" : "Показать ответ Shipox"}
            </Button>
          }
        />
      </div>

      {order.demo && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Это демо-заказ из заглушки. В Shipox его не существует.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Заказ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Статус" value={<Badge variant="secondary">{order.statusLabel}</Badge>} />
            <Row label="Код статуса" value={order.status} muted />
            <Row label="Клиент" value={order.customerName ?? "—"} />
            <Row label="Идентификатор клиента" value={order.customerId ?? "—"} muted />
            <Separator />
            <Row label="Тип услуги" value={order.courierType ?? "—"} />
            <Row label="Тариф Shipox" value={order.ruleName ?? "—"} />
            <Separator />
            <Row label="Создан" value={formatDateTime(order.createdDate)} />
            <Row
              label="Доставлен"
              value={order.deliveredDate ? formatDateTime(order.deliveredDate) : "—"}
            />
            <Row
              label="Последняя смена статуса"
              value={order.lastStatusDate ? formatDateTime(order.lastStatusDate) : "—"}
              muted
            />
            <Row label="Обновлён из Shipox" value={formatDateTime(order.syncedAt)} muted />
            <Separator />
            <Row
              label="Забрал у клиента"
              value={pickUpReceipt?.courier.name ?? order.pickUpDriverName ?? "не указан"}
              muted={!pickUpReceipt && !order.pickUpDriverName}
              hint={pickUpHint}
            />
            <Row
              label={order.deliveredDate ? "Доставил" : "Везёт сейчас"}
              value={order.driverName ?? "не назначен"}
              muted={!order.driverName}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Груз</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Мест"
              value={`${order.pieceCount} ${plural(order.pieceCount, "место", "места", "мест")}`}
            />
            <Row label="Фактический вес" value={formatWeight(order.weight)} />
            <Row label="Объёмный вес" value={formatWeight(order.volumetricWeight)} muted />
            <Row
              label="Оплачиваемый вес"
              value={formatWeight(order.chargeableWeight)}
              strong
            />
            {dimensions && <Row label="Габариты" value={dimensions} muted />}
            <Separator />
            <Row
              label="Цена посылки"
              value={order.parcelValue === null ? "—" : formatNumber(order.parcelValue)}
              muted
            />
            <Row
              label="Итоговая цена"
              value={order.amount === null ? "—" : formatNumber(order.amount)}
              muted
              hint="Значение Shipox. Стоимость доставки считается на нашей стороне"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Маршрут</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Откуда, город" value={order.senderCity ?? "—"} />
            <Row label="Адрес отправителя" value={order.senderAddress ?? "—"} muted />
            <Separator />
            <Row label="Куда, город" value={order.receiverCity ?? "—"} />
            <Row label="Адрес получателя" value={order.receiverAddress ?? "—"} muted />
            <Row label="Получатель" value={order.receiverName ?? "—"} />
            <Row label="Телефон" value={order.receiverPhone ?? "—"} muted />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сортировочные центры</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Откуда" value={order.pickUpWarehouse ?? "—"} />
            <Row label="Куда" value={order.destinationWarehouse ?? "—"} />
            <Row label="Сейчас на складе" value={order.warehouseName ?? "—"} muted />
            <Separator />
            <Row label="Отправлено" value={order.shipped ?? "не отдаётся API"} muted />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Начисления курьерам</CardTitle>
          <p className="text-sm text-muted-foreground">
            За забор — по городу отправителя, за доставку — по городу получателя; тяжёлый заказ — по
            фактическому весу.
          </p>
        </CardHeader>
        <CardContent>
          {order.courierPayouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Начислять пока не за что: заказ не принимали на складе, в Shipox не отмечен курьер забора, и
              он ещё не доставлен.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {order.courierPayouts.map((payout) => (
                <li key={payout.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge variant="secondary">{LEG_LABEL[payout.leg]}</Badge>
                      <span className="font-medium">{payout.courierName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        payoutCityLabel(payout),
                        formatWeight(payout.weightKg),
                        PAYOUT_SOURCE_LABEL[payout.source],
                        formatDateTime(payout.earnedAt),
                      ].join(" · ")}
                    </div>
                  </div>
                  <div className="text-right">
                    {payout.status === "CALCULATED" && payout.amount !== null ? (
                      <>
                        <div className="font-medium tabular-nums">{formatNumber(Number(payout.amount))} сум</div>
                        {payout.rateKind && (
                          <div className="text-xs text-muted-foreground">
                            ставка: {RATE_KIND_LABEL[payout.rateKind]}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        {PAYOUT_STATUS_LABEL[payout.status]}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Межгород</CardTitle>
          <p className="text-sm text-muted-foreground">
            Плечи между городами и перевозчики, которым они отданы. Плечи считаются по направлениям,
            распределение — на экране «Межгород».
          </p>
        </CardHeader>
        <CardContent>
          {order.transitLegs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Межгородней перевозки нет: заказ едет внутри города либо у него не заполнены склады.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {order.transitLegs.map((leg) => (
                <li key={leg.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge variant="secondary">{leg.sequence}. {leg.route.code}</Badge>
                      <span className="font-medium" title={`${leg.fromWarehouse} → ${leg.toWarehouse}`}>
                        {legLabel(leg.fromWarehouse, leg.toWarehouse)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{leg.route.name}</div>
                  </div>
                  <div className="text-right">
                    {leg.trip ? (
                      <>
                        <div className="font-medium">{leg.trip.carrier.name}</div>
                        <div className="text-xs text-muted-foreground">
                          рейс от {formatDate(leg.trip.departedAt)}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        {leg.detachedFromTripId ? "слетел с рейса — распределите заново" : "не распределено"}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Приёмка на складах</CardTitle>
          <p className="text-sm text-muted-foreground">
            Кто из курьеров привёз заказ на склад — отмечается кладовщиком при скане. Отменённые
            приёмки остаются в истории.
          </p>
        </CardHeader>
        <CardContent>
          {order.receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Заказ ещё не принимали ни на одном складе.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {order.receipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className={cn(
                    "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2",
                    receipt.cancelledAt && "text-muted-foreground",
                  )}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className={cn("font-medium", receipt.cancelledAt && "line-through")}>
                      {receipt.courier.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {receipt.warehouse} · принял {receipt.receivedBy} · код «{receipt.scannedCode}»
                    </div>
                    {receipt.cancelledAt && (
                      <div className="text-xs">
                        отменена {formatDateTime(receipt.cancelledAt)}
                        {receipt.cancelledBy ? `, ${receipt.cancelledBy}` : ""}
                      </div>
                    )}
                  </div>
                  <span className="text-xs whitespace-nowrap tabular-nums">
                    {formatDateTime(receipt.receivedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showRaw && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ответ Shipox целиком</CardTitle>
            <p className="text-sm text-muted-foreground">
              Сохраняется при каждой выгрузке. По нему можно достать любое поле, которого нет в
              колонках, не обращаясь к API заново.
            </p>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[32rem] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
              {JSON.stringify(order.raw, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
  strong?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">
        <span
          className={[
            "tabular-nums",
            strong ? "font-medium" : "",
            muted ? "text-muted-foreground" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {value}
        </span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}
