import { buildCommandAvailabilityContext } from "@/domain/commands/buildCommandAvailabilityContext";
import type { CommandAvailabilityContextInput } from "@/domain/commands/buildCommandAvailabilityContext";

function base(overrides: Partial<CommandAvailabilityContextInput> = {}): CommandAvailabilityContextInput {
  return {
    viewMode: "map",
    selectedNodeId: 1,
    focusing: false,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    canUndo: true,
    canRedo: false,
    canFitAll: true,
    canFitSelection: true,
    canFocusBranch: true,
    canExpandSubtree: false,
    canCollapseSubtree: true,
    canDuplicate: true,
    canDeleteNodeOnly: true,
    canInsertParent: true,
    canMoveSiblingUp: true,
    canMoveSiblingDown: false,
    canIndent: true,
    canOutdent: false,
    canOpenLabelReplace: true,
    canOpenBranchMove: true,
    canOpenNodeSplit: false,
    nodeSplitDisabledReason: "不可",
    canOpenNodeMerge: false,
    nodeMergeDisabledReason: null,
    canFocusInMapSearch: true,
    canOpenCrossMapSearch: true,
    outlineDuplicateIds: false,
    outlineInvalidStructure: false,
    outlineSelectedVisible: true,
    ...overrides,
  };
}

describe("buildCommandAvailabilityContext", () => {
  it("マップ表示では outline 系を偽にする", () => {
    const ctx = buildCommandAvailabilityContext(base({ viewMode: "map" }));
    expect(ctx.outlineCanAddRoot).toBe(false);
    expect(ctx.outlineCanAddRelated).toBe(false);
    expect(ctx.outlineCanEdit).toBe(false);
    expect(ctx.canFocusInMapSearch).toBe(true);
  });

  it("アウトライン構造可否と選択可視を合成する", () => {
    const ok = buildCommandAvailabilityContext(
      base({ viewMode: "outline", outlineDuplicateIds: false, outlineInvalidStructure: false, outlineSelectedVisible: true }),
    );
    expect(ok.outlineCanAddRoot).toBe(true);
    expect(ok.outlineCanAddRelated).toBe(true);
    expect(ok.outlineCanEdit).toBe(true);

    const noSelection = buildCommandAvailabilityContext(
      base({ viewMode: "outline", outlineSelectedVisible: false }),
    );
    expect(noSelection.outlineCanAddRoot).toBe(true);
    expect(noSelection.outlineCanAddRelated).toBe(false);
    expect(noSelection.outlineCanEdit).toBe(false);

    const duplicate = buildCommandAvailabilityContext(
      base({ viewMode: "outline", outlineDuplicateIds: true }),
    );
    expect(duplicate.outlineCanAddRoot).toBe(false);
    expect(duplicate.outlineCanEdit).toBe(false);
  });
});
