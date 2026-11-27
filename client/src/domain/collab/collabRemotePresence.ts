import type { CollabAwarenessFields } from "@/domain/collab/collabAwarenessParticipants";
import { collabParticipantColor } from "@/domain/collab/collabParticipantColor";

/**
 * 他者 presence（awareness 正規化後）。
 * viewportCenter が無い awareness からは作らない（null 埋めしない・L-002）。
 */
export type RemotePresence = {
  userId: string;
  displayName: string;
  color: string;
  selectedNodeIds: readonly number[];
  viewportCenter: { x: number; y: number };
};

export type PresenceMaps = {
  /** キーあり + [] = 明示的に未選択。キー無し = 未取得／非共有 */
  remoteSelections: ReadonlyMap<string, readonly number[]>;
  /** キー無し = 未取得／非共有（null で埋めない） */
  remoteViewports: ReadonlyMap<string, { x: number; y: number }>;
};

export const EMPTY_REMOTE_SELECTIONS: ReadonlyMap<string, readonly number[]> = new Map();
export const EMPTY_REMOTE_VIEWPORTS: ReadonlyMap<string, { x: number; y: number }> = new Map();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseSelectedNodeIds(value: unknown): readonly number[] | null {
  if (!Array.isArray(value)) return null;
  const ids: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    ids.push(item);
  }
  return ids;
}

function parseViewportCenter(value: unknown): { x: number; y: number } | null {
  if (value === null || value === undefined || typeof value !== "object") return null;
  const record = value as { x?: unknown; y?: unknown };
  if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y)) return null;
  return { x: record.x, y: record.y };
}

/**
 * awareness 1 件を RemotePresence に正規化する。
 * 必須欠落は null（成功の空選択／空中心に倒さない・L-002）。
 */
export function parseRemotePresence(
  state: CollabAwarenessFields | null | undefined,
): RemotePresence | null {
  if (state === null || state === undefined) return null;
  if (typeof state.userId !== "string" || state.userId.length === 0) return null;
  if (typeof state.displayName !== "string" || state.displayName.length === 0) return null;
  const selectedNodeIds = parseSelectedNodeIds(state.selectedNodeIds);
  if (selectedNodeIds === null) return null;
  const viewportCenter = parseViewportCenter(state.viewportCenter);
  if (viewportCenter === null) return null;
  const color =
    typeof state.color === "string" && state.color.length > 0
      ? state.color
      : collabParticipantColor(state.userId);
  return {
    userId: state.userId,
    displayName: state.displayName,
    color,
    selectedNodeIds,
    viewportCenter,
  };
}

export type RemotePresenceFromAwarenessOptions = {
  /** 自分の userId。指定時は remote から除外 */
  excludeUserId?: string;
};

/**
 * awareness 状態マップ → RemotePresence 一覧。
 * 欠落エントリは落とす（空配列 = 他者 0 件。未取得は呼び出し側が区別）。
 */
export function remotePresencesFromAwarenessStates(
  states: ReadonlyMap<number, CollabAwarenessFields | null>,
  options: RemotePresenceFromAwarenessOptions = {},
): readonly RemotePresence[] {
  const byUser = new Map<string, RemotePresence>();
  for (const state of states.values()) {
    const presence = parseRemotePresence(state);
    if (presence === null) continue;
    if (options.excludeUserId !== undefined && presence.userId === options.excludeUserId) {
      continue;
    }
    byUser.set(presence.userId, presence);
  }
  return [...byUser.values()];
}

/** RemotePresence → PresenceLayer 用 Maps（キー欠落 ≠ 空選択） */
export function buildPresenceMaps(presences: readonly RemotePresence[]): PresenceMaps {
  const remoteSelections = new Map<string, readonly number[]>();
  const remoteViewports = new Map<string, { x: number; y: number }>();
  for (const presence of presences) {
    remoteSelections.set(presence.userId, presence.selectedNodeIds);
    remoteViewports.set(presence.userId, presence.viewportCenter);
  }
  return { remoteSelections, remoteViewports };
}
