"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { useBackend } from "@/hooks/use-backend";
import { getTariffVersion, getTariffZones, listClientTariffs } from "@/lib/backend/client";
import type {
  ClientTariffRow,
  TariffMatchSource,
  TariffPlanRef,
  TariffPriceCell,
  TariffRouteRule,
  TariffSurcharge,
  TariffVersionDetail,
  TariffZoneGrid,
} from "@/lib/backend/types";
import { formatDate, formatNumber, formatPrice, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const MATCH_LABEL: Record<TariffMatchSource, string> = {
  INN: "по ИНН",
  NAME: "по названию",
  MANUAL: "вручную",
  DEFAULT: "не найден",
};

/** Дата из Supabase приходит как `YYYY-MM-DD`; полдень — чтобы пояс не сдвинул день. */
function formatDay(value: string | null): string {
  return value ? formatDate(`${value}T12:00:00`) : "—";
}

function validity(plan: Pick<TariffPlanRef, "validFrom" | "validTo">): string {
  if (!plan.validFrom) return "без даты начала";
  return plan.validTo
    ? `с ${formatDay(plan.validFrom)} по ${formatDay(plan.validTo)}`
    : `с ${formatDay(plan.validFrom)}`;
}

function weightLabel(from: number, to: number | null): string {
  if (to === null) return from <= 1 ? "любой вес" : `от ${formatNumber(from)} кг`;
  if (from === to) return `${formatNumber(from)} кг`;
  return `${formatNumber(from)}–${formatNumber(to)} кг`;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9а-яё]+/g, "");
}

export default function ClientTariffsPage() {
  const [refreshToken, setRefreshToken] = useState(0);
  const tariffs = useBackend(
    () => listClientTariffs({ refresh: refreshToken > 0 }),
    [refreshToken],
  );
  const [selected, setSelected] = useState<ClientTariffRow | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);

  const data = tariffs.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Тарифы клиентов"
        description="По какому тарифному плану калькулятора считается каждый клиент и что в этом плане. Тарифы ведутся в калькуляторе (Supabase), здесь только просмотр."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setRefreshToken((value) => value + 1)}
              disabled={tariffs.loading}
            >
              <RefreshCw className={tariffs.loading ? "size-4 animate-spin" : "size-4"} />
              Обновить из калькулятора
            </Button>
            <Button variant="outline" render={<Link href="/clients" />}>
              Клиенты и расчёты
            </Button>
          </>
        }
      />

      {tariffs.error ? (
        <ErrorState message={tariffs.error} onRetry={tariffs.reload} />
      ) : !data ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="gap-1.5 p-4">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                План по умолчанию
              </div>
              <div className="text-base font-semibold">
                {data.defaultPlan.plan?.planName ?? "не найден"}
              </div>
              <div className="text-xs text-muted-foreground">
                Для клиентов, которых нет в калькуляторе. Суммы по нему предварительные.
              </div>
            </Card>
            <Card className="gap-1.5 p-4">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Отдельная машина (тип 05)
              </div>
              <div className="text-base font-semibold tabular-nums">
                {formatPrice(data.separate.base)} за первый кг + {formatPrice(data.separate.perKg)} за
                каждый следующий
              </div>
              <div className="text-xs text-muted-foreground">
                Одно правило для всех клиентов, считается у нас, а не в калькуляторе. До{" "}
                {formatNumber(data.separate.maxKg)} кг.
              </div>
            </Card>
          </div>

          <ClientsTable
            rows={data.clients}
            date={data.date}
            selectedId={selected?.shipoxCustomerId ?? null}
            onSelect={setSelected}
          />

          <div ref={detailRef} className="scroll-mt-4">
            {selected?.plan ? (
              <VersionDetail key={selected.plan.versionId} client={selected} plan={selected.plan} />
            ) : selected ? (
              <Card className="p-4 text-sm text-muted-foreground">
                На {formatDay(data.date)} у клиента «{selected.shipoxCustomerName}» нет действующей версии
                плана: калькулятор не посчитает его заказы.
              </Card>
            ) : (
              <Card className="p-4 text-sm text-muted-foreground">
                Выберите клиента в таблице, чтобы увидеть цены его плана.
              </Card>
            )}
          </div>
        </>
      )}

      <ZoneMatrix />
    </div>
  );
}

