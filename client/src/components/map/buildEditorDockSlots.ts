import type { ReactNode } from "react";
import type { EditorDockSlot } from "@/components/layout/EditorDock";
import type { DockSlotId } from "@/domain/dock/dockSlotCatalog";
import { resolveDockSlots } from "@/domain/dock/resolveDockSlots";

export type EditorDockSlotNodes = Partial<Record<DockSlotId, ReactNode>>;

/**
 * prefs の visibleSlotIds と viewMode から、マウントする Dock スロットを組み立てる。
 * ノードが無い ID はスキップ（配線漏れを DOM に出さない）。
 */
export function buildEditorDockSlots(input: {
  readonly visibleSlotIds: readonly DockSlotId[];
  readonly viewMode: "map" | "outline";
  readonly nodesById: EditorDockSlotNodes;
}): EditorDockSlot[] {
  const resolved = resolveDockSlots({
    visibleSlotIds: input.visibleSlotIds,
    viewMode: input.viewMode,
  });
  const slots: EditorDockSlot[] = [];
  for (const id of resolved) {
    const node = input.nodesById[id];
    if (node == null) continue;
    slots.push({ id, node });
  }
  return slots;
}
