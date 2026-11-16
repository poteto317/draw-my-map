import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import { keepFirstRootPosition } from "@/domain/nodes/nodeFirstRootPosition";
import { hasInvalidNodeGeometry } from "@/domain/nodes/nodeGeometryValidation";
import { maxNodeImportance } from "@/domain/nodes/nodeImportance";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type NodeMergeFailureReason =
  | "too-few-nodes"
  | "node-missing"
  | "node-hidden"
  | "primary-missing"
  | "different-parents"
  | "invalid-structure"
  | "placement-failed"
  // 確定時の再計画が、プレビューで見せた計画と違う（useNodes.mergeNodes が返す）
  | "plan-changed";

export type NodeMergePlan =
  | {
    ok: true;
    survivorId: number;
    // 配列順
    absorbedIds: number[];
    label: string;
    importance: NodeImportance;
    illustration: string | undefined;
    illustrationFrom: "primary" | "absorbed" | "none";
    // illustrationFrom が "absorbed" のときだけ、引き継ぐ元のノードの ID
    illustrationSourceId: number | null;
    // 統合で失われるイラストの件数（引き継ぐ 1 件を除く）
    discardedIllustrationCount: number;
    // 吸収されるノードの直下の子で、残すノードへ付け替えるものの件数
    movedChildCount: number;
  }
  | { ok: false; reason: NodeMergeFailureReason };

export type NodeMergeResult =
  | { ok: true; nodes: Node[]; survivorId: number; absorbedIds: number[] }
  | { ok: false; reason: NodeMergeFailureReason };

// useNodes.mergeNodes の戻り値
export type MergeNodesResult =
  | { ok: true; survivorId: number; absorbedCount: number }
  | { ok: false; reason: NodeMergeFailureReason };

function failed(reason: NodeMergeFailureReason): { ok: false; reason: NodeMergeFailureReason } {
  return { ok: false, reason };
}

type MergeSelection =
  | { ok: true; survivor: Node; selected: Node[]; absorbed: Node[] }
  | { ok: false; reason: NodeMergeFailureReason };

// 対象の個数・存在・可視・主選択・配置・構造・親の一致を、この順に検査する。
// 通れば、残すノード・選択中のノード（配列順）・吸収されるノード（配列順）を返す
function validateMergeSelection(
  nodes: readonly Node[],
  ids: readonly number[],
  primaryId: number | null,
  visibleNodeIds: ReadonlySet<number>,
): MergeSelection {
  const idSet = new Set(ids);
  if (idSet.size < 2) return failed("too-few-nodes");
  const existingIds = new Set(nodes.map((node) => node.id));
  for (const id of idSet) {
    if (!existingIds.has(id)) return failed("node-missing");
  }
  for (const id of idSet) {
    if (!visibleNodeIds.has(id)) return failed("node-hidden");
  }
  // 選択の ID はすべて配列にあるので、primaryId が選択に含まれていれば find は必ず見つかる
  const survivor = primaryId !== null && idSet.has(primaryId)
    ? nodes.find((node) => node.id === primaryId)
    : undefined;
  if (survivor === undefined) return failed("primary-missing");
  if (hasInvalidNodeGeometry(nodes)) return failed("placement-failed");
  if (indexNodeForest(nodes) === null) return failed("invalid-structure");

  const selected = nodes.filter((node) => idSet.has(node.id));
  if (selected.some((node) => node.parentId !== survivor.parentId)) return failed("different-parents");
  return { ok: true, survivor, selected, absorbed: selected.filter((node) => node.id !== survivor.id) };
}

// イラストの選択。主選択が持っていればそれ、無ければ吸収されるノードのうち配列順で最初に持つもの、
// どちらも無ければ引き継がない
function chooseMergeIllustration(
  survivor: Node,
  absorbed: readonly Node[],
): Pick<Extract<NodeMergePlan, { ok: true }>, "illustration" | "illustrationFrom" | "illustrationSourceId"> {
  if (survivor.illustration !== undefined) {
    return { illustration: survivor.illustration, illustrationFrom: "primary", illustrationSourceId: null };
  }
  const source = absorbed.find((node) => node.illustration !== undefined);
  if (source !== undefined) {
    return { illustration: source.illustration, illustrationFrom: "absorbed", illustrationSourceId: source.id };
  }
  return { illustration: undefined, illustrationFrom: "none", illustrationSourceId: null };
}

// 対象を検査して統合の計画を作る（配列は変えない）。並びは配列順で、ids の順序には依存しない
export function planNodeMerge(
  nodes: readonly Node[],
  ids: readonly number[],
  primaryId: number | null,
  joiner: string,
  visibleNodeIds: ReadonlySet<number>,
): NodeMergePlan {
  const selection = validateMergeSelection(nodes, ids, primaryId, visibleNodeIds);
  if (!selection.ok) return selection;
  const { survivor, selected, absorbed } = selection;
  const absorbedIdSet = new Set(absorbed.map((node) => node.id));
  const illustrationCount = selected.filter((node) => node.illustration !== undefined).length;

  return {
    ok: true,
    survivorId: survivor.id,
    absorbedIds: absorbed.map((node) => node.id),
    // 空文字のラベルを除いて連結する。前後の空白は削らない
    label: selected.map((node) => node.label).filter((label) => label !== "").join(joiner),
    importance: maxNodeImportance(selected.map((node) => node.importance)),
    ...chooseMergeIllustration(survivor, absorbed),
    discardedIllustrationCount: Math.max(0, illustrationCount - 1),
    movedChildCount: nodes.filter((node) => node.parentId !== null && absorbedIdSet.has(node.parentId)).length,
  };
}

