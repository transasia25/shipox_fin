"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { SelectField, type SelectOption } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import {
  apiFileUrl,
  getCourierPayoutSummary,
  listCouriers,
  listCustomers,
  listExportDatasets,
  listWarehouses,
} from "@/lib/backend/client";
import type { ExportDataset, ExportFilter } from "@/lib/backend/types";
import { endOfDayISO, startOfDayISO, toDateInputValue } from "@/lib/format";
import { useFinanceStore } from "@/lib/store";

/**
 * Выгрузка любых данных платформы в CSV.
 *
 * Разделы и столбцы приходят с сервера, поэтому попап не знает заранее, что в
 * нём будет: новый раздел на бэкенде появляется здесь сам. Файл скачивается
 * обычной ссылкой — так кука сессии уходит вместе с запросом, а браузер сам
 * показывает прогресс и сохраняет файл с именем от сервера.
 */
export function ExportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        title="Выгрузка данных в CSV"
        onClick={() => setOpen(true)}
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">Выгрузка</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 gap-1 border-b border-border p-4 pr-12">
            <DialogTitle>Выгрузка данных</DialogTitle>
            <DialogDescription>
              Файл собирается сейчас и сразу скачивается — в журнал выгрузок он не попадает.
            </DialogDescription>
          </DialogHeader>
          {/* Справочники для фильтров грузятся только с открытым попапом. */}
          {open && <ExportForm onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

const BASIS_OPTIONS: SelectOption[] = [
  { value: "CREATED", label: "Все — по дате создания" },
  { value: "DELIVERED", label: "Доставленные — по дате доставки" },
  { value: "CREATED_DELIVERED", label: "Доставленные — по дате создания" },
];

function ExportForm({ onDone }: { onDone: () => void }) {
  const period = useFinanceStore((s) => s.period);
  const catalog = useBackend(() => listExportDatasets(), []);
  const sets = catalog.data ?? [];

  const [datasetId, setDatasetId] = useState("");
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  /// Выбор помнится вместе с разделом: сменился раздел — и столбцы с фильтрами
  /// снова становятся его собственными, без сброса состояния вручную.
  const [chosen, setChosen] = useState<{
    datasetId: string;
    columns: Set<string>;
    filters: Record<string, string>;
  } | null>(null);

  const current: ExportDataset | undefined =
    sets.find((item) => item.id === datasetId) ?? sets[0];
  const mine = chosen && current && chosen.datasetId === current.id ? chosen : null;

  const picked = useMemo(
    () =>
      mine?.columns ??
      new Set(
        (current?.columns ?? [])
          .filter((column) => !column.optional)
          .map((column) => column.key),
      ),
    [mine, current],
  );
  const filters = mine?.filters ?? {};

  const setPicked = (columns: Set<string>) =>
    current && setChosen({ datasetId: current.id, columns, filters });
  const needs = (filter: ExportFilter) => current?.filters.includes(filter) ?? false;
  const patch = (next: Record<string, string>) =>
    current &&
    setChosen({ datasetId: current.id, columns: picked, filters: { ...filters, ...next } });

  const customers = useBackend(
    () => (needs("customer") ? listCustomers({ from, to }) : Promise.resolve([])),
    [needs("customer"), from, to],
  );
  const couriers = useBackend(
    () => (needs("courier") ? listCouriers({ active: true }) : Promise.resolve([])),
    [needs("courier")],
  );
  const places = useBackend(
    () =>
      needs("hub") || needs("city")
        ? getCourierPayoutSummary({ from, to })
        : Promise.resolve(null),
    [needs("hub"), needs("city"), from, to],
  );
  const warehouses = useBackend(
    () => (needs("warehouse") ? listWarehouses() : Promise.resolve([])),
    [needs("warehouse")],
  );

  const hubOptions = useMemo<SelectOption[]>(() => {
    const names = [...new Set((places.data?.places ?? []).map((row) => row.hub).filter(Boolean))];
    return [{ value: "", label: "Все регионы" }, ...names.map((name) => ({ value: name!, label: name! }))];
  }, [places.data]);

  const cityOptions = useMemo<SelectOption[]>(() => {
    const names = [...new Set((places.data?.places ?? []).map((row) => row.city).filter(Boolean))];
    return [{ value: "", label: "Все города" }, ...names.map((name) => ({ value: name!, label: name! }))];
  }, [places.data]);

  const toggle = (key: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(key);
    else next.delete(key);
    setPicked(next);
  };

  const href = current
    ? apiFileUrl("/exports/data/file.csv", {
        dataset: current.id,
        // Порядок столбцов — как в разделе, а не как их щёлкали: один и тот же
        // набор галочек всегда даёт одинаковый файл.
        columns: current.columns
          .filter((column) => picked.has(column.key))
          .map((column) => column.key)
          .join(","),
        from,
        to,
        ...filters,
      })
    : "";

  const broken = from > to;
  const blocked = !current || picked.size === 0 || broken;

  if (catalog.error) {
    return (
      <div className="p-4">
        <ErrorState message={catalog.error} onRetry={catalog.reload} />
      </div>
    );
  }
  if (!catalog.data) return <Skeleton className="m-4 h-64" />;
  if (sets.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Для вашей роли выгрузок пока нет.
      </p>
    );
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Что выгрузить</Label>
          <SelectField
            value={current?.id ?? ""}
            onChange={setDatasetId}
            className="w-full"
            options={sets.map((item) => ({ value: item.id, label: item.title }))}
          />
          {current && <p className="text-xs text-muted-foreground">{current.hint}</p>}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="export-from" className="text-xs text-muted-foreground">
              Период с
            </Label>
            <Input
              id="export-from"
              type="date"
              className="h-8 w-40"
              value={toDateInputValue(from)}
              onChange={(event) => setFrom(startOfDayISO(event.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="export-to" className="text-xs text-muted-foreground">
              по
            </Label>
            <Input
              id="export-to"
              type="date"
              className="h-8 w-40"
              value={toDateInputValue(to)}
              onChange={(event) => setTo(endOfDayISO(event.target.value))}
            />
          </div>
          {broken && (
            <p className="text-xs text-destructive">Начало периода позже конца</p>
          )}
        </div>

        {(needs("basis") ||
          needs("customer") ||
          needs("courier") ||
          needs("hub") ||
          needs("city") ||
          needs("warehouse")) && (
          <div className="flex flex-wrap items-end gap-3">
            {needs("basis") && (
              <Field label="Что считать">
                <SelectField
                  value={filters.basis ?? "CREATED"}
                  onChange={(value) => patch({ basis: value })}
                  className="min-w-56"
                  options={BASIS_OPTIONS}
                />
              </Field>
            )}
            {needs("customer") && (
              <Field label="Клиент">
                <SelectField
                  value={filters.customerId ?? ""}
                  onChange={(value) => patch({ customerId: value })}
                  className="min-w-56"
                  options={[
                    { value: "", label: "Все клиенты" },
                    ...(customers.data ?? []).map((client) => ({
                      value: client.id,
                      label: client.name,
                    })),
                  ]}
                />
              </Field>
            )}
            {needs("courier") && (
              <Field label="Курьер">
                <SelectField
                  value={filters.courierId ?? ""}
                  onChange={(value) => patch({ courierId: value })}
                  className="min-w-56"
                  options={[
                    { value: "", label: "Все курьеры" },
                    ...(couriers.data ?? []).map((courier) => ({
                      value: courier.id,
                      label: courier.name,
                    })),
                  ]}
                />
              </Field>
            )}
            {needs("hub") && (
              <Field label="Регион">
                <SelectField
                  value={filters.hub ?? ""}
                  onChange={(value) => patch({ hub: value })}
                  options={hubOptions}
                />
              </Field>
            )}
            {needs("city") && (
              <Field label="Город">
                <SelectField
                  value={filters.city ?? ""}
                  onChange={(value) => patch({ city: value })}
                  options={cityOptions}
                />
              </Field>
            )}
            {needs("warehouse") && (
              <Field label="Склад">
                <SelectField
                  value={filters.warehouse ?? ""}
                  onChange={(value) => patch({ warehouse: value })}
                  className="min-w-56"
                  options={[
                    { value: "", label: "Все склады" },
                    ...(warehouses.data ?? []).map((warehouse) => ({
                      value: warehouse.name,
                      label: warehouse.name,
                    })),
                  ]}
                />
              </Field>
            )}
          </div>
        )}

        {current && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">
                Столбцы — выбрано {picked.size} из {current.columns.length}
              </Label>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPicked(new Set(current.columns.map((column) => column.key)))}
                >
                  Все
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                  Ничего
                </Button>
              </div>
            </div>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {current.columns.map((column) => (
                <label
                  key={column.key}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={picked.has(column.key)}
                    onCheckedChange={(value) => toggle(column.key, value === true)}
                  />
                  {column.header}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/50 p-4">
        <span className="text-xs text-muted-foreground">
          Разделитель — точка с запятой: Excel откроет файл сразу по столбцам. Больше 50 000
          строк за раз не выгружается.
        </span>
        <span className="flex items-center gap-2">
          <Button variant="outline" render={<DialogClose />}>
            Отмена
          </Button>
          {/* У нерабочей ссылки нет состояния «выключено», поэтому пока
              выбирать нечего — это обычная погашенная кнопка. */}
          {blocked ? (
            <Button disabled>
              <Download className="size-4" />
              Скачать CSV
            </Button>
          ) : (
            <Button render={<a href={href} download />} onClick={onDone}>
              <Download className="size-4" />
              Скачать CSV
            </Button>
          )}
        </span>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
