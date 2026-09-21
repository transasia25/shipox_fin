"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { CourierGroupBadge, CourierKindBadge } from "@/components/ui-kit/status-badge";
import { zoneName } from "@/data/zones";
import { useCouriers, useOrders } from "@/hooks/use-data";
import { downloadCsv } from "@/lib/csv";
import { formatAmount } from "@/lib/format";
import { COURIER_GROUP_LABEL, COURIER_KIND_LABEL, LEG_TYPE_LABEL } from "@/lib/labels";
import { useFinanceStore } from "@/lib/store";
import type { Courier, CourierKind, LegType } from "@/lib/types";

interface CourierRow {
  courier: Courier;
  legs: number;
  amount: number;
  untariffed: number;
  byType: Record<LegType, number>;
}

export default function CouriersPage() {
  const router = useRouter();
  const period = useFinanceStore((s) => s.period);
  const { couriers } = useCouriers();
  const { orders } = useOrders({ from: period.from, to: period.to });
  const [kind, setKind] = useState<CourierKind | "all">("all");

  const rows = useMemo<CourierRow[]>(() => {
    const stats = new Map<string, CourierRow>();
    for (const courier of couriers) {
      stats.set(courier.id, {
        courier,
        legs: 0,
        amount: 0,
        untariffed: 0,
        byType: { pickup: 0, linehaul: 0, last_mile: 0 },
      });
    }
    for (const order of orders) {
      for (const leg of order.legs) {
        const row = stats.get(leg.courierId);
        if (!row) continue;
        row.legs += 1;
        row.byType[leg.type] += 1;
        if (leg.payout) row.amount += leg.payout.amount;
        else row.untariffed += 1;
      }
    }
    return [...stats.values()].filter((r) => kind === "all" || r.courier.kind === kind);
  }, [couriers, orders, kind]);

  const columns = useMemo<ColumnDef<CourierRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Исполнитель",
        accessorFn: (r) => r.courier.fullName,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.courier.fullName}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.courier.phone} · {row.original.courier.vehicle}
            </div>
          </div>
        ),
      },
      {
        id: "kind",
        header: "Тип",
        accessorFn: (r) => r.courier.kind,
        cell: ({ row }) => <CourierKindBadge kind={row.original.courier.kind} />,
      },
      {
        id: "group",
        header: "Группа",
        accessorFn: (r) => r.courier.group,
        cell: ({ row }) => <CourierGroupBadge group={row.original.courier.group} />,
      },
      {
        id: "city",
        header: "Город",
        accessorFn: (r) => zoneName(r.courier.homeZoneId),
      },
      {
        id: "legs",
        header: "Плеч за период",
        accessorFn: (r) => r.legs,
        meta: { align: "center" },
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="tabular-nums">{row.original.legs}</div>
            <div className="text-xs text-muted-foreground">
              {(Object.keys(row.original.byType) as LegType[])
                .filter((t) => row.original.byType[t] > 0)
                .map((t) => `${LEG_TYPE_LABEL[t]} ${row.original.byType[t]}`)
                .join(" · ") || "—"}
            </div>
          </div>
        ),
      },
      {
        id: "untariffed",
        header: "Без тарифа",
        accessorFn: (r) => r.untariffed,
        meta: { align: "center" },
        cell: ({ row }) =>
          row.original.untariffed > 0 ? (
            <span className="font-medium text-destructive tabular-nums">
              {row.original.untariffed}
            </span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          ),
      },
      {
        id: "amount",
        header: "Начислено",
        accessorFn: (r) => r.amount,
        meta: { align: "right" },
        cell: ({ row }) => <Money value={row.original.amount} className="font-medium" />,
      },
    ],
    [],
  );

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Курьеры и водители"
        description="Сколько начислено каждому исполнителю за плечи, выполненные в выбранном периоде."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv("Курьеры", rows, [
                { header: "Исполнитель", value: (r) => r.courier.fullName },
                { header: "Телефон", value: (r) => r.courier.phone },
                { header: "Тип", value: (r) => COURIER_KIND_LABEL[r.courier.kind] },
                { header: "Группа", value: (r) => COURIER_GROUP_LABEL[r.courier.group] },
                { header: "Город", value: (r) => zoneName(r.courier.homeZoneId) },
                { header: "Плеч", value: (r) => r.legs },
                { header: "Плеч без тарифа", value: (r) => r.untariffed },
                { header: "Начислено", value: (r) => r.amount },
              ])
            }
          >
            <Download className="size-4" />
            Выгрузить CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SelectField
          value={kind}
          onChange={(v) => setKind(v as CourierKind | "all")}
          options={[
            { value: "all", label: "Все исполнители" },
            { value: "courier", label: `${COURIER_KIND_LABEL.courier}ы` },
            { value: "driver", label: `${COURIER_KIND_LABEL.driver}и` },
          ]}
        />
        <span className="text-sm text-muted-foreground">
          Итого за период: <strong className="tabular-nums">{formatAmount(total)}</strong> сум
        </span>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        initialSorting={[{ id: "amount", desc: true }]}
        onRowClick={(row) => router.push(`/demo/couriers/${row.courier.id}`)}
        pageSize={50}
      />
    </div>
  );
}
