import { renderMapEdges } from "@/components/map/pixi/renderMapEdges";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

const root: Node = createTestNode({
  id: 1, parentId: null, x: 50, y: 30,
  width: 100, height: 60, label: "親",
});
const child: Node = createTestNode({
  id: 2, parentId: 1, x: 270, y: 90,
  width: 100, height: 60, label: "子",
});

describe("renderMapEdges", () => {
  it("draws each valid relationship as an addressable edge target", () => {
    const harness = createPixiTestHarness();

    const targets = renderMapEdges(harness.app.stage as never, harness.constructors as never, [root, child]);

    const edges = harness.Graphics.mock.results[0].value;
    expect(harness.Graphics).toHaveBeenCalledTimes(1);
    expect(edges.moveTo).toHaveBeenCalledWith(150, 60);
    expect(edges.bezierCurveTo).toHaveBeenCalledWith(210, 60, 210, 120, 270, 120);
    expect(edges.stroke).toHaveBeenCalledWith({ width: 2, color: 0x64748b });
    expect(harness.stage.addChild).toHaveBeenCalledWith(edges);
    const target = targets.get("edge:2")!;
    target.setInteractive(true);
    target.setOpacity(0.5);
    target.setRendered(false);
    expect(edges).toMatchObject({ alpha: 0.5, visible: false, eventMode: "none" });
  });

  it("does not allocate a layer when every relationship is orphaned", () => {
    const harness = createPixiTestHarness();

    renderMapEdges(
      harness.app.stage as never,
      harness.constructors as never,
      [{ ...child, parentId: 999 }],
    );

    expect(harness.Graphics).not.toHaveBeenCalled();
    expect(harness.stage.addChild).not.toHaveBeenCalled();
  });

  it("親子の両方が可視なエッジだけを初期表示する", () => {
    const hiddenChild = { ...child, id: 3, parentId: 1 };
    const harness = createPixiTestHarness();

    renderMapEdges(
      harness.app.stage as never,
      harness.constructors as never,
      [root, child, hiddenChild],
      new Set(["node:1", "node:2", "edge:2"]),
    );

    const visibleEdge = harness.Graphics.mock.results[0].value;
    const hiddenEdge = harness.Graphics.mock.results[1].value;
    expect(harness.Graphics).toHaveBeenCalledTimes(2);
    expect(visibleEdge.bezierCurveTo).toHaveBeenCalledTimes(1);
    expect(visibleEdge).toMatchObject({
      alpha: 1,
      visible: true,
      eventMode: "none",
    });
    expect(hiddenEdge).toMatchObject({
      alpha: 0,
      visible: false,
      eventMode: "none",
    });
  });

  it("resolves parents with a linear number of node-array reads", () => {
    const harness = createPixiTestHarness();
    const manyNodes: Node[] = Array.from({ length: 100 }, (_, index) => ({
      ...root,
      id: index + 1,
      parentId: index === 0 ? null : index,
      x: index * 220,
    }));
    let indexedReads = 0;
    const trackedNodes = new Proxy(manyNodes, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) {
          indexedReads += 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });

    renderMapEdges(
      harness.app.stage as never,
      harness.constructors as never,
      trackedNodes,
    );

    expect(indexedReads).toBeLessThan(manyNodes.length * 4);
  });
});
