"use client";

import { useEffect, useState } from "react";

/**
 * Загрузка демо-данных для экранов ветки `/demo`.
 *
 * Состояние загрузки выводится из того, совпадает ли ключ уже полученных
 * данных с текущим: переключать его вручную в начале эффекта значило бы
 * вызывать лишний каскадный рендер на каждый запрос.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], initial: T) {
  const key = JSON.stringify(deps);
  const [loaded, setLoaded] = useState<{ key: string; data: T }>({ key: "", data: initial });

  useEffect(() => {
    let cancelled = false;

    void load().then((result) => {
      if (!cancelled) setLoaded({ key, data: result });
    });

    return () => {
      cancelled = true;
    };
    // `load` — новая функция на каждый рендер, поэтому перезапрос определяется
    // явным списком deps, а не самой функцией.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data: loaded.data, loading: loaded.key !== key };
}
