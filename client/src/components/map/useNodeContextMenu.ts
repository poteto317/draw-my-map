"use client";

import { useCallback, useState } from "react";
import type { Point } from "@/components/map/mapGeometry";
import type { Viewport } from "@/components/map/mapViewport";
import { isNodeContextMenuStale } from "@/components/map/nodeContextMenuStaleness";
import { useNodeContextMenuDismissal } from "@/components/map/useNodeContextMenuDismissal";
import type { Node } from "@/types/node";

export type NodeContextMenuState = { nodeId: number; position: Point };

type UseNodeContextMenuOptions = {
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  resetRevision: number;
  viewport: Viewport;
};

type StoredMenu = NodeContextMenuState & { revision: number; viewport: Viewport };

export function useNodeContextMenu({
  nodes,
  visibleNodeIds,
  resetRevision,
  viewport,
}: UseNodeContextMenuOptions) {
  const [stored, setStored] = useState<StoredMenu | null>(null);

  const isStale = stored !== null && isNodeContextMenuStale({
    menuNodeId: stored.nodeId,
    menuRevision: stored.revision,
    resetRevision,
    visibleNodeIds,
    nodes,
    menuViewport: stored.viewport,
    viewport,
  });
  if (isStale) setStored(null);

  const close = useCallback(() => setStored(null), []);
  const open = useCallback(
    (menu: NodeContextMenuState) => setStored({ ...menu, revision: resetRevision, viewport }),
    [resetRevision, viewport],
  );

  const isOpen = stored !== null && !isStale;
  useNodeContextMenuDismissal(isOpen, close);

  const menu: NodeContextMenuState | null = isOpen
    ? { nodeId: stored.nodeId, position: stored.position }
    : null;

  return { menu, open, close };
}
