import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { applyProjectedNodeIcon, normalizeNodeIcon } from "@/domain/nodes/nodeIcon";
import { applyProjectedNodeKind, normalizeNodeKind } from "@/domain/nodes/nodeKindUpdate";
import type { Node } from "@/types/node";
import type { NodeKind } from "@/types/nodeKind";

export function updateNodeIcon(
  nodes: readonly Node[],
  id: number,
  icon: string | undefined,
): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined) return null;
  if (!assertNodesEditable([id], nodes).ok) return null;

  const nextIcon = icon === undefined ? undefined : normalizeNodeIcon(icon);
  if (icon !== undefined && nextIcon === undefined) return null;

  const current = normalizeNodeIcon(target.icon);
  if (current === nextIcon) return null;

  return nodes.map((node) => (node.id === id ? applyProjectedNodeIcon(node, nextIcon) : node));
}

export function updateNodeKind(
  nodes: readonly Node[],
  id: number,
  kind: NodeKind | undefined,
): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined) return null;
  if (!assertNodesEditable([id], nodes).ok) return null;

  const nextKind = kind === undefined ? undefined : normalizeNodeKind(kind);
  if (kind !== undefined && nextKind === undefined) return null;

  const current = normalizeNodeKind(target.kind);
  if (current === nextKind) return null;

  return nodes.map((node) => (node.id === id ? applyProjectedNodeKind(node, nextKind) : node));
}
