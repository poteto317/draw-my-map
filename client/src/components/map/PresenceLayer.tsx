"use client";

import {
  buildPresenceLayout,
  PRESENCE_VIEWPORT_FRAME_HEIGHT_PX,
  PRESENCE_VIEWPORT_FRAME_WIDTH_PX,
} from "@/domain/collab/presenceLayout";
import type { CollabParticipant } from "@/domain/collab/collabSessionUi";
import type { Node } from "@/types/node";
import type { Viewport } from "@/types/viewport";

/**
 * presence 描画の必須 props（L-060）。
 * remoteSelections: キーあり + [] = 明示的に未選択。キー無し = 未取得／非共有。
 * remoteViewports: キー無し = 未取得／非共有（null 埋めしない）。
 */
export type PresenceLayerProps = {
  remoteSelections: ReadonlyMap<string, readonly number[]>;
  remoteViewports: ReadonlyMap<string, { x: number; y: number }>;
  participants: readonly CollabParticipant[];
  nodes: readonly Node[];
  viewport: Viewport;
};

/**
 * 他者選択の輪郭色とビューポート枠（ポインタ軌跡は出さない）。
 * pointer-events なしでキャンバス操作を妨げない。
 */
export function PresenceLayer({
  remoteSelections,
  remoteViewports,
  participants,
  nodes,
  viewport,
}: PresenceLayerProps) {
  const { selectionOutlines, viewportFrames } = buildPresenceLayout({
    remoteSelections,
    remoteViewports,
    participants,
    nodes,
    viewport,
  });

  return (
    <div
      data-testid="presence-layer"
      data-remote-selections-size={String(remoteSelections.size)}
      data-remote-viewports-size={String(remoteViewports.size)}
      className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
      aria-hidden={selectionOutlines.length === 0 && viewportFrames.length === 0}
    >
      {selectionOutlines.map((outline) => (
        <div
          key={outline.key}
          data-testid="presence-selection"
          data-user-id={outline.userId}
          data-node-id={String(outline.nodeId)}
          aria-label={outline.label}
          className="absolute box-border rounded-sm border-2 bg-transparent"
          style={{
            left: outline.left,
            top: outline.top,
            width: outline.width,
            height: outline.height,
            borderColor: outline.color,
          }}
        />
      ))}
      {viewportFrames.map((frame) => (
        <div
          key={frame.key}
          data-testid="presence-viewport"
          data-user-id={frame.userId}
          aria-label={frame.label}
          className="absolute box-border border border-dashed bg-transparent opacity-70"
          style={{
            left: frame.left,
            top: frame.top,
            width: PRESENCE_VIEWPORT_FRAME_WIDTH_PX,
            height: PRESENCE_VIEWPORT_FRAME_HEIGHT_PX,
            borderColor: frame.color,
          }}
        >
          {frame.name !== null ? (
            <span
              className="absolute -top-5 left-0 max-w-[10rem] truncate rounded px-1 text-xs text-white"
              style={{ backgroundColor: frame.color }}
            >
              {frame.name}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
