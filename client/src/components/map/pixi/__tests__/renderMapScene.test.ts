import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { collectVisibleMapKeys } from "@/components/map/pixi/mapVisibilityKeys";
import { COMMENT_BADGE_RADIUS } from "@/components/map/pixi/renderMapNodes";
import { renderMapScene } from "@/components/map/pixi/renderMapScene";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

const inactiveLearnDisplay = { learningActive: false, revealedNodeIds: new Set<number>() };
const emptyTaskProgress = new Map<number, { percent: number; remaining: number }>();

const nodes: Node[] = [
  createTestNode({
    id: 1, parentId: null, x: 50, y: 30,
    width: 100, height: 60, label: "親",
  }),
  createTestNode({
    id: 2, parentId: 1, x: 270, y: 30,
    width: 100, height: 60, label: "子",
  }),
];

describe("renderMapScene", () => {
  it("前の描画を破棄してworld内へエッジをノードより先に追加する", () => {
    const harness = createPixiTestHarness();
    const previousChild = { destroy: jest.fn() };
    harness.children.push(previousChild);

    const scene = renderMapScene(harness.app as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      learnDisplay: inactiveLearnDisplay,
      nodes,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      siblingReorderIndicator: null,
      highlightNodeIds: new Set<number>(),
  pinnedNodeIds: new Set<number>(),
      onNodePointerDown: jest.fn(),
      viewport: INITIAL_VIEWPORT,
    });

    const world = harness.containers[0];
    expect(scene.worldContainer).toBe(world);
    expect([...scene.visibilityTargets.keys()]).toEqual(["edge:2", "node:1", "node:2"]);
    expect(previousChild.destroy).toHaveBeenCalledWith({ children: true, context: true });
    expect(harness.stage.addChild).toHaveBeenCalledWith(world);
    expect(world.addChild.mock.calls.map(([child]: [unknown]) => child)).toEqual([
      harness.Graphics.mock.results[0].value,
      harness.containers[1],
      harness.containers[2],
    ]);
  });

  it("viewportを適用したworld containerへエッジとノードを描画する", () => {
    const harness = createPixiTestHarness();
    const viewport = { offsetX: 30, offsetY: -10, scale: 2 };

    renderMapScene(harness.app as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      learnDisplay: inactiveLearnDisplay,
      nodes,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      siblingReorderIndicator: null,
      highlightNodeIds: new Set<number>(),
  pinnedNodeIds: new Set<number>(),
      onNodePointerDown: jest.fn(),
      viewport,
    });

    const world = harness.containers[0];
    expect(world.position.set).toHaveBeenCalledWith(30, -10);
    expect(world.scale.set).toHaveBeenCalledWith(2);
    expect(harness.stage.addChild).toHaveBeenCalledWith(world);
  });

  it("ノードが空でもworld containerをstageへ追加する", () => {
    const harness = createPixiTestHarness();

    renderMapScene(harness.app as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      learnDisplay: inactiveLearnDisplay,
      nodes: [],
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      siblingReorderIndicator: null,
      highlightNodeIds: new Set<number>(),
  pinnedNodeIds: new Set<number>(),
      onNodePointerDown: jest.fn(),
      viewport: INITIAL_VIEWPORT,
    });

    expect(harness.stage.removeChildren).toHaveBeenCalledTimes(1);
    expect(harness.stage.addChild).toHaveBeenCalledTimes(1);
    expect(harness.stage.addChild).toHaveBeenCalledWith(harness.containers[0]);
  });

  it("visibleNodeIdsをノードとエッジの描画へ反映する", () => {
    const harness = createPixiTestHarness();
    renderMapScene(harness.app as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      learnDisplay: inactiveLearnDisplay,
      nodes, taskProgress: emptyTaskProgress, selectedNodeIds: [], editingNodeId: null, connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null, siblingReorderIndicator: null, onNodePointerDown: jest.fn(), viewport: INITIAL_VIEWPORT, visibleNodeIds: new Set([2]),
      highlightNodeIds: new Set<number>(),
  pinnedNodeIds: new Set<number>(),
    });

    expect(harness.Graphics).toHaveBeenCalledTimes(3);
    expect(harness.containers[1]).toMatchObject({ alpha: 0, visible: false, eventMode: "none" });
  });

  it("全targetの初期状態を共通visible key policyと一致させる", () => {
    const harness = createPixiTestHarness();
    const hiddenChild = { ...nodes[1], id: 3 };
    const sceneNodes = [...nodes, hiddenChild];
    const visibleNodeIds = new Set([1, 2]);

    const scene = renderMapScene(harness.app as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      learnDisplay: inactiveLearnDisplay,
      nodes: sceneNodes,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      siblingReorderIndicator: null,
      highlightNodeIds: new Set<number>(),
  pinnedNodeIds: new Set<number>(),
      onNodePointerDown: jest.fn(),
      viewport: INITIAL_VIEWPORT,
      visibleNodeIds,
    });
    const renderedObjects = new Map<string, { alpha: number; visible: boolean; eventMode: string }>([
      ["edge:2", harness.Graphics.mock.results[0].value],
      ["edge:3", harness.Graphics.mock.results[1].value],
      ["node:1", harness.containers[1]],
      ["node:2", harness.containers[2]],
      ["node:3", harness.containers[3]],
    ]);
    const visibleKeys = collectVisibleMapKeys(sceneNodes, visibleNodeIds);

    expect([...scene.visibilityTargets.keys()]).toEqual([...renderedObjects.keys()]);
    for (const [key, renderedObject] of renderedObjects) {
      const isVisible = visibleKeys.has(key);
      expect(renderedObject).toMatchObject({
        alpha: isVisible ? 1 : 0,
        visible: isVisible,
        eventMode: key.startsWith("node:") && isVisible ? "static" : "none",
      });
    }
  });

  it("挿入位置の線をノードより後にworldへ追加し、可視性のターゲットには入れない", () => {
    const harness = createPixiTestHarness();

    const scene = renderMapScene(harness.app as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      learnDisplay: inactiveLearnDisplay,
      nodes,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: 2,
      siblingReorderIndicator: { left: 262, right: 378, y: 110 },
      highlightNodeIds: new Set<number>(),
  pinnedNodeIds: new Set<number>(),
      onNodePointerDown: jest.fn(),
      viewport: INITIAL_VIEWPORT,
    });

    const world = harness.containers[0];
    const line = harness.Graphics.mock.results.at(-1)!.value;
    expect(line.rect).toHaveBeenCalledWith(262, 107, 116, 6);
    expect(world.addChild.mock.calls.map(([child]: [unknown]) => child)).toEqual([
      harness.Graphics.mock.results[0].value,
      harness.containers[1],
      harness.containers[2],
      line,
    ]);
    expect([...scene.visibilityTargets.keys()]).toEqual(["edge:2", "node:1", "node:2"]);
  });

  it("siblingReorderIndicatorがnullなら線を追加しない", () => {
    const harness = createPixiTestHarness();

    renderMapScene(harness.app as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      learnDisplay: inactiveLearnDisplay,
      nodes,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: 2,
      siblingReorderIndicator: null,
      highlightNodeIds: new Set<number>(),
  pinnedNodeIds: new Set<number>(),
      onNodePointerDown: jest.fn(),
      viewport: INITIAL_VIEWPORT,
    });

    const world = harness.containers[0];
    expect(harness.Graphics).toHaveBeenCalledTimes(3);
    expect(world.addChild).toHaveBeenCalledTimes(3);
  });

  it("marqueeRect があるときラバーバンドをノードより後に重ねる", () => {
    const harness = createPixiTestHarness();

    renderMapScene(harness.app as never, harness.constructors as never, {
      commentNodeCounts: new Map(),
      learnDisplay: inactiveLearnDisplay,
      nodes,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      siblingReorderIndicator: null,
      highlightNodeIds: new Set<number>(),
  pinnedNodeIds: new Set<number>(),
      marqueeRect: { x: 10, y: 20, width: 100, height: 40 },
      onNodePointerDown: jest.fn(),
      viewport: INITIAL_VIEWPORT,
    });

    const world = harness.containers[0];
    const band = harness.Graphics.mock.results.at(-1)!.value;
    expect(band.rect).toHaveBeenCalledWith(10, 20, 100, 40);
    expect(world.addChild.mock.calls.at(-1)?.[0]).toBe(band);
  });

  it("commentNodeCounts をノードの描画へ渡し、件数のあるノードにだけバッジを描く", () => {
    const harness = createPixiTestHarness();

    renderMapScene(harness.app as never, harness.constructors as never, {
      commentNodeCounts: new Map([[2, 5]]),
      learnDisplay: inactiveLearnDisplay,
      nodes,
      taskProgress: emptyTaskProgress,
      selectedNodeIds: [],
      editingNodeId: null,
      connectionTargetNodeId: null,
      siblingReorderSourceNodeId: null,
      siblingReorderIndicator: null,
      highlightNodeIds: new Set<number>(),
      pinnedNodeIds: new Set<number>(),
      onNodePointerDown: jest.fn(),
      viewport: INITIAL_VIEWPORT,
    });

    const circles = harness.Graphics.mock.results
      .map((result) => result.value as { circle: jest.Mock })
      .filter((graphics) => graphics.circle.mock.calls.length > 0);
    expect(circles).toHaveLength(1);
    expect(circles[0].circle).toHaveBeenCalledWith(270, 90, COMMENT_BADGE_RADIUS);
    const texts = harness.Text.mock.calls.map(([options]: [{ text: string }]) => options.text);
    expect(texts).toContain("5");
  });
});
