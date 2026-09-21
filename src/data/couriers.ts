import type { Courier } from "@/lib/types";

/**
 * Исполнители: курьеры работают внутри города (забор и доставка до двери),
 * водители возят междугородние транзитные плечи между сортировочными центрами.
 * Группа (штатный / партнёр) влияет на ставку.
 */
export const COURIERS: Courier[] = [
  // Ташкент — самый большой узел
  { id: "cr-01", fullName: "Алишер Каримов", phone: "+998 90 123-45-67", kind: "courier", group: "staff", homeZoneId: "tashkent", vehicle: "Chevrolet Damas", active: true },
  { id: "cr-02", fullName: "Дилшод Ахмедов", phone: "+998 90 234-56-78", kind: "courier", group: "staff", homeZoneId: "tashkent", vehicle: "Chevrolet Cobalt", active: true },
  { id: "cr-03", fullName: "Санжар Юлдашев", phone: "+998 93 345-67-89", kind: "courier", group: "partner", homeZoneId: "tashkent", vehicle: "Мотоцикл", active: true },
  { id: "cr-04", fullName: "Отабек Рахимов", phone: "+998 93 456-78-90", kind: "courier", group: "partner", homeZoneId: "tashkent", vehicle: "Chevrolet Damas", active: true },
  { id: "cr-05", fullName: "Жасур Тошматов", phone: "+998 94 567-89-01", kind: "courier", group: "staff", homeZoneId: "tashkent", vehicle: "Chevrolet Labo", active: true },
  { id: "cr-06", fullName: "Бекзод Нурматов", phone: "+998 94 678-90-12", kind: "courier", group: "partner", homeZoneId: "tashkent", vehicle: "Мотоцикл", active: true },

  // Регионы
  { id: "cr-07", fullName: "Фаррух Эргашев", phone: "+998 91 789-01-23", kind: "courier", group: "staff", homeZoneId: "samarkand", vehicle: "Chevrolet Damas", active: true },
  { id: "cr-08", fullName: "Азиз Хайдаров", phone: "+998 91 890-12-34", kind: "courier", group: "partner", homeZoneId: "samarkand", vehicle: "Мотоцикл", active: true },
  { id: "cr-09", fullName: "Улугбек Собиров", phone: "+998 97 901-23-45", kind: "courier", group: "staff", homeZoneId: "bukhara", vehicle: "Chevrolet Damas", active: true },
  { id: "cr-10", fullName: "Шухрат Мирзаев", phone: "+998 97 012-34-56", kind: "courier", group: "partner", homeZoneId: "bukhara", vehicle: "Chevrolet Labo", active: true },
  { id: "cr-11", fullName: "Хуршид Абдуллаев", phone: "+998 99 111-22-33", kind: "courier", group: "staff", homeZoneId: "namangan", vehicle: "Chevrolet Damas", active: true },
  { id: "cr-12", fullName: "Мухаммад Усмонов", phone: "+998 99 222-33-44", kind: "courier", group: "partner", homeZoneId: "andijan", vehicle: "Мотоцикл", active: true },
  { id: "cr-13", fullName: "Рустам Кодиров", phone: "+998 88 333-44-55", kind: "courier", group: "staff", homeZoneId: "fergana", vehicle: "Chevrolet Damas", active: true },
  { id: "cr-14", fullName: "Икром Жўраев", phone: "+998 88 444-55-66", kind: "courier", group: "partner", homeZoneId: "jizzakh", vehicle: "Chevrolet Labo", active: true },
  { id: "cr-15", fullName: "Даврон Ниязов", phone: "+998 62 555-66-77", kind: "courier", group: "staff", homeZoneId: "urgench", vehicle: "Chevrolet Damas", active: true },
  { id: "cr-16", fullName: "Тимур Аллаяров", phone: "+998 61 666-77-88", kind: "courier", group: "partner", homeZoneId: "nukus", vehicle: "Chevrolet Damas", active: true },
  { id: "cr-17", fullName: "Элёр Холматов", phone: "+998 76 777-88-99", kind: "courier", group: "staff", homeZoneId: "termez", vehicle: "Chevrolet Labo", active: true },

  // Междугородние водители
  { id: "dr-01", fullName: "Рустам Бобоев", phone: "+998 90 987-65-43", kind: "driver", group: "staff", homeZoneId: "tashkent", vehicle: "Isuzu NQR (5 т)", active: true },
  { id: "dr-02", fullName: "Шерзод Тураев", phone: "+998 90 876-54-32", kind: "driver", group: "staff", homeZoneId: "tashkent", vehicle: "Isuzu NPR (3 т)", active: true },
  { id: "dr-03", fullName: "Комил Ражабов", phone: "+998 93 765-43-21", kind: "driver", group: "partner", homeZoneId: "samarkand", vehicle: "Mercedes Sprinter", active: true },
  { id: "dr-04", fullName: "Голиб Сафаров", phone: "+998 93 654-32-10", kind: "driver", group: "partner", homeZoneId: "bukhara", vehicle: "Isuzu NQR (5 т)", active: true },
  { id: "dr-05", fullName: "Нодир Умаров", phone: "+998 94 543-21-09", kind: "driver", group: "staff", homeZoneId: "namangan", vehicle: "Mercedes Sprinter", active: true },
  { id: "dr-06", fullName: "Сардор Йўлдошев", phone: "+998 94 432-10-98", kind: "driver", group: "partner", homeZoneId: "jizzakh", vehicle: "Isuzu NPR (3 т)", active: true },
  { id: "dr-07", fullName: "Аваз Матниязов", phone: "+998 62 321-09-87", kind: "driver", group: "partner", homeZoneId: "urgench", vehicle: "Isuzu NQR (5 т)", active: true },
];

export const COURIERS_BY_ID = new Map(COURIERS.map((c) => [c.id, c]));

export function courierName(id: string): string {
  return COURIERS_BY_ID.get(id)?.fullName ?? id;
}

/** Краткое имя для плотных таблиц и таймлайна: «Алишер К.». */
export function courierShortName(id: string): string {
  const courier = COURIERS_BY_ID.get(id);
  if (!courier) return id;
  const [first, last] = courier.fullName.split(" ");
  return last ? `${first} ${last[0]}.` : first;
}
