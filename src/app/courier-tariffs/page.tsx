"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { Money } from "@/components/ui-kit/money";
import { NumberField } from "@/components/ui-kit/number-field";
import { PageHeader } from "@/components/ui-kit/page-header";
import { useBackend } from "@/hooks/use-backend";
import {
  createCourierTariff,
  deleteCourierTariff,
  listCourierTariffs,
  listTariffCities,
} from "@/lib/backend/client";
import type { CourierTariff, TariffCity } from "@/lib/backend/types";
import { formatAmount, formatDate, formatNumber, toDateInputValue } from "@/lib/format";

/** Завтра — ставка «с сегодняшнего дня» задела бы уже начисленное сегодня. */
function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toDateInputValue(date.toISOString());
}

export default function CourierTariffsPage() {
  const tariffs = useBackend(() => listCourierTariffs(), []);
  const current = tariffs.data?.find((tariff) => tariff.current) ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Тарифы курьеров"
        description="Ставка за каждый заказ, который курьер забрал у клиента или доставил. Хаб или район — по справочнику городов в Supabase; тяжёлый заказ — по фактическому весу."
        actions={
          <Button variant="outline" render={<Link href="/courier-payouts" />}>
            Начисления курьерам
          </Button>
        }
      />

      {tariffs.error ? (
        <ErrorState message={tariffs.error} onRetry={tariffs.reload} />
      ) : tariffs.loading && !tariffs.data ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <CurrentRates tariff={current} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <NewVersionForm current={current} onSaved={tariffs.reload} />
            <History tariffs={tariffs.data ?? []} onChanged={tariffs.reload} />
          </div>
        </>
      )}

      <Cities />
    </div>
  );
}

