import { executeCommandPaletteActive } from "@/components/map/commandPaletteExecution";
import type { CommandAvailabilityContext } from "@/domain/commands/commandTypes";
import type { CommandPaletteExecutionDeps } from "@/components/map/commandPaletteExecution";

function context(overrides: Partial<CommandAvailabilityContext> = {}): CommandAvailabilityContext {
  return {
    viewMode: "map",
    selectedNodeId: 1,
    focusing: false,
    isProtectedMode: false,
    hasConflict: false,
    isExternallyDeleted: false,
    canUndo: true,
    canRedo: true,
    canFitAll: true,
    canFitSelection: true,
    canFocusBranch: true,
    canExpandSubtree: true,
    canCollapseSubtree: true,
    canDuplicate: true,
    canDeleteNodeOnly: true,
    canInsertParent: true,
    canMoveSiblingUp: true,
    canMoveSiblingDown: true,
    canIndent: true,
    canOutdent: true,
    canOpenLabelReplace: true,
    canOpenBranchMove: true,
    canOpenNodeSplit: true,
    nodeSplitDisabledReason: null,
    canOpenNodeMerge: true,
    nodeMergeDisabledReason: null,
    canRegisterPart: true,
    canInsertPart: true,
    canDeletePart: true,
    canFocusInMapSearch: true,
    canOpenCrossMapSearch: true,
    outlineCanAddRoot: false,
    outlineCanAddRelated: false,
    outlineCanEdit: false,
    ...overrides,
  };
}

function deps(overrides: Partial<CommandPaletteExecutionDeps> = {}): CommandPaletteExecutionDeps {
  return {
    closePalette: jest.fn(),
    setReject: jest.fn(),
    publishSuccessNotice: jest.fn(),
    getAvailabilityContext: () => context(),
    runImmediateCore: jest.fn(() => true),
    openDialogCommand: jest.fn(),
    ...overrides,
  };
}

describe("executeCommandPaletteActive", () => {
  it("不可なら setReject のみでコアを呼ばない", () => {
    const d = deps({
      getAvailabilityContext: () => context({ canUndo: false }),
    });
    executeCommandPaletteActive("edit.undo", d);
    expect(d.setReject).toHaveBeenCalled();
    expect(d.runImmediateCore).not.toHaveBeenCalled();
    expect(d.closePalette).not.toHaveBeenCalled();
  });

  it("即時成功時のみ close と成功 notice", () => {
    const d = deps();
    executeCommandPaletteActive("view.fit-all", d);
    expect(d.runImmediateCore).toHaveBeenCalledWith("view.fit-all");
    expect(d.closePalette).toHaveBeenCalledWith("execute-immediate");
    expect(d.publishSuccessNotice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "status" }),
    );
  });

  it("コアが false のときは close するが成功 notice は出さない", () => {
    const d = deps({ runImmediateCore: jest.fn(() => false) });
    executeCommandPaletteActive("view.fit-all", d);
    expect(d.closePalette).toHaveBeenCalledWith("execute-immediate");
    expect(d.publishSuccessNotice).not.toHaveBeenCalled();
  });

  it("opensDialog は close(execute-dialog) 後に open のみ", () => {
    const d = deps();
    executeCommandPaletteActive("edit.open-label-replace", d);
    expect(d.closePalette).toHaveBeenCalledWith("execute-dialog");
    expect(d.openDialogCommand).toHaveBeenCalledWith("edit.open-label-replace");
    expect(d.runImmediateCore).not.toHaveBeenCalled();
    expect(d.publishSuccessNotice).not.toHaveBeenCalled();
  });

  it("SELF_NOTIFYING は成功 notice を出さない", () => {
    const d = deps();
    executeCommandPaletteActive("edit.duplicate-branch", d);
    expect(d.closePalette).toHaveBeenCalledWith("execute-immediate");
    expect(d.publishSuccessNotice).not.toHaveBeenCalled();
  });
});
