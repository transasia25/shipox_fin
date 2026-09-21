"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Download } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { CourierGroupBadge, CourierKindBadge, LegTypeBadge, NoTariffBadge } from "@/components/ui-kit/status-badge";
import { zoneName } from "@/data/zones";
import { useCouriers, useOrders } from "@/hooks/use-data";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatMoneyShort } from "@/lib/format";
import { LEG_TYPE_LABEL } from "@/lib/labels";
import { useFinanceStore } from "@/lib/store";
import type { Leg, Order } from "@/lib/types";

interface LegRow {
  order: Order;
  leg: Leg;
}

export default function CourierDetailPage({ params }: PageProps<"/demo/couriers/[id]">) {
  const { id } = use(params);
  const period = useFinanceStore((s) => s.period);
  const { couriers } = useCouriers();
  const { orders } = useOrders({ from: period.from, to: period.to });

  const courier = couriers.find((c) => c.id === id);

  const rows = useMemo<LegRow[]>(() => {
    const result: LegRow[] = [];
    for (const order of orders) {
      for (const leg of order.legs) {
        if (leg.courierId === id) result.push({ order, leg });
      }
    }
    return result.sort((a, b) => b.leg.startedAt.localeCompare(a.leg.startedAt));
  }, [orders, id]);

  const stats = useMemo(
    () => ({
      legs: rows.length,
      amount: rows.reduce((sum, r) => sum + (r.leg.payout?.amount ?? 0), 0),
      untariffed: rows.filter((r) => !r.leg.payout).length,
    }),
    [rows],
  );

  const columns = useMemo<ColumnDef<LegRow, unknown>[]>(
    () => [
      {
        id: "order",
        header: "Заказ",
        accessorFn: (r) => r.order.orderNumber,
        cell: ({ row }) => (
          <Link href={`/demo/orders/${row.original.order.id}`} className="font-medium hover:underline">
            {row.original.order.orderNumber}
          </Link>
        ),
      },
      {
        id: "type",
        header: "Плечо",
        accessorFn: (r) => r.leg.type,
        cell: ({ row }) => <LegTypeBadge type={row.original.leg.type} />,
      },
      {
        id: "route",
        header: "Маршрут",
        accessorFn: (r) => r.leg.fromZoneId,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {zoneName(row.original.leg.fromZoneId)} → {zoneName(row.original.leg.toZoneId)}
          </span>
        ),
      },
      {
        id: "date",
        header: "Начало",
        accessorFn: (r) => r.leg.startedAt,
        cell: ({ row }) => formatDate(row.original.leg.startedAt),
      },
      {
        id: "rule",
        header: "Правило тарифа",
        accessorFn: (r) => r.leg.payout?.ruleName ?? "",
        cell: ({ row }) =>
          row.original.leg.payout ? (
            <Link
              href={`/demo/tariffs/${row.original.leg.payout.ruleId}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              {row.original.leg.payout.ruleName}
            </Link>
          ) : (
            <NoTariffBadge />
          ),
      },
      {
        id: "amount",
        header: "Начислено",
        accessorFn: (r) => r.leg.payout?.amount ?? 0,
        meta: { align: "right" },
        cell: ({ row }) => <Money value={row.original.leg.payout?.amount ?? 0} />,
      },
    ],
    [],
  );

  if (!courier) {
    return (
      <div className="space-y-4">
        <PageHeader title="Исполнитель не найден" />
        <Button variant="outline" render={<Link href="/demo/couriers" />}>
          К списку исполнителей
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" render={<Link href="/demo/couriers" />}>
          <ArrowLeft className="size-4" />
          Курьеры и водители
        </Button>
        <PageHeader
          title={courier.fullName}
          description={`${courier.phone} · ${courier.vehicle} · ${zoneName(courier.homeZoneId)}`}
          actions={
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(`Плечи — ${courier.fullName}`, rows, [
                  { header: "Заказ", value: (r) => r.order.orderNumber },
                  { header: "Плечо", value: (r) => LEG_TYPE_LABEL[r.leg.type] },
                  { header: "Откуда", value: (r) => zoneName(r.leg.fromZoneId) },
                  { header: "Куда", value: (r) => zoneName(r.leg.toZoneId) },
                  { header: "Начало", value: (r) => formatDate(r.leg.startedAt) },
                  { header: "Правило", value: (r) => r.leg.payout?.ruleName ?? "нет тарифа" },
                  { header: "Начислено", value: (r) => r.leg.payout?.amount ?? 0 },
                ])
              }
            >
              <Download className="size-4" />
              Выгрузить CSV
            </Button>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CourierKindBadge kind={courier.kind} />
        <CourierGroupBadge group={courier.group} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Плеч за период" value={String(stats.legs)} />
        <KpiCard label="Начислено" value={formatMoneyShort(stats.amount)} />
        <KpiCard
          label="Плеч без тарифа"
          value={String(stats.untariffed)}
          tone={stats.untariffed > 0 ? "negative" : "default"}
        />
      </div>

      <DataTable data={rows} columns={columns} initialSorting={[{ id: "date", desc: true }]} />
    </div>
  );
}
