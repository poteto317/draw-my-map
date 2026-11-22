import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { hasInvalidNodeGeometry } from "@/domain/nodes/nodeGeometryValidation";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { createSiblingNode } from "@/domain/nodes/nodePlacement";
import type { Node } from "@/types/node";

export const MAX_SPLIT_FRAGMENTS = 200;

export type NodeSplitFailureReason =
  | "node-missing"
  | "node-hidden"
  | "invalid-structure"
  | "separator-empty"
  | "not-splittable"
  | "too-many-fragments"
  | "id-conflict"
  | "placement-failed"
  | "locked"
  // 確定時の再計画が、プレビューで見せた計画と違う（useNodes.splitNode が返す）
  | "plan-changed";

export type NodeSplitPlan =
  | { ok: true; nodeId: number; fragments: string[] }
  | { ok: false; reason: NodeSplitFailureReason };

export type NodeSplitResult =
  | { ok: true; nodes: Node[]; insertedIds: number[] }
  | { ok: false; reason: NodeSplitFailureReason };

// useNodes.splitNode の戻り値
export type SplitNodeResult =
  | { ok: true; insertedIds: number[] }
  | { ok: false; reason: NodeSplitFailureReason };

// ラベルを区切り、前後の空白を削って空の断片を捨てる（件数の上限は検査しない）。一致は完全一致で正規化しない。
// 区切りが空文字のときは 1 文字ずつに分けず、ラベル全体を trim した 1 件（trim して空なら 0 件）を返す
export function splitLabelFragments(label: string, separator: string): string[] {
  if (separator === "") {
    const whole = label.trim();
    return whole === "" ? [] : [whole];
  }
  return label.split(separator).map((fragment) => fragment.trim()).filter((fragment) => fragment !== "");
}

// ボタンの有効判定。断片の数は区切り文字しだいなので含めない
export function canSplitNode(
  nodes: readonly Node[],
  nodeId: number | null,
  visibleNodeIds: ReadonlySet<number>,
): boolean {
  return nodeId !== null && visibleNodeIds.has(nodeId) && nodes.some((node) => node.id === nodeId);
}

// 対象の存在・可視・配置（座標と大きさ）・構造・区切り文字・断片数を、この順に検査する（配列は変えない）
export function planNodeSplit(
  nodes: readonly Node[],
  nodeId: number,
  separator: string,
  visibleNodeIds: ReadonlySet<number>,
): NodeSplitPlan {
  const target = nodes.find((node) => node.id === nodeId);
  if (target === undefined) return { ok: false, reason: "node-missing" };
  if (!visibleNodeIds.has(nodeId)) return { ok: false, reason: "node-hidden" };
  const lockedCheck = assertNodesEditable([nodeId], nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") return { ok: false, reason: "locked" };
  // 配置不能と構造不正を分類するため、座標・大きさだけを森の検証より先に調べる
  if (hasInvalidNodeGeometry(nodes)) return { ok: false, reason: "placement-failed" };
  if (indexNodeForest(nodes) === null) return { ok: false, reason: "invalid-structure" };
  if (separator === "") return { ok: false, reason: "separator-empty" };

  const fragments = splitLabelFragments(target.label, separator);
  if (fragments.length < 2) return { ok: false, reason: "not-splittable" };
  if (fragments.length > MAX_SPLIT_FRAGMENTS) return { ok: false, reason: "too-many-fragments" };
  return { ok: true, nodeId, fragments };
}

// 確定時の再計画とプレビューの計画が同じか。失敗した計画は同じとみなさない
export function isSameNodeSplitPlan(a: NodeSplitPlan, b: NodeSplitPlan): boolean {
  if (!a.ok || !b.ok) return false;
  return a.nodeId === b.nodeId
    && a.fragments.length === b.fragments.length
    && a.fragments.every((fragment, index) => fragment === b.fragments[index]);
}

function hasUsableNewIds(
  nodes: readonly Node[],
  newNodeIds: readonly number[],
  expectedCount: number,
): boolean {
  if (newNodeIds.length !== expectedCount) return false;
  if (new Set(newNodeIds).size !== newNodeIds.length) return false;
  const existingIds = new Set(nodes.map((node) => node.id));
  // 保存データの検証（normalizeMapDocumentNode）と同じく、1 以上の安全な整数だけを新しい ID として使える
  return newNodeIds.every((id) => Number.isSafeInteger(id) && id > 0 && !existingIds.has(id));
}

// 最初の断片は元のノードに残し（ラベルだけ更新）、残りは元のノードの直後の兄弟として断片順に差し込む。
// 自動配置の全体の再レイアウトは applyTreeChange に任せる（先頭のルートは変わらないので座標の引き継ぎも要らない）
export function splitNode(
  nodes: readonly Node[],
  nodeId: number,
  separator: string,
  newNodeIds: readonly number[],
  visibleNodeIds: ReadonlySet<number>,
): NodeSplitResult {
  const plan = planNodeSplit(nodes, nodeId, separator, visibleNodeIds);
  if (!plan.ok) return plan;
  const source = nodes.find((node) => node.id === nodeId);
  // 上の検査を通った ID は配列にあるので到達しない。型の絞り込みのために残す
  if (source === undefined) return { ok: false, reason: "node-missing" };
  const { fragments } = plan;
  if (!hasUsableNewIds(nodes, newNodeIds, fragments.length - 1)) return { ok: false, reason: "id-conflict" };

  // 座標は createSiblingNode と同じ規則で、直前までに作った断片を含む配列を基準に決める
  const basis: Node[] = nodes.map((node) => (node.id === nodeId ? { ...node, label: fragments[0] } : node));
  const inserted: Node[] = [];
  for (let index = 1; index < fragments.length; index += 1) {
    const created = createSiblingNode(basis, nodeId, newNodeIds[index - 1]);
    // 上の検査を通った入力では null にならず到達しない。型の絞り込みのために残す
    if (created === null) return { ok: false, reason: "placement-failed" };
    // Node に属性を足したときは、新しい断片へ元のノードから写すか、createSiblingNode の既定値にするかをここで決める
    // （重要度だけを元のノードから写している）
    const fragmentNode: Node = { ...created, label: fragments[index], importance: source.importance };
    basis.push(fragmentNode);
    inserted.push(fragmentNode);
  }

  const next: Node[] = [];
  for (const node of nodes) {
    if (node.id === nodeId) next.push({ ...node, label: fragments[0] }, ...inserted);
    else next.push(node);
  }
  return { ok: true, nodes: next, insertedIds: inserted.map((node) => node.id) };
}
