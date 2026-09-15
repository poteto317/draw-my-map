# Phase 3 ズーム・フォーカス Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Historical plan:** この文書は実装時の手順を記録したものである。実装後の単一責任リファクタリングにより、`focusViewportOnNode`は`mapViewport.ts`から`nodeViewportFocus.ts`へ移動し、wheel入力の正規化・request計算は`useMapWheelZoom.ts`から`wheelZoom.ts`へ移動した。以下の手順は移動後の責務に合わせて更新している。

**Goal:** 安定したビューポート基盤へホイール／ピンチズームと、`F`キーによる選択ノードの中央表示を追加する。

**Architecture:** 純粋なviewport計算が倍率・anchor・中央位置を決め、React Hookは同期Refへ結果を反映する。wheelはPixiのpassive listenerを避けてcanvas DOMへ登録し、pinchは`touchGestureCoordinator`がtouch所有権を調停して`stageInteractions`がイベントを委譲し、keyboard focusは専用Hookが編集状態とgesture状態を判定する。

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
- Create: `client/src/components/map/nodeViewportFocus.ts`
- Create: `client/src/components/map/__tests__/nodeViewportFocus.test.ts`

**Interfaces:**
- Consumes: PR 1の`Viewport`, `worldToScreen`, `screenToWorld`, `panViewport`
- `mapViewport.ts` Consumes: PR 1で定義済みのscale constants
- `mapViewport.ts` Produces: `ScreenSize`, `clampViewportScale`, `zoomViewportAt`
- `nodeViewportFocus.ts` Produces: `focusViewportOnNode`

- [ ] **Step 1: 倍率制限、anchor不変性、中央表示の失敗テストを書く**

```ts
import {
  INITIAL_VIEWPORT,
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  screenToWorld,
  zoomViewportAt,
} from "@/components/map/mapViewport";
import { focusViewportOnNode } from "@/components/map/nodeViewportFocus";

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

it("大きな有限anchorでも途中計算をoverflowさせない", () => {
  expect(zoomViewportAt(
    INITIAL_VIEWPORT,
    { x: 1.05e308, y: 0 },
    2,
  )).toEqual({ offsetX: -1.05e308, offsetY: 0, scale: 2 });
});

it("有限値同士の演算結果が非有限になるzoomでは元のviewportを返す", () => {
  expect(zoomViewportAt(
    INITIAL_VIEWPORT,
    { x: -Number.MAX_VALUE, y: 0 },
    4,
  )).toBe(INITIAL_VIEWPORT);
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

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/mapViewport.test.ts src/components/map/__tests__/nodeViewportFocus.test.ts`

Expected: FAIL because zoom functions and the node focus module do not exist.

- [ ] **Step 3: 倍率・anchor計算とNode固有フォーカス計算を分離して実装する**

```ts
// mapViewport.ts
export type ScreenSize = { width: number; height: number };

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
  if (scale === viewport.scale) return viewport;
  const scaleRatio = scale / viewport.scale;
  const candidate = {
    offsetX: anchor.x * (1 - scaleRatio) + viewport.offsetX * scaleRatio,
    offsetY: anchor.y * (1 - scaleRatio) + viewport.offsetY * scaleRatio,
    scale,
  };
  return isValidViewport(candidate) ? candidate : viewport;
}

// nodeViewportFocus.ts（ここから別ファイル）
import {
  isValidViewport,
  type ScreenSize,
  type Viewport,
} from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

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
  const offsetX = screen.width / 2 - center.x * viewport.scale;
  const offsetY = screen.height / 2 - center.y * viewport.scale;
  if (offsetX === viewport.offsetX && offsetY === viewport.offsetY) return viewport;
  const candidate = {
    offsetX,
    offsetY,
    scale: viewport.scale,
  };
  return isValidViewport(candidate) ? candidate : viewport;
}
```

