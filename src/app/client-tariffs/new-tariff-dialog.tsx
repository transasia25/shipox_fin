"use client";

import { useMemo, useState } from "react";
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
import { useBackend } from "@/hooks/use-backend";
import { createClientTariff } from "@/lib/backend/client";
import type { ClientTariffRow, NewClientTariffResult, TariffPlanRef } from "@/lib/backend/types";
import { formatNumber, formatPrice, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatDayKey } from "./price-editor";
import { parseMoney } from "./price-editing";
import { loadVersion } from "./version-cache";

type Mode = "COPY" | "PER_KG";

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
  const [mode, setMode] = useState<Mode>("COPY");
  const [baseVersionId, setBaseVersionId] = useState<number | null>(
    client?.plan?.versionId ?? defaultPlan?.versionId ?? null,
  );
  const [rates, setRates] = useState<Record<number, string>>({});
  const [copySurcharges, setCopySurcharges] = useState(false);
  // По умолчанию клиент не теряет услуги, на которые ставку не дали.
  const [otherServicesFromBase, setOtherServicesFromBase] = useState(true);
  const [validFrom, setValidFrom] = useState(earliest ?? "");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const pick = (row: ClientTariffRow) => {
    setClientId(row.shipoxCustomerId);
    setSearch("");
    setPlanName(planNameFor(row));
    setInn("");
    setBaseVersionId(row.plan?.versionId ?? defaultPlan?.versionId ?? null);
  };

  // Планы, которые можно взять за основу: все, по которым кто-то считается.
  const planOptions = useMemo(() => {
    const byVersion = new Map<number, TariffPlanRef>();
    for (const plan of [defaultPlan, ...rows.map((row) => row.plan)]) {
      if (plan && !byVersion.has(plan.versionId)) byVersion.set(plan.versionId, plan);
    }
    return [...byVersion.values()].sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.planName.localeCompare(b.planName),
    );
  }, [rows, defaultPlan]);
  const basePlan = planOptions.find((plan) => plan.versionId === baseVersionId) ?? null;
  const base = useBackend(
    () => (baseVersionId === null ? Promise.resolve(null) : loadVersion(baseVersionId)),
    [baseVersionId],
  );
  const serviceTypes = base.data?.serviceTypes ?? [];

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

  const parsedRates = serviceTypes
    .map((type) => ({ type, text: rates[type.id] ?? "" }))
    .filter((item) => item.text.trim() !== "")
    .map((item) => ({ type: item.type, perKg: parseMoney(item.text) }));
  /** Услуги, на которые ставку за кг не дали. */
  const unrated = serviceTypes.filter((type) => (rates[type.id] ?? "").trim() === "");
  const unratedNames = unrated.map((type, index) => (index === 0 ? type.name : type.name.toLowerCase())).join(", ");
  const keepOthers = otherServicesFromBase && unrated.length > 0;
  const baseIsCurrent = basePlan !== null && basePlan.versionId === client?.plan?.versionId;
  const exampleRate = parsedRates.find((item) => item.perKg)?.perKg ?? null;
  const ratesOk = parsedRates.length > 0 && parsedRates.every((item) => item.perKg !== null && item.perKg > 0);

  const dateOk = Boolean(validFrom) && (!earliest || validFrom >= earliest);
  const innOk = inn === "" || /^\d{9}$/.test(inn);
  const upcomingConflict = client?.upcoming && validFrom && validFrom <= client.upcoming.validFrom ? client.upcoming : null;
  const ready =
    client !== null &&
    planName.trim().length >= 2 &&
    baseVersionId !== null &&
    dateOk &&
    innOk &&
    note.trim().length >= 3 &&
    (mode === "COPY" || ratesOk) &&
    !upcomingConflict;

  const pricingSummary =
    mode === "COPY"
      ? `копия плана «${basePlan?.planName ?? "—"}»` +
        (base.data
          ? `: ${formatNumber(base.data.priceRuleCount)} ${plural(base.data.priceRuleCount, "правило цены", "правила цены", "правил цены")}, ${formatNumber(base.data.surcharges.length)} ${plural(base.data.surcharges.length, "доплата", "доплаты", "доплат")}`
          : "")
      : parsedRates.map((item) => `${item.type.name} — ${formatPrice(item.perKg ?? 0)} за кг`).join("; ") +
        (unrated.length === 0
          ? ""
          : keepOthers
            ? `; ${unratedNames.toLowerCase()} — по ценам плана «${basePlan?.planName ?? "—"}»`
            : `; ${unratedNames.toLowerCase()} — у клиента не будет`) +
        (copySurcharges ? `; доплаты — из плана «${basePlan?.planName ?? "—"}»` : "; без доплат");

  const save = async () => {
    if (!client || baseVersionId === null) return;
    setSaving(true);
    try {
      const result = await createClientTariff({
        ...(client.calculatorOnly
          ? { calculatorClientId: client.calculatorClient!.id }
          : { shipoxCustomerId: client.shipoxCustomerId }),
        ...(inn && !ownCalculatorClient ? { inn } : {}),
        planName: planName.trim(),
        validFrom,
        baseVersionId,
        mode,
        ...(mode === "PER_KG"
          ? {
              rates: parsedRates.map((item) => ({ serviceTypeId: item.type.id, perKg: item.perKg! })),
              copySurcharges,
              otherServicesFromBase: keepOthers,
            }
          : {}),
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
          <li>Цены: {pricingSummary}</li>
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
              <div className="text-sm font-medium">Цены</div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Цены">
                {(
                  [
                    ["COPY", "Копия плана"],
                    ["PER_KG", "Одна ставка за кг"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    role="radio"
                    aria-checked={mode === value}
                    variant={mode === value ? "default" : "outline"}
                    onClick={() => setMode(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {mode === "COPY" && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-tariff-base" className="text-xs text-muted-foreground">
                    Какой план скопировать
                  </Label>
                  <select
                    id="new-tariff-base"
                    value={baseVersionId ?? ""}
                    onChange={(event) => setBaseVersionId(Number(event.target.value))}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
                  >
                    {planOptions.map((plan) => (
                      <option key={plan.versionId} value={plan.versionId}>
                        {plan.planName}
                        {plan.isDefault ? " (по умолчанию)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {mode === "COPY" ? (
                <p className="text-xs text-muted-foreground">
                  Все цены, цены по маршрутам и доплаты плана копируются как есть.
                  {base.data &&
                    ` В плане ${formatNumber(base.data.priceRuleCount)} ${plural(base.data.priceRuleCount, "правило цены", "правила цены", "правил цены")} и ${formatNumber(base.data.surcharges.length)} ${plural(base.data.surcharges.length, "доплата", "доплаты", "доплат")}.`}
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Цена за каждый килограмм, одинаковая во всех зонах:{" "}
                    {exampleRate
                      ? `1 кг — ${formatPrice(exampleRate)}, 2 кг — ${formatPrice(exampleRate * 2)}, 5 кг — ${formatPrice(exampleRate * 5)}`
                      : "1 кг — одна ставка, 2 кг — две"}
                    . Заполните только услуги, для которых такая цена есть в договоре.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {serviceTypes.map((type) => {
                      const text = rates[type.id] ?? "";
                      const invalid = text.trim() !== "" && !(parseMoney(text) ?? 0);
                      return (
                        <div key={type.id} className="flex items-center gap-2">
                          <Label htmlFor={`rate-${type.id}`} className="w-32 shrink-0 text-sm font-normal">
                            {type.name}
                          </Label>
                          <Input
                            id={`rate-${type.id}`}
                            inputMode="decimal"
                            value={text}
                            onChange={(event) => setRates((previous) => ({ ...previous, [type.id]: event.target.value }))}
                            aria-invalid={invalid || undefined}
                            placeholder="—"
                            className="h-8 text-right tabular-nums"
                          />
                          <span className="text-xs text-muted-foreground">/кг</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-tariff-base" className="text-xs text-muted-foreground">
                      План, из которого взять остальное
                    </Label>
                    <select
                      id="new-tariff-base"
                      value={baseVersionId ?? ""}
                      onChange={(event) => setBaseVersionId(Number(event.target.value))}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    >
                      {planOptions.map((plan) => (
                        <option key={plan.versionId} value={plan.versionId}>
                          {plan.planName}
                          {plan.isDefault ? " (по умолчанию)" : ""}
                          {plan.versionId === client.plan?.versionId ? " — сейчас у клиента" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  {unrated.length > 0 && (
                    <>
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={otherServicesFromBase}
                          onCheckedChange={(value) => setOtherServicesFromBase(value === true)}
                        />
                        <span>
                          {unratedNames} — по ценам плана «{basePlan?.planName ?? "—"}»
                          {baseIsCurrent && <span className="text-muted-foreground">, как сейчас</span>}
                        </span>
                      </label>
                      {!otherServicesFromBase && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          {unratedNames} у клиента не будет: такие заказы калькулятор не посчитает.
                        </p>
                      )}
                    </>
                  )}
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={copySurcharges}
                      onCheckedChange={(value) => setCopySurcharges(value === true)}
                    />
                    <span>
                      Добавлять доплаты плана «{basePlan?.planName ?? "—"}» — за доставку в районы (доп. город) и
                      другие
                      <span className="block text-xs text-muted-foreground">
                        Они прибавятся и к цене за кг. Если по договору доплат нет — не отмечайте.
                      </span>
                    </span>
                  </label>
                </div>
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
