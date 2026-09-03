# Phase 3 ズーム・フォーカス Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 安定したビューポート基盤へホイール／ピンチズームと、`F`キーによる選択ノードの中央表示を追加する。

**Architecture:** 純粋なviewport計算が倍率・anchor・中央位置を決め、React Hookは同期Refへ結果を反映する。wheelはPixiのpassive listenerを避けてcanvas DOMへ登録し、pinchは`stageInteractions`がtouch所有権を調停し、keyboard focusは専用Hookが編集状態とgesture状態を判定する。

**Tech Stack:** TypeScript、React 19、Next.js 16、PixiJS 8、Jest、Testing Library

**Spec:** `docs/superpowers/specs/2026-09-04-phase3-viewport-navigation-design.md`

## Global Constraints

- `docs/superpowers/plans/2026-09-04-phase3-viewport-pan.md`のPRがmainへマージ済みであること。
- 新しい外部ライブラリは追加しない。
- viewport倍率は`0.25`以上`4`以下とする。
- ホイールはポインター位置、ピンチは開始中点のワールド座標をanchorにする。
- ピンチ中の中点移動をoffsetへ反映する。
- 2本目のtouchとwheelは進行中のpointer gestureをキャンセルする。
- ピンチ終了後は残ったtouchによる単一gestureを自動再開しない。
- `F`キーは倍率と選択状態を変えず、選択ノードを画面中央へ即時移動する。
- 編集可能要素、ラベル編集中、pointer gesture中の`F`キーは無視する。
- ロードマップはこの実装PRへ含めず、マージ後処理で更新する。
- 各TaskのRED確認後に最小実装を行い、Task単位でコミットする。

---

### Task 1: ズームとフォーカスの純粋計算

**Files:**
- Modify: `client/src/components/map/mapViewport.ts`
- Modify: `client/src/components/map/__tests__/mapViewport.test.ts`

**Interfaces:**
- Consumes: PR 1の`Viewport`, `worldToScreen`, `screenToWorld`, `panViewport`
- Produces: `ScreenSize`, scale constants, `clampViewportScale`, `zoomViewportAt`, `focusViewportOnNode`

- [ ] **Step 1: 倍率制限、anchor不変性、中央表示の失敗テストを書く**

```ts
import {
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  focusViewportOnNode,
  screenToWorld,
  zoomViewportAt,
} from "@/components/map/mapViewport";

it.each([
  [0.01, MIN_VIEWPORT_SCALE],
  [10, MAX_VIEWPORT_SCALE],
])("requested scale %sを%sへ制限する", (requested, expected) => {
  expect(zoomViewportAt(INITIAL_VIEWPORT, { x: 100, y: 80 }, requested).scale)
    .toBe(expected);
});

it("ズーム前後でanchor直下のワールド座標を維持する", () => {
  const viewport = { offsetX: 30, offsetY: -20, scale: 1.5 };
  const anchor = { x: 240, y: 160 };
  const worldBefore = screenToWorld(anchor, viewport);

  const next = zoomViewportAt(viewport, anchor, 3);

  expect(screenToWorld(anchor, next)).toEqual(worldBefore);
});

it("現在倍率を保ってノード中心を画面中央へ移す", () => {
  const node = {
    id: 1,
    parentId: null,
    x: 100,
    y: 50,
    width: 80,
    height: 40,
    label: "node",
  };

  expect(focusViewportOnNode(
    { offsetX: 0, offsetY: 0, scale: 2 },
    node,
    { width: 800, height: 600 },
  )).toEqual({ offsetX: 120, offsetY: 160, scale: 2 });
});

it("非有限の倍率・anchor・画面サイズでは元のviewportを返す", () => {
  expect(zoomViewportAt(INITIAL_VIEWPORT, { x: Number.NaN, y: 0 }, 2))
    .toBe(INITIAL_VIEWPORT);
  expect(zoomViewportAt(INITIAL_VIEWPORT, { x: 0, y: 0 }, Number.NaN))
    .toBe(INITIAL_VIEWPORT);
  expect(focusViewportOnNode(
    INITIAL_VIEWPORT,
    { id: 1, parentId: null, x: 0, y: 0, width: 1, height: 1, label: "" },
    { width: Number.POSITIVE_INFINITY, height: 600 },
  )).toBe(INITIAL_VIEWPORT);
});
```

- [ ] **Step 2: 純粋関数テストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/mapViewport.test.ts`

Expected: FAIL because zoom and focus exports do not exist.

- [ ] **Step 3: 倍率とanchor計算を実装する**

```ts
import type { Node } from "@/types/node";

