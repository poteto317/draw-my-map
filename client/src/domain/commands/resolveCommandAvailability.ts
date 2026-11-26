import { getCommandDefinition } from "@/domain/commands/commandCatalog";
import { MAP_VOICE_MESSAGES } from "@/domain/map/mapVoiceGuards";
import type {
  CommandAvailability,
  CommandAvailabilityContext,
  CommandId,
} from "@/domain/commands/commandTypes";

const MAP_ONLY_IDS = new Set<CommandId>([
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
]);

const OUTLINE_ONLY_IDS = new Set<CommandId>([
  "outline.add-root",
  "outline.add-child",
  "outline.add-sibling",
  "outline.begin-edit",
]);

const MUTATING_IDS = new Set<CommandId>([
  "edit.duplicate-branch",
  "edit.delete-node-only",
  "edit.insert-parent",
  "edit.move-sibling-up",
  "edit.move-sibling-down",
  "edit.indent",
  "edit.outdent",
  "edit.open-label-replace",
  "edit.open-branch-move",
  "edit.open-node-split",
  "edit.open-node-merge",
  "edit.open-ai-branch-summary",
  "edit.open-ai-importance",
  "edit.open-ai-child-candidates",
  "edit.open-ai-classify-reorder",
  "edit.open-ai-duplicates",
  "edit.open-ai-missing-perspectives",
  "edit.register-part",
  "edit.insert-part",
  "edit.delete-part",
  "outline.add-root",
  "outline.add-child",
  "outline.add-sibling",
  "outline.begin-edit",
]);

function disabled(reason: string, modeMismatch = false): CommandAvailability {
  return { enabled: false, modeMismatch, disabledReason: reason };
}

function enabled(): CommandAvailability {
  return { enabled: true, modeMismatch: false, disabledReason: null };
}

function fromFlag(can: boolean, reason: string): CommandAvailability {
  return can ? enabled() : disabled(reason);
}

function resolveModeMismatch(
  id: CommandId,
  context: CommandAvailabilityContext,
): CommandAvailability | null {
  if (MAP_ONLY_IDS.has(id) && context.viewMode === "outline") {
    return disabled("マップ表示でのみ利用できます", true);
  }
  if (OUTLINE_ONLY_IDS.has(id) && context.viewMode === "map") {
    return disabled("アウトライン表示でのみ利用できます", true);
  }
  return null;
}

function resolveGlobalBlockers(
  id: CommandId,
  context: CommandAvailabilityContext,
): CommandAvailability | null {
  if (!MUTATING_IDS.has(id)) return null;
  if (context.isExternallyDeleted) {
    return disabled("マップが外部で削除されているため実行できません");
  }
  if (context.hasConflict) {
    return disabled("競合中のため実行できません");
  }
  if (context.isProtectedMode) {
    return disabled("保護モードのため実行できません");
  }
  if (context.learningActive) {
    return disabled("学習モード中は使えません");
  }
  if (context.voiceListening) {
    return disabled(MAP_VOICE_MESSAGES.listeningBlock);
  }
  return null;
}

function resolveVoiceListeningBlockers(
  id: CommandId,
  context: CommandAvailabilityContext,
): CommandAvailability | null {
  if (!context.voiceListening) return null;
  if (id === "voice-input.stop" || id === "edit.undo" || id === "edit.redo") return null;
  if (id === "view.map" || id === "view.outline") {
    return disabled(MAP_VOICE_MESSAGES.listeningBlock);
  }
  if (
    id === "learn.start"
    || id === "learn.reset-progress"
    || id === "learn.generate-cards"
  ) {
    return disabled(MAP_VOICE_MESSAGES.listeningBlock);
  }
  return null;
}

