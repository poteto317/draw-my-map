export function resolveSelectionTargetIds(
  viewMode: "map" | "outline",
  selectedNodeId: number | null,
  selectedNodeIds: readonly number[],
): readonly number[] {
  if (viewMode === "map") return selectedNodeIds;
  return selectedNodeId === null ? [] : [selectedNodeId];
}
