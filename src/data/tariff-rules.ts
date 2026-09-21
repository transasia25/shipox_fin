import type { TariffRule } from "@/lib/types";

/**
 * Стартовый набор правил тарификации.
 *
 * Подбор идёт по приоритету, при равном приоритете — по специфичности.
 * Верхние вилки по весу заданы намеренно: сверхтяжёлые отправления пока не
 * затарифицированы и попадают в отчёт «плечи без тарифа» — так бухгалтерия
 * видит, где нужно донастроить ставки, вместо того чтобы получить молчаливый ноль.
 */

const FROM = "2025-01-01T00:00:00.000Z";

export const TARIFF_RULES: TariffRule[] = [
  // ── Забор у отправителя ────────────────────────────────────────────────
  {
    id: "tr-pickup-staff",
    name: "Забор — штатный курьер",
    priority: 0,
    active: true,
    legType: "pickup",
    match: { courierGroup: "staff", weightMax: 80 },
    formula: { base: 12_000, perKg: 500, includedKg: 10, perPlace: 2_000, includedPlaces: 2, perKm: 0, min: 12_000 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-pickup-partner",
    name: "Забор — партнёр",
    priority: 0,
    active: true,
    legType: "pickup",
    match: { courierGroup: "partner", weightMax: 80 },
    formula: { base: 15_000, perKg: 700, includedKg: 10, perPlace: 2_500, includedPlaces: 2, perKm: 0, min: 15_000 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-pickup-sergeli",
    name: "Забор — Сергелийский район (удалённый)",
    priority: 5,
    active: true,
    legType: "pickup",
    match: { fromZoneId: "tas-sergeli", weightMax: 80 },
    formula: { base: 20_000, perKg: 500, includedKg: 10, perPlace: 2_000, includedPlaces: 2, perKm: 0 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },

  // ── Междугородний транзит ──────────────────────────────────────────────
  // Ставка транзита — за одно отправление на одном плече (доля посылки в рейсе),
  // а не за весь рейс: в машине едут сотни заказов, и начисление относится
  // на каждый заказ отдельно.
  {
    id: "tr-linehaul-base",
    name: "Транзит — базовая ставка по километражу",
    priority: 0,
    active: true,
    legType: "linehaul",
    match: { courierGroup: "staff", weightMax: 100 },
    formula: { base: 8_000, perKg: 0, includedKg: 0, perPlace: 0, includedPlaces: 0, perKm: 25, min: 10_000 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-linehaul-partner",
    name: "Транзит — партнёрский автопарк",
    priority: 0,
    active: true,
    legType: "linehaul",
    match: { courierGroup: "partner", weightMax: 100 },
    formula: { base: 10_000, perKg: 0, includedKg: 0, perPlace: 0, includedPlaces: 0, perKm: 30, min: 12_000 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-linehaul-tas-jiz",
    name: "Транзит Ташкент → Джизак",
    priority: 3,
    active: true,
    legType: "linehaul",
    match: { fromZoneId: "tashkent", toZoneId: "jizzakh" },
    formula: { base: 9_000, perKg: 300, includedKg: 50, perPlace: 0, includedPlaces: 0, perKm: 0 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-linehaul-jiz-tas",
    name: "Транзит Джизак → Ташкент",
    priority: 3,
    active: true,
    legType: "linehaul",
    match: { fromZoneId: "jizzakh", toZoneId: "tashkent" },
    formula: { base: 8_500, perKg: 300, includedKg: 50, perPlace: 0, includedPlaces: 0, perKm: 0 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-linehaul-jiz-sam",
    name: "Транзит Джизак → Самарканд",
    priority: 3,
    active: true,
    legType: "linehaul",
    match: { fromZoneId: "jizzakh", toZoneId: "samarkand" },
    formula: { base: 8_000, perKg: 250, includedKg: 50, perPlace: 0, includedPlaces: 0, perKm: 0 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-linehaul-sam-jiz",
    name: "Транзит Самарканд → Джизак",
    priority: 3,
    active: true,
    legType: "linehaul",
    match: { fromZoneId: "samarkand", toZoneId: "jizzakh" },
    formula: { base: 8_000, perKg: 250, includedKg: 50, perPlace: 0, includedPlaces: 0, perKm: 0 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-linehaul-sam-buk",
    name: "Транзит Самарканд → Бухара",
    priority: 3,
    active: true,
    legType: "linehaul",
    match: { fromZoneId: "samarkand", toZoneId: "bukhara" },
    formula: { base: 14_000, perKg: 300, includedKg: 50, perPlace: 0, includedPlaces: 0, perKm: 0 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-linehaul-tas-nam",
    name: "Транзит Ташкент → Наманган",
    priority: 3,
    active: true,
    legType: "linehaul",
    match: { fromZoneId: "tashkent", toZoneId: "namangan" },
    formula: { base: 13_000, perKg: 350, includedKg: 50, perPlace: 0, includedPlaces: 0, perKm: 0 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },

  // ── Доставка до двери ──────────────────────────────────────────────────
  {
    id: "tr-lastmile-staff",
    name: "Доставка до двери — штатный курьер",
    priority: 0,
    active: true,
    legType: "last_mile",
    match: { courierGroup: "staff", weightMax: 30 },
    formula: { base: 14_000, perKg: 600, includedKg: 10, perPlace: 2_000, includedPlaces: 2, perKm: 0, min: 14_000 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-lastmile-partner",
    name: "Доставка до двери — партнёр",
    priority: 0,
    active: true,
    legType: "last_mile",
    match: { courierGroup: "partner", weightMax: 30 },
    formula: { base: 17_000, perKg: 800, includedKg: 10, perPlace: 2_500, includedPlaces: 2, perKm: 0, min: 17_000 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
  {
    id: "tr-lastmile-heavy",
    name: "Доставка — крупногабарит 30–80 кг",
    priority: 5,
    active: true,
    legType: "last_mile",
    match: { weightMin: 30, weightMax: 80 },
    formula: { base: 35_000, perKg: 900, includedKg: 30, perPlace: 3_000, includedPlaces: 1, perKm: 0 },
    effectiveFrom: FROM,
    effectiveTo: null,
  },
];
