"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { TARIFF_RULES } from "@/data/tariff-rules";
import type { DateRange, PayoutCalc, PayoutRegister, TariffRule } from "@/lib/types";

/**
 * Изменяемое состояние платформы.
 *
 * В MVP роль базы данных играет localStorage — это позволяет провести живую
 * демонстрацию (изменил тариф, пересчитал заказ, утвердил реестр) без бэкенда.
 * При интеграции эти действия становятся вызовами API, а форма состояния
 * остаётся прежней.
 *
 * Начисления по плечам хранятся замороженными в данных заказа. Пересчёт —
 * явная операция: правка тарифа не переписывает закрытые периоды задним числом.
 */

/** Пересчитанные начисления: id заказа → id плеча → расчёт. */
export type RecalcOverrides = Record<string, Record<string, PayoutCalc | null>>;

/** По умолчанию — последние семь суток по местному времени. */
function defaultPeriod(): DateRange {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

interface FinanceState {
  period: DateRange;
  rules: TariffRule[];
  registers: PayoutRegister[];
  overrides: RecalcOverrides;

  setPeriod: (period: DateRange) => void;

  upsertRule: (rule: TariffRule) => void;
  removeRule: (id: string) => void;
  toggleRule: (id: string, active: boolean) => void;
  resetRules: () => void;

  applyRecalc: (orderId: string, payouts: Record<string, PayoutCalc | null>) => void;
  clearRecalc: (orderId: string) => void;

  saveRegister: (register: PayoutRegister) => void;
  setRegisterStatus: (id: string, status: PayoutRegister["status"]) => void;
  removeRegister: (id: string) => void;
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set) => ({
      period: defaultPeriod(),
      rules: TARIFF_RULES,
      registers: [],
      overrides: {},

      setPeriod: (period) => set({ period }),

      upsertRule: (rule) =>
        set((state) => {
          const index = state.rules.findIndex((r) => r.id === rule.id);
          if (index === -1) return { rules: [...state.rules, rule] };
          const rules = [...state.rules];
          rules[index] = rule;
          return { rules };
        }),

      removeRule: (id) => set((state) => ({ rules: state.rules.filter((r) => r.id !== id) })),

      toggleRule: (id, active) =>
        set((state) => ({
          rules: state.rules.map((r) => (r.id === id ? { ...r, active } : r)),
        })),

      resetRules: () => set({ rules: TARIFF_RULES, overrides: {} }),

      applyRecalc: (orderId, payouts) =>
        set((state) => ({ overrides: { ...state.overrides, [orderId]: payouts } })),

      clearRecalc: (orderId) =>
        set((state) => {
          const overrides = { ...state.overrides };
          delete overrides[orderId];
          return { overrides };
        }),

      saveRegister: (register) =>
        set((state) => {
          const index = state.registers.findIndex((r) => r.id === register.id);
          if (index === -1) return { registers: [register, ...state.registers] };
          const registers = [...state.registers];
          registers[index] = register;
          return { registers };
        }),

      setRegisterStatus: (id, status) =>
        set((state) => ({
          registers: state.registers.map((r) => (r.id === id ? { ...r, status } : r)),
        })),

      removeRegister: (id) =>
        set((state) => ({ registers: state.registers.filter((r) => r.id !== id) })),
    }),
    {
      name: "shipox-finance",
      storage: createJSONStorage(() => localStorage),
      // Гидратация вручную после монтирования — иначе первый клиентский рендер
      // разойдётся с серверным.
      skipHydration: true,
      partialize: (state) => ({
        period: state.period,
        rules: state.rules,
        registers: state.registers,
        overrides: state.overrides,
      }),
    },
  ),
);
