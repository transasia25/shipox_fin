"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import { createCarrier, listCarriers, listTransitRoutes, updateCarrier } from "@/lib/backend/client";
import type { Carrier, CarrierInput, TransitRoute } from "@/lib/backend/types";
import { formatNumber } from "@/lib/format";

export default function CarriersPage() {
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState("active");
  const [editing, setEditing] = useState<Carrier | "new" | null>(null);

  const query = {
    search: search.trim() || undefined,
    active: activity === "all" ? undefined : activity === "active",
  };
  const carriers = useBackend(() => listCarriers(query), [JSON.stringify(query)]);
  const routes = useBackend(() => listTransitRoutes(), []);

  const columns = useMemo<ColumnDef<Carrier, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Перевозчик",
        accessorFn: (c) => c.name,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.name}</div>
            {row.original.note && (
              <div className="text-xs text-muted-foreground">{row.original.note}</div>
            )}
          </div>
        ),
      },
      {
        id: "kind",
        header: "Форма",
        accessorFn: (c) => c.kind,
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.kind === "COMPANY" ? "ООО" : "ИП"}</Badge>
        ),
      },
      {
        id: "routes",
        header: "Направления",
        accessorFn: (c) => c.routes.map((route) => route.code).join(","),
        cell: ({ row }) =>
          row.original.routes.length === 0 ? (
            <span className="text-xs text-muted-foreground" title="Не указано — виден на всех плечах">
              все
            </span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.routes.map((route) => (
                <Badge key={route.id} variant="secondary" title={route.name}>
                  {route.code}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        id: "phone",
        header: "Телефон",
        accessorFn: (c) => c.phone ?? "",
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.phone ?? "—"}</span>,
      },
      {
        id: "shipox",
        header: "id Shipox",
        accessorFn: (c) => c.shipoxDriverId ?? "",
        cell: ({ row }) =>
          row.original.shipoxDriverId ? (
            <span className="font-mono text-sm tabular-nums">{row.original.shipoxDriverId}</span>
          ) : (
            <span className="text-xs text-muted-foreground" title="В Shipox не заведён — подсказок по нему не будет">
              нет в Shipox
            </span>
          ),
      },
      {
        id: "trips",
        header: "Рейсов",
        accessorFn: (c) => c._count.trips,
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original._count.trips)}</span>,
      },
      {
        id: "status",
        header: "Статус",
        accessorFn: (c) => (c.active ? 1 : 0),
        cell: ({ row }) =>
          row.original.active ? (
            <Badge variant="secondary">активен</Badge>
          ) : (
            <Badge variant="outline">отключён</Badge>
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
        title="Перевозчики"
        description="ООО и ИП, которые везут заказы между городами до ПВЗ. Курьеры на заборе и доставке — отдельный справочник."
        actions={
          <>
            <Button variant="outline" render={<Link href="/transit" />}>
              Межгород
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" />
              Добавить перевозчика
            </Button>
          </>
        }
      />

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Поиск</Label>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Название, телефон, id"
              className="h-8 w-64"
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

      {carriers.error ? (
        <ErrorState message={carriers.error} onRetry={carriers.reload} />
      ) : carriers.loading && !carriers.data ? (
        <Skeleton className="h-96" />
      ) : (
        <DataTable
          data={carriers.data ?? []}
          columns={columns}
          onRowClick={(carrier) => setEditing(carrier)}
          pageSize={50}
          emptyMessage="Перевозчиков нет — добавьте первого"
        />
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing !== null && (
            <CarrierForm
              key={editing === "new" ? "new" : editing.id}
              carrier={editing === "new" ? null : editing}
              routes={routes.data ?? []}
              onSaved={() => {
                setEditing(null);
                carriers.reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CarrierForm({
  carrier,
  routes,
  onSaved,
}: {
  carrier: Carrier | null;
  routes: TransitRoute[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Required<Omit<CarrierInput, "routeIds">> & { routeIds: string[] }>({
    name: carrier?.name ?? "",
    kind: carrier?.kind ?? "ENTREPRENEUR",
    phone: carrier?.phone ?? "",
    shipoxDriverId: carrier?.shipoxDriverId ?? "",
    note: carrier?.note ?? "",
    active: carrier?.active ?? true,
    routeIds: carrier?.routes.map((route) => route.id) ?? [],
  });
  const [saving, setSaving] = useState(false);

  const toggleRoute = (id: string, checked: boolean) =>
    setForm((current) => ({
      ...current,
      routeIds: checked
        ? [...current.routeIds, id]
        : current.routeIds.filter((routeId) => routeId !== id),
    }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (carrier) await updateCarrier(carrier.id, form);
      else await createCarrier({ ...form, active: undefined });
      toast.success(carrier ? "Перевозчик сохранён" : "Перевозчик добавлен");
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
        <DialogTitle>{carrier ? "Перевозчик" : "Новый перевозчик"}</DialogTitle>
        <DialogDescription>
          Направления сужают выбор при распределении. Если не отметить ни одного, перевозчик виден на
          всех плечах.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="carrier-name">Название</Label>
        <Input
          id="carrier-name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="ООО OMON TRANS"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Форма</Label>
          <SelectField
            value={form.kind}
            onChange={(value) =>
              setForm((current) => ({ ...current, kind: value as Carrier["kind"] }))
            }
            className="w-full"
            options={[
              { value: "ENTREPRENEUR", label: "ИП" },
              { value: "COMPANY", label: "ООО" },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="carrier-phone">Телефон</Label>
          <Input
            id="carrier-phone"
            value={form.phone ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            inputMode="tel"
            placeholder="+998"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="carrier-shipox">id водителя в Shipox</Label>
        <Input
          id="carrier-shipox"
          value={form.shipoxDriverId ?? ""}
          onChange={(event) =>
            setForm((current) => ({ ...current, shipoxDriverId: event.target.value }))
          }
          inputMode="numeric"
          placeholder="не обязательно"
        />
        <p className="text-xs text-muted-foreground">
          Нужен только для подсказки при распределении: если водитель заказа совпал, перевозчик
          подсветится.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Направления</Label>
        <div className="space-y-1.5">
          {routes.map((route) => (
            <label key={route.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={form.routeIds.includes(route.id)}
                onCheckedChange={(value) => toggleRoute(route.id, value === true)}
              />
              <span className="font-medium">{route.code}</span> {route.name}
            </label>
          ))}
          {routes.length === 0 && (
            <p className="text-xs text-muted-foreground">Направления ещё не заведены.</p>
          )}
        </div>
      </div>

      {carrier && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch
            checked={form.active}
            onCheckedChange={(value) => setForm((current) => ({ ...current, active: value }))}
          />
          Активен — доступен при распределении
        </label>
      )}

      <DialogFooter>
        <Button type="submit" disabled={saving || !form.name.trim()}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </Button>
      </DialogFooter>
    </form>
  );
}
