"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Calculator, History, Pencil, Plus, RotateCcw, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { NumberField } from "@/components/ui-kit/number-field";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import {
  addCourierAdjustment,
  editCourierPayout,
  getCourierPayoutSummary,
  listCourierAdjustments,
  listCourierPayoutChanges,
  listCourierPayouts,
  removeCourierAdjustment,
  resetCourierPayout,
  runCourierPayouts,
} from "@/lib/backend/client";
import type {
  CourierAdjustment,
  CourierPayout,
  CourierPayoutChange,
  CourierPayoutStatus,
  CourierPayoutSummaryRow,
} from "@/lib/backend/types";
import {
  LEG_LABEL,
  PAYOUT_SOURCE_LABEL,
  PAYOUT_STATUS_LABEL,
  RATE_KIND_LABEL,
  payoutCityLabel,
} from "@/lib/courier-payouts";
import { formatDateTime, formatMoneyShort, formatNumber, formatWeight } from "@/lib/format";
import { useFinanceStore } from "@/lib/store";

/** Что открыто в боковой панели: начисления курьера или список проблем одного вида. */
type Detail =
  | { kind: "courier"; row: CourierPayoutSummaryRow }
  | { kind: "status"; status: Exclude<CourierPayoutStatus, "CALCULATED">; count: number };

