"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { NumberField } from "@/components/ui-kit/number-field";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField, type SelectOption } from "@/components/ui-kit/select-field";
import { LegTypeBadge, NoTariffBadge } from "@/components/ui-kit/status-badge";
import { CITIES, DISTRICTS, zoneName } from "@/data/zones";
import { useLookups, useOrders } from "@/hooks/use-data";
import { formatAmount, formatMoney, formatWeight, plural, toDateInputValue } from "@/lib/format";
import { COURIER_GROUP_LABEL, LEG_TYPE_HINT, LEG_TYPE_LABEL } from "@/lib/labels";
import { useFinanceStore } from "@/lib/store";
import { applyRule, findRule, legContext, type LegContext } from "@/lib/tariff/engine";
import type { Leg, LegType, Order, TariffRule } from "@/lib/types";
import { cn } from "@/lib/utils";

const LEG_TYPE_OPTIONS: SelectOption[] = (
  Object.keys(LEG_TYPE_LABEL) as LegType[]
).map((type) => ({ value: type, label: LEG_TYPE_LABEL[type] }));

const ZONE_OPTIONS: SelectOption[] = [
  { value: "", label: "Любая зона" },
  ...CITIES.map((c) => ({ value: c.id, label: `Город: ${c.name}` })),
  ...DISTRICTS.map((d) => ({ value: d.id, label: `Район: ${d.name}` })),
];

