import { renderHook } from "@testing-library/react";
import { useMapTourActions } from "@/hooks/useMapTourActions";
import type { StateChange } from "@/hooks/useNodeLayoutState";
import { createTestNode } from "@/testing/createTestNode";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import type { NodeMapState } from "@/types/nodeMapState";

function snapshot(overrides: Partial<MapViewSnapshot> = {}): MapViewSnapshot {
  return {
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    selectedNodeId: 1,
    selectedNodeIds: [1],
    focusRootId: null,
    collapsedNodeIds: [],
    resolutionMode: "all",
    autoResolutionLevel: "all",
    ...overrides,
  };
}

function baseState(extra: Partial<NodeMapState> = {}): NodeMapState {
  return {
    layoutMode: "manual",
    nodes: [createTestNode({ id: 1, label: "root" })],
    ...extra,
  };
}

function mockApplyStateChange(
  present: NodeMapState,
  applied: boolean,
): (update: StateChange) => boolean {
  return (update) => {
    const next = update(present, {});
    if (!next) return false;
    return applied;
  };
}

describe("useMapTourActions", () => {
  it("履歴が確定しなくても、コールバックが設定した already-exists を返す", () => {
    const present = baseState({
      tour: { version: 1, title: "既存", steps: [] },
    });
    const { result } = renderHook(() =>
      useMapTourActions({
        applyStateChangeRaw: mockApplyStateChange(present, false),
        newStepId: () => "s-new",
      }),
    );

    expect(result.current.createTour("二重")).toEqual({
      ok: false,
      reason: "already-exists",
    });
  });

  it("plan が成功しても applyStateChange が false なら placement-failed", () => {
    const view = snapshot();
    const present = baseState({
      tour: {
        version: 1,
        title: "t",
        steps: [{ id: "s1", snapshot: view }],
      },
    });
    const { result } = renderHook(() =>
      useMapTourActions({
        applyStateChangeRaw: mockApplyStateChange(present, false),
        newStepId: () => "s-new",
      }),
    );

    expect(result.current.overwriteTourStepSnapshot("s1", view)).toEqual({
      ok: false,
      reason: "placement-failed",
    });
  });
});