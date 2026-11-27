import { COMMAND_CATALOG } from "@/domain/commands/commandCatalog";
import { filterCommandCatalog } from "@/domain/commands/filterCommandCatalog";
import type { CommandAvailabilityContext } from "@/domain/commands/commandTypes";

function baseContext(overrides: Partial<CommandAvailabilityContext> = {}): CommandAvailabilityContext {
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
    canFitSelection: false,
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
    canOpenAiBranchSummary: true,
    aiBranchSummaryDisabledReason: null,
    canOpenAiImportance: true,
    aiImportanceDisabledReason: null,
    canOpenAiChildCandidates: true,
    aiChildCandidatesDisabledReason: null,
    canOpenAiClassifyReorder: true,
    aiClassifyReorderDisabledReason: null,
    canOpenAiDuplicates: true,
    aiDuplicatesDisabledReason: null,
    canOpenAiMissingPerspectives: true,
    aiMissingPerspectivesDisabledReason: null,
    canRegisterPart: true,
    canInsertPart: true,
    canDeletePart: true,
    canFocusInMapSearch: true,
    canOpenCrossMapSearch: true,
    outlineCanAddRoot: true,
    outlineCanAddRelated: true,
    outlineCanEdit: true,
    learningActive: false,
    playingPresentation: false,
    canLearnStart: true,
    canLearnEnd: false,
    canLearnReset: false,
    canLearnGenerateCards: false,
    canLearnOpenCards: false,
    learnStartDisabledReason: null,
    learnResetDisabledReason: null,
    learnGenerateDisabledReason: null,
    voiceListening: false,
    canVoiceInputStart: true,
    canVoiceInputStop: false,
    voiceStartDisabledReason: null,
    collabBulkBlockedReason: null,
    ...overrides,
  };
}

describe("filterCommandCatalog", () => {
  it("空クエリは推奨セット（モード不一致除外・モード一致の不可は残す）", () => {
    const result = filterCommandCatalog("", baseContext({ viewMode: "map", canRedo: false }));
    const ids = result.items.map((item) => item.definition.id);

    expect(ids).not.toContain("outline.add-root");
    expect(ids).not.toContain("outline.begin-edit");
    expect(ids).toContain("edit.redo");
    expect(result.items.find((item) => item.definition.id === "edit.redo")?.availability).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "やり直せる操作がありません",
    });
    expect(result.overflowCount).toBe(0);
    expect(result.items.length).toBeLessThanOrEqual(50);
  });

  it("空クエリのアウトラインではマップ専用を除外し、アウトライン専用を残す", () => {
    const result = filterCommandCatalog("", baseContext({ viewMode: "outline" }));
    const ids = result.items.map((item) => item.definition.id);
    expect(ids).toContain("outline.add-root");
    expect(ids).not.toContain("view.fit-all");
    expect(ids).not.toContain("search.focus-in-map");
    expect(ids).toContain("edit.undo");
  });

  it("非空クエリは表示名・aliases・カテゴリ名を NFKC＋小文字＋trim で部分一致し、不可も残す", () => {
    const byAlias = filterCommandCatalog(" Ｕｎｄｏ ", baseContext({ canUndo: false }));
    expect(byAlias.items.map((item) => item.definition.id)).toEqual(["edit.undo"]);
    expect(byAlias.items[0]?.availability.enabled).toBe(false);

    const byCategory = filterCommandCatalog("編集", baseContext());
    // カテゴリ名「編集」に加え、表示名「ラベル編集」なども部分一致する
    expect(byCategory.items.some((item) => item.definition.categoryId === "edit")).toBe(true);
    expect(byCategory.items.map((item) => item.definition.id)).toContain("edit.undo");
    expect(byCategory.items.map((item) => item.definition.id)).toContain("outline.begin-edit");

    const byLabel = filterCommandCatalog("フィット", baseContext({ focusing: true }));
    expect(byLabel.items.map((item) => item.definition.id)).toContain("view.fit-all");
    expect(byLabel.items.find((item) => item.definition.id === "view.fit-all")?.displayLabel).toBe(
      "表示中の枝に合わせる",
    );
  });

  it("非空クエリではモード不一致の一致も残す", () => {
    const result = filterCommandCatalog("ルート追加", baseContext({ viewMode: "map" }));
    expect(result.items).toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({ id: "outline.add-root" }),
        availability: expect.objectContaining({ modeMismatch: true, enabled: false }),
      }),
    ]);
  });

  it("最大 50 件で打ち切り、overflowCount は一致総数 − items.length", () => {
    const emptyLimited = filterCommandCatalog("", baseContext({ viewMode: "map" }), { limit: 3 });
    expect(emptyLimited.items).toHaveLength(3);
    const recommendedWithoutMismatch = COMMAND_CATALOG.filter((def) => !def.id.startsWith("outline.")).length;
    expect(emptyLimited.overflowCount).toBe(recommendedWithoutMismatch - 3);

    const capped = filterCommandCatalog("", baseContext({ viewMode: "map" }));
    expect(capped.items.length).toBeLessThanOrEqual(50);
  });

  it("既定 limit は 50", () => {
    const result = filterCommandCatalog("", baseContext());
    expect(result.items.length).toBeLessThanOrEqual(50);
  });
});
