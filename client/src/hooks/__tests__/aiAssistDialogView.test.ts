import { buildDuplicatePairProposals } from "@/domain/aiAssist/aiStructureProposal";
import { buildAiProposalViews } from "@/hooks/aiAssistDialogView";
import { buildImportanceProposals, buildNoteProposal } from "@/domain/aiAssist/aiProposal";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import {
  openAiAssistDialog,
  receiveAiAssistProposals,
  receiveAiAssistStatus,
  startAiAssistGeneration,
  type AiAssistDialogTarget,
} from "@/hooks/aiAssistDialogState";
import { AI_ASSIST_SEND_MESSAGES } from "@/hooks/aiAssistSendPlan";
import { buildAiAssistDialogView } from "@/hooks/aiAssistDialogView";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
import { createTestNode } from "@/testing/createTestNode";

const NONE = { isProtectedMode: false, hasConflict: false, isExternallyDeleted: false, playingPresentation: false,
    learningActive: false };
const STATUS = { available: true, provider: "openai", providerLabel: "OpenAI（GPT API）", model: "gpt-5" } as const;

function target(kind: "branch-summary" | "importance"): AiAssistDialogTarget {
  return { kind, rootId: 1, mapId: "map-a", revision: 0, openedFrom: "panel" };
}

describe("buildAiAssistDialogView", () => {
  it("確認画面に送信先・送るものの件数と文字数・切った件数・重要度で対象外の件数を出す", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "あ".repeat(201) }),
      createTestNode({ id: 3, parentId: 1, label: "ロック", locked: true }),
    ];
    const view = buildAiAssistDialogView(receiveAiAssistStatus(openAiAssistDialog(target("importance")), STATUS), false, nodes, NONE);

    expect(view?.title).toBe("重要度を提案");
    expect(view?.body).toEqual({
      screen: "confirm",
      confirm: {
        providerLabel: "OpenAI（GPT API）", model: "gpt-5", rootLabel: "根",
        descendantCount: 2, totalLength: 1 + 200 + 3, truncatedCount: 1, excludedLockedCount: 1, blockedReason: null,
      },
    });
  });

  it("枝が大きすぎれば理由を出す", () => {
    const nodes = Array.from({ length: 201 }, (_, i) => createTestNode({ id: i + 1, parentId: i === 0 ? null : 1, label: `n${i}` }));
    const view = buildAiAssistDialogView(receiveAiAssistStatus(openAiAssistDialog(target("branch-summary")), STATUS), false, nodes, NONE);
    expect(view?.body.screen === "confirm" && view.body.confirm.blockedReason).toBe(AI_ASSIST_SEND_MESSAGES.tooManyNodes(200));
  });

  it("追記で上限を超えるメモの提案は、追記できない理由と件数を出す（L-057）", () => {
    const nodes = [createTestNode({ id: 1, label: "根", note: "あ".repeat(NODE_NOTE_MAX_LENGTH) }), createTestNode({ id: 2, parentId: 1, label: "子" })];
    const proposal = buildNoteProposal(nodes, 1, "fp", "要約")!;
    const state = receiveAiAssistProposals(
      startAiAssistGeneration(receiveAiAssistStatus(openAiAssistDialog(target("branch-summary")), STATUS)),
      { proposals: [proposal], unchangedCount: 0, missingCount: 0, noteModes: { [proposal.key]: null } },
    );

    const view = buildAiAssistDialogView(state, false, nodes, NONE);

    if (view?.body.screen !== "review") throw new Error("前提");
    expect(view.body.proposals[0]).toMatchObject({
      kind: "note", canAppend: false, mode: null,
      appendBlockedText: "追記すると 10,000 文字を超えます（10,004 文字）",
    });
    expect(view.body.canApply).toBe(false);
  });

  it("重要度の提案は表示名で「中 → 高」のように示し、変更が 0 件なら同じだった件数を状態文にする", () => {
    const nodes = [createTestNode({ id: 1, label: "根" }), createTestNode({ id: 2, parentId: 1, label: "子" })];
    const { proposals } = buildImportanceProposals(nodes, [{ id: 2, importance: "high", reason: "主要" }], [2]);
    const opened = startAiAssistGeneration(receiveAiAssistStatus(openAiAssistDialog(target("importance")), STATUS));

    const withChange = buildAiAssistDialogView(receiveAiAssistProposals(opened, { proposals, unchangedCount: 1, missingCount: 0, noteModes: {} }), false, nodes, NONE);
    const noChange = buildAiAssistDialogView(receiveAiAssistProposals(opened, { proposals: [], unchangedCount: 2, missingCount: 0, noteModes: {} }), false, nodes, NONE);

    if (withChange?.body.screen !== "review") throw new Error("前提");
    expect(withChange.body.proposals[0]).toMatchObject({ kind: "importance", nodeLabel: "子", currentLabel: "中", proposedLabel: "高", reason: "主要" });
    expect(withChange.statusText).toBe("提案が 1 件あります");
    expect(noChange?.statusText).toBe("提案はすべて現在の重要度と同じでした（2 件）");
  });

  it("重要度の提案が 0 件で AI が答えなかった対象があるときは「提案なし」の語を含む状態文にする", () => {
    const nodes = [createTestNode({ id: 1, label: "根" }), createTestNode({ id: 2, parentId: 1, label: "子" })];
    const opened = startAiAssistGeneration(receiveAiAssistStatus(openAiAssistDialog(target("importance")), STATUS));
    const text = (unchangedCount: number, missingCount: number) =>
      buildAiAssistDialogView(receiveAiAssistProposals(opened, { proposals: [], unchangedCount, missingCount, noteModes: {} }), false, nodes, NONE)?.statusText;

    expect(text(0, 2)).toBe("提案はありませんでした（現在と同じ 0 件、提案なし 2 件）");
    expect(text(2, 1)).toBe("提案はありませんでした（現在と同じ 2 件、提案なし 1 件）");
    expect(text(2, 0)).toBe("提案はすべて現在の重要度と同じでした（2 件）");
  });

  it("開いた後にマップが更新されたら stale にし、状態文を STALE_DIALOG_MESSAGE にする", () => {
    const nodes = [createTestNode({ id: 1, label: "根" }), createTestNode({ id: 2, parentId: 1, label: "子" })];
    const view = buildAiAssistDialogView(openAiAssistDialog(target("branch-summary")), true, nodes, NONE);
    expect(view?.stale).toBe(true);
    expect(view?.statusText).toBe(STALE_DIALOG_MESSAGE);
  });
});



test("統合提案のローカル表示で引き継ぐタスクと破棄される属性を示す", () => {
  const nodes = [
    createTestNode({ id: 1, label: "主", task: { completed: true, assignee: "担当" }, customAttributes: [
      { name: "数", type: "number", value: 0 },
    ] }),
    createTestNode({ id: 2, label: "副", task: { completed: false }, customAttributes: [
      { name: "数", type: "date", value: "2024-02-29" },
    ] }),
  ];
  const proposals = buildDuplicatePairProposals(nodes, [
    { primaryId: 1, secondaryId: 2, reason: "同じ作業" },
  ], new Set([1, 2]), "map-a");
  const [view] = buildAiProposalViews(nodes, {
    proposals, unchangedCount: 0, missingCount: 0, noteModes: {}, decisions: {},
    staleKeys: [], noteTooLongKeys: [], applyError: null,
  });
  expect(view).toMatchObject({ kind: "structure", mergeHint: expect.stringContaining("担当者 担当") });
  expect(view).toMatchObject({ mergeHint: expect.stringContaining("同名 1 件を破棄（数）") });
});
