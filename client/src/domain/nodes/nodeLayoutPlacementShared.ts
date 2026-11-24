import {
  checkedAdd,
  checkedMultiply,
  checkedSubtract,
} from "@/domain/nodes/nodeLayoutArithmetic";
import type { Node } from "@/types/node";

export type LayoutPoint = { x: number; y: number };
export type ChildFrame = { node: Node; top: number };
export type SubtreeExtent = { top: number; bottom: number };

export function isLayoutPinned(node: Node): boolean {
  return node.layoutPinned === true;
}

export function calculateCenteringOffset(
  outerSpan: number,
  innerHeight: number,
): number | null {
  const extraSpan = checkedSubtract(outerSpan, innerHeight);
  if (extraSpan === null) return null;
  return checkedMultiply(extraSpan, 0.5);
}

export function calculateChildFrames(
  children: readonly Node[],
  frameTop: number,
  span: number,
  childrenHeight: number,
  spanById: ReadonlyMap<number, number>,
  siblingGap: number,
): ChildFrame[] | null {
  const childFrames: ChildFrame[] = [];
  const childTopOffset = calculateCenteringOffset(span, childrenHeight);
  if (childTopOffset === null) return null;
  let childTop = checkedAdd(frameTop, childTopOffset);
  if (childTop === null) return null;
  for (const [childIndex, child] of children.entries()) {
    childFrames.push({ node: child, top: childTop });
    if (childIndex + 1 < children.length) {
      const afterChild = checkedAdd(childTop, spanById.get(child.id)!);
      if (afterChild === null) return null;
      childTop = checkedAdd(afterChild, siblingGap);
      if (childTop === null) return null;
    }
  }
  return childFrames;
}

export function mergeSubtreeExtent(
  a: SubtreeExtent | null,
  b: SubtreeExtent,
): SubtreeExtent {
  if (a === null) return b;
  return { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
}

export function extentFromPosition(
  node: Node,
  point: LayoutPoint,
): SubtreeExtent | null {
  const bottom = checkedAdd(point.y, node.height);
  if (bottom === null) return null;
  return { top: point.y, bottom };
}
