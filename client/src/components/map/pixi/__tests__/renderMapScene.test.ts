import { renderMapScene } from "@/components/map/pixi/renderMapScene";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import type { Node } from "@/types/node";

const nodes: Node[] = [
  {
    id: 1, parentId: null, x: 50, y: 30,
    width: 100, height: 60, label: "親",
  },
  {
    id: 2, parentId: 1, x: 270, y: 30,
    width: 100, height: 60, label: "子",
  },
];

describe("renderMapScene", () => {
  it("clears the previous projection, then adds edges before nodes", () => {
    const harness = createPixiTestHarness();
    const previousChild = { destroy: jest.fn() };
    harness.children.push(previousChild);

    renderMapScene(harness.app as never, harness.constructors as never, {
      nodes,
      selectedNodeId: null,
      editingNodeId: null,
      connectionTargetNodeId: null,
      onNodePointerDown: jest.fn(),
    });

    expect(previousChild.destroy).toHaveBeenCalledWith({ children: true, context: true });
    expect(harness.stage.addChild).toHaveBeenCalledTimes(3);
    expect(harness.stage.addChild.mock.calls[0][0]).toBe(harness.Graphics.mock.results[0].value);
    expect(harness.stage.addChild.mock.calls.slice(1).map(([child]) => child)).toEqual([
      harness.Container.mock.results[0].value,
      harness.Container.mock.results[1].value,
    ]);
  });

  it("only clears the previous projection when nodes are empty", () => {
    const harness = createPixiTestHarness();

    renderMapScene(harness.app as never, harness.constructors as never, {
      nodes: [],
      selectedNodeId: null,
      editingNodeId: null,
      connectionTargetNodeId: null,
      onNodePointerDown: jest.fn(),
    });

    expect(harness.stage.removeChildren).toHaveBeenCalledTimes(1);
    expect(harness.stage.addChild).not.toHaveBeenCalled();
  });
});