export type ScreenSize = { width: number; height: number };
export const MIN_VIEWPORT_SCALE = 0.25;
export const MAX_VIEWPORT_SCALE = 4;

export function clampViewportScale(scale: number): number {
  return Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, scale));
}

export function zoomViewportAt(
  viewport: Viewport,
  anchor: Point,
  requestedScale: number,
): Viewport {
  if (!isValidViewport(viewport)
    || !Number.isFinite(anchor.x)
    || !Number.isFinite(anchor.y)
    || !Number.isFinite(requestedScale)
    || requestedScale <= 0) {
    return viewport;
  }
  const scale = clampViewportScale(requestedScale);
  const worldAnchor = screenToWorld(anchor, viewport);
  return {
    offsetX: anchor.x - worldAnchor.x * scale,
    offsetY: anchor.y - worldAnchor.y * scale,
    scale,
  };
}

export function focusViewportOnNode(
  viewport: Viewport,
  node: Node,
  screen: ScreenSize,
): Viewport {
  if (!isValidViewport(viewport)
    || !Number.isFinite(screen.width)
    || !Number.isFinite(screen.height)) {
    return viewport;
  }
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return viewport;
  return {
    offsetX: screen.width / 2 - center.x * viewport.scale,
    offsetY: screen.height / 2 - center.y * viewport.scale,
    scale: viewport.scale,
  };
}
```

- [ ] **Step 4: 純粋関数テストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/mapViewport.test.ts`

Expected: PASS.

- [ ] **Step 5: viewport計算をコミットする**

```bash
git add client/src/components/map/mapViewport.ts client/src/components/map/__tests__/mapViewport.test.ts
git commit -m "feat(map): ズームと中央表示の計算を追加"
```

---

### Task 2: Hookのズーム・フォーカスcommand

**Files:**
- Modify: `client/src/components/map/useMapViewport.ts`
- Modify: `client/src/components/map/__tests__/useMapViewport.test.tsx`

**Interfaces:**
- Consumes: `zoomViewportAt`, `focusViewportOnNode`
- Produces: `zoomAt(anchor, requestedScale)`, `focusNode(node, screen)`

- [ ] **Step 1: commandの同期更新と参照安定性テストを書く**

```tsx
it("同一batchの連続ズームを最新viewportへ適用する", () => {
  const { result } = renderHook(() => useMapViewport());

  act(() => {
    result.current.zoomAt({ x: 100, y: 100 }, 2);
    result.current.zoomAt({ x: 100, y: 100 }, 4);
  });

  expect(result.current.viewport).toEqual({ offsetX: -300, offsetY: -300, scale: 4 });
});

it("選択ノードを中央へ移して倍率を維持する", () => {
  const { result } = renderHook(() => useMapViewport());
  const node = { id: 1, parentId: null, x: 100, y: 50, width: 80, height: 40, label: "" };

  act(() => {
    result.current.zoomAt({ x: 0, y: 0 }, 2);
    result.current.focusNode(node, { width: 800, height: 600 });
  });

  expect(result.current.viewport).toEqual({ offsetX: 120, offsetY: 160, scale: 2 });
});

it("更新後もzoomAtとfocusNodeの参照を維持する", () => {
  const { result } = renderHook(() => useMapViewport());
  const zoomAt = result.current.zoomAt;
  const focusNode = result.current.focusNode;

  act(() => result.current.zoomAt({ x: 0, y: 0 }, 2));

  expect(result.current.zoomAt).toBe(zoomAt);
  expect(result.current.focusNode).toBe(focusNode);
});
```

- [ ] **Step 2: HookテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/useMapViewport.test.tsx`

Expected: FAIL because `zoomAt` and `focusNode` are not returned.

- [ ] **Step 3: commandを同期Ref基準で実装する**

```ts
const zoomAt = useCallback((anchor: Point, requestedScale: number) => {
  const next = zoomViewportAt(viewportRef.current, anchor, requestedScale);
  if (next !== viewportRef.current) setViewport(next);
}, [setViewport]);

const focusNode = useCallback((node: Node, screen: ScreenSize) => {
  const next = focusViewportOnNode(viewportRef.current, node, screen);
  if (next !== viewportRef.current) setViewport(next);
}, [setViewport]);

return { viewport, viewportRef, setViewport, panBy, zoomAt, focusNode };
```

- [ ] **Step 4: HookテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/useMapViewport.test.tsx`

Expected: PASS.

- [ ] **Step 5: Hook commandをコミットする**

