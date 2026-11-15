export type HiddenInteractionSnapshot = {
  hiddenSelectedKey: string;
  editingNodeId: number | null;
  primaryHidden: boolean;
};

export type HiddenInteractionResetAction =
  | "prune"
  | "cancelGesture"
  | "cancelEditing";

export type HiddenInteractionResetPlan = {
  snapshot: HiddenInteractionSnapshot;
  actions: readonly HiddenInteractionResetAction[];
};

type PlanInput = {
  selectedNodeIds: readonly number[];
  selectedNodeId: number | null;
  editingNodeId: number | null;
  visibleNodeIds: ReadonlySet<number>;
};

/** 非表示になった選択／編集に対する解除アクション列を純粋に決める。対象が無ければ null */
export function planHiddenNodeInteractionReset({
  selectedNodeIds,
  selectedNodeId,
  editingNodeId,
  visibleNodeIds,
}: PlanInput): HiddenInteractionResetPlan | null {
  const hiddenSelectedIds = selectedNodeIds.filter((id) => !visibleNodeIds.has(id));
  const hiddenEditingId = editingNodeId !== null && !visibleNodeIds.has(editingNodeId)
    ? editingNodeId
    : null;
  const primaryHidden = selectedNodeId !== null && !visibleNodeIds.has(selectedNodeId);

  if (hiddenSelectedIds.length === 0 && hiddenEditingId === null) {
    return null;
  }

  const actions: HiddenInteractionResetAction[] = [];
  if (hiddenSelectedIds.length > 0) {
    actions.push("prune");
  }

  if (primaryHidden) {
    actions.push("cancelGesture");
    if (hiddenEditingId !== null) actions.push("cancelEditing");
  } else if (hiddenEditingId !== null) {
    actions.push("cancelEditing");
    actions.push("cancelGesture");
  }

  return {
    snapshot: {
      hiddenSelectedKey: hiddenSelectedIds.join(","),
      editingNodeId: hiddenEditingId,
      primaryHidden,
    },
    actions,
  };
}

export function sameHiddenInteractionSnapshot(
  a: HiddenInteractionSnapshot | null,
  b: HiddenInteractionSnapshot,
): boolean {
  return a !== null
    && a.hiddenSelectedKey === b.hiddenSelectedKey
    && a.editingNodeId === b.editingNodeId
    && a.primaryHidden === b.primaryHidden;
}
