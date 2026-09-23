"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calculator, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import {
  getCourierPayoutSummary,
  listCourierPayouts,
  runCourierPayouts,
} from "@/lib/backend/client";
import type {
  CourierPayout,
  CourierPayoutStatus,
  CourierPayoutSummaryRow,
} from "@/lib/backend/types";
import {
  LEG_LABEL,
  PAYOUT_SOURCE_LABEL,
  PAYOUT_STATUS_LABEL,
  RATE_KIND_LABEL,
  payoutCityLabel,
} from "@/lib/courier-payouts";
import { formatDateTime, formatMoneyShort, formatNumber, formatWeight } from "@/lib/format";
import { useFinanceStore } from "@/lib/store";

/** Что открыто в боковой панели: начисления курьера или список проблем одного вида. */
type Detail =
  | { kind: "courier"; row: CourierPayoutSummaryRow }
  | { kind: "status"; status: Exclude<CourierPayoutStatus, "CALCULATED">; count: number };

export default function CourierPayoutsPage() {
  const period = useFinanceStore((s) => s.period);
  const window = { from: period.from, to: period.to };
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);

  // Пустая строка — «все»: так же, как склад на отправке машин.
  const [hub, setHub] = useState("");
  const [city, setCity] = useState("");
  const place = { hub: hub || undefined, city: city || undefined };

  const summary = useBackend(
    () => getCourierPayoutSummary({ ...window, ...place }),
    [window.from, window.to, hub, city],
  );
  const totals = summary.data?.totals;

  // Списки собираются из самих начислений: в них только те города, где за
  // период действительно была работа, и регион каждого известен сразу.
  const places = useMemo(() => summary.data?.places ?? [], [summary.data]);
  const hubOptions = useMemo(() => {
    const names = [...new Set(places.map((item) => item.hub).filter((name) => name !== null))];
    return [
      { value: "", label: "Все регионы" },
      ...names.sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })),
    ];
  }, [places]);
  const cityOptions = useMemo(() => {
    const scoped = hub ? places.filter((item) => item.hub === hub) : places;
    return [
      { value: "", label: hub ? "Все города региона" : "Все города" },
      ...scoped.map((item) => ({
        value: item.city,
        label: `${item.city} · ${formatNumber(item.payouts)}`,
      })),
    ];
  }, [places, hub]);

  /** Регион и город связаны: чужой город в выбранном регионе — пустая таблица. */
  const chooseHub = (next: string) => {
    setHub(next);
    if (next && city && !places.some((item) => item.hub === next && item.city === city)) {
      setCity("");
    }
  };

  const recalculate = async () => {
    setRunning(true);
    try {
      const result = await runCourierPayouts({ ...window });
      toast.success(
        `Пересчитано: новых ${result.created}, изменено ${result.updated}, снято ${result.removed}, ` +
          `без изменений ${result.unchanged}`,
      );
      summary.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Пересчёт не удался");
    } finally {
      setRunning(false);
    }
  };

  const columns = useMemo<ColumnDef<CourierPayoutSummaryRow, unknown>[]>(
    () => [
      {
        id: "courier",
        header: "Курьер",
        accessorFn: (r) => r.courierName,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.courierName}</div>
            {!row.original.courierId && (
              <div className="text-xs text-amber-600 dark:text-amber-400">нет в справочнике курьеров</div>
            )}
          </div>
        ),
      },
      {
        id: "pickups",
        header: "Заборов",
        accessorFn: (r) => r.pickups,
        meta: { align: "right" },
        cell: ({ row }) => <Count value={row.original.pickups} />,
      },
      {
        id: "deliveries",
        header: "Доставок",
        accessorFn: (r) => r.deliveries,
        meta: { align: "right" },
        cell: ({ row }) => <Count value={row.original.deliveries} />,
      },
      {
        id: "heavy",
        header: "Из них тяжёлых",
        accessorFn: (r) => r.heavy,
        meta: { align: "right" },
        cell: ({ row }) => <Count value={row.original.heavy} />,
      },
      {
        id: "unpaid",
        header: "Без суммы",
        accessorFn: (r) => r.notPayable + r.cityNotFound + r.noTariff,
        meta: { align: "right" },
        cell: ({ row }) => {
          const { notPayable, cityNotFound, noTariff } = row.original;
          const total = notPayable + cityNotFound + noTariff;
          if (total === 0) return <span className="text-muted-foreground/50">—</span>;
          const reasons = [
            notPayable && `служебная учётка: ${notPayable}`,
            cityNotFound && `города нет в справочнике: ${cityNotFound}`,
            noTariff && `нет тарифа: ${noTariff}`,
          ].filter(Boolean);
          return (
            <span className="text-amber-700 tabular-nums dark:text-amber-400" title={reasons.join(", ")}>
              {total}
            </span>
          );
        },
      },
      {
        id: "amount",
        header: "Начислено",
        accessorFn: (r) => r.amount,
        meta: { align: "right" },
        cell: ({ row }) => <Money value={row.original.amount} className="font-medium" />,
      },
    ],
    [],
  );

  const problems = totals
    ? (
        [
          ["NOT_PAYABLE", totals.notPayable],
          ["CITY_NOT_FOUND", totals.cityNotFound],
          ["NO_TARIFF", totals.noTariff],
        ] as const
      ).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Начисления курьерам"
        description="За забор у клиента и доставку получателю — по тарифу курьеров: город, район или тяжёлый заказ. Период — по дате приёмки на складе или доставки. Фильтр по месту работы: у забора это город отправителя, у доставки — получателя."
        actions={
          <>
            <Button variant="outline" render={<Link href="/courier-tariffs" />}>
              Тарифы курьеров
            </Button>
            <Button onClick={recalculate} disabled={running}>
              <Calculator className="size-4" />
              {running ? "Пересчитываю…" : "Пересчитать"}
            </Button>
          </>
        }
      />

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Регион</Label>
            <SelectField
              value={hub}
              onChange={chooseHub}
              options={hubOptions}
              placeholder="Все регионы"
              className="min-w-52"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Город</Label>
            <SelectField
              value={city}
              onChange={setCity}
              options={cityOptions}
              placeholder={hub ? "Все города региона" : "Все города"}
              className="min-w-60"
            />
          </div>
          {(hub || city) && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={() => {
                setHub("");
                setCity("");
              }}
            >
              Сбросить
            </Button>
          )}
        </div>
      </Card>

      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : summary.loading && !summary.data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Начислено за период" value={formatMoneyShort(totals?.amount ?? 0)} />
            <KpiCard label="Заборов" value={formatNumber(totals?.pickups ?? 0)} />
            <KpiCard label="Доставок" value={formatNumber(totals?.deliveries ?? 0)} />
            <KpiCard
              label="Тяжёлых заказов"
              value={formatNumber(totals?.heavy ?? 0)}
              hint="по ставке за тяжёлый"
            />
          </div>

          {problems.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
                  <TriangleAlert className="size-4" />
                  Работа есть, а суммы нет
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {problems.map(([status, count]) => (
                  <Button
                    key={status}
                    variant="outline"
                    size="sm"
                    onClick={() => setDetail({ kind: "status", status, count })}
                  >
                    {PAYOUT_STATUS_LABEL[status]}: {formatNumber(count)}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          <DataTable
            data={summary.data?.couriers ?? []}
            columns={columns}
            initialSorting={[{ id: "amount", desc: true }]}
            onRowClick={(row) => setDetail({ kind: "courier", row })}
            pageSize={50}
            emptyMessage="За период начислений нет"
          />
        </>
      )}

      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
          {detail && (
            <PayoutDetail detail={detail} from={window.from} to={window.to} place={place} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Count({ value }: { value: number }) {
  return value > 0 ? (
    <span className="tabular-nums">{formatNumber(value)}</span>
  ) : (
    <span className="text-muted-foreground/50">—</span>
  );
}

function PayoutDetail({
  detail,
  from,
  to,
  place,
}: {
  detail: Detail;
  from: string;
  to: string;
  /** Тот же регион и город, что в таблице: иначе суммы в панели не сойдутся. */
  place: { hub?: string; city?: string };
}) {
  const query =
    detail.kind === "courier"
      ? detail.row.courierId
        ? { courierId: detail.row.courierId }
        : { shipoxDriverId: detail.row.shipoxDriverId ?? undefined }
      : { status: detail.status };
  const payouts = useBackend(
    () => listCourierPayouts({ ...query, ...place, from, to }),
    [JSON.stringify(query), from, to, place.hub, place.city],
  );

  return (
    <>
      <SheetHeader className="border-b border-border">
        <SheetTitle>
          {detail.kind === "courier" ? detail.row.courierName : PAYOUT_STATUS_LABEL[detail.status]}
        </SheetTitle>
        <SheetDescription>
          {detail.kind === "courier"
            ? `Заборов ${detail.row.pickups}, доставок ${detail.row.deliveries} · начислено ${formatMoneyShort(detail.row.amount)}`
            : `${formatNumber(detail.count)} — работа учтена, но сумма не начислена`}
        </SheetDescription>
      </SheetHeader>

      {payouts.error ? (
        <div className="p-4">
          <ErrorState message={payouts.error} onRetry={payouts.reload} />
        </div>
      ) : payouts.loading && !payouts.data ? (
        <Skeleton className="m-4 h-64" />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {(payouts.data ?? []).map((payout) => (
            <PayoutLine key={payout.id} payout={payout} showCourier={detail.kind === "status"} />
          ))}
        </ul>
      )}
    </>
  );
}

function PayoutLine({ payout, showCourier }: { payout: CourierPayout; showCourier: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Badge variant="secondary">{LEG_LABEL[payout.leg]}</Badge>
          {payout.order && (
            <Link href={`/orders/${payout.order.orderNumber}`} className="font-medium tabular-nums hover:underline">
              {payout.order.orderNumber}
            </Link>
          )}
          {showCourier && <span>{payout.courierName}</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {[
            payoutCityLabel(payout),
            formatWeight(payout.weightKg),
            PAYOUT_SOURCE_LABEL[payout.source],
            formatDateTime(payout.earnedAt),
          ].join(" · ")}
        </div>
        {payout.order?.customerName && (
          <div className="text-xs text-muted-foreground">{payout.order.customerName}</div>
        )}
      </div>
      <div className="text-right">
        {payout.status === "CALCULATED" && payout.amount !== null ? (
          <>
            <Money value={Number(payout.amount)} className="font-medium" />
            {payout.rateKind && (
              <div className="text-xs text-muted-foreground">{RATE_KIND_LABEL[payout.rateKind]}</div>
            )}
          </>
        ) : (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {PAYOUT_STATUS_LABEL[payout.status]}
          </span>
        )}
      </div>
    </li>
  );
}
