import { describe, expect, it } from "vitest";
import type { TariffZoneMatrix } from "@/lib/backend/types";
import { destinationsByZone, zoneHint, zoneIssues } from "./zones";

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
    expect(zoneHint(MATRIX, 5).lines[0]).toBe("Из Tashkent: Nukus, Termez.");
    expect(zoneHint(MATRIX, 0).title).toBe("Зона 0 — внутри одного хаба");
  });

  it("находит несимметричные пары и хабы без зон", () => {
    expect(zoneIssues(MATRIX)).toEqual({
      asymmetric: [{ a: "Tashkent", b: "Termez", there: 5, back: 2 }],
      withoutZones: ["Ohangaron"],
    });
  });
});