```bash
git add client/src/components/map/useMapViewport.ts client/src/components/map/__tests__/useMapViewport.test.tsx
git commit -m "feat(map): ズームとフォーカス状態更新を追加"
```

---

### Task 3: 非passiveホイールズーム

**Files:**
- Create: `client/src/components/map/useMapWheelZoom.ts`
- Create: `client/src/components/map/__tests__/useMapWheelZoom.test.tsx`

**Interfaces:**
- Consumes: `runtime`, `viewportRef`, `onZoomAt`, `onBeforeZoom`
- Produces: canvas内だけでdefault scrollを止めるwheel lifecycle

- [ ] **Step 1: wheel正規化、anchor、cleanupの失敗テストを書く**

```tsx
import { renderHook } from "@testing-library/react";
import {
  normalizeWheelDeltaY,
  useMapWheelZoom,
} from "@/components/map/useMapWheelZoom";

it.each([
  [2, WheelEvent.DOM_DELTA_PIXEL, 600, 2],
  [2, WheelEvent.DOM_DELTA_LINE, 600, 32],
  [2, WheelEvent.DOM_DELTA_PAGE, 600, 1200],
])("wheel deltaをpixelへ正規化する", (deltaY, mode, height, expected) => {
  expect(normalizeWheelDeltaY(deltaY, mode, height)).toBe(expected);
});

it("canvas上のwheelを抑止してcanvas相対anchorでズームする", () => {
  const canvas = document.createElement("canvas");
  jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 100, top: 50, width: 800, height: 600,
    right: 900, bottom: 650, x: 100, y: 50, toJSON: () => ({}),
  });
  const onBeforeZoom = jest.fn();
  const onZoomAt = jest.fn();
  const runtime = { app: { canvas, screen: { width: 800, height: 600 } } };
  renderHook(() => useMapWheelZoom({
    runtime: runtime as never,
    viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
    onBeforeZoom,
    onZoomAt,
  }));

  const event = new WheelEvent("wheel", {
    clientX: 300,
    clientY: 200,
    deltaY: -100,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    cancelable: true,
  });
  canvas.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
  expect(onBeforeZoom).toHaveBeenCalledTimes(1);
  expect(onZoomAt).toHaveBeenCalledWith(
    { x: 200, y: 150 },
    Math.exp(0.1),
  );
});

it("unmount後はwheelを処理しない", () => {
  const canvas = document.createElement("canvas");
  const onZoomAt = jest.fn();
  const { unmount } = renderHook(() => useMapWheelZoom({
    runtime: { app: { canvas, screen: { height: 600 } } } as never,
    viewportRef: { current: { offsetX: 0, offsetY: 0, scale: 1 } },
    onBeforeZoom: jest.fn(),
    onZoomAt,
  }));

  unmount();
  canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 1 }));

  expect(onZoomAt).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: wheel HookテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/useMapWheelZoom.test.tsx`

Expected: FAIL with `Cannot find module '@/components/map/useMapWheelZoom'`.

- [ ] **Step 3: wheel listenerと正規化を実装する**

```ts
"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { toLocalPoint, type Point } from "@/components/map/mapGeometry";
import type { Viewport } from "@/components/map/mapViewport";
import type { LatestValue } from "@/components/map/pixi/pointerGesture";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";

const WHEEL_ZOOM_SENSITIVITY = 0.001;

export function normalizeWheelDeltaY(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return deltaY * 16;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return deltaY * pageHeight;
  return deltaY;
}

type Options = {
  runtime: PixiRuntime | null;
  viewportRef: LatestValue<Viewport>;
  onBeforeZoom: () => void;
  onZoomAt: (anchor: Point, requestedScale: number) => void;
};

export function useMapWheelZoom({ runtime, viewportRef, onBeforeZoom, onZoomAt }: Options): void {
  const onBeforeZoomRef = useRef(onBeforeZoom);
  const onZoomAtRef = useRef(onZoomAt);
  useLayoutEffect(() => {
    onBeforeZoomRef.current = onBeforeZoom;
    onZoomAtRef.current = onZoomAt;
  }, [onBeforeZoom, onZoomAt]);

  useEffect(() => {
    if (!runtime) return;
    const canvas = runtime.app.canvas;
    const handleWheel = (event: WheelEvent) => {
      const delta = normalizeWheelDeltaY(
        event.deltaY,
        event.deltaMode,
        runtime.app.screen.height,
      );
      if (!Number.isFinite(delta)) return;
      event.preventDefault();
      onBeforeZoomRef.current();
      const anchor = toLocalPoint(
        event.clientX,
        event.clientY,
        canvas.getBoundingClientRect(),
      );
      onZoomAtRef.current(
        anchor,
        viewportRef.current.scale * Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY),
      );
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [runtime, viewportRef]);
}
```

