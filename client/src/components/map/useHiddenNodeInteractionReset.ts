"use client";

import { useLayoutEffect, useRef } from "react";
import {
  planHiddenNodeInteractionReset,
  sameHiddenInteractionSnapshot,
  type HiddenInteractionSnapshot,
} from "@/components/map/hiddenNodeInteractionReset";

type UseHiddenNodeInteractionResetOptions = {
  selectedNodeIds: readonly number[];
  selectedNodeId: number | null;
  editingNodeId: number | null;
  visibleNodeIds: ReadonlySet<number>;
  pruneSelectionToVisible: (visibleNodeIds: ReadonlySet<number>) => void;
  cancelEditing: () => void;
  cancelActiveGesture: () => void;
};

export function useHiddenNodeInteractionReset({
  selectedNodeIds,
  selectedNodeId,
  editingNodeId,
  visibleNodeIds,
  pruneSelectionToVisible,
  cancelEditing,
  cancelActiveGesture,
}: UseHiddenNodeInteractionResetOptions): void {
  const lastResetRef = useRef<HiddenInteractionSnapshot | null>(null);

  useLayoutEffect(() => {
    const plan = planHiddenNodeInteractionReset({
      selectedNodeIds,
      selectedNodeId,
      editingNodeId,
      visibleNodeIds,
    });

    if (plan === null) {
      lastResetRef.current = null;
      return;
    }

    if (sameHiddenInteractionSnapshot(lastResetRef.current, plan.snapshot)) return;

    lastResetRef.current = plan.snapshot;

    for (const action of plan.actions) {
      if (action === "prune") {
        pruneSelectionToVisible(visibleNodeIds);
      } else if (action === "cancelGesture") {
        cancelActiveGesture();
      } else {
        cancelEditing();
      }
    }
  }, [
    selectedNodeIds,
    selectedNodeId,
    editingNodeId,
    visibleNodeIds,
    pruneSelectionToVisible,
    cancelEditing,
    cancelActiveGesture,
  ]);
}
