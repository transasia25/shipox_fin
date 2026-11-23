"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClientTariff } from "@/lib/backend/client";
import type {
  ClientTariffRow,
  NewClientTariffResult,
  TariffPlanRef,
  TariffVersionDetail,
} from "@/lib/backend/types";
import { formatNumber, formatPrice, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatDayKey } from "./price-editor";
import { parseMoney } from "./price-editing";
import {
  defaultRows,
  overMaxInfo,
  rowError,
  surchargeLines,
  toServiceSources,
  type ServiceRow,
} from "./service-sources";
import { loadVersion } from "./version-cache";

/** `2026-12-01` → `2026-11-30`. */
function previousDay(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9а-яё]+/g, "");
}

/** ИНН в начале названия — как его хранит калькулятор. */
function innOf(name: string): string | null {
  return name.trim().match(/^(\d{6,12})\b/)?.[1] ?? null;
}

/**
 * Новый тариф клиента: свой план в калькуляторе с даты.
 *
 * Цены — копия выбранного плана или одна ставка за кг на все зоны. Поправить
 * отдельные ячейки можно потом в таблице цен: пока тариф не вступил в силу,
 * цены правятся на месте.
 */
export function NewTariffDialog({
  open,
  onOpenChange,
  rows,
  defaultPlan,
  defaultClientId,
  earliest,
  initialClientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ClientTariffRow[];
  defaultPlan: TariffPlanRef | null;
  /** Клиент калькулятора плана по умолчанию: «связан с ним» значит «своего плана нет». */
  defaultClientId: number;
  earliest: string | null;
  initialClientId: string | null;
  onCreated: (result: NewClientTariffResult, clientRowId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {open && (
          <NewTariffForm
            rows={rows}
            defaultPlan={defaultPlan}
            defaultClientId={defaultClientId}
            earliest={earliest}
            initialClientId={initialClientId}
            onCancel={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewTariffForm({
  rows,
  defaultPlan,
  defaultClientId,
  earliest,
  initialClientId,
  onCancel,
  onCreated,
}: {
  rows: ClientTariffRow[];
  defaultPlan: TariffPlanRef | null;
  defaultClientId: number;
  earliest: string | null;
  initialClientId: string | null;
  onCancel: () => void;
  onCreated: (result: NewClientTariffResult, clientRowId: string) => void;
}) {
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  const client = rows.find((row) => row.shipoxCustomerId === clientId) ?? null;
  const [search, setSearch] = useState("");
  const [inn, setInn] = useState("");
  const [planName, setPlanName] = useState(client ? planNameFor(client) : "");
  /** Строки по услугам; `null` — ещё не заполнены по нынешнему плану клиента. */
  const [serviceRows, setServiceRows] = useState<ServiceRow[] | null>(null);
  const [validFrom, setValidFrom] = useState(earliest ?? "");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const pick = (row: ClientTariffRow) => {
    setClientId(row.shipoxCustomerId);
    setSearch("");
    setPlanName(planNameFor(row));
    setInn("");
    setServiceRows(null);
  };

  // Планы, из которых можно взять цены: все, по которым кто-то считается.
  const planOptions = useMemo(() => {
    const byVersion = new Map<number, TariffPlanRef>();
    for (const plan of [defaultPlan, ...rows.map((row) => row.plan)]) {
      if (plan && !byVersion.has(plan.versionId)) byVersion.set(plan.versionId, plan);
    }
    return [...byVersion.values()].sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.planName.localeCompare(b.planName),
    );
  }, [rows, defaultPlan]);

  // Нынешний план клиента — «как сейчас». Его цены и все выбранные планы
  // загружаются: по ним видно, какие услуги в плане есть и какие у них доплаты.
  const currentVersionId = client?.plan?.versionId ?? defaultPlan?.versionId ?? null;
  const usedVersionIds = [
    ...new Set([
      ...(currentVersionId === null ? [] : [currentVersionId]),
      ...(serviceRows ?? []).flatMap((row) => (row.choice.kind === "PLAN" ? [row.choice.versionId] : [])),
    ]),
  ].sort((a, b) => a - b);
  // Загруженные планы копятся: при выборе нового плана в строке остальные не пропадают.
  const usedKey = usedVersionIds.join(",");
  const [detailById, setDetailById] = useState<Map<number, TariffVersionDetail>>(new Map());
  const [detailsError, setDetailsError] = useState<string | null>(null);
  useEffect(() => {
    const missing = usedKey
      .split(",")
      .filter(Boolean)
      .map(Number)
      .filter((id) => !detailById.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((id) => loadVersion(id)))
      .then((loaded) => {
        if (cancelled) return;
        setDetailsError(null);
        setDetailById((previous) => new Map([...previous, ...loaded.map((detail) => [detail.versionId, detail] as const)]));
      })
      .catch((error: unknown) => {
        if (!cancelled) setDetailsError(error instanceof Error ? error.message : "Не удалось загрузить план");
      });
    return () => {
      cancelled = true;
    };
  }, [usedKey, detailById]);
  const currentDetail = currentVersionId === null ? undefined : detailById.get(currentVersionId);
  const rowsShown = serviceRows ?? (currentDetail ? defaultRows(currentDetail) : null);
  const updateRow = (serviceTypeId: number, patch: Partial<ServiceRow>) =>
    setServiceRows((previous) =>
      (previous ?? rowsShown ?? []).map((row) => (row.serviceTypeId === serviceTypeId ? { ...row, ...patch } : row)),
    );
  const serviceName = (id: number) => currentDetail?.serviceTypes.find((type) => type.id === id)?.name ?? `услуга ${id}`;
  const planLabel = (versionId: number) =>
    planOptions.find((plan) => plan.versionId === versionId)?.planName ??
    detailById.get(versionId)?.planName ??
    `версия ${versionId}`;

  const needle = normalize(search);
  const matches = needle
    ? rows
        .filter((row) =>
          normalize(`${row.shipoxCustomerName} ${row.calculatorClient?.name ?? ""}`).includes(needle),
        )
        .slice(0, 8)
    : [];

  // Свой клиент в калькуляторе есть — план назначится ему; нет — заведём.
  const ownCalculatorClient =
    client?.calculatorClient && client.calculatorClient.id !== defaultClientId ? client.calculatorClient : null;
  const newClientName = client
    ? innOf(client.shipoxCustomerName) || !inn
      ? client.shipoxCustomerName.trim()
      : `${inn} ${client.shipoxCustomerName.trim()}`
    : "";
  /** Другие клиенты Shipox, связанные с тем же клиентом калькулятора, — новый план получат и они. */
  const sharing = ownCalculatorClient
    ? rows.filter(
        (row) =>
          row.shipoxCustomerId !== client?.shipoxCustomerId && row.calculatorClient?.id === ownCalculatorClient.id,
      )
    : [];
  const previousOwnPlan = ownCalculatorClient && client?.plan && !client.plan.isDefault ? client.plan : null;

  const rowErrors = (rowsShown ?? []).map((row) =>
    rowError(row, row.choice.kind === "PLAN" ? detailById.get(row.choice.versionId) : undefined),
  );
  const pricingOk =
    rowsShown !== null &&
    rowsShown.some((row) => row.choice.kind !== "NONE") &&
    rowErrors.every((error) => error === null);

  const dateOk = Boolean(validFrom) && (!earliest || validFrom >= earliest);
  const innOk = inn === "" || /^\d{9}$/.test(inn);
  const upcomingConflict = client?.upcoming && validFrom && validFrom <= client.upcoming.validFrom ? client.upcoming : null;
  const ready =
    client !== null &&
    planName.trim().length >= 2 &&
    dateOk &&
    innOk &&
    note.trim().length >= 3 &&
    pricingOk &&
    !upcomingConflict;

  /** Что будет с каждой услугой — для подтверждения. */
  const summaryLines = (rowsShown ?? []).map((row) => {
    const name = serviceName(row.serviceTypeId);
    if (row.choice.kind === "NONE") return `${name} — нет у клиента`;
    if (row.choice.kind === "PER_KG") {
      return (
        `${name} — ${formatPrice(parseMoney(row.perKgText) ?? 0)} за каждый кг во всех зонах` +
        (row.surcharges ? `, с доплатами как сейчас` : "")
      );
    }
    const versionId = row.choice.versionId;
    const detail = detailById.get(versionId);
    const overMax = row.overMaxText.trim() === "" ? null : parseMoney(row.overMaxText);
    const info = detail ? overMaxInfo(detail, row.serviceTypeId) : null;
    return (
      `${name} — ${versionId === currentVersionId ? "как сейчас" : "как в"} «${planLabel(versionId)}»` +
      (overMax !== null && info
        ? `, свыше ${formatNumber(info.weight)} кг — ${formatPrice(overMax)} за кг (было ${info.current})`
        : "") +
      (detail && surchargeLines(detail, row.serviceTypeId).length > 0 && !row.surcharges ? ", без доплат и скидок" : "")
    );
  });

  const save = async () => {
    if (!client || !rowsShown || currentVersionId === null) return;
    setSaving(true);
    try {
      const result = await createClientTariff({
        ...(client.calculatorOnly
          ? { calculatorClientId: client.calculatorClient!.id }
          : { shipoxCustomerId: client.shipoxCustomerId }),
        ...(inn && !ownCalculatorClient ? { inn } : {}),
        planName: planName.trim(),
        validFrom,
        services: toServiceSources(rowsShown, currentVersionId),
        note: note.trim(),
      });
      toast.success(`Тариф «${result.planName}» заведён с ${formatDayKey(result.validFrom)}`);
      onCreated(result, client.shipoxCustomerId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось завести тариф");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  if (confirming && client) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>
            Завести тариф «{planName.trim()}» с {formatDayKey(validFrom)}
          </DialogTitle>
          <DialogDescription>
            Изменения сразу попадут в калькулятор. Заказы, созданные до {formatDayKey(validFrom)}, и при
            пересчёте останутся по прежним ценам.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>
            Клиент: <span className="font-medium">{client.shipoxCustomerName}</span>
            {ownCalculatorClient ? (
              <span className="text-muted-foreground"> — в калькуляторе «{ownCalculatorClient.name}»</span>
            ) : (
              <span className="text-muted-foreground">
                {" "}
                — в калькуляторе будет заведён клиент «{newClientName}»
              </span>
            )}
          </li>
          <li>
            Цены:
            <ul className="mt-1 list-[circle] space-y-0.5 pl-5">
              {summaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </li>
          <li>
            {previousOwnPlan
              ? `Прежний план «${previousOwnPlan.planName}» у клиента будет действовать по ${formatDayKey(previousDay(validFrom))}.`
              : `До ${formatDayKey(validFrom)} клиент считается как сейчас — по «${client.plan?.planName ?? "—"}».`}
          </li>
          {sharing.length > 0 && (
            <li>
              Тот же клиент калькулятора у {sharing.map((row) => row.shipoxCustomerName).join(", ")} — новый план
              будет и у {plural(sharing.length, "него", "них", "них")}.
            </li>
          )}
          <li className="text-muted-foreground">Основание: {note.trim()}</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={saving}>
            Вернуться
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Завожу…" : "Завести тариф"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Новый тариф клиента</DialogTitle>
        <DialogDescription>
          Свой план клиента в калькуляторе с выбранного дня. После создания цены можно поправить в таблице
          цен — пока тариф не начал действовать, они правятся на месте.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <section className="space-y-1.5">
          <Label htmlFor="new-tariff-client">Клиент</Label>
          {client ? (
            <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <div className="space-y-0.5">
                <div className="font-medium">{client.shipoxCustomerName}</div>
                <div className="text-xs text-muted-foreground">
                  Сейчас: {client.plan?.planName ?? "нет плана"}
                  {client.plan?.isDefault && " (по умолчанию)"}
                  {client.upcoming && ` · с ${formatDayKey(client.upcoming.validFrom)} — «${client.upcoming.plan.planName}»`}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setClientId(null)}>
                Другой клиент
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                id="new-tariff-client"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Название клиента"
              />
              {matches.length > 0 && (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {matches.map((row) => (
                    <li key={row.shipoxCustomerId}>
                      <button
                        type="button"
                        onClick={() => pick(row)}
                        className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span>{row.shipoxCustomerName}</span>
                        <span className="text-xs text-muted-foreground">{row.plan?.planName ?? "нет плана"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {needle && matches.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Не найден. Здесь только клиенты с заказами в Shipox Finance и клиенты калькулятора.
                </p>
              )}
            </div>
          )}
        </section>

        {client && (
          <>
            {upcomingConflict && (
              <Warning>
                У клиента уже заведён план «{upcomingConflict.plan.planName}» с{" "}
                {formatDayKey(upcomingConflict.validFrom)}. Поправьте его цены в таблице или выберите дату позже.
              </Warning>
            )}

            {!ownCalculatorClient && (
              <section className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <div className="space-y-1.5">
                  <Label htmlFor="new-tariff-inn">ИНН</Label>
                  <Input
                    id="new-tariff-inn"
                    inputMode="numeric"
                    maxLength={9}
                    value={inn}
                    onChange={(event) => setInn(event.target.value.replace(/\D/g, ""))}
                    aria-invalid={!innOk || undefined}
                    placeholder="9 цифр"
                    disabled={Boolean(innOf(client.shipoxCustomerName))}
                  />
                </div>
                <p className="self-end text-xs text-muted-foreground">
                  В калькуляторе клиента нет — он будет заведён как «{newClientName}». По ИНН Shipox Finance
                  находит клиента в калькуляторе; ИНН можно не указывать, связь всё равно сохранится.
                </p>
              </section>
            )}

            <section className="space-y-1.5">
              <Label htmlFor="new-tariff-name">Название плана</Label>
              <Input
                id="new-tariff-name"
                value={planName}
                maxLength={120}
                onChange={(event) => setPlanName(event.target.value)}
              />
            </section>

            <section className="space-y-2">
              <div>
                <div className="text-sm font-medium">Цены по услугам</div>
                <p className="text-xs text-muted-foreground">
                  Для каждой услуги — откуда цены. «Как сейчас» — по нынешнему плану клиента. Цены копируются в
                  новый план: если потом поменяют исходный план, у клиента они не изменятся.
                </p>
              </div>
              {detailsError ? (
                <p className="text-sm text-destructive">{detailsError}</p>
              ) : !rowsShown ? (
                <p className="text-xs text-muted-foreground">Загружаю план клиента…</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {rowsShown.map((row, index) => (
                    <ServiceRowEditor
                      key={row.serviceTypeId}
                      row={row}
                      name={serviceName(row.serviceTypeId)}
                      error={rowErrors[index]}
                      currentVersionId={currentVersionId}
                      currentDetail={currentDetail}
                      detail={row.choice.kind === "PLAN" ? detailById.get(row.choice.versionId) : undefined}
                      planOptions={planOptions}
                      planLabel={planLabel}
                      onChange={(patch) => updateRow(row.serviceTypeId, patch)}
                    />
                  ))}
                </div>
              )}
              {rowsShown && !rowsShown.some((row) => row.choice.kind !== "NONE") && (
                <p className="text-xs text-destructive">Хотя бы одна услуга должна у клиента быть.</p>
              )}
            </section>

            <section className="grid gap-3 sm:grid-cols-[11rem_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="new-tariff-from">Действует с</Label>
                <Input
                  id="new-tariff-from"
                  type="date"
                  min={earliest ?? undefined}
                  value={validFrom}
                  onChange={(event) => setValidFrom(event.target.value)}
                  aria-invalid={!dateOk || undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-tariff-note">Основание</Label>
                <Input
                  id="new-tariff-note"
                  value={note}
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Договор № …, письмо от …"
                />
              </div>
            </section>
            <p className={cn("text-xs", dateOk ? "text-muted-foreground" : "text-destructive")}>
              {dateOk
                ? `С ${formatDayKey(validFrom)} заказы клиента считаются по новому плану, раньше — как сейчас.`
                : `Не раньше ${earliest ? formatDayKey(earliest) : "завтрашнего дня"}: заказы, созданные сегодня, уже посчитаны.`}
            </p>
          </>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button onClick={() => setConfirming(true)} disabled={!ready}>
          Дальше…
        </Button>
      </DialogFooter>
    </>
  );
}

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Одна услуга: откуда цены и что поменять. */
function ServiceRowEditor({
  row,
  name,
  error,
  currentVersionId,
  currentDetail,
  detail,
  planOptions,
  planLabel,
  onChange,
}: {
  row: ServiceRow;
  name: string;
  error: string | null;
  currentVersionId: number | null;
  currentDetail: TariffVersionDetail | undefined;
  /** Загруженный план, из которого берутся цены строки. */
  detail: TariffVersionDetail | undefined;
  planOptions: TariffPlanRef[];
  planLabel: (versionId: number) => string;
  onChange: (patch: Partial<ServiceRow>) => void;
}) {
  const value =
    row.choice.kind === "PLAN" ? `plan:${row.choice.versionId}` : row.choice.kind === "PER_KG" ? "per-kg" : "none";
  const choose = (next: string) => {
    if (next === "none") onChange({ choice: { kind: "NONE" } });
    else if (next === "per-kg") onChange({ choice: { kind: "PER_KG" }, surcharges: false });
    else onChange({ choice: { kind: "PLAN", versionId: Number(next.slice(5)) }, overMaxText: "", surcharges: true });
  };
  const info = detail ? overMaxInfo(detail, row.serviceTypeId) : null;
  const surcharges = row.choice.kind === "PLAN" && detail ? surchargeLines(detail, row.serviceTypeId) : [];
  const currentSurcharges =
    row.choice.kind === "PER_KG" && currentDetail ? surchargeLines(currentDetail, row.serviceTypeId) : [];
  const rate = row.choice.kind === "PER_KG" ? parseMoney(row.perKgText) : null;

  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="grid items-center gap-2 sm:grid-cols-[9rem_1fr]">
        <Label htmlFor={`source-${row.serviceTypeId}`} className="text-sm">
          {name}
        </Label>
        <select
          id={`source-${row.serviceTypeId}`}
          value={value}
          onChange={(event) => choose(event.target.value)}
          className={SELECT_CLASS}
        >
          {currentVersionId !== null && (
            <option value={`plan:${currentVersionId}`}>Как сейчас — «{planLabel(currentVersionId)}»</option>
          )}
          {planOptions
            .filter((plan) => plan.versionId !== currentVersionId)
            .map((plan) => (
              <option key={plan.versionId} value={`plan:${plan.versionId}`}>
                Как в «{plan.planName}»
              </option>
            ))}
          <option value="per-kg">Одна ставка за кг во всех зонах</option>
          <option value="none">Нет у клиента</option>
        </select>
      </div>

      <div className="space-y-1.5 sm:pl-[9.5rem]">
        {row.choice.kind === "PER_KG" && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Input
                aria-label={`${name}: ставка за кг`}
                inputMode="decimal"
                value={row.perKgText}
                onChange={(event) => onChange({ perKgText: event.target.value })}
                aria-invalid={(row.perKgText !== "" && error !== null) || undefined}
                placeholder="3 000"
                className="h-8 w-32 text-right tabular-nums"
              />
              <span className="text-xs text-muted-foreground">
                за каждый кг
                {rate ? ` · 1 кг — ${formatPrice(rate)}, 2 кг — ${formatPrice(rate * 2)}, 10 кг — ${formatPrice(rate * 10)}` : ""}
              </span>
            </div>
            {currentSurcharges.length > 0 && (
              <label className="flex items-start gap-2 text-xs">
                <Checkbox className="mt-0.5" checked={row.surcharges} onCheckedChange={(next) => onChange({ surcharges: next === true })} />
                <span>
                  Прибавлять доплаты, как сейчас: {currentSurcharges.slice(0, 3).join("; ")}
                  {currentSurcharges.length > 3 && ` и ещё ${formatNumber(currentSurcharges.length - 3)}`}
                </span>
              </label>
            )}
          </>
        )}

        {row.choice.kind === "PLAN" && info && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Свыше {formatNumber(info.weight)} кг — за каждый следующий кг</span>
            <Input
              aria-label={`${name}: доплата за кг свыше ${info.weight} кг`}
              inputMode="decimal"
              value={row.overMaxText}
              onChange={(event) => onChange({ overMaxText: event.target.value })}
              aria-invalid={(row.overMaxText !== "" && error !== null) || undefined}
              placeholder="как в плане"
              className="h-7 w-28 text-right text-sm tabular-nums"
            />
            <span>в плане: {info.current}</span>
          </div>
        )}
        {row.choice.kind === "PLAN" && surcharges.length > 0 && (
          <label className="flex items-start gap-2 text-xs">
            <Checkbox className="mt-0.5" checked={row.surcharges} onCheckedChange={(next) => onChange({ surcharges: next === true })} />
            <span>
              С доплатами и скидками плана: {surcharges.slice(0, 3).join("; ")}
              {surcharges.length > 3 && ` и ещё ${formatNumber(surcharges.length - 3)}`}
            </span>
          </label>
        )}

        {row.choice.kind === "NONE" && (
          <p className="text-xs text-muted-foreground">Заказы этой услуги калькулятор не посчитает.</p>
        )}
        {error && (row.choice.kind !== "PER_KG" || row.perKgText !== "") && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}

function planNameFor(row: ClientTariffRow): string {
  return row.shipoxCustomerName.replace(/^\d{6,12}\s+/, "").replace(/\s+/g, " ").trim();
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
