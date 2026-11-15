export type NodeSelectionState = {
  selectedIds: ReadonlySet<number>;
  primaryId: number | null;
  anchorId: number | null;
};

const EMPTY_SELECTION: NodeSelectionState = {
  selectedIds: new Set(),
  primaryId: null,
  anchorId: null,
};

export function clear(): NodeSelectionState {
  return EMPTY_SELECTION;
}

export function selectOnly(id: number): NodeSelectionState {
  return {
    selectedIds: new Set([id]),
    primaryId: id,
    anchorId: id,
  };
}

export function toggle(
  state: NodeSelectionState,
  id: number,
  orderedNodeIds: readonly number[],
): NodeSelectionState {
  if (state.selectedIds.has(id)) {
    const selectedIds = new Set(state.selectedIds);
    selectedIds.delete(id);
    if (selectedIds.size === 0) return clear();

    const primaryId =
      state.primaryId === id
        ? orderedNodeIds.find((nodeId) => selectedIds.has(nodeId)) ?? selectedIds.values().next().value!
        : state.primaryId!;
    return { selectedIds, primaryId, anchorId: primaryId };
  }

  const selectedIds = new Set(state.selectedIds);
  selectedIds.add(id);
  return { selectedIds, primaryId: id, anchorId: id };
}

export function addRange(
  state: NodeSelectionState,
  targetId: number,
  orderedVisibleIds: readonly number[],
): NodeSelectionState {
  const anchorId = state.anchorId;
  if (anchorId === null) return selectOnly(targetId);

  const anchorIndex = orderedVisibleIds.indexOf(anchorId);
  const targetIndex = orderedVisibleIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) return selectOnly(targetId);

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  const selectedIds = new Set(state.selectedIds);
  for (let index = start; index <= end; index += 1) {
    selectedIds.add(orderedVisibleIds[index]!);
  }
  return { selectedIds, primaryId: targetId, anchorId };
}

export function replaceWithMarquee(ids: readonly number[]): NodeSelectionState {
  if (ids.length === 0) return clear();
  const lastId = ids[ids.length - 1]!;
  return {
    selectedIds: new Set(ids),
    primaryId: lastId,
    anchorId: lastId,
  };
}

export function addMarquee(
  state: NodeSelectionState,
  ids: readonly number[],
): NodeSelectionState {
  if (ids.length === 0) return clear();
  const selectedIds = new Set(state.selectedIds);
  for (const id of ids) selectedIds.add(id);
  const lastId = ids[ids.length - 1]!;
  return { selectedIds, primaryId: lastId, anchorId: lastId };
}

export function pruneMissing(
  state: NodeSelectionState,
  remainingIds: ReadonlySet<number>,
  orderedNodeIds: readonly number[],
): NodeSelectionState {
  const selectedIds = new Set<number>();
  for (const id of state.selectedIds) {
    if (remainingIds.has(id)) selectedIds.add(id);
  }
  if (selectedIds.size === 0) return clear();

  const primaryId =
    state.primaryId !== null && selectedIds.has(state.primaryId)
      ? state.primaryId
      : orderedNodeIds.find((id) => selectedIds.has(id)) ?? selectedIds.values().next().value!;

  const anchorId =
    state.anchorId !== null && selectedIds.has(state.anchorId) ? state.anchorId : primaryId;

  return { selectedIds, primaryId, anchorId };
}
