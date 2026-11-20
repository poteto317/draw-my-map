import { createNodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { isSameMapView, resolveRestoredMapView } from "@/domain/nodes/mapViewSnapshot";
import { createTestNode } from "@/testing/createTestNode";
import type { MapViewSnapshot } from "@/types/mapViewSnapshot";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, importance: Node["importance"] = "medium"): Node {
  return createTestNode({ id, parentId, label: String(id), importance });
}

function snapshot(overrides: Partial<MapViewSnapshot> = {}): MapViewSnapshot {
  return {
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    selectedNodeId: null,
    selectedNodeIds: [],
    focusRootId: null,
    collapsedNodeIds: [],
    resolutionMode: "all",
    autoResolutionLevel: "all",
    ...overrides,
  };
}

describe("isSameMapView", () => {
  it("全項目が一致すれば true", () => {
    const left = snapshot({
      viewport: { offsetX: 10, offsetY: 20, scale: 1.5 },
      selectedNodeId: 1,
      selectedNodeIds: [1, 2],
      focusRootId: 1,
      collapsedNodeIds: [2],
      resolutionMode: "medium",
      autoResolutionLevel: "medium",
    });
    const right = snapshot({
      viewport: { offsetX: 10, offsetY: 20, scale: 1.5 },
      selectedNodeId: 1,
      selectedNodeIds: [2, 1],
      focusRootId: 1,
      collapsedNodeIds: [2],
      resolutionMode: "medium",
      autoResolutionLevel: "medium",
    });

    expect(isSameMapView(left, right)).toBe(true);
  });

  it("いずれかが異なれば false", () => {
    const base = snapshot({ selectedNodeIds: [1], collapsedNodeIds: [2], focusRootId: 1 });

    expect(isSameMapView(base, snapshot({ ...base, viewport: { ...base.viewport, offsetX: 1 } }))).toBe(false);
    expect(isSameMapView(base, snapshot({ ...base, selectedNodeId: 9 }))).toBe(false);
    expect(isSameMapView(base, snapshot({ ...base, selectedNodeIds: [1, 3] }))).toBe(false);
    expect(isSameMapView(base, snapshot({ ...base, focusRootId: 2 }))).toBe(false);
    expect(isSameMapView(base, snapshot({ ...base, collapsedNodeIds: [3] }))).toBe(false);
    expect(isSameMapView(base, snapshot({ ...base, resolutionMode: "high" }))).toBe(false);
    expect(isSameMapView(base, snapshot({ ...base, autoResolutionLevel: "high" }))).toBe(false);
  });
});

describe("resolveRestoredMapView", () => {
  const nestedNodes = Object.freeze([
    node(1, null, "high"),
    node(2, 1, "high"),
    node(3, 2, "high"),
    node(4, 1, "low"),
  ]);

  it("集中先が欠落していると focusRootId を null にする", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const result = resolveRestoredMapView(
      snapshot({ focusRootId: 999, collapsedNodeIds: [2] }),
      nestedNodes,
      index,
    );

    expect(result.normalized.focusRootId).toBeNull();
  });

  it("祖先の閉 ID を除去する", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const result = resolveRestoredMapView(
      snapshot({
        focusRootId: 3,
        collapsedNodeIds: [1, 2, 999],
      }),
      nestedNodes,
      index,
    );

    expect(result.normalized.focusRootId).toBe(3);
    expect(result.normalized.collapsedNodeIds).toEqual([]);
    expect([...result.collapsedIds]).toEqual([]);
  });

  it("可視集合外の選択を prune する", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const result = resolveRestoredMapView(
      snapshot({
        selectedNodeId: 4,
        selectedNodeIds: [3, 4],
        focusRootId: 2,
        resolutionMode: "high",
        autoResolutionLevel: "high",
      }),
      nestedNodes,
      index,
    );

    expect(result.normalized.selectedNodeId).toBe(3);
    expect(result.normalized.selectedNodeIds).toEqual([3]);
    expect(result.selection.primaryId).toBe(3);
    expect([...result.selection.selectedIds]).toEqual([3]);
  });

  it('resolutionMode が "auto" のとき解決後レベルを autoResolutionLevel に書く', () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const result = resolveRestoredMapView(
      snapshot({
        viewport: { offsetX: 0, offsetY: 0, scale: 0.4 },
        resolutionMode: "auto",
        autoResolutionLevel: "all",
      }),
      nestedNodes,
      index,
    );

    expect(result.normalized.autoResolutionLevel).toBe("high");
  });

  it("固定モードでは snapshot の autoResolutionLevel を保持する", () => {
    const index = createNodeCollapseIndex(nestedNodes)!;
    const result = resolveRestoredMapView(
      snapshot({
        viewport: { offsetX: 0, offsetY: 0, scale: 0.4 },
        resolutionMode: "medium",
        autoResolutionLevel: "all",
      }),
      nestedNodes,
      index,
    );

    expect(result.normalized.autoResolutionLevel).toBe("all");
  });

  it("index が null のとき focus と collapse をクリアする", () => {
    const result = resolveRestoredMapView(
      snapshot({
        focusRootId: 2,
        collapsedNodeIds: [1, 2],
        selectedNodeId: 3,
        selectedNodeIds: [3, 4],
      }),
      nestedNodes,
      null,
    );

    expect(result.normalized.focusRootId).toBeNull();
    expect(result.normalized.collapsedNodeIds).toEqual([]);
    expect([...result.collapsedIds]).toEqual([]);
  });
});
