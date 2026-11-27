import type { CollabParticipant } from "@/domain/collab/collabSessionUi";
import { collabParticipantColor } from "@/domain/collab/collabParticipantColor";

export type CollabAwarenessFields = {
  userId?: unknown;
  displayName?: unknown;
  color?: unknown;
  selectedNodeIds?: unknown;
  viewportCenter?: unknown;
};

/**
 * awareness 1 件を参加者に正規化する（L-002: 必須欠落は成功の空に倒さない）。
 * color 欠落時は userId から安定色を補完（一覧と一致）。
 */
export function parseCollabAwarenessParticipant(
  state: CollabAwarenessFields | null | undefined,
): CollabParticipant | null {
  if (state === null || state === undefined) return null;
  if (typeof state.userId !== "string" || state.userId.length === 0) return null;
  if (typeof state.displayName !== "string" || state.displayName.length === 0) return null;
  const color =
    typeof state.color === "string" && state.color.length > 0
      ? state.color
      : collabParticipantColor(state.userId);
  return {
    userId: state.userId,
    displayName: state.displayName,
    color,
  };
}

/**
 * awareness 状態マップ → 参加者一覧。
 * 欠落エントリは落とす（空配列 = ready かつ 0 件。未取得は呼び出し側が loading/error）。
 */
export function collabParticipantsFromAwarenessStates(
  states: ReadonlyMap<number, CollabAwarenessFields | null>,
): readonly CollabParticipant[] {
  const byUser = new Map<string, CollabParticipant>();
  for (const state of states.values()) {
    const participant = parseCollabAwarenessParticipant(state);
    if (participant === null) continue;
    byUser.set(participant.userId, participant);
  }
  return [...byUser.values()];
}
