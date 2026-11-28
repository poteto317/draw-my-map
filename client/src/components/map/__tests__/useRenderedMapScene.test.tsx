const inactiveLearnDisplay = { learningActive: false, revealedNodeIds: new Set<number>() };
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook } from "@testing-library/react";
import { INITIAL_VIEWPORT, type Viewport } from "@/components/map/mapViewport";
import { applyViewportTransform } from "@/components/map/pixi/applyViewportTransform";
import { collectVisibleMapKeys } from "@/components/map/pixi/mapVisibilityKeys";
import { renderMapScene, type RenderMapSceneOptions } from "@/components/map/pixi/renderMapScene";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import type { SiblingReorderIndicator } from "@/components/map/siblingReorderDropSlot";
import { setViewportCullingEnabled } from "@/components/map/viewportCullingPolicy";
import { useRenderedMapScene } from "@/components/map/useRenderedMapScene";
import { createTestNode } from "@/testing/createTestNode";
import type { ResolutionFilterMode } from "@/types/nodeResolution";
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

type SceneHookOptions = Omit<
  RenderMapSceneOptions,
  "viewport" | "onNodePointerDown" | "presenceNodeIds" | "presenceEdgeChildIds" | "presenceNodes"
> & {
  createNodePointerDownHandler: () => RenderMapSceneOptions["onNodePointerDown"];
};

type PresenceHookInputs = {
  presenceVisibility?: {
    resolutionMode?: ResolutionFilterMode | null;
    collapseVisibleNodeIds?: ReadonlySet<number> | null;
    focusVisibleNodeIds?: ReadonlySet<number> | null;
    depthVisibleNodeIds?: ReadonlySet<number> | null;
  } | null;
};