- [ ] **Step 4: wheel HookテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/useMapWheelZoom.test.tsx`

Expected: PASS.

- [ ] **Step 5: wheelズームをコミットする**

```bash
git add client/src/components/map/useMapWheelZoom.ts client/src/components/map/__tests__/useMapWheelZoom.test.tsx
git commit -m "feat(map): canvasのホイールズームを追加"
```

---

### Task 4: 2本指ピンチgesture

**Files:**
- Create: `client/src/components/map/pixi/pinchZoomGesture.ts`
- Create: `client/src/components/map/pixi/__tests__/pinchZoomGesture.test.ts`

**Interfaces:**
- Consumes: 2つの`PointerSample`, `Viewport`, `zoomViewportAt`, `panViewport`
- Produces: `PinchZoomGesture` with `move`, `owns`, `end`, `cancel`

- [ ] **Step 1: 距離比、中点移動、固定pointerの失敗テストを書く**

```ts
import { createPinchZoomGesture } from "@/components/map/pixi/pinchZoomGesture";

const touch = (pointerId: number, x: number, y: number) => ({
  pointerId,
  pointerType: "touch",
  screen: { x, y },
  world: { x, y },
});

it("距離比で拡大し開始中点のワールド座標を現在中点へ移す", () => {
  const onViewportChangeRef = { current: jest.fn() };
  const gesture = createPinchZoomGesture({
    first: touch(1, 100, 100),
    second: touch(2, 200, 100),
    startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
    onViewportChangeRef,
  });

  gesture.move(touch(1, 100, 120));
  gesture.move(touch(2, 300, 120));

  expect(onViewportChangeRef.current).toHaveBeenLastCalledWith({
    offsetX: -100,
    offsetY: -80,
    scale: 2,
  });
});

it("3本目のtouchを所有せず計算へ使わない", () => {
  const onViewportChangeRef = { current: jest.fn() };
  const gesture = createPinchZoomGesture({
    first: touch(1, 0, 0),
    second: touch(2, 100, 0),
    startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
    onViewportChangeRef,
  });

  expect(gesture.owns(3)).toBe(false);
  gesture.move(touch(3, 500, 500));

  expect(onViewportChangeRef.current).not.toHaveBeenCalled();
});

it("所有pointer終了後のmoveを無視する", () => {
  const onViewportChangeRef = { current: jest.fn() };
  const gesture = createPinchZoomGesture({
    first: touch(1, 0, 0),
    second: touch(2, 100, 0),
    startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
    onViewportChangeRef,
  });

  expect(gesture.end(1)).toBe(true);
  gesture.move(touch(2, 200, 0));

  expect(onViewportChangeRef.current).not.toHaveBeenCalled();
});

