"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calculator, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { useBackend } from "@/hooks/use-backend";
import { getPricingSummary, listUnmatchedClients, runPricing } from "@/lib/backend/client";
import type { PricingClientRow } from "@/lib/backend/types";
import { formatMoneyShort, formatNumber, plural } from "@/lib/format";
import { useFinanceStore } from "@/lib/store";

export default function ClientsPage() {
  const period = useFinanceStore((s) => s.period);
  const window = { from: period.from, to: period.to };
  const [running, setRunning] = useState(false);

  const summary = useBackend(() => getPricingSummary(window), [window.from, window.to]);
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
            pageSize={50}
            emptyMessage="За выбранный период заказов нет"
          />
        </>
      )}
    </div>
  );
}
