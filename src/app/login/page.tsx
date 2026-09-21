"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn, Receipt, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthState, login as loginRequest, setupAdmin } from "@/lib/backend/client";
import { homeFor } from "@/components/layout/nav";
import { loadSession, signedIn, useSession } from "@/lib/session";

/**
 * Вход в систему.
 *
 * Пока в базе нет ни одного сотрудника, та же страница предлагает завести
 * администратора: иначе после установки в систему нельзя было бы попасть
 * иначе как через базу.
 */
export default function LoginPage() {
  const router = useRouter();
  const session = useSession();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAuthState()
      .then((state) => setNeedsSetup(state.needsSetup))
      .catch(() => setNeedsSetup(false));
  }, []);

  useEffect(() => {
    // У кладовщика дашборда нет — ведём каждого на его первый экран.
    if (session.status === "signed-in") router.replace(homeFor(session.user.role));
  }, [session, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = needsSetup
        ? await setupAdmin({ login, name, password })
        : await loginRequest({ login, password });
      signedIn(user);
      await loadSession(true);
      router.replace(homeFor(user.role));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Войти не удалось");
      setBusy(false);
    }
  };

  if (needsSetup === null || session.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Skeleton className="h-72 w-full max-w-sm" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-2 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Receipt className="size-5" />
          </div>
          <CardTitle className="text-lg">Shipox Finance</CardTitle>
          <p className="text-sm text-muted-foreground">
            {needsSetup
              ? "Первый запуск: заведите администратора — он потом добавит остальных."
              : "Войдите, чтобы продолжить."}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="login">Логин</Label>
              <Input
                id="login"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                autoFocus
                autoComplete="username"
                placeholder="dispatcher"
              />
            </div>

            {needsSetup && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Имя</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Азизов А."
                />
                <p className="text-xs text-muted-foreground">
                  Этим именем будут подписаны приёмки, сканы и рейсы.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={needsSetup ? "new-password" : "current-password"}
              />
              {needsSetup && (
                <p className="text-xs text-muted-foreground">Не короче восьми символов.</p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={busy || !login.trim() || !password || (needsSetup && !name.trim())}
            >
              {needsSetup ? <UserPlus className="size-4" /> : <LogIn className="size-4" />}
              {busy ? "Проверяю…" : needsSetup ? "Завести администратора" : "Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
