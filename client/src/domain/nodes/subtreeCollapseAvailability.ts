export function subtreeCollapseActionAvailability(
  collapsibleIds: readonly number[],
  collapsedNodeIds: ReadonlySet<number>,
): { canExpand: boolean; canCollapse: boolean } {
  let canExpand = false;
  let canCollapse = false;
  for (const id of collapsibleIds) {
    if (collapsedNodeIds.has(id)) canExpand = true;
    else canCollapse = true;
    if (canExpand && canCollapse) break;
  }
  return { canExpand, canCollapse };
}
