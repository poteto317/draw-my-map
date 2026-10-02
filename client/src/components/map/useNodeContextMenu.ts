"use client";

import { useCallback, useEffect, useState } from "react";
import type { Point } from "@/components/map/mapGeometry";
import type { Node } from "@/types/node";

export type NodeContextMenuState = { nodeId: number; position: Point };

type UseNodeContextMenuOptions = {
  nodes: readonly Node[];
  visibleNodeIds: ReadonlySet<number>;
  resetRevision: number;
};

type StoredMenu = NodeContextMenuState & { revision: number };

export function useNodeContextMenu({
  nodes,
  visibleNodeIds,
  resetRevision,
}: UseNodeContextMenuOptions) {
  const [stored, setStored] = useState<StoredMenu | null>(null);

  const isStale = stored !== null && (
    stored.revision !== resetRevision
    || !visibleNodeIds.has(stored.nodeId)
    || !nodes.some((node) => node.id === stored.nodeId)
  );
  if (isStale) setStored(null);

  const close = useCallback(() => setStored(null), []);
  const open = useCallback(
    (menu: NodeContextMenuState) => setStored({ ...menu, revision: resetRevision }),
    [resetRevision],
  );

  const isOpen = stored !== null && !isStale;
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[role="menu"]')) return;
      close();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("blur", close);
    };
  }, [isOpen, close]);

  const menu: NodeContextMenuState | null = isOpen
    ? { nodeId: stored.nodeId, position: stored.position }
    : null;

  return { menu, open, close };
}
