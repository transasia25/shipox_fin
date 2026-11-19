import { getTariffVersion } from "@/lib/backend/client";
import type { TariffVersionDetail } from "@/lib/backend/types";

/**
 * Цены планов, уже загруженные в этой вкладке.
 *
 * Многие клиенты считаются по одному плану (по умолчанию), а план загружается
 * от трети секунды до секунды — второй раз ждать незачем. Загрузка начинается
 * ещё при наведении на строку, поэтому к клику цены обычно уже здесь.
 *
 * Хранится недолго: тарифы могут поменять в калькуляторе или правкой.
 */
const TTL_MS = 5 * 60_000;

const cache = new Map<number, { promise: Promise<TariffVersionDetail>; at: number }>();

/** Цены версии плана: из памяти, если загружены недавно, иначе с сервера. */
export function loadVersion(versionId: number): Promise<TariffVersionDetail> {
  const entry = cache.get(versionId);
  if (entry && Date.now() - entry.at < TTL_MS) return entry.promise;
  const promise = getTariffVersion(versionId);
  cache.set(versionId, { promise, at: Date.now() });
  // Неудачную загрузку не запоминаем: следующий клик попробует снова.
  promise.catch(() => {
    if (cache.get(versionId)?.promise === promise) cache.delete(versionId);
  });
  return promise;
}

/** Начать загрузку заранее — ошибки молча: их покажет сам клик. */
export function prefetchVersion(versionId: number): void {
  loadVersion(versionId).catch(() => undefined);
}

/** Забыть загруженное: после правки цен или «Обновить из калькулятора». */
export function forgetVersions(versionId?: number): void {
  if (versionId === undefined) cache.clear();
  else cache.delete(versionId);
}
