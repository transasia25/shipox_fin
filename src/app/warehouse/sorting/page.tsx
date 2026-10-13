"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { PackageSearch, TriangleAlert, UserX } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import { getSortingFloor, listWarehouses } from "@/lib/backend/client";
import type { SortingFloorOrder } from "@/lib/backend/types";
import { formatDateTime, formatNumber, formatWeight, toDateInputValue } from "@/lib/format";
import { shortWarehouse } from "@/lib/transit";

type Gap = "" | "pickup" | "delivery";
type Mode = "day" | "now";
type State = "" | "here" | "left";

/**
 * Сортировочный склад: что приняли за день и что лежит прямо сейчас.
 *
 * Экран собирает три вопроса в одном месте: какие коробки пришли на склад,
 * чьи они и на каких заказах ещё нет курьера — ни на забор, ни на доставку.
 * Такой заказ просто лежит, и без отдельного списка его замечают только по
 * жалобе клиента.
 *
 * День считается по ленте статусов, а не по дате заказа: коробка могла быть
 * заведена неделю назад, а на склад попасть сегодня.
 */
export default function SortingFloorPage() {
  const [day, setDay] = useState(() => toDateInputValue(new Date().toISOString()));
  const [mode, setMode] = useState<Mode>("day");
  const [gap, setGap] = useState<Gap>("");
  const [state, setState] = useState<State>("");
  const [warehouse, setWarehouse] = useState("");
  const [customerId, setCustomerId] = useState("");

  const warehouses = useBackend(() => listWarehouses(), []);
  const floor = useBackend(
    () =>
      getSortingFloor({
        date: mode === "day" ? day : undefined,
        mode,
        state: state || undefined,
        gap: gap || undefined,
        warehouse: warehouse || undefined,
        customerId: customerId || undefined,
      }),
    [day, mode, state, gap, warehouse, customerId],
  );

  const totals = floor.data?.totals;
  const orders = floor.data?.orders ?? [];

  const columns = useMemo<ColumnDef<SortingFloorOrder, unknown>[]>(
    () => [
      {
        id: "orderNumber",
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
        id: "customerName",
        header: "Клиент",
        accessorFn: (r) => r.customerName ?? "",
        cell: ({ row }) => (
          <div className="max-w-56 space-y-0.5">
            <div className="truncate">{row.original.customerName ?? "не определён"}</div>
            {row.original.receiverName && (
              <div className="truncate text-xs text-muted-foreground">
                получатель: {row.original.receiverName}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "route",
        header: "Откуда — куда",
        accessorFn: (r) => `${r.senderCity ?? ""} ${r.receiverCity ?? ""}`,
        cell: ({ row }) => (
          <div className="space-y-0.5 text-sm">
            <div>
              {row.original.senderCity ?? "—"} → {row.original.receiverCity ?? "—"}
            </div>
            {row.original.destinationWarehouse && (
              <div className="text-xs text-muted-foreground">
                до {shortWarehouse(row.original.destinationWarehouse)}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "warehouse",
        header: "Принят на складе",
        accessorFn: (r) => r.warehouse ?? "",
        cell: ({ row }) => (
          <div className="space-y-0.5 text-sm">
            {row.original.warehouse ? (
              <div>
                {shortWarehouse(row.original.warehouse)}
                {/* Склад не записан, а выведен по городу: из Ташкента коробка
                    могла попасть только на центральный склад. */}
                {row.original.warehouseGuessed && (
                  <span className="ml-1.5 text-xs text-muted-foreground">по городу</span>
                )}
              </div>
            ) : (
              // Коробку отправили раньше, чем мы успели записать склад: врать
              // и показывать склад назначения нельзя.
              <span className="text-xs text-muted-foreground">склад не записан</span>
            )}
            {!row.original.stillHere && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-xs">
                  уехал
                </Badge>
                {row.original.currentWarehouse &&
                  row.original.currentWarehouse !== row.original.warehouse && (
                    <span className="text-xs text-muted-foreground">
                      {/* Склад назначения ещё не принимал заказ: коробка в пути,
                          и подтвердит приёмку только следующий статус. */}
                      в пути в {shortWarehouse(row.original.currentWarehouse)}
                    </span>
                  )}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "pieces",
        header: "Мест",
        accessorFn: (r) => r.pieceCount,
        meta: { align: "center" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.pieceCount}</span>,
      },
      {
        id: "weight",
        header: "Вес",
        accessorFn: (r) => r.weightKg,
        meta: { align: "right" },
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="tabular-nums">{formatWeight(row.original.weightKg)}</div>
            <div className="text-xs text-muted-foreground">
              {formatWeight(row.original.chargeableWeightKg)} опл.
            </div>
          </div>
        ),
      },
      {
        id: "pickup",
        header: "Курьер забора",
        accessorFn: (r) => r.pickUpDriverName ?? "",
        cell: ({ row }) =>
          row.original.pickUpDriverName ? (
            <span className="max-w-40 truncate text-sm">{row.original.pickUpDriverName}</span>
          ) : (
            <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-400">
              <UserX className="size-3" />
              не назначен
            </Badge>
          ),
      },
      {
        id: "delivery",
        header: "Курьер доставки",
        accessorFn: (r) => r.deliveryDriverName ?? "",
        cell: ({ row }) =>
          row.original.deliveryDriverName ? (
            <span className="max-w-40 truncate text-sm">{row.original.deliveryDriverName}</span>
          ) : (
            <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-400">
              <UserX className="size-3" />
              не назначен
            </Badge>
          ),
      },
      {
        id: "arrivedAt",
        header: "На складе с",
        accessorFn: (r) => r.arrivedAt ?? "",
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground tabular-nums">
            {row.original.arrivedAt ? formatDateTime(row.original.arrivedAt) : "нет отметки"}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Склад: что лежит"
        description="Заказы со статусом In sorting facility: что приняли на сортировку за день и что лежит прямо сейчас. Склад — тот, где коробку приняли, а не тот, куда она едет: Shipox при отправке сразу переключает заказ на следующий хаб, и приёмку подтверждает только следующий статус. Уехавшие помечены отдельно. Рядом — разрезы по клиентам и складам и отметка, на каких заказах ещё нет курьера на забор или доставку."
      />

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Что показать</Label>
            <SelectField
              value={mode}
              onChange={(next) => setMode(next as Mode)}
              className="min-w-52"
              options={[
                { value: "day", label: "Приняли за день" },
                { value: "now", label: "Лежит сейчас" },
              ]}
            />
          </div>
          {mode === "day" && (
            <div className="space-y-1.5">
              <Label htmlFor="sorting-day" className="text-xs text-muted-foreground">
                День
              </Label>
              <Input
                id="sorting-day"
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
                className="h-8 w-40"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Склад</Label>
            <SelectField
              value={warehouse}
              onChange={setWarehouse}
              placeholder="Все склады"
              className="min-w-64"
              options={[
                { value: "", label: "Все склады" },
                // Отбор заказов, у которых склад приёмки неизвестен.
                { value: "—", label: "Склад не записан" },
                ...(warehouses.data ?? []).map((item) => ({ value: item.name, label: item.name })),
              ]}
            />
          </div>
          {mode === "day" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Состояние</Label>
              <SelectField
                value={state}
                onChange={(next) => setState(next as State)}
                className="min-w-48"
                options={[
                  { value: "", label: "Все принятые" },
                  { value: "here", label: "Ещё лежит" },
                  { value: "left", label: "Уже уехал" },
                ]}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Курьер</Label>
            <SelectField
              value={gap}
              onChange={(next) => setGap(next as Gap)}
              className="min-w-56"
              options={[
                { value: "", label: "Все заказы" },
                { value: "delivery", label: "Без курьера на доставку" },
                { value: "pickup", label: "Без курьера на забор" },
              ]}
            />
          </div>
          {(gap || warehouse || customerId || state) && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={() => {
                setGap("");
                setState("");
                setWarehouse("");
                setCustomerId("");
              }}
            >
              Сбросить
            </Button>
          )}
        </div>
      </Card>

      {floor.error ? (
        <ErrorState message={floor.error} onRetry={floor.reload} />
      ) : floor.data === null ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label={mode === "day" ? "Приняли за день" : "Лежит сейчас"}
              value={formatNumber(totals?.orders ?? 0)}
              icon={<PackageSearch className="size-4" />}
              hint={`${formatNumber(totals?.pieces ?? 0)} мест · ${formatWeight(totals?.weightKg ?? 0)}`}
            />
            <KpiCard
              label="Без курьера на доставку"
              value={formatNumber(totals?.noDeliveryDriver ?? 0)}
              tone={(totals?.noDeliveryDriver ?? 0) > 0 ? "warning" : "default"}
              hint="заказ лежит, ехать не с кем"
            />
            <KpiCard
              label="Без курьера на забор"
              value={formatNumber(totals?.noPickupDriver ?? 0)}
              tone={(totals?.noPickupDriver ?? 0) > 0 ? "warning" : "default"}
            />
            {mode === "day" ? (
              <KpiCard
                label="Ещё лежат"
                value={formatNumber(totals?.stillHere ?? 0)}
                hint={`уехали дальше: ${formatNumber(totals?.left ?? 0)}`}
              />
            ) : (
              <KpiCard label="Клиентов" value={formatNumber(totals?.clients ?? 0)} />
            )}
            <KpiCard
              label="Складов"
              value={formatNumber(totals?.warehouses ?? 0)}
              hint={
                (totals?.warehouseUnknown ?? 0) > 0
                  ? `без склада приёмки: ${formatNumber(totals?.warehouseUnknown ?? 0)}`
                  : undefined
              }
            />
          </div>

          {(totals?.noDeliveryDriver ?? 0) > 0 && !gap && (
            <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
                  <TriangleAlert className="size-4" />
                  Заказы без курьера
                </CardTitle>
                <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
                  На {formatNumber(totals?.noDeliveryDriver ?? 0)} заказах нет курьера на
                  доставку, на {formatNumber(totals?.noPickupDriver ?? 0)} — на забор. Пока
                  курьера не назначат, коробка лежит на складе.
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setGap("delivery")}>
                  Показать без доставки
                </Button>
                <Button variant="outline" size="sm" onClick={() => setGap("pickup")}>
                  Показать без забора
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">По клиентам</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Чьи коробки на складе. Нажмите на клиента — таблица сузится до его заказов.
                </p>
              </CardHeader>
              <CardContent>
                {(floor.data.byClient.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">Заказов нет.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="pb-1 text-left font-medium">Клиент</th>
                        <th className="pb-1 text-right font-medium">Заказов</th>
                        <th className="pb-1 text-right font-medium">Мест</th>
                        <th className="pb-1 text-right font-medium">Без курьера</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {floor.data.byClient.map((row) => (
                        <tr
                          key={row.customerId ?? row.customerName}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() =>
                            setCustomerId(
                              customerId === (row.customerId ?? "") ? "" : (row.customerId ?? ""),
                            )
                          }
                        >
                          <td className="max-w-56 truncate py-1.5 pr-2">
                            {row.customerName}
                            {customerId && customerId === row.customerId && (
                              <Badge variant="secondary" className="ml-2">
                                выбран
                              </Badge>
                            )}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{row.orders}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                            {row.pieces}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {row.noDeliveryDriver > 0 ? (
                              <span className="text-amber-700 dark:text-amber-400">
                                {row.noDeliveryDriver}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">По складам</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Где коробки приняли. Нажмите на склад — таблица сузится до него.
                </p>
              </CardHeader>
              <CardContent>
                {floor.data.byWarehouse.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Заказов нет.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th className="pb-1 text-left font-medium">Склад</th>
                        <th className="pb-1 text-right font-medium">Заказов</th>
                        <th className="pb-1 text-right font-medium">Без курьера</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {floor.data.byWarehouse.map((row) => (
                        <tr
                          key={row.warehouse}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() =>
                            setWarehouse(warehouse === row.warehouse ? "" : row.warehouse)
                          }
                        >
                          <td className="py-1.5 pr-2">
                            {/* Прочерк — это «склад не записан»: заказ уехал
                                раньше, чем мы успели узнать склад. */}
                            {row.warehouse === "—" ? (
                              <span className="text-muted-foreground">склад не записан</span>
                            ) : (
                              row.warehouse
                            )}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{row.orders}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {row.noDeliveryDriver > 0 ? (
                              <span className="text-amber-700 dark:text-amber-400">
                                {row.noDeliveryDriver}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <DataTable
            data={orders}
            columns={columns}
            initialSorting={[{ id: "arrivedAt", desc: true }]}
            pageSize={50}
            emptyMessage={
              mode === "day" ? "В этот день на склад ничего не приняли" : "На складе ничего не лежит"
            }
          />
        </>
      )}
    </div>
  );
}
