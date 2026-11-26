import type { ShareLocalMetaRead, ShareLocalMetaValue } from "@/domain/share/shareLocalMeta";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";

export type ShareLocalMetaPersistResult =
  | { ok: true }
  | { ok: false; kind: "read-error"; error: string }
  | { ok: false; kind: "write-error"; error: string };

export type ShareLocalMetaPersistPlan =
  | {
      notice: "success";
      localMeta: { status: "present"; value: ShareLocalMetaValue };
    }
  | {
      notice: "error";
      message: string;
      /** read-error のときだけ更新。write-error は現状維持 */
      localMeta: ShareLocalMetaRead | null;
    };

export type ShareLocalMetaClearPlan =
  | {
      notice: "success";
      localMeta: { status: "missing" };
    }
  | {
      notice: "error";
      message: string;
      /** read-error のときだけ更新。write-error は現状維持 */
      localMeta: ShareLocalMetaRead | null;
    };

/**
 * 永続化結果を UI 状態へ写す計画。
 * write-error では present/missing へ偽倒ししない（L-002）。
 */
export function planShareLocalMetaPersist(
  persist: ShareLocalMetaPersistResult,
  nextPresent: ShareLocalMetaValue,
): ShareLocalMetaPersistPlan {
  if (persist.ok) {
    return {
      notice: "success",
      localMeta: { status: "present", value: nextPresent },
    };
  }
  if (persist.kind === "read-error") {
    return {
      notice: "error",
      message: SHARE_MESSAGES.localMetaWriteFailed,
      localMeta: { status: "read-error", error: persist.error },
    };
  }
  return {
    notice: "error",
    message: SHARE_MESSAGES.localMetaWriteFailed,
    localMeta: null,
  };
}

/**
 * 共有解除時のローカルメタ消去結果を UI 状態へ写す計画。
 * write-error では missing へ偽倒ししない（L-002）。
 */
export function planShareLocalMetaClear(
  persist: ShareLocalMetaPersistResult,
): ShareLocalMetaClearPlan {
  if (persist.ok) {
    return {
      notice: "success",
      localMeta: { status: "missing" },
    };
  }
  if (persist.kind === "read-error") {
    return {
      notice: "error",
      message: SHARE_MESSAGES.localMetaWriteFailed,
      localMeta: { status: "read-error", error: persist.error },
    };
  }
  return {
    notice: "error",
    message: SHARE_MESSAGES.localMetaWriteFailed,
    localMeta: null,
  };
}
