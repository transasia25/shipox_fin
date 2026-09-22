"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useMemo, useState } from "react";
import { ArrowLeft, ScanLine, Truck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui-kit/error-state";
import { PageHeader } from "@/components/ui-kit/page-header";
import { SelectField } from "@/components/ui-kit/select-field";
import { useBackend } from "@/hooks/use-backend";
import {
  attachTripLegs,
  createTransitTrip,
  listCarriers,
  listPendingLegGroups,
  listPendingLegs,
  listPendingWarehouses,
  listReadyRuns,
  listTransitTrips,
  listWarehouses,
} from "@/lib/backend/client";
import type { PendingLeg, PendingLegGroup, ReadyRun, TransitDirection } from "@/lib/backend/types";
import {
  endOfDayISO,
  formatDate,
  formatDateTime,
  formatNumber,
  formatWeight,
  plural,
  startOfDayISO,
  toDateInputValue,
} from "@/lib/format";
import { CARRIER_KIND_LABEL, legLabel, shortWarehouse } from "@/lib/transit";
import { useWarehouseDevice, useWarehouseDeviceHydrated } from "@/lib/warehouse-device";

/**
 * Ключ рейса: направление и сторона.
 *
 * Рейс — это ход машины целиком: туда она раздаёт заказы в ПВЗ по пути,
 * обратно — собирает их, заходя в каждый ПВЗ.
 */
function runKey(routeId: string, direction: TransitDirection | string): string {
  return [routeId, direction].join("|");
}

/** Сколько заказов показываем за раз: на самом длинном рейсе их около полутора тысяч. */
const PAGE = 2000;

/** Весь рейс целиком, а не один склад: так диспетчер собирает обратную машину. */
const ALL_WAREHOUSES = "*";

/** Лист склада отличается от общего списка рейсов счётом пробитого. */
function isReadyRun(run: ReadyRun | PendingLegGroup): run is ReadyRun {
  return "scannedInPeriod" in run;
}

/** Мест в партии: в машину грузят коробки, а заказ бывает многоместным. */
function boxes(legs: PendingLeg[]): number {
  return legs.reduce((sum, leg) => sum + Math.max(leg.order.pieceCount, 1), 0);
}

/**
 * Параметры адреса читаются на клиенте, поэтому экран обёрнут в Suspense:
 * без него сборка Next спотыкается на useSearchParams.
 */
export default function TransitDispatchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <DispatchScreen />
    </Suspense>
  );
}

