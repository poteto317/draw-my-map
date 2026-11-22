import { resolveCommandAvailability } from "@/domain/commands/resolveCommandAvailability";
import type { CommandAvailabilityContext, CommandId } from "@/domain/commands/commandTypes";

function baseContext(overrides: Partial<CommandAvailabilityContext> = {}): CommandAvailabilityContext {
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
    outlineCanAddRoot: true,
    outlineCanAddRelated: true,
    outlineCanEdit: true,
    ...overrides,
  };
}

describe("resolveCommandAvailability", () => {
  it("マップ専用コマンドはアウトラインで modeMismatch になる", () => {
    const ctx = baseContext({ viewMode: "outline" });
    const mapOnlyIds: CommandId[] = [
      "view.fit-all",
      "view.fit-selection",
      "view.focus-branch",
      "view.focus-clear",
      "view.expand-subtree",
      "view.collapse-subtree",
      "search.focus-in-map",
      "edit.duplicate-branch",
      "edit.insert-parent",
      "edit.open-label-replace",
      "edit.open-branch-move",
      "edit.open-node-split",
      "edit.open-node-merge",
    ];
    for (const id of mapOnlyIds) {
      expect(resolveCommandAvailability(id, ctx)).toEqual({
        enabled: false,
        modeMismatch: true,
        disabledReason: "マップ表示でのみ利用できます",
      });
    }
  });

  it("アウトライン専用コマンドはマップで modeMismatch になる", () => {
    const ctx = baseContext({ viewMode: "map" });
    for (const id of ["outline.add-root", "outline.add-child", "outline.add-sibling", "outline.begin-edit"] as const) {
      expect(resolveCommandAvailability(id, ctx)).toEqual({
        enabled: false,
        modeMismatch: true,
        disabledReason: "アウトライン表示でのみ利用できます",
      });
    }
  });

  it("両モードで使えるコマンドは modeMismatch にならない", () => {
    for (const viewMode of ["map", "outline"] as const) {
      const ctx = baseContext({ viewMode });
      expect(resolveCommandAvailability("edit.undo", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("edit.redo", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("edit.delete-node-only", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("edit.move-sibling-up", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("edit.indent", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("edit.register-part", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("edit.insert-part", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("edit.delete-part", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("search.open-cross-map", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("view.map", ctx).modeMismatch).toBe(false);
      expect(resolveCommandAvailability("view.outline", ctx).modeMismatch).toBe(false);
    }
  });

  it("部品コマンドは選択・一覧可否に従う", () => {
    expect(resolveCommandAvailability("edit.register-part", baseContext({ canRegisterPart: false }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "部品にするノードを 1 つだけ選んでください。",
    });
    expect(resolveCommandAvailability("edit.insert-part", baseContext({ canInsertPart: false }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "挿入できる部品がありません。",
    });
    expect(resolveCommandAvailability("edit.delete-part", baseContext({ canDeletePart: false }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "削除できる部品がありません。",
    });
    expect(resolveCommandAvailability("edit.register-part", baseContext({ canRegisterPart: true })).enabled).toBe(true);
  });

  it("can* が偽のときは enabled=false と理由を返す（modeMismatch ではない）", () => {
    expect(resolveCommandAvailability("edit.undo", baseContext({ canUndo: false }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "元に戻せる操作がありません",
    });
    expect(resolveCommandAvailability("edit.redo", baseContext({ canRedo: false }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "やり直せる操作がありません",
    });
    expect(resolveCommandAvailability("view.fit-selection", baseContext({ canFitSelection: false }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "選択中のノードがありません",
    });
    expect(resolveCommandAvailability("edit.move-sibling-up", baseContext({ canMoveSiblingUp: false }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "これ以上上へ移動できません",
    });
  });

  it("分割・統合は context の専用 disabledReason を使う", () => {
    expect(resolveCommandAvailability("edit.open-node-split", baseContext({
      canOpenNodeSplit: false,
      nodeSplitDisabledReason: "分割できるノードが選択されていません。",
    }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "分割できるノードが選択されていません。",
    });
    expect(resolveCommandAvailability("edit.open-node-merge", baseContext({
      canOpenNodeMerge: false,
      nodeMergeDisabledReason: "2 つ以上のノードを選択してください。",
    }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "2 つ以上のノードを選択してください。",
    });
  });

  it("枝に集中 / 集中終了は focusing と canFocusBranch で分かれる", () => {
    expect(resolveCommandAvailability("view.focus-branch", baseContext({ focusing: false, canFocusBranch: true })).enabled).toBe(true);
    expect(resolveCommandAvailability("view.focus-branch", baseContext({ focusing: true, canFocusBranch: true }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "すでに枝に集中しています",
    });
    expect(resolveCommandAvailability("view.focus-clear", baseContext({ focusing: true })).enabled).toBe(true);
    expect(resolveCommandAvailability("view.focus-clear", baseContext({ focusing: false }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "集中表示中ではありません",
    });
  });

  it("表示切替は現在モードと同じとき不可", () => {
    expect(resolveCommandAvailability("view.map", baseContext({ viewMode: "map" }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "すでにマップ表示です",
    });
    expect(resolveCommandAvailability("view.outline", baseContext({ viewMode: "outline" }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "すでにアウトライン表示です",
    });
    expect(resolveCommandAvailability("view.outline", baseContext({ viewMode: "map" })).enabled).toBe(true);
    expect(resolveCommandAvailability("view.map", baseContext({ viewMode: "outline" })).enabled).toBe(true);
  });

  it("保護モード・競合・外部削除は can* に畳み込まず enabled=false にする", () => {
    expect(resolveCommandAvailability("edit.duplicate-branch", baseContext({ isProtectedMode: true }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "保護モードのため実行できません",
    });
    expect(resolveCommandAvailability("edit.delete-node-only", baseContext({ hasConflict: true }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "競合中のため実行できません",
    });
    expect(resolveCommandAvailability("outline.add-root", baseContext({
      viewMode: "outline",
      isExternallyDeleted: true,
    }))).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "マップが外部で削除されているため実行できません",
    });
    // 閲覧系は保護モードでも can* に従う
    expect(resolveCommandAvailability("view.fit-all", baseContext({ isProtectedMode: true, canFitAll: true })).enabled).toBe(true);
    expect(resolveCommandAvailability("edit.undo", baseContext({ isProtectedMode: true, canUndo: true })).enabled).toBe(true);
  });

  it("modeMismatch は保護モードより優先する", () => {
    expect(resolveCommandAvailability("outline.add-root", baseContext({
      viewMode: "map",
      isProtectedMode: true,
    }))).toEqual({
      enabled: false,
      modeMismatch: true,
      disabledReason: "アウトライン表示でのみ利用できます",
    });
  });

  it("未登録 ID は不可を返す", () => {
    expect(resolveCommandAvailability("io.export-json", baseContext())).toEqual({
      enabled: false,
      modeMismatch: false,
      disabledReason: "未知のコマンドです",
    });
  });
});
