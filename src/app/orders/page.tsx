"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw, TriangleAlert, Warehouse } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import { getOrdersStats, listCities, listCustomers, listOrders } from "@/lib/backend/client";
import type { ShipoxOrderRow } from "@/lib/backend/types";
import { Money } from "@/components/ui-kit/money";
import { formatDateTime, formatNumber, formatWeight, plural } from "@/lib/format";
import { pickupReceipt } from "@/lib/courier-payouts";
import { useFinanceStore } from "@/lib/store";

const PAGE_SIZE = 50;

export default function OrdersPage() {
  const router = useRouter();
  const period = useFinanceStore((s) => s.period);

  const [status, setStatus] = useState("all");
  const [customerId, setCustomerId] = useState("all");
  const [city, setCity] = useState("all");
  const [search, setSearch] = useState("");
  const [unpriced, setUnpriced] = useState(false);
  const [unreceived, setUnreceived] = useState(false);
  const [page, setPage] = useState(0);

  const window = { from: period.from, to: period.to };
  const filters = {
    ...window,
    status: status === "all" ? undefined : status,
    customerId: customerId === "all" ? undefined : customerId,
    city: city === "all" ? undefined : city,
    search: search.trim() || undefined,
    unpriced: unpriced || undefined,
    unreceived: unreceived || undefined,
  };
  const filterKey = JSON.stringify(filters);

  const orders = useBackend(() => listOrders({ ...filters, page, size: PAGE_SIZE }), [
    filterKey,
    page,
  ]);
  // Сводка и справочники считаются по окну без прочих фильтров: иначе список
  // клиентов схлопывался бы до одного выбранного.
  const stats = useBackend(() => getOrdersStats(window), [window.from, window.to]);
  const customers = useBackend(() => listCustomers(window), [window.from, window.to]);
  const cities = useBackend(() => listCities(window), [window.from, window.to]);

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "Все статусы" },
      ...(stats.data?.byStatus ?? []).map((s) => ({
        value: s.status,
        label: `${s.label} (${s.count})`,
      })),
    ],
    [stats.data],
  );

  const columns = useMemo<ColumnDef<ShipoxOrderRow, unknown>[]>(
    () => [
      {
        id: "orderNumber",
        header: "Заказ",
        accessorFn: (r) => r.orderNumber,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium tabular-nums">{row.original.orderNumber}</div>
            <div className="text-xs text-muted-foreground">
              Shipox #{row.original.shipoxId}
            </div>
          </div>
        ),
      },
      {
        id: "createdDate",
        header: "Создан",
        accessorFn: (r) => r.createdDate,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {formatDateTime(row.original.createdDate)}
          </span>
        ),
      },
      {
        id: "status",
        header: "Статус",
        accessorFn: (r) => r.statusLabel,
        cell: ({ row }) => <Badge variant="secondary">{row.original.statusLabel}</Badge>,
      },
      {
        id: "customer",
        header: "Клиент",
        accessorFn: (r) => r.customerName ?? "",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{row.original.customerName ?? "—"}</span>
        ),
      },
      {
        id: "route",
        header: "Маршрут",
        accessorFn: (r) => `${r.senderCity ?? ""} → ${r.receiverCity ?? ""}`,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="whitespace-nowrap">
              {row.original.senderCity ?? "—"} → {row.original.receiverCity ?? "—"}
            </div>
            {row.original.receiverName && (
              <div className="text-xs text-muted-foreground">{row.original.receiverName}</div>
            )}
          </div>
        ),
      },
      {
        id: "price",
        header: "К оплате",
        accessorFn: (r) => (r.price?.amount ? Number(r.price.amount) : 0),
        meta: { align: "right" },
        cell: ({ row }) => {
          const price = row.original.price;
          if (price?.status === "PRICED" && price.amount !== null) {
            return (
              <div className="flex items-center justify-end gap-1.5">
                <Money value={Number(price.amount)} className="font-medium" />
                {price.source === "DEFAULT_PLAN" && <Badge variant="outline">предв.</Badge>}
                {price.source === "LOCAL_RULE" && (
                  <Badge variant="outline" title="Отдельная машина: цена по нашему правилу">
                    отд.
                  </Badge>
                )}
              </div>
            );
          }
          return (
            <span
              className="text-xs text-muted-foreground"
              title={price?.error ?? "Стоимость ещё не рассчитана"}
            >
              {price ? "нет цены" : "не считалось"}
            </span>
          );
        },
      },
      {
        id: "couriers",
        header: "Курьеры",
        accessorFn: (r) =>
          `${pickupReceipt(r.receipts, r.pickUpWarehouse)?.courier.name ?? r.pickUpDriverName ?? ""} ${r.driverName ?? ""}`,
        cell: ({ row }) => {
          const { pickUpDriverName, pickUpDriverId, driverName, deliveredDate, receipts } =
            row.original;
          const receipt = pickupReceipt(receipts, row.original.pickUpWarehouse);
          const pickUpName = receipt?.courier.name ?? pickUpDriverName;
          if (!pickUpName && !driverName) {
            return <span className="text-muted-foreground/50">—</span>;
          }
          // Склад и Shipox назвали разных курьеров — сверяется по id, не по имени.
          const mismatch =
            receipt?.courier.shipoxDriverId && pickUpDriverId
              ? receipt.courier.shipoxDriverId !== pickUpDriverId
              : false;
          return (
            <div className="max-w-56 space-y-0.5 text-sm">
              <CourierLine
                label="забрал"
                name={pickUpName}
                receivedAt={receipt ? `${receipt.warehouse}, ${formatDateTime(receipt.receivedAt)}` : undefined}
                warning={mismatch ? `В Shipox забор отмечен за ${pickUpDriverName}` : undefined}
              />
              <CourierLine label={deliveredDate ? "доставил" : "везёт"} name={driverName} />
            </div>
          );
        },
      },
      {
        id: "cargo",
        header: "Груз",
        accessorFn: (r) => r.chargeableWeight,
        meta: { align: "right" },
        cell: ({ row }) => (
          <div className="whitespace-nowrap tabular-nums">
            {formatWeight(row.original.chargeableWeight)}
            <span className="text-muted-foreground">
              {" · "}
              {row.original.pieceCount}{" "}
              {plural(row.original.pieceCount, "место", "места", "мест")}
            </span>
          </div>
        ),
      },
      {
        id: "rule",
        header: "Тариф Shipox",
        accessorFn: (r) => r.ruleName ?? "",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.ruleName ?? "—"}</span>
        ),
      },
      {
        id: "deliveredDate",
        header: "Доставлен",
        accessorFn: (r) => r.deliveredDate ?? "",
        cell: ({ row }) =>
          row.original.deliveredDate ? (
            <span className="whitespace-nowrap text-sm">
              {formatDateTime(row.original.deliveredDate)}
            </span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          ),
      },
    ],
    [],
  );

  const total = orders.data?.total ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Заказы"
        description="Данные выгружены из Shipox. Показаны заказы, созданные в выбранном периоде."
        actions={
          <Button variant="outline" onClick={orders.reload} disabled={orders.loading}>
            <RefreshCw className={orders.loading ? "size-4 animate-spin" : "size-4"} />
            Обновить
          </Button>
        }
      />

      {stats.data && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span>
            Заказов: <strong className="tabular-nums">{formatNumber(stats.data.total)}</strong>
          </span>
          <span>
            Доставлено:{" "}
            <strong className="tabular-nums">{formatNumber(stats.data.delivered)}</strong>
          </span>
          <span>
            Мест: <strong className="tabular-nums">{formatNumber(stats.data.pieces)}</strong>
          </span>
          <span>
            Оплачиваемый вес:{" "}
            <strong className="tabular-nums">
              {formatWeight(stats.data.chargeableWeightKg)}
            </strong>
          </span>
        </div>
      )}

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Клиент</Label>
            <SelectField
              value={customerId}
              onChange={(value) => {
                setCustomerId(value);
                setPage(0);
              }}
              className="min-w-64"
              options={[
                { value: "all", label: "Все клиенты" },
                ...(customers.data ?? []).map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.orders})`,
                })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Город</Label>
            <SelectField
              value={city}
              onChange={(value) => {
                setCity(value);
                setPage(0);
              }}
              className="min-w-44"
              options={[
                { value: "all", label: "Все города" },
                ...(cities.data ?? []).map((c) => ({
                  value: c.name,
                  label: `${c.name} (${c.orders})`,
                })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Статус</Label>
            <SelectField
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(0);
              }}
              className="min-w-52"
              options={statusOptions}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Поиск</Label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Номер, клиент, получатель, курьер"
              className="h-8 w-64"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 border-t border-border pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={unpriced}
              onCheckedChange={(value) => {
                setUnpriced(value === true);
                setPage(0);
              }}
            />
            Только без цены
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={unreceived}
              onCheckedChange={(value) => {
                setUnreceived(value === true);
                setPage(0);
              }}
            />
            Без приёмки на складе
          </label>
        </div>
      </Card>

      {orders.error ? (
        <ErrorState message={orders.error} onRetry={orders.reload} />
      ) : orders.loading && !orders.data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <DataTable
            data={orders.data?.items ?? []}
            columns={columns}
            onRowClick={(row) => router.push(`/orders/${row.orderNumber}`)}
            pageSize={PAGE_SIZE}
            emptyMessage="За выбранный период заказов нет"
          />

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                Всего {formatNumber(total)} {plural(total, "заказ", "заказа", "заказов")}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || orders.loading}
                >
                  Назад
                </Button>
                <span className="tabular-nums">
                  {page + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!orders.data?.hasMore || orders.loading}
                >
                  Вперёд
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Строка курьера: подпись роли и имя, длинное имя срезается с подсказкой. */
function CourierLine({
  label,
  name,
  receivedAt,
  warning,
}: {
  label: string;
  name: string | null;
  /** Отмечен при приёмке на складе: где и когда. Без неё имя взято из Shipox. */
  receivedAt?: string;
  warning?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      {receivedAt && (
        <span title={`Принят на складе: ${receivedAt}`} className="shrink-0">
          <Warehouse className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Принят на складе" />
        </span>
      )}
      {name ? (
        <span className="truncate" title={name}>
          {name}
        </span>
      ) : (
        <span className="text-muted-foreground/50">—</span>
      )}
      {warning && (
        <span title={warning} className="shrink-0">
          <TriangleAlert className="size-3.5 text-amber-600 dark:text-amber-400" aria-label={warning} />
        </span>
      )}
    </div>
  );
}
