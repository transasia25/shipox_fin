"use client";

import { useMemo, useState } from "react";
import { Plus, TriangleAlert, X } from "lucide-react";
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
import { listCalculatorCities, setTariffServicePrices } from "@/lib/backend/client";
import type { CalculatorCity, TariffRevisionResult, TariffVersionDetail, TariffZoneMatrix } from "@/lib/backend/types";
import { formatNumber, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ImpactNote, formatDayKey, type PlanImpact } from "./price-editor";
import {
  draftFromDetail,
  examples,
  parseSteps,
  rowKey,
  stepLabel,
  stepRow,
  toServicePrices,
  unsupportedRules,
  type RouteRow,
  type ServicePricesDraft,
  type StepRow,
} from "./service-prices";
import { zoneHints } from "./zones";

/**
 * Цены одной услуги заново: свои шаги веса по зонам и отдельные цены по
 * маршрутам «город → город». Для договоров, которые не ложатся на сетку
 * «1–20 кг»: «до 30 кг — одна цена, до 55 — другая», «Ташкент — отдельно».
 */
export function ServicePricesDialog({
  open,
  onOpenChange,
  detail,
  zones,
  earliest,
  impact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: TariffVersionDetail;
  zones: TariffZoneMatrix | null;
  earliest: string | null;
  impact: PlanImpact;
  onSaved: (result: TariffRevisionResult) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {open && (
          <ServicePricesForm
            detail={detail}
            zones={zones}
            earliest={earliest}
            impact={impact}
            onCancel={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Все зоны калькулятора: из матрицы зон, иначе — из сеток плана. */
function allZones(zones: TariffZoneMatrix | null, detail: TariffVersionDetail): number[] {
  const fromMatrix = zones?.cells.map((cell) => cell.zone) ?? [];
  const fromPlan = detail.zoneGrids.flatMap((grid) => grid.zones);
  return [...new Set([...fromMatrix, ...fromPlan])].sort((a, b) => a - b);
}

/** Услуга, с которой открыть окно: первая, у которой есть цены. */
function firstService(detail: TariffVersionDetail): number {
  const ids = [
    ...detail.zoneGrids.map((grid) => grid.serviceTypeId),
    ...detail.routeRules.map((rule) => rule.serviceTypeId),
  ];
  return (
    [...detail.serviceTypes].sort((a, b) => a.id - b.id).find((type) => ids.includes(type.id) || ids.includes(null))?.id ??
    detail.serviceTypes[0]?.id ??
    1
  );
}

function ServicePricesForm({
  detail,
  zones,
  earliest,
  impact,
  onCancel,
  onSaved,
}: {
  detail: TariffVersionDetail;
  zones: TariffZoneMatrix | null;
  earliest: string | null;
  impact: PlanImpact;
  onCancel: () => void;
  onSaved: (result: TariffRevisionResult) => void;
}) {
  const zoneList = useMemo(() => allZones(zones, detail), [zones, detail]);
  const hints = useMemo(() => zoneHints(zones, zoneList), [zones, zoneList]);
  const cities = useBackend(() => listCalculatorCities(), []);

  const [draft, setDraft] = useState<ServicePricesDraft>(() => draftFromDetail(detail, firstService(detail), zoneList));
  const pending = Boolean(detail.validFrom && earliest && detail.validFrom >= earliest);
  const [validFrom, setValidFrom] = useState(pending ? detail.validFrom! : (earliest ?? ""));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const service = detail.serviceTypes.find((type) => type.id === draft.serviceTypeId);
  const serviceName = service?.name ?? `услуга ${draft.serviceTypeId}`;
  const unsupported = unsupportedRules(detail, draft.serviceTypeId);
  const input = toServicePrices(draft);
  const dateOk = Boolean(validFrom) && (!earliest || validFrom >= earliest);
  const inPlace = pending && validFrom === detail.validFrom;
  const ready = input.errors.length === 0 && unsupported === 0 && dateOk && note.trim().length >= 3 && !saving;

  const update = (patch: Partial<ServicePricesDraft>) => setDraft((previous) => ({ ...previous, ...patch }));
  const chooseService = (serviceTypeId: number) => setDraft(draftFromDetail(detail, serviceTypeId, zoneList));
  const setSame = (same: boolean) =>
    setDraft((previous) => {
      if (same === previous.sameForAllZones) return previous;
      if (same) {
        const source = previous.zones.find((zone) => zone.enabled)?.steps ?? previous.common;
        return { ...previous, sameForAllZones: true, common: copySteps(source) };
      }
      return {
        ...previous,
        sameForAllZones: false,
        zones: previous.zones.map((zone) => ({ ...zone, enabled: true, steps: copySteps(previous.common) })),
      };
    });
  const updateZone = (zone: number, patch: { enabled?: boolean; steps?: StepRow[] }) =>
    setDraft((previous) => ({
      ...previous,
      zones: previous.zones.map((item) => (item.zone === zone ? { ...item, ...patch } : item)),
    }));
  const updateRoute = (key: string, patch: Partial<RouteRow>) =>
    setDraft((previous) => ({
      ...previous,
      routes: previous.routes.map((route) => (route.key === key ? { ...route, ...patch } : route)),
    }));

  const save = async () => {
    setSaving(true);
    try {
      const result = await setTariffServicePrices(detail.versionId, {
        serviceTypeId: draft.serviceTypeId,
        zones: input.zones,
        routes: input.routes,
        validFrom,
        note: note.trim(),
      });
      toast.success(`Цены «${serviceName}» сохранены с ${formatDayKey(validFrom)}`);
      onSaved(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить цены");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Шаги веса и маршруты — «{detail.planName}»</DialogTitle>
        <DialogDescription>
          Цены услуги задаются заново: шаги веса («до 30 кг — одна цена, от 31 — другая») по зонам и отдельные цены
          для пар городов. Остальные услуги и надбавки плана не меняются.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <section className="space-y-1.5">
          <div className="text-sm font-medium">Услуга</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Услуга">
            {[...detail.serviceTypes]
              .sort((a, b) => a.id - b.id)
              .map((type) => (
                <Button
                  key={type.id}
                  size="sm"
                  role="radio"
                  aria-checked={draft.serviceTypeId === type.id}
                  variant={draft.serviceTypeId === type.id ? "default" : "outline"}
                  onClick={() => chooseService(type.id)}
                >
                  {type.name}
                </Button>
              ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Окно заполнено ценами «{serviceName}» из этого плана — поменяйте то, что нужно.
          </p>
        </section>

        {unsupported > 0 ? (
          <Warning>
            У «{serviceName}» есть цены за место или по хабам ({formatNumber(unsupported)}) — здесь они не показываются
            и молча заменились бы. Такую услугу правят в калькуляторе.
          </Warning>
        ) : (
          <>
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">По зонам</div>
                  <p className="text-xs text-muted-foreground">Зона зависит от хабов отправителя и получателя.</p>
                </div>
                <div className="flex gap-1" role="radiogroup" aria-label="Шаги по зонам">
                  <Button
                    size="sm"
                    role="radio"
                    aria-checked={draft.sameForAllZones}
                    variant={draft.sameForAllZones ? "secondary" : "ghost"}
                    onClick={() => setSame(true)}
                  >
                    Одинаково во всех зонах
                  </Button>
                  <Button
                    size="sm"
                    role="radio"
                    aria-checked={!draft.sameForAllZones}
                    variant={!draft.sameForAllZones ? "secondary" : "ghost"}
                    onClick={() => setSame(false)}
                  >
                    По каждой зоне
                  </Button>
                </div>
              </div>

              {draft.sameForAllZones ? (
                <div className="rounded-lg border border-border p-3">
                  <StepsEditor
                    label={`${serviceName}, все зоны`}
                    rows={draft.common}
                    onChange={(common) => update({ common })}
                  />
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {draft.zones.map((zone) => (
                    <div key={zone.zone} className="space-y-2 p-3">
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          className="mt-0.5"
                          checked={zone.enabled}
                          onCheckedChange={(next) => updateZone(zone.zone, { enabled: next === true })}
                        />
                        <span>
                          <span className="font-medium">Зона {zone.zone}</span>
                          {hints.get(zone.zone) && (
                            <span className="text-xs text-muted-foreground"> — {hints.get(zone.zone)!.title}</span>
                          )}
                          {!zone.enabled && <span className="text-xs text-muted-foreground"> · без цены</span>}
                        </span>
                      </label>
                      {zone.enabled && (
                        <StepsEditor
                          label={`${serviceName}, зона ${zone.zone}`}
                          rows={zone.steps}
                          onChange={(steps) => updateZone(zone.zone, { steps })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div>
                <div className="text-sm font-medium">Отдельно по маршрутам</div>
                <p className="text-xs text-muted-foreground">
                  Цена пары городов перекрывает зону. Например, Ташкент → Ташкент отдельно: в зону 0 входит ещё и
                  Ташкент → Чирчик.
                </p>
              </div>
              {draft.routes.length > 0 && (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {draft.routes.map((route, index) => (
                    <div key={route.key} className="space-y-2 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs text-muted-foreground">Маршрут {index + 1}</span>
                        <CitySelect
                          label={`Маршрут ${index + 1}: откуда`}
                          cities={cities.data}
                          value={route.fromCityId}
                          onChange={(fromCityId) => updateRoute(route.key, { fromCityId })}
                        />
                        <span aria-hidden>→</span>
                        <CitySelect
                          label={`Маршрут ${index + 1}: куда`}
                          cities={cities.data}
                          value={route.toCityId}
                          onChange={(toCityId) => updateRoute(route.key, { toCityId })}
                        />
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Убрать маршрут ${index + 1}`}
                          className="ml-auto"
                          onClick={() => update({ routes: draft.routes.filter((item) => item.key !== route.key) })}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <StepsEditor
                        label={`Маршрут ${index + 1}`}
                        rows={route.steps}
                        onChange={(steps) => updateRoute(route.key, { steps })}
                      />
                    </div>
                  ))}
                </div>
              )}
              {cities.error && <p className="text-xs text-destructive">Города не загрузились: {cities.error}</p>}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  update({
                    routes: [...draft.routes, { key: rowKey(), fromCityId: null, toCityId: null, steps: [stepRow(1)] }],
                  })
                }
              >
                <Plus className="size-4" />
                Добавить маршрут
              </Button>
            </section>
          </>
        )}

        <section className="grid gap-3 sm:grid-cols-[11rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="service-prices-from">Новые цены с</Label>
            <Input
              id="service-prices-from"
              type="date"
              min={earliest ?? undefined}
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
              aria-invalid={!dateOk || undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="service-prices-note">Основание</Label>
            <Input
              id="service-prices-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Договор № …, письмо от …"
            />
          </div>
        </section>
        <p className={dateOk ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
          {!dateOk
            ? `Не раньше ${earliest ? formatDayKey(earliest) : "завтрашнего дня"}: заказы, созданные сегодня, уже посчитаны.`
            : inPlace
              ? `Тариф ещё не начал действовать (с ${formatDayKey(detail.validFrom!)}) — цены поменяются в нём сразу, ни один заказ это не задевает.`
              : `Будет новая версия плана с ${formatDayKey(validFrom)}; заказы, созданные раньше, останутся по прежним ценам.`}
        </p>

        <ImpactNote impact={impact} />

        {unsupported === 0 && input.errors.length > 0 && (
          <ul className="space-y-0.5 text-xs text-destructive">
            {input.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Отмена
        </Button>
        <Button onClick={save} disabled={!ready}>
          {saving ? "Сохраняю…" : `Сохранить цены «${serviceName}»`}
        </Button>
      </DialogFooter>
    </>
  );
}

function copySteps(rows: StepRow[]): StepRow[] {
  return rows.map((row) => ({ ...row, key: rowKey() }));
}

/** Шаги веса: «с N кг» — цена — доплата за каждый следующий кг; под ними — как это посчитается. */
function StepsEditor({ label, rows, onChange }: { label: string; rows: StepRow[]; onChange: (rows: StepRow[]) => void }) {
  const parsed = parseSteps(rows);
  const set = (key: string, patch: Partial<StepRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const addStep = () => {
    const last = Number(rows[rows.length - 1]?.weightText);
    onChange([...rows, stepRow(Number.isInteger(last) && last >= 1 ? last + 10 : null, null, 0)]);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[5.5rem_1fr_1fr_2rem] items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
        <span>С какого кг</span>
        <span>Цена</span>
        <span>+ за каждый следующий кг</span>
        <span />
        {rows.map((row, index) => (
          <StepFields
            key={row.key}
            label={`${label}, шаг ${index + 1}`}
            row={row}
            first={index === 0}
            onChange={(patch) => set(row.key, patch)}
            onRemove={rows.length > 1 && index > 0 ? () => onChange(rows.filter((item) => item.key !== row.key)) : null}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={addStep}>
          <Plus className="size-3.5" />
          Шаг веса
        </Button>
        {parsed.error ? (
          rows.some((row) => row.priceText !== "") && <span className="text-xs text-destructive">{parsed.error}</span>
        ) : (
          <span className="text-xs text-muted-foreground tabular-nums">
            {examples(parsed.steps)
              .map((item) => `${formatNumber(item.weight)} кг — ${formatPrice(item.price)}`)
              .join(" · ")}
          </span>
        )}
      </div>
      {!parsed.error && parsed.steps.length > 1 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {parsed.steps.map((_, index) => (
            <li key={index}>{stepLabel(parsed.steps, index)}</li>
          ))}
        </ul>
      )}
      {!parsed.error && parsed.steps.length === 1 && (
        <p className="text-xs text-muted-foreground">{stepLabel(parsed.steps, 0)}</p>
      )}
    </div>
  );
}

function StepFields({
  label,
  row,
  first,
  onChange,
  onRemove,
}: {
  label: string;
  row: StepRow;
  first: boolean;
  onChange: (patch: Partial<StepRow>) => void;
  onRemove: (() => void) | null;
}) {
  const field = "h-8 text-right text-sm tabular-nums";
  return (
    <>
      <Input
        aria-label={`${label}: с какого кг`}
        inputMode="numeric"
        value={row.weightText}
        disabled={first}
        title={first ? "Первый шаг — всегда с 1 кг: иначе лёгкие заказы останутся без цены" : undefined}
        onChange={(event) => onChange({ weightText: event.target.value.replace(/\D/g, "") })}
        className={field}
      />
      <Input
        aria-label={`${label}: цена`}
        inputMode="decimal"
        value={row.priceText}
        placeholder="40 000"
        onChange={(event) => onChange({ priceText: event.target.value })}
        className={field}
      />
      <Input
        aria-label={`${label}: доплата за каждый следующий кг`}
        inputMode="decimal"
        value={row.extraText}
        placeholder="0"
        onChange={(event) => onChange({ extraText: event.target.value })}
        className={field}
      />
      {onRemove ? (
        <Button size="icon-sm" variant="ghost" aria-label={`${label}: убрать`} onClick={onRemove}>
          <X className="size-4" />
        </Button>
      ) : (
        <span />
      )}
    </>
  );
}

const SELECT_CLASS =
  "h-8 min-w-40 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Город калькулятора: хабы сверху — их выбирают чаще всего. */
function CitySelect({
  label,
  cities,
  value,
  onChange,
}: {
  label: string;
  cities: CalculatorCity[] | null | undefined;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const hubs = (cities ?? []).filter((city) => city.isHub);
  const others = (cities ?? []).filter((city) => !city.isHub);
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      className={cn(SELECT_CLASS, value === null && "text-muted-foreground")}
    >
      <option value="">{cities ? "Город…" : "Загружаю города…"}</option>
      {hubs.length > 0 && (
        <optgroup label="Хабы">
          {hubs.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label="Остальные города">
          {others.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