function ClientsTable({
  rows,
  date,
  selectedId,
  onSelect,
}: {
  rows: ClientTariffRow[];
  date: string;
  selectedId: string | null;
  onSelect: (row: ClientTariffRow) => void;
}) {
  const [search, setSearch] = useState("");
  const needle = normalize(search);
  const shown = needle
    ? rows.filter((row) =>
        normalize(
          `${row.shipoxCustomerName} ${row.calculatorClient?.name ?? ""} ${row.plan?.planName ?? ""}`,
        ).includes(needle),
      )
    : rows;

  const columns = useMemo<ColumnDef<ClientTariffRow, unknown>[]>(
    () => [
      {
        id: "client",
        header: "Клиент",
        accessorFn: (row) => row.shipoxCustomerName,
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <div
              className={cn(
                "font-medium",
                row.original.shipoxCustomerId === selectedId && "text-primary",
              )}
            >
              {row.original.shipoxCustomerName}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.original.calculatorClient
                ? `в калькуляторе: ${row.original.calculatorClient.name}`
                : "в калькуляторе не найден"}
            </div>
          </div>
        ),
      },
      {
        id: "orders",
        header: "Заказов",
        accessorFn: (row) => row.orders,
        meta: { align: "center" },
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.orders)}</span>,
      },
      {
        id: "match",
        header: "Сопоставлен",
        accessorFn: (row) => row.matchedBy ?? "",
        cell: ({ row }) => {
          const { matchedBy, confirmed } = row.original;
          if (!matchedBy) return <span className="text-xs text-muted-foreground">ещё нет</span>;
          return (
            <Badge variant={matchedBy === "DEFAULT" ? "destructive" : "outline"}>
              {MATCH_LABEL[matchedBy]}
              {confirmed && matchedBy !== "MANUAL" ? " · подтв." : ""}
            </Badge>
          );
        },
      },
      {
        id: "plan",
        header: "Тарифный план",
        accessorFn: (row) => row.plan?.planName ?? "",
        cell: ({ row }) => {
          const { plan, provisional } = row.original;
          if (!plan) return <span className="text-destructive">нет плана на дату</span>;
          return (
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span>{plan.planName}</span>
                {provisional && <Badge variant="outline">по умолчанию · предв.</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {plan.versionName ? `«${plan.versionName}», ` : ""}
                {validity(plan)}
              </div>
            </div>
          );
        },
      },
    ],
    [selectedId],
  );

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-base font-medium">Клиенты Shipox</div>
          <p className="text-sm text-muted-foreground">
            План на {formatDay(date)} определяет сам калькулятор: та же функция, что при расчёте.
            Нажмите на строку, чтобы открыть цены.
          </p>
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Клиент или план"
          className="h-8 w-56"
        />
      </div>
      <DataTable
        data={shown}
        columns={columns}
        initialSorting={[{ id: "orders", desc: true }]}
        onRowClick={onSelect}
        pageSize={20}
        emptyMessage="Клиент не найден"
      />
    </Card>
  );
}