it("開始距離がゼロならviewportを更新しない", () => {
  const onViewportChangeRef = { current: jest.fn() };
  const gesture = createPinchZoomGesture({
    first: touch(1, 100, 100),
    second: touch(2, 100, 100),
    startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
    onViewportChangeRef,
  });

  gesture.move(touch(2, 200, 100));

  expect(onViewportChangeRef.current).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: ピンチgestureテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/pinchZoomGesture.test.ts`

Expected: FAIL with `Cannot find module '@/components/map/pixi/pinchZoomGesture'`.

- [ ] **Step 3: 固定した2 pointerのピンチ計算を実装する**

```ts
import { panViewport, zoomViewportAt, type Viewport } from "@/components/map/mapViewport";
import type { Point } from "@/components/map/mapGeometry";
import type {
  LatestValue,
  PointerSample,
} from "@/components/map/pixi/pointerGesture";

export type PinchZoomGesture = {
  move: (sample: PointerSample) => void;
  owns: (pointerId: number) => boolean;
  end: (pointerId: number) => boolean;
  cancel: () => void;
};

type Options = {
  first: PointerSample;
  second: PointerSample;
  startViewport: Viewport;
  onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
};

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export function createPinchZoomGesture(options: Options): PinchZoomGesture {
  const ids = [options.first.pointerId, options.second.pointerId] as const;
  const points = new Map<number, Point>([
    [ids[0], { ...options.first.screen }],
    [ids[1], { ...options.second.screen }],
  ]);
  const startCenter = midpoint(options.first.screen, options.second.screen);
  const startDistance = distance(options.first.screen, options.second.screen);
  let active = true;

  const owns = (pointerId: number) => pointerId === ids[0] || pointerId === ids[1];
  return {
    owns,
    move(sample) {
      if (!active || !owns(sample.pointerId)) return;
      points.set(sample.pointerId, { ...sample.screen });
      const first = points.get(ids[0])!;
      const second = points.get(ids[1])!;
      const currentDistance = distance(first, second);
      if (startDistance <= 0 || !Number.isFinite(currentDistance)) return;
      const currentCenter = midpoint(first, second);
      const zoomed = zoomViewportAt(
        options.startViewport,
        startCenter,
        options.startViewport.scale * currentDistance / startDistance,
      );
      options.onViewportChangeRef.current(panViewport(
        zoomed,
        currentCenter.x - startCenter.x,
        currentCenter.y - startCenter.y,
      ));
    },
    end(pointerId) {
      if (!active || !owns(pointerId)) return false;
      active = false;
      return true;
    },
    cancel() { active = false; },
  };
}
```

- [ ] **Step 4: ピンチgestureテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/pinchZoomGesture.test.ts`

Expected: PASS.

- [ ] **Step 5: ピンチgestureをコミットする**

```bash
git add client/src/components/map/pixi/pinchZoomGesture.ts client/src/components/map/pixi/__tests__/pinchZoomGesture.test.ts
git commit -m "feat(map): 2本指ピンチ計算を追加"
```

---

### Task 5: touch所有権と外部キャンセルAPI

**Files:**
- Modify: `client/src/components/map/pixi/stageInteractions.ts`
- Modify: `client/src/components/map/useMapStageInteractions.ts`
- Modify: `client/src/components/map/pixi/__tests__/stageInteractions.test.ts`
- Modify: `client/src/components/map/__tests__/useMapStageInteractions.test.tsx`

**Interfaces:**
- Consumes: `createPinchZoomGesture`, `onViewportChangeRef`
- Produces: `cancelActiveGesture()`, `hasActiveGesture()`, 2本touch調停

- [ ] **Step 1: pinch開始・終了・3本目・gesture置換の失敗テストを書く**

`pointer` fixtureが`pointerType`を上書きできるようにし、次を追加する。

```ts
it("2本目のtouchでnode gestureをキャンセルしてpinchへ置換する", () => {
  const { stage, handlers } = createStage();
  const { controller, onMoveNodeRef, onViewportChangeRef } = createController();
  controller.bind(stage as never);
  controller.handleNodePointerDown(1, pointer(100, 100, {
    pointerId: 1,
    pointerType: "touch",
    path: [stage],
  }));

  handlers.pointerdown?.(pointer(200, 100, {
    pointerId: 2,
    pointerType: "touch",
    target: stage,
  }));
  handlers.pointermove?.(pointer(300, 100, {
    pointerId: 2,
    pointerType: "touch",
  }));

  expect(onMoveNodeRef.current).not.toHaveBeenCalled();
  expect(onViewportChangeRef.current).toHaveBeenCalledWith(expect.objectContaining({ scale: 2 }));
});

it("pinch終了後は残ったtouchのpanを再開しない", () => {
  const { stage, handlers } = createStage();
  const { controller, onViewportChangeRef } = createController();
  controller.bind(stage as never);
  handlers.pointerdown?.(pointer(0, 0, { pointerId: 1, pointerType: "touch", target: stage }));
  handlers.pointerdown?.(pointer(100, 0, { pointerId: 2, pointerType: "touch", target: stage }));
  handlers.pointerup?.(pointer(100, 0, { pointerId: 2, pointerType: "touch" }));
  onViewportChangeRef.current.mockClear();

  handlers.pointermove?.(pointer(20, 0, { pointerId: 1, pointerType: "touch" }));

  expect(onViewportChangeRef.current).not.toHaveBeenCalled();
});

it("3本目のtouchは固定したpinch pairを置換しない", () => {
  const { stage, handlers } = createStage();
  const { controller, onViewportChangeRef } = createController();
  controller.bind(stage as never);
  handlers.pointerdown?.(pointer(0, 0, { pointerId: 1, pointerType: "touch", target: stage }));
  handlers.pointerdown?.(pointer(100, 0, { pointerId: 2, pointerType: "touch", target: stage }));
  handlers.pointerdown?.(pointer(500, 500, { pointerId: 3, pointerType: "touch", target: stage }));
  onViewportChangeRef.current.mockClear();

  handlers.pointermove?.(pointer(600, 600, { pointerId: 3, pointerType: "touch" }));

  expect(onViewportChangeRef.current).not.toHaveBeenCalled();
});

it("固定touchのpointercancelでpinchを終了する", () => {
  const { stage, handlers } = createStage();
  const { controller, onViewportChangeRef } = createController();
  controller.bind(stage as never);
  handlers.pointerdown?.(pointer(0, 0, { pointerId: 1, pointerType: "touch", target: stage }));
  handlers.pointerdown?.(pointer(100, 0, { pointerId: 2, pointerType: "touch", target: stage }));

  handlers.pointercancel?.(pointer(100, 0, { pointerId: 2, pointerType: "touch" }));
  handlers.pointermove?.(pointer(200, 0, { pointerId: 1, pointerType: "touch" }));

  expect(onViewportChangeRef.current).not.toHaveBeenCalled();
});
```

`cancelActiveGesture`と`hasActiveGesture`はbind前、単一gesture中、pinch中、cleanup後を検証する。

- [ ] **Step 2: touch調停テストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/stageInteractions.test.ts src/components/map/__tests__/useMapStageInteractions.test.tsx`

Expected: FAIL because pinch state and controller methods do not exist.

- [ ] **Step 3: touch pointerとpinch pairを管理する**

`stageInteractions`へ次の状態を追加する。

```ts
let activePinch: PinchZoomGesture | null = null;
const touchSamples = new Map<number, PointerSample>();
let suppressTouchUntilAllReleased = false;
```

nodeとblankのpointer down冒頭で共通の`handleTouchDown(sample)`を呼ぶ。同じpointer IDのstage bubbleは再登録せず、2本目で単一gestureをキャンセルしてpinchを作る。3本目以降は記録だけ行い、通常gestureを開始しない。

```ts
const handleTouchDown = (sample: PointerSample): boolean => {
  if (sample.pointerType !== "touch") return false;
  if (!touchSamples.has(sample.pointerId)) touchSamples.set(sample.pointerId, sample);
  if (suppressTouchUntilAllReleased || activePinch || touchSamples.size > 2) return true;
  if (touchSamples.size < 2) return false;

  cancelActiveGesture();
  const [first, second] = [...touchSamples.values()];
  activePinch = createPinchZoomGesture({
    first,
    second,
    startViewport: viewportRef.current,
    onViewportChangeRef,
  });
  return true;
};
```

moveではtouch位置を更新し、`activePinch`が所有するpointerだけを渡す。up、upoutside、pointercancelで固定pairの片方が終わった場合はpinchを終了し、`suppressTouchUntilAllReleased = true`にする。touch mapが空になった時だけ抑止を解除する。

- [ ] **Step 4: controllerのキャンセルと照会を公開する**

```ts
const cancelAllInteractions = () => {
  cancelActiveGesture();
  activePinch?.cancel();
  activePinch = null;
};

const hasActiveGesture = () => activeGesture !== null || activePinch !== null;

return {
  bind,
  handleNodePointerDown,
  cancelActiveGesture: cancelAllInteractions,
  hasActiveGesture,
};
```

unbindでは`cancelAllInteractions()`、`touchSamples.clear()`、`suppressTouchUntilAllReleased = false`を実行する。Hookの戻り値から2つのcontroller methodをそのまま公開する。

- [ ] **Step 5: touch調停テストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/stageInteractions.test.ts src/components/map/__tests__/useMapStageInteractions.test.tsx src/components/map/pixi/__tests__/pinchZoomGesture.test.ts`

Expected: PASS.

- [ ] **Step 6: touch所有権をコミットする**

```bash
git add client/src/components/map/pixi/stageInteractions.ts client/src/components/map/useMapStageInteractions.ts client/src/components/map/pixi/__tests__/stageInteractions.test.ts client/src/components/map/__tests__/useMapStageInteractions.test.tsx
git commit -m "feat(map): ピンチのtouch所有権を統合"
```

---

### Task 6: `F`キーのフォーカスHook

**Files:**
- Create: `client/src/components/map/useMapViewportShortcut.ts`
- Create: `client/src/components/map/__tests__/useMapViewportShortcut.test.tsx`

**Interfaces:**
- Consumes: nodes、selectedNodeId、editing状態、screen、`hasActiveGesture`、`onFocusNode`
- Produces: lifecycle管理された`F` keydown listener

- [ ] **Step 1: 成功・無効化・cleanupの失敗テストを書く**

```tsx
import { renderHook } from "@testing-library/react";
import { useMapViewportShortcut } from "@/components/map/useMapViewportShortcut";

const node = { id: 1, parentId: null, x: 100, y: 50, width: 80, height: 40, label: "" };

function pressF(target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

it("選択ノードとscreenをフォーカスcommandへ渡す", () => {
  const onFocusNode = jest.fn();
  renderHook(() => useMapViewportShortcut({
    nodes: [node],
    selectedNodeId: 1,
    isEditing: false,
    screen: { width: 800, height: 600 },
    hasActiveGesture: () => false,
    onFocusNode,
  }));

  const event = pressF();

  expect(event.defaultPrevented).toBe(true);
  expect(onFocusNode).toHaveBeenCalledWith(node, { width: 800, height: 600 });
});

it("ラベル編集中はFキーを無視する", () => {
  const onFocusNode = jest.fn();
  renderHook(() => useMapViewportShortcut({
    nodes: [node], selectedNodeId: 1, isEditing: true,
    screen: { width: 800, height: 600 },
    hasActiveGesture: () => false, onFocusNode,
  }));

  pressF();
  expect(onFocusNode).not.toHaveBeenCalled();
});

it("pointer gesture中はFキーを無視する", () => {
  const onFocusNode = jest.fn();
  renderHook(() => useMapViewportShortcut({
    nodes: [node], selectedNodeId: 1, isEditing: false,
    screen: { width: 800, height: 600 },
    hasActiveGesture: () => true, onFocusNode,
  }));

  pressF();
  expect(onFocusNode).not.toHaveBeenCalled();
});

it.each(["input", "textarea", "select"])("%sからのFキーを無視する", (tagName) => {
  const target = document.body.appendChild(document.createElement(tagName));
  const onFocusNode = jest.fn();
  renderHook(() => useMapViewportShortcut({
    nodes: [node], selectedNodeId: 1, isEditing: false,
    screen: { width: 800, height: 600 }, hasActiveGesture: () => false, onFocusNode,
  }));

  pressF(target);
  expect(onFocusNode).not.toHaveBeenCalled();
  target.remove();
});

it("contenteditable内の子要素からのFキーを無視する", () => {
  const editor = document.body.appendChild(document.createElement("div"));
  editor.contentEditable = "true";
  const target = editor.appendChild(document.createElement("span"));
  const onFocusNode = jest.fn();
  renderHook(() => useMapViewportShortcut({
    nodes: [node], selectedNodeId: 1, isEditing: false,
    screen: { width: 800, height: 600 }, hasActiveGesture: () => false, onFocusNode,
  }));

  pressF(target);
  expect(onFocusNode).not.toHaveBeenCalled();
  editor.remove();
});

it("欠損選択とunmount後は何もしない", () => {
  const onFocusNode = jest.fn();
  const { unmount } = renderHook(() => useMapViewportShortcut({
    nodes: [], selectedNodeId: 1, isEditing: false,
    screen: { width: 800, height: 600 }, hasActiveGesture: () => false, onFocusNode,
  }));
  pressF();
  unmount();
  pressF();
  expect(onFocusNode).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: shortcutテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/useMapViewportShortcut.test.tsx`

Expected: FAIL with `Cannot find module '@/components/map/useMapViewportShortcut'`.

- [ ] **Step 3: 編集可能要素判定とkeydown lifecycleを実装する**

```ts
"use client";

import { useEffect } from "react";
import type { ScreenSize } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
};

type Options = {
  nodes: readonly Node[];
  selectedNodeId: number | null;
  isEditing: boolean;
  screen: ScreenSize | null;
  hasActiveGesture: () => boolean;
  onFocusNode: (node: Node, screen: ScreenSize) => void;
};

export function useMapViewportShortcut({
  nodes,
  selectedNodeId,
  isEditing,
  screen,
  hasActiveGesture,
  onFocusNode,
}: Options): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f"
        || isEditing
        || isEditableTarget(event.target)
        || hasActiveGesture()
        || !screen
        || selectedNodeId === null) return;

      const selected = nodes.find((node) => node.id === selectedNodeId);
      if (!selected) return;
      event.preventDefault();
      onFocusNode(selected, screen);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nodes, selectedNodeId, isEditing, screen, hasActiveGesture, onFocusNode]);
}
```

- [ ] **Step 4: shortcutテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/useMapViewportShortcut.test.tsx`

Expected: PASS.

- [ ] **Step 5: shortcut Hookをコミットする**

```bash
git add client/src/components/map/useMapViewportShortcut.ts client/src/components/map/__tests__/useMapViewportShortcut.test.tsx
git commit -m "feat(map): 選択ノードの中央表示を追加"
```

---

### Task 7: MapStageへのズーム・フォーカス統合

**Files:**
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/pixi/usePixiApplication.ts`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`
- Modify: `client/src/components/layout/AppHeader.tsx`
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `zoomAt`, `focusNode`, interaction controller、wheel/shortcut Hooks
- Produces: ユーザー操作可能なwheel、pinch、`F` focus

- [ ] **Step 1: MapStage境界のwheel・focusテストを書く**

実際の`useMapViewport`を通してwheel後のworld container倍率と`F`後のoffsetを確認する。

```tsx
it("wheelでpointer位置をanchorにworld containerを拡大する", async () => {
  await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} />);
  const canvas = document.querySelector("canvas")!;
  mockStageBounds(canvas);

  canvas.dispatchEvent(new WheelEvent("wheel", {
    clientX: 100,
    clientY: 100,
    deltaY: -100,
    cancelable: true,
  }));

  await act(async () => undefined);
  expect(lastWorldContainer()?.scale.set)
    .toHaveBeenCalledWith(Math.exp(0.1));
});

