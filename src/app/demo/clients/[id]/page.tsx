"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { PageHeader } from "@/components/ui-kit/page-header";
import { DATA_ANCHOR } from "@/data/generate";
import { useClients, useOrders, usePayments } from "@/hooks/use-data";
import { clientLedger } from "@/lib/finance/ar";
import { downloadCsv } from "@/lib/csv";
import { formatAmount, formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import type { LedgerEntry } from "@/lib/finance/ar";
import { cn } from "@/lib/utils";

export default function ClientDetailPage({ params }: PageProps<"/demo/clients/[id]">) {
  const { id } = use(params);
  const { clients } = useClients();
  const { orders } = useOrders({});
  const { payments } = usePayments(id);

  const client = clients.find((c) => c.id === id);
  const ledger = useMemo(
    () => clientLedger(id, orders, payments, client, DATA_ANCHOR),
    [id, orders, payments, client],
  );

  const exportCsv = () => {
    downloadCsv(`Акт сверки — ${client?.name ?? id}`, ledger.entries, [
      { header: "Дата", value: (e) => formatDate(e.date) },
      { header: "Операция", value: (e) => e.title },
      { header: "Начислено", value: (e) => (e.debit || "") },
      { header: "Оплачено", value: (e) => (e.credit || "") },
      { header: "Сальдо", value: (e) => e.balance },
    ]);
  };

  if (!client) {
    return (
      <div className="space-y-4">
        <PageHeader title="Клиент не найден" />
        <Button variant="outline" render={<Link href="/demo/clients" />}>
          К списку клиентов
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" render={<Link href="/demo/clients" />}>
          <ArrowLeft className="size-4" />
          Клиенты
        </Button>
        <PageHeader
          title={client.name}
          description={`ИНН ${client.inn} · договор ${client.contractNo} · отсрочка ${client.paymentTermDays} дней`}
          actions={
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              Акт сверки в CSV
            </Button>
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Начислено" value={formatMoneyShort(ledger.charged)} hint={`${ledger.ordersCount} заказов`} />
        <KpiCard label="Оплачено" value={formatMoneyShort(ledger.paid)} tone="positive" />
        <KpiCard label="Сальдо" value={formatMoneyShort(ledger.balance)} />
        <KpiCard
          label="Просрочено"
          value={formatMoneyShort(ledger.overdue)}
          tone={ledger.overdue > 0 ? "negative" : "default"}
          hint={
            ledger.oldestUnpaidDate
              ? `самая старая накладная от ${formatDate(ledger.oldestUnpaidDate)}`
              : "просроченных накладных нет"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Разложение долга по срокам</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <AgingTile label="Срок не наступил" value={ledger.aging.current} />
            <AgingTile label="Просрочка 1–30 дней" value={ledger.aging.d0_30} tone="warn" />
            <AgingTile label="Просрочка 31–60 дней" value={ledger.aging.d31_60} tone="warn" />
            <AgingTile label="Просрочка более 60 дней" value={ledger.aging.d60plus} tone="bad" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Акт сверки</CardTitle>
          <p className="text-sm text-muted-foreground">
            Начисления и оплаты в хронологическом порядке с нарастающим сальдо. Оплаты гасят самые
            старые накладные первыми.
          </p>
        </CardHeader>
        <CardContent>
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Дата</th>
                  <th className="px-3 py-2 font-medium">Операция</th>
                  <th className="px-3 py-2 text-right font-medium">Начислено</th>
                  <th className="px-3 py-2 text-right font-medium">Оплачено</th>
                  <th className="px-3 py-2 text-right font-medium">Сальдо</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      Операций нет
                    </td>
                  </tr>
                ) : (
                  ledger.entries.map((entry) => <LedgerRow key={entry.id} entry={entry} />)
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
        {formatDate(entry.date)}
      </td>
      <td className="px-3 py-1.5">
        {entry.orderId ? (
          <Link href={`/demo/orders/${entry.orderId}`} className="hover:underline">
            {entry.title}
          </Link>
        ) : (
          entry.title
        )}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {entry.debit ? formatAmount(entry.debit) : ""}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
        {entry.credit ? formatAmount(entry.credit) : ""}
      </td>
      <td className="px-3 py-1.5 text-right font-medium tabular-nums">
        {formatAmount(entry.balance)}
      </td>
    </tr>
  );
}

function AgingTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "bad";
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          value === 0 && "text-muted-foreground/50",
          value > 0 && tone === "warn" && "text-amber-600 dark:text-amber-400",
          value > 0 && tone === "bad" && "text-destructive",
        )}
      >
        {formatMoney(value)}
      </div>
    </div>
  );
}
