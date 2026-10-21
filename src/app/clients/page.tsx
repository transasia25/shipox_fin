"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calculator, RefreshCw, Truck, TriangleAlert, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { Money, MarginValue } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import {
  getPricingSummary,
  listClientOrders,
  listUnmatchedClients,
  runPricing,
} from "@/lib/backend/client";
import type { PricingBasis, PricingClientOrder, PricingClientRow } from "@/lib/backend/types";
import {
  formatDate,
  formatDateRange,
  formatMoneyShort,
  formatNumber,
  formatPercent,
  formatWeight,
  plural,
} from "@/lib/format";
import { useFinanceStore } from "@/lib/store";

/**
 * Что означает выбранный отбор.
 *
 * Без подписи одну и ту же сумму можно прочитать тремя способами: расчёт идёт
 * по дате создания, а счёт выставляют за доставленное.
 */
const BASIS_HINT: Record<PricingBasis, string> = {
  CREATED:
    "Все заказы, созданные за период, — так же работает сам расчёт стоимости. Часть из них ещё в пути.",
  DELIVERED:
    "Только доставленные, в период попадают по дате доставки — так же считается выручка в дашборде.",
  CREATED_DELIVERED:
    "Заказы, созданные за период и уже доставленные, — что из этого периода можно выставлять в счёт.",
};

/** Короткая подпись отбора — для шапки окна с заказами. */
const BASIS_SHORT: Record<PricingBasis, string> = {
  CREATED: "по дате создания",
  DELIVERED: "доставленные, по дате доставки",
  CREATED_DELIVERED: "доставленные из созданных за период",
};