it("Fキーで倍率を保ち選択ノードを中央へ移す", async () => {
  await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} />);

  fireEvent.keyDown(window, { key: "f" });

  expect(lastWorldContainer()?.position.set).toHaveBeenCalledWith(300, 240);
  expect(lastWorldContainer()?.scale.set).toHaveBeenCalledWith(1);
});
```

- [ ] **Step 2: MapStage統合テストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx`

Expected: FAIL because wheel and focus Hooks are not mounted.

- [ ] **Step 3: MapStageへwheelとshortcutを配線する**

`useMapStageInteractions`の戻り値からcontroller methodを受け取る。

```tsx
const {
  viewport,
  viewportRef,
  setViewport,
  zoomAt,
  focusNode,
} = useMapViewport();

const {
  connectionTargetNodeId,
  onNodePointerDown,
  cancelActiveGesture,
  hasActiveGesture,
} = useMapStageInteractions({
  runtime,
  nodes,
  viewportRef,
  onViewportChange: setViewport,
  onSelectNode,
  onMoveNode,
  onConnectNodes,
});

useMapWheelZoom({
  runtime,
  viewportRef,
  onBeforeZoom: cancelActiveGesture,
  onZoomAt: zoomAt,
});

useMapViewportShortcut({
  nodes,
  selectedNodeId,
  isEditing: editing.editingNodeId !== null,
  screen: runtime ? runtime.app.screen : null,
  hasActiveGesture,
  onFocusNode: focusNode,
});
```

