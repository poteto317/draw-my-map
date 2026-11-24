import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { calculateManualOffsetY } from "@/domain/nodes/nodeManualPlacement";
import { DEFAULT_LAYOUT_SPACING } from "@/domain/persistence/mapDocumentLayoutSpacing";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { Node } from "@/types/node";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type SubtreeInsertionResult = {
  nodes: Node[];
  rootId: number;
  // コピー元 id → 採番した新 id（閉じた relation/group の remap 用）
  nodeIdMapping: ReadonlyMap<number, number>;
};

export type SubtreeClipboardGuardResult =
  | { ok: true }
  | { ok: false; reason: "locked" };

// クリップボード規則: 貼り付けで既存ノードの locked を変えない（新規コピーはソースの locked を写す）。
// 採番して追加する経路だけを扱う。親が locked のときその下へは付けない。
export function assertSubtreeClipboardInsertion(
  current: readonly Node[],
  _sources: readonly Node[],
  targetParentId: number | null,
): SubtreeClipboardGuardResult {
  if (targetParentId !== null) {
    const guard = assertNodesEditable([targetParentId], current);
    if (!guard.ok && guard.reason === "locked") return { ok: false, reason: "locked" };
  }
  return { ok: true };
}

// duplicate: 既存の複製と同じ検査だけを行う。paste: 手動配置では右端（x+width）とxの有限性も追加で検査する（下端はduplicateと共通で検査する）
export type SubtreeGeometryPolicy = "duplicate" | "paste";

export type AllocateNodeIds = (occupied: readonly Node[], count: number) => number[];

type InsertionPlan = {
  rootIndex: number;
  parentIndexes: (number | null)[];
  ys: number[];
};

// 有限性の検査は防御として残す。offsetYがhasSufficientGapを通ると、通常はここで失敗しない
function moveVertically(node: Node, offsetY: number): number | null {
  const y = node.y + offsetY;
  if (!Number.isFinite(y) || !Number.isFinite(y + node.height)) return null;
  return y;
}

function hasFiniteHorizontalBounds(node: Node): boolean {
  return Number.isFinite(node.x) && Number.isFinite(node.x + node.width);
}

// 採番前に、親の対応と手動配置の座標をすべて決める。失敗しうる検査はここで済ませる
function planInsertion(
  current: readonly Node[],
  sources: readonly Node[],
  sourceRootId: number,
  mode: NodeLayoutMode,
  geometryPolicy: SubtreeGeometryPolicy,
  spacing: LayoutSpacing,
): InsertionPlan | null {
  const indexBySourceId = new Map<number, number>();
  sources.forEach((source, index) => indexBySourceId.set(source.id, index));
  const rootIndex = indexBySourceId.get(sourceRootId);
  if (rootIndex === undefined) return null;

  const offsetY = mode === "manual" ? calculateManualOffsetY(current, sources, spacing) : 0;
  if (offsetY === null) return null;
  const checksBounds = mode === "manual" && geometryPolicy === "paste";

  const parentIndexes: (number | null)[] = [];
  const ys: number[] = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    if (index === rootIndex) {
      parentIndexes.push(null);
    } else {
      const parentIndex = indexBySourceId.get(source.parentId!);
      if (parentIndex === undefined) return null;
      parentIndexes.push(parentIndex);
    }

    if (checksBounds && !hasFiniteHorizontalBounds(source)) return null;
    const y = mode === "manual" ? moveVertically(source, offsetY) : source.y;
    if (y === null) return null;
    ys.push(y);
  }
  return { rootIndex, parentIndexes, ys };
}

// sourcesは単一の部分木。全ノードに新しいIDを一度に採番し、根をtargetParentIdへつなぐ。
// currentとsourcesは変更せず、currentの後ろへ新しい枝を追加した配列を返す。
// 自動配置のレイアウトはここでは行わない。
export function insertNodeSubtree(
  current: readonly Node[],
  sources: readonly Node[],
  sourceRootId: number,
  targetParentId: number | null,
  mode: NodeLayoutMode,
  allocateIds: AllocateNodeIds,
  geometryPolicy: SubtreeGeometryPolicy,
  spacing: LayoutSpacing = DEFAULT_LAYOUT_SPACING,
): SubtreeInsertionResult | null {
  const clipboardGuard = assertSubtreeClipboardInsertion(current, sources, targetParentId);
  if (!clipboardGuard.ok) return null;

  const plan = planInsertion(current, sources, sourceRootId, mode, geometryPolicy, spacing);
  if (plan === null) return null;

  const ids = allocateIds(current, sources.length);
  const nodeIdMapping = new Map<number, number>();
  const copies = sources.map((source, index): Node => {
    const parentIndex = plan.parentIndexes[index];
    const id = ids[index]!;
    nodeIdMapping.set(source.id, id);
    return {
      ...source,
      id,
      parentId: parentIndex === null ? targetParentId : ids[parentIndex]!,
      y: plan.ys[index]!,
    };
  });

  return {
    nodes: [...current, ...copies],
    rootId: ids[plan.rootIndex]!,
    nodeIdMapping,
  };
}