function CurrentRates({ tariff }: { tariff: CourierTariff | null }) {
  if (!tariff) {
    return (
      <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
        <CardHeader>
          <CardTitle className="text-base text-amber-900 dark:text-amber-200">Тариф не заведён</CardTitle>
          <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
            Пока нет ни одной действующей версии, начисления получают статус «нет тарифа на дату».
          </p>
        </CardHeader>
      </Card>
    );
  }

  const rates = [
    { label: "Город-хаб", hint: "Tashkent, Samarqand, Farg'ona…", value: Number(tariff.cityRate) },
    { label: "Район при хабе", hint: "Angren, Olmaliq shahri, Chirchiq…", value: Number(tariff.districtRate) },
    {
      label: `От ${formatNumber(tariff.heavyFromKg)} кг`,
      hint: "фактический вес, в городе и в районе",
      value: Number(tariff.heavyRate),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Действует с {formatDate(tariff.validFrom)}</CardTitle>
        {tariff.note && <p className="text-sm text-muted-foreground">{tariff.note}</p>}
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {rates.map((rate) => (
          <div key={rate.label} className="space-y-1">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{rate.label}</div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatAmount(rate.value)} <span className="text-sm font-normal text-muted-foreground">сум</span>
            </div>
            <div className="text-xs text-muted-foreground">{rate.hint}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function NewVersionForm({ current, onSaved }: { current: CourierTariff | null; onSaved: () => void }) {
  const [validFrom, setValidFrom] = useState(tomorrow);
  const [cityRate, setCityRate] = useState<number | undefined>(current ? Number(current.cityRate) : 13_000);
  const [districtRate, setDistrictRate] = useState<number | undefined>(
    current ? Number(current.districtRate) : 20_000,
  );
  const [heavyRate, setHeavyRate] = useState<number | undefined>(current ? Number(current.heavyRate) : 50_000);
  const [heavyFromKg, setHeavyFromKg] = useState<number | undefined>(current?.heavyFromKg ?? 50);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const ready =
    validFrom && cityRate !== undefined && districtRate !== undefined && heavyRate !== undefined && heavyFromKg;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const { recalculation } = await createCourierTariff({
        validFrom,
        cityRate,
        districtRate,
        heavyRate,
        heavyFromKg,
        note: note.trim() || undefined,
      });
      toast.success(
        `Версия с ${formatDate(`${validFrom}T12:00:00`)} сохранена. Начисления пересчитаны: ` +
          `изменено ${recalculation.updated}, новых ${recalculation.created}`,
      );
      setNote("");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить версию");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Новая версия</CardTitle>
        <p className="text-sm text-muted-foreground">
          Действует с выбранного дня до следующей версии. Начисления за более ранние дни не меняются.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="valid-from" className="text-xs text-muted-foreground">
              Действует с
            </Label>
            <Input
              id="valid-from"
              type="date"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
              className="w-44"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Город-хаб" suffix="сум" value={cityRate} onChange={setCityRate} min={0} step={500} />
            <NumberField
              label="Район при хабе"
              suffix="сум"
              value={districtRate}
              onChange={setDistrictRate}
              min={0}
              step={500}
            />
            <NumberField
              label="Тяжёлый заказ"
              suffix="сум"
              value={heavyRate}
              onChange={setHeavyRate}
              min={0}
              step={500}
            />
            <NumberField
              label="Тяжёлый — от"
              suffix="кг"
              value={heavyFromKg}
              onChange={setHeavyFromKg}
              min={1}
              step={1}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tariff-note" className="text-xs text-muted-foreground">
              Комментарий
            </Label>
            <Input
              id="tariff-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Например: приказ № 12 от 10.09"
            />
          </div>
          <Button type="submit" disabled={!ready || saving}>
            {saving ? "Сохраняю и пересчитываю…" : "Сохранить версию"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function History({ tariffs, onChanged }: { tariffs: CourierTariff[]; onChanged: () => void }) {
  const remove = async (tariff: CourierTariff) => {
    try {
      await deleteCourierTariff(tariff.id);
      toast.success(`Версия с ${formatDate(tariff.validFrom)} удалена`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить версию");
    }
  };

  return (
    <Card className="gap-0 py-0">
      <div className="border-b border-border px-4 py-3 text-base font-medium">История версий</div>
      {tariffs.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Версий пока нет.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">С даты</th>
                <th className="px-2 py-2 text-right font-medium">Город</th>
                <th className="px-2 py-2 text-right font-medium">Район</th>
                <th className="px-2 py-2 text-right font-medium">Тяжёлый</th>
                <th className="px-2 py-2 text-right font-medium">Начислений</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tariffs.map((tariff) => (
                <tr key={tariff.id}>
                  <td className="px-4 py-2.5">
                    <span className="whitespace-nowrap">
                      {formatDate(tariff.validFrom)}
                      {tariff.current && (
                        <Badge variant="secondary" className="ml-2">
                          действует
                        </Badge>
                      )}
                    </span>
                    {tariff.note && (
                      <div className="max-w-48 truncate text-xs text-muted-foreground" title={tariff.note}>
                        {tariff.note}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <Money value={Number(tariff.cityRate)} />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <Money value={Number(tariff.districtRate)} />
                  </td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                    <Money value={Number(tariff.heavyRate)} />
                    <span className="text-xs text-muted-foreground"> от {formatNumber(tariff.heavyFromKg)} кг</span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(tariff._count.payouts)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {tariff._count.payouts === 0 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(tariff)}
                        aria-label={`Удалить версию с ${formatDate(tariff.validFrom)}`}
                        title="Удалить — по версии ещё ничего не начислено"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Cities() {
  const [search, setSearch] = useState("");
  const cities = useBackend(() => listTariffCities(), []);
  const needle = search.trim().toLowerCase().replace(/[^a-z0-9а-яё]+/g, "");
  const shown = (cities.data ?? []).filter((city) => !needle || city.normalized.includes(needle));

  const columns = useMemo<ColumnDef<TariffCity, unknown>[]>(
    () => [
      { id: "name", header: "Город", accessorFn: (c) => c.name },
      { id: "hub", header: "Хаб", accessorFn: (c) => c.hubName ?? "" },
      {
        id: "kind",
        header: "Тип",
        accessorFn: (c) => (c.isHub ? 0 : 1),
        cell: ({ row }) =>
          row.original.isHub ? <Badge>город-хаб</Badge> : <Badge variant="outline">район</Badge>,
      },
      {
        id: "rate",
        header: "Ставка до тяжёлого",
        accessorFn: (c) => c.rate ?? 0,
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.rate === null ? (
            <span className="text-muted-foreground/50">—</span>
          ) : (
            <Money value={row.original.rate} />
          ),
      },
    ],
    [],
  );

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-base font-medium">Города из справочника Supabase</div>
          <p className="text-sm text-muted-foreground">
            Как оплачивается заказ в каждом городе. Если город заказа здесь не находится, начисление получит
            статус «города нет в справочнике».
          </p>
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Найти город"
          className="h-8 w-56"
        />
      </div>
      {cities.error ? (
        <ErrorState message={cities.error} onRetry={cities.reload} />
      ) : cities.loading && !cities.data ? (
        <Skeleton className="h-64" />
      ) : (
        <DataTable data={shown} columns={columns} pageSize={20} emptyMessage="Город не найден" />
      )}
    </Card>
  );
}
