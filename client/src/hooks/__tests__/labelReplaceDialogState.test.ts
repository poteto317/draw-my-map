import {
  STALE_LABEL_REPLACE_MESSAGE,
  closeLabelReplaceDialog,
  consumeLabelReplaceFocusRequest,
  createLabelReplaceDialogState,
  dismissLabelReplaceDialog,
  failLabelReplaceDialog,
  isLabelReplaceDialogOpen,
  openLabelReplaceDialog,
  resolveLabelReplaceTargetIds,
  setLabelReplaceQuery,
  setLabelReplaceReplacement,
  setLabelReplaceScopeSelectedOnly,
  staleLabelReplaceError,
} from "@/hooks/labelReplaceDialogState";

function opened(selectedIds: readonly number[], mapId = "a") {
  return openLabelReplaceDialog(createLabelReplaceDialogState(), { selectedIds, revision: 3, mapId });
}

describe("labelReplaceDialogState", () => {
  it("閉じた状態から開くと入力を空にし、選択集合と版を記録して検索語へフォーカスを求める", () => {
    const state = opened([4, 7]);

    expect(state).toMatchObject({
      screen: "open",
      mapId: "a",
      openedRevision: 3,
      query: "",
      replacement: "",
      scopeIds: [4, 7],
      focusRequest: "query",
    });
  });

  it.each([
    [0, false],
    [1, false],
    [2, true],
    [5, true],
  ])("選択が %i 件のとき「選択中のノードだけ」の既定は %s", (count, expected) => {
    const ids = Array.from({ length: count }, (_, index) => index + 1);

    expect(opened(ids).scopeSelectedOnly).toBe(expected);
  });

  it("開き直すと前回の入力を持ち越さない", () => {
    const dirty = setLabelReplaceReplacement(setLabelReplaceQuery(opened([1, 2]), "x"), "y");
    const reopened = openLabelReplaceDialog(closeLabelReplaceDialog(dirty), { selectedIds: [], revision: 4, mapId: "a" });

    expect(reopened).toMatchObject({ query: "", replacement: "", scopeIds: [], scopeSelectedOnly: false });
  });

  it("検索語・置換語の変更はエラーを空にして sequence を進める", () => {
    const failed = failLabelReplaceDialog(opened([]), "失敗");
    const typed = setLabelReplaceQuery(failed, "a");

    expect(failed.error.message).toBe("失敗");
    expect(typed.query).toBe("a");
    expect(typed.error).toEqual({ sequence: failed.error.sequence + 1, message: null });
  });

  it("選択が空のときは範囲を切り替えない", () => {
    const state = opened([]);

    expect(setLabelReplaceScopeSelectedOnly(state, true).scopeSelectedOnly).toBe(false);
  });

  it("選択があれば範囲を切り替えられる", () => {
    const state = opened([1]);

    expect(setLabelReplaceScopeSelectedOnly(state, true).scopeSelectedOnly).toBe(true);
    expect(setLabelReplaceScopeSelectedOnly(opened([1, 2]), false).scopeSelectedOnly).toBe(false);
  });

  it("閉じるとヘッダーへのフォーカスを求め、フォーカス要求は一度で消える", () => {
    const closed = closeLabelReplaceDialog(opened([1]));

    expect(closed).toMatchObject({ screen: "closed", focusRequest: "header" });
    expect(consumeLabelReplaceFocusRequest(closed).focusRequest).toBeNull();
    expect(consumeLabelReplaceFocusRequest(consumeLabelReplaceFocusRequest(closed)).focusRequest).toBeNull();
  });

  it("外から閉じる（dismiss）と閉じた状態になり、フォーカスは求めない", () => {
    const dismissed = dismissLabelReplaceDialog(opened([1]));

    expect(dismissed).toMatchObject({ screen: "closed", focusRequest: null });
  });

  it("開いていても mapId が違えば開いていないとみなす（外から閉じた扱い）", () => {
    const state = opened([1], "a");

    expect(isLabelReplaceDialogOpen(state, "a")).toBe(true);
    expect(isLabelReplaceDialogOpen(state, "b")).toBe(false);
    expect(isLabelReplaceDialogOpen(closeLabelReplaceDialog(state), "a")).toBe(false);
  });

  it("stale のエラーは固定の文言で、sequence を進める", () => {
    const error = staleLabelReplaceError({ sequence: 2, message: null });

    expect(error).toEqual({ sequence: 3, message: STALE_LABEL_REPLACE_MESSAGE });
    expect(STALE_LABEL_REPLACE_MESSAGE).toBe("マップが更新されました。閉じてから開き直してください。");
  });

  it("範囲が「選択のみ」なら開いた時点の選択集合、そうでなければ全ノード（null）を対象にする", () => {
    const state = opened([4, 7]);

    expect(resolveLabelReplaceTargetIds(true, state.scopeIds)).toEqual(new Set([4, 7]));
    expect(resolveLabelReplaceTargetIds(false, state.scopeIds)).toBeNull();
    expect(resolveLabelReplaceTargetIds(true, [])).toEqual(new Set());
  });
});