function createOptions(nodes = [node]): SceneHookOptions {
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

/** auto ズームアウト相当: structural に medium、display は祖先のみ */
function createPresenceAutoOptions() {
  const root = createTestNode({ id: 1, parentId: null, x: 0, y: 0, width: 40, height: 40 });
  const medium = createTestNode({ id: 2, parentId: 1, x: 80, y: 0, width: 40, height: 40 });
  const far = createTestNode({ id: 3, parentId: 1, x: 5000, y: 0, width: 40, height: 40 });
  const nodes = [root, medium, far];
  const allIds = new Set([1, 2, 3]);
  const presence: PresenceHookInputs = {
    presenceVisibility: {
      resolutionMode: "auto",
      collapseVisibleNodeIds: allIds,
      focusVisibleNodeIds: null,
      depthVisibleNodeIds: allIds,
    },
  };
  return {
    nodes,
    options: {
      ...createOptions(nodes),
      visibleNodeIds: new Set([1]), // display = 祖先のみ
    },
    presence,
  };
}

const compactScreen = { width: 200, height: 200 };

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

  describe("presence 配線", () => {
    afterEach(() => {
      setViewportCullingEnabled(true);
    });

    it("入力非完備時は presence オプションを渡さない（空 Set で成功ゼロに見せない）し、DEV で warn する", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const viewportRef = { current: INITIAL_VIEWPORT };
        const options = createOptions(); // presenceVisibility なし → 非完備
        renderHook(() => useRenderedMapScene({
          runtime,
          options,
          viewport: INITIAL_VIEWPORT,
          viewportRef,
          screenSize,
        }));

        const passed = mockedRenderMapScene.mock.calls[0][2];
        expect(passed).not.toHaveProperty("presenceNodeIds");
        expect(passed).not.toHaveProperty("presenceEdgeChildIds");
        expect(passed).not.toHaveProperty("presenceNodes");
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(/presence.*incomplete|L-002/i),
        );
      } finally {
        warn.mockRestore();
      }
    });

    it("auto で structural−display が非空なら presence を渡し、visibleKeys 系には混入しない", () => {
      const viewportRef = { current: INITIAL_VIEWPORT };
      const { nodes, options, presence } = createPresenceAutoOptions();
      renderHook(() => useRenderedMapScene({
        runtime,
        options,
        ...presence,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize: compactScreen,
      }));

      const passed = mockedRenderMapScene.mock.calls[0][2];
      // ノード 3 は画面外で cull。枝 3 は親が画面内のため線分×AABB で残る
      expect(passed.presenceNodeIds).toEqual(new Set([2]));
      expect(passed.presenceEdgeChildIds).toEqual([2, 3]);
      expect(passed.presenceNodes).toBe(nodes);
      expect(passed.visibleNodeIds).toEqual(new Set([1]));
      // フル描画 nodes に presence 枝端点（画面外 3）をマージしない
      expect(passed.nodes.map((n: { id: number }) => n.id)).not.toContain(3);

      const visibleKeys = collectVisibleMapKeys(nodes, passed.visibleNodeIds!);
      expect(visibleKeys.has("node:2")).toBe(false);
      expect(visibleKeys.has("edge:2")).toBe(false);
      expect([...visibleKeys]).toEqual(["node:1"]);
    });

    it("手動モードでは presence が空（成功のゼロ）", () => {
      const viewportRef = { current: INITIAL_VIEWPORT };
      const { options, presence } = createPresenceAutoOptions();
      renderHook(() => useRenderedMapScene({
        runtime,
        options,
        presenceVisibility: {
          ...presence.presenceVisibility!,
          resolutionMode: "high",
        },
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize,
      }));

      const passed = mockedRenderMapScene.mock.calls[0][2];
      expect(passed.presenceNodeIds).toEqual(new Set());
      expect(passed.presenceEdgeChildIds).toEqual([]);
      expect(passed.presenceNodes).toBe(options.nodes);
    });

    it("viewport 外の presence ノードを cull する（enabled 時）", () => {
      const viewportRef = { current: INITIAL_VIEWPORT };
      const { options, presence } = createPresenceAutoOptions();
      renderHook(() => useRenderedMapScene({
        runtime,
        options,
        ...presence,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize: compactScreen,
      }));

      const passed = mockedRenderMapScene.mock.calls[0][2];
      expect(passed.presenceNodeIds).toEqual(new Set([2]));
      expect(passed.presenceNodeIds!.has(3)).toBe(false);
    });

    it("enabled 時、枝は一端のみ画面内でも残り完全外は落ちる", () => {
      const viewportRef = { current: INITIAL_VIEWPORT };
      const root = createTestNode({ id: 1, parentId: null, x: 50, y: 50, width: 40, height: 40 });
      const nearChild = createTestNode({ id: 2, parentId: 1, x: 100, y: 50, width: 40, height: 40 });
      const farChild = createTestNode({ id: 3, parentId: 1, x: 5000, y: 50, width: 40, height: 40 });
      // 親子とも画面外
      const farRoot = createTestNode({ id: 10, parentId: null, x: 5000, y: 5000, width: 40, height: 40 });
      const farOnly = createTestNode({ id: 11, parentId: 10, x: 5100, y: 5000, width: 40, height: 40 });
      const nodes = [root, nearChild, farChild, farRoot, farOnly];
      const structural = new Set([1, 2, 3, 10, 11]);
      // options / presence は render 外で固定（effect deps の identity churn 回避）
      const options: SceneHookOptions = {
        ...createOptions(nodes),
        visibleNodeIds: new Set([1]),
      };
      const presence: PresenceHookInputs = {
        presenceVisibility: {
          resolutionMode: "auto",
          collapseVisibleNodeIds: structural,
          focusVisibleNodeIds: null,
          depthVisibleNodeIds: structural,
        },
      };

      renderHook(() => useRenderedMapScene({
        runtime,
        options,
        ...presence,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize: compactScreen,
      }));

      const passed = mockedRenderMapScene.mock.calls[0][2];
      // 2: 両端内、3: 親内・子外 → 残る、11: 完全外 → 落ちる
      expect(passed.presenceEdgeChildIds).toEqual([2, 3]);
      expect(passed.presenceEdgeChildIds).not.toContain(11);
      // フル描画 nodes に画面外 presence 端点をマージしない（座標は presenceNodes）
      expect(passed.nodes.map((n: { id: number }) => n.id)).not.toContain(3);
      expect(passed.nodes.map((n: { id: number }) => n.id)).not.toContain(11);
      expect(passed.presenceNodes).toBe(nodes);
    });

    it("culling disabled または screenSize 不正なら presence 全候補を残す", () => {
      const viewportRef = { current: INITIAL_VIEWPORT };
      const { options, presence } = createPresenceAutoOptions();

      setViewportCullingEnabled(false);
      renderHook(() => useRenderedMapScene({
        runtime,
        options,
        ...presence,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize: compactScreen,
      }));
      expect(mockedRenderMapScene.mock.calls[0][2].presenceNodeIds).toEqual(new Set([2, 3]));
      expect(mockedRenderMapScene.mock.calls[0][2].presenceEdgeChildIds).toEqual([2, 3]);

      setViewportCullingEnabled(true);
      mockedRenderMapScene.mockClear();
      renderHook(() => useRenderedMapScene({
        runtime,
        options,
        ...presence,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize: null,
      }));
      expect(mockedRenderMapScene.mock.calls[0][2].presenceNodeIds).toEqual(new Set([2, 3]));
      expect(mockedRenderMapScene.mock.calls[0][2].presenceEdgeChildIds).toEqual([2, 3]);
    });

    it("選択中 ID が presence のみでも required マージで presence 描画集合が膨らまない", () => {
      const viewportRef = { current: INITIAL_VIEWPORT };
      const { options: base, presence } = createPresenceAutoOptions();
      // id:3 は画面外 presence。選択しても presence cull の required は空なので残らない
      const options = { ...base, selectedNodeIds: [3] as const };
      renderHook(() => useRenderedMapScene({
        runtime,
        options,
        ...presence,
        viewport: INITIAL_VIEWPORT,
        viewportRef,
        screenSize: compactScreen,
      }));

      const passed = mockedRenderMapScene.mock.calls[0][2];
      expect(passed.presenceNodeIds!.has(3)).toBe(false);
      expect(passed.presenceNodeIds).toEqual(new Set([2]));
    });

    it("presence ID 固定のまま scale だけ変わると scene を再生成し新 scale（半径用）を渡す", () => {
      const viewportRef = { current: INITIAL_VIEWPORT };
      const { options, presence } = createPresenceAutoOptions();
      // cull 無し → presence 集合が scale で変わらず、半径用 scale 連動だけを検証できる
      const { rerender } = renderHook(
        ({ viewport }: { viewport: Viewport }) => useRenderedMapScene({
          runtime,
          options,
          ...presence,
          viewport,
          viewportRef,
          screenSize: null,
        }),
        { initialProps: { viewport: INITIAL_VIEWPORT } },
      );

      expect(mockedRenderMapScene).toHaveBeenCalledTimes(1);
      const first = mockedRenderMapScene.mock.calls[0][2];
      expect(first.presenceNodeIds).toEqual(new Set([2, 3]));
      expect(first.viewport.scale).toBe(1);

      const nextViewport = { offsetX: 0, offsetY: 0, scale: 0.5 };
      viewportRef.current = nextViewport;
      rerender({ viewport: nextViewport });

      expect(mockedRenderMapScene).toHaveBeenCalledTimes(2);
      const second = mockedRenderMapScene.mock.calls[1][2];
      expect(second.presenceNodeIds).toEqual(new Set([2, 3]));
      expect(second.viewport.scale).toBe(0.5);
      // renderMapScene は viewport.scale から CONST/scale 半径を取る
    });

    it("presence が空のとき scale 変更では scene を再生成しない", () => {
      const viewportRef = { current: INITIAL_VIEWPORT };
      const { options, presence } = createPresenceAutoOptions();
      const { rerender } = renderHook(
        ({ viewport }: { viewport: Viewport }) => useRenderedMapScene({
          runtime,
          options,
          presenceVisibility: {
            ...presence.presenceVisibility!,
            resolutionMode: "high",
          },
          viewport,
          viewportRef,
          screenSize: null,
        }),
        { initialProps: { viewport: INITIAL_VIEWPORT } },
      );

      expect(mockedRenderMapScene).toHaveBeenCalledTimes(1);
      const first = mockedRenderMapScene.mock.calls[0][2];
      expect(first.presenceNodeIds).toEqual(new Set());
      expect(first.presenceEdgeChildIds).toEqual([]);

      const nextViewport = { offsetX: 0, offsetY: 0, scale: 0.5 };
      viewportRef.current = nextViewport;
      rerender({ viewport: nextViewport });

      // transform のみ更新。空 presence では scale を identity に載せない
      expect(mockedRenderMapScene).toHaveBeenCalledTimes(1);
    });

    it("L-467: presence 導出は隣接 hook の useMemo であり render 本体で setState しない", () => {
      const sceneSource = readFileSync(
        join(__dirname, "..", "useRenderedMapScene.ts"),
        "utf8",
      );
      const presenceHookSource = readFileSync(
        join(__dirname, "..", "useMapPresenceRenderOptions.ts"),
        "utf8",
      );
      const planSource = readFileSync(
        join(__dirname, "..", "..", "..", "domain", "nodes", "planPresenceMarkers.ts"),
        "utf8",
      );

      // 合流 hook は presence 算出を持たず、隣接 hook に委譲する
      expect(sceneSource).toMatch(/useMapPresenceRenderOptions/);
      expect(sceneSource).not.toMatch(/planPresenceMarkers|arePresenceInputsComplete|collectPresenceNodeIds/);

      // 純関数＋useMemo 導出。render 中 setState 禁止（viewport cull hook の import も禁止）
      expect(planSource).toMatch(/export function planPresenceMarkers/);
      expect(planSource).not.toMatch(/@\/components\/map\/pixi\//);
      expect(presenceHookSource).toMatch(/useMemo\(\s*\(\)\s*=>\s*planPresenceMarkers/);
      expect(presenceHookSource).toMatch(/cullNodesInViewport/);
      expect(presenceHookSource).not.toMatch(
        /from ["']@\/hooks\/useViewportCulledRenderNodes["']/,
      );
      expect(presenceHookSource).not.toMatch(/\buseState\b/);
      expect(presenceHookSource).not.toMatch(/\bset[A-Z]\w*\(/);
    });
  });
});
