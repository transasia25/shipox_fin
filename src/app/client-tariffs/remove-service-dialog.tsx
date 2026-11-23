"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { removeTariffService } from "@/lib/backend/client";
import type { TariffRevisionResult, TariffVersionDetail } from "@/lib/backend/types";
import { ImpactNote, formatDayKey, type PlanImpact } from "./price-editor";

/** Услуги, у которых в версии плана есть цены. Цены «для любой услуги» — значит, все. */
export function servicesOfVersion(detail: TariffVersionDetail): Array<{ id: number; name: string }> {
  const ids = [...detail.zoneGrids.map((grid) => grid.serviceTypeId), ...detail.routeRules.map((rule) => rule.serviceTypeId)];
  const all = ids.includes(null);
  return [...detail.serviceTypes]
    .sort((a, b) => a.id - b.id)
    .filter((type) => all || ids.includes(type.id))
    .map((type) => ({ id: type.id, name: type.name }));
}

/**
 * Убрать услугу из плана клиента: с даты заказы этой услуги калькулятор не
 * считает. Тариф, который ещё не начал действовать, правится на месте.
 */
export function RemoveServiceDialog({
  open,
  onOpenChange,
  detail,
  earliest,
  impact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: TariffVersionDetail;
  earliest: string | null;
  impact: PlanImpact;
  onSaved: (result: TariffRevisionResult) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <RemoveServiceForm
            detail={detail}
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

function RemoveServiceForm({
  detail,
  earliest,
  impact,
  onCancel,
  onSaved,
}: {
  detail: TariffVersionDetail;
  earliest: string | null;
  impact: PlanImpact;
  onCancel: () => void;
  onSaved: (result: TariffRevisionResult) => void;
}) {
  const services = servicesOfVersion(detail);
  // Тариф ещё не начал действовать — по умолчанию правим его на месте, с той же даты.
  const pending = Boolean(detail.validFrom && earliest && detail.validFrom >= earliest);
  const [serviceTypeId, setServiceTypeId] = useState<number | null>(null);
  const [validFrom, setValidFrom] = useState(pending ? detail.validFrom! : (earliest ?? ""));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const service = services.find((item) => item.id === serviceTypeId) ?? null;
  const dateOk = Boolean(validFrom) && (!earliest || validFrom >= earliest);
  const inPlace = pending && validFrom === detail.validFrom;
  const last = services.length <= 1;
  const ready = service !== null && dateOk && note.trim().length >= 3 && !last && !saving;

  const save = async () => {
    if (!service) return;
    setSaving(true);
    try {
      const result = await removeTariffService(detail.versionId, {
        serviceTypeId: service.id,
        validFrom,
        note: note.trim(),
      });
      toast.success(`«${service.name}» убрана из плана с ${formatDayKey(validFrom)}`);
      onSaved(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось убрать услугу");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Убрать услугу из плана «{detail.planName}»</DialogTitle>
        <DialogDescription>
          С выбранного дня заказы этой услуги калькулятор считать не будет — в Shipox Finance они окажутся «без
          тарифа». Заказы, созданные раньше, остаются по прежним ценам.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {last ? (
          <p className="text-sm text-muted-foreground">
            В плане одна услуга — убрать её нельзя: в плане не останется ни одной цены.
          </p>
        ) : (
          <section className="space-y-1.5">
            <div className="text-sm font-medium">Какую услугу убрать</div>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Услуга">
              {services.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  role="radio"
                  aria-checked={serviceTypeId === item.id}
                  variant={serviceTypeId === item.id ? "default" : "outline"}
                  onClick={() => setServiceTypeId(item.id)}
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-[11rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="remove-service-from">Убрать с</Label>
            <Input
              id="remove-service-from"
              type="date"
              min={earliest ?? undefined}
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
              aria-invalid={!dateOk || undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="remove-service-note">Основание</Label>
            <Input
              id="remove-service-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="По договору этой услуги нет"
            />
          </div>
        </section>

        <p className={dateOk ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
          {!dateOk
            ? `Не раньше ${earliest ? formatDayKey(earliest) : "завтрашнего дня"}: заказы, созданные сегодня, уже посчитаны.`
            : inPlace
              ? `Тариф ещё не начал действовать (с ${formatDayKey(detail.validFrom!)}) — услуга уберётся из него сразу, ни один заказ это не задевает.`
              : `Будет новая версия плана с ${formatDayKey(validFrom)} без этой услуги.`}
        </p>

        <ImpactNote impact={impact} />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Отмена
        </Button>
        <Button variant="destructive" onClick={save} disabled={!ready}>
          {saving ? "Убираю…" : service ? `Убрать «${service.name}»` : "Убрать услугу"}
        </Button>
      </DialogFooter>
    </>
  );
}
