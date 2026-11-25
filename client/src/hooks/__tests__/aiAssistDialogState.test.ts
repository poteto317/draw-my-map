import { buildImportanceProposals, buildNoteProposal, type AiProposal } from "@/domain/aiAssist/aiProposal";
import {
  CLOSED_AI_ASSIST_DIALOG,
  acceptedAiProposals,
  closeAiAssistDialog,
  decideAiProposal,
  failAiAssistDialog,
  markAiProposalsStale,
  openAiAssistDialog,
  receiveAiAssistProposals,
  receiveAiAssistStatus,
  retryAiAssistDialog,
  setAiNoteApplyMode,
  startAiAssistGeneration,
  type AiAssistDialogState,
  type AiAssistDialogTarget,
} from "@/hooks/aiAssistDialogState";
import { createTestNode } from "@/testing/createTestNode";

const TARGET: AiAssistDialogTarget = { kind: "branch-summary", rootId: 1, mapId: "map-a", revision: 0, openedFrom: "panel" };
const STATUS = { available: true, provider: "anthropic", providerLabel: "Anthropic（Claude API）", model: "claude-opus-5-5" } as const;
const nodes = [
  createTestNode({ id: 1, label: "根", note: "前" }),
  createTestNode({ id: 2, parentId: 1, label: "子", importance: "low" }),
];
const note = buildNoteProposal(nodes, 1, "fp", "要約")!;
const importance = buildImportanceProposals(nodes, [{ id: 2, importance: "high", reason: "" }], [2]).proposals[0]!;

function reviewState(noteMode: "append" | "replace" | null = "append"): AiAssistDialogState {
  const proposals: AiProposal[] = [note, importance];
  return receiveAiAssistProposals(
    startAiAssistGeneration(receiveAiAssistStatus(openAiAssistDialog(TARGET), STATUS)),
    { proposals, unchangedCount: 0, missingCount: 0, noteModes: { [note.key]: noteMode } },
  );
}

function reviewOf(state: AiAssistDialogState) {
  if (state.screen !== "review") throw new Error(`review ではない: ${state.screen}`);
  return state.review;
}

describe("aiAssistDialogState", () => {
  it("checking → confirm → generating → review。決定はすべて未決から始まる", () => {
    const review = reviewOf(reviewState());
    expect(review.decisions).toEqual({ [note.key]: "undecided", [importance.key]: "undecided" });
    expect(acceptedAiProposals(review)).toEqual([]);
  });

  it("状態の問い合わせで available: false なら unavailable", () => {
    expect(receiveAiAssistStatus(openAiAssistDialog(TARGET), { available: false }).screen).toBe("unavailable");
  });

  it("採用・却下を記録し、採用分だけを適用方法つきで返す", () => {
    let state = decideAiProposal(reviewState(), note.key, "accepted");
    state = decideAiProposal(state, importance.key, "rejected");
    expect(acceptedAiProposals(reviewOf(state))).toEqual([{ proposal: note, mode: "append" }]);
  });

  it("適用方法が未選択のメモの提案は採用にできず、置き換えを選ぶと採用できる（L-057・L-058）", () => {
    const blocked = decideAiProposal(reviewState(null), note.key, "accepted");
    expect(reviewOf(blocked).decisions[note.key]).toBe("undecided");
    const replaced = decideAiProposal(setAiNoteApplyMode(reviewState(null), note.key, "replace"), note.key, "accepted");
    expect(acceptedAiProposals(reviewOf(replaced))).toEqual([{ proposal: note, mode: "replace" }]);
  });

  it("古いと判定された後は採否を変えられず、もう一度で confirm へ戻る", () => {
    const stale = markAiProposalsStale(decideAiProposal(reviewState(), note.key, "accepted"), [note.key]);
    expect(reviewOf(stale).staleKeys).toEqual([note.key]);
    expect(decideAiProposal(stale, importance.key, "accepted")).toBe(stale);
    expect(retryAiAssistDialog(stale).screen).toBe("confirm");
  });

  it("状態の取得の失敗からのもう一度は checking、生成の失敗からは confirm", () => {
    expect(retryAiAssistDialog(failAiAssistDialog(openAiAssistDialog(TARGET), "network")).screen).toBe("checking");
    const generating = startAiAssistGeneration(receiveAiAssistStatus(openAiAssistDialog(TARGET), STATUS));
    expect(retryAiAssistDialog(failAiAssistDialog(generating, "timeout")).screen).toBe("confirm");
  });

  it("閉じると入口へのフォーカスの要求を残す", () => {
    expect(closeAiAssistDialog(reviewState())).toEqual({ screen: "closed", focusRequest: { target: "panel", kind: "branch-summary" } });
    expect(closeAiAssistDialog(CLOSED_AI_ASSIST_DIALOG)).toBe(CLOSED_AI_ASSIST_DIALOG);
  });
});
