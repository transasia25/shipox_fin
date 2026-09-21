"use client";

import { useSyncExternalStore } from "react";
import { getSession, logout as logoutRequest } from "@/lib/backend/client";
import type { Session, UserRole } from "@/lib/backend/types";

/**
 * Кто вошёл.
 *
 * Сессия живёт в куке бэкенда, поэтому фронт её не хранит — он лишь один раз
 * спрашивает «кто я» и держит ответ в памяти вкладки. Перезагрузка страницы
 * спрашивает заново: так выход на другом устройстве не оставляет призрака.
 */

export type SessionState =
  { status: "loading" } | { status: "guest" } | { status: "signed-in"; user: Session };

/** Один объект на все вызовы: React требует стабильный снимок состояния. */
const LOADING: SessionState = { status: "loading" };

let state: SessionState = LOADING;
let pending: Promise<SessionState> | null = null;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  state = next;
  for (const listener of listeners) listener();
}

/** Спрашивает бэкенд, кто вошёл. Повторные вызовы ждут первый запрос. */
export function loadSession(force = false): Promise<SessionState> {
  if (!force && pending) return pending;
  pending = getSession()
    .then((user) => {
      const next: SessionState = { status: "signed-in", user };
      set(next);
      return next;
    })
    .catch(() => {
      const next: SessionState = { status: "guest" };
      set(next);
      return next;
    });
  return pending;
}

if (typeof window !== "undefined") {
  window.addEventListener("sf:unauthorized", () => {
    if (state.status !== "guest") sessionExpired();
  });
}

export function useSession(): SessionState {
  const snapshot = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      if (state.status === "loading") void loadSession();
      return () => listeners.delete(onChange);
    },
    () => state,
    () => LOADING,
  );
  return snapshot;
}

/** Сессия закончилась: запрос вернул 401. Экраны уйдут на форму входа. */
export function sessionExpired() {
  pending = null;
  set({ status: "guest" });
}

export function signedIn(user: Session) {
  pending = Promise.resolve({ status: "signed-in", user } as SessionState);
  set({ status: "signed-in", user });
}

export async function signOut() {
  try {
    await logoutRequest();
  } finally {
    sessionExpired();
  }
}

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Администратор",
  DISPATCHER: "Диспетчер",
  STOREKEEPER: "Кладовщик",
  ACCOUNTANT: "Бухгалтер",
  VIEWER: "Наблюдатель",
};

/** Наблюдатель только смотрит: кнопки сохранения ему недоступны. */
export function canEdit(user: Session | null | undefined): boolean {
  return Boolean(user) && user!.role !== "VIEWER";
}
