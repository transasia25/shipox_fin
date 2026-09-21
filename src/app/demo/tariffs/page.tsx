"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui-kit/page-header";
import { LegTypeBadge } from "@/components/ui-kit/status-badge";
import { CLIENTS_BY_ID } from "@/data/clients";
import { zoneName } from "@/data/zones";
import { formatAmount, formatDate } from "@/lib/format";
import { COURIER_GROUP_LABEL } from "@/lib/labels";
import { useFinanceStore } from "@/lib/store";
import type { TariffRule } from "@/lib/types";

/** Человекочитаемое описание условий применения правила. */
export function describeMatch(rule: TariffRule): string {
  const parts: string[] = [];
  const { match } = rule;
  if (match.fromZoneId || match.toZoneId) {
    parts.push(
      `${match.fromZoneId ? zoneName(match.fromZoneId) : "любая зона"} → ${
        match.toZoneId ? zoneName(match.toZoneId) : "любая зона"
      }`,
    );
  }
  if (match.courierGroup) parts.push(COURIER_GROUP_LABEL[match.courierGroup].toLowerCase());
  if (match.clientId) parts.push(CLIENTS_BY_ID.get(match.clientId)?.name ?? match.clientId);
  if (match.weightMin !== undefined || match.weightMax !== undefined) {
    parts.push(`вес ${match.weightMin ?? 0}–${match.weightMax ?? "∞"} кг`);
  }
  if (match.placesMin !== undefined || match.placesMax !== undefined) {
    parts.push(`мест ${match.placesMin ?? 1}–${match.placesMax ?? "∞"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Любое плечо этого типа";
}

/** Короткая запись формулы: «12 000 + 500/кг св. 10 + 2 000/место св. 2». */
export function describeFormula(rule: TariffRule): string {
  const f = rule.formula;
  const parts = [formatAmount(f.base)];
  if (f.perKg) parts.push(`${formatAmount(f.perKg)}/кг св. ${f.includedKg}`);
  if (f.perPlace) parts.push(`${formatAmount(f.perPlace)}/место св. ${f.includedPlaces}`);
  if (f.perKm) parts.push(`${formatAmount(f.perKm)}/км`);
  let text = parts.join(" + ");
  if (f.min !== undefined) text += `, мин ${formatAmount(f.min)}`;
  if (f.max !== undefined) text += `, макс ${formatAmount(f.max)}`;
  return text;
}

export default function TariffsPage() {
  const router = useRouter();
  const rules = useFinanceStore((s) => s.rules);
  const toggleRule = useFinanceStore((s) => s.toggleRule);
  const resetRules = useFinanceStore((s) => s.resetRules);

  const columns = useMemo<ColumnDef<TariffRule, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Правило",
        accessorFn: (r) => r.name,
        cell: ({ row }) => (
          <Link href={`/demo/tariffs/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "legType",
        header: "Плечо",
        accessorFn: (r) => r.legType,
        cell: ({ row }) => <LegTypeBadge type={row.original.legType} />,
      },
      {
        id: "match",
        header: "Условия",
        accessorFn: (r) => describeMatch(r),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{describeMatch(row.original)}</span>
        ),
      },
      {
        id: "formula",
        header: "Формула, сум",
        accessorFn: (r) => r.formula.base,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{describeFormula(row.original)}</span>
        ),
      },
      {
        id: "priority",
        header: "Приоритет",
        accessorFn: (r) => r.priority,
        meta: { align: "center" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.priority}</span>,
      },
      {
        id: "effective",
        header: "Действует с",
        accessorFn: (r) => r.effectiveFrom,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDate(row.original.effectiveFrom)}
            {row.original.effectiveTo && ` — ${formatDate(row.original.effectiveTo)}`}
          </span>
        ),
      },
      {
        id: "active",
        header: "Вкл.",
        accessorFn: (r) => r.active,
        meta: { align: "center" },
        enableSorting: false,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()} className="flex justify-center">
            <Switch
              checked={row.original.active}
              onCheckedChange={(checked) => toggleRule(row.original.id, checked === true)}
            />
          </div>
        ),
      },
    ],
    [toggleRule],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Тарификатор курьеров"
        description="Правила, по которым начисляется оплата исполнителю за каждое плечо. Побеждает правило с наибольшим приоритетом; при равном приоритете — более специфичное."
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                resetRules();
                toast.info("Восстановлен исходный набор правил");
              }}
            >
              <RotateCcw className="size-4" />
              Сбросить к исходным
            </Button>
            <Button render={<Link href="/demo/tariffs/new" />}>
              <Plus className="size-4" />
              Новое правило
            </Button>
          </>
        }
      />

      <DataTable
        data={rules}
        columns={columns}
        initialSorting={[{ id: "legType", desc: false }]}
        onRowClick={(rule) => router.push(`/demo/tariffs/${rule.id}`)}
        pageSize={50}
        emptyMessage="Правил пока нет"
      />
    </div>
  );
}