- [ ] **Step 4: 純粋関数テストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/mapViewport.test.ts src/components/map/__tests__/nodeViewportFocus.test.ts`

Expected: PASS.

- [ ] **Step 5: viewport計算をコミットする**

```bash
git add client/src/components/map/mapViewport.ts client/src/components/map/__tests__/mapViewport.test.ts client/src/components/map/nodeViewportFocus.ts client/src/components/map/__tests__/nodeViewportFocus.test.ts
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
- Create: `client/src/components/map/wheelZoom.ts`
- Create: `client/src/components/map/useMapWheelZoom.ts`
- Create: `client/src/components/map/__tests__/wheelZoom.test.ts`
- Create: `client/src/components/map/__tests__/useMapWheelZoom.test.tsx`

**Interfaces:**
- `wheelZoom.ts`: wheel入力値と現在倍率を受け、検証済みのanchorと要求倍率を返す純粋計算
- `useMapWheelZoom.ts`: `runtime`、`viewportRef`、`onZoomAt`、`onBeforeZoom`を受け、canvas内だけでdefault scrollを止めるlistener lifecycle

- [ ] **Step 1: wheel計算とlistener lifecycleの失敗テストを書く**

```tsx
import { renderHook } from "@testing-library/react";
import { useMapWheelZoom } from "@/components/map/useMapWheelZoom";
import {
  calculateWheelZoomRequest,
  normalizeWheelDeltaY,
} from "@/components/map/wheelZoom";

it.each([
  [2, WheelEvent.DOM_DELTA_PIXEL, 600, 2],
  [2, WheelEvent.DOM_DELTA_LINE, 600, 32],
  [2, WheelEvent.DOM_DELTA_PAGE, 600, 1200],
])("wheel deltaをpixelへ正規化する", (deltaY, mode, height, expected) => {
  expect(normalizeWheelDeltaY(deltaY, mode, height)).toBe(expected);
});

it("DOMグローバルがない実行環境でもwheel deltaを正規化する", () => {
  const wheelEvent = globalThis.WheelEvent;
  Object.defineProperty(globalThis, "WheelEvent", { configurable: true, value: undefined });

  try {
    expect(normalizeWheelDeltaY(5, 1, 600)).toBe(80);
    expect(normalizeWheelDeltaY(5, 2, 600)).toBe(3000);
  } finally {
    Object.defineProperty(globalThis, "WheelEvent", { configurable: true, value: wheelEvent });
  }
});

it("canvas相対anchorと要求倍率を返す", () => {
  expect(calculateWheelZoomRequest({
    clientX: 300,
    clientY: 200,
    deltaY: -100,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    pageHeight: 600,
    bounds: { left: 100, top: 50 },
  }, 1)).toEqual({
    anchor: { x: 200, y: 150 },
    requestedScale: Math.exp(0.1),
  });
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

- [ ] **Step 2: wheelテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/wheelZoom.test.ts src/components/map/__tests__/useMapWheelZoom.test.tsx`

Expected: FAIL with wheel計算またはHookが未実装であることを示すエラー。

- [ ] **Step 3: wheel純粋計算とlistenerを実装する**

```ts
// wheelZoom.ts
const WHEEL_DELTA_MODE_LINE = 1;
const WHEEL_DELTA_MODE_PAGE = 2;

export function normalizeWheelDeltaY(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (deltaMode === WHEEL_DELTA_MODE_LINE) return deltaY * 16;
  if (deltaMode === WHEEL_DELTA_MODE_PAGE) return deltaY * pageHeight;
  return deltaY;
}

export function calculateWheelZoomRequest(
  input: WheelZoomInput,
  currentScale: number,
): WheelZoomRequest | null {
  // 入力・anchor・要求倍率を検証し、実効倍率が変わらない入力はnullにする。
}

// useMapWheelZoom.ts（ここから別ファイル）
"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { Point } from "@/components/map/mapGeometry";
import type { Viewport } from "@/components/map/mapViewport";
import { calculateWheelZoomRequest } from "@/components/map/wheelZoom";
import type { LatestValue } from "@/components/map/pixi/pointerGesture";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";

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
      const request = calculateWheelZoomRequest({
        clientX: event.clientX,
        clientY: event.clientY,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        pageHeight: runtime.app.screen.height,
        bounds: canvas.getBoundingClientRect(),
      }, viewportRef.current.scale);
      if (!request) return;
      event.preventDefault();
      onBeforeZoomRef.current();
      onZoomAtRef.current(request.anchor, request.requestedScale);
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [runtime, viewportRef]);
}
```

