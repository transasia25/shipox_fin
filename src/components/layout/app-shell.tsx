"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { AppSidebar, NavLinks } from "./app-sidebar";
import { PeriodPicker } from "./period-picker";
import { canOpen, homeFor } from "./nav";
import { useStoreHydrated } from "@/hooks/use-data";
import { ROLE_LABEL, signOut, useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/backend/types";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useStoreHydrated();
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();

  // Гостя отправляем на форму входа: сам экран входа оболочку не надевает.
  useEffect(() => {
    if (session.status === "guest" && pathname !== "/login") router.replace("/login");
  }, [session.status, pathname, router]);

  // С закрытого для роли экрана уводим на её первый доступный: так по старой
  // ссылке из чата человек попадает в работу, а не в тупик.
  useEffect(() => {
    if (session.status !== "signed-in") return;
    if (!canOpen(pathname, session.user.role)) router.replace(homeFor(session.user.role));
  }, [session, pathname, router]);

  if (pathname === "/login") return <>{children}</>;
  if (session.status !== "signed-in") {
    return (
      <div className="min-h-screen px-4 py-6 lg:px-6">
        <ShellSkeleton />
      </div>
    );
  }

  const user = session.user;
  const allowed = canOpen(pathname, user.role);

  return (
    <div className="flex min-h-screen">
      <AppSidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur lg:px-6">
          <MobileNav role={user.role} />
          <div className="flex flex-wrap items-center gap-3">
            <PeriodPicker />
            <div className="flex items-center gap-2 border-l border-border pl-3 text-sm">
              <span className="hidden sm:inline">
                {user.name}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {ROLE_LABEL[user.role]}
                  {user.warehouse ? ` · ${user.warehouse}` : ""}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Выйти"
                title="Выйти"
                onClick={() => void signOut()}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">
          {!allowed ? <NoAccess /> : hydrated ? children : <ShellSkeleton />}
        </main>
      </div>
    </div>
  );
}

/** Экран чужой роли: честно говорим об этом вместо пустой страницы. */
function NoAccess() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-border p-6 text-center">
      <div className="text-base font-medium">Раздел закрыт для вашей роли</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Если доступ нужен по работе, попросите администратора поменять роль.
      </p>
    </div>
  );
}

/**
 * Меню на узком экране. Боковая панель там скрыта, а без меню планшет на
 * складе не добрался бы до приёмки иначе как по прямой ссылке.
 */
function MobileNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Открыть меню" />}>
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="gap-2 pt-12">
          <SheetTitle className="px-4 text-sm font-semibold">Shipox Finance</SheetTitle>
          <NavLinks
            pathname={pathname}
            role={role}
            className="px-2"
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
      <span className="text-sm font-medium">Shipox Finance</span>
    </div>
  );
}

/**
 * Пока стор не восстановлен из localStorage, показываем скелет: иначе первый
 * рендер использовал бы дефолтные тарифы и цифры на мгновение «прыгали» бы.
 */
function ShellSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
