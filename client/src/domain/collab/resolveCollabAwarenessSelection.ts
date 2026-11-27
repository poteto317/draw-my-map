import type { ScreenSize, Viewport } from "@/types/viewport";

export type CollabAwarenessSelection = {
  selectedNodeIds: readonly number[];
  viewportCenter: { x: number; y: number };
};

/**
 * awareness へ載せる選択・ビューポート中心（L-002）。
 * viewport / screen 未準備なら null（{0,0} 捏造禁止）。純計算のみ。
 */
export function resolveCollabAwarenessSelection(input: {
  selectedNodeIds: readonly number[];
  screen: ScreenSize | null;
  viewport: Viewport | null;
}): CollabAwarenessSelection | null {
  const { screen, viewport, selectedNodeIds } = input;
  if (screen === null || viewport === null) return null;
  if (!Number.isFinite(viewport.scale) || viewport.scale === 0) return null;
  const sx = screen.width / 2;
  const sy = screen.height / 2;
  return {
    selectedNodeIds,
    viewportCenter: {
      x: (sx - viewport.offsetX) / viewport.scale,
      y: (sy - viewport.offsetY) / viewport.scale,
    },
  };
}
