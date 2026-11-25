"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  entryAvailabilityForKind,
  resolveAllAiAssistEntryAvailabilities,
  type AiAssistEntryAvailability,
  type AiAssistEntryAvailabilityByKind,
  type AiAssistEntryBlockers,
  type AiAssistKind,
} from "@/domain/aiAssist/aiAssistEntryAvailability";
import type {
  AcceptedAiProposal,
  AiProposalsApplyOutcome,
  NoteApplyMode,
} from "@/domain/aiAssist/aiProposal";
import type {
  AcceptedAiStructureProposal,
  AiStructureApplyOutcome,
} from "@/domain/aiAssist/aiStructureProposal";
import {
  CLOSED_AI_ASSIST_DIALOG,
  acceptedAiProposals,
  acceptedAiStructureProposals,
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
  aiApplyBlockedMessage,
  aiAssistApplySuccessMessage,
  aiAssistNoteTooLongApplyMessage,
  planAiAssistApplyFollowUp,
} from "@/hooks/aiAssistDialogApply";
import {
  buildAiAssistDialogView,
  type AiAssistDialogView,
} from "@/hooks/aiAssistDialogView";
import {
  isStructureAssistKind,
  planAiAssistSend,
  requestAiAssistReview,
} from "@/hooks/aiAssistSendPlan";
import { useLatestRef } from "@/hooks/useLatestRef";
import {
  DEFAULT_AI_ASSIST_API,
  toAiAssistClientErrorKind,
  type AiAssistApi,
} from "@/services/aiAssist/aiAssistClient";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

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
  selectedNodeIds: readonly number[];
  visibleNodeIds: ReadonlySet<number>;
  blockers: AiAssistEntryBlockers;
  applyAiProposals: (accepted: readonly AcceptedAiProposal[]) => AiProposalsApplyOutcome;
  applyAiStructureProposals: (
    accepted: readonly AcceptedAiStructureProposal[],
    visibleNodeIds: ReadonlySet<number>,
    currentMapId: string,
  ) => AiStructureApplyOutcome;
  publishNotice: (notice: OperationNotice) => void;
  api?: AiAssistApi;
};

export type UseAiAssistDialogReturn = {
  screen: AiAssistDialogState["screen"];
  view: AiAssistDialogView | null;
  summaryEntry: AiAssistEntryAvailability;
  importanceEntry: AiAssistEntryAvailability;
  childEntry: AiAssistEntryAvailability;
  classifyEntry: AiAssistEntryAvailability;
  duplicatesEntry: AiAssistEntryAvailability;
  perspectivesEntry: AiAssistEntryAvailability;
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

export function useAiAssistDialog(options: UseAiAssistDialogOptions): UseAiAssistDialogReturn {
  const [state, setState] = useState<AiAssistDialogState>(CLOSED_AI_ASSIST_DIALOG);
  const controllerRef = useRef<AbortController | null>(null);
  const submittedRef = useRef(false);
  const stale = state.screen !== "closed"
    && (state.target.mapId !== options.mapId || state.target.revision !== options.documentRevision);
  const { nodes, selectedNodeIds, blockers } = options;
  const entries = useMemo(
    () => resolveAllAiAssistEntryAvailabilities(nodes, selectedNodeIds, blockers),
    [nodes, selectedNodeIds, blockers],
  );
  const { summary: summaryEntry, importance: importanceEntry, child: childEntry, classify: classifyEntry, duplicates: duplicatesEntry, perspectives: perspectivesEntry } = entries;
  const view = useMemo(
    () => buildAiAssistDialogView(state, stale, nodes, blockers),
    [state, stale, nodes, blockers],
  );
  const api = options.api ?? DEFAULT_AI_ASSIST_API;
  const latest = useLatestRef({
    options, state, stale, api, summaryEntry, importanceEntry, childEntry, classifyEntry, duplicatesEntry, perspectivesEntry,
  });

  const abortInFlight = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => () => abortInFlight(), [abortInFlight]);

  useEffect(() => {
    if (stale) abortInFlight();
  }, [stale, abortInFlight]);

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
    const {
      options: current, state: snapshot, summaryEntry: summary, importanceEntry: importance,
      childEntry: child, classifyEntry: classify, duplicatesEntry: duplicates, perspectivesEntry: perspectives,
    } = latest.current;
    if (snapshot.screen !== "closed") return;
    const entry = entryAvailabilityForKind(kind, {
      summary, importance, child, classify, duplicates, perspectives,
    } satisfies AiAssistEntryAvailabilityByKind);
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
    const plan = planAiAssistSend(snapshot.target.kind, current.nodes, snapshot.target.rootId, current.blockers);
    if (!plan.ok) return;

    setState(startAiAssistGeneration);
    const request = (signal: AbortSignal) => requestAiAssistReview(
      plan,
      {
        api: currentApi,
        nodes: current.nodes,
        visibleNodeIds: current.visibleNodeIds,
        mapId: current.mapId,
      },
      { signal },
    );
    runRequest(request, receiveAiAssistProposals);
  }, [latest, runRequest]);

  const retry = useCallback(() => {
    const { state: snapshot, stale: isStale } = latest.current;
    if (isStale) return;
    if (snapshot.screen === "failed" && snapshot.status === null) {
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
    const blockedMessage = aiApplyBlockedMessage(current.blockers);
    if (blockedMessage !== null) {
      setState((prev) => failAiProposalsApply(prev, blockedMessage));
      return;
    }

    const kind = snapshot.target.kind;
    const applyFollowUp = (
      outcome: AiProposalsApplyOutcome | AiStructureApplyOutcome,
      noteTooLongKeys?: readonly string[],
    ) => {
      const followUp = planAiAssistApplyFollowUp(outcome, noteTooLongKeys);
      if (followUp.kind === "success") {
        submittedRef.current = true;
        current.publishNotice({ kind: "status", message: aiAssistApplySuccessMessage(followUp.appliedCount) });
        setState(closeAiAssistDialog);
        return;
      }
      if (followUp.kind === "stale") {
        setState((prev) => markAiProposalsStale(prev, followUp.staleKeys));
        return;
      }
      if (followUp.kind === "note-too-long") {
        setState((prev) => failAiProposalsApply(prev, aiAssistNoteTooLongApplyMessage, followUp.noteKeys));
        return;
      }
      setState((prev) => failAiProposalsApply(prev, followUp.message));
    };

    if (isStructureAssistKind(kind)) {
      const accepted = acceptedAiStructureProposals(snapshot.review);
      if (accepted.length === 0) return;
      applyFollowUp(current.applyAiStructureProposals(accepted, current.visibleNodeIds, current.mapId));
      return;
    }

    const accepted = acceptedAiProposals(snapshot.review);
    if (accepted.length === 0) return;
    const noteTooLongKeys = accepted.filter((item) => "mode" in item).map((item) => item.proposal.key);
    applyFollowUp(current.applyAiProposals(accepted), noteTooLongKeys);
  }, [latest]);

  const consumeFocusRequest = useCallback(() => {
    setState(consumeAiAssistFocusRequest);
  }, []);

  return {
    screen: state.screen,
    view,
    summaryEntry,
    importanceEntry,
    childEntry,
    classifyEntry,
    duplicatesEntry,
    perspectivesEntry,
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