export default function ClientsPage() {
  const period = useFinanceStore((s) => s.period);
  const window = { from: period.from, to: period.to };
  const [running, setRunning] = useState(false);
  /// Какие заказы считать: все по дате создания или только доставленные.
  const [basis, setBasis] = useState<PricingBasis>("CREATED");
  /// Клиент, по которому открыта детализация заказов.
  const [detail, setDetail] = useState<PricingClientRow | null>(null);

  const summary = useBackend(
    () => getPricingSummary({ ...window, basis }),
    [window.from, window.to, basis],
  );
  const unmatched = useBackend(() => listUnmatchedClients(), []);

  const recalculate = async (force: boolean) => {
    setRunning(true);
    try {
      const result = await runPricing({ ...window, force });
      toast.success(
        `Посчитано ${formatNumber(result.priced)} из ${formatNumber(result.considered)}` +
          (result.skipped > 0 ? `, пропущено ${result.skipped}` : ""),
      );
      summary.reload();
      unmatched.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Расчёт не удался");
    } finally {
      setRunning(false);
    }
  };

  const columns = useMemo<ColumnDef<PricingClientRow, unknown>[]>(
    () => [
      {
        id: "customerName",
        header: "Клиент",
        accessorFn: (r) => r.customerName,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.customerName}</div>
            {row.original.provisional && (
              <div className="text-xs text-amber-600 dark:text-amber-400">
                тариф по умолчанию — сумма предварительная
              </div>
            )}
          </div>
        ),
      },
      {
        id: "orders",
        header: "Заказов",
        accessorFn: (r) => r.orders,
        meta: { align: "center" },
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="tabular-nums">{formatNumber(row.original.orders)}</div>
            {row.original.unpriced > 0 && (
              <div className="text-xs text-destructive tabular-nums">
                {formatNumber(row.original.unpriced)} без цены
              </div>
            )}
          </div>
        ),
      },
      {
        id: "total",
        header: "К оплате",
        accessorFn: (r) => r.total,
        meta: { align: "right" },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Money value={row.original.total} className="font-medium" />
            {row.original.provisional && <Badge variant="outline">предв.</Badge>}
          </div>
        ),
      },
      {
        id: "courierCost",
        header: "Курьеры",
        accessorFn: (r) => r.courierCost,
        meta: { align: "right", className: "hidden sm:table-cell" },
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <Money value={row.original.courierCost} className="text-muted-foreground" />
            {row.original.courierShiftCost > 0 && (
              <div className="text-xs text-muted-foreground">
                из них смены {formatMoneyShort(row.original.courierShiftCost)}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "transitCost",
        header: "Межгород",
        accessorFn: (r) => r.transitCost,
        meta: { align: "right", className: "hidden sm:table-cell" },
        cell: ({ row }) =>
          row.original.ordersInTransit === 0 ? (
            <span className="text-muted-foreground/50">—</span>
          ) : (
            <div className="space-y-0.5">
              <Money value={row.original.transitCost} className="text-muted-foreground" />
              <div className="text-xs text-muted-foreground">
                {formatNumber(row.original.ordersInTransit)} из{" "}
                {formatNumber(row.original.orders)} уехали
              </div>
            </div>
          ),
      },
      {
        id: "profit",
        header: "Прибыль",
        accessorFn: (r) => r.profit,
        meta: { align: "right" },
        cell: ({ row }) => (
          <MarginValue value={row.original.profit} pct={row.original.margin} />
        ),
      },
    ],
    [],
  );

  const totals = summary.data?.totals;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Клиенты и расчёты"
        description="Сколько клиент должен заплатить и сколько его заказы стоили нам. Цену считает тарифный калькулятор; расход — начисления курьерам по заказам клиента и доля рейса межгорода по оплачиваемому весу."
        actions={
          <>
            <Button variant="outline" onClick={() => recalculate(false)} disabled={running}>
              <RefreshCw className={running ? "size-4 animate-spin" : "size-4"} />
              Досчитать
            </Button>
            <Button onClick={() => recalculate(true)} disabled={running}>
              <Calculator className="size-4" />
              Пересчитать всё
            </Button>
          </>
        }
      />

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Что считать</Label>
            <SelectField
              value={basis}
              onChange={(next) => setBasis(next as PricingBasis)}
              className="min-w-64"
              options={[
                { value: "CREATED", label: "Все — по дате создания" },
                { value: "DELIVERED", label: "Доставленные — по дате доставки" },
                { value: "CREATED_DELIVERED", label: "Доставленные — по дате создания" },
              ]}
            />
          </div>
          <div className="max-w-xl space-y-0.5 text-xs text-muted-foreground">
            <p>{BASIS_HINT[basis]}</p>
            {/* Прогон расчёта отбор не читает: версия тарифа выбирается по дате создания. */}
            {basis !== "CREATED" && (
              <p>Кнопки пересчёта всегда идут по дате создания — фильтр меняет только отчёт.</p>
            )}
          </div>
        </div>
      </Card>

      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : summary.loading && !summary.data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="К оплате за период"
              value={formatMoneyShort(totals?.amount ?? 0)}
              icon={<Wallet className="size-4" />}
              hint={
                `${formatNumber(totals?.priced ?? 0)} из ${formatNumber(totals?.orders ?? 0)} посчитано` +
                (totals?.provisionalAmount
                  ? ` · предварительно ${formatMoneyShort(totals.provisionalAmount)}`
                  : "")
              }
            />
            <KpiCard
              label="Курьеры"
              value={formatMoneyShort(totals?.courierCost ?? 0)}
              icon={<Users className="size-4" />}
              hint={
                `из них смены ${formatMoneyShort(totals?.courierShiftCost ?? 0)}` +
                (totals?.shiftUnallocated
                  ? ` · не на что разнести ${formatMoneyShort(totals.shiftUnallocated)}`
                  : "")
              }
            />
            <KpiCard
              label="Межгород"
              value={formatMoneyShort(totals?.transitCost ?? 0)}
              icon={<Truck className="size-4" />}
              hint="доля рейсов по оплачиваемому весу заказа"
            />
            <KpiCard
              label="Прибыль"
              value={formatMoneyShort(totals?.profit ?? 0)}
              tone={(totals?.profit ?? 0) < 0 ? "negative" : "positive"}
              hint={
                `маржа ${formatPercent(totals?.margin ?? 0)} · на заказ ` +
                `${formatNumber(totals?.perOrderProfit ?? 0)} при цене ${formatNumber(totals?.perOrderRevenue ?? 0)}`
              }
            />
          </div>

          {(unmatched.data?.length ?? 0) > 0 && (
            <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
                  <TriangleAlert className="size-4" />
                  Нет своего тарифа в калькуляторе
                </CardTitle>
                <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                  Эти клиенты считаются по тарифу по умолчанию — суммы по ним предварительные.
                  Заведите их в калькуляторе, и расчёт станет точным.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {unmatched.data?.map((client) => (
                    <Badge key={client.shipoxCustomerId} variant="outline" className="gap-1.5">
                      {client.shipoxCustomerName}
                      <span className="opacity-70">
                        {client.orders} {plural(client.orders, "заказ", "заказа", "заказов")}
                      </span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <DataTable
            data={summary.data?.clients ?? []}
            columns={columns}
            initialSorting={[{ id: "total", desc: true }]}
            onRowClick={(row) => setDetail(row)}
            pageSize={50}
            emptyMessage="За выбранный период заказов нет"
          />
        </>
      )}

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        {/* Широкое окно по центру: в детализации восемь столбцов с деньгами, в
            узкой панели они не читались. */}
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,calc(100vw-4rem))]">
          {detail && (
            <ClientOrders client={detail} from={window.from} to={window.to} basis={basis} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Заказы клиента: из чего сложились и счёт, и себестоимость.
 *
 * Заказы без цены показываются здесь же: иначе непонятно, почему сумма меньше
 * ожидаемой, а причина от калькулятора осталась бы только в отчёте о проблемах.
 */
function ClientOrders({
  client,
  from,
  to,
  basis,
}: {
  client: PricingClientRow;
  from: string;
  to: string;
  basis: PricingBasis;
}) {
  const orders = useBackend(
    () => listClientOrders({ customerId: client.customerId, from, to, basis }),
    [client.customerId, from, to, basis],
  );

  const rows = orders.data ?? [];
  const priced = rows.filter((row) => row.amount !== null);
  const revenue = priced.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const courierCost = rows.reduce((sum, row) => sum + row.courierCost, 0);
  const transitCost = rows.reduce((sum, row) => sum + row.transitCost, 0);
  const profit = revenue - courierCost - transitCost;

  const columns = useMemo<ColumnDef<PricingClientOrder, unknown>[]>(
    () => [
      {
        id: "order",
        header: "Заказ",
        accessorFn: (r) => r.orderNumber,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <Link
              href={`/orders/${row.original.orderNumber}`}
              className="font-medium tabular-nums hover:underline"
            >
              {row.original.orderNumber}
            </Link>
            <div className="text-xs text-muted-foreground">{row.original.statusLabel}</div>
          </div>
        ),
      },
      {
        id: "date",
        header: "Дата",
        accessorFn: (r) => (basis === "DELIVERED" ? r.deliveredDate : r.createdDate) ?? "",
        cell: ({ row }) => {
          // Дата та же, по которой заказ попал в период: иначе строка выглядела
          // бы выпавшей из отбора.
          const delivered = basis === "DELIVERED" && row.original.deliveredDate;
          return (
            <span className="whitespace-nowrap text-muted-foreground">
              {formatDate(delivered ? row.original.deliveredDate! : row.original.createdDate)}
            </span>
          );
        },
      },
      {
        id: "route",
        header: "Маршрут",
        accessorFn: (r) => `${r.senderCity ?? ""} ${r.receiverCity ?? ""}`,
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {[row.original.senderCity, row.original.receiverCity].filter(Boolean).join(" → ")}
          </span>
        ),
      },
      {
        id: "weight",
        header: "Вес",
        accessorFn: (r) => r.weightKg,
        meta: { align: "right", className: "hidden sm:table-cell" },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground tabular-nums">
            {formatWeight(row.original.weightKg)}
          </span>
        ),
      },
      {
        id: "amount",
        header: "К оплате",
        accessorFn: (r) => r.amount ?? -1,
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.amount === null ? (
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">без цены</span>
              {/* Почему заказ не попал в сумму — дословно от калькулятора. */}
              <div className="max-w-40 text-xs text-amber-700 dark:text-amber-400">
                {row.original.error ?? (row.original.status === null ? "ещё не считали" : "цены нет")}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <Money value={row.original.amount} />
              {row.original.provisional && <Badge variant="outline">предв.</Badge>}
            </div>
          ),
      },
      {
        id: "courier",
        header: "Курьеры",
        accessorFn: (r) => r.courierCost,
        meta: { align: "right" },
        cell: ({ row }) => <CourierCost order={row.original} />,
      },
      {
        id: "transit",
        header: "Межгород",
        accessorFn: (r) => r.transitCost,
        meta: { align: "right" },
        cell: ({ row }) => <TransitCost order={row.original} />,
      },
      {
        id: "profit",
        header: "Прибыль",
        accessorFn: (r) => r.profit ?? 0,
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.profit === null ? (
            <span className="text-muted-foreground/50">—</span>
          ) : (
            <MarginValue value={row.original.profit} pct={row.original.margin ?? undefined} />
          ),
      },
    ],
    [basis],
  );

  return (
    <>
      <DialogHeader className="shrink-0 gap-1 border-b border-border p-4 pr-12">
        <DialogTitle>{client.customerName}</DialogTitle>
        <DialogDescription>
          {`${formatDateRange(from, to)} · ${BASIS_SHORT[basis]} · заказов ${formatNumber(client.orders)}`}
          {client.provisional && " · тариф по умолчанию, сумма предварительная"}
        </DialogDescription>
      </DialogHeader>

      {orders.error ? (
        <div className="p-4">
          <ErrorState message={orders.error} onRetry={orders.reload} />
        </div>
      ) : orders.data === null ? (
        <Skeleton className="m-4 h-64" />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="К оплате" value={formatMoneyShort(client.total)} />
            <KpiCard
              label="Курьеры"
              value={formatMoneyShort(client.courierCost)}
              hint={
                client.courierShiftCost > 0
                  ? `из них смены ${formatMoneyShort(client.courierShiftCost)}`
                  : undefined
              }
            />
            <KpiCard
              label="Межгород"
              value={formatMoneyShort(client.transitCost)}
              hint={`${formatNumber(client.ordersInTransit)} ${plural(client.ordersInTransit, "заказ", "заказа", "заказов")} уехали`}
            />
            <KpiCard
              label="Прибыль"
              value={formatMoneyShort(client.profit)}
              tone={client.profit < 0 ? "negative" : "positive"}
              hint={`маржа ${formatPercent(client.margin)} · на заказ ${formatNumber(
                client.orders > 0 ? Math.round(client.profit / client.orders) : 0,
              )}`}
            />
          </div>

          <DataTable
            data={rows}
            columns={columns}
            initialSorting={[{ id: "date", desc: true }]}
            pageSize={100}
            emptyMessage="За период заказов нет"
            footer={
              rows.length === 0 ? undefined : (
                // Итог по всем строкам ответа, а не по текущей странице: он
                // должен сходиться со строкой клиента в таблице.
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
                  <span className="text-muted-foreground">
                    Итого по {formatNumber(priced.length)}{" "}
                    {plural(priced.length, "заказу", "заказам", "заказам")}
                    {rows.length < client.orders &&
                      ` · показаны последние ${formatNumber(rows.length)} из ${formatNumber(client.orders)}`}
                  </span>
                  <span className="flex flex-wrap items-center gap-4">
                    <Money value={revenue} className="font-medium" />
                    <Money value={courierCost} className="text-muted-foreground" />
                    <Money value={transitCost} className="text-muted-foreground" />
                    <MarginValue
                      value={profit}
                      pct={revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : undefined}
                    />
                  </span>
                </div>
              )
            }
          />
        </div>
      )}
    </>
  );
}

