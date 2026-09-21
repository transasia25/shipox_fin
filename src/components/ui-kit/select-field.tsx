"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
}

/** Единая обёртка над Select — чтобы все фильтры выглядели и работали одинаково. */
export function SelectField({
  value,
  onChange,
  options,
  placeholder = "Не выбрано",
  className,
  size = "default",
}: SelectFieldProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange((next as string | null) ?? "")}
      items={options}
    >
      <SelectTrigger size={size} className={cn("min-w-40", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
