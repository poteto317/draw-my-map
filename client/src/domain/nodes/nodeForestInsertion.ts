import { RECT_HEIGHT, RECT_WIDTH } from "@/config/shapes";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { DEFAULT_NODE_IMPORTANCE } from "@/domain/nodes/nodeImportance";
import { checkedAdd, checkedSubtract } from "@/domain/nodes/nodeLayoutArithmetic";
import {
  calculateChildPlacement,
  calculateManualOffsetY,
} from "@/domain/nodes/nodeManualPlacement";
import type { AllocateNodeIds } from "@/domain/nodes/nodeSubtreeInsertion";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type ForestItem = { label: string; parentIndex: number | null }; // parentIndex は自分より前の添字

export type ForestInsertionTarget =
  | { kind: "root" }
  | { kind: "child"; parentId: number };

export type ForestInsertionFailureReason = "parent-missing" | "invalid-items" | "placement-failed";

export type ForestInsertionResult =
  | { ok: true; nodes: Node[]; rootIds: number[] } // rootIds は深さ0の項目の新しい ID（入力の順）
  | { ok: false; reason: ForestInsertionFailureReason };

type Point = { x: number; y: number };

// 自動配置での仮の座標。全体の再配置は呼び出し側（applyTreeChange）が行う
const AUTO_PLACEHOLDER_POSITION = 40;
// 空のマップで、新しいルートの森の先頭を置く位置
const EMPTY_MAP_ORIGIN = 40;

// 先頭は深さ0、それ以外の parentIndex は自分より前の整数の添字であること
function hasValidItems(items: readonly ForestItem[]): boolean {
  if (items.length === 0) return false;
  for (let index = 0; index < items.length; index += 1) {
    const { parentIndex } = items[index];
    if (parentIndex === null) continue;
    // 先頭の項目は自分より前の添字が無いため、先頭が深さ0でない場合もここで弾く
    if (!Number.isInteger(parentIndex) || parentIndex < 0 || parentIndex >= index) return false;
  }
  return true;
}

function createPlacementNode(
  id: number,
  parentId: number | null,
  x: number,
  y: number,
  width: number,
  height: number,
): Node {
  return { id, parentId, x, y, width, height, label: "", importance: DEFAULT_NODE_IMPORTANCE };
}

// 平行移動した左上を返す。有限でない値や丸めで移動量が失われた場合は null
function translate(node: Node, offset: Point): Point | null {
  const x = checkedAdd(node.x, offset.x);
  const y = checkedAdd(node.y, offset.y);
  if (x === null || y === null) return null;
  if (!Number.isFinite(x + node.width) || !Number.isFinite(y + node.height)) return null;
  return { x, y };
}

// 新しいルートとして追加する森を、マップの左端に並べてから、マップの下端の下へ真下に移す
function placeRootForest(
  current: readonly Node[],
  items: readonly ForestItem[],
): Point[] | null {
  let x0 = Infinity;
  for (const node of current) {
    if (node.x < x0) x0 = node.x;
  }
  if (current.length === 0) x0 = EMPTY_MAP_ORIGIN;

  const placeholders: Node[] = [];
  for (let index = 0; index < items.length; index += 1) {
    placeholders.push(createPlacementNode(
      index, items[index].parentIndex, x0, EMPTY_MAP_ORIGIN, RECT_WIDTH, RECT_HEIGHT,
    ));
  }
  const laidOut = layoutNodeForest(placeholders);
  if (laidOut === null) return null;

  const offsetY = calculateManualOffsetY(current, laidOut);
  if (offsetY === null) return null;
  return translateAll(laidOut, { x: 0, y: offsetY });
}

