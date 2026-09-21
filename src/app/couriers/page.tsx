"use client";

import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileUp, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import {
  createCourier,
  importCouriers,
  listCouriers,
  listWarehouses,
  updateCourier,
} from "@/lib/backend/client";
import type { Courier, CourierImportResult, CourierInput } from "@/lib/backend/types";
import { formatNumber, plural } from "@/lib/format";

const NO_WAREHOUSE = "__none__";

export default function CouriersPage() {
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("all");
  const [activity, setActivity] = useState("active");
  const [editing, setEditing] = useState<Courier | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<CourierImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const query = {
    search: search.trim() || undefined,
    warehouse: warehouse === "all" ? undefined : warehouse,
    active: activity === "all" ? undefined : activity === "active",
  };
  const couriers = useBackend(() => listCouriers(query), [JSON.stringify(query)]);
  const warehouses = useBackend(() => listWarehouses(), []);

  const upload = async (file: File) => {
    setImporting(true);
    try {
      const result = await importCouriers(file);
      setImported(result);
      toast.success(
        `Загружено: новых ${result.created}, обновлено ${result.updated}, без изменений ${result.unchanged}`,
      );
      couriers.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить файл");
    } finally {
      setImporting(false);
    }
  };

  const warehouseOptions = (warehouses.data ?? []).map((item) => ({
    value: item.name,
    label: item.name,
  }));

  const columns = useMemo<ColumnDef<Courier, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Курьер",
        accessorFn: (c) => c.name,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.name}</div>
            {row.original.referenceId && (
              <div className="text-xs text-muted-foreground">{row.original.referenceId}</div>
            )}
          </div>
        ),
      },
      {
        id: "shipoxDriverId",
        header: "id Shipox",
        accessorFn: (c) => c.shipoxDriverId ?? "",
        cell: ({ row }) =>
          row.original.shipoxDriverId ? (
            <span className="font-mono text-sm tabular-nums">{row.original.shipoxDriverId}</span>
          ) : (
            <span className="text-xs text-muted-foreground" title="Без id приёмку не сверить с Shipox">
              не указан
            </span>
          ),
      },
      {
        id: "phone",
        header: "Телефон",
        accessorFn: (c) => c.phone ?? "",
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.phone ?? "—"}</span>,
      },
      {
        id: "warehouse",
        header: "Склад",
        accessorFn: (c) => c.warehouse ?? "",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">{row.original.warehouse ?? "—"}</span>
        ),
      },
      {
        id: "receipts",
        header: "Приёмок",
        accessorFn: (c) => c._count.receipts,
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original._count.receipts)}</span>
        ),
      },
      {
        id: "status",
        header: "Статус",
        accessorFn: (c) => (c.active ? 1 : 0),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.active ? (
              <Badge variant="secondary">активен</Badge>
            ) : (
              <Badge variant="outline">отключён</Badge>
            )}
            {!row.original.payable && (
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-700 dark:text-amber-400"
                title="Служебная учётка — выплаты не начисляются"
              >
                служебная
              </Badge>
            )}
            {row.original.source === "MANUAL" && (
              <Badge variant="outline" title="Заведён или исправлен вручную — импорт его не перезапишет">
                вручную
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(row.original);
            }}
          >
            <Pencil className="size-3.5" />
            Изменить
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Курьеры"
        description="Справочник, из которого кладовщик выбирает, кто привёз заказ на склад. Загружается из выгрузки водителей Shipox; курьеры сопоставляются по Driver ID, исправленные вручную повторная загрузка не трогает."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
              <FileUp className="size-4" />
              {importing ? "Загружаю…" : "Загрузить из Shipox (CSV)"}
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              Добавить курьера
            </Button>
          </>
        }
      />

      {imported && <ImportSummary result={imported} onClose={() => setImported(null)} />}

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Поиск</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя, позывной, телефон, id"
              className="h-8 w-64"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Склад</Label>
            <SelectField
              value={warehouse}
              onChange={setWarehouse}
              className="min-w-64"
              options={[{ value: "all", label: "Все склады" }, ...warehouseOptions]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Статус</Label>
            <SelectField
              value={activity}
              onChange={setActivity}
              className="min-w-40"
              options={[
                { value: "active", label: "Активные" },
                { value: "inactive", label: "Отключённые" },
                { value: "all", label: "Все" },
              ]}
            />
          </div>
        </div>
      </Card>

      {couriers.error ? (
        <ErrorState message={couriers.error} onRetry={couriers.reload} />
      ) : couriers.loading && !couriers.data ? (
        <Skeleton className="h-96" />
      ) : (
        <DataTable
          data={couriers.data ?? []}
          columns={columns}
          onRowClick={(courier) => setEditing(courier)}
          pageSize={50}
          emptyMessage="Курьеров нет — добавьте первого"
        />
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing !== null && (
            <CourierForm
              key={editing === "new" ? "new" : editing.id}
              courier={editing === "new" ? null : editing}
              warehouseOptions={warehouseOptions}
              onSaved={() => {
                setEditing(null);
                couriers.reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CourierForm({
  courier,
  warehouseOptions,
  onSaved,
}: {
  courier: Courier | null;
  warehouseOptions: Array<{ value: string; label: string }>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Required<CourierInput>>({
    name: courier?.name ?? "",
    shipoxDriverId: courier?.shipoxDriverId ?? "",
    referenceId: courier?.referenceId ?? "",
    phone: courier?.phone ?? "",
    warehouse: courier?.warehouse ?? NO_WAREHOUSE,
    active: courier?.active ?? true,
    payable: courier?.payable ?? true,
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CourierInput>(key: K, value: CourierInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const body: CourierInput = {
      ...form,
      warehouse: form.warehouse === NO_WAREHOUSE ? null : form.warehouse,
    };
    try {
      if (courier) await updateCourier(courier.id, body);
      else await createCourier({ ...body, active: undefined });
      toast.success(courier ? "Курьер сохранён" : "Курьер добавлен");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{courier ? "Курьер" : "Новый курьер"}</DialogTitle>
        <DialogDescription>
          id Shipox нужен, чтобы сверять приёмку на складе с данными Shipox и сводить выплаты.
        </DialogDescription>
      </DialogHeader>

      <Field label="Имя" htmlFor="courier-name">
        <Input
          id="courier-name"
          value={form.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="Как заведён в Shipox"
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="id Shipox" htmlFor="courier-shipox-id">
          <Input
            id="courier-shipox-id"
            value={form.shipoxDriverId ?? ""}
            onChange={(event) => set("shipoxDriverId", event.target.value)}
            inputMode="numeric"
            placeholder="2433010119"
          />
        </Field>
        <Field label="Позывной" htmlFor="courier-reference">
          <Input
            id="courier-reference"
            value={form.referenceId ?? ""}
            onChange={(event) => set("referenceId", event.target.value)}
            placeholder="Toxtayev 10-639"
          />
        </Field>
      </div>
      <Field label="Телефон" htmlFor="courier-phone">
        <Input
          id="courier-phone"
          value={form.phone ?? ""}
          onChange={(event) => set("phone", event.target.value)}
          inputMode="tel"
          placeholder="+998"
        />
      </Field>
      <Field label="Склад">
        <SelectField
          value={form.warehouse ?? NO_WAREHOUSE}
          onChange={(value) => set("warehouse", value)}
          className="w-full"
          options={[{ value: NO_WAREHOUSE, label: "Не закреплён" }, ...warehouseOptions]}
        />
      </Field>
      {courier && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={form.active} onCheckedChange={(value) => set("active", value)} />
          Активен — доступен для выбора на приёмке
        </label>
      )}
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Switch
          checked={form.payable}
          onCheckedChange={(value) => set("payable", value)}
          className="mt-0.5"
        />
        <span>
          Начислять выплаты
          <span className="block text-xs text-muted-foreground">
            Снимите у служебных учёток — складских «For Delivery» и системной: доставки на них
            записаны, но платить некому.
          </span>
        </span>
      </label>

      <DialogFooter>
        <Button type="submit" disabled={saving || !form.name.trim()}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ImportSummary({ result, onClose }: { result: CourierImportResult; onClose: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">Выгрузка Shipox загружена</CardTitle>
          <p className="text-sm text-muted-foreground">
            {formatNumber(result.total)} {plural(result.total, "строка", "строки", "строк")}: новых{" "}
            {result.created}, обновлено {result.updated}, без изменений {result.unchanged}
            {result.keptManual.length > 0 && `, исправлены вручную и не тронуты ${result.keptManual.length}`}
            {result.problems.length > 0 && `, пропущено ${result.problems.length}`}.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Скрыть итог загрузки">
          <X className="size-4" />
        </Button>
      </CardHeader>
      {(result.problems.length > 0 || result.keptManual.length > 0) && (
        <CardContent className="space-y-3 text-sm">
          {result.problems.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium">Пропущены</div>
              <ul className="space-y-0.5 text-muted-foreground">
                {result.problems.map((problem) => (
                  <li key={`${problem.line}-${problem.reason}`}>
                    строка {problem.line}: {problem.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.keptManual.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium">Исправлены вручную — оставлены как есть</div>
              <p className="text-muted-foreground">
                {result.keptManual.map((courier) => courier.name).join(", ")}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
