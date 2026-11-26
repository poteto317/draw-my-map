import {
  resolveMapEditorModalsBlockEditing,
  type MapEditorModalBlockingInput,
} from "@/domain/map/mapEditorModalBlocking";

const allClosed: MapEditorModalBlockingInput = {
  commandPaletteOpen: false,
  printSettingsOpen: false,
  outlineImportOpen: false,
  exchangeImportOpen: false,
  tourEditorOpen: false,
  presentationPlaybackOpen: false,
  branchMoveOpen: false,
  branchExtractOpen: false,
  labelReplaceOpen: false,
  nodeSplitOpen: false,
  nodeMergeOpen: false,
  aiAssistOpen: false,
  partsDialogOpen: false,
  crossMapSearchOpen: false,
  brokenLinksDialogOpen: false,
  persistenceConfirmOpen: false,
  shareDialogOpen: false,
};

describe("resolveMapEditorModalsBlockEditing", () => {
  it("すべて閉じていれば false", () => {
    expect(resolveMapEditorModalsBlockEditing(allClosed)).toBe(false);
  });

  it.each([
    ["commandPaletteOpen", "commandPaletteOpen"],
    ["printSettingsOpen", "printSettingsOpen"],
    ["aiAssistOpen", "aiAssistOpen"],
    ["persistenceConfirmOpen", "persistenceConfirmOpen"],
  ] as const)("%s だけ真なら true", (_label, key) => {
    expect(resolveMapEditorModalsBlockEditing({ ...allClosed, [key]: true })).toBe(true);
  });

  it("relationPartnerOpen は modal 束に含めない（専用 reason 用）", () => {
    expect(Object.keys(allClosed)).not.toContain("relationPartnerOpen");
  });
});