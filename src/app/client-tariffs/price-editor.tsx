"use client";

import { useMemo, useState } from "react";
import { Lock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { reviseTariffPrices } from "@/lib/backend/client";
import type {
  TariffRevision,
  TariffRevisionChange,
  TariffRevisionEntry,
  TariffRevisionPrices,
  TariffRevisionResult,
  TariffServicePrices,
  TariffServiceRemoval,
  TariffZoneGrid,
} from "@/lib/backend/types";
import { formatDate, formatDateTime, formatNumber, formatPrice, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  isChanged,
  parseMoney,
  priceAt,
  withAnchorPrice,
  withExtraPerKg,
  type EditableCell,
  type PriceChangeInput,
  type RuleDraft,
  type RuleOrigin,
} from "./price-editing";
import { surchargeWeightLabel } from "./surcharge-lines";

/** Запись журнала «убрана услуга», а не изменённая цена. */
function isServiceRemoval(entry: TariffRevisionEntry): entry is TariffServiceRemoval {
  return (entry as TariffServiceRemoval).kind === "REMOVE_SERVICE";
}

/** Запись журнала «цены услуги заданы заново». */
function isServicePrices(entry: TariffRevisionEntry): entry is TariffServicePrices {
  return (entry as TariffServicePrices).kind === "SERVICE_PRICES";
}

/** `2026-12-01` → «01.12.2026». */
export function formatDayKey(dateKey: string): string {
  return formatDate(`${dateKey}T12:00:00`);
}

/**
 * Поле суммы. Пока в фокусе — показывает то, что набрано; вне фокуса —
 * значение из черновика, отформатированное как в таблице. Значение уходит
 * наверх, только когда набранное — правильная сумма.
 */
function MoneyInput({
  value,
  onValue,
  label,
  className,
}: {
  value: number;
  onValue: (value: number) => void;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const invalid = focused && parseMoney(text) === null;

  return (
    <Input
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={focused ? text : formatPrice(value)}
      onFocus={(event) => {
        setText(formatPrice(value));
        setFocused(true);
        event.currentTarget.select();
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = parseMoney(event.target.value);
        if (parsed !== null) onValue(parsed);
      }}
      className={cn("h-7 px-2 text-right tabular-nums", className)}
    />
  );
}

/** Ячейка сетки цен в режиме правки. */
export function EditablePriceCell({
  cell,
  drafts,
  onDraft,
  fallback,
  zone,
  weightLabel,
}: {
  cell: EditableCell;
  drafts: Map<number, RuleDraft>;
  onDraft: (origin: RuleOrigin, draft: RuleDraft) => void;
  /** Как ячейка выглядит без правки — для заблокированных. */
  fallback: React.ReactNode;
  zone: number;
  weightLabel: string;
}) {
  if (cell.kind === "locked") {
    return (
      <div className="flex items-start justify-end gap-1" title={cell.reason}>
        <Lock className="mt-1 size-3 shrink-0 text-muted-foreground" aria-label={cell.reason} />
        {fallback}
      </div>
    );
  }

  const { origin } = cell;
  const draft = drafts.get(origin.ruleId);
  const changed = isChanged(origin, draft);

  if (cell.kind === "derived") {
    const price = priceAt(origin, draft, cell.weight);
    const before = priceAt(origin, undefined, cell.weight);
    return (
      <div
        className={cn("space-y-0.5 rounded-md px-1.5 py-1", changed && "bg-amber-50 dark:bg-amber-950/30")}
        title="Цену даёт правило из строки выше — правьте её там"
      >
        <div className="font-medium whitespace-nowrap text-muted-foreground tabular-nums">{formatPrice(price)}</div>
        <div className="text-xs whitespace-nowrap text-muted-foreground">по строке выше</div>
        {changed && price !== before && (
          <div className="text-xs whitespace-nowrap text-muted-foreground line-through tabular-nums">
            {formatPrice(before)}
          </div>
        )}
      </div>
    );
  }

  const current = draft ?? { basePrice: origin.basePrice, extraPerKg: origin.extraPerKg };
  const anchorPrice = priceAt(origin, draft, origin.anchorWeight);
  const beforePrice = priceAt(origin, undefined, origin.anchorWeight);
  return (
    <div
      className={cn(
        "ml-auto w-fit space-y-1 rounded-md p-1",
        changed && "bg-amber-50 ring-1 ring-amber-500/50 dark:bg-amber-950/40",
      )}
    >
      <MoneyInput
        value={anchorPrice}
        onValue={(value) => onDraft(origin, withAnchorPrice(origin, draft, value))}
        label={`Зона ${zone}, ${weightLabel}: цена`}
        className="w-28"
      />
      {origin.perUnit ? (
        <div className="text-right text-xs text-muted-foreground">за место</div>
      ) : (
        <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
          +
          <MoneyInput
            value={current.extraPerKg}
            onValue={(value) => onDraft(origin, withExtraPerKg(origin, draft, value))}
            label={`Зона ${zone}, ${weightLabel}: доплата за кг`}
            className="h-6 w-20 text-xs"
          />
          /кг
        </div>
      )}
      {changed && (
        <div className="text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          было {formatPrice(beforePrice)}
          {!origin.perUnit && ` +${formatPrice(origin.extraPerKg)}/кг`}
        </div>
      )}
    </div>
  );
}

/** Строка подтверждения: где цена и как она меняется. */
export interface ChangeSummary {
  ruleId: number;
  service: string;
  zone: number;
  weight: string;
  before: string;
  after: string;
}

/** Где в сетках стоит якорь правила — для подписи «Зона 2, 4 кг». */
export function summarizeChanges(
  grids: TariffZoneGrid[],
  layouts: Array<Map<string, EditableCell>>,
  drafts: Map<number, RuleDraft>,
  serviceName: (id: number | null) => string,
): ChangeSummary[] {
  const summaries: ChangeSummary[] = [];
  const seen = new Set<number>();
  grids.forEach((grid, gridIndex) => {
    for (const [key, cell] of layouts[gridIndex]) {
      if (cell.kind !== "anchor" || seen.has(cell.origin.ruleId)) continue;
      const draft = drafts.get(cell.origin.ruleId);
      if (!isChanged(cell.origin, draft)) continue;
      seen.add(cell.origin.ruleId);
      const [rowIndex, columnIndex] = key.split(":").map(Number);
      const row = grid.rows[rowIndex];
      const origin = cell.origin;
      const show = (d: RuleDraft | undefined) =>
        formatPrice(priceAt(origin, d, origin.anchorWeight)) +
        (origin.perUnit ? " за место" : ` +${formatPrice((d ?? origin).extraPerKg)}/кг`);
      summaries.push({
        ruleId: origin.ruleId,
        service: serviceName(grid.serviceTypeId),
        zone: grid.zones[columnIndex],
        weight: surchargeWeightLabel(row.weightFrom, row.weightTo),
        before: show(undefined),
        after: show(draft),
      });
    }
  });
  return summaries;
}

/** Кого заденет правка: клиенты, которых сейчас считают по этому плану. */
export interface PlanImpact {
  /** План по умолчанию: по нему же считаются все новые клиенты без своего плана. */
  isDefault: boolean;
  clients: string[];
}

function clientList(names: string[]): string {
  const shown = names.slice(0, 8).join(", ");
  return names.length > 8 ? `${shown} и ещё ${formatNumber(names.length - 8)}` : shown;
}

/**
 * Предупреждение о масштабе правки. План по умолчанию правится для всех,
 * у кого нет своего плана, — это самое заметное, что можно поменять.
 */
export function ImpactNote({ impact }: { impact: PlanImpact }) {
  const count = impact.clients.length;
  const clients = `${formatNumber(count)} ${plural(count, "клиент", "клиента", "клиентов")}`;
  if (!impact.isDefault && count <= 1) {
    return count === 1 ? (
      <p className="text-xs text-muted-foreground">По этому плану считается только {impact.clients[0]}.</p>
    ) : null;
  }
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {impact.isDefault ? (
          <>
            <div className="font-medium">Это план по умолчанию</div>
            <div>
              Сейчас по нему считаются {clients}
              {count > 0 && `: ${clientList(impact.clients)}`}. Кроме них — каждый новый клиент, пока его
              не свяжут со своим планом. Новые цены будут у всех.
            </div>
          </>
        ) : (
          <>
            <div className="font-medium">По этому плану считаются {clients}</div>
            <div>{clientList(impact.clients)}. Новые цены будут у всех.</div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Панель сохранения: с какого дня новые цены и почему. Сохраняет только после
 * подтверждения со списком «было → стало».
 */
export function RevisionBar({
  versionId,
  versionValidFrom,
  earliest,
  changes,
  summaries,
  onCancel,
  onSaved,
  impact,
}: {
  versionId: number;
  /** Дата начала правленой версии — у ещё не вступившей правка идёт на месте. */
  versionValidFrom: string | null;
  earliest: string | null;
  changes: PriceChangeInput[];
  summaries: ChangeSummary[];
  onCancel: () => void;
  onSaved: (result: TariffRevisionResult) => void;
  impact: PlanImpact;
}) {
  const pending = Boolean(versionValidFrom && earliest && versionValidFrom >= earliest);
  const [validFrom, setValidFrom] = useState(pending ? versionValidFrom! : (earliest ?? ""));
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const dateOk = Boolean(validFrom) && (!earliest || validFrom >= earliest);
  const fixInPlace = pending && validFrom === versionValidFrom;
  const ready = changes.length > 0 && dateOk && note.trim().length >= 3;

  const save = async () => {
    setSaving(true);
    try {
      const result = await reviseTariffPrices(versionId, { validFrom, note: note.trim(), changes });
      toast.success(
        fixInPlace
          ? `Цены с ${formatDayKey(validFrom)} исправлены`
          : `Новые цены с ${formatDayKey(validFrom)} сохранены`,
      );
      setConfirming(false);
      onSaved(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить цены");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-10 -mx-6 space-y-3 border-t border-border bg-card/95 px-6 py-3 backdrop-blur">
      <ImpactNote impact={impact} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-sm">
          <div className="font-medium">
            {changes.length === 0
              ? "Цены не изменены"
              : `Изменено: ${formatNumber(changes.length)} ${plural(changes.length, "цена", "цены", "цен")}`}
          </div>
          <div className="text-xs text-muted-foreground">Поменяйте цены в ячейках сетки выше</div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="revision-valid-from" className="text-xs text-muted-foreground">
            Новые цены действуют с
          </Label>
          <Input
            id="revision-valid-from"
            type="date"
            min={earliest ?? undefined}
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            aria-invalid={!dateOk || undefined}
            className="h-8 w-40"
          />
        </div>
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="revision-note" className="text-xs text-muted-foreground">
            Почему меняете
          </Label>
          <Input
            id="revision-note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ошибка в зоне 2: по договору 46 000"
            className="h-8"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Отменить
          </Button>
          <Button onClick={() => setConfirming(true)} disabled={!ready || saving}>
            Сохранить…
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {!dateOk
          ? `Новые цены — не раньше ${earliest ? formatDayKey(earliest) : "завтрашнего дня"}: заказы, созданные сегодня, уже посчитаны.`
          : fixInPlace
            ? `Эти цены ещё не вступили в силу — они исправятся на месте, с ${formatDayKey(validFrom)}.`
            : `Будет создана новая версия плана с ${formatDayKey(validFrom)}. Заказы, созданные раньше, и при пересчёте останутся по прежним ценам.`}
      </p>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {fixInPlace ? "Исправить цены" : "Новые цены"}
              {impact.isDefault ? " плана по умолчанию" : ""} с {validFrom ? formatDayKey(validFrom) : "—"}
            </DialogTitle>
            <DialogDescription>
              {fixInPlace
                ? "Цены этой версии ещё не действуют — по ним не посчитан ни один заказ."
                : `В калькуляторе появится новая версия плана. Заказы, созданные до ${formatDayKey(validFrom)}, останутся по прежним ценам. Изменение сразу увидят все, кто считает по этому плану, включая калькулятор.`}
            </DialogDescription>
          </DialogHeader>
          <ImpactNote impact={impact} />
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Где</th>
                  <th className="px-3 py-1.5 text-right font-medium">Было</th>
                  <th className="px-3 py-1.5 text-right font-medium">Станет</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((item) => (
                  <tr key={item.ruleId} className="border-t border-border align-top">
                    <td className="px-3 py-1.5">
                      Зона {item.zone}, {item.weight}
                      <div className="text-xs text-muted-foreground">{item.service}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                      {item.before}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {item.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">Причина:</span> {note.trim()}
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={saving} />}>
              Вернуться к правке
            </DialogClose>
            <Button onClick={save} disabled={saving}>
              {saving ? "Сохраняю…" : "Сохранить цены"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function pricesLabel(prices: TariffRevisionPrices): string {
  if (prices.pricePerUnit !== null) return `${formatPrice(prices.pricePerUnit)} за место`;
  const base = prices.basePrice === null ? "—" : formatPrice(prices.basePrice);
  return prices.extraPerKg ? `${base} +${formatPrice(prices.extraPerKg)}/кг` : base;
}

/** Кто, когда и что менял в ценах плана. */
export function RevisionHistory({
  revisions,
  serviceName,
}: {
  revisions: TariffRevision[];
  serviceName: (id: number | null) => string;
}) {
  const sorted = useMemo(
    () => [...revisions].sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
    [revisions],
  );
  if (sorted.length === 0) return null;
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">История изменений цен</h3>
        <p className="text-xs text-muted-foreground">
          Правки и новые тарифы из Shipox Finance. Цены, изменённые прямо в калькуляторе, здесь не видны.
        </p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sorted.map((revision) => {
          const inPlace = revision.previousVersionId === revision.newVersionId;
          // Новый тариф клиента: в журнале без списка цен — их источник в пояснении.
          const created = revision.changes.length === 0;
          const removed = revision.changes.filter(isServiceRemoval);
          const rebuilt = revision.changes.filter(isServicePrices);
          const prices = revision.changes.filter(
            (change): change is TariffRevisionChange => !isServiceRemoval(change) && !isServicePrices(change),
          );
          const from = formatDate(revision.validFrom);
          return (
            <li key={revision.id} className="px-3 py-2 text-sm">
              <details>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span>
                      {created
                        ? `Тариф заведён с ${from}`
                        : removed.length > 0
                          ? `Убрана услуга с ${from}: ${removed.map((item) => item.serviceName).join(", ")}`
                          : rebuilt.length > 0
                            ? `Цены «${rebuilt.map((item) => item.serviceName).join("», «")}» заданы заново с ${from}`
                            : inPlace
                            ? `Исправлены цены с ${from}`
                            : `Новые цены с ${from}`}
                      {prices.length > 0 && (
                        <span className="text-muted-foreground">
                          {" · "}
                          {formatNumber(prices.length)} {plural(prices.length, "цена", "цены", "цен")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {revision.changedBy}, {formatDateTime(revision.changedAt)}
                    </span>
                  </div>
                  {revision.note && <div className="text-xs text-muted-foreground">{revision.note}</div>}
                </summary>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {rebuilt.map((item) => (
                    <li key={item.serviceTypeId} className="text-muted-foreground">
                      {item.zones.length > 0 && `Шаги веса по зонам ${item.zones.join(", ")}`}
                      {item.zones.length > 0 && item.routes.length > 0 && "; "}
                      {item.routes.length > 0 && `отдельно: ${item.routes.join(", ")}`}
                    </li>
                  ))}
                  {prices.map((change) => (
                    <li key={change.ruleId} className="flex flex-wrap gap-x-2 tabular-nums">
                      <span className="text-muted-foreground">
                        {serviceName(change.serviceTypeId)}, зона {change.zone ?? "—"}, от{" "}
                        {formatNumber(change.weightFrom)} кг:
                      </span>
                      <span className="line-through opacity-70">{pricesLabel(change.before)}</span>
                      <span>→ {pricesLabel(change.after)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
