"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange, Download, FileDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { useBackend } from "@/hooks/use-backend";
import { exportDownloadUrl, listExports, runExport } from "@/lib/backend/client";
import type { ExportKind, ExportRun, RunStatus } from "@/lib/backend/types";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

const STATUS_LABEL: Record<RunStatus, string> = {
  IDLE: "Ожидает",
  RUNNING: "Выполняется",
  SUCCESS: "Готово",
  FAILED: "Ошибка",
};

const STATUS_VARIANT: Record<RunStatus, "default" | "secondary" | "destructive" | "outline"> = {
  IDLE: "outline",
  RUNNING: "secondary",
  SUCCESS: "default",
  FAILED: "destructive",
};

const KIND_LABEL: Record<ExportKind, string> = {
  DAILY: "За сегодня",
  WEEKLY: "За неделю",
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export default function ExportsPage() {
  const [running, setRunning] = useState<ExportKind | null>(null);
  const exports = useBackend(() => listExports({ limit: 50 }), []);

  const run = async (kind: ExportKind) => {
    setRunning(kind);
    try {
      const result = await runExport({ kind });
      if (result.status === "FAILED") {
        toast.error(`Выгрузка не удалась: ${result.error ?? "причина неизвестна"}`);
      } else {
        toast.success(
          `Готово: ${formatNumber(result.rowCount)} строк, из Shipox создано ` +
            `${result.ordersCreated}, обновлено ${result.ordersUpdated}`,
        );
      }
      exports.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось запустить выгрузку");
    } finally {
      setRunning(null);
    }
  };

  const columns = useMemo<ColumnDef<ExportRun, unknown>[]>(
    () => [
      {
        id: "fileName",
        header: "Файл",
        accessorFn: (r) => r.fileName ?? "",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.fileName ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              {KIND_LABEL[row.original.kind]} · {formatSize(row.original.fileSize)}
              {row.original.demo && " · демо-данные"}
            </div>
          </div>
        ),
      },
      {
        id: "period",
        header: "Период",
        accessorFn: (r) => r.periodFrom,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDate(row.original.periodFrom)}
            {formatDate(row.original.periodFrom) !== formatDate(row.original.periodTo) &&
              ` — ${formatDate(row.original.periodTo)}`}
          </span>
        ),
      },
      {
        id: "rowCount",
        header: "Строк",
        accessorFn: (r) => r.rowCount,
        meta: { align: "right" },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.rowCount)}</span>
        ),
      },
      {
        id: "changes",
        header: "Изменилось в базе",
        accessorFn: (r) => r.ordersUpdated,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
            +{row.original.ordersCreated} новых · {row.original.ordersUpdated} обновлено ·{" "}
            {row.original.ordersSkipped} без изменений
          </span>
        ),
      },
      {
        id: "status",
        header: "Статус",
        accessorFn: (r) => r.status,
        cell: ({ row }) => (
          <div className="space-y-1">
            <Badge variant={STATUS_VARIANT[row.original.status]}>
              {STATUS_LABEL[row.original.status]}
            </Badge>
            {row.original.error && (
              <div className="max-w-64 text-xs text-destructive">{row.original.error}</div>
            )}
          </div>
        ),
      },
      {
        id: "startedAt",
        header: "Запущена",
        accessorFn: (r) => r.startedAt,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-muted-foreground">
            {formatDateTime(row.original.startedAt)}
          </span>
        ),
      },
      {
        id: "download",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === "SUCCESS" ? (
            <Button
              variant="outline"
              size="sm"
              render={<a href={exportDownloadUrl(row.original.id)} download />}
            >
              <Download className="size-3.5" />
              Скачать
            </Button>
          ) : null,
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Выгрузки"
        description="CSV в формате Shipox — тот же, что даёт кнопка «Скачать CSV» в дашборде. Формируются по расписанию; здесь их можно запустить вручную и скачать."
        actions={
          <Button variant="outline" onClick={exports.reload} disabled={exports.loading}>
            <RefreshCw className={exports.loading ? "size-4 animate-spin" : "size-4"} />
            Обновить
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Сформировать сейчас</CardTitle>
          <p className="text-sm text-muted-foreground">
            Сначала подтягивает заказы из Shipox в базу, затем строит файл. Файл текущего дня
            перезаписывается.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => run("DAILY")} disabled={running !== null}>
            <FileDown className={running === "DAILY" ? "size-4 animate-pulse" : "size-4"} />
            За сегодня
          </Button>
          <Button variant="outline" onClick={() => run("WEEKLY")} disabled={running !== null}>
            <CalendarRange className={running === "WEEKLY" ? "size-4 animate-pulse" : "size-4"} />
            За последние 7 дней
          </Button>
        </CardContent>
      </Card>

      {exports.error ? (
        <ErrorState message={exports.error} onRetry={exports.reload} />
      ) : exports.loading && !exports.data ? (
        <Skeleton className="h-96" />
      ) : (
        <DataTable
          data={exports.data ?? []}
          columns={columns}
          initialSorting={[{ id: "startedAt", desc: true }]}
          emptyMessage="Выгрузок пока нет — сформируйте первую"
        />
      )}
    </div>
  );
}
