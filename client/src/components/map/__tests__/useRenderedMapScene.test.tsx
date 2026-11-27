const inactiveLearnDisplay = { learningActive: false, revealedNodeIds: new Set<number>() };
import { renderHook } from "@testing-library/react";
import { INITIAL_VIEWPORT, type Viewport } from "@/components/map/mapViewport";
import { applyViewportTransform } from "@/components/map/pixi/applyViewportTransform";
import { renderMapScene, type RenderMapSceneOptions } from "@/components/map/pixi/renderMapScene";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import type { SiblingReorderIndicator } from "@/components/map/siblingReorderDropSlot";
import { useRenderedMapScene } from "@/components/map/useRenderedMapScene";
import { createTestNode } from "@/testing/createTestNode";
import type { Texture } from "pixi.js";

jest.mock("@/components/map/pixi/applyViewportTransform", () => ({
  applyViewportTransform: jest.fn(),
}));
jest.mock("@/components/map/pixi/renderMapScene", () => ({
  renderMapScene: jest.fn(),
}));

const mockedApplyViewportTransform = jest.mocked(applyViewportTransform);
const mockedRenderMapScene = jest.mocked(renderMapScene);
const runtime = {
  app: { stage: {} },
  constructors: {},
} as unknown as PixiRuntime;
const node = createTestNode({ id: 1 });
const onNodePointerDown = jest.fn();
const createNodePointerDownHandler = jest.fn(() => onNodePointerDown);
const screenSize = { width: 800, height: 600 };

function createOptions(
  nodes = [node],
): Omit<RenderMapSceneOptions, "viewport" | "onNodePointerDown"> & {
  createNodePointerDownHandler: () => RenderMapSceneOptions["onNodePointerDown"];
} {
  return {
    learnDisplay: inactiveLearnDisplay,
    nodes,
    selectedNodeIds: [],
    editingNodeId: null,
    connectionTargetNodeId: null,
    siblingReorderSourceNodeId: null,
    siblingReorderIndicator: null,
    createNodePointerDownHandler,
    visibleNodeIds: new Set(nodes.map((n) => n.id)),
    highlightNodeIds: new Set<number>(),
    pinnedNodeIds: new Set<number>(),
    taskProgress: new Map<number, { percent: number; remaining: number }>(),
    commentNodeCounts: new Map<number, number>(),
  };
}

