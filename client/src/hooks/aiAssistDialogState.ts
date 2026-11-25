import type { AiAssistKind } from "@/domain/aiAssist/aiAssistEntryAvailability";
import type {
  AcceptedAiProposal,
  AiProposal,
  AiProposalDecision,
  NoteApplyMode,
} from "@/domain/aiAssist/aiProposal";
import type { AcceptedAiStructureProposal } from "@/domain/aiAssist/aiStructureProposal";
import type { AiAssistClientErrorKind, AiAssistStatus } from "@/services/aiAssist/aiAssistClient";

export type AiAssistOpenedFrom = "panel" | "palette";
export type AiAssistAvailableStatus = Extract<AiAssistStatus, { available: true }>;

// 開いた時点で固定する対象（L-037・L-588）
export type AiAssistDialogTarget = {
  kind: AiAssistKind;
  rootId: number;
  mapId: string;
  revision: number;
  openedFrom: AiAssistOpenedFrom;
};

export type AiAssistReviewInput = {
  proposals: readonly AiProposal[];
  unchangedCount: number;
  missingCount: number;
  // メモの提案の適用方法。null は未選択（追記で上限を超えるとき）
  noteModes: Readonly<Record<string, NoteApplyMode | null>>;
};

export type AiAssistReview = AiAssistReviewInput & {
  decisions: Readonly<Record<string, AiProposalDecision>>;
  // 適用の時点で古いと判定された提案。1 件でもあれば一覧全体を古いとして扱う
  staleKeys: readonly string[];
  noteTooLongKeys: readonly string[];
  applyError: string | null;
};

export type AiAssistFocusRequest = { target: AiAssistOpenedFrom; kind: AiAssistKind } | null;

export type AiAssistDialogState =
  | { screen: "closed"; focusRequest: AiAssistFocusRequest }
  | { screen: "checking"; target: AiAssistDialogTarget }
  | { screen: "unavailable"; target: AiAssistDialogTarget }
  | { screen: "confirm"; target: AiAssistDialogTarget; status: AiAssistAvailableStatus }
  | { screen: "generating"; target: AiAssistDialogTarget; status: AiAssistAvailableStatus }
  | { screen: "review"; target: AiAssistDialogTarget; status: AiAssistAvailableStatus; review: AiAssistReview }
  | {
    screen: "failed";
    target: AiAssistDialogTarget;
    // null は状態の問い合わせの失敗（もう一度で checking へ戻る）
    status: AiAssistAvailableStatus | null;
    errorKind: AiAssistClientErrorKind;
  };

export const CLOSED_AI_ASSIST_DIALOG: AiAssistDialogState = { screen: "closed", focusRequest: null };

export function openAiAssistDialog(target: AiAssistDialogTarget): AiAssistDialogState {
  return { screen: "checking", target };
}

export function receiveAiAssistStatus(state: AiAssistDialogState, status: AiAssistStatus): AiAssistDialogState {
  if (state.screen !== "checking") return state;
  return status.available
    ? { screen: "confirm", target: state.target, status }
    : { screen: "unavailable", target: state.target };
}

export function failAiAssistDialog(state: AiAssistDialogState, errorKind: AiAssistClientErrorKind): AiAssistDialogState {
  if (state.screen === "checking") return { screen: "failed", target: state.target, status: null, errorKind };
  if (state.screen === "generating") return { screen: "failed", target: state.target, status: state.status, errorKind };
  return state;
}

export function startAiAssistGeneration(state: AiAssistDialogState): AiAssistDialogState {
  if (state.screen !== "confirm") return state;
  return { screen: "generating", target: state.target, status: state.status };
}

export function receiveAiAssistProposals(state: AiAssistDialogState, input: AiAssistReviewInput): AiAssistDialogState {
  if (state.screen !== "generating") return state;
  const decisions: Record<string, AiProposalDecision> = {};
  for (const proposal of input.proposals) decisions[proposal.key] = "undecided";
  return {
    screen: "review",
    target: state.target,
    status: state.status,
    review: { ...input, decisions, staleKeys: [], noteTooLongKeys: [], applyError: null },
  };
}

