import { formatAmount, formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Денежная сумма в таблице: моноширинно и по правому краю, чтобы разряды сходились. */
export function Money({
  value,
  className,
  withCurrency = false,
}: {
  value: number;
  className?: string;
  withCurrency?: boolean;
}) {
  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)}>
      {withCurrency ? formatMoney(value) : formatAmount(value)}
    </span>
  );
}

/** Маржа: убыток подсвечивается, чтобы его нельзя было пролистать. */
export function MarginValue({
  value,
  pct,
  className,
}: {
  value: number;
  pct?: number;
  className?: string;
}) {
  const negative = value < 0;
  return (
    <span
      className={cn(
        "tabular-nums whitespace-nowrap",
        negative ? "font-medium text-destructive" : "text-foreground",
        className,
      )}
    >
      {formatAmount(value)}
      {pct !== undefined && (
        <span className={cn("ml-1.5 text-xs", negative ? "text-destructive/80" : "text-muted-foreground")}>
          {formatPercent(pct)}
        </span>
      )}
    </span>
  );
}