- [ ] **Step 4: wheelテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/wheelZoom.test.ts src/components/map/__tests__/useMapWheelZoom.test.tsx`

Expected: PASS.

- [ ] **Step 5: wheelズームをコミットする**

```bash
git add client/src/components/map/wheelZoom.ts client/src/components/map/useMapWheelZoom.ts client/src/components/map/__tests__/wheelZoom.test.ts client/src/components/map/__tests__/useMapWheelZoom.test.tsx
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

> **現行責務の参照:** `pointerGestureSession.ts`と`touchGestureCoordinator.ts`は後続の`2026-09-08-phase3-srp-refactor.md`で作成された。以下はTask当時の作成順ではなく、後続リファクタリング後の現行責務を示す。

**Files:**
- Modify: `client/src/components/map/pixi/stageInteractions.ts`
- Reference: `client/src/components/map/pixi/pointerGestureSession.ts`
- Reference: `client/src/components/map/pixi/touchGestureCoordinator.ts`
- Modify: `client/src/components/map/useMapStageInteractions.ts`
- Modify: `client/src/components/map/pixi/__tests__/stageInteractions.test.ts`
- Reference: `client/src/components/map/pixi/__tests__/pointerGestureSession.test.ts`
- Reference: `client/src/components/map/pixi/__tests__/touchGestureCoordinator.test.ts`
- Modify: `client/src/components/map/__tests__/useMapStageInteractions.test.tsx`

**Interfaces:**
- Consumes: `createPinchZoomGesture`, `createPointerGestureSession`, `createTouchGestureCoordinator`, `onViewportChangeRef`
- Produces: `cancelActiveGesture()`, `hasActiveGesture()`、session/coordinatorへ委譲するstage調停

- [ ] **Step 1: pinch開始・終了・3本目・gesture置換の失敗テストを書く**

`pointer` fixtureが`pointerType`を上書きできるようにし、次を追加する。

```ts
it("2本目のtouchでnode gestureをキャンセルしてpinchへ置換する", () => {
  const { stage, handlers } = createStage();
  const { controller, onMoveNodeRef, onViewportChangeRef } = createController();
  controller.bind(stage as never);
  controller.createNodePointerDownHandler()(1, pointer(100, 100, {
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
単一gestureのcancel callbackから新しいpinchが同期的に開始された場合は、その新pinchを同じcancel処理で破棄しないことも検証する。

- [ ] **Step 2: touch調停テストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/stageInteractions.test.ts src/components/map/__tests__/useMapStageInteractions.test.tsx`

Expected: FAIL because pinch state and controller methods do not exist.

- [ ] **Step 3: touch pointerとpinch pairを専用coordinatorで管理する**

touch sample、固定pinch pair、pinch終了後の抑止状態は`createTouchGestureCoordinator`に閉じ込める。`stageInteractions`はpointerイベントを正規化して委譲する。

```ts
const pointerGestures = createPointerGestureSession();
const touchGestures = createTouchGestureCoordinator({
  viewportRef,
  onViewportChangeRef,
  onBeforePinch: () => {
    const bindingBeforeCancel = activeBinding;
    if (bindingBeforeCancel === null) return false;
    pointerGestures.cancel();
    return activeBinding === bindingBeforeCancel && !pointerGestures.hasActive();
  },
});
```

