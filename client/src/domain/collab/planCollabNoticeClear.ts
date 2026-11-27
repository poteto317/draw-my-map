import type { CollabSessionUi } from "@/domain/collab/collabSessionUi";
import type { OperationNotice } from "@/types/operationNotice";

/**
 * セッション状態遷移に伴う notice クリア方針（L-166）。
 * error 中は触らない。status 通知は idle/active でも残す。
 */
export type CollabNoticeClearPlan =
  | { action: "noop" }
  | { action: "clear" }
  | { action: "clear-unless-status" };

export function planCollabNoticeClear(input: {
  previousStatus: CollabSessionUi["status"];
  nextStatus: CollabSessionUi["status"];
}): CollabNoticeClearPlan {
  if (input.previousStatus === input.nextStatus) return { action: "noop" };
  if (input.nextStatus === "error") return { action: "noop" };
  if (input.previousStatus === "idle" && input.nextStatus === "connecting") {
    return { action: "clear" };
  }
  if (input.nextStatus === "idle" || input.nextStatus === "active") {
    return { action: "clear-unless-status" };
  }
  return { action: "noop" };
}

/** clear-unless-status 用。status 通知以外を消すか判定 */
export function shouldClearNonStatusNotice(notice: OperationNotice | null | undefined): boolean {
  return notice?.kind !== "status";
}
