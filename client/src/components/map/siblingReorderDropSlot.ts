import { SIBLING_VERTICAL_GAP } from "@/config/shapes";
import type { SiblingReorderTarget } from "@/domain/nodes/nodeSiblingOrder";
import type { Node } from "@/types/node";

// 挿入位置の線の左右の余白
const INDICATOR_HORIZONTAL_MARGIN = 8;

export type SiblingReorderIndicator = { left: number; right: number; y: number };

// 元の位置では indicator が null
export type SiblingReorderPreview = {
  nodeId: number;
  indicator: SiblingReorderIndicator | null;
};

export type SiblingReorderDrop = {
  // 元の位置では null
  target: SiblingReorderTarget | null;
  slot: number;
  indicator: SiblingReorderIndicator | null;
};

function centerY(node: Node): number {
  return node.y + node.height / 2;
}

function resolveIndicatorY(others: readonly Node[], slot: number): number {
  const halfGap = SIBLING_VERTICAL_GAP / 2;
  if (slot === 0) return others[0].y - halfGap;
  if (slot === others.length) {
    const last = others[others.length - 1];
    return last.y + last.height + halfGap;
  }
  const above = others[slot - 1];
  return (above.y + above.height + others[slot].y) / 2;
}

// displayNodes は表示用の座標（ポインタの world 座標と同じ座標系）。ポインタの横位置は見ない
export function resolveSiblingReorderDrop(
  displayNodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number>,
  nodeId: number,
  pointerY: number,
): SiblingReorderDrop | null {
  if (!Number.isFinite(pointerY)) return null;
  const node = displayNodes.find((candidate) => candidate.id === nodeId);
  if (!node || !visibleNodeIds.has(node.id)) return null;

  // T と同じ親を持つ見えている兄弟（T を除く）を配列の順に1回の走査で集める
  const others: Node[] = [];
  let original = 0;
  let slot = 0;
  let passedNode = false;
  let left = node.x;
  let right = node.x + node.width;
  for (const candidate of displayNodes) {
    if (candidate === node) {
      passedNode = true;
      continue;
    }
    if (candidate.parentId !== node.parentId || !visibleNodeIds.has(candidate.id)) continue;
    others.push(candidate);
    if (!passedNode) original += 1;
    if (centerY(candidate) <= pointerY) slot += 1;
    if (candidate.x < left) left = candidate.x;
    if (candidate.x + candidate.width > right) right = candidate.x + candidate.width;
  }

  if (slot === original) return { target: null, slot, indicator: null };
  const target: SiblingReorderTarget = slot < original
    ? { position: "before", anchorId: others[slot].id }
    : { position: "after", anchorId: others[slot - 1].id };
  return {
    target,
    slot,
    indicator: {
      left: left - INDICATOR_HORIZONTAL_MARGIN,
      right: right + INDICATOR_HORIZONTAL_MARGIN,
      y: resolveIndicatorY(others, slot),
    },
  };
}
