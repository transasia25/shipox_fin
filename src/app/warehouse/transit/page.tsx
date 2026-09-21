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
  Settings2,
  Truck,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { useBackend } from "@/hooks/use-backend";
import { cancelTransitScan, listTransitScans, scanTransitLoad } from "@/lib/backend/client";
import type {
  TransitLoadResult,
  TransitLoadStatus,
  TransitScanJournalRow,
} from "@/lib/backend/types";
import { beep } from "@/lib/beep";
import { formatNumber, plural, startOfDayISO } from "@/lib/format";
import { legLabel, shortWarehouse } from "@/lib/transit";
import { useSession } from "@/lib/session";
import { useWarehouseDevice, useWarehouseDeviceHydrated } from "@/lib/warehouse-device";

/**
 * Отправка в транзит: кладовщик ПВЗ заранее пробивает коробки, которые уедут
 * межгородней машиной.
 *
 * Перевозчика здесь не выбирают — пробитое складывается по рейсам и уходит
 * диспетчеру, который назначает машину на всю дорогу.
 */

type RowState = "PENDING" | "ERROR" | "CANCELLED" | TransitLoadStatus;

interface ScanRow {
  key: string;
  code: string;
  state: RowState;
  message: string;
  orderNumber?: string;
  orderLine?: string;
  goesTo?: string;
  scanId?: string;
  warnings: string[];
  at?: string;
  busy?: boolean;
}

const ROW_ICON: Record<RowState, { icon: typeof CircleCheck; className: string }> = {
  PENDING: { icon: LoaderCircle, className: "animate-spin text-muted-foreground" },
  ACCEPTED: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-400" },
  ALREADY_SCANNED: { icon: Repeat2, className: "text-sky-600 dark:text-sky-400" },
  IN_TRIP: { icon: Truck, className: "text-sky-600 dark:text-sky-400" },
  CLOSED: { icon: PackageCheck, className: "text-muted-foreground" },
  NO_TRANSIT: { icon: CircleAlert, className: "text-amber-600 dark:text-amber-400" },
  NOT_FOUND: { icon: CircleX, className: "text-destructive" },
  ERROR: { icon: CircleX, className: "text-destructive" },
  CANCELLED: { icon: Undo2, className: "text-muted-foreground" },
};

