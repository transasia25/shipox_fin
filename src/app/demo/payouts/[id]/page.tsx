"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Download, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { CourierGroupBadge, CourierKindBadge, LegTypeBadge, RegisterStatusBadge } from "@/components/ui-kit/status-badge";
import { zoneName } from "@/data/zones";
import { useLookups, useOrders } from "@/hooks/use-data";
import { downloadCsv } from "@/lib/csv";
import { formatAmount, formatDate, formatDateRange, formatMoney, plural } from "@/lib/format";
import { COURIER_GROUP_LABEL, COURIER_KIND_LABEL } from "@/lib/labels";
import { useFinanceStore } from "@/lib/store";
import type { Leg, Order, PayoutRegisterLine } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function PayoutRegisterPage({ params }: PageProps<"/demo/payouts/[id]">) {
  const { id } = use(params);
  const router = useRouter();

  const register = useFinanceStore((s) => s.registers.find((r) => r.id === id));
  const saveRegister = useFinanceStore((s) => s.saveRegister);
  const setRegisterStatus = useFinanceStore((s) => s.setRegisterStatus);
  const removeRegister = useFinanceStore((s) => s.removeRegister);

  const { orders } = useOrders({});
  const { couriersById } = useLookups();

  /** Плечи по id — реестр хранит только ссылки, детали подтягиваем из заказов. */
  const legsById = useMemo(() => {
    const map = new Map<string, { order: Order; leg: Leg }>();
    for (const order of orders) {
      for (const leg of order.legs) map.set(leg.id, { order, leg });
    }
    return map;
  }, [orders]);

  const [openCourier, setOpenCourier] = useState<string | null>(null);

  if (!register) {
    return (
      <div className="space-y-4">
        <PageHeader title="Реестр не найден" />
        <Button variant="outline" render={<Link href="/demo/payouts" />}>
          К списку реестров
        </Button>
      </div>
    );
  }

  const editable = register.status === "draft";
  const lineTotal = (line: PayoutRegisterLine) =>
    line.legsAmount + line.adjustments.reduce((sum, a) => sum + a.amount, 0);
  const total = register.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const legsCount = register.lines.reduce((sum, line) => sum + line.legIds.length, 0);

  const updateLine = (courierId: string, next: PayoutRegisterLine) => {
    saveRegister({
      ...register,
      lines: register.lines.map((l) => (l.courierId === courierId ? next : l)),
    });
  };

  const exportCsv = () => {
    downloadCsv(
      `Реестр ${formatDate(register.periodFrom)}—${formatDate(register.periodTo)}`,
      register.lines,
      [
        { header: "Исполнитель", value: (l) => couriersById.get(l.courierId)?.fullName ?? l.courierId },
        { header: "Телефон", value: (l) => couriersById.get(l.courierId)?.phone ?? "" },
        {
          header: "Тип",
          value: (l) => {
            const c = couriersById.get(l.courierId);
            return c ? COURIER_KIND_LABEL[c.kind] : "";
          },
        },
        {
          header: "Группа",
          value: (l) => {
            const c = couriersById.get(l.courierId);
            return c ? COURIER_GROUP_LABEL[c.group] : "";
          },
        },
        { header: "Плеч", value: (l) => l.legIds.length },
        { header: "Начислено по плечам", value: (l) => l.legsAmount },
        {
          header: "Корректировки",
          value: (l) => l.adjustments.reduce((s, a) => s + a.amount, 0),
        },
        { header: "К выплате", value: (l) => lineTotal(l) },
      ],
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" render={<Link href="/demo/payouts" />}>
          <ArrowLeft className="size-4" />
          Начисления
        </Button>
        <PageHeader
          title={register.title}
          description={`${formatDateRange(register.periodFrom, register.periodTo)} · ${
            register.courierKind === "all" ? "все исполнители" : COURIER_KIND_LABEL[register.courierKind]
          }`}
          actions={
            <>
              <Button variant="outline" onClick={exportCsv}>
                <Download className="size-4" />
                Выгрузить CSV
              </Button>
              {register.status === "draft" && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      removeRegister(register.id);
                      toast.info("Реестр удалён");
                      router.push("/demo/payouts");
                    }}
                  >
                    <Trash2 className="size-4" />
                    Удалить
                  </Button>
                  <Button
                    onClick={() => {
                      setRegisterStatus(register.id, "approved");
                      toast.success("Реестр утверждён");
                    }}
                  >
                    <Check className="size-4" />
                    Утвердить
                  </Button>
                </>
              )}
              {register.status === "approved" && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => setRegisterStatus(register.id, "draft")}
                  >
                    Вернуть в черновик
                  </Button>
                  <Button
                    onClick={() => {
                      setRegisterStatus(register.id, "paid");
                      toast.success("Реестр отмечен как выплаченный");
                    }}
                  >
                    <Wallet className="size-4" />
                    Отметить выплаченным
                  </Button>
                </>
              )}
            </>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <RegisterStatusBadge status={register.status} />
        <span>
          Исполнителей: <strong className="tabular-nums">{register.lines.length}</strong>
        </span>
        <span>
          Плеч: <strong className="tabular-nums">{legsCount}</strong>
        </span>
        <span className="ml-auto text-base">
          К выплате: <strong className="tabular-nums">{formatMoney(total)}</strong>
        </span>
      </div>

      <div className="space-y-2">
        {register.lines.map((line) => {
          const courier = couriersById.get(line.courierId);
          const open = openCourier === line.courierId;
          const adjustmentsTotal = line.adjustments.reduce((s, a) => s + a.amount, 0);

          return (
            <Card key={line.courierId} className="gap-0 overflow-hidden py-0">
              <button
                type="button"
                onClick={() => setOpenCourier(open ? null : line.courierId)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <ChevronDown
                  className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{courier?.fullName ?? line.courierId}</span>
                    {courier && <CourierKindBadge kind={courier.kind} />}
                    {courier && <CourierGroupBadge group={courier.group} />}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {courier?.phone} · {line.legIds.length}{" "}
                    {plural(line.legIds.length, "плечо", "плеча", "плеч")}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium tabular-nums">{formatMoney(lineTotal(line))}</div>
                  {adjustmentsTotal !== 0 && (
                    <div
                      className={cn(
                        "text-xs tabular-nums",
                        adjustmentsTotal < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {formatAmount(line.legsAmount)} {adjustmentsTotal > 0 ? "+" : "−"}{" "}
                      {formatAmount(Math.abs(adjustmentsTotal))}
                    </div>
                  )}
                </div>
              </button>

              {open && (
                <CardContent className="space-y-4 border-t border-border py-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="pb-1.5 font-medium">Заказ</th>
                          <th className="pb-1.5 font-medium">Плечо</th>
                          <th className="pb-1.5 font-medium">Маршрут</th>
                          <th className="pb-1.5 font-medium">Завершено</th>
                          <th className="pb-1.5 text-right font-medium">Начислено</th>
                        </tr>
                      </thead>
                      <tbody>
                        {line.legIds.map((legId) => {
                          const found = legsById.get(legId);
                          if (!found) return null;
                          const { order, leg } = found;
                          return (
                            <tr key={legId} className="border-t border-border/60">
                              <td className="py-1.5">
                                <Link href={`/demo/orders/${order.id}`} className="hover:underline">
                                  {order.orderNumber}
                                </Link>
                              </td>
                              <td className="py-1.5">
                                <LegTypeBadge type={leg.type} />
                              </td>
                              <td className="py-1.5 text-muted-foreground">
                                {zoneName(leg.fromZoneId)} → {zoneName(leg.toZoneId)}
                              </td>
                              <td className="py-1.5 text-muted-foreground">
                                {leg.completedAt ? formatDate(leg.completedAt) : "—"}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {leg.payout ? formatAmount(leg.payout.amount) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t border-border font-medium">
                          <td colSpan={4} className="py-1.5">
                            Итого по плечам
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatAmount(line.legsAmount)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <AdjustmentsBlock
                    line={line}
                    editable={editable}
                    onChange={(next) => updateLine(line.courierId, next)}
                  />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Штрафы и бонусы поверх начислений по плечам. */
function AdjustmentsBlock({
  line,
  editable,
  onChange,
}: {
  line: PayoutRegisterLine;
  editable: boolean;
  onChange: (line: PayoutRegisterLine) => void;
}) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");

  const add = () => {
    const parsed = Number(amount);
    if (!reason.trim() || Number.isNaN(parsed) || parsed === 0) {
      toast.error("Укажите причину и ненулевую сумму");
      return;
    }
    onChange({
      ...line,
      adjustments: [
        ...line.adjustments,
        { id: `adj-${Math.random().toString(36).slice(2, 8)}`, reason: reason.trim(), amount: parsed },
      ],
    });
    setReason("");
    setAmount("");
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">Корректировки</div>

      {line.adjustments.length === 0 && !editable && (
        <div className="text-sm text-muted-foreground">Нет</div>
      )}

      {line.adjustments.map((adj) => (
        <div key={adj.id} className="flex items-center gap-3 text-sm">
          <span className="flex-1">{adj.reason}</span>
          <Money
            value={adj.amount}
            className={adj.amount < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}
          />
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({ ...line, adjustments: line.adjustments.filter((a) => a.id !== adj.id) })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      ))}

      {editable && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина: бонус за переработку / штраф за опоздание"
            className="h-8 w-80"
          />
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            placeholder="Сумма, минус — штраф"
            className="h-8 w-56"
          />
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="size-3.5" />
            Добавить
          </Button>
        </div>
      )}

      {!editable && (
        <p className="text-xs text-muted-foreground">
          Реестр утверждён — корректировки заблокированы. Верните его в черновик, чтобы изменить.
        </p>
      )}
    </div>
  );
}
