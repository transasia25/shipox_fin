"use client";

import Link from "next/link";
import { Activity, Database, Download, Package, TrendingUp, Truck, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RevenueChart, type WeekPoint } from "@/components/charts/revenue-chart";
import { ErrorState } from "@/components/ui-kit/error-state";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { useBackend } from "@/hooks/use-backend";
import {
  getHealth,
  getOrdersStats,
  getProfit,
  getSyncState,
  listExports,
} from "@/lib/backend/client";
import type { FinanceProfit } from "@/lib/backend/types";
import {
  formatDate,
  formatDateTime,
  formatMoneyShort,
  formatNumber,
  formatWeight,
  plural,
} from "@/lib/format";
import { useSession } from "@/lib/session";
import { useFinanceStore } from "@/lib/store";

/** Кому показываем деньги: диспетчеру и кладовщику прибыль не нужна. */
const MONEY_ROLES = ["ADMIN", "ACCOUNTANT", "VIEWER"];

export default function DashboardPage() {
  const period = useFinanceStore((s) => s.period);
  const window = { from: period.from, to: period.to };

  const session = useSession();
  const showMoney =
    session.status === "signed-in" && MONEY_ROLES.includes(session.user.role);

  const stats = useBackend(() => getOrdersStats(window), [window.from, window.to]);
  const profit = useBackend(
    () => (showMoney ? getProfit(window) : Promise.resolve(null)),
    [window.from, window.to, showMoney],
  );
  const health = useBackend(() => getHealth(), []);
  const sync = useBackend(() => getSyncState(), []);
  const exports = useBackend(() => listExports({ limit: 5 }), []);

  if (stats.error) {
    return (
      <div className="space-y-5">
        <PageHeader title="Дашборд" />
        <ErrorState message={stats.error} onRetry={stats.reload} />
      </div>
    );
  }

  const lastExport = exports.data?.[0];
  const lastSync = sync.data?.lastRuns?.[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Дашборд"
        description="Что выгружено из Shipox за выбранный период и в каком состоянии синхронизация."
        actions={
          <Button variant="outline" render={<Link href="/exports" />}>
            <Download className="size-4" />
            Выгрузки
          </Button>
        }
      />

      {showMoney && <ProfitBlock data={profit.data} error={profit.error} onRetry={profit.reload} />}

      {stats.loading && !stats.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        stats.data && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Заказов за период"
              value={formatNumber(stats.data.total)}
              icon={<Package className="size-4" />}
            />
            <KpiCard
              label="Доставлено"
              value={formatNumber(stats.data.delivered)}
              tone="positive"
              hint={
                stats.data.total > 0
                  ? `${Math.round((stats.data.delivered / stats.data.total) * 100)}% от периода`
                  : undefined
              }
            />
            <KpiCard
              label="Мест"
              value={formatNumber(stats.data.pieces)}
              hint={`фактический вес ${formatWeight(stats.data.weightKg)}`}
            />
            <KpiCard
              label="Оплачиваемый вес"
              value={formatWeight(stats.data.chargeableWeightKg)}
              hint="больший из фактического и объёмного"
            />
          </div>
        )
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Статусы заказов</CardTitle>
            <p className="text-sm text-muted-foreground">Коды и подписи — как в Shipox.</p>
          </CardHeader>
          <CardContent>
            {stats.data && stats.data.byStatus.length > 0 ? (
              <div className="space-y-2">
                {stats.data.byStatus.map((row) => {
                  const share = stats.data!.total > 0 ? (row.count / stats.data!.total) * 100 : 0;
                  return (
                    <Link
                      key={row.status}
                      href={`/orders?status=${encodeURIComponent(row.status)}`}
                      className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm hover:opacity-80"
                    >
                      <span className="truncate">{row.label}</span>
                      <span className="h-2 rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(share, 1)}%`,
                            background: "var(--viz-series-1)",
                          }}
                        />
                      </span>
                      <span className="w-12 text-right tabular-nums">{row.count}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">За период заказов нет</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Состояние системы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Database className="size-4" />
                База
              </span>
              <Badge variant={health.data?.database === "ok" ? "default" : "destructive"}>
                {health.data?.database === "ok" ? "доступна" : (health.data?.database ?? "—")}
              </Badge>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Activity className="size-4" />
                Источник данных
              </span>
              <Badge variant={health.data?.shipox.mode === "боевой API" ? "default" : "secondary"}>
                {health.data?.shipox.mode ?? "—"}
              </Badge>
            </div>

            {health.data?.shipox.baseUrl && (
              <div className="text-xs text-muted-foreground">{health.data.shipox.baseUrl}</div>
            )}

            {lastSync && (
              <div className="border-t border-border pt-3">
                <div className="text-xs text-muted-foreground">Последняя синхронизация</div>
                <div className="mt-1 tabular-nums">
                  {formatDateTime(lastSync.startedAt)} · получено {lastSync.fetched}, создано{" "}
                  {lastSync.created}, обновлено {lastSync.updated}
                </div>
                {lastSync.error && (
                  <div className="mt-1 text-xs text-destructive">{lastSync.error}</div>
                )}
              </div>
            )}

            {lastExport && (
              <div className="border-t border-border pt-3">
                <div className="text-xs text-muted-foreground">Последняя выгрузка</div>
                <div className="mt-1">
                  {lastExport.fileName} —{" "}
                  <span className="tabular-nums">
                    {formatNumber(lastExport.rowCount)}{" "}
                    {plural(lastExport.rowCount, "строка", "строки", "строк")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(lastExport.startedAt)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Производственная прибыль: сколько заработали и сколько это стоило.
 *
 * Выручка и расходы лежат на одной оси времени: выручка берётся по дате
 * доставки, начисления курьерам — по дате работы, рейсы межгорода — по дню
 * отправки. Это не чистая прибыль: топлива, аренды и зарплат в системе нет, и
 * подпись на карточке об этом говорит прямо.
 */
function ProfitBlock({
  data,
  error,
  onRetry,
}: {
  data: FinanceProfit | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <ErrorState message={error} onRetry={onRetry} />
        </CardContent>
      </Card>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const t = data.totals;
  const chart: WeekPoint[] = data.series.map((row) => ({
    label: formatDate(row.bucket).slice(0, 5),
    revenue: row.revenue,
    payouts: row.courierCost + row.transitCost,
    profit: row.revenue - row.courierCost - row.transitCost,
  }));

  const legs = [
    t.courierPickups > 0 && `заборы ${formatMoneyShort(t.courierPickups)}`,
    t.courierDeliveries > 0 && `доставки ${formatMoneyShort(t.courierDeliveries)}`,
    t.courierReturns > 0 && `возвраты ${formatMoneyShort(t.courierReturns)}`,
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Выручка"
          value={formatMoneyShort(t.revenue)}
          icon={<Wallet className="size-4" />}
          hint={
            t.revenueProvisional > 0
              ? `по дате доставки · предварительно ${formatMoneyShort(t.revenueProvisional)}`
              : `по дате доставки · ${formatNumber(t.pricedOrders)} ${plural(t.pricedOrders, "заказ", "заказа", "заказов")}`
          }
        />
        <KpiCard
          label="Курьеры"
          value={formatMoneyShort(t.courierCost + t.adjustments)}
          icon={<Users className="size-4" />}
          hint={legs.length > 0 ? legs.join(" · ") : undefined}
        />
        <KpiCard
          label="Межгород"
          value={formatMoneyShort(t.transitCost)}
          icon={<Truck className="size-4" />}
          hint={`${formatNumber(t.transitRuns)} ${plural(t.transitRuns, "рейс", "рейса", "рейсов")} по ставкам направлений`}
        />
        <KpiCard
          label="Производственная прибыль"
          value={formatMoneyShort(t.profit)}
          tone={t.profit < 0 ? "negative" : "positive"}
          icon={<TrendingUp className="size-4" />}
          hint={`маржа ${t.margin}% · без топлива, аренды и зарплат`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Деньги по дням</CardTitle>
          <p className="text-sm text-muted-foreground">
            Расстояние между выручкой и расходами — прибыль; она же отдельной линией.
          </p>
        </CardHeader>
        <CardContent>
          {chart.length > 0 ? (
            <RevenueChart data={chart} costLabel="Курьеры и межгород" />
          ) : (
            <p className="text-sm text-muted-foreground">За период денег не было.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Клиенты по прибыли</CardTitle>
            <p className="text-sm text-muted-foreground">
              Выручка минус начисления курьерам по заказам клиента. Межгород общий для рейса и
              по клиентам не делится.
            </p>
          </CardHeader>
          <CardContent>
            {data.clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">За период выручки нет.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="pb-1 text-left font-medium">Клиент</th>
                    <th className="pb-1 text-right font-medium">Выручка</th>
                    <th className="pb-1 text-right font-medium">Курьеры</th>
                    <th className="pb-1 text-right font-medium">Прибыль</th>
                    <th className="pb-1 text-right font-medium">Маржа</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.clients.map((row) => (
                    <tr key={row.customerId}>
                      <td className="max-w-56 truncate py-1.5 pr-2">{row.customerName}</td>
                      <td className="py-1.5 text-right">
                        <Money value={row.revenue} />
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        <Money value={row.courierCost} />
                      </td>
                      <td className="py-1.5 text-right font-medium">
                        <Money value={row.profit} />
                      </td>
                      <td className="w-14 py-1.5 text-right tabular-nums">{row.margin}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Button variant="outline" size="sm" className="mt-3" render={<Link href="/clients" />}>
              Все клиенты и счета
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Рейсы межгорода</CardTitle>
            <p className="text-sm text-muted-foreground">
              Рейс — день, в который по направлению в эту сторону уехали заказы.
            </p>
          </CardHeader>
          <CardContent>
            {data.runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">За период рейсов не было.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="pb-1 text-left font-medium">Направление</th>
                    <th className="pb-1 text-left font-medium">Сторона</th>
                    <th className="pb-1 text-right font-medium">Рейсов</th>
                    <th className="pb-1 text-right font-medium">Ставка</th>
                    <th className="pb-1 text-right font-medium">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.runs.map((row) => (
                    <tr key={`${row.routeId}-${row.direction}`}>
                      <td className="max-w-44 truncate py-1.5 pr-2">
                        {row.routeCode} · {row.routeName}
                      </td>
                      <td className="py-1.5">{row.direction === "FORWARD" ? "туда" : "обратно"}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.runs}</td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        <Money value={row.rate} />
                      </td>
                      <td className="py-1.5 text-right font-medium">
                        <Money value={row.cost} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Button variant="outline" size="sm" className="mt-3" render={<Link href="/transit" />}>
              Межгород и ставки
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
