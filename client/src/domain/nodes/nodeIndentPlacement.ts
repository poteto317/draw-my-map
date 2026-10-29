import { CHILD_HORIZONTAL_GAP, SIBLING_VERTICAL_GAP } from "@/config/shapes";
import {
  checkedAdd,
  calculateGapRoundingTolerance,
  checkedSubtract,
  hasSufficientGap,
} from "@/domain/nodes/nodeLayoutArithmetic";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

// 根 T を (rootX, rootY) へ、子孫を (dx, dy) だけ動かす
export type BranchTranslation = { rootX: number; rootY: number; dx: number; dy: number };

function findPair(
  nodes: readonly Node[],
  firstId: number,
  secondId: number,
): [Node, Node] | null {
  let first: Node | undefined;
  let second: Node | undefined;
  for (const node of nodes) {
    if (node.id === firstId) first = node;
    if (node.id === secondId) second = node;
  }
  return first === undefined || second === undefined ? null : [first, second];
}

type BranchMagnitude = { x: number; y: number };

// 枝のノード（根を含む）の座標の絶対値の最大。非有限の値は見ない（平行移動の検査で null になる）
function measureBranchMagnitude(
  nodes: readonly Node[],
  branchIds: ReadonlySet<number>,
): BranchMagnitude {
  const magnitude = { x: 0, y: 0 };
  for (const node of nodes) {
    if (!branchIds.has(node.id)) continue;
    const absX = Math.abs(node.x);
    const absY = Math.abs(node.y);
    if (absX > magnitude.x) magnitude.x = absX;
    if (absY > magnitude.y) magnitude.y = absY;
  }
  return magnitude;
}

// 目的の座標と今の座標の差を求め、丸めの範囲に収まれば 0 にする。差が求められなければ null。
// 複製・貼り付けで作った根は、途中の計算の丸めで目的の座標とわずかにずれることがあり、
// その差で子孫を動かすと checkedAdd が桁落ちと判定する。許容誤差は目的・今の座標と
// 枝の座標の大きさの最大に比例させ、上限は hasSufficientGap と同じ（calculateGapRoundingTolerance）にする
function calculateOffsetIgnoringRounding(
  target: number,
  current: number,
  branchMagnitude: number,
  gap: number,
): number | null {
  if (target === current) return 0;
  const result = checkedSubtract(target, current);
  if (result === null) return null;
  const scale = Math.max(Math.abs(current), branchMagnitude);
  const tolerance = calculateGapRoundingTolerance(target, scale, gap);
  return Math.abs(result) <= tolerance ? 0 : result;
}

// 子の追加の規則（calculateChildPlacement）と同じ位置を、検査付きで求める。
// nodes は上げ下げの前の配列（T はまだ newParentId の子ではない）
export function calculateIndentTranslation(
  nodes: readonly Node[],
  nodeId: number,
  newParentId: number,
): BranchTranslation | null {
  const pair = findPair(nodes, newParentId, nodeId);
  if (pair === null) return null;
  const [parent, target] = pair;

  const right = checkedAdd(parent.x, parent.width);
  const rootX = right === null ? null : checkedAdd(right, CHILD_HORIZONTAL_GAP);
  if (right === null || rootX === null) return null;
  if (!hasSufficientGap(right, rootX, CHILD_HORIZONTAL_GAP)) return null;

  // 隠れた子も既存の子に数える。孫は数えない
  let hasChild = false;
  let bottom = 0;
  for (const node of nodes) {
    if (node.parentId !== parent.id) continue;
    const nodeBottom = checkedAdd(node.y, node.height);
    if (nodeBottom === null) return null;
    if (!hasChild || nodeBottom > bottom) bottom = nodeBottom;
    hasChild = true;
  }

  let rootY: number;
  if (hasChild) {
    const belowChildren = checkedAdd(bottom, SIBLING_VERTICAL_GAP);
    if (belowChildren === null) return null;
    if (!hasSufficientGap(bottom, belowChildren, SIBLING_VERTICAL_GAP)) return null;
    rootY = belowChildren;
  } else {
    if (!Number.isFinite(parent.y)) return null;
    rootY = parent.y;
  }

  const magnitude = measureBranchMagnitude(nodes, collectSubtreeIds(nodes, target.id));
  const dx = calculateOffsetIgnoringRounding(rootX, target.x, magnitude.x, CHILD_HORIZONTAL_GAP);
  const dy = calculateOffsetIgnoringRounding(rootY, target.y, magnitude.y, SIBLING_VERTICAL_GAP);
  if (dx === null || dy === null) return null;
  return { rootX, rootY, dx, dy };
}

