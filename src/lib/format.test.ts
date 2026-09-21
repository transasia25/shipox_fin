import { beforeAll, describe, expect, it } from "vitest";
import { endOfDayISO, startOfDayISO, toDateInputValue } from "./format";

describe("toDateInputValue", () => {
  beforeAll(() => {
    // Ошибка видна только восточнее UTC: в Ташкенте начало суток — это
    // ещё вчерашняя дата по UTC. Node подхватывает TZ на лету.
    process.env.TZ = "Asia/Tashkent";
  });

  it("показывает в поле ту же дату, с которой начинается период", () => {
    const from = startOfDayISO("2026-09-08T12:00:00");
    const to = endOfDayISO("2026-09-14T12:00:00");
    expect(from).toBe("2026-09-07T19:00:00.000Z");
    expect(toDateInputValue(from)).toBe("2026-09-08");
    expect(toDateInputValue(to)).toBe("2026-09-14");
  });
});
