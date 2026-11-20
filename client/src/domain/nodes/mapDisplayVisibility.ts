export type DisplayVisibilitySets = {
  collapseVisibleNodeIds?: ReadonlySet<number> | null;
  focusVisibleNodeIds?: ReadonlySet<number> | null;
  resolutionVisibleNodeIds: ReadonlySet<number>;
  focusRootId?: number | null;
};

/** 折りたたみ ∧ 集中 ∧ 解像度（集中先は解像度免除）の最終可視集合。 */
export function collectDisplayVisibleNodeIds(
  candidateIds: Iterable<number>,
  {
    collapseVisibleNodeIds,
    focusVisibleNodeIds,
    resolutionVisibleNodeIds,
    focusRootId = null,
  }: DisplayVisibilitySets,
): Set<number> {
  const visible = new Set<number>();
  for (const id of candidateIds) {
    if ((collapseVisibleNodeIds?.has(id) ?? true)
      && (focusVisibleNodeIds?.has(id) ?? true)
      && (id === focusRootId || resolutionVisibleNodeIds.has(id))) {
      visible.add(id);
    }
  }
  return visible;
}
