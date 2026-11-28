import { buildEditorDockSlots } from "@/components/map/buildEditorDockSlots";
import { createDefaultDockVisibleSlotIds } from "@/domain/dock/defaultDockLayout";

describe("buildEditorDockSlots", () => {
  it("resolve 後の ID 順で node を並べ、欠損 ID は落とす", () => {
    const visibleSlotIds = createDefaultDockVisibleSlotIds();
    const slots = buildEditorDockSlots({
      visibleSlotIds,
      viewMode: "map",
      nodesById: {
        undoRedo: "undo",
        commandPalette: "cmd",
        // wheelZoom 意図的に省略
        importance: "imp",
      },
    });

    expect(slots.map((s) => s.id)).toEqual([
      "undoRedo",
      "commandPalette",
      "importance",
    ]);
    expect(slots.map((s) => s.node)).toEqual(["undo", "cmd", "imp"]);
  });

  it("outline ではマップ専用スロットを非マウント", () => {
    const slots = buildEditorDockSlots({
      visibleSlotIds: ["undoRedo", "wheelZoom", "commandPalette", "collapse"],
      viewMode: "outline",
      nodesById: {
        undoRedo: "undo",
        wheelZoom: "zoom",
        commandPalette: "cmd",
        collapse: "collapse",
      },
    });

    expect(slots.map((s) => s.id)).toEqual(["undoRedo", "commandPalette"]);
  });
});