function VersionDetail({ client, plan }: { client: ClientTariffRow; plan: TariffPlanRef }) {
  const version = useBackend(() => getTariffVersion(plan.versionId), [plan.versionId]);
  const detail = version.data;

  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {client.shipoxCustomerName}
        </div>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {plan.planName}
          {plan.isDefault && <Badge variant="secondary">план по умолчанию</Badge>}
          {client.provisional && <Badge variant="outline">предварительно</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Версия {plan.versionName ? `«${plan.versionName}» ` : ""}
          действует {validity(plan)}
          {detail && (
            <>
              {" · "}
              {formatNumber(detail.priceRuleCount)}{" "}
              {plural(detail.priceRuleCount, "правило цены", "правила цены", "правил цены")},{" "}
              {formatNumber(detail.surcharges.length)}{" "}
              {plural(detail.surcharges.length, "надбавка", "надбавки", "надбавок")}
            </>
          )}
        </p>
        {detail && detail.assignedClients.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Назначен в калькуляторе:{" "}
            {detail.assignedClients
              .slice(0, 8)
              .map((item) => item.name)
              .join(", ")}
            {detail.assignedClients.length > 8 && ` и ещё ${detail.assignedClients.length - 8}`}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {version.error ? (
          <ErrorState message={version.error} onRetry={version.reload} />
        ) : !detail ? (
          <Skeleton className="h-64" />
        ) : (
          <VersionBody detail={detail} />
        )}
      </CardContent>
    </Card>
  );
}

function VersionBody({ detail }: { detail: TariffVersionDetail }) {
  const serviceTypes = detail.serviceTypes;
  const serviceName = useCallback(
    (id: number | null) =>
      id === null ? "любая услуга" : (serviceTypes.find((type) => type.id === id)?.name ?? `услуга ${id}`),
    [serviceTypes],
  );
  const ambiguous = detail.zoneGrids.some((grid) =>
    grid.rows.some((row) => row.cells.some((cell) => cell?.ambiguous)),
  );
  const empty =
    detail.zoneGrids.length === 0 && detail.routeRules.length === 0 && detail.surcharges.length === 0;

  return (
    <>
      {(detail.unreachableRules > 0 || ambiguous) && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            {detail.unreachableRules > 0 && (
              <div>
                {formatNumber(detail.unreachableRules)}{" "}
                {plural(detail.unreachableRules, "правило", "правила", "правил")} калькулятор не
                выберет ни для одного заказа: маршрут задан не полностью.
              </div>
            )}
            {ambiguous && (
              <div>
                Ячейки со знаком «?» задаются двумя правилами с одинаковым приоритетом и разной ценой —
                калькулятор возьмёт любое из них.
              </div>
            )}
          </div>
        </div>
      )}

      {empty && (
        <p className="text-sm text-muted-foreground">
          В плане нет ни одного правила — калькулятор ответит «No tariff found» на любой заказ.
        </p>
      )}

      {detail.zoneGrids.length > 0 && (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Цены по зонам</h3>
            <p className="text-xs text-muted-foreground">
              Цена — для веса, с которого начинается строка; «+N/кг» — доплата за каждый следующий
              килограмм. Вес округляется вверх. Зона 0 — внутри одного хаба; какая зона между какими
              хабами — в матрице внизу страницы. Надбавки прибавляются сверху.
            </p>
          </div>
          {detail.zoneGrids.length === 1 ? (
            <ZoneGridTable grid={detail.zoneGrids[0]} />
          ) : (
            <Tabs defaultValue={String(detail.zoneGrids[0].serviceTypeId)}>
              <TabsList>
                {detail.zoneGrids.map((grid) => (
                  <TabsTrigger key={String(grid.serviceTypeId)} value={String(grid.serviceTypeId)}>
                    {serviceName(grid.serviceTypeId)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {detail.zoneGrids.map((grid) => (
                <TabsContent key={String(grid.serviceTypeId)} value={String(grid.serviceTypeId)}>
                  <ZoneGridTable grid={grid} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </section>
      )}

      {detail.routeRules.length > 0 && (
        <RouteRulesTable rules={detail.routeRules} serviceName={serviceName} />
      )}

      {detail.surcharges.length > 0 && (
        <SurchargesTable surcharges={detail.surcharges} serviceName={serviceName} />
      )}
    </>
  );
}

function PriceValue({ cell }: { cell: TariffPriceCell }) {
  return (
    <div className="space-y-0.5">
      <div className="font-medium whitespace-nowrap tabular-nums">
        {cell.price === null ? "—" : formatPrice(cell.price)}
        {cell.ambiguous && (
          <span className="ml-1 text-amber-600 dark:text-amber-400" title="Два правила с одним приоритетом">
            ?
          </span>
        )}
      </div>
      {cell.perUnit && <div className="text-xs text-muted-foreground">за место</div>}
      {cell.extraPerKg > 0 && (
        <div className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          +{formatPrice(cell.extraPerKg)}/кг
        </div>
      )}
    </div>
  );
}

function ZoneGridTable({ grid }: { grid: TariffZoneGrid }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Вес</th>
            {grid.zones.map((zone) => (
              <th key={zone} className="px-3 py-2 text-right font-medium">
                Зона {zone}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.weightFrom} className="border-t border-border align-top">
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                {weightLabel(row.weightFrom, row.weightTo)}
              </td>
              {row.cells.map((cell, index) => (
                <td key={grid.zones[index]} className="px-3 py-2 text-right">
                  {cell ? <PriceValue cell={cell} /> : <span className="text-muted-foreground/50">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RouteRulesTable({
  rules,
  serviceName,
}: {
  rules: TariffRouteRule[];
  serviceName: (id: number | null) => string;
}) {
  const [search, setSearch] = useState("");
  const needle = normalize(search);
  const shown = needle
    ? rules.filter((rule) => normalize(`${rule.from ?? ""} ${rule.to ?? ""}`).includes(needle))
    : rules;
  const mixedPriority = new Set(rules.map((rule) => rule.priority)).size > 1;

  const columns = useMemo<ColumnDef<TariffRouteRule, unknown>[]>(() => {
    const list: ColumnDef<TariffRouteRule, unknown>[] = [
      {
        id: "route",
        header: "Маршрут",
        accessorFn: (rule) => `${rule.from ?? ""} ${rule.to ?? ""}`,
        cell: ({ row }) => {
          const rule = row.original;
          return (
            <div className="space-y-0.5">
              <div>
                {rule.from ?? "любой хаб"} → {rule.to ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                {rule.kind === "CITY" ? "пара городов" : "до хаба"}
                {rule.isLocal === true && " · внутри хаба"}
                {rule.isLocal === false && " · между хабами"}
              </div>
            </div>
          );
        },
      },
      {
        id: "service",
        header: "Услуга",
        accessorFn: (rule) => rule.serviceTypeId ?? 0,
        cell: ({ row }) => serviceName(row.original.serviceTypeId),
      },
      {
        id: "weight",
        header: "Вес от, кг",
        accessorFn: (rule) => rule.weightFrom,
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.weightFrom)}</span>,
      },
      {
        id: "price",
        header: "Цена",
        accessorFn: (rule) => rule.pricePerUnit ?? rule.basePrice ?? 0,
        meta: { align: "right" },
        cell: ({ row }) => {
          const rule = row.original;
          if (rule.pricePerUnit !== null) {
            return <span className="tabular-nums">{formatPrice(rule.pricePerUnit)} за место</span>;
          }
          return <span className="tabular-nums">{rule.basePrice === null ? "—" : formatPrice(rule.basePrice)}</span>;
        },
      },
      {
        id: "extra",
        header: "За кг сверх",
        accessorFn: (rule) => rule.extraPerKg ?? 0,
        meta: { align: "right" },
        cell: ({ row }) =>
          row.original.pricePerUnit === null && row.original.extraPerKg ? (
            <span className="tabular-nums">+{formatPrice(row.original.extraPerKg)}</span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          ),
      },
    ];
    // Приоритет нужен, только когда он различается: иначе выбор решает порог веса.
    if (mixedPriority) {
      list.push({
        id: "priority",
        header: "Приоритет",
        accessorFn: (rule) => rule.priority ?? 0,
        meta: { align: "right" },
        cell: ({ row }) => <span className="tabular-nums">{row.original.priority ?? "—"}</span>,
      });
    }
    return list;
  }, [mixedPriority, serviceName]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Цены по маршрутам</h3>
          <p className="text-xs text-muted-foreground">
            Для конкретных городов и хабов. Из всех подходящих правил калькулятор берёт правило с
            большим приоритетом, затем с большим порогом веса.
          </p>
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Найти город или хаб"
          className="h-8 w-56"
        />
      </div>
      <DataTable data={shown} columns={columns} pageSize={25} emptyMessage="Маршрут не найден" />
    </section>
  );
}

function surchargeAmount(item: TariffSurcharge): string {
  const amount = formatPrice(item.amount);
  switch (item.amountType) {
    case "FIXED":
      return `+${amount}`;
    case "PER_KG":
      return `+${amount} × вес, кг`;
    case "PER_KG_OVER":
      return `+${amount} за кг сверх ${formatNumber(item.overKg ?? 0)}`;
    case "PER_BOX":
      return `+${amount} за место`;
    case "PERCENT":
      return `+${amount}% от цены`;
    default:
      return `${amount} (${item.amountType})`;
  }
}

function endpoint(isHub: boolean | null, fallback: string): string {
  if (isHub === true) return "хаб";
  if (isHub === false) return "район";
  return fallback;
}

function SurchargesTable({
  surcharges,
  serviceName,
}: {
  surcharges: TariffSurcharge[];
  serviceName: (id: number | null) => string;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">Надбавки</h3>
        <p className="text-xs text-muted-foreground">
          Прибавляются к цене по зоне или маршруту. Если подходит несколько надбавок, они
          складываются. «Хаб» — город-хаб, «район» — город при хабе.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Откуда → куда</th>
              <th className="px-3 py-2 text-left font-medium">Услуга</th>
              <th className="px-3 py-2 text-right font-medium">Вес, кг</th>
              <th className="px-3 py-2 text-right font-medium">Надбавка</th>
            </tr>
          </thead>
          <tbody>
            {surcharges.map((item) => (
              <tr key={item.id} className="border-t border-border" title={item.name ?? undefined}>
                <td className="px-3 py-2">
                  {endpoint(item.fromIsHub, "откуда угодно")} →{" "}
                  {item.toCity ?? endpoint(item.toIsHub, "куда угодно")}
                </td>
                <td className="px-3 py-2">{serviceName(item.serviceTypeId)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {item.weightTo === null
                    ? `от ${formatNumber(item.weightFrom)}`
                    : `${formatNumber(item.weightFrom)}–${formatNumber(item.weightTo)}`}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {surchargeAmount(item)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ZoneMatrix() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-base font-medium">Зоны между хабами</div>
          <p className="text-sm text-muted-foreground">
            Общая для всех планов: по хабу отправления и хабу назначения калькулятор определяет зону.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
          {open ? "Скрыть" : "Показать матрицу"}
        </Button>
      </div>
      {open && <ZoneMatrixTable />}
    </Card>
  );
}

function ZoneMatrixTable() {
  const zones = useBackend(() => getTariffZones(), []);
  if (zones.error) return <ErrorState message={zones.error} onRetry={zones.reload} />;
  if (!zones.data) return <Skeleton className="h-64" />;

  const { hubs, cells } = zones.data;
  const zoneOf = new Map(cells.map((cell) => [`${cell.fromHubId}|${cell.toHubId}`, cell.zone]));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="sticky left-0 bg-muted px-2 py-2 text-left font-medium">Откуда \ куда</th>
            {hubs.map((hub) => (
              <th key={hub.id} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                {hub.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hubs.map((from) => (
            <tr key={from.id} className="border-t border-border">
              <th className="sticky left-0 bg-card px-2 py-1.5 text-left font-medium whitespace-nowrap">
                {from.name}
              </th>
              {hubs.map((to) => {
                const zone = zoneOf.get(`${from.id}|${to.id}`);
                return (
                  <td
                    key={to.id}
                    className={cn(
                      "px-2 py-1.5 text-center tabular-nums",
                      zone === 0 && "bg-muted font-medium",
                      zone === undefined && "text-muted-foreground/50",
                    )}
                  >
                    {zone ?? "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
