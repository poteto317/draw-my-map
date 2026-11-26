import type { OperationNotice } from "@/types/operationNotice";

/** 共有通知枠。sequence で同一文言の再読み上げ（L-166） */
export type ShareNoticeState = {
  sequence: number;
  notice: OperationNotice | null;
};

export function createEmptyShareNotice(): ShareNoticeState {
  return { sequence: 0, notice: null };
}

export function clearShareNotice(state: ShareNoticeState): ShareNoticeState {
  if (state.notice === null) return state;
  return { sequence: state.sequence + 1, notice: null };
}

export function publishShareNotice(
  state: ShareNoticeState,
  notice: OperationNotice,
): ShareNoticeState {
  return { sequence: state.sequence + 1, notice };
}

/** 成功 notice は直前の error を置換する（L-166） */
export function publishShareSuccess(
  state: ShareNoticeState,
  message: string,
): ShareNoticeState {
  return publishShareNotice(state, { kind: "status", message });
}

export function publishShareError(
  state: ShareNoticeState,
  message: string,
): ShareNoticeState {
  return publishShareNotice(state, { kind: "error", message });
}

/**
 * documentRevision 変化時: 共有成功 status だけ消す（error は残してよい）。
 * §11.1「文書 documentRevision 変化（ローカル編集）→ 共有成功 status は消してよい」
 */
export function clearShareSuccessOnRevisionChange(
  state: ShareNoticeState,
): ShareNoticeState {
  if (state.notice === null || state.notice.kind !== "status") {
    return state;
  }
  return clearShareNotice(state);
}
