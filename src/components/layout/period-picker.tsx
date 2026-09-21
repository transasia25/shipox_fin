"use client";

import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { endOfDayISO, startOfDayISO, toDateInputValue } from "@/lib/format";
import { useFinanceStore } from "@/lib/store";

const PRESETS = [
  { label: "Сегодня", days: 0 },
  { label: "7 дней", days: 6 },
  { label: "30 дней", days: 29 },
];

/**
 * Глобальный период. Все экраны считают выручку, начисления и долг в его
 * границах, поэтому он живёт в шапке, а не внутри каждой страницы.
 */
export function PeriodPicker() {
  const period = useFinanceStore((s) => s.period);
  const setPeriod = useFinanceStore((s) => s.setPeriod);

  const applyPreset = (days: number) => {
    const from = new Date();
    from.setDate(from.getDate() - days);
    setPeriod({ from: startOfDayISO(from), to: endOfDayISO(new Date()) });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CalendarDays className="size-4 text-muted-foreground" />
      <Input
        type="date"
        value={toDateInputValue(period.from)}
        onChange={(e) => e.target.value && setPeriod({ ...period, from: startOfDayISO(e.target.value) })}
        className="h-8 w-[9.5rem]"
        aria-label="Начало периода"
      />
      <span className="text-muted-foreground">—</span>
      <Input
        type="date"
        value={toDateInputValue(period.to)}
        onChange={(e) => e.target.value && setPeriod({ ...period, to: endOfDayISO(e.target.value) })}
        className="h-8 w-[9.5rem]"
        aria-label="Конец периода"
      />
      <div className="flex items-center gap-1">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => applyPreset(preset.days)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
