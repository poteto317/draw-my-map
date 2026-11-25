import {
  AI_ASSIST_ENTRY_MESSAGES,
  resolveAiAssistEntryAvailability,
  type AiAssistEntryBlockers,
} from "@/domain/aiAssist/aiAssistEntryAvailability";
import { createTestNode } from "@/testing/createTestNode";

const NONE: AiAssistEntryBlockers = { isProtectedMode: false, hasConflict: false, isExternallyDeleted: false, playingPresentation: false };
const nodes = [
  createTestNode({ id: 1, label: "根" }),
  createTestNode({ id: 2, parentId: 1, label: "子" }),
  createTestNode({ id: 3, label: "葉の根" }),
  createTestNode({ id: 4, label: "ロック中の根", locked: true }),
  createTestNode({ id: 5, parentId: 4, label: "ロックされていない子" }),
  createTestNode({ id: 6, label: "全部ロック", locked: true }),
  createTestNode({ id: 7, parentId: 6, label: "ロック中の子", locked: true }),
];

describe("resolveAiAssistEntryAvailability", () => {
  it("1 件の選択で、要約は子孫があれば、重要度はロックされていないノードがあれば有効", () => {
    expect(resolveAiAssistEntryAvailability("branch-summary", nodes, [1], NONE)).toEqual({ enabled: true, rootId: 1 });
    expect(resolveAiAssistEntryAvailability("importance", nodes, [3], NONE)).toEqual({ enabled: true, rootId: 3 });
    expect(resolveAiAssistEntryAvailability("importance", nodes, [4], NONE)).toEqual({ enabled: true, rootId: 4 });
  });

  it.each<[string, "branch-summary" | "importance", readonly number[], Partial<AiAssistEntryBlockers>, string]>([
    ["外部削除", "branch-summary", [1], { isExternallyDeleted: true }, AI_ASSIST_ENTRY_MESSAGES.externallyDeleted],
    ["競合中", "importance", [1], { hasConflict: true }, AI_ASSIST_ENTRY_MESSAGES.conflict],
    ["保護モード", "branch-summary", [1], { isProtectedMode: true }, AI_ASSIST_ENTRY_MESSAGES.protected],
    ["プレゼン再生中", "importance", [1], { playingPresentation: true }, AI_ASSIST_ENTRY_MESSAGES.presentation],
    ["選択なし（関連線・グループの選択中を含む）", "branch-summary", [], {}, AI_ASSIST_ENTRY_MESSAGES.selectOne],
    ["複数選択", "importance", [1, 2], {}, AI_ASSIST_ENTRY_MESSAGES.selectOne],
    ["選択が配列に無い", "importance", [99], {}, AI_ASSIST_ENTRY_MESSAGES.selectOne],
    ["要約でロック中の根", "branch-summary", [4], {}, AI_ASSIST_ENTRY_MESSAGES.locked],
    ["要約で子孫なし", "branch-summary", [3], {}, AI_ASSIST_ENTRY_MESSAGES.noDescendants],
    ["重要度でロックされていないノードなし", "importance", [6], {}, AI_ASSIST_ENTRY_MESSAGES.noUnlocked],
  ])("%s は無効で理由を返す", (_name, kind, selected, blockers, reason) => {
    expect(resolveAiAssistEntryAvailability(kind, nodes, selected, { ...NONE, ...blockers })).toEqual({ enabled: false, reason });
  });

  it("保護・競合・外部削除の文言はコマンドパレットの既存の理由と同じ", () => {
    expect(AI_ASSIST_ENTRY_MESSAGES.protected).toBe("保護モードのため実行できません");
    expect(AI_ASSIST_ENTRY_MESSAGES.conflict).toBe("競合中のため実行できません");
    expect(AI_ASSIST_ENTRY_MESSAGES.externallyDeleted).toBe("マップが外部で削除されているため実行できません");
  });
});
