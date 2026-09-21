"use client";

import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * На каком складе стоит это устройство.
 *
 * Кладовщику склад задан в учётной записи, и настройка ему не нужна. Она
 * остаётся для офиса: админ или диспетчер, зайдя помочь, выбирает склад здесь.
 * Имя больше не хранится — действия подписывает тот, кто вошёл.
 */
interface WarehouseDeviceState {
  warehouse: string | null;
  configure: (warehouse: string) => void;
}

export const useWarehouseDevice = create<WarehouseDeviceState>()(
  persist(
    (set) => ({
      warehouse: null,
      configure: (warehouse) => set({ warehouse }),
    }),
    {
      name: "shipox-warehouse-device",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({ warehouse: state.warehouse }),
    },
  ),
);

/** Настройка восстановлена из localStorage — до этого экран не знает, настроено ли устройство. */
export function useWarehouseDeviceHydrated(): boolean {
  const hydrated = useSyncExternalStore(
    (onChange) => useWarehouseDevice.persist.onFinishHydration(onChange),
    () => useWarehouseDevice.persist.hasHydrated(),
    () => false,
  );

  useEffect(() => {
    if (!hydrated) void useWarehouseDevice.persist.rehydrate();
  }, [hydrated]);

  return hydrated;
}
