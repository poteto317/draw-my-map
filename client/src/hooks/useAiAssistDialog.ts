"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveAiAssistEntryAvailability,
  type AiAssistEntryAvailability,
  type AiAssistEntryBlockers,
  type AiAssistKind,
} from "@/domain/aiAssist/aiAssistEntryAvailability";
import type {
  AcceptedAiProposal,
  AiProposalsApplyOutcome,
  NoteApplyMode,
} from "@/domain/aiAssist/aiProposal";
import {
  CLOSED_AI_ASSIST_DIALOG,
  acceptedAiProposals,
  closeAiAssistDialog,
  consumeAiAssistFocusRequest,
  decideAiProposal,
  failAiAssistDialog,
  failAiProposalsApply,
  markAiProposalsStale,
  openAiAssistDialog,
  receiveAiAssistProposals,
  receiveAiAssistStatus,
  retryAiAssistDialog,
  setAiNoteApplyMode,
  startAiAssistGeneration,
  type AiAssistDialogState,
  type AiAssistFocusRequest,
  type AiAssistOpenedFrom,
  type AiAssistReviewInput,
} from "@/hooks/aiAssistDialogState";
import {
  AI_APPLY_FAILED_MESSAGE,
  AI_NOTE_TOO_LONG_APPLY_MESSAGE,
  aiApplyBlockedMessage,
  buildAiAssistDialogView,
  type AiAssistDialogView,
} from "@/hooks/aiAssistDialogView";
import { buildImportanceReview, buildSummaryReview, planAiAssistSend } from "@/hooks/aiAssistSendPlan";
import { useLatestRef } from "@/hooks/useLatestRef";
import {
  DEFAULT_AI_ASSIST_API,
  toAiAssistClientErrorKind,
  type AiAssistApi,
} from "@/services/aiAssist/aiAssistClient";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

// API は同期で呼び出し（呼び出した処理の中で通信を始める）、同期の throw も Promise の失敗として扱う（L-055）
function startRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return request();
  } catch (error: unknown) {
    return Promise.reject(error);
  }
}

export type UseAiAssistDialogOptions = {
  mapId: string;
  documentRevision: number;
  nodes: readonly Node[];
  // マップ表示では選択集合、アウトライン表示では主選択だけ（MapEditor の importanceTargetIds）
  selectedNodeIds: readonly number[];
  blockers: AiAssistEntryBlockers;
  applyAiProposals: (accepted: readonly AcceptedAiProposal[]) => AiProposalsApplyOutcome;
  publishNotice: (notice: OperationNotice) => void;
  api?: AiAssistApi;
};

export type UseAiAssistDialogReturn = {
  screen: AiAssistDialogState["screen"];
  view: AiAssistDialogView | null;
  summaryEntry: AiAssistEntryAvailability;
  importanceEntry: AiAssistEntryAvailability;
  focusRequest: AiAssistFocusRequest;
  open: (kind: AiAssistKind, openedFrom: AiAssistOpenedFrom) => void;
  close: () => void;
  send: () => void;
  retry: () => void;
  decide: (key: string, decision: "accepted" | "rejected") => void;
  setNoteMode: (key: string, mode: NoteApplyMode) => void;
  apply: () => void;
  consumeFocusRequest: () => void;
};

