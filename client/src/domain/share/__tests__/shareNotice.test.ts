import {
  clearShareNotice,
  clearShareSuccessOnRevisionChange,
  createEmptyShareNotice,
  publishShareError,
  publishShareSuccess,
} from "@/domain/share/shareNotice";

describe("shareNotice (L-166)", () => {
  it("成功で直前の error を置換する", () => {
    let state = createEmptyShareNotice();
    state = publishShareError(state, "失敗");
    expect(state.notice).toEqual({ kind: "error", message: "失敗" });
    state = publishShareSuccess(state, "成功");
    expect(state.notice).toEqual({ kind: "status", message: "成功" });
    expect(state.sequence).toBe(2);
  });

  it("同一文言の再成功でも sequence が進み再読み上げできる", () => {
    let state = createEmptyShareNotice();
    state = publishShareSuccess(state, "完了");
    const first = state.sequence;
    state = publishShareSuccess(state, "完了");
    expect(state.notice?.message).toBe("完了");
    expect(state.sequence).toBe(first + 1);
  });

  it("clear で枠を空にする（ダイアログ閉鎖・再試行開始）", () => {
    let state = publishShareError(createEmptyShareNotice(), "失敗");
    state = clearShareNotice(state);
    expect(state.notice).toBeNull();
  });

  it("documentRevision 変化では成功 status だけ消す", () => {
    const withStatus = publishShareSuccess(createEmptyShareNotice(), "公開しました");
    expect(clearShareSuccessOnRevisionChange(withStatus).notice).toBeNull();

    const withError = publishShareError(createEmptyShareNotice(), "失敗");
    expect(clearShareSuccessOnRevisionChange(withError)).toBe(withError);
  });
});
