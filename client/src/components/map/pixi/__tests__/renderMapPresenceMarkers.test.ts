import {
  PRESENCE_MARKER_RADIUS_CONST,
  PRESENCE_MARKER_RADIUS_MIN,
  renderMapPresenceMarkers,
} from "@/components/map/pixi/renderMapPresenceMarkers";
import { createPixiTestHarness } from "../testing/pixiTestHarness";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function presenceRadius(scale: number): number {
  return Math.max(PRESENCE_MARKER_RADIUS_MIN, PRESENCE_MARKER_RADIUS_CONST / scale);
}

describe("renderMapPresenceMarkers", () => {
  it("presence ノード数ぶん Graphics 円を描き、全て eventMode none・ラベル無し", () => {
    const harness = createPixiTestHarness();
    const nodes: Node[] = [
      createTestNode({ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60 }),
      createTestNode({ id: 2, parentId: 1, x: 200, y: 0, width: 100, height: 60 }),
      createTestNode({ id: 3, parentId: 1, x: 400, y: 0, width: 100, height: 60 }),
    ];

    const { edges, markers } = renderMapPresenceMarkers(harness.constructors as never, {
      nodes,
      presenceNodeIds: new Set([2, 3]),
      presenceEdgeChildIds: [],
      scale: 1,
    });

    expect(edges.eventMode).toBe("none");
    expect(markers.eventMode).toBe("none");
    expect(harness.Text).not.toHaveBeenCalled();
    expect(harness.Graphics).toHaveBeenCalledTimes(2);
    expect(edges.addChild).not.toHaveBeenCalled();
    expect(markers.addChild).toHaveBeenCalledTimes(2);

    const graphics = harness.Graphics.mock.results.map((r) => r.value);
    for (const g of graphics) {
      expect(g.eventMode).toBe("none");
      expect(g.circle).toHaveBeenCalled();
    }
    expect(graphics[0].circle).toHaveBeenCalledWith(
      200 + 50,
      0 + 30,
      presenceRadius(1),
    );
    expect(graphics[1].circle).toHaveBeenCalledWith(
      400 + 50,
      0 + 30,
      presenceRadius(1),
    );
  });

  it("presenceEdgeChildIds の本数ぶん細い線を描き eventMode none", () => {
    const harness = createPixiTestHarness();
    const parent = createTestNode({ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60 });
    const child = createTestNode({ id: 2, parentId: 1, x: 200, y: 40, width: 100, height: 60 });

    const { edges, markers } = renderMapPresenceMarkers(harness.constructors as never, {
      nodes: [parent, child],
      presenceNodeIds: new Set([2]),
      presenceEdgeChildIds: [2],
      scale: 1,
    });

    // edge 先・marker 後（線が点を覆わない）
    expect(harness.Graphics).toHaveBeenCalledTimes(2);
    const edge = harness.Graphics.mock.results[0].value;
    const marker = harness.Graphics.mock.results[1].value;
    expect(edge.eventMode).toBe("none");
    expect(edge.moveTo).toHaveBeenCalled();
    expect(edge.lineTo).toHaveBeenCalled();
    expect(edge.stroke).toHaveBeenCalled();
    expect(marker.circle).toHaveBeenCalled();
    expect(edges.addChild).toHaveBeenCalledWith(edge);
    expect(markers.addChild).toHaveBeenCalledWith(marker);
  });

  it("小さい scale でも円半径が下限未満に潰れない", () => {
    const harness = createPixiTestHarness();
    const node = createTestNode({ id: 10, parentId: null, x: 10, y: 20, width: 80, height: 40 });
    const smallScale = 0.05;

    renderMapPresenceMarkers(harness.constructors as never, {
      nodes: [node],
      presenceNodeIds: new Set([10]),
      presenceEdgeChildIds: [],
      scale: smallScale,
    });

    const radius = harness.Graphics.mock.results[0].value.circle.mock.calls[0][2] as number;
    expect(radius).toBe(presenceRadius(smallScale));
    expect(radius).toBeGreaterThanOrEqual(PRESENCE_MARKER_RADIUS_MIN);
    // CONST/scale が効いてスクリーン上サイズを維持（下限より大きい）
    expect(radius).toBe(PRESENCE_MARKER_RADIUS_CONST / smallScale);
  });

  it("折りたたみ投影後の display 座標を使い、生座標と食い違う位置に描く", () => {
    const harness = createPixiTestHarness();
    // 生座標相当（使われてはいけない）
    const raw = createTestNode({ id: 5, parentId: null, x: 0, y: 0, width: 100, height: 60 });
    // display 座標（投影後）
    const display = createTestNode({ id: 5, parentId: null, x: 300, y: 150, width: 100, height: 60 });

    renderMapPresenceMarkers(harness.constructors as never, {
      nodes: [display],
      presenceNodeIds: new Set([5]),
      presenceEdgeChildIds: [],
      scale: 1,
    });

    const [cx, cy] = harness.Graphics.mock.results[0].value.circle.mock.calls[0] as [
      number,
      number,
      number,
    ];
    expect(cx).toBe(display.x + display.width / 2);
    expect(cy).toBe(display.y + display.height / 2);
    expect(cx).not.toBe(raw.x + raw.width / 2);
    expect(cy).not.toBe(raw.y + raw.height / 2);
  });

  it("nodes に無い presence id や親欠落の edge は描かない", () => {
    const harness = createPixiTestHarness();
    const orphan = createTestNode({ id: 2, parentId: 99, x: 50, y: 50, width: 100, height: 60 });

    renderMapPresenceMarkers(harness.constructors as never, {
      nodes: [orphan],
      presenceNodeIds: new Set([2, 999]),
      presenceEdgeChildIds: [2, 888],
      scale: 1,
    });

    // id 2 の円のみ。999 欠落、edge は親 99 欠落・888 欠落
    expect(harness.Graphics).toHaveBeenCalledTimes(1);
    expect(harness.Graphics.mock.results[0].value.circle).toHaveBeenCalled();
  });
});
