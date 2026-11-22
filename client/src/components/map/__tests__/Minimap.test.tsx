import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  Minimap,
  MINIMAP_DIMMED_ALPHA,
  MINIMAP_DIMMED_FILL,
  MINIMAP_VISIBLE_FILL,
} from "@/components/map/Minimap";
import {
  computeNodesWorldBounds,
  createMinimapTransform,
  MINIMAP_DEFAULT_HEIGHT,
  MINIMAP_DEFAULT_WIDTH,
  MINIMAP_MAX_DRAW_NODES,
  MINIMAP_PADDING,
  worldRectToMinimapRect,
  worldToMinimap,
} from "@/domain/nodes/minimapGeometry";
import { getViewportWorldRect } from "@/components/map/mapViewport";
import { createTestNode } from "@/testing/createTestNode";
import { INITIAL_VIEWPORT } from "@/types/viewport";

const screenSize = { width: 400, height: 300 };

type FillRectCall = {
  fillStyle: string;
  globalAlpha: number;
  args: unknown[];
};

function mockCanvasContext() {
  const fillRectCalls: FillRectCall[] = [];
  let fillStyle = "";
  let globalAlpha = 1;
  const clearRect = jest.fn();
  const strokeRect = jest.fn();
  const fillRect = jest.fn((...args: unknown[]) => {
    fillRectCalls.push({ fillStyle, globalAlpha, args });
  });
  // getContext は引数ごとのオーバーロードがあり、spyOn の型は最後のもの（webgpu）になる
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect,
    strokeRect,
    clearRect,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(value: number) {
      globalAlpha = value;
    },
    strokeStyle: "",
    lineWidth: 1,
  } as never);
  return { fillRect, strokeRect, clearRect, fillRectCalls };
}

