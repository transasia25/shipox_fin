"use client";

import { formatMoney, formatNumber, formatPercent, plural } from "@/lib/format";
import { LEG_TYPE_LABEL } from "@/lib/labels";
import type { LegType } from "@/lib/types";

export interface LegMixItem {
  type: LegType;
  amount: number;
  legs: number;
}

/** Цвет закреплён за типом плеча — тот же, что у бейджей в таблицах. */
const COLOR: Record<LegType, string> = {
  pickup: "var(--viz-series-1)",
  linehaul: "var(--viz-series-2)",
  last_mile: "var(--viz-series-3)",
};

/**
 * Из чего складываются выплаты: доля забора, транзита и доставки до двери.
 * Часть от целого при трёх сегментах — составной столбец с прямыми подписями,
 * чтобы цифры читались без наведения.
 */
export function LegMixChart({ data }: { data: LegMixItem[] }) {
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Начислений за период нет</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex h-5 w-full gap-0.5 overflow-hidden">
        {data.map((item) => (
          <div
            key={item.type}
            className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ width: `${(item.amount / total) * 100}%`, background: COLOR[item.type] }}
            title={`${LEG_TYPE_LABEL[item.type]}: ${formatMoney(item.amount)}`}
          />
        ))}
      </div>

      <dl className="space-y-2">
        {data.map((item) => (
          <div key={item.type} className="flex items-center justify-between gap-3 text-sm">
            <dt className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ background: COLOR[item.type] }} />
              {LEG_TYPE_LABEL[item.type]}
              <span className="text-xs text-muted-foreground">
                {formatNumber(item.legs)} {plural(item.legs, "плечо", "плеча", "плеч")}
              </span>
            </dt>
            <dd className="flex items-baseline gap-2 tabular-nums">
              <span>{formatMoney(item.amount)}</span>
              <span className="w-12 text-right text-xs text-muted-foreground">
                {formatPercent((item.amount / total) * 100)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
