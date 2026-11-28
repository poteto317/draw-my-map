import {
  listDockSlotDefs,
  type DockSlotDef,
  type DockSlotGroup,
} from "@/domain/dock/dockSlotCatalog";

/** カタログ上のグループ提示順（カスタマイズ UI と共有） */
export const DOCK_SLOT_GROUP_ORDER: readonly DockSlotGroup[] = [
  "edit",
  "view-tools",
  "session",
  "voice",
  "io",
  "collab-share",
];

export type DockSlotDefsGroup = {
  readonly group: DockSlotGroup;
  readonly defs: readonly DockSlotDef[];
};

/** カタログをグループ順に束ねる（空グループは落とす） */
export function groupDockSlotDefs(
  defs: readonly DockSlotDef[] = listDockSlotDefs(),
): readonly DockSlotDefsGroup[] {
  return DOCK_SLOT_GROUP_ORDER.map((group) => ({
    group,
    defs: defs.filter((def) => def.group === group),
  })).filter((entry) => entry.defs.length > 0);
}