// 子として追加する森を、仮の親の子として並べ、先頭の項目の左上が子の追加と同じ位置に来るように移す
function placeChildForest(
  current: readonly Node[],
  items: readonly ForestItem[],
  parent: Node,
): Point[] | null {
  const base = calculateChildPlacement(current, parent.id);
  if (base === null) return null;

  const placeholderParentId = items.length;
  const placeholders: Node[] = [createPlacementNode(
    placeholderParentId, null, parent.x, parent.y, parent.width, parent.height,
  )];
  for (let index = 0; index < items.length; index += 1) {
    const { parentIndex } = items[index];
    placeholders.push(createPlacementNode(
      index,
      parentIndex === null ? placeholderParentId : parentIndex,
      parent.x,
      parent.y,
      RECT_WIDTH,
      RECT_HEIGHT,
    ));
  }
  const laidOut = layoutNodeForest(placeholders);
  if (laidOut === null) return null;

  const laidOutItems = laidOut.slice(1);
  const first = laidOutItems[0];
  const offsetX = checkedSubtract(base.x, first.x);
  const offsetY = checkedSubtract(base.y, first.y);
  if (offsetX === null || offsetY === null) return null;
  return translateAll(laidOutItems, { x: offsetX, y: offsetY });
}

function translateAll(nodes: readonly Node[], offset: Point): Point[] | null {
  const positions: Point[] = [];
  for (const node of nodes) {
    const position = translate(node, offset);
    if (position === null) return null;
    positions.push(position);
  }
  return positions;
}

function placeAutoForest(items: readonly ForestItem[]): Point[] {
  const positions: Point[] = [];
  for (let index = 0; index < items.length; index += 1) {
    positions.push({ x: AUTO_PLACEHOLDER_POSITION, y: AUTO_PLACEHOLDER_POSITION });
  }
  return positions;
}

function placeForest(
  current: readonly Node[],
  items: readonly ForestItem[],
  parent: Node | null,
  mode: NodeLayoutMode,
): Point[] | null {
  switch (mode) {
    case "auto":
      return placeAutoForest(items);
    case "manual":
      return parent === null
        ? placeRootForest(current, items)
        : placeChildForest(current, items, parent);
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
}

function findTargetParent(
  current: readonly Node[],
  target: ForestInsertionTarget,
): { found: true; parent: Node | null } | { found: false } {
  switch (target.kind) {
    case "root":
      return { found: true, parent: null };
    case "child": {
      const parent = current.find((node) => node.id === target.parentId);
      return parent === undefined ? { found: false } : { found: true, parent };
    }
    default: {
      const unreachable: never = target;
      return unreachable;
    }
  }
}

// 箇条書きの項目を森として current の後ろへ items の順で追加する。
// 失敗しうる検査（項目の形、親の存在、座標）をすべて済ませてから、ID を1回でまとめて採番する。
// current と items は変更しない。自動配置の全体の再配置はここでは行わない。
export function insertNodeForest(
  current: readonly Node[],
  items: readonly ForestItem[],
  target: ForestInsertionTarget,
  mode: NodeLayoutMode,
  allocateIds: AllocateNodeIds,
): ForestInsertionResult {
  if (!hasValidItems(items)) return { ok: false, reason: "invalid-items" };

  const targetParent = findTargetParent(current, target);
  if (!targetParent.found) return { ok: false, reason: "parent-missing" };

  const positions = placeForest(current, items, targetParent.parent, mode);
  if (positions === null) return { ok: false, reason: "placement-failed" };

  const ids = allocateIds(current, items.length);
  const rootParentId = targetParent.parent === null ? null : targetParent.parent.id;
  const nodes = current.slice();
  const rootIds: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const { label, parentIndex } = items[index];
    const id = ids[index];
    if (parentIndex === null) rootIds.push(id);
    nodes.push({
      id,
      parentId: parentIndex === null ? rootParentId : ids[parentIndex],
      x: positions[index].x,
      y: positions[index].y,
      width: RECT_WIDTH,
      height: RECT_HEIGHT,
      label,
      importance: DEFAULT_NODE_IMPORTANCE,
    });
  }
  return { ok: true, nodes, rootIds };
}