function updateReview(
  state: AiAssistDialogState,
  update: (review: AiAssistReview) => AiAssistReview,
): AiAssistDialogState {
  if (state.screen !== "review") return state;
  return { ...state, review: update(state.review) };
}

export function decideAiProposal(
  state: AiAssistDialogState,
  key: string,
  decision: "accepted" | "rejected",
): AiAssistDialogState {
  if (state.screen !== "review" || state.review.staleKeys.length > 0) return state;
  // 適用方法が未選択のメモの提案は採用にしない（UI でも押せないが、ハンドラでも同じ条件を確かめる。L-058）
  if (decision === "accepted" && state.review.noteModes[key] === null) return state;
  return updateReview(state, (review) => ({
    ...review,
    decisions: { ...review.decisions, [key]: decision },
    applyError: null,
  }));
}

export function setAiNoteApplyMode(state: AiAssistDialogState, key: string, mode: NoteApplyMode): AiAssistDialogState {
  if (state.screen !== "review" || state.review.staleKeys.length > 0) return state;
  return updateReview(state, (review) => ({
    ...review,
    noteModes: { ...review.noteModes, [key]: mode },
    noteTooLongKeys: review.noteTooLongKeys.filter((item) => item !== key),
    applyError: null,
  }));
}

export function markAiProposalsStale(state: AiAssistDialogState, staleKeys: readonly string[]): AiAssistDialogState {
  return updateReview(state, (review) => ({ ...review, staleKeys, applyError: null }));
}

export function failAiProposalsApply(
  state: AiAssistDialogState,
  message: string,
  noteTooLongKeys: readonly string[] = [],
): AiAssistDialogState {
  return updateReview(state, (review) => ({ ...review, applyError: message, noteTooLongKeys }));
}

// もう一度: 状態の取得の失敗は checking、生成の失敗と提案の作り直しは confirm（最新の状態から入力を作り直す）
export function retryAiAssistDialog(state: AiAssistDialogState): AiAssistDialogState {
  if (state.screen === "failed") {
    return state.status === null
      ? { screen: "checking", target: state.target }
      : { screen: "confirm", target: state.target, status: state.status };
  }
  if (state.screen === "review") return { screen: "confirm", target: state.target, status: state.status };
  return state;
}

export function closeAiAssistDialog(state: AiAssistDialogState): AiAssistDialogState {
  if (state.screen === "closed") return state;
  return { screen: "closed", focusRequest: { target: state.target.openedFrom, kind: state.target.kind } };
}

export function consumeAiAssistFocusRequest(state: AiAssistDialogState): AiAssistDialogState {
  return state.screen === "closed" && state.focusRequest !== null ? CLOSED_AI_ASSIST_DIALOG : state;
}

export function acceptedAiProposals(review: AiAssistReview): AcceptedAiProposal[] {
  return review.proposals.flatMap((proposal): AcceptedAiProposal[] => {
    if (review.decisions[proposal.key] !== "accepted") return [];
    if (proposal.kind === "importance") return [{ proposal }];
    if (proposal.kind !== "note") return [];
    const mode = review.noteModes[proposal.key];
    return mode === null || mode === undefined ? [] : [{ proposal, mode }];
  });
}

export function acceptedAiStructureProposals(review: AiAssistReview): AcceptedAiStructureProposal[] {
  return review.proposals.flatMap((proposal): AcceptedAiStructureProposal[] => {
    if (review.decisions[proposal.key] !== "accepted") return [];
    if (proposal.kind === "merge-pair") {
      return [{ proposal }];
    }
    if (
      proposal.kind === "add-child"
      || proposal.kind === "add-sibling"
      || proposal.kind === "reparent"
      || proposal.kind === "reorder-siblings"
    ) {
      return [{ proposal }];
    }
    return [];
  });
}

export function acceptedAiReviewCount(review: AiAssistReview): number {
  return acceptedAiProposals(review).length + acceptedAiStructureProposals(review).length;
}
