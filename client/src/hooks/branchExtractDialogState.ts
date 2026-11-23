export type BranchExtractFocusRequest = "dialog" | "header" | null;
export type BranchExtractError = { sequence: number; message: string | null };

import type { Node } from "@/types/node";

export type BranchExtractDialogState = {
  screen: "closed" | "open";
  sourceId: number | null;
  openedRevision: number;
  focusRequest: BranchExtractFocusRequest;
  error: BranchExtractError;
};

const STALE_MESSAGE = "マップが更新されました。閉じてから切り出す枝を選び直してください。";

function nextError(previous: BranchExtractError, message: string | null): BranchExtractError {
  return { sequence: previous.sequence + 1, message };
}

export function createBranchExtractDialogState(): BranchExtractDialogState {
  return {
    screen: "closed",
    sourceId: null,
    openedRevision: 0,
    focusRequest: null,
    error: { sequence: 0, message: null },
  };
}

export function openBranchExtractDialog(
  state: BranchExtractDialogState,
  opened: { sourceId: number; revision: number },
): BranchExtractDialogState {
  return {
    ...state,
    screen: "open",
    sourceId: opened.sourceId,
    openedRevision: opened.revision,
    focusRequest: "dialog",
    error: nextError(state.error, null),
  };
}

export function closeBranchExtractDialog(state: BranchExtractDialogState): BranchExtractDialogState {
  return { ...state, screen: "closed", focusRequest: "header" };
}

export function failBranchExtractDialog(state: BranchExtractDialogState, message: string): BranchExtractDialogState {
  return { ...state, error: nextError(state.error, message) };
}

export function consumeBranchExtractFocusRequest(state: BranchExtractDialogState): BranchExtractDialogState {
  return state.focusRequest === null ? state : { ...state, focusRequest: null };
}

export function canSubmitBranchExtract(input: {
  state: BranchExtractDialogState;
  source: Node | undefined;
  stale: boolean;
}): boolean {
  return input.state.screen === "open"
    && input.state.sourceId !== null
    && input.source !== undefined
    && !input.stale;
}

export function staleBranchExtractError(error: BranchExtractError): BranchExtractError {
  return nextError(error, STALE_MESSAGE);
}