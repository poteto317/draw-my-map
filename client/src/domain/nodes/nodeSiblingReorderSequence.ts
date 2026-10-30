import type { SiblingReorderTarget } from "@/domain/nodes/nodeSiblingReorderTarget";
import type { Node } from "@/types/node";

// 兄弟の順序変更で、配列の並びだけを組み替える。座標は変えない（配置は nodeSiblingOrder が適用する）

export type ReorderEndpoints = {
  node: Node;
  anchor: Node | null;
  // anchor が T より前にあるか
  anchorFirst: boolean;
  firstRoot: Node | null;
};

// T・anchor・最初のルートを1回の走査で求める。T と anchor は先に出会ったものを使う。T が無ければ null
export function findReorderEndpoints(
  nodes: readonly Node[],
  nodeId: number,
  anchorId: number,
): ReorderEndpoints | null {
  let node: Node | null = null;
  let anchor: Node | null = null;
  let anchorFirst = false;
  let firstRoot: Node | null = null;
  for (const candidate of nodes) {
    if (firstRoot === null && candidate.parentId === null) firstRoot = candidate;
    if (node === null && candidate.id === nodeId) node = candidate;
    else if (anchor === null && candidate.id === anchorId) {
      anchor = candidate;
      anchorFirst = node === null;
    }
  }
  if (node === null) return null;
  return { node, anchor, anchorFirst, firstRoot };
}

export type ReorderedSiblings = {
  nodes: Node[];
  // 並べ替えた後の兄弟の列で上に来る組と下に来る組の、根ノードの ID
  first: number[];
  second: number[];
  // 並べ替えた後の、見えている兄弟の中での T の位置（0 始まり）と、見えている兄弟の数
  visibleIndex: number;
  visibleCount: number;
  firstRoot: Node | null;
};

// nodes を1回だけ走査して新しい配列を作る。T だけを anchor の前後へ移し、ほかは同じオブジェクトのまま積む。
// node・anchor は nodes の要素で、同じ親を持ち、position と前後関係が合っていること（呼び出し側が確かめる）
export function buildReorderedSiblings(
  nodes: readonly Node[],
  node: Node,
  anchor: Node,
  position: SiblingReorderTarget["position"],
  visibleNodeIds: ReadonlySet<number>,
): ReorderedSiblings {
  const result: Node[] = [];
  const skipped: number[] = [];
  let collecting = false;
  let visibleIndex = 0;
  let visibleCount = 0;
  let placed = false;
  let firstRoot: Node | null = null;

  const pushNode = (pushed: Node) => {
    if (firstRoot === null && pushed.parentId === null) firstRoot = pushed;
    if (pushed === node) placed = true;
    if (pushed.parentId === node.parentId && visibleNodeIds.has(pushed.id)) {
      if (!placed) visibleIndex += 1;
      visibleCount += 1;
    }
    result.push(pushed);
  };

  for (const candidate of nodes) {
    if (candidate === node) {
      // "before" は anchor から T の直前まで、"after" は T の直後から anchor までを集める
      collecting = position === "after";
      continue;
    }
    if (candidate === anchor) {
      if (position === "before") {
        collecting = true;
        skipped.push(candidate.id);
        pushNode(node);
        pushNode(candidate);
      } else {
        collecting = false;
        skipped.push(candidate.id);
        pushNode(candidate);
        pushNode(node);
      }
      continue;
    }
    if (collecting && candidate.parentId === node.parentId) {
      skipped.push(candidate.id);
    }
    pushNode(candidate);
  }

  const isBefore = position === "before";
  return {
    nodes: result,
    first: isBefore ? [node.id] : skipped,
    second: isBefore ? skipped : [node.id],
    visibleIndex,
    visibleCount,
    firstRoot,
  };
}
