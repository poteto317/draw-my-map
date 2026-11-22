import { getCommandDefinition } from "@/domain/commands/commandCatalog";
import { resolveCommandLabel } from "@/domain/commands/resolveCommandLabel";
import type { CommandAvailabilityContext } from "@/domain/commands/commandTypes";

function baseContext(overrides: Partial<CommandAvailabilityContext> = {}): CommandAvailabilityContext {
  return {
    viewMode: "map",
    selectedNodeId: null,
    focusing: false,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    canUndo: false,
    canRedo: false,
    canFitAll: false,
    canFitSelection: false,
    canFocusBranch: false,
    canExpandSubtree: false,
    canCollapseSubtree: false,
    canDuplicate: false,
    canDeleteNodeOnly: false,
    canInsertParent: false,
    canMoveSiblingUp: false,
    canMoveSiblingDown: false,
    canIndent: false,
    canOutdent: false,
    canOpenLabelReplace: false,
    canOpenBranchMove: false,
    canOpenNodeSplit: false,
    nodeSplitDisabledReason: null,
    canOpenNodeMerge: false,
    nodeMergeDisabledReason: null,
    canRegisterPart: true,
    canInsertPart: true,
    canDeletePart: true,
    canFocusInMapSearch: false,
    canOpenCrossMapSearch: false,
    outlineCanAddRoot: false,
    outlineCanAddRelated: false,
    outlineCanEdit: false,
    ...overrides,
  };
}

describe("resolveCommandLabel", () => {
  it("view.fit-all は集中中だけ動的ラベルになる", () => {
    const def = getCommandDefinition("view.fit-all")!;
    expect(resolveCommandLabel(def, baseContext({ focusing: false }))).toBe("全体に合わせる");
    expect(resolveCommandLabel(def, baseContext({ focusing: true }))).toBe("表示中の枝に合わせる");
  });

  it("他 ID は定義の label をそのまま返す", () => {
    const undo = getCommandDefinition("edit.undo")!;
    const focusClear = getCommandDefinition("view.focus-clear")!;
    expect(resolveCommandLabel(undo, baseContext({ focusing: true }))).toBe("元に戻す");
    expect(resolveCommandLabel(focusClear, baseContext({ focusing: true }))).toBe("集中表示を終了");
  });
});
