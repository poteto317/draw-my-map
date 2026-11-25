import {
  openCommandPaletteDialog,
  runCommandPaletteImmediateCore,
  type CommandPaletteDialogHandlers,
  type CommandPaletteImmediateCoreHandlers,
} from "@/components/map/commandPaletteCoreDispatch";

function immediateHandlers(
  overrides: Partial<CommandPaletteImmediateCoreHandlers> = {},
): CommandPaletteImmediateCoreHandlers {
  return {
    applyViewMode: jest.fn(),
    fitAll: jest.fn(),
    fitSelection: jest.fn(),
    focusBranch: jest.fn(() => true),
    clearFocus: jest.fn(),
    expandSubtree: jest.fn(() => true),
    collapseSubtree: jest.fn(() => true),
    undo: jest.fn(),
    redo: jest.fn(),
    duplicateBranch: jest.fn(),
    deleteNodeOnly: jest.fn(),
    insertParent: jest.fn(),
    moveSibling: jest.fn(),
    changeIndent: jest.fn(),
    focusInMapSearch: jest.fn(),
    addOutlineRoot: jest.fn(),
    addOutlineChild: jest.fn(),
    addOutlineSibling: jest.fn(),
    beginOutlineEdit: jest.fn(() => true),
    ...overrides,
  };
}

function dialogHandlers(
  overrides: Partial<CommandPaletteDialogHandlers> = {},
): CommandPaletteDialogHandlers {
  return {
    openLabelReplace: jest.fn(),
    openBranchMove: jest.fn(),
    openNodeSplit: jest.fn(),
    openNodeMerge: jest.fn(),
    openAiBranchSummary: jest.fn(),
    openAiImportance: jest.fn(),
    openAiChildCandidates: jest.fn(),
    openAiClassifyReorder: jest.fn(),
    openAiDuplicates: jest.fn(),
    openAiMissingPerspectives: jest.fn(),
    openCrossMapSearch: jest.fn(),
    openRegisterPart: jest.fn(),
    openInsertPart: jest.fn(),
    openDeletePart: jest.fn(),
    ...overrides,
  };
}

describe("runCommandPaletteImmediateCore", () => {
  it("既知 ID を対応ハンドラへ委譲し true を返す", () => {
    const handlers = immediateHandlers();
    expect(runCommandPaletteImmediateCore("view.map", handlers)).toBe(true);
    expect(handlers.applyViewMode).toHaveBeenCalledWith("map");
    expect(runCommandPaletteImmediateCore("edit.move-sibling-up", handlers)).toBe(true);
    expect(handlers.moveSibling).toHaveBeenCalledWith("up");
  });

  it("ガード失敗・未知 ID は false", () => {
    const handlers = immediateHandlers({
      focusBranch: () => false,
      beginOutlineEdit: () => false,
    });
    expect(runCommandPaletteImmediateCore("view.focus-branch", handlers)).toBe(false);
    expect(runCommandPaletteImmediateCore("outline.begin-edit", handlers)).toBe(false);
    expect(runCommandPaletteImmediateCore("unknown.id", handlers)).toBe(false);
  });
});

describe("openCommandPaletteDialog", () => {
  it("opensDialog ID を open* へ委譲する", () => {
    const handlers = dialogHandlers();
    expect(openCommandPaletteDialog("edit.open-label-replace", handlers)).toBe(true);
    expect(handlers.openLabelReplace).toHaveBeenCalledTimes(1);
    expect(openCommandPaletteDialog("search.open-cross-map", handlers)).toBe(true);
    expect(handlers.openCrossMapSearch).toHaveBeenCalledTimes(1);
    expect(openCommandPaletteDialog("edit.register-part", handlers)).toBe(true);
    expect(handlers.openRegisterPart).toHaveBeenCalledTimes(1);
    expect(openCommandPaletteDialog("edit.insert-part", handlers)).toBe(true);
    expect(handlers.openInsertPart).toHaveBeenCalledTimes(1);
    expect(openCommandPaletteDialog("edit.delete-part", handlers)).toBe(true);
    expect(handlers.openDeletePart).toHaveBeenCalledTimes(1);
  });

  it("未知 ID は false", () => {
    expect(openCommandPaletteDialog("view.map", dialogHandlers())).toBe(false);
  });
  it("AI 支援の 6 件を対応する open へ委譲する", () => {
    const handlers = dialogHandlers();
    expect(openCommandPaletteDialog("edit.open-ai-branch-summary", handlers)).toBe(true);
    expect(openCommandPaletteDialog("edit.open-ai-importance", handlers)).toBe(true);
    expect(openCommandPaletteDialog("edit.open-ai-child-candidates", handlers)).toBe(true);
    expect(openCommandPaletteDialog("edit.open-ai-classify-reorder", handlers)).toBe(true);
    expect(openCommandPaletteDialog("edit.open-ai-duplicates", handlers)).toBe(true);
    expect(openCommandPaletteDialog("edit.open-ai-missing-perspectives", handlers)).toBe(true);
    expect(handlers.openAiBranchSummary).toHaveBeenCalledTimes(1);
    expect(handlers.openAiImportance).toHaveBeenCalledTimes(1);
    expect(handlers.openAiChildCandidates).toHaveBeenCalledTimes(1);
    expect(handlers.openAiClassifyReorder).toHaveBeenCalledTimes(1);
    expect(handlers.openAiDuplicates).toHaveBeenCalledTimes(1);
    expect(handlers.openAiMissingPerspectives).toHaveBeenCalledTimes(1);
  });
});
