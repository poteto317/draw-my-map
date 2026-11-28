/** collapse ∧ focus ∧ depth の共通入力（display / structural が共有）。 */
export type CollapseFocusDepthSets = {
  collapseVisibleNodeIds?: ReadonlySet<number> | null;
  focusVisibleNodeIds?: ReadonlySet<number> | null;
  depthVisibleNodeIds: ReadonlySet<number>;
};

/**
 * collapse ∧ focus ∧ depth の単一 predicate。
 * display / structural の両方から呼び、条件ドリフトを防ぐ。
 */
export function isCollapseFocusDepthVisible(
  id: number,
  {
    collapseVisibleNodeIds,
    focusVisibleNodeIds,
    depthVisibleNodeIds,
  }: CollapseFocusDepthSets,
): boolean {
  return (collapseVisibleNodeIds?.has(id) ?? true)
    && (focusVisibleNodeIds?.has(id) ?? true)
    && depthVisibleNodeIds.has(id);
}

export type DisplayVisibilitySets = CollapseFocusDepthSets & {
  resolutionVisibleNodeIds: ReadonlySet<number>;
  focusRootId?: number | null;
};

/** 折りたたみ ∧ 集中 ∧ 解像度 ∧ 深さ（集中先は解像度免除）の最終可視集合。 */
export function collectDisplayVisibleNodeIds(
  candidateIds: Iterable<number>,
  {
    collapseVisibleNodeIds,
    focusVisibleNodeIds,
    resolutionVisibleNodeIds,
    depthVisibleNodeIds,
    focusRootId = null,
  }: DisplayVisibilitySets,
): Set<number> {
  const structuralSets: CollapseFocusDepthSets = {
    collapseVisibleNodeIds,
    focusVisibleNodeIds,
    depthVisibleNodeIds,
  };
  const visible = new Set<number>();
  for (const id of candidateIds) {
    if (
      isCollapseFocusDepthVisible(id, structuralSets)
      && (id === focusRootId || resolutionVisibleNodeIds.has(id))
    ) {
      visible.add(id);
    }
  }
  return visible;
}
