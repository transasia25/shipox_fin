"use client";

import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type { Courier } from "@/lib/backend/types";
import { cn } from "@/lib/utils";

interface CourierComboboxProps {
  couriers: Courier[];
  value: Courier | null;
  onChange: (courier: Courier | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/** Схлопывает пробелы: в Shipox имена заведены с двойными пробелами. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Курьера ищут по имени, позывному, телефону или id Shipox — что у кладовщика под рукой. */
function matchesCourier(courier: Courier, query: string): boolean {
  const needle = normalize(query);
  if (!needle) return true;
  return [courier.name, courier.referenceId, courier.phone, courier.shipoxDriverId]
    .filter((field): field is string => Boolean(field))
    .some((field) => normalize(field).includes(needle));
}

/** Выбор курьера с поиском: в списке из десятков имён прокруткой не найти. */
export function CourierCombobox({
  couriers,
  value,
  onChange,
  placeholder = "Найдите курьера по имени или позывному",
  className,
  disabled,
}: CourierComboboxProps) {
  return (
    <Combobox.Root
      items={couriers}
      value={value}
      onValueChange={(next) => onChange(next ?? null)}
      itemToStringLabel={(courier: Courier) => courier.name}
      isItemEqualToValue={(a: Courier, b: Courier) => a.id === b.id}
      filter={matchesCourier}
      disabled={disabled}
    >
      <div className={cn("relative", className)}>
        <Combobox.Input
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-input bg-transparent pr-9 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        />
        <Combobox.Trigger
          aria-label="Открыть список курьеров"
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground"
        >
          <ChevronDownIcon className="size-4" />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="max-h-80 w-(--anchor-width) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Combobox.Empty className="px-2 py-3 text-sm text-muted-foreground empty:hidden">
              Курьер не найден
            </Combobox.Empty>
            <Combobox.List>
              {(courier: Courier) => (
                <Combobox.Item
                  key={courier.id}
                  value={courier}
                  className="relative flex cursor-default items-start gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{courier.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[courier.referenceId, courier.warehouse, courier.phone]
                        .filter(Boolean)
                        .join(" · ") || "без позывного и склада"}
                    </div>
                  </div>
                  <Combobox.ItemIndicator className="absolute top-2 right-2">
                    <CheckIcon className="size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