function soundFor(result: TransitLoadResult) {
  if (result.status === "ACCEPTED") return result.warnings.length > 0 ? "warn" : "ok";
  if (result.status === "ALREADY_SCANNED") return "repeat";
  if (result.status === "IN_TRIP" || result.status === "CLOSED") return "warn";
  return "error";
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

export default function TransitLoadPage() {
  const hydrated = useWarehouseDeviceHydrated();
  const session = useSession();
  const deviceWarehouse = useWarehouseDevice((s) => s.warehouse);

  if (!hydrated || session.status !== "signed-in") return <Skeleton className="h-96" />;

  // У кладовщика склад из учётки, у офиса — из настройки устройства, общей с
  // приёмкой: второй раз её не спрашиваем.
  const warehouse = session.user.warehouse ?? deviceWarehouse;

  if (!warehouse) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Отправка в транзит"
          description="Сначала выберите склад на экране приёмки — он запомнится в этом браузере."
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Склад не выбран</CardTitle>
            <p className="text-sm text-muted-foreground">
              Кладовщику склад задаёт администратор в учётной записи, офису — настройка устройства.
            </p>
            <div className="pt-2">
              <Button render={<Link href="/warehouse/receive" />}>
                <Settings2 className="size-4" />
                Настроить на приёмке
              </Button>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <LoadScreen warehouse={warehouse} scannedBy={session.user.name} />;
}

function LoadScreen({ warehouse, scannedBy }: { warehouse: string; scannedBy: string }) {
  const [code, setCode] = useState("");
  const [rows, setRows] = useState<ScanRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Сканы этого склада за сегодня: после перезагрузки страницы кладовщик
  // видит, что уже пробил, и не бьёт коробки заново.
  const journal = useBackend(
    () => listTransitScans({ warehouse, from: startOfDayISO(new Date()) }),
    [warehouse],
  );

  const feed = useMemo(() => {
    const scannedHere = new Set(
      rows.filter((row) => row.state === "ACCEPTED").map((row) => row.scanId),
    );
    // В многоместном заказе каждая коробка — свой скан: в журнале они
    // нумеруются по порядку, иначе одинаковые строки не различить.
    const seen = new Map<string, number>();
    const restored = [...(journal.data ?? [])]
      .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
      .map((scan) => {
        const index = (seen.get(scan.order.orderNumber) ?? 0) + 1;
        seen.set(scan.order.orderNumber, index);
        return { scan, index };
      })
      .filter(({ scan }) => !scannedHere.has(scan.id))
      .map(({ scan, index }) => rowFromJournal(scan, index));
    return [...rows, ...restored];
  }, [rows, journal.data]);

  const accepted = feed.filter((row) => row.state === "ACCEPTED");
  const boxes = new Set(accepted.map((row) => row.scanId)).size;
  const orders = new Set(accepted.map((row) => row.orderNumber)).size;

  // Сканер «печатает» в то, что сейчас в фокусе. Если кладовщик кликнул мимо
  // поля, символы перехватываются и дописываются в поле скана.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const input = inputRef.current;
      if (!input || event.target === input) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) {
        return;
      }
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

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const scanned = code.trim();
    setCode("");
    if (!scanned) return;

    const key = `${Date.now()}-${scanned}`;
    setRows((current) => [
      {
        key,
        code: scanned,
        state: "PENDING",
        message: "Ищу заказ…",
        warnings: [],
        at: new Date().toISOString(),
        busy: true,
      },
      ...current,
    ]);

    scanTransitLoad({ code: scanned, warehouse })
      .then((result) => {
        patchRow(key, rowFromResult(result));
        beep(soundFor(result));
        if (result.status === "ACCEPTED") journal.reload();
      })
      .catch((error: unknown) => {
        patchRow(key, {
          state: "ERROR",
          message: error instanceof Error ? error.message : "Скан не прошёл",
          busy: false,
        });
        beep("error");
      });
    inputRef.current?.focus();
  };

  const cancel = (row: ScanRow) => {
    if (!row.scanId) return;
    patchRow(row.key, { busy: true });
    cancelTransitScan(row.scanId)
      .then(() => {
        patchRow(row.key, { state: "CANCELLED", message: "Скан отменён", busy: false });
        journal.reload();
      })
      .catch((error: unknown) => {
        patchRow(row.key, { busy: false });
        toast.error(error instanceof Error ? error.message : "Не удалось отменить скан");
      });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Отправка в транзит"
        description={`${warehouse} · кладовщик: ${scannedBy}`}
        actions={
          <Button variant="outline" render={<Link href="/warehouse/receive" />}>
            <Settings2 className="size-4" />
            Приёмка и настройка
          </Button>
        }
      />

      <Card className="p-4">
        <form onSubmit={submit} className="space-y-1.5">
          <Label htmlFor="transit-code" className="text-xs text-muted-foreground">
            Код заказа
          </Label>
          <div className="relative">
            <Forklift className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="transit-code"
              ref={inputRef}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Штрихкод или номер + Enter"
              autoFocus
              autoComplete="off"
              className="h-12 pl-9 font-mono text-base"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Пробивайте коробки, которые уедут межгородней машиной. Перевозчика назначит диспетчер.
          </p>
        </form>
      </Card>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <div className="text-sm">
            Сегодня в транзит с <strong>{shortWarehouse(warehouse)}</strong>:{" "}
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

        {journal.error ? (
          <div className="p-4">
            <ErrorState message={journal.error} onRetry={journal.reload} />
          </div>
        ) : feed.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Сканируйте коробки — каждая появится здесь.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {feed.map((row) => (
              <ScanRowView key={row.key} row={row} onCancel={() => cancel(row)} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function rowFromResult(result: TransitLoadResult): Partial<ScanRow> {
  return {
    state: result.status,
    message: result.message,
    orderNumber: result.order?.orderNumber,
    orderLine: result.order ? orderLine(result.order) : undefined,
    goesTo: result.leg
      ? `${result.leg.route.code} · ${legLabel(result.leg.fromWarehouse, result.leg.toWarehouse)}`
      : undefined,
    scanId: result.scan?.id,
    warnings: result.warnings,
    busy: false,
  };
}

function rowFromJournal(scan: TransitScanJournalRow, index: number): ScanRow {
  const boxes = scan.order.pieceCount > 1 ? ` · коробка ${index} из ${scan.order.pieceCount}` : "";
  return {
    key: `journal-${scan.id}`,
    code: scan.scannedCode,
    state: "ACCEPTED",
    message: `В машину${boxes}`,
    orderNumber: scan.order.orderNumber,
    orderLine: orderLine(scan.order),
    // Рейс известен только в момент скана: в журнале показываем конечный ПВЗ.
    goesTo: scan.order.destinationWarehouse
      ? `конечный ПВЗ: ${shortWarehouse(scan.order.destinationWarehouse)}`
      : undefined,
    scanId: scan.id,
    warnings: [],
    at: scan.scannedAt,
  };
}

function ScanRowView({ row, onCancel }: { row: ScanRow; onCancel: () => void }) {
  const { icon: Icon, className } = ROW_ICON[row.state];
  const time = row.at ? new Date(row.at).toLocaleTimeString("ru-RU", { hour12: false }) : "";

  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium tabular-nums">{row.orderNumber ?? row.code}</span>
          <span className={row.state === "CANCELLED" ? "text-muted-foreground" : undefined}>
            {row.message}
          </span>
          {row.goesTo && <span className="text-xs text-muted-foreground">· {row.goesTo}</span>}
        </div>
        {row.orderLine && <div className="text-xs text-muted-foreground">{row.orderLine}</div>}
        {row.warnings.map((warning) => (
          <div key={warning} className="text-xs text-amber-700 dark:text-amber-400">
            {warning}
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">{time}</span>
        {row.scanId && row.state !== "CANCELLED" && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={row.busy}>
            Отменить
          </Button>
        )}
      </div>
    </li>
  );
}
