import type { DockSlotId } from "@/domain/dock/dockSlotCatalog";

/**
 * visible 並びの中で 1 スロットを隣接位置へ移す。
 * 対象が無い／端では null（呼び出し側は no-op）。
 */
export function moveVisibleDockSlot(
  ids: readonly DockSlotId[],
  id: DockSlotId,
  direction: -1 | 1,
): DockSlotId[] | null {
  const index = ids.indexOf(id);
  if (index < 0) return null;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= ids.length) return null;
  const next = [...ids];
  const tmp = next[index]!;
  next[index] = next[nextIndex]!;
  next[nextIndex] = tmp;
  return next;
}
