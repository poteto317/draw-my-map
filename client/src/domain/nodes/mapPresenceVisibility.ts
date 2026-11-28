import type { ResolutionFilterMode } from "@/types/nodeResolution";

export type StructuralVisibilitySets = {
  collapseVisibleNodeIds?: ReadonlySet<number> | null;
  focusVisibleNodeIds?: ReadonlySet<number> | null;
  depthVisibleNodeIds: ReadonlySet<number>;
};

/** collapse ∧ focus ∧ depth（解像度なし） */
export function collectStructuralVisibleNodeIds(
  candidateIds: Iterable<number>,
  {
    collapseVisibleNodeIds,
    focusVisibleNodeIds,
    depthVisibleNodeIds,
  }: StructuralVisibilitySets,
): Set<number> {
  const visible = new Set<number>();
  for (const id of candidateIds) {
    if ((collapseVisibleNodeIds?.has(id) ?? true)
      && (focusVisibleNodeIds?.has(id) ?? true)
      && depthVisibleNodeIds.has(id)) {
      visible.add(id);
    }
  }
  return visible;
}

/** collapse/focus/depth/display が揃い mode が解釈できるとき true。false ならマーカー層スキップ（空算出に倒さない） */
export function arePresenceInputsComplete(input: {
  mode: ResolutionFilterMode | null | undefined;
  collapseVisibleNodeIds: ReadonlySet<number> | null | undefined;
  focusVisibleNodeIds: ReadonlySet<number> | null | undefined;
  depthVisibleNodeIds: ReadonlySet<number> | null | undefined;
  displayVisibleNodeIds: ReadonlySet<number> | null | undefined;
}): boolean {
  if (input.mode == null) return false;
  if (input.depthVisibleNodeIds == null) return false;
  if (input.displayVisibleNodeIds == null) return false;
  // collapse/focus の null = フィルタ無しは完備（現行 display と同じ）。undefined は非完備。
  if (input.collapseVisibleNodeIds === undefined) return false;
  if (input.focusVisibleNodeIds === undefined) return false;
  return true;
}

/**
 * mode!=="auto" → 空（成功のゼロ）。
 * auto かつ完備 → structural − display。
 * 欠落時は呼ばない（呼び出し側が arePresenceInputsComplete でガード）。
 */
export function collectPresenceNodeIds(
  structuralVisibleNodeIds: ReadonlySet<number>,
  displayVisibleNodeIds: ReadonlySet<number>,
  mode: ResolutionFilterMode,
): Set<number> {
  if (mode !== "auto") {
    return new Set();
  }

  const presence = new Set<number>();
  for (const id of structuralVisibleNodeIds) {
    if (!displayVisibleNodeIds.has(id)) {
      presence.add(id);
    }
  }
  return presence;
}

/**
 * 子 in presence、親 in structural、かつフル描画 edge が無いものの child id 配列。
 * フル edge 相当 = 子・親がともに display に含まれる（`collectVisibleMapKeys` と同条件。pixi キー文字列に依存しない）。
 */
export function collectPresenceEdgeChildIds(
  nodes: readonly { id: number; parentId: number | null }[],
  presenceNodeIds: ReadonlySet<number>,
  structuralVisibleNodeIds: ReadonlySet<number>,
  displayVisibleNodeIds: ReadonlySet<number>,
): number[] {
  const childIds: number[] = [];
  for (const node of nodes) {
    if (!presenceNodeIds.has(node.id)) continue;
    if (node.parentId === null) continue;
    if (!structuralVisibleNodeIds.has(node.parentId)) continue;
    // 防御: 正規経路では presence = structural−display のため child∈display は到達しない。
    // 呼び出し側が集合をずらしても、子・親とも display（フル edge 相当）なら二重描画を避ける。
    if (
      displayVisibleNodeIds.has(node.id)
      && displayVisibleNodeIds.has(node.parentId)
    ) {
      continue;
    }
    childIds.push(node.id);
  }
  return childIds;
}
