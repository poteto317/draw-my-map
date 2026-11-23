import { NODE_KINDS, type NodeKind } from "@/types/nodeKind";
import type { Node } from "@/types/node";

export function isNodeKind(value: unknown): value is NodeKind {
  return typeof value === "string" && (NODE_KINDS as readonly string[]).includes(value);
}

export function normalizeNodeKind(value: unknown): NodeKind | undefined {
  return isNodeKind(value) ? value : undefined;
}

/** 正本。許可外・欠落はキー省略 */
export function projectNodeKind(node: Pick<Node, "kind">): { kind?: NodeKind } {
  const kind = normalizeNodeKind(node.kind);
  return kind === undefined ? {} : { kind };
}

/** 既存の kind キーを外して投影結果を載せる（更新・統合の共通経路） */
export function applyProjectedNodeKind(node: Node, kind: NodeKind | undefined): Node {
  const projected = projectNodeKind({ kind });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で kind を除外するため
  const { kind: _kind, ...rest } = node;
  return { ...rest, ...projected };
}
