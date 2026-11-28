import {
  DOCK_SLOT_IDS,
  listDockSlotDefs,
  type DockSlotId,
} from "@/domain/dock/dockSlotCatalog";
import { createDefaultDockVisibleSlotIds } from "@/domain/dock/defaultDockLayout";

/** 設計「決めたこと」3 の閉じたスロット ID（グループ順） */
const DESIGN_SLOT_IDS: readonly DockSlotId[] = [
  // edit
  "undoRedo",
  "commandPalette",
  "wheelZoom",
  "importance",
  "collapse",
  "duplicateBranch",
  "moveBranch",
  "reorderSiblings",
  "changeHierarchy",
  "insertParent",
  "deleteNodeOnly",
  "bulkReplace",
  "splitMerge",
  "branchNav",
  "viewBookmarks",
  // view-tools
  "resolutionFilter",
  "depthLimit",
  "highlightMode",
  "nodePins",
  // session
  "tour",
  "presentation",
  "learnMode",
  // voice
  "voiceInput",
  // io
  "importBullets",
  "importOpmlCsv",
  "exportTarget",
  "exportJson",
  "exportPngSvg",
  "printPdf",
  "exportMdBullets",
  "exportOpmlCsvTsv",
  // collab-share
  "collab",
  "share",
  "comments",
];

/** 設計「決めたこと」4 の既定 visible 順 */
const DESIGN_DEFAULT_VISIBLE: readonly DockSlotId[] = [
  "undoRedo",
  "commandPalette",
  "wheelZoom",
  "importance",
  "collapse",
  "duplicateBranch",
  "moveBranch",
  "reorderSiblings",
  "changeHierarchy",
];

describe("dockSlotCatalog", () => {
  it("設計決めたこと3の全スロット ID が catalog に登録されている（網羅・順序）", () => {
    expect(DOCK_SLOT_IDS).toEqual(DESIGN_SLOT_IDS);
    expect(listDockSlotDefs().map((def) => def.id)).toEqual(DESIGN_SLOT_IDS);
  });

  it("各定義が id・label・group・defaultVisible・outlineVisible・requiresMapView を持つ", () => {
    for (const def of listDockSlotDefs()) {
      expect(def.id).toBeTruthy();
      expect(typeof def.label).toBe("string");
      expect(def.label.length).toBeGreaterThan(0);
      expect(["edit", "view-tools", "session", "voice", "io", "collab-share"])
        .toContain(def.group);
      expect(typeof def.defaultVisible).toBe("boolean");
      expect(typeof def.outlineVisible).toBe("boolean");
      expect(typeof def.requiresMapView).toBe("boolean");
    }
  });

  it("既定 visible は決めたこと4の ID 順と一致する", () => {
    expect(createDefaultDockVisibleSlotIds()).toEqual(DESIGN_DEFAULT_VISIBLE);
    expect(
      listDockSlotDefs()
        .filter((def) => def.defaultVisible)
        .map((def) => def.id),
    ).toEqual(DESIGN_DEFAULT_VISIBLE);
  });
});
