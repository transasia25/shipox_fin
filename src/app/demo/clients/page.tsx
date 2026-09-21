"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui-kit/kpi-card";
import { Money } from "@/components/ui-kit/money";
import { PageHeader } from "@/components/ui-kit/page-header";
import { DATA_ANCHOR } from "@/data/generate";
import { useClients, useOrders, usePayments } from "@/hooks/use-data";
import { clientLedger, sumAging, type ClientLedger } from "@/lib/finance/ar";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatMoneyShort } from "@/lib/format";
import { useFinanceStore } from "@/lib/store";
import type { Client } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ClientRow {
  client: Client;
  ledger: ClientLedger;
  chargedInPeriod: number;
}

export default function ClientsPage() {
  const router = useRouter();
  const period = useFinanceStore((s) => s.period);
  const { clients } = useClients();
  const { payments } = usePayments();

  // Сальдо — величина накопительная, поэтому считается по всей истории.
  // Период влияет только на колонку «начислено за период».
  const { orders } = useOrders({});
  const { orders: periodOrders } = useOrders({ from: period.from, to: period.to });

  const rows = useMemo<ClientRow[]>(() => {
    const chargedInPeriod = new Map<string, number>();
    for (const order of periodOrders) {
      if (order.status !== "delivered") continue;
      chargedInPeriod.set(
        order.clientId,
        (chargedInPeriod.get(order.clientId) ?? 0) + order.clientCharge,
      );
    }
    return clients.map((client) => ({
      client,
      ledger: clientLedger(client.id, orders, payments, client, DATA_ANCHOR),
      chargedInPeriod: chargedInPeriod.get(client.id) ?? 0,
    }));
  }, [clients, orders, periodOrders, payments]);

  const totals = useMemo(() => {
    const aging = sumAging(rows.map((r) => r.ledger.aging));
    return {
      charged: rows.reduce((s, r) => s + r.ledger.charged, 0),
      paid: rows.reduce((s, r) => s + r.ledger.paid, 0),
      balance: rows.reduce((s, r) => s + r.ledger.balance, 0),
      overdue: rows.reduce((s, r) => s + r.ledger.overdue, 0),
      aging,
    };
  }, [rows]);

  const columns = useMemo<ColumnDef<ClientRow, unknown>[]>(
    () => [
      {
        id: "client",
        header: "Клиент",
        accessorFn: (r) => r.client.name,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div className="font-medium">{row.original.client.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.client.contractNo} · отсрочка {row.original.client.paymentTermDays} дн.
            </div>
          </div>
        ),
      },
      {
        id: "orders",
        header: "Заказов",
        accessorFn: (r) => r.ledger.ordersCount,
        meta: { align: "center" },
      },
      {
        id: "chargedInPeriod",
        header: "Начислено за период",
        accessorFn: (r) => r.chargedInPeriod,
        meta: { align: "right" },
        cell: ({ getValue }) => <Money value={getValue() as number} />,
      },
      {
        id: "charged",
        header: "Начислено всего",
        accessorFn: (r) => r.ledger.charged,
        meta: { align: "right" },
        cell: ({ getValue }) => (
          <Money value={getValue() as number} className="text-muted-foreground" />
        ),
      },
      {
        id: "paid",
        header: "Оплачено",
        accessorFn: (r) => r.ledger.paid,
        meta: { align: "right" },
        cell: ({ getValue }) => (
          <Money value={getValue() as number} className="text-muted-foreground" />
        ),
      },
      {
        id: "balance",
        header: "Сальдо",
        accessorFn: (r) => r.ledger.balance,
        meta: { align: "right" },
        cell: ({ getValue }) => (
          <Money value={getValue() as number} className="font-medium" />
        ),
      },
      {
        id: "current",
        header: "Срок не наступил",
        accessorFn: (r) => r.ledger.aging.current,
        meta: { align: "right" },
        cell: ({ getValue }) => <AgingCell value={getValue() as number} />,
      },
      {
        id: "d0_30",
        header: "1–30 дн.",
        accessorFn: (r) => r.ledger.aging.d0_30,
        meta: { align: "right" },
        cell: ({ getValue }) => <AgingCell value={getValue() as number} tone="warn" />,
      },
      {
        id: "d31_60",
        header: "31–60 дн.",
        accessorFn: (r) => r.ledger.aging.d31_60,
        meta: { align: "right" },
        cell: ({ getValue }) => <AgingCell value={getValue() as number} tone="warn" />,
      },
      {
        id: "d60plus",
        header: "Более 60 дн.",
        accessorFn: (r) => r.ledger.aging.d60plus,
        meta: { align: "right" },
        cell: ({ getValue }) => <AgingCell value={getValue() as number} tone="bad" />,
      },
    ],
    [],
  );

  const exportCsv = () => {
    downloadCsv("Дебиторка", rows, [
      { header: "Клиент", value: (r) => r.client.name },
      { header: "ИНН", value: (r) => r.client.inn },
      { header: "Договор", value: (r) => r.client.contractNo },
      { header: "Отсрочка, дней", value: (r) => r.client.paymentTermDays },
      { header: "Заказов", value: (r) => r.ledger.ordersCount },
      { header: "Начислено за период", value: (r) => r.chargedInPeriod },
      { header: "Начислено всего", value: (r) => r.ledger.charged },
      { header: "Оплачено", value: (r) => r.ledger.paid },
      { header: "Сальдо", value: (r) => r.ledger.balance },
      { header: "Срок не наступил", value: (r) => r.ledger.aging.current },
      { header: "Просрочка 1-30", value: (r) => r.ledger.aging.d0_30 },
      { header: "Просрочка 31-60", value: (r) => r.ledger.aging.d31_60 },
      { header: "Просрочка 60+", value: (r) => r.ledger.aging.d60plus },
      {
        header: "Самая старая непогашенная",
        value: (r) => (r.ledger.oldestUnpaidDate ? formatDate(r.ledger.oldestUnpaidDate) : ""),
      },
    ]);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Клиенты и дебиторка"
        description="Сколько клиент должен заплатить за доставку: начисления по доставленным заказам, поступившие оплаты и разложение долга по срокам просрочки."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" />
            Выгрузить CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Начислено всего" value={formatMoneyShort(totals.charged)} />
        <KpiCard label="Оплачено" value={formatMoneyShort(totals.paid)} tone="positive" />
        <KpiCard
          label="Дебиторская задолженность"
          value={formatMoneyShort(totals.balance)}
          hint={`из них срок не наступил: ${formatMoneyShort(totals.aging.current)}`}
        />
        <KpiCard
          label="Просрочено"
          value={formatMoneyShort(totals.overdue)}
          tone={totals.overdue > 0 ? "negative" : "default"}
          hint={`более 60 дней: ${formatMoneyShort(totals.aging.d60plus)}`}
        />
      </div>

      <DataTable
        data={rows}
        columns={columns}
        initialSorting={[{ id: "balance", desc: true }]}
        onRowClick={(row) => router.push(`/demo/clients/${row.client.id}`)}
        pageSize={50}
      />
    </div>
  );
}

function AgingCell({ value, tone }: { value: number; tone?: "warn" | "bad" }) {
  if (value === 0) return <span className="text-muted-foreground/50">—</span>;
  return (
    <Money
      value={value}
      className={cn(
        tone === "warn" && "text-amber-600 dark:text-amber-400",
        tone === "bad" && "font-medium text-destructive",
      )}
    />
  );
}
