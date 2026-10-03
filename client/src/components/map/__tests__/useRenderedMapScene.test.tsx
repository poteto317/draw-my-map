import { renderHook } from "@testing-library/react";
import { INITIAL_VIEWPORT, type Viewport } from "@/components/map/mapViewport";
import { applyViewportTransform } from "@/components/map/pixi/applyViewportTransform";
import { renderMapScene, type RenderMapSceneOptions } from "@/components/map/pixi/renderMapScene";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
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

function createOptions(
  nodes = [node],
): Omit<RenderMapSceneOptions, "viewport" | "onNodePointerDown"> & {
  createNodePointerDownHandler: () => RenderMapSceneOptions["onNodePointerDown"];
} {
  return {
    nodes,
    selectedNodeId: null,
    editingNodeId: null,
    connectionTargetNodeId: null,
    createNodePointerDownHandler,
    visibleNodeIds: new Set([1]),
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
        selectedNodeId: options.selectedNodeId,
        editingNodeId: options.editingNodeId,
        connectionTargetNodeId: options.connectionTargetNodeId,
        visibleNodeIds: options.visibleNodeIds,
        onNodePointerDown,
        viewport: INITIAL_VIEWPORT,
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
          options: { ...baseOptions, illustrationTextures },
          viewport: INITIAL_VIEWPORT,
          viewportRef,
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
});