`usePixiApplication`で作成したcanvasへ`style.touchAction = "none"`を設定する。

- [ ] **Step 4: 操作案内のテストと表示を更新する**

期待文言を次へ更新する。

```text
ダブルクリックで追加・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続
```

- [ ] **Step 5: MapStageと操作案内テストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx src/components/layout/__tests__/AppHeader.test.tsx src/components/map/__tests__/useMapWheelZoom.test.tsx src/components/map/__tests__/useMapViewportShortcut.test.tsx`

Expected: PASS.

- [ ] **Step 6: client全体を検証する**

Run: `cd client && npm run verify`

Expected: Tailwind CSS scan、ESLint、TypeScript、全Jest suite、Next.js production buildがすべて成功する。

- [ ] **Step 7: 差分の空白エラーを検証する**

Run: `git diff --check main...HEAD`

Expected: 出力なし、exit code 0。

- [ ] **Step 8: 統合をコミットする**

```bash
git add client/src/components/map/MapStage.tsx client/src/components/map/pixi/usePixiApplication.ts client/src/components/map/__tests__/MapStage.test.tsx client/src/components/layout/AppHeader.tsx client/src/components/layout/__tests__/AppHeader.test.tsx
git commit -m "feat(map): ズームとフォーカス操作を統合"
```

## PR 2 完了確認

- [ ] wheelとpinchが`0.25`から`4`の範囲でanchorを維持する。
- [ ] wheelと2本目touchが進行中gestureを安全にキャンセルする。
- [ ] 3本目touch、別pointer、pinch終了後の残存touchがviewportを跳ねさせない。
- [ ] `F`キーが選択ノードを現在倍率のまま中央へ移す。
- [ ] 編集中、編集可能要素、欠損選択、gesture中は`F`キーを無視する。
- [ ] `npm run verify`と`git diff --check main...HEAD`が成功する。
- [ ] PRマージ後の後処理で`ROADMAP.md`のズームとフォーカスを完了、Phase 3を`3 / 4`、次項目を子孫一括移動へ更新する。