export default function CourierPayoutsPage() {
  const period = useFinanceStore((s) => s.period);
  const window = { from: period.from, to: period.to };
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);

  // Пустая строка — «все»: так же, как склад на отправке машин.
  const [hub, setHub] = useState("");
  const [city, setCity] = useState("");
  const place = { hub: hub || undefined, city: city || undefined };

  const summary = useBackend(
    () => getCourierPayoutSummary({ ...window, ...place }),
    [window.from, window.to, hub, city],
  );
  const totals = summary.data?.totals;

  // Списки собираются из самих начислений: в них только те города, где за
  // период действительно была работа, и регион каждого известен сразу.
  const places = useMemo(() => summary.data?.places ?? [], [summary.data]);
  const hubOptions = useMemo(() => {
    const names = [...new Set(places.map((item) => item.hub).filter((name) => name !== null))];
    return [
      { value: "", label: "Все регионы" },
      ...names.sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })),
    ];
  }, [places]);
  const cityOptions = useMemo(() => {
    const scoped = hub ? places.filter((item) => item.hub === hub) : places;
    return [
      { value: "", label: hub ? "Все города региона" : "Все города" },
      ...scoped.map((item) => ({
        value: item.city,
        label: `${item.city} · ${formatNumber(item.payouts)}`,
      })),
    ];
  }, [places, hub]);

  /** Регион и город связаны: чужой город в выбранном регионе — пустая таблица. */
  const chooseHub = (next: string) => {
    setHub(next);
    if (next && city && !places.some((item) => item.hub === next && item.city === city)) {
      setCity("");
    }
  };

  const recalculate = async () => {
    setRunning(true);
    try {
      const result = await runCourierPayouts({ ...window });
      toast.success(
        `Пересчитано: новых ${result.created}, изменено ${result.updated}, снято ${result.removed}, ` +
          `без изменений ${result.unchanged}`,
      );
      summary.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Пересчёт не удался");
    } finally {
      setRunning(false);
    }
  };

  const columns = useMemo<ColumnDef<CourierPayoutSummaryRow, unknown>[]>(
    () => [
      {
        id: "courier",
        header: "Курьер",
        accessorFn: (r) => r.courierName,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.courierName}</div>
            {!row.original.courierId && (
              <div className="text-xs text-amber-600 dark:text-amber-400">нет в справочнике курьеров</div>
            )}
          </div>
        ),
      },
      {
        id: "pickups",
        header: "Заборов",
        accessorFn: (r) => r.pickups,
        meta: { align: "right" },
        cell: ({ row }) => <Count value={row.original.pickups} />,
      },
      {
        id: "deliveries",
        header: "Доставок",
        accessorFn: (r) => r.deliveries,
        meta: { align: "right" },
        cell: ({ row }) => <Count value={row.original.deliveries} />,
      },
      {
        id: "heavy",
        header: "Из них тяжёлых",
        accessorFn: (r) => r.heavy,
        meta: { align: "right" },
        cell: ({ row }) => <Count value={row.original.heavy} />,
      },
      {
        id: "unpaid",
        header: "Без суммы",
        accessorFn: (r) => r.notPayable + r.cityNotFound + r.noTariff,
        meta: { align: "right" },
        cell: ({ row }) => {
          const { notPayable, cityNotFound, noTariff } = row.original;
          const total = notPayable + cityNotFound + noTariff;
          if (total === 0) return <span className="text-muted-foreground/50">—</span>;
          const reasons = [
            notPayable && `служебная учётка: ${notPayable}`,
            cityNotFound && `города нет в справочнике: ${cityNotFound}`,
            noTariff && `нет тарифа: ${noTariff}`,
          ].filter(Boolean);
          return (
            <span className="text-amber-700 tabular-nums dark:text-amber-400" title={reasons.join(", ")}>
              {total}
            </span>
          );
        },
      },
      {
        id: "amount",
        header: "Начислено",
        accessorFn: (r) => r.amount,
        meta: { align: "right" },
        cell: ({ row }) => (
          <div>
            <Money value={row.original.amount} />
            {row.original.manual > 0 && (
              <div
                className="text-xs text-amber-700 dark:text-amber-400"
                title="Суммы, проставленные руками: пересчёт их не трогает"
              >
                правок {formatNumber(row.original.manual)}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "adjustments",
        header: "Надбавки и удержания",
        accessorFn: (r) => r.adjustments,
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.adjustments === 0 ? (
            <span className="text-muted-foreground/50">—</span>
          ) : (
            <Money
              value={row.original.adjustments}
              className={
                row.original.adjustments > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-destructive"
              }
            />
          ),
      },
      {
        id: "payable",
        header: "К выплате",
        accessorFn: (r) => r.payable,
        meta: { align: "right" },
        cell: ({ row }) => <Money value={row.original.payable} className="font-medium" />,
      },
    ],
    [],
  );

  const problems = totals
    ? (
        [
          ["NOT_PAYABLE", totals.notPayable],
          ["CITY_NOT_FOUND", totals.cityNotFound],
          ["NO_TARIFF", totals.noTariff],
        ] as const
      ).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Начисления курьерам"
        description="За забор у клиента и доставку получателю — по тарифу курьеров: город, район или тяжёлый заказ. Вес берётся оплачиваемый — больший из фактического и объёмного. Период — по факту работы: у забора это приезд коробки на сортировочный центр, у доставки — завершение заказа. Фильтр по месту работы: у забора это город отправителя, у доставки — получателя."
        actions={
          <>
            <Button variant="outline" onClick={() => setChangesOpen(true)}>
              <History className="size-4" />
              Журнал правок
            </Button>
            <Button variant="outline" render={<Link href="/courier-tariffs" />}>
              Тарифы курьеров
            </Button>
            <Button onClick={recalculate} disabled={running}>
              <Calculator className="size-4" />
              {running ? "Пересчитываю…" : "Пересчитать"}
            </Button>
          </>
        }
      />

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Регион</Label>
            <SelectField
              value={hub}
              onChange={chooseHub}
              options={hubOptions}
              placeholder="Все регионы"
              className="min-w-52"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Город</Label>
            <SelectField
              value={city}
              onChange={setCity}
              options={cityOptions}
              placeholder={hub ? "Все города региона" : "Все города"}
              className="min-w-60"
            />
          </div>
          {(hub || city) && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={() => {
                setHub("");
                setCity("");
              }}
            >
              Сбросить
            </Button>
          )}
        </div>
      </Card>

      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : summary.loading && !summary.data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              label="К выплате"
              value={formatMoneyShort(totals?.payable ?? 0)}
              hint="начислено по заказам плюс надбавки и удержания"
            />
            <KpiCard
              label="Начислено по заказам"
              value={formatMoneyShort(totals?.amount ?? 0)}
              hint={
                (totals?.manual ?? 0) > 0
                  ? `из них поправлено руками: ${formatNumber(totals?.manual ?? 0)}`
                  : undefined
              }
            />
            <KpiCard
              label="Надбавки и удержания"
              value={formatMoneyShort(totals?.adjustments ?? 0)}
              tone={(totals?.adjustments ?? 0) < 0 ? "negative" : "default"}
            />
            <KpiCard label="Заборов" value={formatNumber(totals?.pickups ?? 0)} />
            <KpiCard label="Доставок" value={formatNumber(totals?.deliveries ?? 0)} />
            <KpiCard
              label="Тяжёлых заказов"
              value={formatNumber(totals?.heavy ?? 0)}
              hint="по ставке за тяжёлый"
            />
          </div>

          {problems.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
                  <TriangleAlert className="size-4" />
                  Работа есть, а суммы нет
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {problems.map(([status, count]) => (
                  <Button
                    key={status}
                    variant="outline"
                    size="sm"
                    onClick={() => setDetail({ kind: "status", status, count })}
                  >
                    {PAYOUT_STATUS_LABEL[status]}: {formatNumber(count)}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          <DataTable
            data={summary.data?.couriers ?? []}
            columns={columns}
            initialSorting={[{ id: "amount", desc: true }]}
            onRowClick={(row) => setDetail({ kind: "courier", row })}
            pageSize={50}
            emptyMessage="За период начислений нет"
          />
        </>
      )}

      <Sheet open={changesOpen} onOpenChange={setChangesOpen}>
        <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
          <ChangeLog from={window.from} to={window.to} />
        </SheetContent>
      </Sheet>

      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
          {detail && (
            <PayoutDetail
              detail={detail}
              from={window.from}
              to={window.to}
              place={place}
              onChanged={summary.reload}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Count({ value }: { value: number }) {
  return value > 0 ? (
    <span className="tabular-nums">{formatNumber(value)}</span>
  ) : (
    <span className="text-muted-foreground/50">—</span>
  );
}

function PayoutDetail({
  detail,
  from,
  to,
  place,
  onChanged,
}: {
  detail: Detail;
  from: string;
  to: string;
  /** Тот же регион и город, что в таблице: иначе суммы в панели не сойдутся. */
  place: { hub?: string; city?: string };
  /** Деньги поправили — таблица и счётчики за панелью устарели. */
  onChanged: () => void;
}) {
  const query =
    detail.kind === "courier"
      ? detail.row.courierId
        ? { courierId: detail.row.courierId }
        : { shipoxDriverId: detail.row.shipoxDriverId ?? undefined }
      : { status: detail.status };
  const payouts = useBackend(
    () => listCourierPayouts({ ...query, ...place, from, to }),
    [JSON.stringify(query), from, to, place.hub, place.city],
  );
  // Надбавки и удержания к заказам не привязаны, поэтому ни регион, ни город
  // на них не распространяются — только курьер и период.
  const adjustments = useBackend(
    () =>
      detail.kind === "courier"
        ? listCourierAdjustments({ ...query, from, to })
        : Promise.resolve([]),
    [JSON.stringify(query), from, to],
  );

  const reload = () => {
    payouts.reload();
    adjustments.reload();
    onChanged();
  };

  return (
    <>
      <SheetHeader className="border-b border-border">
        <SheetTitle>
          {detail.kind === "courier" ? detail.row.courierName : PAYOUT_STATUS_LABEL[detail.status]}
        </SheetTitle>
        <SheetDescription>
          {detail.kind === "courier"
            ? `Заборов ${detail.row.pickups}, доставок ${detail.row.deliveries} · начислено ${formatMoneyShort(detail.row.amount)} · к выплате ${formatMoneyShort(detail.row.payable)}`
            : `${formatNumber(detail.count)} — работа учтена, но сумма не начислена`}
        </SheetDescription>
      </SheetHeader>

      {detail.kind === "courier" && (
        <AdjustmentsBlock
          courier={detail.row}
          rows={adjustments.data ?? []}
          onChanged={reload}
        />
      )}

      {payouts.error ? (
        <div className="p-4">
          <ErrorState message={payouts.error} onRetry={payouts.reload} />
        </div>
      ) : payouts.loading && !payouts.data ? (
        <Skeleton className="m-4 h-64" />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {(payouts.data ?? []).map((payout) => (
            <PayoutLine
              key={payout.id}
              payout={payout}
              showCourier={detail.kind === "status"}
              onChanged={reload}
            />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Надбавки и удержания курьеру за период.
 *
 * Премия за месяц, выход в выходной, удержание за потерянную накладную — такое
 * не ложится ни на один заказ, поэтому идёт отдельным списком и отдельной
 * строкой в сводке.
 */
function AdjustmentsBlock({
  courier,
  rows,
  onChanged,
}: {
  courier: CourierPayoutSummaryRow;
  rows: CourierAdjustment[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await removeCourierAdjustment(id);
      toast.success("Корректировка убрана — запись в журнале правок осталась");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось убрать корректировку");
    } finally {
      setRemoving(null);
    }
  };

  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="border-b border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <span className="text-sm font-medium">
          Надбавки и удержания
          {rows.length > 0 && (
            <Money
              value={total}
              className={`ml-2 text-sm font-normal ${total < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}
            />
          )}
        </span>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Добавить
        </Button>
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <div>{row.reason}</div>
                <div className="text-xs text-muted-foreground">
                  {row.createdBy} · {formatDateTime(row.appliedAt)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Money
                  value={Number(row.amount)}
                  className={
                    Number(row.amount) < 0
                      ? "text-destructive"
                      : "text-emerald-700 dark:text-emerald-400"
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(row.id)}
                  disabled={removing === row.id}
                  title="Убрать корректировку"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AdjustmentDialog
        open={adding}
        onOpenChange={setAdding}
        courier={courier}
        onSaved={() => {
          setAdding(false);
          onChanged();
        }}
      />
    </div>
  );
}

/** Форма надбавки или удержания: знак суммы решает, что это. */
function AdjustmentDialog({
  open,
  onOpenChange,
  courier,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courier: CourierPayoutSummaryRow;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"bonus" | "deduction">("bonus");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!amount || reason.trim().length < 3) return;
    setSaving(true);
    try {
      await addCourierAdjustment({
        courierId: courier.courierId ?? undefined,
        shipoxDriverId: courier.shipoxDriverId ?? undefined,
        courierName: courier.courierName,
        amount: kind === "bonus" ? Math.abs(amount) : -Math.abs(amount),
        reason: reason.trim(),
      });
      toast.success(kind === "bonus" ? "Надбавка добавлена" : "Удержание добавлено");
      setAmount(undefined);
      setReason("");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Надбавка или удержание</DialogTitle>
          <DialogDescription>
            {courier.courierName}. К заказам не привязывается — попадёт в период по сегодняшней
            дате и ляжет отдельной строкой в сводке.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <SelectField
            value={kind}
            onChange={(value) => setKind(value as "bonus" | "deduction")}
            options={[
              { value: "bonus", label: "Надбавка — курьеру доплатят" },
              { value: "deduction", label: "Удержание — вычтут из выплаты" },
            ]}
          />
          <NumberField label="Сумма" value={amount} onChange={setAmount} min={0} suffix="сум" />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Причина</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="выход в выходной"
            />
            <p className="text-xs text-muted-foreground">
              Её прочитает бухгалтер следующего месяца — напишите по-человечески.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" render={<DialogClose />}>
            Отмена
          </Button>
          <Button onClick={save} disabled={saving || !amount || reason.trim().length < 3}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayoutLine({
  payout,
  showCourier,
  onChanged,
}: {
  payout: CourierPayout;
  showCourier: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const byTariff = payout.calculatedAmount === null ? null : Number(payout.calculatedAmount);

  const reset = async () => {
    setResetting(true);
    try {
      await resetCourierPayout(payout.id);
      toast.success("Вернули сумму по тарифу");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось вернуть расчёт");
    } finally {
      setResetting(false);
    }
  };

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Badge variant="secondary">{LEG_LABEL[payout.leg]}</Badge>
          {payout.order && (
            <Link href={`/orders/${payout.order.orderNumber}`} className="font-medium tabular-nums hover:underline">
              {payout.order.orderNumber}
            </Link>
          )}
          {showCourier && <span>{payout.courierName}</span>}
        </div>
        <div className="text-xs text-muted-foreground">
          {[
            payoutCityLabel(payout),
            // Вес здесь оплачиваемый — по нему и выбрана ставка.
            `${formatWeight(payout.weightKg)} опл.`,
            PAYOUT_SOURCE_LABEL[payout.source],
            formatDateTime(payout.earnedAt),
          ].join(" · ")}
        </div>
        {payout.order?.customerName && (
          <div className="text-xs text-muted-foreground">{payout.order.customerName}</div>
        )}
        {/* Правку без причины и автора через месяц не разобрать — показываем обоих. */}
        {payout.manual && (
          <div className="text-xs text-amber-700 dark:text-amber-400">
            Поправил {payout.manualBy ?? "—"}
            {payout.manualAt ? ` · ${formatDateTime(payout.manualAt)}` : ""}
            {byTariff !== null ? ` · по тарифу ${formatMoneyShort(byTariff)}` : ""}
            {payout.manualReason ? ` · «${payout.manualReason}»` : ""}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-2">
        <div className="text-right">
          {payout.status === "CALCULATED" && payout.amount !== null ? (
            <>
              <Money value={Number(payout.amount)} className="font-medium" />
              <div className="text-xs text-muted-foreground">
                {payout.manual ? "поправлено вручную" : payout.rateKind ? RATE_KIND_LABEL[payout.rateKind] : ""}
              </div>
            </>
          ) : (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {PAYOUT_STATUS_LABEL[payout.status]}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} title="Поправить сумму">
            <Pencil className="size-4" />
          </Button>
          {payout.manual && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={resetting}
              title="Вернуть сумму по тарифу"
            >
              <RotateCcw className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <EditPayoutDialog
        open={editing}
        onOpenChange={setEditing}
        payout={payout}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    </li>
  );
}

/**
 * Правка суммы начисления.
 *
 * Тариф знает город и вес, но не знает договорённостей: заказ увезли за город,
 * города нет в справочнике, курьеру пообещали больше. Причина обязательна, имя
 * правившего берёт бэкенд из учётной записи — подписаться чужим именем нельзя.
 */
function EditPayoutDialog({
  open,
  onOpenChange,
  payout,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payout: CourierPayout;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState<number | undefined>(
    payout.amount === null ? undefined : Number(payout.amount),
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (amount === undefined || reason.trim().length < 3) return;
    setSaving(true);
    try {
      await editCourierPayout(payout.id, { amount, reason: reason.trim() });
      toast.success("Сумма поправлена — пересчёт её больше не тронет");
      setReason("");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Сумма за {LEG_LABEL[payout.leg].toLowerCase()}</DialogTitle>
          <DialogDescription>
            {payout.order?.orderNumber ?? "заказ"} · {payoutCityLabel(payout)} ·{" "}
            {formatWeight(payout.weightKg)}
            {payout.status !== "CALCULATED" && ` · ${PAYOUT_STATUS_LABEL[payout.status]}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <NumberField label="Сумма к выплате" value={amount} onChange={setAmount} min={0} suffix="сум" />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Причина</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="возили за город, договорились отдельно"
            />
            <p className="text-xs text-muted-foreground">
              Останется в журнале правок вместе с вашим именем.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" render={<DialogClose />}>
            Отмена
          </Button>
          <Button onClick={save} disabled={saving || amount === undefined || reason.trim().length < 3}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Подписи видов правок — одни и те же в журнале и в подсказках. */
const CHANGE_LABEL: Record<CourierPayoutChange["kind"], string> = {
  PAYOUT_EDITED: "сумма поправлена",
  PAYOUT_RESET: "возврат к тарифу",
  ADJUSTMENT_ADDED: "надбавка или удержание",
  ADJUSTMENT_REMOVED: "корректировка убрана",
};

/**
 * Журнал правок по деньгам курьеров.
 *
 * Суммы правят руками, корректировки удаляют — по самим записям историю потом
 * не восстановить. Журнал только дописывается: кто, когда, что и почему.
 */
function ChangeLog({ from, to }: { from: string; to: string }) {
  const changes = useBackend(() => listCourierPayoutChanges({ from, to, limit: 500 }), [from, to]);
  const rows = changes.data ?? [];

  return (
    <>
      <SheetHeader className="border-b border-border">
        <SheetTitle>Журнал правок</SheetTitle>
        <SheetDescription>
          Ручные изменения сумм, надбавки и удержания за период — с именем того, кто их внёс.
        </SheetDescription>
      </SheetHeader>

      {changes.error ? (
        <div className="p-4">
          <ErrorState message={changes.error} onRetry={changes.reload} />
        </div>
      ) : changes.loading && !changes.data ? (
        <Skeleton className="m-4 h-64" />
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          За период руками ничего не меняли.
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="space-y-0.5 px-4 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">{row.courierName}</span>
                <span className="text-xs text-muted-foreground">
                  {row.changedBy} · {formatDateTime(row.changedAt)}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{CHANGE_LABEL[row.kind]}</Badge>
                {row.orderNumber && (
                  <Link href={`/orders/${row.orderNumber}`} className="tabular-nums hover:underline">
                    {row.orderNumber}
                  </Link>
                )}
                <span className="tabular-nums">
                  {row.amountBefore !== null ? formatMoneyShort(Number(row.amountBefore)) : "—"}
                  {" → "}
                  {row.amountAfter !== null ? formatMoneyShort(Number(row.amountAfter)) : "—"}
                </span>
              </div>
              <div className="text-xs">«{row.reason}»</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
