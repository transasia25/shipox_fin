import { CLIENTS, CLIENTS_BY_ID } from "@/data/clients";
import type { Client } from "@/lib/types";

export async function listClients(): Promise<Client[]> {
  return CLIENTS;
}

export async function getClient(id: string): Promise<Client | null> {
  return CLIENTS_BY_ID.get(id) ?? null;
}
