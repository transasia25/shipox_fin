"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  TariffZoneMatrix,
} from "@/lib/backend/types";
import { formatDate, formatNumber, formatPrice, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  amountLabels,
  buildSurchargeGroups,
  surchargeWeightLabel,
  type SurchargeKind,
} from "./surcharge-lines";
import { destinationsByZone, referenceHub, zoneHints, zoneIssues, zoneLookup, type ZoneHint } from "./zones";

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

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9а-яё]+/g, "");
}

/**
 * Подсказка к термину. Всплывающая панель, а не тултип: открывается и при
 * наведении, и по клику или касанию — тултип по клику закрывается, а на
 * телефоне и вовсе не появляется.
 */
function Hint({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={100}
        className={cn(
          "cursor-help rounded-sm underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto max-w-xs gap-1 text-left text-xs leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export default function ClientTariffsPage() {
  const [refreshToken, setRefreshToken] = useState(0);
  const tariffs = useBackend(
    () => listClientTariffs({ refresh: refreshToken > 0 }),
    [refreshToken],
  );
  // Зоны общие для всех планов: нужны и подсказкам в таблице цен, и блоку зон внизу.
  const zones = useBackend(() => getTariffZones(), []);
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
              <VersionDetail
                key={selected.plan.versionId}
                client={selected}
                plan={selected.plan}
                zones={zones.data ?? null}
              />
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

      <ZoneMatrix zones={zones} />
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
              <div className="text-xs text-muted-foreground">действует {validity(plan)}</div>
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

function VersionDetail({
  client,
  plan,
  zones,
}: {
  client: ClientTariffRow;
  plan: TariffPlanRef;
  zones: TariffZoneMatrix | null;
}) {
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
          Действует {validity(plan)}
          {plan.versionName && (
            <>
              {" · "}
              <Hint label={<>версия «{plan.versionName}»</>}>
                <p>
                  Название версии плана в калькуляторе. Когда цены меняются, заводят новую версию с
                  новой датой начала, а старая остаётся для расчётов за прошлые периоды.
                </p>
                {plan.versionName === "2026-Initial" && (
                  <p className="text-muted-foreground">
                    «2026-Initial» — версии, перенесённые из старой схемы калькулятора в начале 2026
                    года.
                  </p>
                )}
              </Hint>
            </>
          )}
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
          <VersionBody detail={detail} zones={zones} />
        )}
      </CardContent>
    </Card>
  );
}

function VersionBody({
  detail,
  zones,
}: {
  detail: TariffVersionDetail;
  zones: TariffZoneMatrix | null;
}) {
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
              килограмм. Вес округляется вверх. Наведите на зону или нажмите на неё, чтобы увидеть, какие это
              направления; все зоны — в блоке «Зоны доставки» внизу страницы. Надбавки ниже
              прибавляются сверху.
            </p>
          </div>
          {detail.zoneGrids.length === 1 ? (
            <ZoneGridTable grid={detail.zoneGrids[0]} zones={zones} />
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
                  <ZoneGridTable grid={grid} zones={zones} />
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

function ZoneHeader({ zone, hint }: { zone: number; hint: ZoneHint | undefined }) {
  if (!hint) return <>Зона {zone}</>;
  return (
    <Hint label={`Зона ${zone}`}>
      <p className="font-medium">{hint.title}</p>
      {hint.lines.map((line) => (
        <p key={line} className="text-muted-foreground">
          {line}
        </p>
      ))}
    </Hint>
  );
}

function ZoneGridTable({ grid, zones }: { grid: TariffZoneGrid; zones: TariffZoneMatrix | null }) {
  const hints = useMemo(() => zoneHints(zones, grid.zones), [zones, grid.zones]);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Вес</th>
            {grid.zones.map((zone) => (
              <th key={zone} className="px-3 py-2 text-right font-medium">
                <ZoneHeader zone={zone} hint={hints.get(zone)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.weightFrom} className="border-t border-border align-top">
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                {surchargeWeightLabel(row.weightFrom, row.weightTo)}
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

const KIND_BADGE: Record<SurchargeKind, { label: string; hint: string } | null> = {
  surcharge: null,
  discount: {
    label: "скидка",
    hint: "Сумма с минусом: уменьшает цену. Так в калькуляторе отменяют доплату для отдельных городов или дают скидку.",
  },
  adjustment: {
    label: "поправка",
    hint: "Часть суммы с плюсом, часть с минусом: так в калькуляторе подгоняют стандартную цену под договорную.",
  },
};

function SurchargesTable({
  surcharges,
  serviceName,
}: {
  surcharges: TariffSurcharge[];
  serviceName: (id: number | null) => string;
}) {
  const groups = useMemo(() => buildSurchargeGroups(surcharges), [surcharges]);
  const lines = groups.flatMap((group) => group.lines);
  const showService = lines.some((line) => line.serviceTypeIds !== null);
  const columnCount = showService ? 4 : 3;

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">Доплаты и скидки</h3>
        <p className="text-xs text-muted-foreground">
          Прибавляются к цене из таблицы выше. Если к заказу подходит несколько строк, они
          складываются. «Хаб» — город-хаб, «район» — город при хабе. Вес округляется вверх, границы
          включительно: заказ 5,3 кг считается как 6 кг.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Вес</th>
              {showService && <th className="px-3 py-2 text-left font-medium">Услуга</th>}
              <th className="px-3 py-2 text-right font-medium">Сумма</th>
              <th className="px-3 py-2 text-left font-medium">Пояснение</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.key}>
              <tr className="border-t border-border bg-muted/30">
                <th
                  colSpan={columnCount}
                  scope="colgroup"
                  className="px-3 py-1.5 text-left text-xs font-semibold"
                >
                  {group.title}
                </th>
              </tr>
              {group.lines.map((line) => {
                const badge = KIND_BADGE[line.kind];
                return (
                  <tr key={line.key} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {surchargeWeightLabel(line.weightFrom, line.weightTo)}
                    </td>
                    {showService && (
                      <td className="px-3 py-2 text-muted-foreground">
                        {line.serviceTypeIds === null
                          ? "любая"
                          : line.serviceTypeIds.map((id) => serviceName(id)).join(", ")}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {amountLabels(line.amounts).map((label, index) => (
                        <div key={index} className={index === 0 ? "font-medium" : "text-muted-foreground"}>
                          {label}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {badge && (
                          <Hint
                            className="no-underline"
                            label={
                              <Badge variant={line.kind === "discount" ? "secondary" : "outline"}>
                                {badge.label}
                              </Badge>
                            }
                          >
                            <p>{badge.hint}</p>
                          </Hint>
                        )}
                        {line.names.length > 0 && (
                          <span className="text-xs text-muted-foreground">{line.names.join("; ")}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

/**
 * Шкала зон: один тон от светлого к тёмному — зона растёт вместе с расстоянием.
 * Насыщенность невысокая, чтобы цифры поверх читались в обеих темах; номер
 * зоны всегда подписан, цвет только помогает глазу.
 */
const ZONE_TINT = [
  "bg-transparent",
  "bg-primary/[0.06]",
  "bg-primary/[0.12]",
  "bg-primary/20",
  "bg-primary/[0.28]",
  "bg-primary/[0.36]",
];

function zoneTint(zone: number): string {
  return ZONE_TINT[Math.min(Math.max(zone, 0), ZONE_TINT.length - 1)];
}

function ZoneMatrix({
  zones,
}: {
  zones: { data: TariffZoneMatrix | null; error: string | null; reload: () => void };
}) {
  const [fromHubId, setFromHubId] = useState<number | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  const matrix = zones.data;
  const origin =
    matrix?.hubs.find((hub) => hub.id === fromHubId) ?? (matrix ? referenceHub(matrix) : null);

  return (
    <Card className="gap-4 p-4">
      <div className="space-y-1">
        <div className="text-base font-medium">Зоны доставки</div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Цена в плане зависит от зоны и веса. Зону калькулятор определяет по хабам отправителя и
          получателя: 0 — внутри одного хаба, чем больше номер, тем дальше. Город-район относится к
          своему хабу: заказ из Ташкента в Чирчик — это зона 0. Зоны одинаковые для всех планов.
        </p>
      </div>

      {zones.error ? (
        <ErrorState message={zones.error} onRetry={zones.reload} />
      ) : !matrix ? (
        <Skeleton className="h-40" />
      ) : !origin ? (
        <p className="text-sm text-muted-foreground">
          В калькуляторе не заведено ни одного хаба — зон нет, и цены по зонам не посчитаются.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Откуда
            </div>
            <div className="flex flex-wrap gap-1.5">
              {matrix.hubs.map((hub) => (
                <Button
                  key={hub.id}
                  size="sm"
                  variant={hub.id === origin.id ? "default" : "outline"}
                  aria-pressed={hub.id === origin.id}
                  onClick={() => setFromHubId(hub.id)}
                >
                  {hub.name}
                </Button>
              ))}
            </div>
          </div>

          <ZoneDestinations matrix={matrix} originId={origin.id} originName={origin.name} />

          <ZoneIssuesNote matrix={matrix} />

          <div className="space-y-3">
            <Button variant="outline" size="sm" onClick={() => setShowMatrix((value) => !value)}>
              {showMatrix ? "Скрыть таблицу всех хабов" : "Таблица всех хабов"}
            </Button>
            {showMatrix && (
              <ZoneMatrixTable matrix={matrix} originId={origin.id} onSelectOrigin={setFromHubId} />
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function ZoneIssuesNote({ matrix }: { matrix: TariffZoneMatrix }) {
  const issues = useMemo(() => zoneIssues(matrix), [matrix]);
  if (issues.asymmetric.length === 0 && issues.missing.length === 0 && issues.withoutZones.length === 0) {
    return null;
  }
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <div className="font-medium">Похоже на ошибки в матрице зон калькулятора</div>
        {issues.asymmetric.length > 0 && (
          <div>
            Туда и обратно — разные зоны, поэтому и цена разная:{" "}
            {issues.asymmetric
              .map((item) => `${item.a} → ${item.b}: ${item.there}, обратно ${item.back}`)
              .join("; ")}
            .
          </div>
        )}
        {issues.missing.length > 0 && (
          <div>
            Нет зоны для {formatNumber(issues.missing.length)}{" "}
            {plural(issues.missing.length, "направления", "направлений", "направлений")}, такие заказы не
            посчитаются:{" "}
            {issues.missing
              .slice(0, 6)
              .map((item) => `${item.from} → ${item.to}`)
              .join("; ")}
            {issues.missing.length > 6 ? ` и ещё ${formatNumber(issues.missing.length - 6)}` : ""}.
          </div>
        )}
        {issues.withoutZones.length > 0 && (
          <div>
            {issues.withoutZones.length === 1
              ? `Нет ни одной зоны у хаба ${issues.withoutZones[0]}: заказы через него калькулятор по зонам не посчитает.`
              : `Нет ни одной зоны у хабов ${issues.withoutZones.join(", ")}: заказы через них калькулятор по зонам не посчитает.`}
          </div>
        )}
      </div>
    </div>
  );
}

function ZoneDestinations({
  matrix,
  originId,
  originName,
}: {
  matrix: TariffZoneMatrix;
  originId: number;
  originName: string;
}) {
  const byZone = destinationsByZone(matrix, originId);
  if (byZone.size === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Для хаба {originName} в матрице нет зон: калькулятор не посчитает заказы из него по зонам.
      </p>
    );
  }
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {[...byZone.entries()].map(([zone, hubs]) => (
        <div key={zone} className="grid grid-cols-[6.5rem_1fr] items-baseline gap-3 px-3 py-2 text-sm">
          <span
            className={cn(
              "inline-flex w-fit items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium tabular-nums",
              zoneTint(zone),
            )}
          >
            Зона {zone}
          </span>
          <span className="min-w-0">
            {zone === 0 ? (
              <>
                {originName} и районы при нём
                <span className="text-muted-foreground"> — внутри одного хаба</span>
              </>
            ) : (
              hubs.map((hub) => hub.name).join(", ")
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function ZoneMatrixTable({
  matrix,
  originId,
  onSelectOrigin,
}: {
  matrix: TariffZoneMatrix;
  originId: number;
  onSelectOrigin: (hubId: number) => void;
}) {
  const { hubs, cells } = matrix;
  const zoneOf = useMemo(() => zoneLookup(matrix), [matrix]);
  const maxZone = Math.max(0, ...cells.map((cell) => cell.zone));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>Ближе</span>
        {Array.from({ length: maxZone + 1 }, (_, zone) => (
          <span
            key={zone}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded border border-border font-medium text-foreground tabular-nums",
              zoneTint(zone),
            )}
          >
            {zone}
          </span>
        ))}
        <span>Дальше</span>
        <span className="ml-2">Строка — откуда, столбец — куда. Нажмите на хаб слева, чтобы выбрать его выше.</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted px-2 py-2 text-left font-medium">
                Откуда ↓ · куда →
              </th>
              {hubs.map((hub) => (
                <th key={hub.id} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                  {hub.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hubs.map((from) => {
              const selected = from.id === originId;
              return (
                <tr key={from.id} className={cn("border-t border-border", selected && "outline-2 -outline-offset-2 outline-primary")}>
                  <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-medium whitespace-nowrap">
                    <button
                      type="button"
                      className={cn("rounded px-1 py-0.5 hover:bg-muted", selected && "font-semibold")}
                      aria-pressed={selected}
                      onClick={() => onSelectOrigin(from.id)}
                    >
                      {from.name}
                    </button>
                  </th>
                  {hubs.map((to) => {
                    const zone = zoneOf(from.id, to.id);
                    return (
                      <td
                        key={to.id}
                        title={zone === undefined ? `${from.name} → ${to.name}: нет зоны` : `${from.name} → ${to.name}: зона ${zone}`}
                        className={cn(
                          "min-w-9 px-2 py-1.5 text-center font-medium tabular-nums",
                          zone === undefined ? "text-muted-foreground/50" : zoneTint(zone),
                        )}
                      >
                        {zone ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
