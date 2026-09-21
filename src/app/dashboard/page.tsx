"use client";

import Link from "next/link";
import { Activity, Database, Download, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { PageHeader } from "@/components/ui-kit/page-header";
import { useBackend } from "@/hooks/use-backend";
import { getHealth, getOrdersStats, getSyncState, listExports } from "@/lib/backend/client";
import { formatDateTime, formatNumber, formatWeight, plural } from "@/lib/format";
import { useFinanceStore } from "@/lib/store";

export default function DashboardPage() {
  const period = useFinanceStore((s) => s.period);
  const window = { from: period.from, to: period.to };

  const stats = useBackend(() => getOrdersStats(window), [window.from, window.to]);
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
