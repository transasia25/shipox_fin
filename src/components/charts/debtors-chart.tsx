"use client";

import Link from "next/link";
import { formatMoney, formatMoneyShort } from "@/lib/format";

export interface DebtorPoint {
  clientId: string;
  name: string;
  balance: number;
  overdue: number;
}

/**
 * Топ должников. Одна величина — одна серия и один цвет: раскрашивать столбцы
 * по величине значило бы дважды закодировать одно и то же. Просроченная часть
 * выделена отдельным тоном внутри столбца.
 */
export function DebtorsChart({ data }: { data: DebtorPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.balance));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Задолженности нет</p>;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--viz-series-1)" }} />
          Срок не наступил
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: "var(--viz-series-1)", opacity: 0.35 }}
          />
          Просрочено
        </span>
      </div>

      {data.map((item) => {
        const overduePct = (item.overdue / max) * 100;
        const currentPct = ((item.balance - item.overdue) / max) * 100;
        return (
          <div key={item.clientId} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3">
            <Link
              href={`/demo/clients/${item.clientId}`}
              className="truncate text-sm hover:underline"
              title={item.name}
            >
              {item.name}
            </Link>
            <div
              className="flex h-4 items-center gap-0.5"
              title={`${item.name}: ${formatMoney(item.balance)}, из них просрочено ${formatMoney(item.overdue)}`}
            >
              {currentPct > 0 && (
                <div
                  className="h-full rounded-l-[4px]"
                  style={{ width: `${currentPct}%`, background: "var(--viz-series-1)" }}
                />
              )}
              {overduePct > 0 && (
                <div
                  className="h-full rounded-r-[4px]"
                  style={{
                    width: `${overduePct}%`,
                    background: "var(--viz-series-1)",
                    opacity: 0.35,
                  }}
                />
              )}
            </div>
            <span className="w-24 text-right text-sm tabular-nums">
              {formatMoneyShort(item.balance)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