// T の枝を、親の枝（T の枝を除く。後ろの兄弟とその子孫を含む）の下端の下へ、
// 枝の上端で合わせて動かす。x は親と同じにする。parentId は T の今の親
export function calculateOutdentTranslation(
  nodes: readonly Node[],
  nodeId: number,
  parentId: number,
): BranchTranslation | null {
  const pair = findPair(nodes, parentId, nodeId);
  if (pair === null) return null;
  const [parent, target] = pair;

  const subtree = collectSubtreeIds(nodes, target.id);
  if (subtree.has(parent.id)) return null;
  const parentBranch = collectSubtreeIds(nodes, parent.id);

  let parentBottom = 0;
  let hasParentNode = false;
  let branchTop = 0;
  let hasBranchNode = false;
  for (const node of nodes) {
    if (subtree.has(node.id)) {
      if (!Number.isFinite(node.y)) return null;
      if (!hasBranchNode || node.y < branchTop) branchTop = node.y;
      hasBranchNode = true;
    } else if (parentBranch.has(node.id)) {
      const nodeBottom = checkedAdd(node.y, node.height);
      if (nodeBottom === null) return null;
      if (!hasParentNode || nodeBottom > parentBottom) parentBottom = nodeBottom;
      hasParentNode = true;
    }
  }

  const newTop = checkedAdd(parentBottom, SIBLING_VERTICAL_GAP);
  if (newTop === null) return null;
  if (!hasSufficientGap(parentBottom, newTop, SIBLING_VERTICAL_GAP)) return null;

  const rootX = parent.x;
  if (!Number.isFinite(rootX)) return null;
  const magnitude = measureBranchMagnitude(nodes, subtree);
  const dx = calculateOffsetIgnoringRounding(rootX, target.x, magnitude.x, CHILD_HORIZONTAL_GAP);
  const dy = calculateOffsetIgnoringRounding(newTop, branchTop, magnitude.y, SIBLING_VERTICAL_GAP);
  if (dx === null || dy === null) return null;

  // T が枝の上端なら、根の y は式の値をそのまま使う（T.y + dy の丸めを残さない）
  const rootY =
    branchTop === target.y ? newTop : dy === 0 ? target.y : checkedAdd(target.y, dy);
  if (rootY === null) return null;
  return { rootX, rootY, dx, dy };
}

// 根は式で決めた座標をそのまま入れ、子孫は (dx, dy) だけ動かす。
// 1つでも座標が求められなければ、途中まで動いた配列を返さず null を返す
export function translateBranch(
  nodes: readonly Node[],
  rootId: number,
  translation: BranchTranslation,
): Node[] | null {
  const { rootX, rootY, dx, dy } = translation;
  let root: Node | undefined;
  for (const node of nodes) {
    if (node.id === rootId) {
      root = node;
      break;
    }
  }
  if (root === undefined) return null;

  if (root.x === rootX && root.y === rootY && dx === 0 && dy === 0) {
    return [...nodes];
  }

  const ids = collectSubtreeIds(nodes, rootId);
  const result: Node[] = [];
  for (const node of nodes) {
    if (node.id === rootId) {
      result.push({ ...node, x: rootX, y: rootY });
      continue;
    }
    if (!ids.has(node.id) || (dx === 0 && dy === 0)) {
      result.push(node);
      continue;
    }
    const x = dx === 0 ? node.x : checkedAdd(node.x, dx);
    const y = dy === 0 ? node.y : checkedAdd(node.y, dy);
    if (x === null || y === null) return null;
    result.push({ ...node, x, y });
  }
  return result;
}

// 手動配置では calculate で求めた平行移動で枝を動かし、求められなければ null を返す。
// 自動配置では座標を変えない（applyTreeChange の layoutNodeForest が決める）
export function applyBranchPlacement(
  nodes: Node[],
  nodeId: number,
  mode: NodeLayoutMode,
  calculate: () => BranchTranslation | null,
): Node[] | null {
  switch (mode) {
    case "auto":
      return nodes;
    case "manual": {
      const translation = calculate();
      return translation === null ? null : translateBranch(nodes, nodeId, translation);
    }
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
}
