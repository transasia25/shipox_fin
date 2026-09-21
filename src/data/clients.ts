import type { Client } from "@/lib/types";

/** Клиенты — интернет-магазины и дистрибьюторы, которым мы выставляем счёт за доставку. */
export const CLIENTS: Client[] = [
  { id: "cl-01", name: "OOO «Asia Market»", inn: "301245678", contractNo: "Д-2024/017", paymentTermDays: 14, currency: "UZS" },
  { id: "cl-02", name: "OOO «Texnomart Online»", inn: "302876451", contractNo: "Д-2024/042", paymentTermDays: 30, currency: "UZS" },
  { id: "cl-03", name: "OOO «Silk Road Pharma»", inn: "303451209", contractNo: "Д-2025/003", paymentTermDays: 7, currency: "UZS" },
  { id: "cl-04", name: "ЧП «Zarina Textile»", inn: "304998123", contractNo: "Д-2024/088", paymentTermDays: 21, currency: "UZS" },
  { id: "cl-05", name: "OOO «Fresh Line»", inn: "305112390", contractNo: "Д-2025/011", paymentTermDays: 14, currency: "UZS" },
  { id: "cl-06", name: "OOO «Uzum Supply»", inn: "306774512", contractNo: "Д-2024/101", paymentTermDays: 30, currency: "UZS" },
  { id: "cl-07", name: "OOO «Beeline Retail»", inn: "307221845", contractNo: "Д-2025/024", paymentTermDays: 45, currency: "UZS" },
  { id: "cl-08", name: "ЧП «Nodira Cosmetics»", inn: "308665140", contractNo: "Д-2025/031", paymentTermDays: 7, currency: "UZS" },
  { id: "cl-09", name: "OOO «Auto Detal Servis»", inn: "309330271", contractNo: "Д-2024/065", paymentTermDays: 21, currency: "UZS" },
  { id: "cl-10", name: "OOO «Book City»", inn: "310884906", contractNo: "Д-2025/008", paymentTermDays: 14, currency: "UZS" },
  { id: "cl-11", name: "OOO «Agro Trade Group»", inn: "311557382", contractNo: "Д-2024/073", paymentTermDays: 30, currency: "UZS" },
  { id: "cl-12", name: "ЧП «Smart Gadget»", inn: "312409617", contractNo: "Д-2025/019", paymentTermDays: 14, currency: "UZS" },
];

export const CLIENTS_BY_ID = new Map(CLIENTS.map((c) => [c.id, c]));

export function clientName(id: string): string {
  return CLIENTS_BY_ID.get(id)?.name ?? id;
}