nodeとblankのpointer downで`touchGestures.pointerDown(sample)`を呼ぶ。同じpointer IDのstage bubbleはcoordinator内で再登録せず、2本目で`onBeforePinch`を通じて単一gestureをキャンセルし、pinchを作る。pinch中はtouchの追加だけでなくmouse／penのpointer downも処理済みとして返し、通常gestureを並行開始しない。3本目以降は通常gestureを開始しない。

`onBeforePinch`のcancel callbackから同じtouch IDを解放・再登録して新しいpinchが同期的に開始された場合、外側の開始処理はcallback後の`activePinch`を再検証し、再入側のpinchを上書きしない。

move/up/upoutside/pointercancelもそれぞれ`pointerMove`/`pointerUp`へ委譲する。固定pairの片方が終わった後のpinch抑止と、全touch解除後の復帰はcoordinatorが担う。

- [ ] **Step 4: controllerのキャンセルと照会を公開する**

```ts
const cancelAllInteractions = () => {
  touchGestures.cancel();
  pointerGestures.cancel();
};

const hasActiveGesture = () => pointerGestures.hasActive() || touchGestures.hasActivePinch();

return {
  bind,
  createNodePointerDownHandler,
  cancelActiveGesture: cancelAllInteractions,
  hasActiveGesture,
};
```

外部キャンセルは開始時点のpinchをpointer gestureより先に終了する。これによりpointer gestureのcancel callbackが再入して新しいpinchを作っても、同じcancel処理で破棄しない。unbindは、対象bindingの所有を解除した後、`touchGestures.reset()`、stage listener解除、`pointerGestures.cancel()`の順で実行する。touch resetは再入可能なpointer gestureのcancelより先に行い、cancel callbackから作られた新bindingのtouchと旧pointerを混在させない。各cleanupは一つが例外を投げても残りを試行し、最初の例外を再送出する。Hookはcontroller methodをそのまま公開する。

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
- Create: `client/src/components/map/viewportFocusShortcut.ts`
- Create: `client/src/components/map/__tests__/viewportFocusShortcut.test.ts`
- Create: `client/src/components/map/useMapViewportShortcut.ts`
- Create: `client/src/components/map/__tests__/useMapViewportShortcut.test.tsx`

**Interfaces:**
- Consumes: nodes、selectedNodeId、editing状態、screen、`hasActiveGesture`、`onFocusNode`
- `viewportFocusShortcut.ts` Produces: shortcut判定、実効contenteditable判定、focus request解決
- `useMapViewportShortcut.ts` Produces: 最新入力をRefから読む安定した`F` keydown listener

- [ ] **Step 1: 成功・無効化・cleanupの失敗テストを書く**

```tsx
import { renderHook } from "@testing-library/react";
import { useMapViewportShortcut } from "@/components/map/useMapViewportShortcut";
import { resolveViewportFocusRequest } from "@/components/map/viewportFocusShortcut";

const node = { id: 1, parentId: null, x: 100, y: 50, width: 80, height: 40, label: "" };

function resolveFocusRequest(target: EventTarget) {
  return resolveViewportFocusRequest({
    key: "f",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target,
    nodes: [node],
    selectedNodeId: 1,
    isEditing: false,
    hasActiveGesture: false,
    screen: { width: 800, height: 600 },
  });
}

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

it.each(["", "plaintext-only"])("contenteditable=%s配下のFキーを無視する", (value) => {
  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", value);
  const target = editor.appendChild(document.createElement("span"));

  expect(resolveFocusRequest(target)).toBeNull();
});

it("contenteditable=true配下でもfalseで上書きされた領域では発動する", () => {
  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", "true");
  const disabledArea = editor.appendChild(document.createElement("div"));
  disabledArea.setAttribute("contenteditable", "false");
  const target = disabledArea.appendChild(document.createElement("span"));

  expect(resolveFocusRequest(target))
    .toEqual({ node, screen: { width: 800, height: 600 } });
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

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/viewportFocusShortcut.test.ts src/components/map/__tests__/useMapViewportShortcut.test.tsx`

