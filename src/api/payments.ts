import { PAYMENTS } from "@/data/generate";
import type { Payment } from "@/lib/types";

export async function listPayments(clientId?: string): Promise<Payment[]> {
  return clientId ? PAYMENTS.filter((p) => p.clientId === clientId) : PAYMENTS;
}
