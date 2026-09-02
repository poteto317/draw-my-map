import { clearMapScene } from "@/components/map/pixi/clearMapScene";
import { createPixiTestHarness } from "../testing/pixiTestHarness";

describe("clearMapScene", () => {
  it("destroys every display object removed from the stage", () => {
    const harness = createPixiTestHarness();
    const removed = [
      { destroy: jest.fn() },
      { destroy: jest.fn() },
    ];
    harness.children.push(...removed);

    clearMapScene(harness.app as never);

    expect(harness.stage.removeChildren).toHaveBeenCalledTimes(1);
    for (const child of removed) {
      expect(child.destroy).toHaveBeenCalledWith({ children: true, context: true });
    }
  });
});