Expected: FAIL with `Cannot find module '@/components/map/useMapViewportShortcut'`.

- [ ] **Step 3: 編集可能要素判定とkeydown lifecycleを分離して実装する**

```ts
// viewportFocusShortcut.ts
const parseContentEditable = (value: string): boolean | null => {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === "false") return false;
  if (
    normalizedValue === ""
    || normalizedValue === "true"
    || normalizedValue === "plaintext-only"
  ) return true;
  return null;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("input, textarea, select")) return true;

  let element: HTMLElement | null = target;
  while (element) {
    const contentEditable = element.getAttribute("contenteditable");
    if (contentEditable !== null) {
      const parsedValue = parseContentEditable(contentEditable);
      if (parsedValue !== null) return parsedValue;
    }
    element = element.parentElement;
  }
  return false;
};
```

`resolveViewportFocusRequest`はshortcut、編集中、上記の実効的な編集可否、gesture、screen、選択ノードを検証する。Hookは可変な入力をRefへ同期し、listenerを再登録せずresolver結果だけを配送する。

```ts
// useMapViewportShortcut.ts
const latestOptionsRef = useRef({
  nodes,
  selectedNodeId,
  isEditing,
  screen,
  hasActiveGesture,
  onFocusNode,
});
useLayoutEffect(() => {
  latestOptionsRef.current = {
    nodes,
    selectedNodeId,
    isEditing,
    screen,
    hasActiveGesture,
    onFocusNode,
  };
}, [nodes, selectedNodeId, isEditing, screen, hasActiveGesture, onFocusNode]);

useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isViewportFocusShortcut(event)) return;
    const latest = latestOptionsRef.current;
    const request = resolveViewportFocusRequest({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      target: event.target,
      nodes: latest.nodes,
      selectedNodeId: latest.selectedNodeId,
      isEditing: latest.isEditing,
      hasActiveGesture: latest.hasActiveGesture(),
      screen: latest.screen,
    });
    if (!request) return;
    event.preventDefault();
    latest.onFocusNode(request.node, request.screen);
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, []);
```

- [ ] **Step 4: shortcutテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/useMapViewportShortcut.test.tsx`

Expected: PASS.

- [ ] **Step 5: shortcut Hookをコミットする**

```bash
git add client/src/components/map/viewportFocusShortcut.ts client/src/components/map/__tests__/viewportFocusShortcut.test.ts client/src/components/map/useMapViewportShortcut.ts client/src/components/map/__tests__/useMapViewportShortcut.test.tsx
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

実際の`useMapViewport`を通してwheel後のworld container倍率と`F`後のoffsetを確認する。scene再生成とviewport更新を同じcommitで発生させ、新しいworld containerのtransform setterが各1回だけ呼ばれることも確認する。

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
  createNodePointerDownHandler,
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

scene描画effect内で`createNodePointerDownHandler()`を呼び、その時点のbinding lease付きhandlerを`renderMapScene`へ渡す。

```tsx
const onNodePointerDown = createNodePointerDownHandler();
renderMapScene(runtime.app, runtime.constructors, {
  // ...scene options
  onNodePointerDown,
});
```

`renderMapScene`が新しいworld containerへ適用したviewportをRefに記録する。viewport専用effectは記録済みと同じviewportを再適用せず、scene再生成とviewport更新が同じcommitに含まれてもtransform setterを重複させない。

`usePixiApplication`で作成したcanvasへ`style.touchAction = "none"`を設定する。

- [ ] **Step 4: 操作案内のテストと表示を更新する**

期待文言を次へ更新する。

```text
空白ダブルクリックで追加・ノードダブルクリックで編集・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続
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
