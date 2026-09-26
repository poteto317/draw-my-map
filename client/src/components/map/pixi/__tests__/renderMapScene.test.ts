import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { renderMapScene } from "@/components/map/pixi/renderMapScene";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import type { Node } from "@/types/node";

const nodes: Node[] = [
  {
    id: 1, parentId: null, x: 50, y: 30,
    width: 100, height: 60, label: "親", importance: "medium",
  },
  {
    id: 2, parentId: 1, x: 270, y: 30,
    width: 100, height: 60, label: "子", importance: "medium",
  },
];

describe("renderMapScene", () => {
  it("前の描画を破棄してworld内へエッジをノードより先に追加する", () => {
    const harness = createPixiTestHarness();
    const previousChild = { destroy: jest.fn() };
    harness.children.push(previousChild);

    const returnedWorld = renderMapScene(harness.app as never, harness.constructors as never, {
      nodes,
      selectedNodeId: null,
      editingNodeId: null,
      connectionTargetNodeId: null,
      onNodePointerDown: jest.fn(),
      viewport: INITIAL_VIEWPORT,
    });

    const world = harness.containers[0];
    expect(returnedWorld).toBe(world);
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
      nodes,
      selectedNodeId: null,
      editingNodeId: null,
      connectionTargetNodeId: null,
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
      nodes: [],
      selectedNodeId: null,
      editingNodeId: null,
      connectionTargetNodeId: null,
      onNodePointerDown: jest.fn(),
      viewport: INITIAL_VIEWPORT,
    });

    expect(harness.stage.removeChildren).toHaveBeenCalledTimes(1);
    expect(harness.stage.addChild).toHaveBeenCalledTimes(1);
    expect(harness.stage.addChild).toHaveBeenCalledWith(harness.containers[0]);
  });
});