function DispatchScreen() {
  const params = useSearchParams();
  const deviceHydrated = useWarehouseDeviceHydrated();
  const deviceWarehouse = useWarehouseDevice((s) => s.warehouse);

  const warehouses = useBackend(() => listWarehouses(), []);
  const carriers = useBackend(() => listCarriers({ active: true }), []);

  // Склад берётся из настройки устройства (она же на приёмке), но экраном
  // пользуются и из офиса — выбранный руками перекрывает её.
  const [pickedWarehouse, setPickedWarehouse] = useState(params.get("warehouse") ?? "");
  const warehouse = pickedWarehouse || (deviceHydrated ? (deviceWarehouse ?? "") : "");
  const allWarehouses = warehouse === ALL_WAREHOUSES;

  const [day, setDay] = useState(() => toDateInputValue(new Date().toISOString()));
  const [selectedRun, setSelectedRun] = useState<string>(() => {
    const routeId = params.get("routeId");
    const direction = params.get("direction");
    return routeId && direction ? runKey(routeId, direction) : "";
  });
  const [tripId, setTripId] = useState("");

  // Пробитое сканером и есть готовый лист: он отмечен сразу, а кладовщик
  // снимает лишнее и добавляет непробитое, если коробка всё же в машине.
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const [carrierId, setCarrierId] = useState(params.get("carrierId") ?? "");
  const [driverName, setDriverName] = useState(params.get("driverName") ?? "");
  const [vehicleNumber, setVehicleNumber] = useState(params.get("vehicleNumber") ?? "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const period = { from: startOfDayISO(day), to: endOfDayISO(day) };
  // Со складом лист строится по его сканам, «все склады рейса» — по всему
  // ждущему грузу: пробитое там разбросано по дороге.
  const runs = useBackend<Array<ReadyRun | PendingLegGroup>>(
    () =>
      allWarehouses
        ? listPendingLegGroups()
        : warehouse
          ? listReadyRuns({ warehouse, ...period })
          : Promise.resolve([]),
    [warehouse, day],
  );

  const [routeId, direction] = selectedRun ? selectedRun.split("|") : ["", ""];

  const legs = useBackend(
    () =>
      (allWarehouses || warehouse) && routeId && direction
        ? listPendingLegs({
            routeId,
            direction: direction as TransitDirection,
            warehouse: allWarehouses ? undefined : warehouse,
            limit: PAGE,
          })
        : Promise.resolve([]),
    [selectedRun, warehouse],
  );

  /** Где ждёт груз этого рейса — вся дорога сразу, в порядке движения. */
  const cargo = useBackend(
    () =>
      routeId && direction
        ? listPendingWarehouses({ routeId, direction: direction as TransitDirection })
        : Promise.resolve([]),
    [selectedRun],
  );

  /** Рейсы этого направления рядом с выбранным днём — в них можно догрузить. */
  const trips = useBackend(
    () =>
      routeId && direction
        ? listTransitTrips({
            routeId,
            direction: direction as TransitDirection,
            from: startOfDayISO(new Date(new Date(day).getTime() - 2 * 24 * 3_600_000)),
            to: endOfDayISO(new Date(new Date(day).getTime() + 24 * 3_600_000)),
          })
        : Promise.resolve([]),
    [selectedRun, day],
  );

  const rows = useMemo(() => legs.data ?? [], [legs.data]);

  /**
   * Лист строго за выбранный день.
   *
   * Коробки на складе копятся, и вчерашнее непробитое никуда не делось — но в
   * листе за сегодня его быть не должно: кладовщик грузит машину по тому, что
   * пробили сегодня. Сканы других дней лежат в своих днях — там их и
   * отправляют, переключив дату.
   */
  const parts = useMemo(() => {
    const from = new Date(period.from).getTime();
    const to = new Date(period.to).getTime();
    const scanned: PendingLeg[] = [];
    const otherDays: PendingLeg[] = [];
    const unscanned: PendingLeg[] = [];
    for (const leg of rows) {
      if (!leg.scan) unscanned.push(leg);
      else {
        const at = new Date(leg.scan.at).getTime();
        if (at < from || at > to) otherDays.push(leg);
        else scanned.push(leg);
      }
    }
    return { scanned, otherDays, unscanned };
  }, [rows, period.from, period.to]);

  const { scanned, otherDays, unscanned } = parts;
  /** Весь видимый лист: сканы чужих дней в отметки «выбрать все» не идут. */
  const visible = useMemo(() => [...scanned, ...unscanned], [scanned, unscanned]);

  const runCards = useMemo(
    () =>
      (runs.data ?? []).map((item) =>
        isReadyRun(item)
          ? {
              key: runKey(item.route?.id ?? "", item.direction),
              route: item.route,
              direction: item.direction,
              fromWarehouse: item.fromWarehouse,
              toWarehouse: item.toWarehouse,
              // Только сканы выбранного дня: остаток с прошлых дней считается
              // отдельно, иначе вчерашние коробки раздувают сегодняшнее число.
              ready: item.scannedInPeriod,
              tail: item.unscanned,
            }
          : {
              key: runKey(item.route?.id ?? "", item.direction),
              route: item.route,
              direction: item.direction,
              fromWarehouse: item.fromWarehouse,
              toWarehouse: item.toWarehouse,
              // Весь рейс: пробитое разбросано по складам, поэтому счёт общий.
              ready: null,
              tail: item.orders,
            },
      ),
    [runs.data],
  );

  // Рейс, у которого в этот день нет ни пробитого, ни непробитого хвоста,
  // в лист не попадает: его груз пробили в другие дни и отправляют оттуда.
  const shownRuns = useMemo(
    () => runCards.filter((item) => item.ready === null || item.ready > 0 || item.tail > 0),
    [runCards],
  );

  const run = runCards.find((item) => item.key === selectedRun);
  const trip = trips.data?.find((item) => item.id === tripId) ?? null;

  const checked = useMemo(() => {
    const next = new Set(scanned.filter((leg) => !unpicked.has(leg.id)).map((leg) => leg.id));
    for (const leg of visible) if (picked.has(leg.id)) next.add(leg.id);
    return next;
  }, [scanned, visible, picked, unpicked]);

  // Перевозчик, за которым закреплено это направление, идёт первым: список из
  // двенадцати, и каждый раз искать нужного неудобно.
  const carrierOptions = useMemo(() => {
    const all = carriers.data ?? [];
    const onRoute = all.filter((carrier) => carrier.routes.some((item) => item.id === routeId));
    const rest = all.filter((carrier) => !onRoute.includes(carrier));
    return [...onRoute, ...rest].map((carrier) => ({
      value: carrier.id,
      label: `${CARRIER_KIND_LABEL[carrier.kind]} ${carrier.name.replace(/^(ООО|ИП)\s+/, "")}`,
    }));
  }, [carriers.data, routeId]);

  const resetPicks = () => {
    setPicked(new Set());
    setUnpicked(new Set());
  };

  const selectRun = (value: string) => {
    setSelectedRun(value);
    setTripId("");
    resetPicks();
  };

  const toggleMany = (items: PendingLeg[], value: boolean) => {
    const ids = items.map((leg) => leg.id);
    setPicked((current) => {
      const next = new Set(current);
      for (const id of ids)
        if (value) next.add(id);
        else next.delete(id);
      return next;
    });
    setUnpicked((current) => {
      const next = new Set(current);
      for (const id of ids)
        if (value) next.delete(id);
        else next.add(id);
      return next;
    });
  };

  const toggle = (legId: string, value: boolean) =>
    toggleMany([{ id: legId } as PendingLeg], value);

  const reload = () => {
    legs.reload();
    runs.reload();
    cargo.reload();
    trips.reload();
  };

  const send = async () => {
    if (!routeId) return;
    const legIds = [...checked];
    setSending(true);
    try {
      if (trip) {
        const result = await attachTripLegs(trip.id, { legIds });
        toast.success(`Догружено: ${formatNumber(result.orders)} заказов`);
      } else {
        const result = await createTransitTrip({
          carrierId,
          routeId,
          direction: direction as TransitDirection,
          departedAt: new Date(`${day}T12:00:00`).toISOString(),
          driverName: driverName.trim() || undefined,
          vehicleNumber: vehicleNumber.trim() || undefined,
          note: note.trim() || undefined,
          legIds,
        });
        toast.success(
          legIds.length === 0
            ? "Рейс заведён — заказы догрузят по пути"
            : `Машина отправлена: ${formatNumber(result.orders)} заказов`,
        );
        setNote("");
        setDriverName("");
        setVehicleNumber("");
      }
      resetPicks();
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отправить машину");
    } finally {
      setSending(false);
    }
  };

  const checkedWeight = visible
    .filter((leg) => checked.has(leg.id))
    .reduce((sum, leg) => sum + leg.order.weight, 0);

  /** Порядок складов погрузки — как их проходит машина. */
  const loadOrder = useMemo(() => {
    const order = new Map<string, number>();
    (cargo.data ?? []).forEach((row, index) => order.set(row.warehouse, index));
    return order;
  }, [cargo.data]);

  // Туда машина раздаёт заказы, поэтому важно, где заказ сходит; обратно —
  // собирает, и кладовщику важнее, где он садится.
  const groupBy: "to" | "from" = direction === "REVERSE" ? "from" : "to";

  const canSend = trip ? checked.size > 0 : Boolean(carrierId);
  const sendLabel = trip
    ? `Догрузить в рейс (${checked.size})`
    : checked.size === 0
      ? "Запланировать рейс"
      : `Отправить машину (${checked.size})`;

  return (
    <div className="space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" render={<Link href="/transit" />}>
          <ArrowLeft className="size-4" />
          Межгород
        </Button>
        <PageHeader
          title="Отправка машин"
          description="Лист строго за выбранный день: заказы, пробитые сканером в этот день на приёмке и на отправке в транзит. Пробитое в другие дни лежит в листах своих дней. Обратную машину грузят несколько ПВЗ по пути — выберите «Все склады рейса», чтобы собрать её целиком."
        />
      </div>

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Склад</Label>
            <SelectField
              value={warehouse}
              onChange={(value) => {
                setPickedWarehouse(value);
                selectRun("");
              }}
              placeholder={warehouses.loading ? "Загружаю склады…" : "Выберите склад"}
              className="min-w-72"
              options={[
                { value: ALL_WAREHOUSES, label: "Все склады рейса" },
                ...(warehouses.data ?? []).map((item) => ({ value: item.name, label: item.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="day" className="text-xs text-muted-foreground">
              День
            </Label>
            <Input
              id="day"
              type="date"
              value={day}
              onChange={(event) => {
                // Другой день — другой лист: отметки от прошлого не переносим.
                setDay(event.target.value);
                resetPicks();
              }}
              className="h-8 w-40"
            />
          </div>
        </div>
      </Card>

      {!warehouse ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Выберите склад</CardTitle>
            <p className="text-sm text-muted-foreground">
              Машины уходят с конкретного склада. «Все склады рейса» показывают всю дорогу сразу —
              так собирают обратную машину.
            </p>
          </CardHeader>
        </Card>
      ) : runs.error ? (
        <ErrorState message={runs.error} onRetry={runs.reload} />
      ) : runs.loading && !runs.data ? (
        <Skeleton className="h-32" />
      ) : shownRuns.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {runCards.length > 0
                ? "За этот день грузить нечего"
                : "С этого склада машины не уходят"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {runCards.length > 0
                ? "Коробки этого склада пробили в другие дни — переключите дату, и лист появится."
                : "Ни одно направление не начинается здесь, либо все заказы уже распределены."}
            </p>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shownRuns.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => selectRun(item.key)}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                item.key === selectedRun
                  ? "border-foreground bg-accent/60"
                  : "border-border hover:bg-accent/40"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Badge variant="secondary">{item.route?.code ?? "?"}</Badge>
                <span title={`${item.fromWarehouse} → ${item.toWarehouse}`}>
                  {legLabel(item.fromWarehouse, item.toWarehouse)}
                </span>
              </div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums">
                {formatNumber(item.ready ?? item.tail)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {item.ready === null ? "ждут распределения" : "пробито за день"}
                </span>
              </div>
              {item.ready !== null && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  не сканировались {formatNumber(item.tail)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {selectedRun && (cargo.data?.length ?? 0) > 0 && (
        <Card className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1.5 p-3 text-sm">
          <span className="text-xs text-muted-foreground">Груз этого рейса:</span>
          {(cargo.data ?? []).map((row) => (
            <button
              key={row.warehouse}
              type="button"
              onClick={() => {
                setPickedWarehouse(row.warehouse);
                resetPicks();
              }}
              className={`rounded-md px-2 py-0.5 hover:bg-accent ${
                row.warehouse === warehouse ? "bg-accent font-medium" : ""
              }`}
              title={row.warehouse}
            >
              {shortWarehouse(row.warehouse)}{" "}
              <span className="tabular-nums">{formatNumber(row.scanned + row.unscanned)}</span>
              {row.scanned > 0 && (
                <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-400">
                  ✓{formatNumber(row.scanned)}
                </span>
              )}
            </button>
          ))}
        </Card>
      )}

      {selectedRun && (
        <Card className="gap-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Рейс</Label>
              <SelectField
                value={tripId}
                onChange={setTripId}
                placeholder="Новый рейс"
                className="min-w-72"
                options={[
                  { value: "", label: "Новый рейс" },
                  ...(trips.data ?? []).map((item) => ({
                    value: item.id,
                    label: `${item.carrier.name.replace(/^(ООО|ИП)\s+/, "")}${
                      item.vehicleNumber ? ` · ${item.vehicleNumber}` : ""
                    } · ${formatDate(item.departedAt)} · ${item._count.legs} заказов`,
                  })),
                ]}
              />
            </div>

            {!trip && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Перевозчик</Label>
                  <SelectField
                    value={carrierId}
                    onChange={setCarrierId}
                    placeholder={carriers.loading ? "Загружаю…" : "Выберите перевозчика"}
                    className="min-w-64"
                    options={carrierOptions}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="driver-name" className="text-xs text-muted-foreground">
                    Водитель
                  </Label>
                  <Input
                    id="driver-name"
                    value={driverName}
                    onChange={(event) => setDriverName(event.target.value)}
                    placeholder="Имя за рулём"
                    className="h-8 w-48"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle-number" className="text-xs text-muted-foreground">
                    Номер машины
                  </Label>
                  <Input
                    id="vehicle-number"
                    value={vehicleNumber}
                    onChange={(event) => setVehicleNumber(event.target.value)}
                    placeholder="01 123 ABC"
                    className="h-8 w-36"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="trip-note" className="text-xs text-muted-foreground">
                    Комментарий
                  </Label>
                  <Input
                    id="trip-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Номер накладной"
                    className="h-8 w-48"
                  />
                </div>
              </>
            )}
          </div>
          {trip && (
            <p className="text-xs text-muted-foreground">
              Догрузка в рейс {trip.carrier.name}
              {trip.driverName ? ` · водитель ${trip.driverName}` : ""}
              {trip.vehicleNumber ? ` · ${trip.vehicleNumber}` : ""} — перевозчик и машина у рейса
              уже указаны.
            </p>
          )}
        </Card>
      )}

      {!selectedRun ? null : legs.error ? (
        <ErrorState message={legs.error} onRetry={legs.reload} />
      ) : legs.loading && !legs.data ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="gap-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {run?.route && <Badge variant="secondary">{run.route.code}</Badge>}
              <span
                className="font-medium"
                title={run ? `${run.fromWarehouse} → ${run.toWarehouse}` : undefined}
              >
                {run ? legLabel(run.fromWarehouse, run.toWarehouse) : "—"}
              </span>
              <span className="text-muted-foreground">
                пробито за день {formatNumber(scanned.length)} ({formatNumber(boxes(scanned))}{" "}
                мест) · не сканировались {formatNumber(unscanned.length)}
                {rows.length === PAGE && " (показаны первые — отправьте их, появятся следующие)"}
                {checked.size > 0 &&
                  ` · отмечено ${formatNumber(checked.size)} на ${formatWeight(checkedWeight)}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleMany(visible, checked.size !== visible.length)}
                disabled={visible.length === 0}
              >
                {checked.size === visible.length && visible.length > 0
                  ? "Снять все"
                  : "Выбрать все"}
              </Button>
              <Button onClick={send} disabled={sending || !canSend}>
                <Truck className="size-4" />
                {sending ? "Отправляю…" : sendLabel}
              </Button>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {otherDays.length > 0
                ? `За этот день на рейсе ничего не пробили: ${formatNumber(otherDays.length)} ${plural(otherDays.length, "заказ пробит", "заказа пробито", "заказов пробито")} в другие дни — переключите дату.`
                : "На этом рейсе заказов не осталось."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <LegTable
                title={`Пробито ${formatDate(period.from)}`}
                hint={
                  otherDays.length > 0
                    ? `в другие дни пробито ещё ${formatNumber(otherDays.length)} — они в листах своих дней`
                    : undefined
                }
                legs={scanned}
                groupBy={groupBy}
                loadOrder={loadOrder}
                checked={checked}
                toggle={toggle}
                toggleMany={toggleMany}
                empty="В этот день на рейсе сканером ничего не пробили."
              />
              {unscanned.length > 0 && (
                <LegTable
                  title="Не сканировались"
                  hint="Идут этим рейсом по маршруту, но сканером их не пробили. Отправлять — только если коробка действительно в машине."
                  legs={unscanned}
                  groupBy={groupBy}
                  loadOrder={loadOrder}
                  checked={checked}
                  toggle={toggle}
                  toggleMany={toggleMany}
                />
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * Заказы одной части листа, разбитые по складам.
 *
 * Туда машина раздаёт коробки — важно, где заказ сходит. Обратно собирает —
 * важнее, где он садится, и группы идут в порядке движения машины.
 */
function LegTable({
  title,
  hint,
  legs,
  groupBy,
  loadOrder,
  checked,
  toggle,
  toggleMany,
  empty,
}: {
  title: string;
  hint?: string;
  legs: PendingLeg[];
  groupBy: "to" | "from";
  loadOrder: Map<string, number>;
  checked: Set<string>;
  toggle: (legId: string, value: boolean) => void;
  toggleMany: (legs: PendingLeg[], value: boolean) => void;
  empty?: string;
}) {
  const stops = useMemo(() => {
    const groups = new Map<string, PendingLeg[]>();
    for (const leg of legs) {
      const key = groupBy === "from" ? leg.fromWarehouse : leg.toWarehouse;
      groups.set(key, [...(groups.get(key) ?? []), leg]);
    }
    const rows = [...groups.entries()].map(([warehouse, items]) => ({ warehouse, legs: items }));
    // Порядок погрузки известен из «груза рейса» — он идёт по остановкам.
    if (groupBy === "from") {
      const at = (warehouse: string) => loadOrder.get(warehouse) ?? Number.MAX_SAFE_INTEGER;
      rows.sort((a, b) => at(a.warehouse) - at(b.warehouse));
    }
    return rows;
  }, [legs, groupBy, loadOrder]);

  const allChecked = legs.length > 0 && legs.every((leg) => checked.has(leg.id));

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <Checkbox
          checked={allChecked}
          onCheckedChange={(value) => toggleMany(legs, value === true)}
          disabled={legs.length === 0}
          aria-label={`Все: ${title}`}
        />
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{formatNumber(legs.length)}</span>
        {hint && <span className="text-xs text-muted-foreground">· {hint}</span>}
      </div>

      {legs.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-y border-border">
              <th className="w-10 px-4 py-2" />
              <th className="px-2 py-2 text-left font-medium">Заказ</th>
              <th className="px-2 py-2 text-left font-medium">Клиент</th>
              <th className="px-2 py-2 text-left font-medium">Скан</th>
              <th className="px-2 py-2 text-left font-medium">
                {groupBy === "from" ? "Куда" : "Город получателя"}
              </th>
              <th className="px-2 py-2 text-right font-medium">Вес</th>
              <th className="px-4 py-2 text-left font-medium">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {stops.map(({ warehouse, legs: stopLegs }) => {
              const stopChecked = stopLegs.every((leg) => checked.has(leg.id));
              return (
                <Fragment key={warehouse}>
                  <tr className="bg-muted/50">
                    <td className="px-4 py-1.5">
                      <Checkbox
                        checked={stopChecked}
                        onCheckedChange={(value) => toggleMany(stopLegs, value === true)}
                        aria-label={`Все заказы: ${shortWarehouse(warehouse)}`}
                      />
                    </td>
                    <td colSpan={6} className="px-2 py-1.5 text-xs" title={warehouse}>
                      <span className="font-medium">
                        {groupBy === "from" ? "Грузятся в" : "Сходят в"} {shortWarehouse(warehouse)}
                      </span>
                      <span className="ml-1.5 text-muted-foreground">
                        {formatNumber(stopLegs.length)}{" "}
                        {plural(stopLegs.length, "заказ", "заказа", "заказов")} ·{" "}
                        {formatNumber(boxes(stopLegs))}{" "}
                        {plural(boxes(stopLegs), "место", "места", "мест")} ·{" "}
                        {formatWeight(stopLegs.reduce((sum, leg) => sum + leg.order.weight, 0))}
                      </span>
                    </td>
                  </tr>
                  {stopLegs.map((leg) => (
                    <tr
                      key={leg.id}
                      className={checked.has(leg.id) ? "bg-accent/40" : undefined}
                      onClick={() => toggle(leg.id, !checked.has(leg.id))}
                    >
                      <td className="px-4 py-2">
                        <Checkbox
                          checked={checked.has(leg.id)}
                          onCheckedChange={(value) => toggle(leg.id, value === true)}
                          aria-label={`Заказ ${leg.order.orderNumber}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/orders/${leg.order.orderNumber}`}
                          className="font-medium tabular-nums hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {leg.order.orderNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(leg.order.createdDate)}
                          {leg.detachedFromTripId && (
                            <span className="ml-1.5 text-amber-700 dark:text-amber-400">
                              слетел с рейса
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">{leg.order.customerName ?? "—"}</td>
                      <td className="px-2 py-2 text-xs whitespace-nowrap">
                        {leg.scan ? (
                          <span className="flex items-center gap-1">
                            <ScanLine className="size-3.5 text-muted-foreground" />
                            <span
                              title={`${
                                leg.scan.kind === "TRANSIT" ? "Пробил на отправке" : "Принял"
                              } ${leg.scan.by}`}
                            >
                              {formatDateTime(leg.scan.at)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">не сканировался</span>
                        )}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                        {groupBy === "from"
                          ? shortWarehouse(leg.toWarehouse)
                          : (leg.order.receiverCity ?? "—")}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                        {leg.order.pieceCount > 1 && (
                          <span className="mr-1.5 text-xs text-muted-foreground">
                            {leg.order.pieceCount}{" "}
                            {plural(leg.order.pieceCount, "место", "места", "мест")} ·
                          </span>
                        )}
                        {formatWeight(leg.order.weight)}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary">{leg.order.statusLabel}</Badge>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