describe("useRenderedMapScene", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let sceneId = 0;
    mockedRenderMapScene.mockImplementation(() => ({
      worldContainer: { sceneId: ++sceneId },
      visibilityTargets: new Map(),
    }) as never);
  });

  it("runtime到着時に最新viewportでsceneを生成する", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const options = createOptions();
    const { result, rerender } = renderHook(
      ({ currentRuntime }) => useRenderedMapScene({
        runtime: currentRuntime,
        options,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize,
      }),
      { initialProps: { currentRuntime: null as PixiRuntime | null } },
    );
    expect(result.current).toBeNull();

    rerender({ currentRuntime: runtime });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(1);
    expect(mockedRenderMapScene).toHaveBeenCalledWith(
      runtime.app,
      runtime.constructors,
      {
        nodes: options.nodes,
        selectedNodeIds: options.selectedNodeIds,
        editingNodeId: options.editingNodeId,
        connectionTargetNodeId: options.connectionTargetNodeId,
        marqueeRect: null,
        siblingReorderSourceNodeId: options.siblingReorderSourceNodeId,
        siblingReorderIndicator: options.siblingReorderIndicator,
        visibleNodeIds: options.visibleNodeIds,
        highlightNodeIds: options.highlightNodeIds,
        pinnedNodeIds: options.pinnedNodeIds ?? new Set<number>(),
        taskProgress: options.taskProgress,
        commentNodeCounts: options.commentNodeCounts,
        illustrationTextures: undefined,
        relations: undefined,
        selectedRelationId: null,
        onRelationPointerDown: undefined,
        groups: undefined,
        selectedGroupId: null,
        onGroupPointerDown: undefined,
        onNodePointerDown,
        viewport: INITIAL_VIEWPORT,
        learnDisplay: inactiveLearnDisplay,
      },
    );
    expect(result.current).toBe(mockedRenderMapScene.mock.results[0].value);
  });

  it("render input変更でsceneを差し替える", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const initialOptions = createOptions();
    const nextOptions = createOptions([node, createTestNode({ id: 2 })]);
    const { result, rerender } = renderHook(
      ({ options }) => useRenderedMapScene({
        runtime,
        options,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize,
      }),
      { initialProps: { options: initialOptions } },
    );
    const firstScene = result.current;

    rerender({ options: nextOptions });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(2);
    expect(result.current).not.toBe(firstScene);
    expect(result.current).toBe(mockedRenderMapScene.mock.results[1].value);
  });

  it("viewportだけの変更ではsceneを再生成せずtransformだけを適用する", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const options = createOptions();
    const { result, rerender } = renderHook(
      ({ viewport }: { viewport: Viewport }) => useRenderedMapScene({
        runtime,
        options,
        viewport,
        viewportRef,
        screenSize,
      }),
      { initialProps: { viewport: INITIAL_VIEWPORT } },
    );
    const scene = result.current;
    const nextViewport = { offsetX: 20, offsetY: 10, scale: 2 };
    viewportRef.current = nextViewport;

    rerender({ viewport: nextViewport });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(scene);
    expect(mockedApplyViewportTransform).toHaveBeenCalledTimes(1);
    expect(mockedApplyViewportTransform).toHaveBeenCalledWith(scene?.worldContainer, nextViewport);
  });

  it("画面外ノードを描画リストから外し、パンで集合が変わるとsceneを再生成する", () => {
    const near = createTestNode({ id: 1, x: 0, y: 0, width: 40, height: 40 });
    const far = createTestNode({ id: 2, x: 5000, y: 0, width: 40, height: 40 });
    const options = createOptions([near, far]);
    const compactScreen = { width: 200, height: 200 };
    const viewportRef = { current: INITIAL_VIEWPORT };
    const { rerender } = renderHook(
      ({ viewport }: { viewport: Viewport }) => useRenderedMapScene({
        runtime,
        options,
        viewport,
        viewportRef,
        screenSize: compactScreen,
      }),
      { initialProps: { viewport: INITIAL_VIEWPORT } },
    );

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(1);
    expect(mockedRenderMapScene.mock.calls[0][2].nodes.map((n: { id: number }) => n.id)).toEqual([1]);

    // offsetX = -4900 → 画面 [4900, 5100] がワールドに見える（far が入る）
    const nextViewport = { offsetX: -4900, offsetY: 0, scale: 1 };
    viewportRef.current = nextViewport;
    rerender({ viewport: nextViewport });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(2);
    expect(mockedRenderMapScene.mock.calls[1][2].nodes.map((n: { id: number }) => n.id)).toEqual([2]);
  });

  it("screenSize が null のときはカリングせず全ノードを渡す", () => {
    const near = createTestNode({ id: 1, x: 0, y: 0, width: 40, height: 40 });
    const far = createTestNode({ id: 2, x: 5000, y: 0, width: 40, height: 40 });
    const options = createOptions([near, far]);
    const viewportRef = { current: INITIAL_VIEWPORT };

    renderHook(() => useRenderedMapScene({
      runtime,
      options,
      viewport: INITIAL_VIEWPORT,
      viewportRef,
      screenSize: null,
    }));

    expect(mockedRenderMapScene.mock.calls[0][2].nodes.map((n: { id: number }) => n.id)).toEqual([1, 2]);
  });

  it("commentNodeCounts の変更でsceneを差し替え、新しい件数を渡す", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const initialOptions = createOptions();
    const nextCounts = new Map([[1, 2]]);
    const nextOptions = { ...initialOptions, commentNodeCounts: nextCounts };
    const { result, rerender } = renderHook(
      ({ options }) => useRenderedMapScene({
        runtime,
        options,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize,
      }),
      { initialProps: { options: initialOptions } },
    );

    rerender({ options: nextOptions });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(2);
    expect(mockedRenderMapScene.mock.calls[1][2].commentNodeCounts).toBe(nextCounts);
    expect(result.current).toBe(mockedRenderMapScene.mock.results[1].value);
  });

  it("古いeffect cleanupが新しいsceneを解除しない", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const initialOptions = createOptions();
    const nextOptions = createOptions([node, createTestNode({ id: 2 })]);
    const { result, rerender } = renderHook(
      ({ options }) => useRenderedMapScene({
        runtime,
        options,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize,
      }),
      { initialProps: { options: initialOptions } },
    );

    rerender({ options: nextOptions });

    expect(result.current).toBe(mockedRenderMapScene.mock.results[1].value);
  });

  it("runtimeが失われると現在のsceneだけを解除する", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const options = createOptions();
    const { result, rerender } = renderHook(
      ({ currentRuntime }) => useRenderedMapScene({
        runtime: currentRuntime,
        options,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize,
      }),
      { initialProps: { currentRuntime: runtime as PixiRuntime | null } },
    );
    expect(result.current).not.toBeNull();

    rerender({ currentRuntime: null });

    expect(result.current).toBeNull();
  });

  it("イラストのテクスチャが変わると、テクスチャを渡してsceneを再生成する", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const baseOptions = createOptions();
    const textures = new Map([["data:image/jpeg;base64,AAAA", {} as Texture]]);
    const { rerender } = renderHook(
      ({ illustrationTextures }: { illustrationTextures: ReadonlyMap<string, Texture> }) =>
        useRenderedMapScene({
          runtime,
          options: {
      ...baseOptions, illustrationTextures },
          viewport: INITIAL_VIEWPORT,
          viewportRef,
          screenSize,
        }),
      { initialProps: { illustrationTextures: new Map() as ReadonlyMap<string, Texture> } },
    );

    rerender({ illustrationTextures: textures });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(2);
    expect(mockedRenderMapScene).toHaveBeenLastCalledWith(
      runtime.app,
      runtime.constructors,
      expect.objectContaining({ illustrationTextures: textures }),
    );
  });

  it("挿入位置の線が変わるとsceneを再生成し、同じ値のままなら再生成しない", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const baseOptions = createOptions();
    const indicator = { left: 10, right: 110, y: 200 };
    const { rerender } = renderHook(
      ({ siblingReorderIndicator }: { siblingReorderIndicator: SiblingReorderIndicator | null }) =>
        useRenderedMapScene({
          runtime,
          options: {
      ...baseOptions, siblingReorderSourceNodeId: 1, siblingReorderIndicator },
          viewport: INITIAL_VIEWPORT,
          viewportRef,
          screenSize,
        }),
      { initialProps: { siblingReorderIndicator: null as SiblingReorderIndicator | null } },
    );

    rerender({ siblingReorderIndicator: indicator });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(2);
    expect(mockedRenderMapScene).toHaveBeenLastCalledWith(
      runtime.app,
      runtime.constructors,
      expect.objectContaining({ siblingReorderSourceNodeId: 1, siblingReorderIndicator: indicator }),
    );

    rerender({ siblingReorderIndicator: indicator });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(2);
  });

  it("taskProgress が変わると scene を再生成する", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const options = createOptions();
    const empty = new Map<number, { percent: number; remaining: number }>();
    const withProgress = new Map([[1, { percent: 33, remaining: 2 }]]);
    const { rerender } = renderHook(
      ({ taskProgress }: { taskProgress: ReadonlyMap<number, { percent: number; remaining: number }> }) =>
        useRenderedMapScene({
          runtime,
          options: {
      ...options, taskProgress },
          viewport: INITIAL_VIEWPORT,
          viewportRef,
          screenSize,
        }),
      { initialProps: { taskProgress: empty } },
    );

    rerender({ taskProgress: withProgress });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(2);
    expect(mockedRenderMapScene).toHaveBeenLastCalledWith(
      runtime.app,
      runtime.constructors,
      expect.objectContaining({ taskProgress: withProgress }),
    );
  });

  it("ドラッグ中のノードが変わるとsceneを再生成する", () => {
    const viewportRef = { current: INITIAL_VIEWPORT };
    const baseOptions = createOptions();
    const { rerender } = renderHook(
      ({ siblingReorderSourceNodeId }: { siblingReorderSourceNodeId: number | null }) =>
        useRenderedMapScene({
          runtime,
          options: {
      ...baseOptions, siblingReorderSourceNodeId },
          viewport: INITIAL_VIEWPORT,
          viewportRef,
          screenSize,
        }),
      { initialProps: { siblingReorderSourceNodeId: null as number | null } },
    );

    rerender({ siblingReorderSourceNodeId: 1 });

    expect(mockedRenderMapScene).toHaveBeenCalledTimes(2);
    expect(mockedRenderMapScene).toHaveBeenLastCalledWith(
      runtime.app,
      runtime.constructors,
      expect.objectContaining({ siblingReorderSourceNodeId: 1 }),
    );
  });
});
