import {
  planAddTourStep,
  planCreateTour,
  planRemoveTour,
  planRemoveTourStep,
  planReorderTourSteps,
  planSetTourStepCaption,
  planSetTourTitle,
  planOverwriteTourStepSnapshot,
} from "@/domain/map/mapTourMutation";
import { MAP_TOUR_STEP_MAX } from "@/types/mapTour";
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
    nodes: [
      createTestNode({ id: 1, label: "root" }),
      createTestNode({ id: 2, parentId: 1, label: "child" }),
    ],
    ...extra,
  };
}

describe("mapTourMutation", () => {
  it("タイトルを正規化してツアーを作成する", () => {
    const planned = planCreateTour("  案内  ");
    expect(planned).toEqual({
      ok: true,
      tour: { version: 1, title: "案内", steps: [] },
    });
  });

  it("空タイトルは拒否する", () => {
    expect(planCreateTour("   ").ok).toBe(false);
  });

  it("ステップを追加・並べ替え・削除する", () => {
    let state = baseState({
      tour: { version: 1, title: "t", steps: [] },
    });
    const add1 = planAddTourStep(state, snapshot({ selectedNodeId: 1 }), "s1");
    expect(add1.ok).toBe(true);
    if (!add1.ok) return;
    state = { ...state, tour: add1.tour };

    const add2 = planAddTourStep(state, snapshot({ selectedNodeId: 2 }), "s2");
    expect(add2.ok).toBe(true);
    if (!add2.ok) return;
    state = { ...state, tour: add2.tour };
    expect(state.tour?.steps.map((s) => s.id)).toEqual(["s1", "s2"]);

    const reordered = planReorderTourSteps(state, 1, 0);
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.tour.steps.map((s) => s.id)).toEqual(["s2", "s1"]);

    const removed = planRemoveTourStep({ ...state, tour: reordered.tour }, "s2");
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.tour.steps).toHaveLength(1);
    expect(removed.tour.steps[0]?.id).toBe("s1");
  });

  it("ステップ上限を超えた追加は拒否する", () => {
    const steps = Array.from({ length: MAP_TOUR_STEP_MAX }, (_, i) => ({
      id: `s${i}`,
      snapshot: snapshot(),
    }));
    const state = baseState({ tour: { version: 1, title: "満杯", steps } });
    expect(planAddTourStep(state, snapshot(), "overflow").ok).toBe(false);
  });

  it("snapshot 上書きと caption を更新する", () => {
    const state = baseState({
      tour: {
        version: 1,
        title: "t",
        steps: [{ id: "s1", snapshot: snapshot(), caption: "旧" }],
      },
    });
    const overwrite = planOverwriteTourStepSnapshot(
      state,
      "s1",
      snapshot({ viewport: { offsetX: 10, offsetY: 0, scale: 1 } }),
    );
    expect(overwrite.ok).toBe(true);
    if (!overwrite.ok) return;
    expect(overwrite.tour.steps[0]?.snapshot.viewport.offsetX).toBe(10);

    const caption = planSetTourStepCaption({ ...state, tour: overwrite.tour }, "s1", "  新しい  ");
    expect(caption.ok).toBe(true);
    if (!caption.ok) return;
    expect(caption.tour.steps[0]?.caption).toBe("新しい");

    const cleared = planSetTourStepCaption({ ...state, tour: caption.tour }, "s1", "   ");
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.tour.steps[0]?.caption).toBeUndefined();

    const overLimit = "あ".repeat(501);
    const invalid = planSetTourStepCaption({ ...state, tour: caption.tour }, "s1", overLimit);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.reason).toBe("invalid-caption");
    expect(caption.tour.steps[0]?.caption).toBe("新しい");
  });

  it("タイトル変更とツアー削除", () => {
    const state = baseState({
      tour: { version: 1, title: "旧", steps: [{ id: "s1", snapshot: snapshot() }] },
    });
    const title = planSetTourTitle(state, "  新タイトル ");
    expect(title.ok).toBe(true);
    if (!title.ok) return;
    expect(title.tour.title).toBe("新タイトル");

    const removed = planRemoveTour(state);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.state.tour).toBeUndefined();
  });
});