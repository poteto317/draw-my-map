import { act, fireEvent } from "@testing-library/react";
import { MapStage } from "@/components/map/MapStage";
import {
  mockContainers,
  mockNodePointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

const defaultProps = {
  nodes: [] as Node[],
  selectedNodeId: null as number | null,
  onDoubleClick: jest.fn(),
  onAddChildNode: jest.fn(() => null),
  onAddSiblingNode: jest.fn(() => null),
  onSelectNode: jest.fn(),
  onUpdateLabel: jest.fn(),
  onMoveNode: jest.fn(),
  onBeginNodeMove: () => ({ isActive: () => true, finish: () => {} }),
  onConnectNodes: jest.fn(),
  onDeleteNode: jest.fn(),
};

const sampleNodes: Node[] = [
  createTestNode({ id: 1, x: 50, y: 30, label: "ノード1" }),
  createTestNode({ id: 2, x: 200, y: 100, label: "ノード2" }),
];

beforeEach(() => {
  resetMapStageTestRuntime();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapStage visibility boundary", () => {
  it("visibility transitionでnodeとedgeを開始・80ms・160msに補間する", async () => {
    let now = 0;
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: jest.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        callbacks.set(id, callback);
        return id;
      }),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: jest.fn((id: number) => callbacks.delete(id)),
    });
    jest.spyOn(performance, "now").mockImplementation(() => now);
    const connectedNodes = [sampleNodes[0], { ...sampleNodes[1], parentId: 1 }];
    await renderReady(<MapStage {...defaultProps} nodes={connectedNodes} visibleNodeIds={new Set([1, 2])} />);
    const pixi = jest.requireMock("pixi.js") as { Graphics: jest.Mock };
    const edge = pixi.Graphics.mock.results[0].value as { alpha: number };

    expect(mockContainers[1].alpha).toBe(0);
    expect(edge.alpha).toBe(0);
    now = 80;
    act(() => callbacks.get(1)?.(80));
    expect(mockContainers[1].alpha).toBe(0.875);
    expect(edge.alpha).toBe(0.875);
    now = 160;
    act(() => callbacks.get(2)?.(160));
    expect(mockContainers[1].alpha).toBe(1);
    expect(edge.alpha).toBe(1);
  });

  it("80ms途中のvisible反転は現在opacityを起点にfadeする", async () => {
    let now = 0;
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: jest.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        callbacks.set(id, callback);
        return id;
      }),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: jest.fn((id: number) => callbacks.delete(id)),
    });
    jest.spyOn(performance, "now").mockImplementation(() => now);
    const connectedNodes = [sampleNodes[0], { ...sampleNodes[1], parentId: 1 }];
    const rendered = await renderReady(
      <MapStage {...defaultProps} nodes={connectedNodes} visibleNodeIds={new Set([1, 2])} />,
    );
    now = 80;
    act(() => callbacks.get(1)?.(80));
    expect(mockContainers[1].alpha).toBe(0.875);

    rendered.rerender(
      <MapStage {...defaultProps} nodes={connectedNodes} visibleNodeIds={new Set()} />,
    );

    expect(mockContainers.at(-2)?.alpha).toBe(0.875);
    expect(mockContainers.at(-2)?.eventMode).toBe("none");
    now = 160;
    act(() => callbacks.get(2)?.(160));
    expect(mockContainers.at(-2)?.alpha).toBe(0.109375);
  });

  it("80ms途中のscene rebuildは進行中opacityを引き継ぐ", async () => {
    let now = 0;
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: jest.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        callbacks.set(id, callback);
        return id;
      }),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: jest.fn((id: number) => callbacks.delete(id)),
    });
    jest.spyOn(performance, "now").mockImplementation(() => now);
    const connectedNodes = [sampleNodes[0], { ...sampleNodes[1], parentId: 1 }];
    const rendered = await renderReady(
      <MapStage {...defaultProps} nodes={connectedNodes} visibleNodeIds={new Set([1, 2])} />,
    );
    now = 80;
    act(() => callbacks.get(1)?.(80));

    rendered.rerender(
      <MapStage {...defaultProps} nodes={[...connectedNodes]} visibleNodeIds={new Set([1, 2])} />,
    );

    expect(mockContainers.at(-2)?.alpha).toBe(0.875);
    now = 120;
    act(() => callbacks.get(2)?.(120));
    expect(mockContainers.at(-2)?.alpha).toBe(0.984375);
  });

  it("prefers-reduced-motionではMapStage targetを即時endpointへ適用する", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
    Object.defineProperty(window, "requestAnimationFrame", { configurable: true, value: jest.fn() });
    await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} visibleNodeIds={new Set([1, 2])} />);

    expect(mockContainers[1].alpha).toBe(1);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("hiddenへのrerenderは最初のframe前に選択を同期解除しeventModeをnoneにする", async () => {
    const onSelectNode = jest.fn();
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: jest.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        callbacks.set(id, callback);
        return id;
      }),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: jest.fn((id: number) => callbacks.delete(id)),
    });
    const rendered = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1}
        visibleNodeIds={new Set([1, 2])} onSelectNode={onSelectNode} />,
    );

    rendered.rerender(
      <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1}
        visibleNodeIds={new Set([2])} onSelectNode={onSelectNode} />,
    );

    expect(onSelectNode).toHaveBeenCalledWith(null);
    expect(mockContainers.at(-2)).toMatchObject({ eventMode: "none" });
    expect(callbacks.get(1)).toBeDefined();
  });

  it("編集中ノードがhiddenになるとeditorを破棄する", async () => {
    const onSelectNode = jest.fn();
    const rendered = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1}
        visibleNodeIds={new Set([1, 2])} onSelectNode={onSelectNode} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.doubleClick(container, { clientX: 60, clientY: 40 });
    expect(rendered.getByTestId("node-label-input")).toBeInTheDocument();

    rendered.rerender(
      <MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1}
        visibleNodeIds={new Set([2])} onSelectNode={onSelectNode} />,
    );

    expect(rendered.queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(onSelectNode).toHaveBeenCalledWith(null);
  });

  it("進行中gestureの対象ノードがhiddenになると以後の移動を止める", async () => {
    const onMoveNode = jest.fn();
    const rendered = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} visibleNodeIds={new Set([1, 2])}
        onMoveNode={onMoveNode} />,
    );
    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
      mockStageHandlers.pointermove?.(pointer(120, 80));
    });
    expect(onMoveNode).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <MapStage {...defaultProps} nodes={sampleNodes} visibleNodeIds={new Set([2])}
        onMoveNode={onMoveNode} />,
    );
    act(() => mockStageHandlers.pointermove?.(pointer(140, 100)));

    expect(onMoveNode).toHaveBeenCalledTimes(1);
  });

  it("非表示ノードの位置は編集せず背景への追加として扱う", async () => {
    const onDoubleClick = jest.fn();
    const { queryByTestId } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} visibleNodeIds={new Set([2])}
        onDoubleClick={onDoubleClick} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });

    expect(queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).toHaveBeenCalledWith(100, 60);
  });

  it("viewport scaleは初回だけ通知し、callback差し替えでは再通知しない", async () => {
    const firstCallback = jest.fn();
    const secondCallback = jest.fn();
    const rendered = await renderReady(
      <MapStage {...defaultProps} onViewportScaleChange={firstCallback} />,
    );
    expect(firstCallback).toHaveBeenCalledWith(1);
    expect(firstCallback).toHaveBeenCalledTimes(1);

    rendered.rerender(<MapStage {...defaultProps} onViewportScaleChange={secondCallback} />);

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).not.toHaveBeenCalled();

    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);
    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 100,
        clientY: 100,
        deltaY: -100,
        cancelable: true,
      }));
    });

    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).toHaveBeenCalledWith(Math.exp(0.1));
  });
});