/** Расход на курьеров по заказу: сдельные начисления и доля смены. */
function CourierCost({ order }: { order: PricingClientOrder }) {
  if (order.courierLegs === 0 && order.byShiftLegs === 0) {
    return <span className="text-muted-foreground/50">—</span>;
  }

  // Плечи есть, а денег нет: смену за этот день ещё не начислили.
  if (order.courierCost === 0 && order.byShiftLegs > 0) {
    return <span className="text-xs text-amber-700 dark:text-amber-400">смена не начислена</span>;
  }

  return (
    <div className="space-y-0.5">
      <Money value={order.courierCost} />
      {order.courierShift > 0 && (
        <div className="text-xs text-muted-foreground">
          смена {formatNumber(order.courierShift)}
          {order.shiftOrders > 0 &&
            ` · 1 из ${formatNumber(order.shiftOrders)} ${plural(order.shiftOrders, "заказа", "заказов", "заказов")} дня`}
        </div>
      )}
    </div>
  );
}

/**
 * Доля рейса межгорода.
 *
 * Рядом с суммой всегда стоит, из чего она получилась: на полупустом рейсе доля
 * огромна, и без веса рейса её нельзя прочитать правильно.
 */
function TransitCost({ order }: { order: PricingClientOrder }) {
  if (order.inTransitDays === 0) {
    return (
      <span className="text-muted-foreground/50" title="в межгород не уезжал">
        —
      </span>
    );
  }

  if (order.transitRuns === 0) {
    return <span className="text-xs text-amber-700 dark:text-amber-400">плечи не посчитаны</span>;
  }

  return (
    <div className="space-y-0.5">
      <Money value={order.transitCost} />
      <div className="text-xs text-muted-foreground">
        {`${formatWeight(order.weightKg)} из ${formatWeight(order.runWeightKg)}`}
        {order.sharePct !== null && ` · ${formatPercent(order.sharePct)}`}
        {order.transitRuns > 1 && ` · ${order.transitRuns} рейса`}
      </div>
    </div>
  );
}
