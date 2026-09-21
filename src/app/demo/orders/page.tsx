"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, TriangleAlert } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarginValue, Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { OrderStatusBadge } from "@/components/ui-kit/status-badge";
import { CITIES, cityNameOf, zoneName } from "@/data/zones";
import { useLookups, useOrders } from "@/hooks/use-data";
import { downloadCsv } from "@/lib/csv";
import { orderMargin } from "@/lib/finance/margin";
import { formatAmount, formatDate, formatMoney, formatWeight } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import { useFinanceStore } from "@/lib/store";
import type { Order, OrderStatus } from "@/lib/types";

interface OrderRow {
  order: Order;
  clientName: string;
  route: string;
  payouts: number;
  margin: number;
  marginPct: number;
  untariffed: boolean;
}

const STATUS_OPTIONS = [
  { value: "all", label: "Все статусы" },
  ...(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => ({
    value: s,
    label: ORDER_STATUS_LABEL[s],
  })),
];

export default function OrdersPage() {
  const router = useRouter();
  const period = useFinanceStore((s) => s.period);
  const { clients, clientsById } = useLookups();

  const [clientId, setClientId] = useState("all");
  const [cityId, setCityId] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [onlyLoss, setOnlyLoss] = useState(false);
  const [onlyUntariffed, setOnlyUntariffed] = useState(false);

  const { orders } = useOrders({
    from: period.from,
    to: period.to,
    clientId: clientId === "all" ? undefined : clientId,
    cityId: cityId === "all" ? undefined : cityId,
    status: status === "all" ? undefined : (status as OrderStatus),
    search: search || undefined,
  });

  const rows = useMemo<OrderRow[]>(() => {
    return orders
      .map((order) => {
        const m = orderMargin(order);
        return {
          order,
          clientName: clientsById.get(order.clientId)?.name ?? order.clientId,
          route: `${cityNameOf(order.fromZoneId)} → ${cityNameOf(order.toZoneId)}`,
          payouts: m.payouts,
          margin: m.margin,
          marginPct: m.marginPct,
          untariffed: m.hasUntariffedLeg,
        };
      })
      .filter((row) => (!onlyLoss || row.margin < 0) && (!onlyUntariffed || row.untariffed));
  }, [orders, clientsById, onlyLoss, onlyUntariffed]);

  const totals = useMemo(
    () => ({
      revenue: rows.reduce((s, r) => s + r.order.clientCharge, 0),
      payouts: rows.reduce((s, r) => s + r.payouts, 0),
      margin: rows.reduce((s, r) => s + r.margin, 0),
      untariffed: rows.filter((r) => r.untariffed).length,
    }),
    [rows],
  );

  const columns = useMemo<ColumnDef<OrderRow, unknown>[]>(
    () => [
      {
        id: "orderNumber",
        header: "Заказ",
        accessorFn: (r) => r.order.orderNumber,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.order.orderNumber}</div>
            <div className="text-xs text-muted-foreground">Shipox #{row.original.order.shipoxId}</div>
          </div>
        ),
      },
      {
        id: "createdAt",
        header: "Дата",
        accessorFn: (r) => r.order.createdAt,
        cell: ({ row }) => formatDate(row.original.order.createdAt),
      },
      {
        id: "client",
        header: "Клиент",
        accessorFn: (r) => r.clientName,
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.clientName}</span>,
      },
      {
        id: "route",
        header: "Маршрут",
        accessorFn: (r) => r.route,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="whitespace-nowrap">{row.original.route}</div>
            <div className="text-xs text-muted-foreground">
              {zoneName(row.original.order.fromZoneId)} → {zoneName(row.original.order.toZoneId)}
            </div>
          </div>
        ),
      },
      {
        id: "cargo",
        header: "Груз",
        accessorFn: (r) => r.order.weightKg,
        meta: { align: "right" },
        cell: ({ row }) => (
          <div className="whitespace-nowrap tabular-nums">
            {formatWeight(row.original.order.weightKg)}
            <span className="text-muted-foreground"> · {row.original.order.places} мест</span>
          </div>
        ),
      },
      {
        id: "legs",
        header: "Плечи",
        accessorFn: (r) => r.order.legs.length,
        meta: { align: "center" },
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-1.5">
            <span className="tabular-nums">{row.original.order.legs.length}</span>
            {row.original.untariffed && <TriangleAlert className="size-3.5 text-destructive" />}
          </div>
        ),
      },
      {
        id: "status",
        header: "Статус",
        accessorFn: (r) => r.order.status,
        cell: ({ row }) => <OrderStatusBadge status={row.original.order.status} />,
      },
      {
        id: "charge",
        header: "К оплате клиентом",
        accessorFn: (r) => r.order.clientCharge,
        meta: { align: "right" },
        cell: ({ row }) => <Money value={row.original.order.clientCharge} />,
      },
      {
        id: "payouts",
        header: "Выплаты",
        accessorFn: (r) => r.payouts,
        meta: { align: "right" },
        cell: ({ row }) => <Money value={row.original.payouts} className="text-muted-foreground" />,
      },
      {
        id: "margin",
        header: "Маржа",
        accessorFn: (r) => r.margin,
        meta: { align: "right" },
        cell: ({ row }) => <MarginValue value={row.original.margin} pct={row.original.marginPct} />,
      },
    ],
    [],
  );

  const exportCsv = () => {
    downloadCsv("Заказы", rows, [
      { header: "Заказ", value: (r) => r.order.orderNumber },
      { header: "Shipox ID", value: (r) => r.order.shipoxId },
      { header: "Дата", value: (r) => formatDate(r.order.createdAt) },
      { header: "Клиент", value: (r) => r.clientName },
      { header: "Откуда", value: (r) => zoneName(r.order.fromZoneId) },
      { header: "Куда", value: (r) => zoneName(r.order.toZoneId) },
      { header: "Вес, кг", value: (r) => r.order.weightKg },
      { header: "Мест", value: (r) => r.order.places },
      { header: "Плеч", value: (r) => r.order.legs.length },
      { header: "Статус", value: (r) => ORDER_STATUS_LABEL[r.order.status] },
      { header: "К оплате клиентом", value: (r) => r.order.clientCharge },
      { header: "Выплаты курьерам", value: (r) => r.payouts },
      { header: "Маржа", value: (r) => r.margin },
      { header: "Есть плечо без тарифа", value: (r) => (r.untariffed ? "да" : "нет") },
    ]);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Заказы"
        description="Реестр заказов из Shipox с суммой к оплате клиентом, начислениями по плечам и маржой по каждому заказу."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" />
            Выгрузить CSV
          </Button>
        }
      />

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Клиент</Label>
            <SelectField
              value={clientId}
              onChange={setClientId}
              className="min-w-56"
              options={[
                { value: "all", label: "Все клиенты" },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Город</Label>
            <SelectField
              value={cityId}
              onChange={setCityId}
              options={[
                { value: "all", label: "Все города" },
                ...CITIES.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Статус</Label>
            <SelectField value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Поиск</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Номер, Shipox ID, получатель"
              className="h-8 w-64"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 border-t border-border pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={onlyLoss} onCheckedChange={(v) => setOnlyLoss(v === true)} />
            Только убыточные
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={onlyUntariffed}
              onCheckedChange={(v) => setOnlyUntariffed(v === true)}
            />
            Есть плечо без тарифа
            {totals.untariffed > 0 && !onlyUntariffed && (
              <span className="text-xs text-destructive">({totals.untariffed})</span>
            )}
          </label>
        </div>
      </Card>

      <DataTable
        data={rows}
        columns={columns}
        initialSorting={[{ id: "createdAt", desc: true }]}
        onRowClick={(row) => router.push(`/demo/orders/${row.order.id}`)}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-6 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Итого по фильтру:</span>
            <span>
              клиенты <strong className="tabular-nums">{formatAmount(totals.revenue)}</strong>
            </span>
            <span>
              выплаты <strong className="tabular-nums">{formatAmount(totals.payouts)}</strong>
            </span>
            <span>
              маржа{" "}
              <strong
                className={
                  totals.margin < 0 ? "tabular-nums text-destructive" : "tabular-nums"
                }
              >
                {formatMoney(totals.margin)}
              </strong>
            </span>
          </div>
        }
      />
    </div>
  );
}
