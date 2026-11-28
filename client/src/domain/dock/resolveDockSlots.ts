import {
  getDockSlotDef,
  isDockSlotId,
  type DockSlotDef,
  type DockSlotId,
} from "@/domain/dock/dockSlotCatalog";

export type ResolveDockSlotsInput = {
  readonly visibleSlotIds: readonly DockSlotId[];
  readonly viewMode: "map" | "outline";
};

export function isDockSlotMountedInView(
  def: Pick<DockSlotDef, "outlineVisible" | "requiresMapView">,
  viewMode: "map" | "outline",
): boolean {
  if (viewMode === "map") return true;
  // 設計決めたこと10: outlineVisible===false OR requiresMapView===true は非マウント
  return def.outlineVisible && !def.requiresMapView;
}

export function resolveDockSlots(input: ResolveDockSlotsInput): DockSlotId[] {
  const result: DockSlotId[] = [];
  const seen = new Set<DockSlotId>();
  for (const id of input.visibleSlotIds) {
    if (!isDockSlotId(id) || seen.has(id)) continue;
    const def = getDockSlotDef(id);
    if (!def) continue;
    if (!isDockSlotMountedInView(def, input.viewMode)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