function resolveOperationAvailability(
  id: CommandId,
  context: CommandAvailabilityContext,
): CommandAvailability {
  switch (id) {
    case "view.map":
      return context.viewMode === "map"
        ? disabled("すでにマップ表示です")
        : enabled();
    case "view.outline":
      return context.viewMode === "outline"
        ? disabled("すでにアウトライン表示です")
        : enabled();
    case "view.fit-all":
      return fromFlag(context.canFitAll, "合わせる対象がありません");
    case "view.fit-selection":
      return fromFlag(context.canFitSelection, "選択中のノードがありません");
    case "view.focus-branch":
      if (context.focusing) return disabled("すでに枝に集中しています");
      return fromFlag(context.canFocusBranch, "集中できる枝が選択されていません");
    case "view.focus-clear":
      return context.focusing ? enabled() : disabled("集中表示中ではありません");
    case "view.expand-subtree":
      return fromFlag(context.canExpandSubtree, "展開できる枝が選択されていません");
    case "view.collapse-subtree":
      return fromFlag(context.canCollapseSubtree, "折りたためる枝が選択されていません");
    case "edit.undo":
      return fromFlag(context.canUndo, "元に戻せる操作がありません");
    case "edit.redo":
      return fromFlag(context.canRedo, "やり直せる操作がありません");
    case "edit.duplicate-branch":
      return fromFlag(context.canDuplicate, "複製できるノードが選択されていません");
    case "edit.delete-node-only":
      return fromFlag(context.canDeleteNodeOnly, "削除できるノードが選択されていません");
    case "edit.insert-parent":
      return fromFlag(context.canInsertParent, "親を挿入できるノードが選択されていません");
    case "edit.move-sibling-up":
      return fromFlag(context.canMoveSiblingUp, "これ以上上へ移動できません");
    case "edit.move-sibling-down":
      return fromFlag(context.canMoveSiblingDown, "これ以上下へ移動できません");
    case "edit.indent":
      return fromFlag(context.canIndent, "階層を下げられません");
    case "edit.outdent":
      return fromFlag(context.canOutdent, "階層を上げられません");
    case "edit.open-label-replace":
      return fromFlag(context.canOpenLabelReplace, "置換できるノードがありません");
    case "edit.open-branch-move":
      return fromFlag(context.canOpenBranchMove, "移動できる枝が選択されていません");
    case "edit.open-node-split":
      return fromFlag(
        context.canOpenNodeSplit,
        context.nodeSplitDisabledReason ?? "分割できるノードが選択されていません。",
      );
    case "edit.open-node-merge":
      return fromFlag(
        context.canOpenNodeMerge,
        context.nodeMergeDisabledReason ?? "2 つ以上のノードを選択してください。",
      );
    case "edit.open-ai-branch-summary":
      return fromFlag(
        context.canOpenAiBranchSummary,
        context.aiBranchSummaryDisabledReason ?? "要約できるノードが選択されていません",
      );
    case "edit.open-ai-importance":
      return fromFlag(
        context.canOpenAiImportance,
        context.aiImportanceDisabledReason ?? "重要度を提案できるノードが選択されていません",
      );
    case "edit.open-ai-child-candidates":
      return fromFlag(
        context.canOpenAiChildCandidates,
        context.aiChildCandidatesDisabledReason ?? "子の候補を提案できるノードが選択されていません",
      );
    case "edit.open-ai-classify-reorder":
      return fromFlag(
        context.canOpenAiClassifyReorder,
        context.aiClassifyReorderDisabledReason ?? "分類・並べ替えを提案できるノードが選択されていません",
      );
    case "edit.open-ai-duplicates":
      return fromFlag(
        context.canOpenAiDuplicates,
        context.aiDuplicatesDisabledReason ?? "重複・類似を検出できるノードが選択されていません",
      );
    case "edit.open-ai-missing-perspectives":
      return fromFlag(
        context.canOpenAiMissingPerspectives,
        context.aiMissingPerspectivesDisabledReason ?? "不足観点を提案できるノードが選択されていません",
      );
    case "edit.register-part":
      return fromFlag(
        context.canRegisterPart,
        "部品にするノードを 1 つだけ選んでください。",
      );
    case "edit.insert-part":
      return fromFlag(context.canInsertPart, "挿入できる部品がありません。");
    case "edit.delete-part":
      return fromFlag(context.canDeletePart, "削除できる部品がありません。");
    case "search.focus-in-map":
      return fromFlag(context.canFocusInMapSearch, "マップ内検索を開けません");
    case "search.open-cross-map":
      return fromFlag(context.canOpenCrossMapSearch, "全マップ検索を開けません");
    case "outline.add-root":
      return fromFlag(context.outlineCanAddRoot, "ルートを追加できません");
    case "outline.add-child":
      return fromFlag(context.outlineCanAddRelated, "子を追加できません");
    case "outline.add-sibling":
      return fromFlag(context.outlineCanAddRelated, "兄弟を追加できません");
    case "outline.begin-edit":
      return fromFlag(context.outlineCanEdit, "ラベルを編集できません");
    case "voice-input.start":
      return fromFlag(
        context.canVoiceInputStart,
        context.voiceStartDisabledReason ?? MAP_VOICE_MESSAGES.unsupported,
      );
    case "voice-input.stop":
      return fromFlag(context.canVoiceInputStop, "音声入力は開始されていません");
    case "learn.start":
      return fromFlag(
        context.canLearnStart,
        context.learnStartDisabledReason ?? "学習を開始できません",
      );
    case "learn.end":
      return fromFlag(context.canLearnEnd, "学習を終了できません");
    case "learn.reset-progress":
      return fromFlag(
        context.canLearnReset,
        context.learnResetDisabledReason ?? "進捗をリセットできません",
      );
    case "learn.generate-cards":
      return fromFlag(
        context.canLearnGenerateCards,
        context.learnGenerateDisabledReason ?? "復習カードを生成できません",
      );
    case "learn.open-cards":
      return fromFlag(
        context.canLearnOpenCards,
        "学習モード中のみ実行できます",
      );
    default:
      return disabled("未知のコマンドです");
  }
}

export function resolveCommandAvailability(
  id: CommandId,
  context: CommandAvailabilityContext,
): CommandAvailability {
  if (getCommandDefinition(id) === undefined) {
    return disabled("未知のコマンドです");
  }

  const modeMismatch = resolveModeMismatch(id, context);
  if (modeMismatch !== null) return modeMismatch;

  const globalBlock = resolveGlobalBlockers(id, context);
  if (globalBlock !== null) return globalBlock;

  const voiceBlock = resolveVoiceListeningBlockers(id, context);
  if (voiceBlock !== null) return voiceBlock;

  return resolveOperationAvailability(id, context);
}