function renderMinimap(overrides: Partial<Parameters<typeof Minimap>[0]> = {}) {
  const nodes = overrides.nodes ?? [
    createTestNode({ id: 1, x: 0, y: 0, width: 40, height: 30, label: "可視" }),
    createTestNode({ id: 2, x: 200, y: 100, width: 40, height: 30, label: "不可視" }),
  ];
  const visibleNodeIds = overrides.visibleNodeIds ?? new Set([1]);
  const onPanToWorldPoint = overrides.onPanToWorldPoint ?? jest.fn();
  const viewport = overrides.viewport ?? INITIAL_VIEWPORT;
  const resolvedScreen = overrides.screenSize ?? screenSize;
  render(
    <Minimap
      nodes={nodes}
      visibleNodeIds={visibleNodeIds}
      viewport={viewport}
      screenSize={resolvedScreen}
      onPanToWorldPoint={onPanToWorldPoint}
    />,
  );
  return {
    group: screen.getByRole("group", { name: "ミニマップ" }),
    onPanToWorldPoint,
    nodes,
    viewport,
    screenSize: resolvedScreen,
  };
}

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe("Minimap", () => {
  it("左下に固定サイズのミニマップを置く", () => {
    mockCanvasContext();
    const { group } = renderMinimap();
    expect(group).toHaveClass("absolute", "bottom-3", "left-3");
    const canvas = group.querySelector("canvas");
    expect(canvas).toHaveAttribute("width", String(MINIMAP_DEFAULT_WIDTH));
    expect(canvas).toHaveAttribute("height", String(MINIMAP_DEFAULT_HEIGHT));
  });

  it("ノード 0 件なら空状態を示しビューポート矩形を出さない", () => {
    mockCanvasContext();
    renderMinimap({ nodes: [] });
    expect(screen.getByRole("status", { name: "ミニマップ空" })).toHaveTextContent("ノードがありません");
    expect(screen.queryByTestId("minimap-viewport-rect")).not.toBeInTheDocument();
  });

  it("ビューポート矩形が viewport 変更に追従する", () => {
    mockCanvasContext();
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0, width: 200, height: 200 }),
    ];
    const { rerender } = render(
      <Minimap
        nodes={nodes}
        visibleNodeIds={new Set([1])}
        viewport={INITIAL_VIEWPORT}
        screenSize={screenSize}
        onPanToWorldPoint={jest.fn()}
      />,
    );
    const bounds = computeNodesWorldBounds(nodes)!;
    const transform = createMinimapTransform(
      bounds,
      { width: MINIMAP_DEFAULT_WIDTH, height: MINIMAP_DEFAULT_HEIGHT },
      MINIMAP_PADDING,
    );
    const expected1 = worldRectToMinimapRect(
      getViewportWorldRect(INITIAL_VIEWPORT, screenSize),
      transform,
    );
    const rect1 = screen.getByTestId("minimap-viewport-rect");
    expect(rect1).toHaveStyle({
      left: `${expected1.x}px`,
      top: `${expected1.y}px`,
      width: `${expected1.width}px`,
      height: `${expected1.height}px`,
    });

    const zoomed = { offsetX: -100, offsetY: -50, scale: 2 };
    rerender(
      <Minimap
        nodes={nodes}
        visibleNodeIds={new Set([1])}
        viewport={zoomed}
        screenSize={screenSize}
        onPanToWorldPoint={jest.fn()}
      />,
    );
    const expected2 = worldRectToMinimapRect(
      getViewportWorldRect(zoomed, screenSize),
      transform,
    );
    const rect2 = screen.getByTestId("minimap-viewport-rect");
    expect(rect2).toHaveStyle({
      left: `${expected2.x}px`,
      top: `${expected2.y}px`,
      width: `${expected2.width}px`,
      height: `${expected2.height}px`,
    });
  });

  it("クリックでワールド座標へのパンを要求する", () => {
    mockCanvasContext();
    const onPanToWorldPoint = jest.fn();
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0, width: 200, height: 200 }),
    ];
    renderMinimap({ nodes, visibleNodeIds: new Set([1]), onPanToWorldPoint });
    const canvas = screen.getByRole("group", { name: "ミニマップ" }).querySelector("canvas")!;
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: MINIMAP_DEFAULT_WIDTH,
      bottom: MINIMAP_DEFAULT_HEIGHT,
      width: MINIMAP_DEFAULT_WIDTH,
      height: MINIMAP_DEFAULT_HEIGHT,
      toJSON: () => ({}),
    });

    const bounds = computeNodesWorldBounds(nodes)!;
    const transform = createMinimapTransform(
      bounds,
      { width: MINIMAP_DEFAULT_WIDTH, height: MINIMAP_DEFAULT_HEIGHT },
      MINIMAP_PADDING,
    );
    const targetWorld = { x: 100, y: 80 };
    const mini = worldToMinimap(targetWorld, transform);

    fireEvent.mouseDown(canvas, { clientX: mini.x, clientY: mini.y, button: 0 });
    expect(onPanToWorldPoint).toHaveBeenCalledTimes(1);
    expect(onPanToWorldPoint.mock.calls[0]![0].x).toBeCloseTo(targetWorld.x);
    expect(onPanToWorldPoint.mock.calls[0]![0].y).toBeCloseTo(targetWorld.y);
  });

  it("ドラッグ中もパンを要求する", () => {
    mockCanvasContext();
    const onPanToWorldPoint = jest.fn();
    const nodes = [
      createTestNode({ id: 1, x: 0, y: 0, width: 200, height: 200 }),
    ];
    renderMinimap({ nodes, visibleNodeIds: new Set([1]), onPanToWorldPoint });
    const canvas = screen.getByRole("group", { name: "ミニマップ" }).querySelector("canvas")!;
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: MINIMAP_DEFAULT_WIDTH,
      bottom: MINIMAP_DEFAULT_HEIGHT,
      width: MINIMAP_DEFAULT_WIDTH,
      height: MINIMAP_DEFAULT_HEIGHT,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(canvas, { clientX: 40, clientY: 40, button: 0 });
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 60, buttons: 1 });
    fireEvent.mouseUp(canvas, { clientX: 80, clientY: 60 });

    expect(onPanToWorldPoint.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("不可視ノードを薄色・可視を通常色で描く", () => {
    const { fillRectCalls } = mockCanvasContext();
    renderMinimap();
    // 背景 1 + ノード 2
    expect(fillRectCalls.length).toBeGreaterThanOrEqual(3);
    const nodeDraws = fillRectCalls.slice(1);
    const visibleDraws = nodeDraws.filter(
      (call) => call.fillStyle === MINIMAP_VISIBLE_FILL && call.globalAlpha === 1,
    );
    const dimmedDraws = nodeDraws.filter(
      (call) => (
        call.fillStyle === MINIMAP_DIMMED_FILL && call.globalAlpha === MINIMAP_DIMMED_ALPHA
      ),
    );
    expect(visibleDraws).toHaveLength(1);
    expect(dimmedDraws).toHaveLength(1);
  });

  it("点数上限を超えるノードは間引いて描く", () => {
    const { fillRectCalls } = mockCanvasContext();
    const nodes = Array.from({ length: MINIMAP_MAX_DRAW_NODES + 50 }, (_, i) => (
      createTestNode({ id: i + 1, x: i * 10, y: 0, width: 8, height: 8 })
    ));
    renderMinimap({
      nodes,
      visibleNodeIds: new Set(nodes.map((n) => n.id)),
    });
    // 先頭は背景 fillRect、以降がノード描画
    const drawnNodes = fillRectCalls.length - 1;
    expect(drawnNodes).toBeLessThanOrEqual(MINIMAP_MAX_DRAW_NODES);
    expect(drawnNodes).toBeLessThan(nodes.length);
  });
});
