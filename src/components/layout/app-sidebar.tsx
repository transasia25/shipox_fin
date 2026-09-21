"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavActive, navFor } from "./nav";
import type { UserRole } from "@/lib/backend/types";

export function AppSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Receipt className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Shipox Finance</div>
          <div className="text-xs text-muted-foreground">Финансы доставки</div>
        </div>
      </div>

      <NavLinks pathname={pathname} role={role} className="flex-1 px-2 py-2" />

      <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        Заказы и курьеры — из Shipox,
        <br />
        города и тарифы клиентов — из Supabase.
      </div>
    </aside>
  );
}

export function NavLinks({
  pathname,
  role,
  className,
  onNavigate,
}: {
  pathname: string;
  role: UserRole;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className={cn("space-y-0.5", className)}>
      {navFor(role).map((item) => {
        const active = isNavActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
