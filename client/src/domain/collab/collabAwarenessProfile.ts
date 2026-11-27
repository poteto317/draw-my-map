import type { ShareSession } from "@/domain/share/shareSession";

export type CollabAwarenessProfile = {
  userId: string;
  displayName: string;
};

/**
 * ShareSession → awareness 用 profile。
 * 表示名は Google name（ShareOwner.displayName）。email は使わない（設計 必達 100）。
 * name 欠落は null（捏造・email フォールバックしない・L-002）。
 */
export function collabAwarenessProfileFromShareSession(
  session: ShareSession,
): CollabAwarenessProfile | null {
  if (session === null) return null;
  if (typeof session.displayName !== "string" || session.displayName.length === 0) {
    return null;
  }
  return {
    userId: session.userId,
    displayName: session.displayName,
  };
}
