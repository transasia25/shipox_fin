"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, RefreshCw, TriangleAlert, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { PageHeader } from "@/components/ui-kit/page-header";
import { useBackend } from "@/hooks/use-backend";
import {
  cancelTransitTrip,
  detachTripLeg,
  getTransitTrip,
  getTransitSummary,
  listDetachedLegs,
  listPendingLegGroups,
  listTransitProblems,
  listTransitTrips,
  rebuildTransitLegs,
} from "@/lib/backend/client";
import type { TransitSummary, TransitTrip } from "@/lib/backend/types";
import { formatDate, formatDateTime, formatNumber, formatWeight } from "@/lib/format";
import { CARRIER_KIND_LABEL, legLabel, shortWarehouse, TRANSIT_PROBLEM_LABEL } from "@/lib/transit";
import { useFinanceStore } from "@/lib/store";

type CarrierRow = TransitSummary["carriers"][number];

export default function TransitPage() {
  const period = useFinanceStore((s) => s.period);
  const window = { from: period.from, to: period.to };
  const [rebuilding, setRebuilding] = useState(false);
  const [openTrip, setOpenTrip] = useState<TransitTrip | null>(null);

  const summary = useBackend(() => getTransitSummary(window), [window.from, window.to]);
  const pending = useBackend(() => listPendingLegGroups(), []);
  const problems = useBackend(() => listTransitProblems(), []);
  const detached = useBackend(() => listDetachedLegs(), []);
  const trips = useBackend(
    () => listTransitTrips({ ...window, limit: 20 }),
    [window.from, window.to],
  );

  const totals = summary.data?.totals;

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const result = await rebuildTransitLegs();
      toast.success(
        `Плечи пересчитаны: новых ${result.created}, снято ${result.removed}, без изменений ${result.unchanged}`,
      );
      pending.reload();
      problems.reload();
      detached.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Пересчёт не удался");
    } finally {
      setRebuilding(false);
    }
  };

  const columns = useMemo<ColumnDef<CarrierRow, unknown>[]>(
    () => [
      {
        id: "carrier",
        header: "Перевозчик",
        accessorFn: (c) => c.carrierName,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant="outline">{CARRIER_KIND_LABEL[row.original.kind]}</Badge>
            <span className="font-medium">{row.original.carrierName}</span>
          </div>
        ),
      },
      {
        id: "routes",
        header: "Направления",
        accessorFn: (c) => c.routes.map((route) => route.code).join(","),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.routes.map((route) => (
              <Badge key={route.code} variant="secondary" title={route.name}>
                {route.code} · {route.orders}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: "trips",
        header: "Рейсов",
        accessorFn: (c) => c.trips,
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.trips)}</span>,
      },
      {
        id: "weight",
        header: "Вес",
        accessorFn: (c) => c.weightKg,
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {formatWeight(row.original.weightKg)}
          </span>
        ),
      },
      {
        id: "orders",
        header: "Заказов",
        accessorFn: (c) => c.orders,
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{formatNumber(row.original.orders)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Межгород"
        description="Кто сколько заказов вёз между городами. Плечи считаются по направлениям, а кто их везёт — решает распределение."
        actions={
          <>
            <Button variant="outline" render={<Link href="/carriers" />}>
              Перевозчики
            </Button>
            <Button variant="outline" onClick={rebuild} disabled={rebuilding}>
              <RefreshCw className={rebuilding ? "size-4 animate-spin" : "size-4"} />
              Пересчитать плечи
            </Button>
            <Button render={<Link href="/transit/dispatch" />}>Отправка машин</Button>
          </>
        }
      />

      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : summary.loading && !summary.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Перевезено за период"
              value={formatNumber(totals?.orders ?? 0)}
              hint="заказов в рейсах"
            />
            <KpiCard label="Вес" value={formatWeight(totals?.weightKg ?? 0)} />
            <KpiCard label="Рейсов" value={formatNumber(totals?.trips ?? 0)} />
            <KpiCard label="Перевозчиков" value={formatNumber(totals?.carriers ?? 0)} />
          </div>

          <DataTable
            data={summary.data?.carriers ?? []}
            columns={columns}
            initialSorting={[{ id: "orders", desc: true }]}
            pageSize={20}
            emptyMessage="За период рейсов не было — распределите заказы"
          />
        </>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="gap-0 py-0">
          <div className="flex items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <div className="text-base font-medium">Ждут распределения</div>
            {pending.data && (
              <div className="text-sm text-muted-foreground">
                {formatNumber(pending.data.reduce((sum, group) => sum + group.orders, 0))} заказов
              </div>
            )}
          </div>
          {pending.error ? (
            <div className="p-4">
              <ErrorState message={pending.error} onRetry={pending.reload} />
            </div>
          ) : pending.loading && !pending.data ? (
            <Skeleton className="m-4 h-48" />
          ) : (pending.data?.length ?? 0) === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Все заказы распределены.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(pending.data ?? []).slice(0, 12).map((group) => (
                <li key={`${group.route?.id}-${group.direction}`}>
                  <Link
                    href={{
                      pathname: "/transit/dispatch",
                      query: {
                        routeId: group.route?.id ?? "",
                        direction: group.direction,
                        warehouse: group.fromWarehouse,
                      },
                    }}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent/50"
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">{group.route?.code ?? "?"}</Badge>
                      <span title={`${group.fromWarehouse} → ${group.toWarehouse}`}>
                        {legLabel(group.fromWarehouse, group.toWarehouse)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {formatNumber(group.orders)}
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-0 py-0">
          <div className="border-b border-border px-4 py-3 text-base font-medium">
            Последние рейсы
          </div>
          {trips.loading && !trips.data ? (
            <Skeleton className="m-4 h-48" />
          ) : (trips.data?.length ?? 0) === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              За период рейсов не было.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(trips.data ?? []).map((trip) => (
                <li key={trip.id}>
                  <button
                    type="button"
                    onClick={() => setOpenTrip(trip)}
                    className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-accent/50"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{trip.carrier.name}</div>
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="secondary" className="mr-1.5">
                          {trip.route.code}
                        </Badge>
                        <span title={`${trip.fromWarehouse} → ${trip.toWarehouse}`}>
                          {legLabel(trip.fromWarehouse, trip.toWarehouse)}
                        </span>
                        {" · "}
                        {formatDate(trip.departedAt)}
                        {trip.driverName ? ` · ${trip.driverName}` : ""}
                        {trip.vehicleNumber ? ` · ${trip.vehicleNumber}` : ""}
                      </div>
                    </div>
                    <span className="tabular-nums">
                      {formatNumber(trip._count.legs)}{" "}
                      <span className="text-xs text-muted-foreground">заказов</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {((problems.data?.length ?? 0) > 0 || (detached.data?.length ?? 0) > 0) && (
        <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
              <TriangleAlert className="size-4" />
              Требуют внимания
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(detached.data?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <div className="font-medium">
                  Слетели с рейса: {formatNumber(detached.data?.length ?? 0)}
                </div>
                <p className="text-muted-foreground">
                  У этих заказов изменился маршрут — распределите их заново.
                </p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {(detached.data ?? []).slice(0, 5).map((leg) => (
                    <li key={leg.id}>
                      <Link href={`/orders/${leg.order.orderNumber}`} className="hover:underline">
                        {leg.order.orderNumber}
                      </Link>{" "}
                      · {leg.route.code} {legLabel(leg.fromWarehouse, leg.toWarehouse)}
                      {leg.detachedAt ? ` · ${formatDateTime(leg.detachedAt)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(problems.data?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <div className="font-medium">
                  Не разложились на плечи: {formatNumber(problems.data?.length ?? 0)}
                </div>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {(problems.data ?? []).slice(0, 5).map((problem) => (
                    <li key={problem.order.id}>
                      <Link
                        href={`/orders/${problem.order.orderNumber}`}
                        className="hover:underline"
                      >
                        {problem.order.orderNumber}
                      </Link>{" "}
                      · {TRANSIT_PROBLEM_LABEL[problem.status]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Sheet open={openTrip !== null} onOpenChange={(open) => !open && setOpenTrip(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
          {openTrip && (
            <TripDetail
              trip={openTrip}
              onCancelled={() => setOpenTrip(null)}
              onChanged={() => {
                trips.reload();
                pending.reload();
                summary.reload();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Состав рейса. Туда машина раздаёт заказы — важно, где каждый сходит;
 * обратно собирает по дороге — важнее, где его погрузили и кто это сделал.
 * Заказ можно снять: он вернётся в список ждущих.
 */
function TripDetail({
  trip,
  onChanged,
  onCancelled,
}: {
  trip: TransitTrip;
  onChanged: () => void;
  /** Рейса больше нет — закрываем лист, показывать в нём нечего. */
  onCancelled: () => void;
}) {
  const detail = useBackend(() => getTransitTrip(trip.id), [trip.id]);
  const [detaching, setDetaching] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const legs = useMemo(() => detail.data?.legs ?? [], [detail.data]);
  const byLoading = trip.direction === "REVERSE";
  const stops = useMemo(() => {
    const groups = new Map<string, typeof legs>();
    for (const leg of legs) {
      const key = byLoading ? leg.fromWarehouse : leg.toWarehouse;
      groups.set(key, [...(groups.get(key) ?? []), leg]);
    }
    return [...groups.entries()].map(([warehouse, items]) => ({ warehouse, legs: items }));
  }, [legs, byLoading]);

  const detach = async (legId: string) => {
    setDetaching(legId);
    try {
      await detachTripLeg(trip.id, legId);
      toast.success("Заказ снят с рейса — он вернулся в список ждущих");
      detail.reload();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось снять заказ");
    } finally {
      setDetaching(null);
    }
  };

  /**
   * Отмена рейса целиком.
   *
   * Машину заводят заранее и ошибаются: не тот перевозчик, пробная отправка.
   * Снимать заказы по одному долго, а лишний рейс попадёт в отчёт «кто сколько
   * вёз», поэтому запись удаляется, а заказы возвращаются в лист.
   */
  const cancel = async () => {
    setCancelling(true);
    try {
      const result = await cancelTransitTrip(trip.id);
      toast.success(
        result.orders > 0
          ? `Рейс отменён — ${formatNumber(result.orders)} заказов вернулись в лист`
          : "Рейс отменён",
      );
      setConfirming(false);
      onCancelled();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отменить рейс");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <SheetHeader className="border-b border-border">
        <SheetTitle className="flex flex-wrap items-center justify-between gap-2">
          {trip.carrier.name}
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={{
                    pathname: "/transit/dispatch",
                    query: {
                      routeId: trip.routeId,
                      direction: trip.direction === "FORWARD" ? "REVERSE" : "FORWARD",
                      warehouse: trip.toWarehouse,
                      carrierId: trip.carrierId,
                      ...(trip.driverName ? { driverName: trip.driverName } : {}),
                      ...(trip.vehicleNumber ? { vehicleNumber: trip.vehicleNumber } : {}),
                    },
                  }}
                />
              }
            >
              <RefreshCw className="size-4" />
              Обратный рейс
            </Button>
            {/* Отмена стоит последней: действие разрушительное, и промахнуться
                мимо «Обратного рейса» не должно быть легко. */}
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="size-4" />
              Отменить рейс
            </Button>
          </span>
        </SheetTitle>
        <SheetDescription>
          <Badge variant="secondary" className="mr-1.5">
            {trip.route.code}
          </Badge>
          <span title={`${trip.fromWarehouse} → ${trip.toWarehouse}`}>
            {legLabel(trip.fromWarehouse, trip.toWarehouse)}
          </span>
          {" · отправлен "}
          {formatDate(trip.departedAt)}
          {" · "}
          {formatNumber(trip._count.legs)} заказов
          {trip.driverName ? ` · водитель ${trip.driverName}` : ""}
          {trip.vehicleNumber ? ` · машина ${trip.vehicleNumber}` : ""}
          {trip.note ? ` · ${trip.note}` : ""}
        </SheetDescription>
      </SheetHeader>

      {detail.error ? (
        <div className="p-4">
          <ErrorState message={detail.error} onRetry={detail.reload} />
        </div>
      ) : detail.loading && !detail.data ? (
        <Skeleton className="m-4 h-64" />
      ) : (
        <div className="divide-y divide-border">
          {stops.map((stop) => (
            <div key={stop.warehouse}>
              <div className="bg-muted/50 px-4 py-1.5 text-xs font-medium" title={stop.warehouse}>
                {byLoading ? "Погружено в" : "Сходят в"} {shortWarehouse(stop.warehouse)}
                <span className="ml-1.5 text-muted-foreground">
                  {formatNumber(stop.legs.length)} ·{" "}
                  {formatWeight(stop.legs.reduce((sum, leg) => sum + leg.order.weight, 0))}
                  {byLoading && stop.legs[0]?.attachedBy ? ` · ${stop.legs[0].attachedBy}` : ""}
                </span>
              </div>
              <ul className="divide-y divide-border text-sm">
                {stop.legs.map((leg) => (
                  <li key={leg.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/orders/${leg.order.orderNumber}`}
                        className="font-medium tabular-nums hover:underline"
                      >
                        {leg.order.orderNumber}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {leg.order.customerName ?? "—"}
                        {leg.order.receiverCity ? ` · ${leg.order.receiverCity}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatWeight(leg.order.weight)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => detach(leg.id)}
                        disabled={detaching === leg.id}
                        title="Снять с рейса"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Отменить рейс?</DialogTitle>
            <DialogDescription>
              {trip.carrier.name} · {legLabel(trip.fromWarehouse, trip.toWarehouse)} ·{" "}
              {formatDate(trip.departedAt)}. Запись рейса удалится,{" "}
              {formatNumber(trip._count.legs)} заказов вернутся в лист отправки — их можно будет
              отправить заново.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" render={<DialogClose />}>
              Не отменять
            </Button>
            <Button variant="destructive" onClick={cancel} disabled={cancelling}>
              {cancelling ? "Отменяю…" : "Отменить рейс"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
