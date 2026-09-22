import {
  Download,
  LayoutDashboard,
  Package,
  PackageCheck,
  Coins,
  Forklift,
  Route,
  ScanBarcode,
  ScanSearch,
  Truck,
  TruckElectric,
  Wallet,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/backend/types";

/**
 * Пункты меню — только экраны с реальными данными.
 *
 * Дебиторка, реестры выплат и плечи заказа остаются в коде (ветка `/demo`), но
 * не выведены в меню: под них у бэкенда пока нет данных, и показывать
 * вымышленные цифры рядом с настоящими нельзя.
 */
/** Кто видит пункт меню. Пустой список — видят все вошедшие. */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
}

const OFFICE: UserRole[] = ["ADMIN", "ACCOUNTANT", "VIEWER"];
const TRANSIT: UserRole[] = ["ADMIN", "DISPATCHER", "VIEWER"];
const WAREHOUSE: UserRole[] = ["ADMIN", "DISPATCHER", "STOREKEEPER"];

export const NAV: NavItem[] = [
  // На дашборде состояние выгрузок и последние файлы — это работа офиса.
  {
    href: "/dashboard",
    label: "Дашборд",
    icon: LayoutDashboard,
    roles: ["ADMIN", "ACCOUNTANT", "DISPATCHER", "VIEWER"],
  },
  { href: "/orders", label: "Заказы", icon: Package },
  { href: "/warehouse/receive", label: "Приёмка на складе", icon: ScanBarcode, roles: WAREHOUSE },
  { href: "/warehouse/transit", label: "Отправка в транзит", icon: PackageCheck, roles: WAREHOUSE },
  { href: "/transit/dispatch", label: "Отправка машин", icon: Forklift, roles: TRANSIT },
  { href: "/warehouse/scans", label: "История действий", icon: ScanSearch, roles: WAREHOUSE },
  {
    href: "/couriers",
    label: "Курьеры",
    icon: Truck,
    roles: ["ADMIN", "ACCOUNTANT", "DISPATCHER", "STOREKEEPER", "VIEWER"],
  },
  { href: "/courier-payouts", label: "Начисления курьерам", icon: Wallet, roles: OFFICE },
  { href: "/courier-tariffs", label: "Тарифы курьеров", icon: Coins, roles: OFFICE },
  { href: "/transit", label: "Межгород", icon: Route, roles: TRANSIT },
  { href: "/carriers", label: "Перевозчики", icon: TruckElectric, roles: TRANSIT },
  { href: "/clients", label: "Клиенты и расчёты", icon: Users, roles: OFFICE },
  { href: "/exports", label: "Выгрузки", icon: Download, roles: OFFICE },
  { href: "/users", label: "Пользователи", icon: UserCog, roles: ["ADMIN"] },
];

/** Пункты, доступные роли: меню и проверка прямых ссылок берут их отсюда. */
export function navFor(role: UserRole | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV.filter((item) => !item.roles || item.roles.includes(role));
}

/** Экран, с которого роль начинает рабочий день. */
const HOME: Partial<Record<UserRole, string>> = {
  STOREKEEPER: "/warehouse/receive",
  DISPATCHER: "/transit/dispatch",
};

/** Куда вести после входа: рабочий экран роли, иначе первый доступный. */
export function homeFor(role: UserRole | null | undefined): string {
  if (!role) return "/login";
  return HOME[role] ?? navFor(role)[0]?.href ?? "/login";
}

/** Открыт ли экран этой роли — по тому же списку, что и меню. */
export function canOpen(pathname: string, role: UserRole | null | undefined): boolean {
  const item = [...NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((entry) => isNavActive(pathname, entry.href));
  if (!item) return true;
  return navFor(role).includes(item);
}

export function isNavActive(pathname: string, href: string): boolean {
  const matches = (item: string) => pathname === item || pathname.startsWith(`${item}/`);
  if (!matches(href)) return false;
  // Побеждает более точный пункт: на `/transit/dispatch` подсвечивается
  // «Отправка машин», а не «Межгород».
  return !NAV.some(
    (item) => item.href !== href && item.href.length > href.length && matches(item.href),
  );
}
