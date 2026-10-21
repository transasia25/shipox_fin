"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calculator, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { SelectField } from "@/components/ui-kit/select-field";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
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
  formatMoneyShort,
  formatNumber,
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
        cell: ({ row }) => <span className="tabular-nums">{row.original.orders}</span>,
      },
      {
        id: "unpriced",
        header: "Без цены",
        accessorFn: (r) => r.unpriced,
        meta: { align: "center" },
        cell: ({ row }) =>
          row.original.unpriced > 0 ? (
            <span className="font-medium text-destructive tabular-nums">
              {row.original.unpriced}
            </span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
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
    ],
    [],
  );

  const totals = summary.data?.totals;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Клиенты и расчёты"
        description="Сколько каждый клиент должен заплатить за доставку. Стоимость считает тарифный калькулятор по нашим тарифным планам — суммы Shipox не используются."
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
              hint={`${formatNumber(totals?.priced ?? 0)} из ${formatNumber(totals?.orders ?? 0)} заказов посчитано`}
            />
            <KpiCard
              label="Из них предварительно"
              value={formatMoneyShort(totals?.provisionalAmount ?? 0)}
              tone={totals?.provisionalAmount ? "warning" : "default"}
              hint="клиенты без своего тарифа в калькуляторе"
            />
            <KpiCard
              label="Заказов без цены"
              value={formatNumber(totals?.unpriced ?? 0)}
              tone={totals?.unpriced ? "negative" : "default"}
            />
            <KpiCard
              label="Клиентов"
              value={formatNumber(summary.data?.clients.length ?? 0)}
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

      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
          {detail && (
            <ClientOrders client={detail} from={window.from} to={window.to} basis={basis} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Заказы клиента за период — из чего сложилась сумма в счёте.
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
  const total = priced.reduce((sum, row) => sum + (row.amount ?? 0), 0);

  return (
    <>
      <SheetHeader className="border-b border-border">
        <SheetTitle>{client.customerName}</SheetTitle>
        <SheetDescription>
          {`Заказов ${formatNumber(client.orders)} · посчитано ${formatNumber(client.priced)} · к оплате ${formatMoneyShort(client.total)}`}
          {client.provisional && " · тариф по умолчанию, сумма предварительная"}
        </SheetDescription>
      </SheetHeader>

      {orders.error ? (
        <div className="p-4">
          <ErrorState message={orders.error} onRetry={orders.reload} />
        </div>
      ) : orders.data === null ? (
        <Skeleton className="m-4 h-64" />
      ) : (
        <>
          <ul className="divide-y divide-border text-sm">
            {rows.map((order) => (
              <ClientOrderLine key={order.orderId} order={order} basis={basis} />
            ))}
          </ul>
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">За период заказов нет.</p>
          ) : (
            // Итог по показанным строкам: он должен сойтись с суммой в таблице.
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">
                Итого по {formatNumber(priced.length)}{" "}
                {plural(priced.length, "заказу", "заказам", "заказам")}
                {/* Список длиннее, чем отдаёт один запрос: итог ниже суммы в таблице. */}
                {rows.length < client.orders &&
                  ` · показаны последние ${formatNumber(rows.length)} из ${formatNumber(client.orders)}`}
              </span>
              <Money value={total} className="font-medium" />
            </div>
          )}
        </>
      )}
    </>
  );
}

function ClientOrderLine({
  order,
  basis,
}: {
  order: PricingClientOrder;
  basis: PricingBasis;
}) {
  // Дата та же, по которой заказ попал в период: иначе строка выглядела бы
  // выпавшей из отбора.
  const date =
    basis === "DELIVERED" && order.deliveredDate
      ? `доставлен ${formatDate(order.deliveredDate)}`
      : formatDate(order.createdDate);

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/orders/${order.orderNumber}`}
            className="font-medium tabular-nums hover:underline"
          >
            {order.orderNumber}
          </Link>
          <span className="text-xs text-muted-foreground">{order.statusLabel}</span>
          {order.provisional && <Badge variant="outline">предв.</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">
          {[
            date,
            [order.senderCity, order.receiverCity].filter(Boolean).join(" → "),
            `${formatWeight(order.weightKg)} опл.`,
            order.boxCount > 1 ? `${order.boxCount} мест` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {/* Почему заказ не попал в сумму — дословно от калькулятора. */}
        {order.amount === null && (
          <div className="text-xs text-amber-700 dark:text-amber-400">
            {order.error ?? (order.status === null ? "ещё не считали" : "цены нет")}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        {order.amount === null ? (
          <span className="text-xs text-muted-foreground">без цены</span>
        ) : (
          <Money value={order.amount} />
        )}
      </div>
    </li>
  );
}
