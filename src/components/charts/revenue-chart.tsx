"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMoneyShort } from "@/lib/format";

export interface WeekPoint {
  label: string;
  revenue: number;
  payouts: number;
}

/**
 * Выручка и выплаты по неделям.
 *
 * Обе величины — деньги в сумах, поэтому лежат на одной оси: вторая шкала
 * рисовала бы несуществующую корреляцию. Расстояние между линиями и есть маржа.
 */
export function RevenueChart({ data }: { data: WeekPoint[] }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <LegendItem color="var(--viz-series-1)" label="Начислено клиентам" />
        <LegendItem color="var(--viz-series-2)" label="Начислено курьерам" />
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--viz-grid)" }}
              minTickGap={16}
            />
            <YAxis
              tick={{ fill: "var(--viz-axis)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(value: number) => formatMoneyShort(value).replace(" сум", "")}
            />
            <Tooltip
              cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
              content={<ChartTooltip />}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              name="Начислено клиентам"
              stroke="var(--viz-series-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="payouts"
              name="Начислено курьерам"
              stroke="var(--viz-series-2)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number;
  color?: string;
  name?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const revenue = payload.find((p) => p.dataKey === "revenue")?.value ?? 0;
  const payouts = payload.find((p) => p.dataKey === "payouts")?.value ?? 0;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      <dl className="space-y-0.5">
        <Line2 color="var(--viz-series-1)" label="Клиентам" value={revenue} />
        <Line2 color="var(--viz-series-2)" label="Курьерам" value={payouts} />
        <div className="mt-1 flex justify-between gap-6 border-t border-border pt-1">
          <dt className="text-muted-foreground">Маржа</dt>
          <dd className="tabular-nums">{formatMoney(revenue - payouts)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Line2({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </dt>
      <dd className="tabular-nums">{formatMoney(value)}</dd>
    </div>
  );
}
