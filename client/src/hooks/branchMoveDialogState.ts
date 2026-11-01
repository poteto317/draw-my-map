import type { MapIndexEntry } from "@/domain/mapLibrary/mapIndex";
import type { Node } from "@/types/node";

export type BranchMoveMapTarget = Pick<MapIndexEntry, "id" | "name" | "updatedAt">;
export type BranchMoveFocusRequest = "dialog" | "header" | null;
export type BranchMoveError = { sequence: number; message: string | null };

export type BranchMoveDialogState = {
  screen: "closed" | "open";
  sourceId: number | null;
  openedRevision: number;
  targetMapId: string;
  parentTarget: string; // "" は未選択、BRANCH_MOVE_ROOT_TARGET は新しいルート、それ以外はノードID
  focusRequest: BranchMoveFocusRequest;
  error: BranchMoveError;
};

type BranchMoveDialogSubmitInput = {
  state: BranchMoveDialogState;
  source: Node | undefined;
  stale: boolean;
  mapMoveTargets: readonly BranchMoveMapTarget[];
  sameMap: boolean;
  allowRoot: boolean;
  parentCandidates: readonly Node[];
};

export const BRANCH_MOVE_ROOT_TARGET = "root";
const STALE_MESSAGE = "マップが更新されました。閉じてから移動する枝を選び直してください。";

function nextError(previous: BranchMoveError, message: string | null): BranchMoveError {
  return { sequence: previous.sequence + 1, message };
}

export function createBranchMoveDialogState(mapId: string): BranchMoveDialogState {
  return {
    screen: "closed",
    sourceId: null,
    openedRevision: 0,
    targetMapId: mapId,
    parentTarget: "",
    focusRequest: null,
    error: { sequence: 0, message: null },
  };
}

export function openBranchMoveDialog(
  state: BranchMoveDialogState,
  opened: { sourceId: number | null; revision: number; mapId: string },
): BranchMoveDialogState {
  return {
    ...state,
    screen: "open",
    sourceId: opened.sourceId,
    openedRevision: opened.revision,
    targetMapId: opened.mapId,
    parentTarget: "",
    focusRequest: "dialog",
    error: nextError(state.error, null),
  };
}

export function closeBranchMoveDialog(state: BranchMoveDialogState): BranchMoveDialogState {
  return { ...state, screen: "closed", focusRequest: "header" };
}

export function selectBranchMoveTargetMap(state: BranchMoveDialogState, targetMapId: string): BranchMoveDialogState {
  return { ...state, targetMapId, parentTarget: "", error: nextError(state.error, null) };
}

export function selectBranchMoveParentTarget(state: BranchMoveDialogState, parentTarget: string): BranchMoveDialogState {
  return { ...state, parentTarget, error: nextError(state.error, null) };
}

export function failBranchMoveDialog(state: BranchMoveDialogState, message: string): BranchMoveDialogState {
  return { ...state, error: nextError(state.error, message) };
}

export function consumeBranchMoveFocusRequest(state: BranchMoveDialogState): BranchMoveDialogState {
  return state.focusRequest === null ? state : { ...state, focusRequest: null };
}

// 開いた後に文書が変わったときに表示する誤り。状態には残さない
export function staleBranchMoveError(error: BranchMoveError): BranchMoveError {
  return nextError(error, STALE_MESSAGE);
}

export function toBranchMoveParentId(parentTarget: string): number | null {
  return parentTarget === BRANCH_MOVE_ROOT_TARGET ? null : Number(parentTarget);
}

function isValidParentTarget(
  parentTarget: string,
  allowRoot: boolean,
  parentCandidates: readonly Node[],
): boolean {
  return parentTarget === BRANCH_MOVE_ROOT_TARGET
    ? allowRoot
    : parentCandidates.some((node) => String(node.id) === parentTarget);
}

export function canSubmitBranchMove({
  state,
  source,
  stale,
  mapMoveTargets,
  sameMap,
  allowRoot,
  parentCandidates,
}: BranchMoveDialogSubmitInput): boolean {
  return state.screen === "open"
    && !stale
    && source !== undefined
    && mapMoveTargets.some((map) => map.id === state.targetMapId)
    && (!sameMap || isValidParentTarget(state.parentTarget, allowRoot, parentCandidates));
}
