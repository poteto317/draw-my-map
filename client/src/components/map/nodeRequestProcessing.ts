import type { Node } from "@/types/node";
import type { RevisionScopedNodeRequest } from "@/types/revisionScopedNodeRequest";

// skip: 要求が無いか処理済み。discard: 古い要求か、対象のノードが無い（処理済みにして何もしない）。
// ready: 対象のノードへ処理できる
export type NodeRequestProcessing =
  | { kind: "skip" }
  | { kind: "discard"; sequence: number }
  | { kind: "ready"; sequence: number; node: Node };

// ノードへの要求（フォーカス・ラベルの編集）を、処理済みの sequence と現在の documentRevision・配列から振り分ける
export function classifyNodeRequest(
  request: RevisionScopedNodeRequest | null,
  processedSequence: number | null,
  documentRevision: number,
  nodes: readonly Node[],
): NodeRequestProcessing {
  if (request === null) return { kind: "skip" };
  if (processedSequence === request.sequence) return { kind: "skip" };
  if (request.documentRevision !== documentRevision) return { kind: "discard", sequence: request.sequence };
  const node = nodes.find((candidate) => candidate.id === request.nodeId);
  if (node === undefined) return { kind: "discard", sequence: request.sequence };
  return { kind: "ready", sequence: request.sequence, node };
}