function blankRule(): TariffRule {
  return {
    id: `tr-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    priority: 0,
    active: true,
    legType: "pickup",
    match: {},
    formula: { base: 0, perKg: 0, includedKg: 0, perPlace: 0, includedPlaces: 0, perKm: 0 },
    effectiveFrom: new Date().toISOString(),
    effectiveTo: null,
  };
}

export default function TariffRulePage({ params }: PageProps<"/demo/tariffs/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const rules = useFinanceStore((s) => s.rules);
  const upsertRule = useFinanceStore((s) => s.upsertRule);
  const removeRule = useFinanceStore((s) => s.removeRule);
  const period = useFinanceStore((s) => s.period);

  const isNew = id === "new";
  const existing = rules.find((r) => r.id === id);
  const [draft, setDraft] = useState<TariffRule>(() => existing ?? blankRule());

  const { orders } = useOrders({ from: period.from, to: period.to });
  const { couriersById, clients } = useLookups();

  const clientOptions: SelectOption[] = useMemo(
    () => [{ value: "", label: "Любой клиент" }, ...clients.map((c) => ({ value: c.id, label: c.name }))],
    [clients],
  );

  /** Набор правил с учётом правки — на нём считается и предпросмотр, и влияние. */
  const draftRules = useMemo(
    () => [...rules.filter((r) => r.id !== draft.id), draft],
    [rules, draft],
  );

  /** Все плечи выбранного типа за период — база для предпросмотра и оценки влияния. */
  const candidateLegs = useMemo(() => {
    const result: Array<{ order: Order; leg: Leg; ctx: LegContext }> = [];
    for (const order of orders) {
      for (const leg of order.legs) {
        if (leg.type !== draft.legType) continue;
        result.push({ order, leg, ctx: legContext(leg, order, couriersById.get(leg.courierId)) });
      }
    }
    return result;
  }, [orders, draft.legType, couriersById]);

  const impact = useMemo(() => {
    let matched = 0;
    let before = 0;
    let after = 0;
    for (const { leg, ctx } of candidateLegs) {
      const winner = findRule(ctx, draftRules);
      if (winner?.id !== draft.id) continue;
      matched += 1;
      before += leg.payout?.amount ?? 0;
      after += applyRule(draft, ctx).amount;
    }
    return { matched, before, after, total: candidateLegs.length };
  }, [candidateLegs, draftRules, draft]);

  /** Пример плеча для предпросмотра — по умолчанию первое подходящее. */
  const sampleOptions = useMemo(
    () =>
      candidateLegs.slice(0, 60).map(({ order, leg }) => ({
        value: leg.id,
        label: `${order.orderNumber} · ${zoneName(leg.fromZoneId)} → ${zoneName(leg.toZoneId)} · ${formatWeight(order.weightKg)}`,
      })),
    [candidateLegs],
  );
  const [sampleId, setSampleId] = useState("");
  const sample =
    candidateLegs.find(({ leg }) => leg.id === sampleId) ??
    candidateLegs.find(({ ctx }) => findRule(ctx, draftRules)?.id === draft.id) ??
    candidateLegs[0];

  const preview = useMemo(() => {
    if (!sample) return null;
    const winner = findRule(sample.ctx, draftRules);
    return {
      calc: applyRule(draft, sample.ctx),
      winsHere: winner?.id === draft.id,
      winner,
      current: sample.leg.payout,
    };
  }, [sample, draft, draftRules]);

  const patchMatch = (patch: Partial<TariffRule["match"]>) =>
    setDraft((d) => ({ ...d, match: { ...d.match, ...patch } }));
  const patchFormula = (patch: Partial<TariffRule["formula"]>) =>
    setDraft((d) => ({ ...d, formula: { ...d.formula, ...patch } }));

  const save = () => {
    if (!draft.name.trim()) {
      toast.error("Укажите название правила");
      return;
    }
    upsertRule({ ...draft, name: draft.name.trim() });
    toast.success(isNew ? "Правило создано" : "Правило сохранено");
    router.push("/demo/tariffs");
  };

  return (
    <div className="space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" render={<Link href="/demo/tariffs" />}>
          <ArrowLeft className="size-4" />
          Тарификатор
        </Button>
        <PageHeader
          title={isNew ? "Новое правило тарифа" : draft.name || "Правило тарифа"}
          description={LEG_TYPE_HINT[draft.legType]}
          actions={
            <>
              {!isNew && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    removeRule(draft.id);
                    toast.info("Правило удалено");
                    router.push("/demo/tariffs");
                  }}
                >
                  <Trash2 className="size-4" />
                  Удалить
                </Button>
              )}
              <Button onClick={save}>
                <Save className="size-4" />
                Сохранить
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Основное</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Название</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Например: Транзит Ташкент → Джизак"
                  className="h-8"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Тип плеча</Label>
                  <SelectField
                    value={draft.legType}
                    onChange={(v) => setDraft((d) => ({ ...d, legType: v as LegType }))}
                    options={LEG_TYPE_OPTIONS}
                    className="w-full"
                  />
                </div>
                <NumberField
                  label="Приоритет"
                  value={draft.priority}
                  onChange={(v) => setDraft((d) => ({ ...d, priority: v ?? 0 }))}
                />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Статус</Label>
                  <label className="flex h-8 cursor-pointer items-center gap-2 text-sm">
                    <Switch
                      checked={draft.active}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v === true }))}
                    />
                    {draft.active ? "Действует" : "Выключено"}
                  </label>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Действует с</Label>
                  <Input
                    type="date"
                    className="h-8"
                    value={toDateInputValue(draft.effectiveFrom)}
                    onChange={(e) =>
                      e.target.value &&
                      setDraft((d) => ({
                        ...d,
                        effectiveFrom: new Date(e.target.value).toISOString(),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Действует по (не обязательно)</Label>
                  <Input
                    type="date"
                    className="h-8"
                    value={draft.effectiveTo ? toDateInputValue(draft.effectiveTo) : ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        effectiveTo: e.target.value ? new Date(e.target.value).toISOString() : null,
                      }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Когда применять</CardTitle>
              <p className="text-sm text-muted-foreground">
                Незаполненное условие означает «любое значение». Чем больше условий задано, тем выше
                приоритет правила при равном значении приоритета.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Откуда</Label>
                  <SelectField
                    value={draft.match.fromZoneId ?? ""}
                    onChange={(v) => patchMatch({ fromZoneId: v || undefined })}
                    options={ZONE_OPTIONS}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Куда</Label>
                  <SelectField
                    value={draft.match.toZoneId ?? ""}
                    onChange={(v) => patchMatch({ toZoneId: v || undefined })}
                    options={ZONE_OPTIONS}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Группа исполнителя</Label>
                  <SelectField
                    value={draft.match.courierGroup ?? ""}
                    onChange={(v) =>
                      patchMatch({ courierGroup: (v || undefined) as "staff" | "partner" | undefined })
                    }
                    options={[
                      { value: "", label: "Любая" },
                      { value: "staff", label: COURIER_GROUP_LABEL.staff },
                      { value: "partner", label: COURIER_GROUP_LABEL.partner },
                    ]}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Клиент</Label>
                  <SelectField
                    value={draft.match.clientId ?? ""}
                    onChange={(v) => patchMatch({ clientId: v || undefined })}
                    options={clientOptions}
                    className="w-full"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-4">
                <NumberField
                  label="Вес от"
                  suffix="кг"
                  optional
                  value={draft.match.weightMin}
                  onChange={(v) => patchMatch({ weightMin: v })}
                />
                <NumberField
                  label="Вес до"
                  suffix="кг"
                  optional
                  value={draft.match.weightMax}
                  onChange={(v) => patchMatch({ weightMax: v })}
                />
                <NumberField
                  label="Мест от"
                  optional
                  value={draft.match.placesMin}
                  onChange={(v) => patchMatch({ placesMin: v })}
                />
                <NumberField
                  label="Мест до"
                  optional
                  value={draft.match.placesMax}
                  onChange={(v) => patchMatch({ placesMax: v })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Сколько начислить</CardTitle>
              <p className="text-sm text-muted-foreground">
                База + за килограммы сверх включённых + за места сверх включённых + за километры,
                затем ограничение снизу и сверху.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <NumberField
                  label="База"
                  suffix="сум"
                  value={draft.formula.base}
                  onChange={(v) => patchFormula({ base: v ?? 0 })}
                />
                <NumberField
                  label="За километр"
                  suffix="сум"
                  value={draft.formula.perKm}
                  onChange={(v) => patchFormula({ perKm: v ?? 0 })}
                />
                <div />
                <NumberField
                  label="За килограмм"
                  suffix="сум"
                  value={draft.formula.perKg}
                  onChange={(v) => patchFormula({ perKg: v ?? 0 })}
                />
                <NumberField
                  label="Включено килограммов"
                  value={draft.formula.includedKg}
                  onChange={(v) => patchFormula({ includedKg: v ?? 0 })}
                />
                <div />
                <NumberField
                  label="За место"
                  suffix="сум"
                  value={draft.formula.perPlace}
                  onChange={(v) => patchFormula({ perPlace: v ?? 0 })}
                />
                <NumberField
                  label="Включено мест"
                  value={draft.formula.includedPlaces}
                  onChange={(v) => patchFormula({ includedPlaces: v ?? 0 })}
                />
                <div />
                <NumberField
                  label="Минимум"
                  suffix="сум"
                  optional
                  value={draft.formula.min}
                  onChange={(v) => patchFormula({ min: v })}
                />
                <NumberField
                  label="Максимум"
                  suffix="сум"
                  optional
                  value={draft.formula.max}
                  onChange={(v) => patchFormula({ max: v })}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Предпросмотр расчёта</CardTitle>
              <p className="text-sm text-muted-foreground">
                На реальном плече из выбранного периода.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {sampleOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  За выбранный период нет плеч типа «{LEG_TYPE_LABEL[draft.legType]}».
                </p>
              ) : (
                <>
                  <SelectField
                    value={sample ? sample.leg.id : ""}
                    onChange={setSampleId}
                    options={sampleOptions}
                    className="w-full"
                  />

                  {sample && preview && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <LegTypeBadge type={sample.leg.type} />
                          <span className="text-muted-foreground">
                            {zoneName(sample.leg.fromZoneId)} → {zoneName(sample.leg.toZoneId)}
                          </span>
                        </div>
                        <div className="mt-1.5 text-xs text-muted-foreground">
                          {formatWeight(sample.order.weightKg)} ·{" "}
                          {sample.order.places} {plural(sample.order.places, "место", "места", "мест")} ·{" "}
                          {sample.leg.distanceKm} км ·{" "}
                          {couriersById.get(sample.leg.courierId)?.fullName ?? "—"}
                        </div>
                      </div>

                      <dl className="space-y-1 text-sm">
                        {preview.calc.breakdown.map((line, index) => (
                          <div key={index} className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">{line.label}</dt>
                            <dd className="tabular-nums">{formatAmount(line.value)}</dd>
                          </div>
                        ))}
                        <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-medium">
                          <dt>По этому правилу</dt>
                          <dd className="tabular-nums">{formatMoney(preview.calc.amount)}</dd>
                        </div>
                        <div className="flex justify-between gap-3 text-muted-foreground">
                          <dt>Сейчас начислено</dt>
                          <dd className="tabular-nums">
                            {preview.current ? formatMoney(preview.current.amount) : <NoTariffBadge />}
                          </dd>
                        </div>
                      </dl>

                      {!preview.winsHere && (
                        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                          На этом плече правило не применится: побеждает{" "}
                          <strong>{preview.winner?.name ?? "другое правило"}</strong>. Поднимите
                          приоритет или уточните условия.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Что изменится</CardTitle>
              <p className="text-sm text-muted-foreground">
                Если применить правило ко всем плечам выбранного периода.
              </p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Плеч попадает под правило</span>
                <span className="tabular-nums">
                  {impact.matched} из {impact.total}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Начислено сейчас</span>
                <span className="tabular-nums">{formatMoney(impact.before)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Станет по новому правилу</span>
                <span className="tabular-nums">{formatMoney(impact.after)}</span>
              </div>
              <Separator />
              <div className="flex justify-between gap-3 font-medium">
                <span>Разница</span>
                <span
                  className={cn(
                    "tabular-nums",
                    impact.after - impact.before > 0
                      ? "text-destructive"
                      : impact.after - impact.before < 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "",
                  )}
                >
                  {impact.after - impact.before > 0 ? "+" : ""}
                  {formatMoney(impact.after - impact.before)}
                </span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Сохранение правила не переписывает уже зафиксированные начисления — пересчёт
                выполняется вручную в карточке заказа или при формировании реестра.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