// 確定時の再計画とプレビューの計画が同じか。プレビューで見せた内容（残すノード・吸収されるノードの順・ラベル・重要度・
// イラストの扱いと引き継ぎ元・失われるイラストの件数・付け替える子の件数）で比べる（L-036）。
// 引き継ぐイラスト本体は illustrationFrom と引き継ぎ元で決まるので比べない。失敗した計画は同じとみなさない
export function isSameNodeMergePlan(a: NodeMergePlan, b: NodeMergePlan): boolean {
  if (!a.ok || !b.ok) return false;
  return a.survivorId === b.survivorId
    && a.label === b.label
    && a.importance === b.importance
    && a.illustrationFrom === b.illustrationFrom
    && a.illustrationSourceId === b.illustrationSourceId
    && a.discardedIllustrationCount === b.discardedIllustrationCount
    && a.movedChildCount === b.movedChildCount
    && a.absorbedIds.length === b.absorbedIds.length
    && a.absorbedIds.every((id, index) => id === b.absorbedIds[index]);
}

// 残すノードの属性を計画どおりに更新する。位置と大きさは変えない（イラストを引き継ぐときだけ、
// attachIllustration と同じ規則で高さをイラスト付きの高さにする）。
// Node に属性を足したときは、ここで残すノードの値を残すか、吸収されるノードの値を引き継ぐかを決める
// （何もしないと、吸収されるノードの値は警告なしに捨てられる）。計画・プレビュー・isSameNodeMergePlan も合わせて見直す
function applyPlanToSurvivor(survivor: Node, plan: Extract<NodeMergePlan, { ok: true }>): Node {
  const updated: Node = { ...survivor, label: plan.label, importance: plan.importance };
  if (plan.illustrationFrom !== "absorbed" || plan.illustration === undefined) return updated;
  return { ...updated, illustration: plan.illustration, height: ILLUSTRATED_NODE_HEIGHT };
}

// 吸収されるノードを配列から消し、その直下の子を、残すノードの直下の子のうち配列順で最後のものの
// 直後（子が無ければ残すノードの直後）へ、吸収されるノードの配列順・各ノード内の元の相対順で付け替える。
// 子孫は動かさず、座標も変えない。残すノードの属性は変えない（呼び出し側が更新する）
function reattachAbsorbedChildren(
  nodes: readonly Node[],
  plan: Extract<NodeMergePlan, { ok: true }>,
  updatedSurvivor: Node,
): Node[] {
  const absorbedIdSet = new Set(plan.absorbedIds);
  const movedChildren: Node[] = [];
  for (const absorbedId of plan.absorbedIds) {
    for (const node of nodes) {
      if (node.parentId === absorbedId) movedChildren.push({ ...node, parentId: plan.survivorId });
    }
  }
  const movedChildIds = new Set(movedChildren.map((node) => node.id));

  const remaining = nodes
    .filter((node) => !absorbedIdSet.has(node.id) && !movedChildIds.has(node.id))
    .map((node) => (node.id === plan.survivorId ? updatedSurvivor : node));
  let anchorIndex = remaining.findIndex((node) => node.id === plan.survivorId);
  remaining.forEach((node, index) => {
    if (node.parentId === plan.survivorId) anchorIndex = index;
  });
  return [...remaining.slice(0, anchorIndex + 1), ...movedChildren, ...remaining.slice(anchorIndex + 1)];
}

// 主選択を残し、ほかを配列から消す。吸収されるノードの直下の子は、残すノードへ付け替える（規則は
// reattachAbsorbedChildren）。自動配置の再レイアウトは applyTreeChange に任せる
export function mergeNodes(
  nodes: readonly Node[],
  ids: readonly number[],
  primaryId: number | null,
  joiner: string,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
): NodeMergeResult {
  const plan = planNodeMerge(nodes, ids, primaryId, joiner, visibleNodeIds);
  if (!plan.ok) return plan;
  const survivor = nodes.find((node) => node.id === plan.survivorId);
  // 計画が成功なら残すノードは必ず見つかる。型の絞り込みのため到達しない
  if (survivor === undefined) return failed("primary-missing");

  const reattached = reattachAbsorbedChildren(nodes, plan, applyPlanToSurvivor(survivor, plan));
  // 先頭のルート（自動配置の列の基準）が吸収されて別のノードに変わるときだけ、旧先頭の座標を新しい先頭へ写す
  const next = mode === "auto" ? keepFirstRootPosition(nodes, reattached) : reattached;
  return { ok: true, nodes: next, survivorId: plan.survivorId, absorbedIds: plan.absorbedIds };
}
