import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

export type AiAssistKind = "branch-summary" | "importance";

export type AiAssistEntryBlockers = {
  readonly isProtectedMode: boolean;
  readonly hasConflict: boolean;
  readonly isExternallyDeleted: boolean;
  readonly playingPresentation: boolean;
};

export type AiAssistEntryAvailability = { enabled: true; rootId: number } | { enabled: false; reason: string };

// 保護・競合・外部削除の文言はコマンドパレット（resolveCommandAvailability の resolveGlobalBlockers）と同じにする
export const AI_ASSIST_ENTRY_MESSAGES = {
  externallyDeleted: "マップが外部で削除されているため実行できません",
  conflict: "競合中のため実行できません",
  protected: "保護モードのため実行できません",
  presentation: "プレゼン再生中は使えません",
  selectOne: "1 件のノードを選んでください",
  locked: "ロック中のノードには入れられません",
  noDescendants: "子孫が無いため要約できません",
  noUnlocked: "ロックされていないノードがありません",
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
  if (selectedNodeIds.length !== 1) return disabled(AI_ASSIST_ENTRY_MESSAGES.selectOne);
  const rootId = selectedNodeIds[0];
  const root = nodes.find((node) => node.id === rootId);
  if (root === undefined) return disabled(AI_ASSIST_ENTRY_MESSAGES.selectOne);

  if (kind === "branch-summary") {
    if (root.locked === true) return disabled(AI_ASSIST_ENTRY_MESSAGES.locked);
    if (!nodes.some((node) => node.parentId === rootId)) return disabled(AI_ASSIST_ENTRY_MESSAGES.noDescendants);
    return { enabled: true, rootId };
  }
  const branchIds = collectSubtreeIds(nodes, rootId);
  if (!nodes.some((node) => branchIds.has(node.id) && node.locked !== true)) {
    return disabled(AI_ASSIST_ENTRY_MESSAGES.noUnlocked);
  }
  return { enabled: true, rootId };
}
