import { renderHook } from "@testing-library/react";
import { useMapVisibilityTransition } from "@/components/map/useMapVisibilityTransition";
import { createMapVisibilityAnimator } from "@/components/map/pixi/mapVisibilityAnimator";
import type { RenderedMapScene } from "@/components/map/pixi/renderMapScene";
import type { MapVisibilityTarget } from "@/components/map/pixi/mapVisibilityAnimator";
import { createTestNode } from "@/testing/createTestNode";

function target(key: string) {
  return {
    key,
    setOpacity: jest.fn(),
    setInteractive: jest.fn(),
    setRendered: jest.fn(),
  } satisfies MapVisibilityTarget;
}

function scene(...targets: MapVisibilityTarget[]): RenderedMapScene {
  return {
    worldContainer: {} as never,
    visibilityTargets: new Map(targets.map((item) => [item.key, item])),
  };
}

const nodes = [
  createTestNode({ id: 1, parentId: null }),
  createTestNode({ id: 2, parentId: 1 }),
];

let now = 0;
let nextFrameId = 1;
let frameCallbacks = new Map<number, FrameRequestCallback>();

describe("useMapVisibilityTransition", () => {
  beforeEach(() => {
    now = 0;
    nextFrameId = 1;
    frameCallbacks = new Map();
    jest.spyOn(performance, "now").mockImplementation(() => now);
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: jest.fn((callback: FrameRequestCallback) => {
        const id = nextFrameId++;
        frameCallbacks.set(id, callback);
        return id;
      }),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: jest.fn((id: number) => frameCallbacks.delete(id)),
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("visible nodeと両端がvisibleなedgeだけをtarget visibilityへ反映する", () => {
    const root = target("node:1");
    const child = target("node:2");
    const edge = target("edge:2");
    renderHook(() => useMapVisibilityTransition({
      scene: scene(root, child, edge), nodes, visibleNodeIds: new Set([1, 2]),
    }));

    expect(root.setRendered).toHaveBeenLastCalledWith(true);
    expect(child.setInteractive).toHaveBeenLastCalledWith(true);
    expect(edge.setRendered).toHaveBeenLastCalledWith(true);
  });

  it("nodeとedgeを開始・80ms・160msで同じopacityに補間する", () => {
    const root = target("node:1");
    const child = target("node:2");
    const edge = target("edge:2");
    renderHook(() => useMapVisibilityTransition({
      scene: scene(root, child, edge), nodes, visibleNodeIds: new Set([1, 2]),
    }));
    expect(root.setOpacity).toHaveBeenLastCalledWith(0);
    expect(edge.setOpacity).toHaveBeenLastCalledWith(0);

    now = 80;
    frameCallbacks.get(1)?.(80);
    expect(child.setOpacity).toHaveBeenLastCalledWith(0.875);
    expect(edge.setOpacity).toHaveBeenLastCalledWith(0.875);

    now = 160;
    frameCallbacks.get(2)?.(160);
    expect(root.setOpacity).toHaveBeenLastCalledWith(1);
    expect(edge.setOpacity).toHaveBeenLastCalledWith(1);
  });

  it("scene replacementへ同じ論理表示stateを適用し、unmountでlistenerを解除する", () => {
    const media = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    Object.defineProperty(window, "matchMedia", { configurable: true, value: jest.fn(() => media) });
    const first = target("node:1");
    const replacement = target("node:1");
    const { rerender, unmount } = renderHook(
      ({ currentScene }) => useMapVisibilityTransition({
        scene: currentScene, nodes: [nodes[0]], visibleNodeIds: new Set([1]),
      }),
      { initialProps: { currentScene: scene(first) } },
    );

    rerender({ currentScene: scene(replacement) });
    unmount();

    expect(replacement.setRendered).toHaveBeenLastCalledWith(true);
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("nullからsceneが到着しても最新visibleKeysを直ちに適用する", () => {
    const root = target("node:1");
    const visibleNodeIds = new Set([1]);
    const { rerender } = renderHook(
      ({ currentScene }) => useMapVisibilityTransition({
        scene: currentScene, nodes: [nodes[0]], visibleNodeIds,
      }),
      { initialProps: { currentScene: null as RenderedMapScene | null } },
    );

    rerender({ currentScene: scene(root) });

    expect(root.setRendered).toHaveBeenLastCalledWith(true);
  });

  it("replacementに追加されたvisible keyを直ちに表示する", () => {
    const root = target("node:1");
    const child = target("node:2");
    const visibleNodeIds = new Set([1, 2]);
    const { rerender } = renderHook(
      ({ currentScene }) => useMapVisibilityTransition({
        scene: currentScene, nodes, visibleNodeIds,
      }),
      { initialProps: { currentScene: scene(root) } },
    );

    rerender({ currentScene: scene(root, child) });

    expect(child.setRendered).toHaveBeenLastCalledWith(true);
  });

  it("media changeで進行中tweenをreduced-motion endpointへ確定する", () => {
    let onChange: ((event: Event) => void) | undefined;
    const media = {
      matches: false,
      addEventListener: jest.fn((_name: string, listener: (event: Event) => void) => { onChange = listener; }),
      removeEventListener: jest.fn(),
    };
    Object.defineProperty(window, "matchMedia", { configurable: true, value: jest.fn(() => media) });
    const root = target("node:1");
    renderHook(() => useMapVisibilityTransition({
      scene: scene(root), nodes: [nodes[0]], visibleNodeIds: new Set([1]),
    }));

    onChange?.({ matches: true } as MediaQueryListEvent);

    expect(root.setOpacity).toHaveBeenLastCalledWith(1);
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it("RAF APIが片側だけならtimeout pairへfallbackする", () => {
    Object.defineProperty(window, "cancelAnimationFrame", { configurable: true, value: undefined });
    const timeout = jest.spyOn(window, "setTimeout");
    const root = target("node:1");
    renderHook(() => useMapVisibilityTransition({
      scene: scene(root), nodes: [nodes[0]], visibleNodeIds: new Set([1]),
    }));

    expect(timeout).toHaveBeenCalled();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("query差替えではanimatorをdispose/recreateせず、fadeを継続する", () => {
    const firstMedia = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    const secondMedia = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    const matchMedia = jest.fn()
      .mockReturnValueOnce(firstMedia)
      .mockReturnValueOnce(secondMedia);
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
    let dispose: jest.SpyInstance | undefined;
    const animatorFactory = jest.fn((dependencies: Parameters<typeof createMapVisibilityAnimator>[0]) => {
      const animator = createMapVisibilityAnimator(dependencies);
      dispose = jest.spyOn(animator, "dispose");
      return animator;
    });
    const root = target("node:1");
    const child = target("node:2");
    const { rerender, unmount } = renderHook(
      ({ query, currentScene, currentVisibleNodeIds }) => useMapVisibilityTransition({
        scene: currentScene, nodes, visibleNodeIds: currentVisibleNodeIds,
        reducedMotionQuery: query, animatorFactory,
      }),
      {
        initialProps: {
          query: "(prefers-reduced-motion: reduce)",
          currentScene: scene(root),
          currentVisibleNodeIds: new Set([1]),
        },
      },
    );

    rerender({
      query: "(prefers-reduced-motion: no-preference)",
      currentScene: scene(root),
      currentVisibleNodeIds: new Set([1]),
    });
    rerender({
      query: "(prefers-reduced-motion: no-preference)",
      currentScene: scene(root, child),
      currentVisibleNodeIds: new Set([1, 2]),
    });
    now = 80;
    frameCallbacks.get(1)?.(80);

    expect(animatorFactory).toHaveBeenCalledTimes(1);
    expect(firstMedia.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(secondMedia.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(root.setOpacity).toHaveBeenLastCalledWith(0.875);
    expect(child.setOpacity).toHaveBeenLastCalledWith(0.875);
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(2);
  });

  it("matchMedia reduced motionではendpointを即時適用する", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn(() => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
    });
    const root = target("node:1");
    renderHook(() => useMapVisibilityTransition({
      scene: scene(root), nodes: [nodes[0]], visibleNodeIds: new Set([1]),
    }));

    expect(root.setOpacity).toHaveBeenLastCalledWith(1);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
