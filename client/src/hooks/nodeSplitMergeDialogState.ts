import {
  NODE_SEPARATOR_CUSTOM_ID,
  NODE_SEPARATOR_PRESETS,
  SPLIT_DEFAULT_SEPARATOR,
  findSeparatorPresetId,
  resolveSeparator,
} from "@/domain/nodes/nodeSeparator";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";

// 分割は開いた時点の主選択の 1 ノード、統合は開いた時点の選択集合（配列順）と主選択
export type NodeSplitMergeTarget =
  | { kind: "split"; nodeId: number }
  | { kind: "merge"; ids: readonly number[]; primaryId: number | null };

export type NodeSplitMergeError = { sequence: number; message: string | null };
export type NodeSplitMergeFocusRequest = "separator" | "header" | null;

export type NodeSplitMergeDialogState = {
  screen: "closed" | "open";
  mapId: string;
  openedRevision: number;
  target: NodeSplitMergeTarget | null;
  // プリセットの id、または NODE_SEPARATOR_CUSTOM_ID
  separatorPreset: string;
  customSeparator: string;
  focusRequest: NodeSplitMergeFocusRequest;
  error: NodeSplitMergeError;
};

function nextError(previous: NodeSplitMergeError, message: string | null): NodeSplitMergeError {
  return { sequence: previous.sequence + 1, message };
}

export function createNodeSplitMergeDialogState(): NodeSplitMergeDialogState {
  return {
    screen: "closed",
    mapId: "",
    openedRevision: 0,
    target: null,
    separatorPreset: findSeparatorPresetId(SPLIT_DEFAULT_SEPARATOR),
    customSeparator: "",
    focusRequest: null,
    error: { sequence: 0, message: null },
  };
}

export type OpenNodeSplitMergeDialogInput = {
  target: NodeSplitMergeTarget;
  defaultSeparator: string;
  revision: number;
  mapId: string;
};

// 開くたびに区切り文字を既定値へ戻す（前回の入力は持ち越さない）。既定値がプリセットに無ければ「その他」の入力にする
export function openNodeSplitMergeDialog(
  state: NodeSplitMergeDialogState,
  opened: OpenNodeSplitMergeDialogInput,
): NodeSplitMergeDialogState {
  const separatorPreset = findSeparatorPresetId(opened.defaultSeparator);
  return {
    ...state,
    screen: "open",
    mapId: opened.mapId,
    openedRevision: opened.revision,
    target: opened.target,
    separatorPreset,
    customSeparator: separatorPreset === NODE_SEPARATOR_CUSTOM_ID ? opened.defaultSeparator : "",
    focusRequest: "separator",
    error: nextError(state.error, null),
  };
}

export function closeNodeSplitMergeDialog(state: NodeSplitMergeDialogState): NodeSplitMergeDialogState {
  return { ...state, screen: "closed", focusRequest: "header" };
}

// マップの切り替えなど外から閉じるときは、ヘッダーのボタンへフォーカスを求めない（L-762）
export function dismissNodeSplitMergeDialog(state: NodeSplitMergeDialogState): NodeSplitMergeDialogState {
  return { ...state, screen: "closed", focusRequest: null };
}

// 知らない id は無視する
export function setNodeSeparatorPreset(state: NodeSplitMergeDialogState, presetId: string): NodeSplitMergeDialogState {
  const known = presetId === NODE_SEPARATOR_CUSTOM_ID || NODE_SEPARATOR_PRESETS.some((preset) => preset.id === presetId);
  if (!known) return state;
  return { ...state, separatorPreset: presetId, error: nextError(state.error, null) };
}

export function setNodeSeparatorCustom(state: NodeSplitMergeDialogState, customSeparator: string): NodeSplitMergeDialogState {
  return { ...state, customSeparator, error: nextError(state.error, null) };
}

export function failNodeSplitMergeDialog(state: NodeSplitMergeDialogState, message: string): NodeSplitMergeDialogState {
  return { ...state, error: nextError(state.error, message) };
}

export function consumeNodeSplitMergeFocusRequest(state: NodeSplitMergeDialogState): NodeSplitMergeDialogState {
  return state.focusRequest === null ? state : { ...state, focusRequest: null };
}

// 現在の入力が表す区切り文字（プレビューと確定で同じ値を使う）
export function currentNodeSeparator(state: NodeSplitMergeDialogState): string {
  return resolveSeparator(state.separatorPreset, state.customSeparator);
}

// 開いた後に文書が変わったときに表示する誤り。状態には残さない
export function staleNodeSplitMergeError(error: NodeSplitMergeError): NodeSplitMergeError {
  return nextError(error, STALE_DIALOG_MESSAGE);
}

// 別のマップへ切り替わった後に古い状態が残っていても、開いていないものとして扱う（外から閉じた扱い。フォーカスは奪わない）
export function isNodeSplitMergeDialogOpen(state: NodeSplitMergeDialogState, mapId: string): boolean {
  return state.screen === "open" && state.mapId === mapId;
}
