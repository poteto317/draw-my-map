import { act, renderHook, waitFor } from "@testing-library/react";
import type { ImportanceSuggestion } from "@/domain/aiAssist/aiAssistOutput";
import type { AiProposalsApplyOutcome } from "@/domain/aiAssist/aiProposal";
import type { AiStructureApplyOutcome } from "@/domain/aiAssist/aiStructureProposal";
import { AI_ASSIST_ENTRY_MESSAGES } from "@/domain/aiAssist/aiAssistEntryAvailability";
import { AI_APPLY_FAILED_MESSAGE, AI_NOTE_TOO_LONG_APPLY_MESSAGE } from "@/hooks/aiAssistDialogApply";
import { AI_ASSIST_SEND_MESSAGES } from "@/hooks/aiAssistSendPlan";
import { useAiAssistDialog, type UseAiAssistDialogOptions } from "@/hooks/useAiAssistDialog";
import {
  AiAssistRequestError,
  describeAiAssistError,
  type AiAssistApi,
  type AiAssistStatus,
} from "@/services/aiAssist/aiAssistClient";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const AVAILABLE: AiAssistStatus = { available: true, provider: "anthropic", providerLabel: "Anthropic（Claude API）", model: "claude-opus-5-5" };
const NONE = { isProtectedMode: false, hasConflict: false, isExternallyDeleted: false, playingPresentation: false };

// 1: 根（メモあり・high）、2: 子A（low）、3: 子B（medium・ロック中）
function baseNodes(): Node[] {
  return [
    createTestNode({ id: 1, label: "根", note: "前のメモ", importance: "high" }),
    createTestNode({ id: 2, parentId: 1, label: "子A", importance: "low" }),
    createTestNode({ id: 3, parentId: 1, label: "子B", importance: "medium", locked: true }),
  ];
}

function setup(overrides: Partial<UseAiAssistDialogOptions> = {}) {
  const status = deferred<AiAssistStatus>();
  const summary = deferred<string>();
  const importance = deferred<ImportanceSuggestion[]>();
  const api: AiAssistApi = {
    fetchStatus: jest.fn(() => status.promise),
    requestBranchSummary: jest.fn(() => summary.promise),
    requestImportanceSuggestions: jest.fn(() => importance.promise),
    requestChildCandidates: jest.fn(),
    requestMissingPerspectives: jest.fn(),
    requestClassifyReorder: jest.fn(),
    requestDuplicatePairs: jest.fn(),
  };
  const applyAiProposals = jest.fn((): AiProposalsApplyOutcome => ({ ok: true, appliedCount: 1 }));
  const applyAiStructureProposals = jest.fn(
    (): AiStructureApplyOutcome => ({ ok: true, appliedCount: 1 }),
  );
  const publishNotice = jest.fn();
  const initialProps: UseAiAssistDialogOptions = {
    mapId: "map-a",
    documentRevision: 0,
    nodes: baseNodes(),
    selectedNodeIds: [1],
    visibleNodeIds: new Set([1, 2, 3]),
    blockers: NONE,
    applyAiProposals,
    applyAiStructureProposals,
    publishNotice,
    api,
    ...overrides,
  };
  const view = renderHook((props: UseAiAssistDialogOptions) => useAiAssistDialog(props), { initialProps });
  return { ...view, api, status, summary, importance, applyAiProposals, publishNotice, initialProps };
}

async function openToConfirm(kind: "branch-summary" | "importance" = "branch-summary") {
  const context = setup();
  act(() => context.result.current.open(kind, "panel"));
  expect(context.result.current.screen).toBe("checking");
  context.status.resolve(AVAILABLE);
  await waitFor(() => expect(context.result.current.screen).toBe("confirm"));
  return context;
}

async function reviewSummary() {
  const context = await openToConfirm();
  act(() => context.result.current.send());
  context.summary.resolve("要約");
  await waitFor(() => expect(context.result.current.screen).toBe("review"));
  return context;
}

