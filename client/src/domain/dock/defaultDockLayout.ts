import {
  isDockSlotId,
  listDockSlotDefs,
  type DockSlotId,
} from "@/domain/dock/dockSlotCatalog";
import { isPlainRecord, readProperty } from "@/domain/shared/unknownRecord";

export type DockLayoutPrefs = {
  readonly visibleSlotIds: readonly DockSlotId[];
};

export function createDefaultDockVisibleSlotIds(): DockSlotId[] {
  return listDockSlotDefs()
    .filter((def) => def.defaultVisible)
    .map((def) => def.id);
}

export function createDefaultDockLayout(): DockLayoutPrefs {
  return {
    visibleSlotIds: createDefaultDockVisibleSlotIds(),
  };
}

export function normalizeDockVisibleSlotIds(ids: unknown): DockSlotId[] {
  if (!Array.isArray(ids)) {
    return createDefaultDockVisibleSlotIds();
  }
  const seen = new Set<DockSlotId>();
  const normalized: DockSlotId[] = [];
  for (const entry of ids) {
    if (!isDockSlotId(entry) || seen.has(entry)) continue;
    seen.add(entry);
    normalized.push(entry);
  }
  if (normalized.length === 0) {
    return createDefaultDockVisibleSlotIds();
  }
  return normalized;
}

export function normalizeDockLayout(raw: unknown): DockLayoutPrefs {
  if (!isPlainRecord(raw)) {
    return createDefaultDockLayout();
  }
  return {
    visibleSlotIds: normalizeDockVisibleSlotIds(
      readProperty(raw, "visibleSlotIds"),
    ),
  };
}
