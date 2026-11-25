import { act, renderHook } from "@testing-library/react";
import {
  createMapDocument,
  parseMapDocumentJson,
  serializeMapDocument,
} from "@/domain/persistence/mapDocumentCodec";
import { mapDocumentOptionsFromState } from "@/domain/persistence/mapDocumentState";
import { useNodes } from "@/hooks/useNodes";
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

function renderNodes(initial: NodeMapState) {
  const view = renderHook(() => useNodes());
  act(() => view.result.current.replaceMap(initial));
  return view;
}

describe("useNodes map tour", () => {
  it("ツアー編集は 1 操作 1 Undo", () => {
    const { result } = renderNodes(baseState());
    act(() => {
      expect(result.current.createTour("ガイド")).toEqual({ ok: true });
      expect(result.current.addTourStep(snapshot(), "s1")).toEqual({ ok: true, stepId: "s1" });
      expect(result.current.setTourStepCaption("s1", "説明")).toEqual({ ok: true });
    });
    expect(result.current.tour?.steps[0]?.caption).toBe("説明");

    act(() => expect(result.current.undo()).toBe(true));
    expect(result.current.tour?.steps[0]?.caption).toBeUndefined();

    act(() => expect(result.current.undo()).toBe(true));
    expect(result.current.tour?.steps).toHaveLength(0);
    expect(result.current.tour?.title).toBe("ガイド");

    act(() => expect(result.current.undo()).toBe(true));
    expect(result.current.tour).toBeUndefined();
  });

  it("同一マップの永続化投影に tour を含める", () => {
    const { result } = renderNodes(baseState());
    act(() => {
      result.current.createTour("保存");
      result.current.addTourStep(snapshot(), "s1");
    });
    const state = {
      layoutMode: result.current.layoutMode,
      tour: result.current.tour,
    } satisfies Partial<NodeMapState>;
    const json = serializeMapDocument(createMapDocument(result.current.nodes, result.current.layoutMode, {
      ...mapDocumentOptionsFromState(state),
    }));
    const parsed = parseMapDocumentJson(json);
    expect(parsed.ok && parsed.value.tour?.title).toBe("保存");
  });
});