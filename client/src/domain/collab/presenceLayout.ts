import { collabParticipantColor } from "@/domain/collab/collabParticipantColor";
import type { CollabParticipant } from "@/domain/collab/collabSessionUi";
import type { Node } from "@/types/node";
import type { Viewport } from "@/types/viewport";

/** 他者ビューポート枠の画面上サイズ（ワールド寸法は共有しないため固定 px） */
export const PRESENCE_VIEWPORT_FRAME_WIDTH_PX = 160;
export const PRESENCE_VIEWPORT_FRAME_HEIGHT_PX = 100;

export type PresenceSelectionOutline = {
  key: string;
  userId: string;
  nodeId: number;
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  label: string;
};

export type PresenceViewportFrame = {
  key: string;
  userId: string;
  left: number;
  top: number;
  color: string;
  label: string;
  name: string | null;
};

function worldToScreen(point: { x: number; y: number }, viewport: Viewport) {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  };
}

function participantLookup(participants: readonly CollabParticipant[]) {
  const byId = new Map(participants.map((p) => [p.userId, p]));
  return {
    color(userId: string): string {
      return byId.get(userId)?.color ?? collabParticipantColor(userId);
    },
    /** Google 表示名のみ。欠落時は null（userId / Google sub をラベルに出さない） */
    displayName(userId: string): string | null {
      const name = byId.get(userId)?.displayName;
      if (typeof name !== "string" || name.length === 0) return null;
      return name;
    },
  };
}

/**
 * presence 描画用の画面座標モデル（描画コンポーネントから計算責務を分離）。
 */
export function buildPresenceLayout(input: {
  remoteSelections: ReadonlyMap<string, readonly number[]>;
  remoteViewports: ReadonlyMap<string, { x: number; y: number }>;
  participants: readonly CollabParticipant[];
  nodes: readonly Node[];
  viewport: Viewport;
}): {
  selectionOutlines: PresenceSelectionOutline[];
  viewportFrames: PresenceViewportFrame[];
} {
  const lookup = participantLookup(input.participants);
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
  const selectionOutlines: PresenceSelectionOutline[] = [];

  for (const [userId, nodeIds] of input.remoteSelections) {
    if (nodeIds.length === 0) continue;
    const color = lookup.color(userId);
    const name = lookup.displayName(userId);
    const label = name === null ? "他の参加者の選択" : `${name}の選択`;
    for (const nodeId of nodeIds) {
      const node = nodesById.get(nodeId);
      if (node === undefined) continue;
      const topLeft = worldToScreen({ x: node.x, y: node.y }, input.viewport);
      selectionOutlines.push({
        key: `${userId}:${nodeId}`,
        userId,
        nodeId,
        left: topLeft.x,
        top: topLeft.y,
        width: node.width * input.viewport.scale,
        height: node.height * input.viewport.scale,
        color,
        label,
      });
    }
  }

  const viewportFrames: PresenceViewportFrame[] = [];
  for (const [userId, center] of input.remoteViewports) {
    const screen = worldToScreen(center, input.viewport);
    const color = lookup.color(userId);
    const name = lookup.displayName(userId);
    viewportFrames.push({
      key: userId,
      userId,
      left: screen.x - PRESENCE_VIEWPORT_FRAME_WIDTH_PX / 2,
      top: screen.y - PRESENCE_VIEWPORT_FRAME_HEIGHT_PX / 2,
      color,
      label: name === null ? "他の参加者の視点" : `${name}の視点`,
      name,
    });
  }

  return { selectionOutlines, viewportFrames };
}
