"use client";

import { useState } from "react";
import { KeyRound, Plus, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import {
  createUser,
  listUsers,
  listWarehouses,
  setUserPassword,
  updateUser,
} from "@/lib/backend/client";
import type { User, UserRole } from "@/lib/backend/types";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/session";

/** Что роль делает в системе — подсказка при заведении сотрудника. */
const ROLE_HINT: Record<UserRole, string> = {
  ADMIN: "Всё, включая сотрудников",
  DISPATCHER: "Межгород, перевозчики, склад",
  STOREKEEPER: "Приёмка и отправка на своём складе",
  ACCOUNTANT: "Курьеры, тарифы, начисления, выгрузки",
  VIEWER: "Только просмотр",
};

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as UserRole[]).map((role) => ({
  value: role,
  label: `${ROLE_LABEL[role]} — ${ROLE_HINT[role]}`,
}));

export default function UsersPage() {
  const users = useBackend(() => listUsers(), []);
  const warehouses = useBackend(() => listWarehouses(), []);
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState<User | null>(null);

  const warehouseOptions = [
    { value: "", label: "Без склада (офис)" },
    ...(warehouses.data ?? []).map((item) => ({ value: item.name, label: item.name })),
  ];

  const patch = async (user: User, change: Parameters<typeof updateUser>[1]) => {
    try {
      await updateUser(user.id, change);
      users.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось изменить сотрудника");
      users.reload();
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Пользователи"
        description="Кто входит в систему и что ему доступно. Имя сотрудника подписывает приёмки, сканы и рейсы."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Завести сотрудника
          </Button>
        }
      />

      {users.error ? (
        <ErrorState message={users.error} onRetry={users.reload} />
      ) : users.loading && !users.data ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="gap-0 overflow-x-auto py-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Сотрудник</th>
                <th className="px-2 py-2 text-left font-medium">Логин</th>
                <th className="px-2 py-2 text-left font-medium">Роль</th>
                <th className="px-2 py-2 text-left font-medium">Склад</th>
                <th className="px-2 py-2 text-left font-medium">Последний вход</th>
                <th className="px-2 py-2 text-left font-medium">Доступ</th>
                <th className="px-4 py-2 text-left font-medium">Пароль</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(users.data ?? []).map((user) => (
                <tr key={user.id} className={user.active ? undefined : "text-muted-foreground"}>
                  <td className="px-4 py-2 font-medium">{user.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{user.login}</td>
                  <td className="px-2 py-2">
                    <SelectField
                      value={user.role}
                      onChange={(role) => void patch(user, { role: role as UserRole })}
                      className="min-w-44"
                      options={ROLE_OPTIONS.map((option) => ({
                        ...option,
                        label: ROLE_LABEL[option.value],
                      }))}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <SelectField
                      value={user.warehouse ?? ""}
                      onChange={(warehouse) => void patch(user, { warehouse: warehouse || null })}
                      className="min-w-56"
                      options={warehouseOptions}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "ни разу"}
                    {user._count.sessions > 0 && (
                      <Badge variant="secondary" className="ml-1.5">
                        {user._count.sessions} устройств
                      </Badge>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Switch
                      checked={user.active}
                      onCheckedChange={(active) => void patch(user, { active })}
                      aria-label={`Доступ для ${user.name}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Button variant="ghost" size="sm" onClick={() => setPassword(user)}>
                      <KeyRound className="size-4" />
                      Сменить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <AddUserDialog
        open={adding}
        warehouses={warehouseOptions}
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false);
          users.reload();
        }}
      />

      <PasswordDialog user={password} onClose={() => setPassword(null)} />
    </div>
  );
}

function AddUserDialog({
  open,
  warehouses,
  onClose,
  onCreated,
}: {
  open: boolean;
  warehouses: Array<{ value: string; label: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("STOREKEEPER");
  const [warehouse, setWarehouse] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await createUser({ login, name, role, password, warehouse: warehouse || null });
      toast.success(`${name} заведён — передайте ему логин и пароль`);
      setLogin("");
      setName("");
      setPassword("");
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось завести сотрудника");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <UserCog className="size-4" />
          Новый сотрудник
        </DialogTitle>
        <DialogDescription>
          Пароль задаёте вы и передаёте лично — сотрудник сменит его сам.
        </DialogDescription>

        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Имя</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Азизов А."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-login">Логин</Label>
            <Input
              id="new-login"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="azizov"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Роль</Label>
            <SelectField
              value={role}
              onChange={(next) => setRole(next as UserRole)}
              options={ROLE_OPTIONS}
            />
          </div>
          {role === "STOREKEEPER" && (
            <div className="space-y-1.5">
              <Label>Склад</Label>
              <SelectField
                value={warehouse}
                onChange={setWarehouse}
                placeholder="Выберите склад"
                options={warehouses.filter((item) => item.value)}
              />
              <p className="text-xs text-muted-foreground">
                Кладовщик принимает и отправляет только со своего склада.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Пароль</Label>
            <Input
              id="new-password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="не короче восьми символов"
              autoComplete="off"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={
                busy ||
                !login.trim() ||
                !name.trim() ||
                password.length < 8 ||
                (role === "STOREKEEPER" && !warehouse)
              }
            >
              {busy ? "Завожу…" : "Завести"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await setUserPassword(user.id, password);
      toast.success(`Пароль для ${user.name} заменён — все его устройства вышли из системы`);
      setPassword("");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сменить пароль");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={user !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Новый пароль</DialogTitle>
        <DialogDescription>
          {user?.name}: после смены сотрудник войдёт заново на всех устройствах.
        </DialogDescription>
        <div className="space-y-3 pt-2">
          <Input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="не короче восьми символов"
            autoComplete="off"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={() => void submit()} disabled={busy || password.length < 8}>
              {busy ? "Меняю…" : "Сменить"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
