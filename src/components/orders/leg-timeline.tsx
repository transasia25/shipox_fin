"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, MapPin, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LegTypeBadge, NoTariffBadge } from "@/components/ui-kit/status-badge";
import { Money } from "@/components/ui-kit/money";
import { zoneName } from "@/data/zones";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { COURIER_GROUP_LABEL, LEG_STATUS_LABEL } from "@/lib/labels";
import type { Courier, Leg } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Цепочка доставки: кто забрал, через какие сортировочные центры прошёл заказ,
 * кто вёз каждое междугороднее плечо и кто доставил до двери — с начислением
 * по каждому исполнителю и разбором применённого правила.
 */
export function LegTimeline({
  legs,
  couriersById,
  previousAmounts,
}: {
  legs: Leg[];
  couriersById: Map<string, Courier>;
  /** Суммы до пересчёта — чтобы показать, что именно изменилось. */
  previousAmounts?: Map<string, number | null>;
}) {
  return (
    <ol className="relative space-y-2">
      {legs.map((leg, index) => (
        <li key={leg.id} className="relative">
          <LegCard
            leg={leg}
            courier={couriersById.get(leg.courierId)}
            previousAmount={previousAmounts?.get(leg.id)}
          />
          {index < legs.length - 1 && (
            <HubDivider zoneId={leg.toZoneId} isHub={leg.type !== "last_mile"} />
          )}
        </li>
      ))}
    </ol>
  );
}

function HubDivider({ zoneId, isHub }: { zoneId: string; isHub: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2 pl-4 text-xs text-muted-foreground">
      <div className="flex size-6 items-center justify-center rounded-full border border-dashed border-border">
        {isHub ? <Warehouse className="size-3" /> : <MapPin className="size-3" />}
      </div>
      {isHub ? `Сортировочный центр · ${zoneName(zoneId)}` : zoneName(zoneId)}
    </div>
  );
}

function LegCard({
  leg,
  courier,
  previousAmount,
}: {
  leg: Leg;
  courier: Courier | undefined;
  previousAmount?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const amount = leg.payout?.amount ?? null;
  const changed = previousAmount !== undefined && previousAmount !== amount;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card",
        leg.payout === null && "border-destructive/40 bg-destructive/5",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
          {leg.seq}
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <LegTypeBadge type={leg.type} />
            <span className="font-medium">
              {courier ? (
                <Link
                  href={`/demo/couriers/${courier.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline"
                >
                  {courier.fullName}
                </Link>
              ) : (
                "Исполнитель не назначен"
              )}
            </span>
            {courier && (
              <span className="text-xs text-muted-foreground">
                {COURIER_GROUP_LABEL[courier.group]} · {courier.vehicle}
              </span>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            {zoneName(leg.fromZoneId)} → {zoneName(leg.toZoneId)}
            {leg.distanceKm > 0 && (
              <span className="tabular-nums"> · {formatNumber(leg.distanceKm)} км</span>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            {LEG_STATUS_LABEL[leg.status]} · начало {formatDateTime(leg.startedAt)}
            {leg.completedAt && ` · завершено ${formatDateTime(leg.completedAt)}`}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {leg.payout ? (
            <>
              <Money value={leg.payout.amount} withCurrency className="font-medium" />
              {changed && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  было {previousAmount === null ? "нет тарифа" : formatAmount(previousAmount)}
                </span>
              )}
            </>
          ) : (
            <NoTariffBadge />
          )}
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2.5 pl-[3.25rem] text-sm">
          {leg.payout ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Правило
                <Link href={`/demo/tariffs/${leg.payout.ruleId}`} className="hover:underline">
                  <Badge variant="outline">{leg.payout.ruleName}</Badge>
                </Link>
              </div>
              <dl className="space-y-1">
                {leg.payout.breakdown.map((line, index) => (
                  <div key={index} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{line.label}</dt>
                    <dd className="tabular-nums">{formatAmount(line.value)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-border pt-1 font-medium">
                  <dt>Итого по плечу</dt>
                  <dd className="tabular-nums">{formatAmount(leg.payout.amount)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Для этого плеча не нашлось действующего правила тарифа. Курьеру ничего не начислено —
              добавьте правило в{" "}
              <Link href="/demo/tariffs" className="underline">
                тарификаторе
              </Link>{" "}
              и пересчитайте заказ.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
