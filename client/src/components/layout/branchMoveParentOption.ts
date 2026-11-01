import type { Node } from "@/types/node";

export type BranchMoveParentNode = Pick<Node, "id" | "parentId" | "label">;
type BranchMoveParentOption = { id: number; text: string };

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function displayName(node: BranchMoveParentNode): string {
  return node.label || "（名前なし）";
}

// 同名のノードは親のラベルで見分ける。同じ親の下の同名は、候補の中の順番で見分ける
export function listBranchMoveParentOptions(
  candidates: readonly BranchMoveParentNode[],
  nodes: readonly BranchMoveParentNode[],
): BranchMoveParentOption[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const noteOf = (node: BranchMoveParentNode) => {
    const parent = node.parentId === null ? undefined : nodeById.get(node.parentId);
    return parent === undefined ? "ルート" : `親: ${displayName(parent)}`;
  };
  const notedText = (node: BranchMoveParentNode) => `${displayName(node)}（${noteOf(node)}`;
  const nameCounts = countValues(candidates.map(displayName));
  const notedCounts = countValues(candidates.map(notedText));
  const positions = new Map<string, number>();
  return candidates.map((node) => {
    const name = displayName(node);
    if (nameCounts.get(name) === 1) return { id: node.id, text: name };
    const noted = notedText(node);
    if (notedCounts.get(noted) === 1) return { id: node.id, text: `${noted}）` };
    const position = (positions.get(noted) ?? 0) + 1;
    positions.set(noted, position);
    return { id: node.id, text: `${noted}・${position}件目）` };
  });
}
