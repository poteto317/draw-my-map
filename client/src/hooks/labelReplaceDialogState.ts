export type LabelReplaceError = { sequence: number; message: string | null };
export type LabelReplaceFocusRequest = "query" | "header" | null;

export type LabelReplaceDialogState = {
  screen: "closed" | "open";
  mapId: string;
  openedRevision: number;
  query: string;
  replacement: string;
  scopeSelectedOnly: boolean;
  // 開いた時点の選択集合（ノード配列順）。開いている間は変えない
  scopeIds: readonly number[];
  focusRequest: LabelReplaceFocusRequest;
  error: LabelReplaceError;
};

export const STALE_LABEL_REPLACE_MESSAGE = "マップが更新されました。閉じてから開き直してください。";

function nextError(previous: LabelReplaceError, message: string | null): LabelReplaceError {
  return { sequence: previous.sequence + 1, message };
}

export function createLabelReplaceDialogState(): LabelReplaceDialogState {
  return {
    screen: "closed",
    mapId: "",
    openedRevision: 0,
    query: "",
    replacement: "",
    scopeSelectedOnly: false,
    scopeIds: [],
    focusRequest: null,
    error: { sequence: 0, message: null },
  };
}

export function openLabelReplaceDialog(
  state: LabelReplaceDialogState,
  opened: { selectedIds: readonly number[]; revision: number; mapId: string },
): LabelReplaceDialogState {
  return {
    ...state,
    screen: "open",
    mapId: opened.mapId,
    openedRevision: opened.revision,
    query: "",
    replacement: "",
    // 1 件は単なるクリックでも起きるため、2 件以上のときだけ既定で絞る
    scopeSelectedOnly: opened.selectedIds.length >= 2,
    scopeIds: opened.selectedIds,
    focusRequest: "query",
    error: nextError(state.error, null),
  };
}

export function closeLabelReplaceDialog(state: LabelReplaceDialogState): LabelReplaceDialogState {
  // 入力は持ち越さない。残すと useDeferredValue の遅れた値に前回の検索語が残り、開き直した直後の入力で無関係なプレビューが出る
  return { ...state, screen: "closed", query: "", replacement: "", focusRequest: "header" };
}

// マップの切り替えなど外から閉じるときは、ヘッダーのボタンへフォーカスを求めない（L-762）
export function dismissLabelReplaceDialog(state: LabelReplaceDialogState): LabelReplaceDialogState {
  return { ...state, screen: "closed", query: "", replacement: "", focusRequest: null };
}

export function setLabelReplaceQuery(state: LabelReplaceDialogState, query: string): LabelReplaceDialogState {
  return { ...state, query, error: nextError(state.error, null) };
}

export function setLabelReplaceReplacement(
  state: LabelReplaceDialogState,
  replacement: string,
): LabelReplaceDialogState {
  return { ...state, replacement, error: nextError(state.error, null) };
}

export function setLabelReplaceScopeSelectedOnly(
  state: LabelReplaceDialogState,
  scopeSelectedOnly: boolean,
): LabelReplaceDialogState {
  if (state.scopeIds.length === 0) return state;
  return { ...state, scopeSelectedOnly, error: nextError(state.error, null) };
}

export function failLabelReplaceDialog(state: LabelReplaceDialogState, message: string): LabelReplaceDialogState {
  return { ...state, error: nextError(state.error, message) };
}

export function consumeLabelReplaceFocusRequest(state: LabelReplaceDialogState): LabelReplaceDialogState {
  return state.focusRequest === null ? state : { ...state, focusRequest: null };
}

// 置換の対象にするノードの ID。範囲が「選択のみ」なら開いた時点の選択集合、そうでなければ全ノード（null）。
// プレビューと確定で同じ範囲を使うため、ここで一元化する
export function resolveLabelReplaceTargetIds(
  scopeSelectedOnly: boolean,
  scopeIds: readonly number[],
): ReadonlySet<number> | null {
  return scopeSelectedOnly ? new Set(scopeIds) : null;
}

// 開いた後に文書が変わったときに表示する誤り。状態には残さない
export function staleLabelReplaceError(error: LabelReplaceError): LabelReplaceError {
  return nextError(error, STALE_LABEL_REPLACE_MESSAGE);
}

// 別のマップへ切り替わった後に古い状態が残っていても、開いていないものとして扱う（外から閉じた扱い。フォーカスは奪わない）
export function isLabelReplaceDialogOpen(state: LabelReplaceDialogState, mapId: string): boolean {
  return state.screen === "open" && state.mapId === mapId;
}
