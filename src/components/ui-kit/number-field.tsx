"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Числовое поле формы. Пустое значение означает «не задано» — для условий
 * тарифа это принципиально: «вес до 30 кг» и «вес не ограничен» разные вещи.
 */
export function NumberField({
  label,
  value,
  onChange,
  optional = false,
  placeholder,
  suffix,
  className,
  min,
  step,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  optional?: boolean;
  placeholder?: string;
  suffix?: string;
  className?: string;
  min?: number;
  step?: number;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">
        {label}
        {suffix && <span className="ml-1 opacity-70">{suffix}</span>}
      </Label>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        value={value === undefined ? "" : String(value)}
        placeholder={placeholder ?? (optional ? "не задано" : "0")}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(optional ? undefined : 0);
            return;
          }
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
        className="h-8"
      />
    </div>
  );
}
