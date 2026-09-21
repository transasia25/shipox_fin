"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FilePlus2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { RegisterStatusBadge } from "@/components/ui-kit/status-badge";
import { SelectField } from "@/components/ui-kit/select-field";
import { useLookups, useOrders } from "@/hooks/use-data";
import { endOfDayISO, formatDate, formatDateRange, formatMoney, plural, startOfDayISO, toDateInputValue } from "@/lib/format";
import { COURIER_KIND_LABEL } from "@/lib/labels";
import { useFinanceStore } from "@/lib/store";
import type { CourierKind, PayoutRegister, PayoutRegisterLine } from "@/lib/types";

const KIND_OPTIONS = [
  { value: "all", label: "Все исполнители" },
  { value: "courier", label: `${COURIER_KIND_LABEL.courier}ы (город)` },
  { value: "driver", label: `${COURIER_KIND_LABEL.driver}и (междугородние)` },
];

export default function PayoutsPage() {
  const router = useRouter();
  const period = useFinanceStore((s) => s.period);
  const registers = useFinanceStore((s) => s.registers);
  const saveRegister = useFinanceStore((s) => s.saveRegister);

  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [kind, setKind] = useState<CourierKind | "all">("all");

  // Реестр строится по всем заказам, а плечи отбираются по дате завершения:
  // курьеру платят за то, что он реально закрыл в периоде.
  const { orders } = useOrders({});
  const { couriersById, couriers } = useLookups();

  const draftLines = useMemo(() => {
    const byCourier = new Map<string, PayoutRegisterLine>();
    let untariffed = 0;

    for (const order of orders) {
      for (const leg of order.legs) {
        if (leg.status !== "completed" || !leg.completedAt) continue;
        if (leg.completedAt < from || leg.completedAt > to) continue;
        const courier = couriersById.get(leg.courierId);
        if (!courier) continue;
        if (kind !== "all" && courier.kind !== kind) continue;
        if (!leg.payout) {
          untariffed += 1;
          continue;
        }
        const line = byCourier.get(courier.id) ?? {
          courierId: courier.id,
          legIds: [],
          legsAmount: 0,
          adjustments: [],
        };
        line.legIds.push(leg.id);
        line.legsAmount += leg.payout.amount;
        byCourier.set(courier.id, line);
      }
    }

    const lines = [...byCourier.values()].sort((a, b) => b.legsAmount - a.legsAmount);
    return {
      lines,
      untariffed,
      total: lines.reduce((sum, l) => sum + l.legsAmount, 0),
      legsCount: lines.reduce((sum, l) => sum + l.legIds.length, 0),
    };
  }, [orders, couriersById, from, to, kind]);

  const create = () => {
    if (draftLines.lines.length === 0) {
      toast.error("За выбранный период нет закрытых плеч");
      return;
    }
    const register: PayoutRegister = {
      id: `reg-${Math.random().toString(36).slice(2, 10)}`,
      title: `Реестр ${formatDate(from)} — ${formatDate(to)}`,
      periodFrom: from,
      periodTo: to,
      courierKind: kind,
      status: "draft",
      createdAt: new Date().toISOString(),
      lines: draftLines.lines,
    };
    saveRegister(register);
    toast.success("Реестр сформирован");
    router.push(`/demo/payouts/${register.id}`);
  };

  const columns = useMemo<ColumnDef<PayoutRegister, unknown>[]>(
    () => [
      {
        id: "title",
        header: "Реестр",
        accessorFn: (r) => r.title,
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: "period",
        header: "Период",
        accessorFn: (r) => r.periodFrom,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDateRange(row.original.periodFrom, row.original.periodTo)}
          </span>
        ),
      },
      {
        id: "kind",
        header: "Исполнители",
        accessorFn: (r) => r.courierKind,
        cell: ({ row }) =>
          row.original.courierKind === "all"
            ? "Все"
            : COURIER_KIND_LABEL[row.original.courierKind as CourierKind],
      },
      {
        id: "couriers",
        header: "Человек",
        accessorFn: (r) => r.lines.length,
        meta: { align: "center" },
      },
      {
        id: "amount",
        header: "К выплате",
        accessorFn: (r) =>
          r.lines.reduce(
            (sum, l) => sum + l.legsAmount + l.adjustments.reduce((s, a) => s + a.amount, 0),
            0,
          ),
        meta: { align: "right" },
        cell: ({ getValue }) => <Money value={getValue() as number} />,
      },
      {
        id: "status",
        header: "Статус",
        accessorFn: (r) => r.status,
        cell: ({ row }) => <RegisterStatusBadge status={row.original.status} />,
      },
      {
        id: "createdAt",
        header: "Создан",
        accessorFn: (r) => r.createdAt,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Начисления курьерам"
        description="Реестры к выплате за период. В реестр попадают плечи, закрытые исполнителем внутри периода, с суммой, зафиксированной на момент формирования."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сформировать реестр</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Период с</Label>
              <Input
                type="date"
                className="h-8 w-[9.5rem]"
                value={toDateInputValue(from)}
                onChange={(e) => e.target.value && setFrom(startOfDayISO(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">по</Label>
              <Input
                type="date"
                className="h-8 w-[9.5rem]"
                value={toDateInputValue(to)}
                onChange={(e) => e.target.value && setTo(endOfDayISO(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Кого включить</Label>
              <SelectField
                value={kind}
                onChange={(v) => setKind(v as CourierKind | "all")}
                options={KIND_OPTIONS}
                className="min-w-56"
              />
            </div>
            <Button onClick={create}>
              <FilePlus2 className="size-4" />
              Сформировать
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
            <span>
              Исполнителей:{" "}
              <strong className="tabular-nums">{draftLines.lines.length}</strong> из {couriers.length}
            </span>
            <span>
              Плеч: <strong className="tabular-nums">{draftLines.legsCount}</strong>
            </span>
            <span>
              К выплате: <strong className="tabular-nums">{formatMoney(draftLines.total)}</strong>
            </span>
            {draftLines.untariffed > 0 && (
              <span className="flex items-center gap-1.5 text-destructive">
                <TriangleAlert className="size-4" />
                {draftLines.untariffed}{" "}
                {plural(draftLines.untariffed, "плечо", "плеча", "плеч")} без тарифа — в реестр не
                попадут
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Сохранённые реестры</h2>
        <DataTable
          data={registers}
          columns={columns}
          initialSorting={[{ id: "createdAt", desc: true }]}
          onRowClick={(register) => router.push(`/demo/payouts/${register.id}`)}
          emptyMessage="Реестров пока нет — сформируйте первый за нужный период"
        />
      </div>
    </div>
  );
}
