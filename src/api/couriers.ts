import { COURIERS, COURIERS_BY_ID } from "@/data/couriers";
import type { Courier, CourierKind } from "@/lib/types";

export async function listCouriers(kind?: CourierKind | "all"): Promise<Courier[]> {
  if (!kind || kind === "all") return COURIERS;
  return COURIERS.filter((c) => c.kind === kind);
}

export async function getCourier(id: string): Promise<Courier | null> {
  return COURIERS_BY_ID.get(id) ?? null;
}
