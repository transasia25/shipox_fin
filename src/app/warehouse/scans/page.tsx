"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PackageCheck, ScanLine, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui-kit/error-state";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import { getScanSummary, listScans, listWarehouses } from "@/lib/backend/client";
import {
  endOfDayISO,
  formatDateTime,
  formatNumber,
  plural,
  startOfDayISO,
  toDateInputValue,
} from "@/lib/format";
import { shortWarehouse } from "@/lib/transit";

/**
 * Журнал сканов: что сегодня пробили на складах.
 *
 * Рабочие экраны показывают своё — приёмка текущего курьера, отправка машин
 * выбранный рейс. Здесь всё вместе: и приёмки от курьеров, и отправки в
 * транзит, по всем складам и сотрудникам. Кладовщику бэкенд отдаёт только его
 * склад, поэтому экран один на всех.
 */
export default function ScansPage() {
  const [day, setDay] = useState(() => toDateInputValue(new Date().toISOString()));
  const [warehouse, setWarehouse] = useState("");
  const [search, setSearch] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const period = { from: startOfDayISO(day), to: endOfDayISO(day) };
  const warehouses = useBackend(() => listWarehouses(), []);
  const scans = useBackend(
    () =>
      listScans({
        ...period,
        warehouse: warehouse || undefined,
        search: search.trim() || undefined,
        includeCancelled,
        limit: 500,
      }),
    [day, warehouse, search, includeCancelled],
  );
  const summary = useBackend(
    () => getScanSummary({ ...period, warehouse: warehouse || undefined }),
    [day, warehouse],
  );

  const rows = useMemo(() => scans.data ?? [], [scans.data]);
  const byWarehouse = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.warehouse, (counts.get(row.warehouse) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const totals = summary.data?.totals;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Сканы за день"
        description="Что пробили на складах: приёмки от курьеров и отправки в транзит. Видно, кто сканировал, на каком складе и какой заказ."
      />

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="scan-day" className="text-xs text-muted-foreground">
              День
            </Label>
            <Input
              id="scan-day"
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="h-8 w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Склад</Label>
            <SelectField
              value={warehouse}
              onChange={setWarehouse}
              placeholder="Все склады"
              className="min-w-64"
              options={[
                { value: "", label: "Все склады" },
                ...(warehouses.data ?? []).map((item) => ({ value: item.name, label: item.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scan-search" className="text-xs text-muted-foreground">
              Номер заказа
            </Label>
            <Input
              id="scan-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="99760…"
              className="h-8 w-44"
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Switch
              checked={includeCancelled}
              onCheckedChange={setIncludeCancelled}
              aria-label="Показывать отменённые"
            />
            <span className="text-sm text-muted-foreground">Показывать отменённые</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Коробок пробито" value={formatNumber(totals?.boxes ?? 0)} />
        <KpiCard label="Заказов" value={formatNumber(totals?.orders ?? 0)} />
        <KpiCard label="Приёмка от курьеров" value={formatNumber(totals?.receipts ?? 0)} />
        <KpiCard label="Отправка в транзит" value={formatNumber(totals?.transit ?? 0)} />
      </div>

      {(summary.data?.people.length ?? 0) > 0 && (
        <Card className="gap-0 py-0">
          <div className="border-b border-border px-4 py-3 text-base font-medium">
            Кто сколько пробил
          </div>
          <ul className="divide-y divide-border text-sm">
            {(summary.data?.people ?? []).map((person) => (
              <li
                key={`${person.by}-${person.warehouse}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <span className="font-medium">{person.by}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground" title={person.warehouse}>
                    {shortWarehouse(person.warehouse)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatNumber(person.orders)}{" "}
                  {plural(person.orders, "заказ", "заказа", "заказов")}
                  {" · приёмка "}
                  {formatNumber(person.receipts)}
                  {" · транзит "}
                  {formatNumber(person.transit)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {scans.error ? (
        <ErrorState message={scans.error} onRetry={scans.reload} />
      ) : scans.loading && !scans.data ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="gap-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="text-base font-medium">Сканы</span>
            <span className="text-xs text-muted-foreground">
              {byWarehouse.map(([name, count]) => `${shortWarehouse(name)} ${count}`).join(" · ")}
            </span>
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              За этот день ничего не пробили.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-medium">Время</th>
                    <th className="px-2 py-2 text-left font-medium">Что</th>
                    <th className="px-2 py-2 text-left font-medium">Заказ</th>
                    <th className="px-2 py-2 text-left font-medium">Склад</th>
                    <th className="px-2 py-2 text-left font-medium">Кто пробил</th>
                    <th className="px-4 py-2 text-left font-medium">Курьер</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      className={row.cancelledAt ? "text-muted-foreground" : undefined}
                    >
                      <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                        {formatDateTime(row.at)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {row.cancelledAt ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Undo2 className="size-3.5" />
                            отменён
                          </span>
                        ) : row.kind === "RECEIPT" ? (
                          <span className="flex items-center gap-1 text-xs">
                            <ScanLine className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                            приёмка
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs">
                            <PackageCheck className="size-3.5 text-sky-600 dark:text-sky-400" />в
                            транзит
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/orders/${row.order.orderNumber}`}
                          className="font-medium tabular-nums hover:underline"
                        >
                          {row.order.orderNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {row.order.customerName ?? "—"}
                          {row.order.receiverCity ? ` · ${row.order.receiverCity}` : ""}
                          {row.order.pieceCount > 1 ? ` · ${row.order.pieceCount} мест` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap" title={row.warehouse}>
                        {shortWarehouse(row.warehouse)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{row.by}</td>
                      <td className="px-4 py-2">
                        {row.courier ? (
                          row.courier.name
                        ) : (
                          <Badge variant="secondary">без курьера</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
