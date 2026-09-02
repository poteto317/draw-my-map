import { renderMapEdges } from "@/components/map/pixi/renderMapEdges";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import type { Node } from "@/types/node";

const root: Node = {
  id: 1, parentId: null, x: 50, y: 30,
  width: 100, height: 60, label: "親",
};
const child: Node = {
  id: 2, parentId: 1, x: 270, y: 90,
  width: 100, height: 60, label: "子",
};

describe("renderMapEdges", () => {
  it("draws valid relationships as one edge layer", () => {
    const harness = createPixiTestHarness();

    renderMapEdges(harness.app.stage as never, harness.constructors as never, [root, child]);

    const edges = harness.Graphics.mock.results[0].value;
    expect(harness.Graphics).toHaveBeenCalledTimes(1);
    expect(edges.moveTo).toHaveBeenCalledWith(150, 60);
    expect(edges.bezierCurveTo).toHaveBeenCalledWith(210, 60, 210, 120, 270, 120);
    expect(edges.stroke).toHaveBeenCalledWith({ width: 2, color: 0x64748b });
    expect(harness.stage.addChild).toHaveBeenCalledWith(edges);
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
