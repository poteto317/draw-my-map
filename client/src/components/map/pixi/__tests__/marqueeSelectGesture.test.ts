import {
  buildMarqueeRect,
  collectMarqueeSelectionIds,
  createMarqueeSelectGesture,
  type MarqueeRect,
} from "@/components/map/pixi/marqueeSelectGesture";
import type { PointerSample } from "@/components/map/pixi/pointerGesture";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

const pointer = (
  screenX: number,
  screenY: number,
  worldX = screenX,
  worldY = screenY,
): PointerSample => ({
  pointerId: 1,
  pointerType: "mouse",
  screen: { x: screenX, y: screenY },
  world: { x: worldX, y: worldY },
});

const nodes: Node[] = [
  createTestNode({ id: 1, x: 0, y: 0, width: 100, height: 60, label: "A" }),
  createTestNode({ id: 2, x: 200, y: 0, width: 100, height: 60, label: "B" }),
  createTestNode({ id: 3, x: 400, y: 0, width: 100, height: 60, label: "C" }),
];

describe("buildMarqueeRect / collectMarqueeSelectionIds", () => {
  it("軸平行矩形を正規化し、外接矩形が交差する表示中ノードを配列順で返す", () => {
    const rect = buildMarqueeRect({ x: 250, y: 10 }, { x: 50, y: 50 });
    expect(rect).toEqual({ x: 50, y: 10, width: 200, height: 40 });

    expect(collectMarqueeSelectionIds(nodes, new Set([1, 2, 3]), rect)).toEqual([1, 2]);
  });

  it("visibleNodeIds に無いノードは交差しても含めない", () => {
    const rect = buildMarqueeRect({ x: 0, y: 0 }, { x: 500, y: 60 });
    expect(collectMarqueeSelectionIds(nodes, new Set([2]), rect)).toEqual([2]);
  });

  it("中心は矩形外でも外接矩形が交差すれば含める（中心判定ではない）", () => {
    // ノード1 (0,0)-(100,60) の右端だけ交差。中心(50,30)は矩形外
    const rect: MarqueeRect = { x: 90, y: 0, width: 60, height: 60 };
    expect(collectMarqueeSelectionIds(nodes, undefined, rect)).toEqual([1]);
  });

  it("外接矩形が交差しないノードは中心が近くても含めない", () => {
    const rect: MarqueeRect = { x: 101, y: 0, width: 50, height: 60 };
    expect(collectMarqueeSelectionIds(nodes, undefined, rect)).toEqual([]);
  });
});

describe("createMarqueeSelectGesture", () => {
  function createGesture(mode: "replace" | "add" = "replace") {
    const onMarqueeRectChangeRef = { current: jest.fn() };
    const onSetSelectionFromMarqueeRef = { current: jest.fn() };
    const gesture = createMarqueeSelectGesture({
      startSample: pointer(10, 10),
      nodesRef: { current: nodes },
      visibleNodeIdsRef: { current: new Set([1, 2, 3]) },
      onMarqueeRectChangeRef,
      onSetSelectionFromMarqueeRef,
      mode,
      dragThreshold: 4,
    });
    return { gesture, onMarqueeRectChangeRef, onSetSelectionFromMarqueeRef };
  }

  it("しきい値超でラバーバンドを更新し、確定時に配列順 ids で replace する", () => {
    const { gesture, onMarqueeRectChangeRef, onSetSelectionFromMarqueeRef } = createGesture("replace");

    gesture?.move(pointer(12, 10));
    expect(onMarqueeRectChangeRef.current).not.toHaveBeenCalled();

    gesture?.move(pointer(250, 50));
    expect(gesture?.isActivated?.()).toBe(true);
    expect(onMarqueeRectChangeRef.current).toHaveBeenLastCalledWith({
      x: 10, y: 10, width: 240, height: 40,
    });

    gesture?.end(pointer(250, 50));
    expect(onSetSelectionFromMarqueeRef.current).toHaveBeenCalledWith({
      mode: "replace",
      ids: [1, 2],
    });
    expect(onMarqueeRectChangeRef.current).toHaveBeenLastCalledWith(null);
  });

  it("mode=add の確定は加算で渡す", () => {
    const { gesture, onSetSelectionFromMarqueeRef } = createGesture("add");

    gesture?.move(pointer(250, 50));
    gesture?.end(pointer(250, 50));

    expect(onSetSelectionFromMarqueeRef.current).toHaveBeenCalledWith({
      mode: "add",
      ids: [1, 2],
    });
  });

  it("交差0件の確定は空 ids を渡す（呼び出し側が clear）", () => {
    const onMarqueeRectChangeRef = { current: jest.fn() };
    const onSetSelectionFromMarqueeRef = { current: jest.fn() };
    const gesture = createMarqueeSelectGesture({
      startSample: pointer(150, 200),
      nodesRef: { current: nodes },
      visibleNodeIdsRef: { current: new Set([1, 2, 3]) },
      onMarqueeRectChangeRef,
      onSetSelectionFromMarqueeRef,
      mode: "replace",
      dragThreshold: 4,
    });

    gesture?.move(pointer(180, 260));
    gesture?.end(pointer(180, 260));

    expect(onSetSelectionFromMarqueeRef.current).toHaveBeenCalledWith({
      mode: "replace",
      ids: [],
    });
  });

  it("非表示ノードは確定結果に含めない", () => {
    const onMarqueeRectChangeRef = { current: jest.fn() };
    const onSetSelectionFromMarqueeRef = { current: jest.fn() };
    const gesture = createMarqueeSelectGesture({
      startSample: pointer(0, 0),
      nodesRef: { current: nodes },
      visibleNodeIdsRef: { current: new Set([1, 3]) },
      onMarqueeRectChangeRef,
      onSetSelectionFromMarqueeRef,
      mode: "replace",
      dragThreshold: 4,
    });

    gesture?.move(pointer(500, 60));
    gesture?.end(pointer(500, 60));

    expect(onSetSelectionFromMarqueeRef.current).toHaveBeenCalledWith({
      mode: "replace",
      ids: [1, 3],
    });
  });

  it("activated 後の cancel は選択を変えず矩形だけ消す", () => {
    const { gesture, onMarqueeRectChangeRef, onSetSelectionFromMarqueeRef } = createGesture();

    gesture?.move(pointer(250, 50));
    gesture?.cancel();

    expect(onSetSelectionFromMarqueeRef.current).not.toHaveBeenCalled();
    expect(onMarqueeRectChangeRef.current).toHaveBeenLastCalledWith(null);
  });

  it("未 activated の end では選択も矩形も変えない", () => {
    const { gesture, onMarqueeRectChangeRef, onSetSelectionFromMarqueeRef } = createGesture();

    gesture?.end(pointer(11, 10));

    expect(onSetSelectionFromMarqueeRef.current).not.toHaveBeenCalled();
    expect(onMarqueeRectChangeRef.current).not.toHaveBeenCalled();
  });

  it("onSetSelectionFromMarquee が例外でもラバーバンドを消す", () => {
    const { gesture, onMarqueeRectChangeRef, onSetSelectionFromMarqueeRef } = createGesture();
    onSetSelectionFromMarqueeRef.current.mockImplementation(() => {
      throw new Error("selection failed");
    });

    gesture?.move(pointer(250, 50));
    expect(() => gesture?.end(pointer(250, 50))).toThrow("selection failed");
    expect(onMarqueeRectChangeRef.current).toHaveBeenCalledWith(null);
  });
});
