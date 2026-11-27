import { isAiAssistBlockedByLearn } from "@/domain/map/mapLearnGuards";
import { isVoiceStructureEditBlocked, MAP_VOICE_MESSAGES } from "@/domain/map/mapVoiceGuards";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

export type AiAssistKind =
  | "branch-summary"
  | "importance"
  | "child-candidates"
  | "classify-reorder"
  | "duplicates"
  | "missing-perspectives";

export type AiAssistEntryBlockers = {
  readonly isProtectedMode: boolean;
  readonly hasConflict: boolean;
  readonly isExternallyDeleted: boolean;
  readonly playingPresentation: boolean;
  readonly learningActive: boolean;
  readonly voiceListening: boolean;
  /** 共同編集中の拒否理由（null / 省略 = 塞がない・inventory P36-AI） */
  readonly collabBlockedReason?: string | null;
};

export type AiAssistEntryAvailability = { enabled: true; rootId: number } | { enabled: false; reason: string };

// 保護・競合・外部削除の文言はコマンドパレット（resolveCommandAvailability の resolveGlobalBlockers）と同じにする
export const AI_ASSIST_ENTRY_MESSAGES = {
  externallyDeleted: "マップが外部で削除されているため実行できません",
  conflict: "競合中のため実行できません",
  protected: "保護モードのため実行できません",
  presentation: "プレゼン再生中は使えません",
  learning: "学習モード中は使えません",
  selectOne: "1 件のノードを選んでください",
  locked: "ロック中のノードには入れられません",
  noDescendants: "子孫が無いため要約できません",
  noUnlocked: "ロックされていないノードがありません",
  tooFewBranchNodes: "枝内にノードが 2 件未満のため実行できません",
  tooFewUnlocked: "ロックされていないノードが 2 件未満のため実行できません",
} as const;

function disabled(reason: string): AiAssistEntryAvailability {
  return { enabled: false, reason };
}

// 右パネルのボタン・コマンドパレット・確認画面の作り直しで同じ判定を使う（L-057・L-058）
export function resolveAiAssistEntryAvailability(
  kind: AiAssistKind,
  nodes: readonly Node[],
  selectedNodeIds: readonly number[],
  blockers: AiAssistEntryBlockers,
): AiAssistEntryAvailability {
  if (blockers.isExternallyDeleted) return disabled(AI_ASSIST_ENTRY_MESSAGES.externallyDeleted);
  if (blockers.hasConflict) return disabled(AI_ASSIST_ENTRY_MESSAGES.conflict);
  if (blockers.isProtectedMode) return disabled(AI_ASSIST_ENTRY_MESSAGES.protected);
  if (blockers.playingPresentation) return disabled(AI_ASSIST_ENTRY_MESSAGES.presentation);
  if (typeof blockers.collabBlockedReason === "string" && blockers.collabBlockedReason.length > 0) {
    return disabled(blockers.collabBlockedReason);
  }
  if (isVoiceStructureEditBlocked(blockers.voiceListening)) {
    return disabled(MAP_VOICE_MESSAGES.listeningBlock);
  }
  if (isAiAssistBlockedByLearn(blockers.learningActive)) return disabled(AI_ASSIST_ENTRY_MESSAGES.learning);
  if (selectedNodeIds.length !== 1) return disabled(AI_ASSIST_ENTRY_MESSAGES.selectOne);
  const rootId = selectedNodeIds[0];
  const root = nodes.find((node) => node.id === rootId);
  if (root === undefined) return disabled(AI_ASSIST_ENTRY_MESSAGES.selectOne);

  const branchIds = collectSubtreeIds(nodes, rootId);

  switch (kind) {
    case "branch-summary":
      if (root.locked === true) return disabled(AI_ASSIST_ENTRY_MESSAGES.locked);
      if (!nodes.some((node) => node.parentId === rootId)) return disabled(AI_ASSIST_ENTRY_MESSAGES.noDescendants);
      return { enabled: true, rootId };
    case "importance":
      if (!nodes.some((node) => branchIds.has(node.id) && node.locked !== true)) {
        return disabled(AI_ASSIST_ENTRY_MESSAGES.noUnlocked);
      }
      return { enabled: true, rootId };
    case "child-candidates":
    case "missing-perspectives":
      if (root.locked === true) return disabled(AI_ASSIST_ENTRY_MESSAGES.locked);
      return { enabled: true, rootId };
    case "classify-reorder":
      if (branchIds.size < 2) return disabled(AI_ASSIST_ENTRY_MESSAGES.tooFewBranchNodes);
      return { enabled: true, rootId };
    case "duplicates": {
      const unlockedCount = nodes.filter((node) => branchIds.has(node.id) && node.locked !== true).length;
      if (unlockedCount < 2) return disabled(AI_ASSIST_ENTRY_MESSAGES.tooFewUnlocked);
      return { enabled: true, rootId };
    }
    default: {
      const neverKind: never = kind;
      return disabled(neverKind);
    }
  }
}

export type AiAssistEntryAvailabilityByKind = {
  readonly summary: AiAssistEntryAvailability;
  readonly importance: AiAssistEntryAvailability;
  readonly child: AiAssistEntryAvailability;
  readonly classify: AiAssistEntryAvailability;
  readonly duplicates: AiAssistEntryAvailability;
  readonly perspectives: AiAssistEntryAvailability;
};

// パネル・コマンドパレット・ダイアログで同じ入口判定を一度に取る
export function resolveAllAiAssistEntryAvailabilities(
  nodes: readonly Node[],
  selectedNodeIds: readonly number[],
  blockers: AiAssistEntryBlockers,
): AiAssistEntryAvailabilityByKind {
  return {
    summary: resolveAiAssistEntryAvailability("branch-summary", nodes, selectedNodeIds, blockers),
    importance: resolveAiAssistEntryAvailability("importance", nodes, selectedNodeIds, blockers),
    child: resolveAiAssistEntryAvailability("child-candidates", nodes, selectedNodeIds, blockers),
    classify: resolveAiAssistEntryAvailability("classify-reorder", nodes, selectedNodeIds, blockers),
    duplicates: resolveAiAssistEntryAvailability("duplicates", nodes, selectedNodeIds, blockers),
    perspectives: resolveAiAssistEntryAvailability("missing-perspectives", nodes, selectedNodeIds, blockers),
  };
}

export function entryAvailabilityForKind(
  kind: AiAssistKind,
  entries: AiAssistEntryAvailabilityByKind,
): AiAssistEntryAvailability {
  switch (kind) {
    case "branch-summary":
      return entries.summary;
    case "importance":
      return entries.importance;
    case "child-candidates":
      return entries.child;
    case "classify-reorder":
      return entries.classify;
    case "duplicates":
      return entries.duplicates;
    case "missing-perspectives":
      return entries.perspectives;
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}