describe("useAiAssistDialog", () => {
  it("開くと状態を問い合わせ、確認画面に送信先と送るものを出す", async () => {
    const { result, api } = await openToConfirm();
    expect(api.fetchStatus).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(result.current.view?.body).toMatchObject({
      screen: "confirm",
      confirm: { providerLabel: "Anthropic（Claude API）", model: "claude-opus-5-5", rootLabel: "根", descendantCount: 2, blockedReason: null },
    });
  });

  it("設定が無ければ unavailable", async () => {
    const { result, status } = setup();
    act(() => result.current.open("branch-summary", "panel"));
    status.resolve({ available: false });
    await waitFor(() => expect(result.current.screen).toBe("unavailable"));
  });

  it("状態の取得の失敗はもう一度で問い合わせ直す", async () => {
    const { result, status, api } = setup();
    act(() => result.current.open("branch-summary", "panel"));
    status.reject(new AiAssistRequestError("network"));
    await waitFor(() => expect(result.current.screen).toBe("failed"));
    expect(result.current.view?.body).toEqual({ screen: "failed", message: describeAiAssistError("network") });

    // 2 回目の問い合わせは応答を返さない（失敗済みの deferred を使い回すと act の外で状態が変わる）
    (api.fetchStatus as jest.Mock).mockReturnValueOnce(new Promise<AiAssistStatus>(() => {}));
    act(() => result.current.retry());
    expect(result.current.screen).toBe("checking");
    expect(api.fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("入口が無効なら開かない（L-058）", () => {
    const { result, api } = setup({ blockers: { ...NONE, isProtectedMode: true } });
    expect(result.current.summaryEntry).toEqual({ enabled: false, reason: AI_ASSIST_ENTRY_MESSAGES.protected });
    act(() => result.current.open("branch-summary", "panel"));
    expect(result.current.screen).toBe("closed");
    expect(api.fetchStatus).not.toHaveBeenCalled();
  });

  it("送信は根のメモを除いた枝を送り、提案は未決で、採用 0 件では適用できない（L-687）", async () => {
    const { result, api } = await reviewSummary();
    const sent = (api.requestBranchSummary as jest.Mock).mock.calls[0][0];
    expect(sent.rootId).toBe(1);
    expect(sent.nodes.map((node: { id: number }) => node.id)).toEqual([1, 2, 3]);
    expect(sent.nodes[0]).not.toHaveProperty("note");
    expect(result.current.view?.body).toMatchObject({ screen: "review", acceptedCount: 0, canApply: false });
    if (result.current.view?.body.screen !== "review") throw new Error("前提");
    expect(result.current.view.body.proposals[0]).toMatchObject({ kind: "note", decision: "undecided", mode: "append" });
  });

  it("同じ処理の中で 2 回送っても 1 回しか送らない（L-101）", async () => {
    const { result, api } = await openToConfirm();
    act(() => {
      result.current.send();
      result.current.send();
    });
    expect(api.requestBranchSummary).toHaveBeenCalledTimes(1);
  });

  it("採用して適用すると、成功を通知して閉じ、入口へのフォーカスを要求する（L-001）", async () => {
    const { result, applyAiProposals, publishNotice } = await reviewSummary();

    act(() => result.current.decide("note:1", "accepted"));
    expect(result.current.view?.body).toMatchObject({ acceptedCount: 1, canApply: true });
    act(() => result.current.apply());

    expect(applyAiProposals).toHaveBeenCalledWith([expect.objectContaining({ mode: "append" })]);
    expect(publishNotice).toHaveBeenCalledWith({ kind: "status", message: "AIの提案を 1 件適用しました。元に戻すで取り消せます。" });
    expect(result.current.screen).toBe("closed");
    expect(result.current.focusRequest).toEqual({ target: "panel", kind: "branch-summary" });
  });

  it("採用が無ければ適用を呼ばない（ハンドラでも確かめる。L-058）", async () => {
    const { result, applyAiProposals } = await reviewSummary();
    act(() => result.current.apply());
    expect(applyAiProposals).not.toHaveBeenCalled();
  });

  it("適用で古いと判定されたら何も通知せず、提案に印を付けて作り直しを促す（L-063）", async () => {
    const { result, applyAiProposals, publishNotice } = await reviewSummary();
    applyAiProposals.mockReturnValue({ ok: false, reason: "stale", staleKeys: ["note:1"] });

    act(() => result.current.decide("note:1", "accepted"));
    act(() => result.current.apply());

    expect(publishNotice).not.toHaveBeenCalled();
    expect(result.current.view?.body).toMatchObject({ screen: "review", proposalsStale: true, canApply: false });
    act(() => result.current.retry());
    expect(result.current.screen).toBe("confirm");
  });

  it.each<[AiProposalsApplyOutcome, string]>([
    [{ ok: false, reason: "rejected" }, AI_APPLY_FAILED_MESSAGE],
    [{ ok: false, reason: "nothing-to-apply" }, AI_APPLY_FAILED_MESSAGE],
    [{ ok: false, reason: "note-too-long" }, AI_NOTE_TOO_LONG_APPLY_MESSAGE],
  ])("適用の失敗 %j は誤りを出し、通知しない", async (outcome, message) => {
    const { result, applyAiProposals, publishNotice } = await reviewSummary();
    applyAiProposals.mockReturnValue(outcome);

    act(() => result.current.decide("note:1", "accepted"));
    act(() => result.current.apply());

    expect(publishNotice).not.toHaveBeenCalled();
    expect(result.current.view?.body).toMatchObject({ screen: "review", applyError: message });
  });

  it("生成中に閉じると中断し、後から届いた応答を捨てる（L-040）", async () => {
    const { result, api, summary } = await openToConfirm();
    act(() => result.current.send());
    const signal = (api.requestBranchSummary as jest.Mock).mock.calls[0][1].signal as AbortSignal;

    act(() => result.current.close());
    expect(signal.aborted).toBe(true);
    await act(async () => { summary.resolve("遅れた要約"); });
    expect(result.current.screen).toBe("closed");
  });

  it("生成中に documentRevision が変わると中断し、古いダイアログとして送信・適用を止める（L-037）", async () => {
    const context = await openToConfirm();
    act(() => context.result.current.send());
    const signal = (context.api.requestBranchSummary as jest.Mock).mock.calls[0][1].signal as AbortSignal;

    context.rerender({ ...context.initialProps, documentRevision: 1 });

    expect(signal.aborted).toBe(true);
    expect(context.result.current.view?.stale).toBe(true);
    await act(async () => { context.summary.resolve("古い要約"); });
    expect(context.result.current.screen).toBe("generating");
  });

  it("生成の誤りは文言を出し、もう一度で確認画面へ戻る", async () => {
    const { result, summary } = await openToConfirm();
    act(() => result.current.send());
    summary.reject(new AiAssistRequestError("rate-limited"));
    await waitFor(() => expect(result.current.screen).toBe("failed"));
    expect(result.current.view?.body).toEqual({ screen: "failed", message: describeAiAssistError("rate-limited") });
    act(() => result.current.retry());
    expect(result.current.screen).toBe("confirm");
  });

  it("重要度はロック中を文脈として送り、対象（targetIds）から外し、変わるものだけを提案にする", async () => {
    const { result, api, importance } = await openToConfirm("importance");
    expect(result.current.view?.body).toMatchObject({ screen: "confirm", confirm: { excludedLockedCount: 1 } });

    act(() => result.current.send());
    const [input, targetIds] = (api.requestImportanceSuggestions as jest.Mock).mock.calls[0];
    expect(input.nodes.map((node: { id: number }) => node.id)).toEqual([1, 2, 3]);
    expect(input.nodes[0].note).toBe("前のメモ");
    expect(targetIds).toEqual([1, 2]);

    importance.resolve([{ id: 1, importance: "high", reason: "" }, { id: 2, importance: "medium", reason: "補足" }]);
    await waitFor(() => expect(result.current.screen).toBe("review"));
    expect(result.current.view?.body).toMatchObject({ screen: "review", unchangedCount: 1, missingCount: 0 });
    if (result.current.view?.body.screen !== "review") throw new Error("前提");
    expect(result.current.view.body.proposals.map((proposal) => proposal.key)).toEqual(["importance:2"]);
  });

  it("生成中にマップ ID が変わっても中断し、古いダイアログにする（L-588）", async () => {
    const context = await openToConfirm();
    act(() => context.result.current.send());
    const signal = (context.api.requestBranchSummary as jest.Mock).mock.calls[0][1].signal as AbortSignal;

    context.rerender({ ...context.initialProps, mapId: "map-b" });

    expect(signal.aborted).toBe(true);
    expect(context.result.current.view?.stale).toBe(true);
  });

  it.each<[string, (nodes: Node[]) => Node[], string]>([
    ["根をロック", (nodes) => nodes.map((node) => (node.id === 1 ? { ...node, locked: true as const } : node)), AI_ASSIST_ENTRY_MESSAGES.locked],
    ["根を削除", (nodes) => nodes.filter((node) => node.id === 3).map((node) => ({ ...node, parentId: null })), AI_ASSIST_SEND_MESSAGES.nodeMissing],
  ])("確認画面で%sすると理由を出し、send() は API を呼ばない", async (_name, change, reason) => {
    const context = await openToConfirm();

    context.rerender({ ...context.initialProps, nodes: change(baseNodes()) });

    expect(context.result.current.view?.body).toMatchObject({ screen: "confirm", confirm: { blockedReason: reason } });
    act(() => context.result.current.send());
    expect(context.api.requestBranchSummary).not.toHaveBeenCalled();
    expect(context.result.current.screen).toBe("confirm");
  });

  it("同じ処理の中で 2 回適用しても applyAiProposals は 1 回だけ（submittedRef）", async () => {
    const { result, applyAiProposals } = await reviewSummary();
    act(() => result.current.decide("note:1", "accepted"));

    act(() => {
      result.current.apply();
      result.current.apply();
    });

    expect(applyAiProposals).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Partial<typeof NONE>, string]>([
    ["保護モード", { isProtectedMode: true }, "適用できませんでした（保護モードのため実行できません）。"],
    ["競合中", { hasConflict: true }, "適用できませんでした（競合中のため実行できません）。"],
    ["外部削除", { isExternallyDeleted: true }, "適用できませんでした（マップが外部で削除されているため実行できません）。"],
    // 重なったときは入口と同じ優先順（外部削除 → 競合 → 保護）の理由を出す
    ["保護モードと競合の両方", { isProtectedMode: true, hasConflict: true }, "適用できませんでした（競合中のため実行できません）。"],
  ])("一覧の表示中に%sへ移ったら、確定時にも適用せず理由を添えた誤りを出す", async (_name, blockers, message) => {
    const context = await reviewSummary();
    act(() => context.result.current.decide("note:1", "accepted"));

    context.rerender({ ...context.initialProps, blockers: { ...NONE, ...blockers } });
    act(() => context.result.current.apply());

    expect(context.applyAiProposals).not.toHaveBeenCalled();
    expect(context.publishNotice).not.toHaveBeenCalled();
    expect(context.result.current.view?.body).toMatchObject({ screen: "review", applyError: message });
  });

  it("同じ act の中で retry を 2 回呼んでも fetchStatus は合計 2 回（初回 + 1 回）", async () => {
    const { result, status, api } = setup();
    act(() => result.current.open("branch-summary", "panel"));
    status.reject(new AiAssistRequestError("network"));
    await waitFor(() => expect(result.current.screen).toBe("failed"));
    (api.fetchStatus as jest.Mock).mockReturnValue(new Promise<AiAssistStatus>(() => {}));

    act(() => {
      result.current.retry();
      result.current.retry();
    });

    expect(api.fetchStatus).toHaveBeenCalledTimes(2);
    expect(result.current.screen).toBe("checking");
  });

  it("生成中に documentRevision が変わった後に AbortError が届いても failed にしない（§6）", async () => {
    const context = await openToConfirm();
    act(() => context.result.current.send());

    context.rerender({ ...context.initialProps, documentRevision: 1 });
    await act(async () => { context.summary.reject(new DOMException("", "AbortError")); });

    expect(context.result.current.screen).toBe("generating");
    expect(context.result.current.view?.stale).toBe(true);
  });

  it("checking 中に stale になった後に状態の応答が来ても状態を変えない", async () => {
    const context = setup();
    act(() => context.result.current.open("branch-summary", "panel"));
    const signal = (context.api.fetchStatus as jest.Mock).mock.calls[0][0].signal as AbortSignal;

    context.rerender({ ...context.initialProps, documentRevision: 1 });
    expect(signal.aborted).toBe(true);
    await act(async () => { context.status.resolve(AVAILABLE); });

    expect(context.result.current.screen).toBe("checking");
    expect(context.result.current.view?.stale).toBe(true);
  });

  it("note-too-long の後に置き換えを選ぶと、再度の apply で applyAiProposals がもう一度呼ばれる", async () => {
    const { result, applyAiProposals } = await reviewSummary();
    applyAiProposals.mockReturnValueOnce({ ok: false, reason: "note-too-long" });
    act(() => result.current.decide("note:1", "accepted"));
    act(() => result.current.apply());
    expect(result.current.view?.body).toMatchObject({ screen: "review", applyError: AI_NOTE_TOO_LONG_APPLY_MESSAGE });

    act(() => result.current.setNoteMode("note:1", "replace"));
    act(() => result.current.apply());

    expect(applyAiProposals).toHaveBeenCalledTimes(2);
    expect(applyAiProposals).toHaveBeenLastCalledWith([expect.objectContaining({ mode: "replace" })]);
    expect(result.current.screen).toBe("closed");
  });

  it("requestBranchSummary が同期で throw すると failed になり、もう一度 → 送信で再び API を呼ぶ", async () => {
    const { result, api, summary } = await openToConfirm();
    (api.requestBranchSummary as jest.Mock).mockImplementationOnce(() => {
      throw new AiAssistRequestError("network");
    });

    act(() => result.current.send());
    await waitFor(() => expect(result.current.screen).toBe("failed"));
    expect(result.current.view?.body).toEqual({ screen: "failed", message: describeAiAssistError("network") });

    act(() => result.current.retry());
    expect(result.current.screen).toBe("confirm");
    act(() => result.current.send());
    expect(api.requestBranchSummary).toHaveBeenCalledTimes(2);
    expect(result.current.screen).toBe("generating");
    await act(async () => { summary.resolve("要約"); });
    expect(result.current.screen).toBe("review");
  });

  it("child-candidates は構造提案を applyAiStructureProposals で適用する", async () => {
    const candidates = deferred<{ label: string }[]>();
    const status = deferred<AiAssistStatus>();
    const api: AiAssistApi = {
      fetchStatus: jest.fn(() => status.promise),
      requestBranchSummary: jest.fn(),
      requestImportanceSuggestions: jest.fn(),
      requestChildCandidates: jest.fn(() => candidates.promise),
      requestMissingPerspectives: jest.fn(),
      requestClassifyReorder: jest.fn(),
      requestDuplicatePairs: jest.fn(),
    };
    const applyAiStructureProposals = jest.fn(
      (): AiStructureApplyOutcome => ({ ok: true, appliedCount: 1 }),
    );
    const { result } = renderHook(
      () => useAiAssistDialog({
        mapId: "map-a",
        documentRevision: 0,
        nodes: baseNodes(),
        selectedNodeIds: [1],
        visibleNodeIds: new Set([1, 2, 3]),
        blockers: NONE,
        applyAiProposals: jest.fn(),
        applyAiStructureProposals,
        publishNotice: jest.fn(),
        api,
      }),
    );
    act(() => result.current.open("child-candidates", "panel"));
    status.resolve(AVAILABLE);
    await waitFor(() => expect(result.current.screen).toBe("confirm"));
    act(() => result.current.send());
    candidates.resolve([{ label: "新しい子" }]);
    await waitFor(() => expect(result.current.screen).toBe("review"));
    const key = result.current.view?.body.screen === "review"
      ? result.current.view.body.proposals[0]?.key
      : undefined;
    expect(key).toBeDefined();
    act(() => result.current.decide(key!, "accepted"));
    act(() => result.current.apply());
    expect(applyAiStructureProposals).toHaveBeenCalled();
    expect(result.current.screen).toBe("closed");
  });

  it("アンマウントで進行中の通信を中断する", async () => {
    const { result, api, unmount } = await openToConfirm();
    act(() => result.current.send());
    const signal = (api.requestBranchSummary as jest.Mock).mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
