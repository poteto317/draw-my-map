import type { CommandId } from "@/domain/commands/commandTypes";
import type { EditorViewMode } from "@/components/layout/EditorViewModeControl";
import type { SiblingReorderDirection } from "@/domain/nodes/nodeSiblingOrder";
import type { NodeIndentDirection } from "@/domain/nodes/nodeIndent";

/** MapEditor が注入する即時コア。各関数は副作用のみ（可否は呼び出し前に解決済み） */
export type CommandPaletteImmediateCoreHandlers = {
  applyViewMode: (mode: EditorViewMode) => void;
  fitAll: () => void;
  fitSelection: () => void;
  focusBranch: () => boolean;
  clearFocus: () => void;
  expandSubtree: () => boolean;
  collapseSubtree: () => boolean;
  undo: () => void;
  redo: () => void;
  duplicateBranch: () => void;
  deleteNodeOnly: () => void;
  insertParent: () => void;
  moveSibling: (direction: SiblingReorderDirection) => void;
  changeIndent: (direction: NodeIndentDirection) => void;
  focusInMapSearch: () => void;
  addOutlineRoot: () => void;
  addOutlineChild: () => void;
  addOutlineSibling: () => void;
  beginOutlineEdit: () => boolean;
  startLearn: () => boolean;
  endLearn: () => boolean;
  generateLearnCards: () => boolean;
};

export type CommandPaletteDialogHandlers = {
  openLabelReplace: () => void;
  openBranchMove: () => void;
  openNodeSplit: () => void;
  openNodeMerge: () => void;
  openAiBranchSummary: () => void;
  openAiImportance: () => void;
  openAiChildCandidates: () => void;
  openAiClassifyReorder: () => void;
  openAiDuplicates: () => void;
  openAiMissingPerspectives: () => void;
  openCrossMapSearch: () => void;
  openRegisterPart: () => void;
  openInsertPart: () => void;
  openDeletePart: () => void;
  openLearnReset: () => void;
  openLearnCards: () => void;
};

/**
 * コマンド ID → 即時コア。未対応 ID やガード失敗は false（成功 notice を出さない）。
 */
export function runCommandPaletteImmediateCore(
  id: CommandId,
  handlers: CommandPaletteImmediateCoreHandlers,
): boolean {
  switch (id) {
    case "view.map":
      handlers.applyViewMode("map");
      return true;
    case "view.outline":
      handlers.applyViewMode("outline");
      return true;
    case "view.fit-all":
      handlers.fitAll();
      return true;
    case "view.fit-selection":
      handlers.fitSelection();
      return true;
    case "view.focus-branch":
      return handlers.focusBranch();
    case "view.focus-clear":
      handlers.clearFocus();
      return true;
    case "view.expand-subtree":
      return handlers.expandSubtree();
    case "view.collapse-subtree":
      return handlers.collapseSubtree();
    case "edit.undo":
      handlers.undo();
      return true;
    case "edit.redo":
      handlers.redo();
      return true;
    case "edit.duplicate-branch":
      handlers.duplicateBranch();
      return true;
    case "edit.delete-node-only":
      handlers.deleteNodeOnly();
      return true;
    case "edit.insert-parent":
      handlers.insertParent();
      return true;
    case "edit.move-sibling-up":
      handlers.moveSibling("up");
      return true;
    case "edit.move-sibling-down":
      handlers.moveSibling("down");
      return true;
    case "edit.indent":
      handlers.changeIndent("indent");
      return true;
    case "edit.outdent":
      handlers.changeIndent("outdent");
      return true;
    case "search.focus-in-map":
      handlers.focusInMapSearch();
      return true;
    case "outline.add-root":
      handlers.addOutlineRoot();
      return true;
    case "outline.add-child":
      handlers.addOutlineChild();
      return true;
    case "outline.add-sibling":
      handlers.addOutlineSibling();
      return true;
    case "outline.begin-edit":
      return handlers.beginOutlineEdit();
    case "learn.start":
      return handlers.startLearn();
    case "learn.end":
      return handlers.endLearn();
    case "learn.generate-cards":
      return handlers.generateLearnCards();
    default:
      return false;
  }
}

/** opensDialog 系: 既存 open* のみ。未対応は false */
export function openCommandPaletteDialog(
  id: CommandId,
  handlers: CommandPaletteDialogHandlers,
): boolean {
  switch (id) {
    case "edit.open-label-replace":
      handlers.openLabelReplace();
      return true;
    case "edit.open-branch-move":
      handlers.openBranchMove();
      return true;
    case "edit.open-node-split":
      handlers.openNodeSplit();
      return true;
    case "edit.open-node-merge":
      handlers.openNodeMerge();
      return true;
    case "edit.open-ai-branch-summary":
      handlers.openAiBranchSummary();
      return true;
    case "edit.open-ai-importance":
      handlers.openAiImportance();
      return true;
    case "edit.open-ai-child-candidates":
      handlers.openAiChildCandidates();
      return true;
    case "edit.open-ai-classify-reorder":
      handlers.openAiClassifyReorder();
      return true;
    case "edit.open-ai-duplicates":
      handlers.openAiDuplicates();
      return true;
    case "edit.open-ai-missing-perspectives":
      handlers.openAiMissingPerspectives();
      return true;
    case "search.open-cross-map":
      handlers.openCrossMapSearch();
      return true;
    case "edit.register-part":
      handlers.openRegisterPart();
      return true;
    case "edit.insert-part":
      handlers.openInsertPart();
      return true;
    case "edit.delete-part":
      handlers.openDeletePart();
      return true;
    case "learn.reset-progress":
      handlers.openLearnReset();
      return true;
    case "learn.open-cards":
      handlers.openLearnCards();
      return true;
    default:
      return false;
  }
}