// AI 支援のダイアログ。通信は同時に 1 件まで（ref で多重送信を防ぐ。L-101・L-653）。
// 閉じる・取り消し・マップ ID か documentRevision の変化・アンマウントで進行中の通信を中断し、古い応答を捨てる（L-037・L-040）
export function useAiAssistDialog(options: UseAiAssistDialogOptions): UseAiAssistDialogReturn {
  const [state, setState] = useState<AiAssistDialogState>(CLOSED_AI_ASSIST_DIALOG);
  const controllerRef = useRef<AbortController | null>(null);
  const submittedRef = useRef(false);
  const stale = state.screen !== "closed"
    && (state.target.mapId !== options.mapId || state.target.revision !== options.documentRevision);
  const { nodes, selectedNodeIds, blockers } = options;
  // 描画のたびに枝をたどらないよう、入力が変わったときだけ作り直す
  const summaryEntry = useMemo(
    () => resolveAiAssistEntryAvailability("branch-summary", nodes, selectedNodeIds, blockers),
    [nodes, selectedNodeIds, blockers],
  );
  const importanceEntry = useMemo(
    () => resolveAiAssistEntryAvailability("importance", nodes, selectedNodeIds, blockers),
    [nodes, selectedNodeIds, blockers],
  );
  const view = useMemo(
    () => buildAiAssistDialogView(state, stale, nodes, blockers),
    [state, stale, nodes, blockers],
  );
  const api = options.api ?? DEFAULT_AI_ASSIST_API;
  // 古いハンドラを呼ばれても、最後に commit された値で判定する
  const latest = useLatestRef({ options, state, stale, api, summaryEntry, importanceEntry });

  const abortInFlight = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => () => abortInFlight(), [abortInFlight]);

  useEffect(() => {
    if (stale) abortInFlight();
  }, [stale, abortInFlight]);

  // 通信を 1 件始め、中断されていなければ結果を状態へ写す。誤りは failed へ。終わったら進行中の印を外す
  const runRequest = useCallback(<T,>(
    request: (signal: AbortSignal) => Promise<T>,
    receive: (prev: AiAssistDialogState, value: T) => AiAssistDialogState,
  ) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    startRequest(() => request(controller.signal))
      .then(
        (value) => {
          if (!controller.signal.aborted) setState((prev) => receive(prev, value));
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setState((prev) => failAiAssistDialog(prev, toAiAssistClientErrorKind(error)));
        },
      )
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
  }, []);

  const runStatusCheck = useCallback(() => {
    const currentApi = latest.current.api;
    runRequest((signal) => currentApi.fetchStatus({ signal }), receiveAiAssistStatus);
  }, [latest, runRequest]);

  const open = useCallback((kind: AiAssistKind, openedFrom: AiAssistOpenedFrom) => {
    const { options: current, state: snapshot, summaryEntry: summary, importanceEntry: importance } = latest.current;
    if (snapshot.screen !== "closed") return;
    const entry = kind === "branch-summary" ? summary : importance;
    if (!entry.enabled) return;
    abortInFlight();
    submittedRef.current = false;
    setState(openAiAssistDialog({
      kind, rootId: entry.rootId, mapId: current.mapId, revision: current.documentRevision, openedFrom,
    }));
    runStatusCheck();
  }, [latest, abortInFlight, runStatusCheck]);

  const close = useCallback(() => {
    abortInFlight();
    setState(closeAiAssistDialog);
  }, [abortInFlight]);

  const send = useCallback(() => {
    const { state: snapshot, options: current, stale: isStale, api: currentApi } = latest.current;
    if (snapshot.screen !== "confirm" || isStale || controllerRef.current !== null) return;
    // 送信の時点の最新の状態から入力を作り直す
    const plan = planAiAssistSend(snapshot.target.kind, current.nodes, snapshot.target.rootId, current.blockers);
    if (!plan.ok) return;

    setState(startAiAssistGeneration);
    const request = (signal: AbortSignal): Promise<AiAssistReviewInput> => (plan.kind === "branch-summary"
      ? currentApi.requestBranchSummary(plan.input, { signal })
        .then((summary) => buildSummaryReview(plan, summary))
      : currentApi.requestImportanceSuggestions(plan.input, plan.targetIds, { signal })
        .then((suggestions) => buildImportanceReview(plan, suggestions)));
    runRequest(request, receiveAiAssistProposals);
  }, [latest, runRequest]);

  const retry = useCallback(() => {
    const { state: snapshot, stale: isStale } = latest.current;
    if (isStale) return;
    if (snapshot.screen === "failed" && snapshot.status === null) {
      // 同じ処理の中の 2 回目は、snapshot がまだ failed でも進行中の問い合わせがあるので何もしない（L-101）
      if (controllerRef.current !== null) return;
      setState(retryAiAssistDialog);
      runStatusCheck();
      return;
    }
    if (snapshot.screen === "failed" || snapshot.screen === "review") {
      submittedRef.current = false;
      setState(retryAiAssistDialog);
    }
  }, [latest, runStatusCheck]);

  const decide = useCallback((key: string, decision: "accepted" | "rejected") => {
    if (latest.current.stale) return;
    setState((prev) => decideAiProposal(prev, key, decision));
  }, [latest]);

  const setNoteMode = useCallback((key: string, mode: NoteApplyMode) => {
    if (latest.current.stale) return;
    setState((prev) => setAiNoteApplyMode(prev, key, mode));
  }, [latest]);

  const apply = useCallback(() => {
    const { state: snapshot, options: current, stale: isStale } = latest.current;
    if (snapshot.screen !== "review" || isStale || submittedRef.current) return;
    if (snapshot.review.staleKeys.length > 0) return;
    const accepted = acceptedAiProposals(snapshot.review);
    // 採用 0 件ではボタンが無効だが、ハンドラでも同じ条件を確かめる（L-058）
    if (accepted.length === 0) return;
    // 一覧の表示中に保護モード・競合・外部削除へ移った場合、applyNonStructuralChange はそれを理由に拒否しないので、
    // 入口だけでなく確定の時点でも止め、入口と同じ文言の理由を添える（L-061）
    const blockedMessage = aiApplyBlockedMessage(current.blockers);
    if (blockedMessage !== null) {
      setState((prev) => failAiProposalsApply(prev, blockedMessage));
      return;
    }

    const outcome = current.applyAiProposals(accepted);
    if (outcome.ok) {
      submittedRef.current = true;
      // 成功したときだけ通知する（L-001）
      current.publishNotice({
        kind: "status",
        message: `AIの提案を ${outcome.appliedCount} 件適用しました。元に戻すで取り消せます。`,
      });
      setState(closeAiAssistDialog);
      return;
    }
    if (outcome.reason === "stale") {
      setState((prev) => markAiProposalsStale(prev, outcome.staleKeys));
      return;
    }
    if (outcome.reason === "note-too-long") {
      const noteKeys = accepted.filter((item) => "mode" in item).map((item) => item.proposal.key);
      setState((prev) => failAiProposalsApply(prev, AI_NOTE_TOO_LONG_APPLY_MESSAGE, noteKeys));
      return;
    }
    setState((prev) => failAiProposalsApply(prev, AI_APPLY_FAILED_MESSAGE));
  }, [latest]);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeAiAssistFocusRequest);
  }, []);

  return {
    screen: state.screen,
    view,
    summaryEntry,
    importanceEntry,
    focusRequest: state.screen === "closed" ? state.focusRequest : null,
    open,
    close,
    send,
    retry,
    decide,
    setNoteMode,
    apply,
    consumeFocusRequest,
  };
}
