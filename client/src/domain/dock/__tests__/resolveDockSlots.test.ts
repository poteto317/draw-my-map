import { listDockSlotDefs } from "@/domain/dock/dockSlotCatalog";
import {
  isDockSlotMountedInView,
  resolveDockSlots,
} from "@/domain/dock/resolveDockSlots";
import { createDefaultDockVisibleSlotIds } from "@/domain/dock/defaultDockLayout";

describe("isDockSlotMountedInView", () => {
  it("map では常にマウントする", () => {
    expect(isDockSlotMountedInView({
      outlineVisible: false,
      requiresMapView: true,
    }, "map")).toBe(true);
  });

  it("outline では outlineVisible===false を除外する", () => {
    expect(isDockSlotMountedInView({
      outlineVisible: false,
      requiresMapView: false,
    }, "outline")).toBe(false);
  });

  it("outline では requiresMapView===true を除外する", () => {
    expect(isDockSlotMountedInView({
      outlineVisible: true,
      requiresMapView: true,
    }, "outline")).toBe(false);
  });

  it("outline では両条件を満たすスロットだけ残す", () => {
    expect(isDockSlotMountedInView({
      outlineVisible: true,
      requiresMapView: false,
    }, "outline")).toBe(true);
  });
});

describe("resolveDockSlots", () => {
  it("map では visible の並びを保つ", () => {
    const visible = createDefaultDockVisibleSlotIds();
    expect(resolveDockSlots({ visibleSlotIds: visible, viewMode: "map" }))
      .toEqual(visible);
  });

  it("outline では outlineVisible===false または requiresMapView のスロットを除外する", () => {
    const allIds = listDockSlotDefs().map((def) => def.id);
    const resolved = resolveDockSlots({
      visibleSlotIds: allIds,
      viewMode: "outline",
    });
    const byId = new Map(listDockSlotDefs().map((def) => [def.id, def]));
    for (const id of resolved) {
      const def = byId.get(id);
      expect(def).toBeDefined();
      expect(def!.outlineVisible).toBe(true);
      expect(def!.requiresMapView).toBe(false);
    }
    for (const def of listDockSlotDefs()) {
      if (!def.outlineVisible || def.requiresMapView) {
        expect(resolved).not.toContain(def.id);
      }
    }
  });

  it("未知 ID は落とす（並びは入力順）", () => {
    expect(resolveDockSlots({
      visibleSlotIds: ["undoRedo", "notARealSlot", "commandPalette"] as never[],
      viewMode: "map",
    })).toEqual(["undoRedo", "commandPalette"]);
  });
});
