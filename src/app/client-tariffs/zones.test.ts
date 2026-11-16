import { describe, expect, it } from "vitest";
import type { TariffZoneMatrix } from "@/lib/backend/types";
import { destinationsByZone, zoneHints, zoneIssues } from "./zones";

const MATRIX: TariffZoneMatrix = {
  hubs: [
    { id: 1, name: "Nukus" },
    { id: 10, name: "Tashkent" },
    { id: 7, name: "Termez" },
    { id: 15, name: "Ohangaron" },
  ],
  cells: [
    { fromHubId: 10, toHubId: 10, zone: 0 },
    { fromHubId: 10, toHubId: 1, zone: 5 },
    { fromHubId: 1, toHubId: 10, zone: 5 },
    { fromHubId: 10, toHubId: 7, zone: 5 },
    { fromHubId: 7, toHubId: 10, zone: 2 },
  ],
};

describe("zones", () => {
  it("раскладывает направления из хаба по зонам", () => {
    const byZone = destinationsByZone(MATRIX, 10);
    expect([...byZone.keys()]).toEqual([0, 5]);
    expect(byZone.get(5)?.map((hub) => hub.name)).toEqual(["Nukus", "Termez"]);
  });

  it("в подсказке к зоне называет направления из Ташкента", () => {
    const hints = zoneHints(MATRIX, [0, 5]);
    expect(hints.get(5)?.lines.slice(0, 2)).toEqual([
      "Например, из Tashkent в Nukus или Termez.",
      "Обратно, из Termez в Tashkent, — зона 2.",
    ]);
    expect(hints.get(0)?.title).toBe("Зона 0 — внутри одного хаба");
  });

  it("находит несимметричные пары и хабы без зон", () => {
    expect(zoneIssues(MATRIX)).toEqual({
      asymmetric: [{ a: "Tashkent", b: "Termez", there: 5, back: 2 }],
      missing: [
        { from: "Nukus", to: "Nukus" },
        { from: "Nukus", to: "Termez" },
        { from: "Termez", to: "Nukus" },
        { from: "Termez", to: "Termez" },
      ],
      withoutZones: ["Ohangaron"],
    });
  });

  it("говорит, когда обратного направления в матрице нет", () => {
    const oneWay = { ...MATRIX, cells: MATRIX.cells.filter((cell) => !(cell.fromHubId === 7 && cell.toHubId === 10)) };
    expect(zoneHints(oneWay, [5]).get(5)?.lines).toContain(
      "Обратно, из Termez в Tashkent, зоны нет — такой заказ по зонам не посчитается.",
    );
  });

  it("не подставляет «undefined» вместо хаба, которого нет в списке", () => {
    const matrix = {
      hubs: [{ id: 10, name: "Tashkent" }],
      cells: [{ fromHubId: 99, toHubId: 98, zone: 3 }],
    };
    expect(zoneHints(matrix, [3]).get(3)?.lines.join(" ")).not.toContain("undefined");
  });
});
