"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Forklift,
  LoaderCircle,
  PackageCheck,
  Repeat2,
  ScanBarcode,
  Settings2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { CourierCombobox } from "@/components/ui-kit/courier-combobox";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import {
  cancelReceipt,
  listCouriers,
  listReceipts,
  listWarehouses,
  receiveOrder,
} from "@/lib/backend/client";
import type { Courier, ReceiptJournalRow, ReceiveResult, ReceiveStatus } from "@/lib/backend/types";
import { beep } from "@/lib/beep";
import { formatNumber, plural, startOfDayISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { canOpen } from "@/components/layout/nav";
import { useSession } from "@/lib/session";
import { useWarehouseDevice, useWarehouseDeviceHydrated } from "@/lib/warehouse-device";

type RowState = "PENDING" | "ERROR" | "CANCELLED" | ReceiveStatus;

/** Строка ленты приёмки: один скан или приёмка, восстановленная из журнала. */
interface ScanRow {
  key: string;
  code: string;
  courierId: string;
  courierName: string;
  state: RowState;
  message: string;
  orderNumber?: string;
  orderLine?: string;
  receiptId?: string;
  warnings: string[];
  at: string;
  /** Идёт замена или отмена — кнопки заблокированы. */
  busy?: boolean;
  /** Приёмка из журнала, а не из текущей сессии. */
  fromJournal?: boolean;
}

function orderLine(order: {
  customerName: string | null;
  senderCity: string | null;
  receiverCity: string | null;
  pieceCount: number;
}): string {
  return [
    order.customerName,
    `${order.senderCity ?? "—"} → ${order.receiverCity ?? "—"}`,
    `${order.pieceCount} ${plural(order.pieceCount, "место", "места", "мест")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function rowFromResult(result: ReceiveResult): Partial<ScanRow> {
  return {
    state: result.status,
    message: result.message,
    orderNumber: result.order?.orderNumber,
    orderLine: result.order ? orderLine(result.order) : undefined,
    receiptId: result.receipt?.id,
    warnings: result.warnings,
    busy: false,
  };
}

function rowFromJournal(receipt: ReceiptJournalRow, index: number): ScanRow {
  const boxes =
    receipt.order.pieceCount > 1 ? ` · коробка ${index} из ${receipt.order.pieceCount}` : "";
  return {
    key: `journal-${receipt.id}`,
    code: receipt.scannedCode,
    courierId: receipt.courier.id,
    courierName: receipt.courier.name,
    state: "ACCEPTED",
    message: `Принят от ${receipt.courier.name}${boxes}`,
    orderNumber: receipt.order.orderNumber,
    orderLine: orderLine(receipt.order),
    receiptId: receipt.id,
    warnings: [],
    at: receipt.receivedAt,
    fromJournal: true,
  };
}

function soundFor(result: ReceiveResult) {
  if (result.status === "ACCEPTED") return result.warnings.length > 0 ? "warn" : "ok";
  if (result.status === "ALREADY_ACCEPTED") return "repeat";
  if (result.status === "CONFLICT") return "warn";
  return "error";
}

export default function WarehouseReceivePage() {
  const hydrated = useWarehouseDeviceHydrated();
  const session = useSession();
  const deviceWarehouse = useWarehouseDevice((s) => s.warehouse);
  const [editingDevice, setEditingDevice] = useState(false);

  if (!hydrated || session.status !== "signed-in") return <Skeleton className="h-96" />;

  // У кладовщика склад закреплён за учёткой и не меняется. Офис (админ,
  // диспетчер) приходит сюда помочь и выбирает склад на устройстве.
  const own = session.user.warehouse;
  const warehouse = own ?? deviceWarehouse;

  if (!warehouse || (editingDevice && !own)) {
    return <DeviceSetup onDone={() => setEditingDevice(false)} canCancel={Boolean(warehouse)} />;
  }

  return (
    <ReceiveScreen
      warehouse={warehouse}
      receiverName={session.user.name}
      canDispatch={canOpen("/transit/dispatch", session.user.role)}
      onEditDevice={own ? undefined : () => setEditingDevice(true)}
    />
  );
}

function DeviceSetup({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const configure = useWarehouseDevice((s) => s.configure);
  const [warehouse, setWarehouse] = useState(useWarehouseDevice.getState().warehouse ?? "");
  const warehouses = useBackend(() => listWarehouses(), []);

  const save = () => {
    configure(warehouse);
    onDone();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Приёмка на складе"
        description="На каком складе работает это устройство. Кладовщику склад задаёт администратор в учётной записи, а офису достаточно выбрать его здесь."
      />
      <Card className="max-w-xl">
        <CardContent className="space-y-4 pt-2">
          {warehouses.error ? (
            <ErrorState message={warehouses.error} onRetry={warehouses.reload} />
          ) : (
            <div className="space-y-1.5">
              <Label>Склад</Label>
              <SelectField
                value={warehouse}
                onChange={setWarehouse}
                placeholder={warehouses.loading ? "Загружаю склады…" : "Выберите склад"}
                className="w-full"
                options={(warehouses.data ?? []).map((item) => ({
                  value: item.name,
                  label: item.name,
                }))}
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={save} disabled={!warehouse}>
              Начать приёмку
            </Button>
            {canCancel && (
              <Button variant="ghost" onClick={onDone}>
                Отмена
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReceiveScreen({
  warehouse,
  receiverName,
  canDispatch,
  onEditDevice,
}: {
  canDispatch: boolean;
  warehouse: string;
  receiverName: string;
  /** У кладовщика склада не выбрать: он закреплён за учётной записью. */
  onEditDevice?: () => void;
}) {
  const couriers = useBackend(() => listCouriers({ active: true }), []);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [onlyMine, setOnlyMine] = useState(true);
  const [code, setCode] = useState("");
  const [rows, setRows] = useState<ScanRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Приёмки этого курьера на этом складе за сегодня: после перезагрузки
  // страницы кладовщик видит, что уже принял, и не сканирует заново.
  const journal = useBackend(
    () =>
      courier
        ? listReceipts({ warehouse, courierId: courier.id, from: startOfDayISO(new Date()) })
        : Promise.resolve([]),
    [courier?.id, warehouse],
  );

  const allCouriers = couriers.data ?? [];
  const mine = allCouriers.filter((item) => item.warehouse === warehouse);
  const shownCouriers = onlyMine && mine.length > 0 ? mine : allCouriers;

  const feed = useMemo(() => {
    // Из журнала скрываются только приёмки, созданные в этой сессии: у них
    // уже есть своя строка. Повторный скан — лишь отметка о повторе, строка
    // приёмки с кнопкой отмены остаётся.
    const acceptedHere = new Set(
      rows.filter((row) => row.state === "ACCEPTED").map((row) => row.receiptId),
    );
    // В многоместном заказе каждая коробка — своя приёмка: в журнале они
    // нумеруются по порядку, иначе одинаковые строки не различить.
    const seen = new Map<string, number>();
    const restored = [...(journal.data ?? [])]
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
      .map((receipt) => {
        const index = (seen.get(receipt.order.orderNumber) ?? 0) + 1;
        seen.set(receipt.order.orderNumber, index);
        return { receipt, index };
      })
      .filter(({ receipt }) => !acceptedHere.has(receipt.id))
      .map(({ receipt, index }) => rowFromJournal(receipt, index));
    return [...rows, ...restored];
  }, [rows, journal.data]);

  // Коробки и заказы считаются отдельно: в многоместном заказе каждая коробка
  // сканируется своей этикеткой, и «принято 5» без пояснения путало бы.
  const acceptedRows = feed.filter((row) => row.state === "ACCEPTED");
  const boxes = new Set(acceptedRows.map((row) => row.receiptId)).size;
  const orders = new Set(acceptedRows.map((row) => row.orderNumber)).size;

  // Сканер «печатает» в то, что сейчас в фокусе. Если кладовщик кликнул мимо
  // поля, символы перехватываются и дописываются в поле скана — иначе первая
  // цифра номера терялась бы, а Enter нажал бы случайную кнопку.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const input = inputRef.current;
      if (!input || input.disabled || event.target === input) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']"))
        return;
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      setCode((current) => current + event.key);
      input.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const patchRow = (key: string, patch: Partial<ScanRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const send = (row: Pick<ScanRow, "key" | "code" | "courierId">, replace: boolean) => {
    receiveOrder({
      code: row.code,
      courierId: row.courierId,
      warehouse,
      replace,
    })
      .then((result) => {
        patchRow(row.key, rowFromResult(result));
        beep(soundFor(result));
      })
      .catch((error: unknown) => {
        patchRow(row.key, {
          state: "ERROR",
          message: error instanceof Error ? error.message : "Приёмка не удалась",
          busy: false,
        });
        beep("error");
      });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const scanned = code.trim();
    setCode("");
    if (!scanned || !courier) return;

    const row: ScanRow = {
      key: crypto.randomUUID(),
      code: scanned,
      courierId: courier.id,
      courierName: courier.name,
      state: "PENDING",
      message: "Проверяю…",
      warnings: [],
      at: new Date().toISOString(),
    };
    setRows((current) => [row, ...current]);
    send(row, false);
  };

  const replace = (row: ScanRow) => {
    patchRow(row.key, { busy: true });
    send(row, true);
  };

  const cancel = (row: ScanRow) => {
    if (!row.receiptId) return;
    if (!row.fromJournal) patchRow(row.key, { busy: true });
    cancelReceipt(row.receiptId)
      .then(() => {
        if (row.fromJournal) journal.reload();
        else patchRow(row.key, { state: "CANCELLED", message: "Приёмка отменена", busy: false });
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Не удалось отменить приёмку");
        if (!row.fromJournal) patchRow(row.key, { busy: false });
      });
    inputRef.current?.focus();
  };

  const chooseCourier = (next: Courier | null) => {
    setCourier(next);
    setRows([]);
    if (next) requestAnimationFrame(() => inputRef.current?.focus());
  };

  const finish = () => {
    if (courier) {
      toast.success(
        `Принято от ${courier.name}: ${orders} ${plural(orders, "заказ", "заказа", "заказов")}` +
          (boxes > orders ? `, ${boxes} ${plural(boxes, "коробка", "коробки", "коробок")}` : ""),
      );
    }
    chooseCourier(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Приёмка на складе"
        description={`${warehouse} · кладовщик: ${receiverName}`}
        actions={
          <>
            {/* Под конец дня с этого же склада уходят машины — но собирает их
                диспетчер, поэтому кладовщику кнопку не показываем. */}
            {canDispatch && (
              <Button variant="outline" render={<Link href="/transit/dispatch" />}>
                <Forklift className="size-4" />
                Отправка машин
              </Button>
            )}
            {onEditDevice && (
              <Button variant="outline" onClick={onEditDevice}>
                <Settings2 className="size-4" />
                Сменить склад
              </Button>
            )}
          </>
        }
      />

      {couriers.error ? (
        <ErrorState message={couriers.error} onRetry={couriers.reload} />
      ) : couriers.loading && !couriers.data ? (
        <Skeleton className="h-40" />
      ) : allCouriers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Справочник курьеров пуст</CardTitle>
            <p className="text-sm text-muted-foreground">
              Принимать заказы можно только от курьера из справочника.{" "}
              <Link href="/couriers" className="underline underline-offset-2">
                Заведите курьеров
              </Link>
              .
            </p>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Кто привёз</Label>
              <div className="flex flex-wrap items-center gap-3">
                <CourierCombobox
                  couriers={shownCouriers}
                  value={courier}
                  onChange={chooseCourier}
                  className="w-full max-w-xl"
                />
                {courier && (
                  <Button variant="outline" onClick={finish}>
                    Завершить приёмку
                  </Button>
                )}
              </div>
              {mine.length > 0 ? (
                <label className="flex w-fit cursor-pointer items-center gap-2 pt-1 text-sm text-muted-foreground">
                  <Switch checked={onlyMine} onCheckedChange={setOnlyMine} />
                  Только курьеры этого склада ({mine.length})
                </label>
              ) : (
                <p className="pt-1 text-xs text-muted-foreground">
                  За складом не закреплено курьеров — в списке все {allCouriers.length}.
                </p>
              )}
            </div>

            <form onSubmit={submit} className="space-y-1.5">
              <Label htmlFor="scan-code">Код заказа</Label>
              <div className="relative max-w-xl">
                <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="scan-code"
                  ref={inputRef}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={!courier}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={courier ? "Штрихкод или номер + Enter" : "Сначала выберите курьера"}
                  className="h-12 pl-11 font-mono text-lg"
                />
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {courier && (
        <Card className="gap-0 py-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <div className="text-sm">
              Принято от <strong>{courier.name}</strong> сегодня:{" "}
              <strong className="tabular-nums">{formatNumber(orders)}</strong>{" "}
              {plural(orders, "заказ", "заказа", "заказов")}
              {boxes > orders && (
                <>
                  {" · "}
                  <strong className="tabular-nums">{formatNumber(boxes)}</strong>{" "}
                  {plural(boxes, "коробка", "коробки", "коробок")}
                </>
              )}
            </div>
            {journal.loading && (
              <span className="text-xs text-muted-foreground">Загружаю журнал…</span>
            )}
          </div>
          {feed.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Сканируйте посылки — каждая появится здесь.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {feed.map((row) => (
                <ScanRowView
                  key={row.key}
                  row={row}
                  onReplace={() => replace(row)}
                  onCancel={() => cancel(row)}
                />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

const ROW_ICON: Record<RowState, { icon: typeof CircleCheck; className: string }> = {
  PENDING: { icon: LoaderCircle, className: "animate-spin text-muted-foreground" },
  ACCEPTED: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  ALREADY_ACCEPTED: { icon: Repeat2, className: "text-sky-600 dark:text-sky-400" },
  CONFLICT: { icon: CircleAlert, className: "text-amber-600 dark:text-amber-400" },
  CLOSED: { icon: PackageCheck, className: "text-muted-foreground" },
  NOT_FOUND: { icon: CircleX, className: "text-destructive" },
  ERROR: { icon: CircleX, className: "text-destructive" },
  CANCELLED: { icon: Undo2, className: "text-muted-foreground" },
};

function ScanRowView({
  row,
  onReplace,
  onCancel,
}: {
  row: ScanRow;
  onReplace: () => void;
  onCancel: () => void;
}) {
  const { icon: Icon, className } = ROW_ICON[row.state];
  const time = new Date(row.at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 px-4 py-2.5",
        row.state === "CONFLICT" && "bg-amber-50 dark:bg-amber-950/30",
        (row.state === "NOT_FOUND" || row.state === "ERROR") && "bg-destructive/5",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", className)} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono font-medium tabular-nums">{row.orderNumber ?? row.code}</span>
          <span
            className={cn(
              "text-sm",
              row.state === "CANCELLED" && "text-muted-foreground line-through",
            )}
          >
            {row.message}
          </span>
        </div>
        {row.orderLine && <div className="text-xs text-muted-foreground">{row.orderLine}</div>}
        {row.warnings.map((warning) => (
          <div key={warning} className="text-xs text-amber-700 dark:text-amber-400">
            {warning}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <time className="text-xs text-muted-foreground tabular-nums">{time}</time>
        {row.state === "CONFLICT" && (
          <Button size="sm" variant="outline" onClick={onReplace} disabled={row.busy}>
            Заменить на {row.courierName}
          </Button>
        )}
        {row.state === "ACCEPTED" && row.receiptId && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={row.busy}>
            Отменить
          </Button>
        )}
      </div>
    </li>
  );
}
