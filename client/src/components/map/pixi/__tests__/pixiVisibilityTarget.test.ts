import {
  createEdgeVisibilityTarget,
  createNodeVisibilityTarget,
} from "@/components/map/pixi/pixiVisibilityTarget";
import type { Container, Graphics } from "pixi.js";

describe("pixiVisibilityTarget", () => {
  it("node targetでopacity、描画、interaction、cursorを更新する", () => {
    const container = {
      alpha: 1,
      visible: true,
      eventMode: "static",
      cursor: "pointer",
    } as unknown as Container;
    const target = createNodeVisibilityTarget("node:1", container);

    target.setOpacity(0.5);
    target.setRendered(false);
    target.setInteractive(false);

    expect(target.key).toBe("node:1");
    expect(container).toMatchObject({
      alpha: 0.5,
      visible: false,
      eventMode: "none",
      cursor: "default",
    });

    target.setInteractive(true);

    expect(container).toMatchObject({ eventMode: "static", cursor: "pointer" });
  });

  it("edge targetでopacityと描画を更新し、interaction要求時も非interactiveを維持する", () => {
    const edge = {
      alpha: 1,
      visible: true,
      eventMode: "none",
    } as unknown as Graphics;
    const target = createEdgeVisibilityTarget("edge:2", edge);

    target.setOpacity(0.25);
    target.setRendered(false);
    target.setInteractive(true);

    expect(target.key).toBe("edge:2");
    expect(edge).toMatchObject({ alpha: 0.25, visible: false, eventMode: "none" });

    target.setInteractive(false);

    expect(edge.eventMode).toBe("none");
  });
});
