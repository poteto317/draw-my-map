import {
  AI_APPLY_FAILED_MESSAGE,
  aiApplyBlockedMessage,
  aiAssistApplySuccessMessage,
  aiAssistNoteTooLongApplyMessage,
  planAiAssistApplyFollowUp,
} from "@/hooks/aiAssistDialogApply";

describe("planAiAssistApplyFollowUp", () => {
  it("成功時は件数を返す", () => {
    expect(planAiAssistApplyFollowUp({ ok: true, appliedCount: 3 })).toEqual({ kind: "success", appliedCount: 3 });
  });

  it("stale はキー一覧を返す", () => {
    expect(planAiAssistApplyFollowUp({ ok: false, reason: "stale", staleKeys: ["a"] })).toEqual({
      kind: "stale",
      staleKeys: ["a"],
    });
  });

  it("note-too-long は渡したキーを返す", () => {
    expect(planAiAssistApplyFollowUp({ ok: false, reason: "note-too-long" }, ["note:1"])).toEqual({
      kind: "note-too-long",
      noteKeys: ["note:1"],
    });
  });

  it("その他の失敗は共通メッセージ", () => {
    expect(planAiAssistApplyFollowUp({ ok: false, reason: "placement-failed" })).toEqual({
      kind: "failed",
      message: AI_APPLY_FAILED_MESSAGE,
    });
  });
});

describe("aiAssistApplySuccessMessage", () => {
  it("適用件数を含む", () => {
    expect(aiAssistApplySuccessMessage(2)).toContain("2");
    expect(aiAssistNoteTooLongApplyMessage).toContain("置き換え");
  });
});

describe("aiApplyBlockedMessage", () => {
  const none = { isProtectedMode: false, hasConflict: false, isExternallyDeleted: false, playingPresentation: false,
    learningActive: false, voiceListening: false };

  it.each<[string, Partial<typeof none>, string | null]>([
    ["止める理由が無ければ null", {}, null],
    ["プレゼン再生中だけでは確定を止めない（null）", { playingPresentation: true }, null],
    ["保護モード", { isProtectedMode: true }, "適用できませんでした（保護モードのため実行できません）。"],
    ["競合中", { hasConflict: true }, "適用できませんでした（競合中のため実行できません）。"],
    ["外部削除が最優先", { isExternallyDeleted: true, hasConflict: true, isProtectedMode: true }, "適用できませんでした（マップが外部で削除されているため実行できません）。"],
  ])("%s", (_name, blockers, expected) => {
    expect(aiApplyBlockedMessage({ ...none, ...blockers })).toBe(expected);
  });
});