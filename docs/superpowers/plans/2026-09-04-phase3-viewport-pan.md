# Phase 3 ビューポート基盤・パン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Historical plan:** この文書は実装時の手順記録である。実装後の単一責任リファクタリングにより、pointerの正規化は`pointerSample.ts`、単一pointer gestureの所有権は`pointerGestureSession.ts`、touch調停は`touchGestureCoordinator.ts`へ分離された。Task 5の責任記述は現行構成に合わせて更新している。

**Goal:** マップ座標と画面座標を分離し、既存のノード操作を維持したまま空白ドラッグでキャンバスをパンできるようにする。

**Architecture:** Reactの`useMapViewport`が表示専用のviewportと同期Refを所有し、`pointerSample`がPixiイベントを画面座標とワールド座標へ正規化する。`stageInteractions`はgesture専用オブジェクトへ入力を委譲する。Pixi stageは画面上のイベント面として固定し、変換を適用した`worldContainer`配下へエッジとノードを描画する。

**Tech Stack:** TypeScript、React 19、Next.js 16、PixiJS 8、Jest、Testing Library

**Spec:** `docs/superpowers/specs/2026-09-04-phase3-viewport-navigation-design.md`

## Global Constraints

- 新しい外部ライブラリは追加しない。
- `Node.x`と`Node.y`はワールド座標のまま維持する。
- 初期viewportは`{ offsetX: 0, offsetY: 0, scale: 1 }`とする。
- 空白の左ドラッグだけがパンを開始し、4px未満の移動は無視する。
- 通常のノード移動、`Shift`+ドラッグ接続、空白ダブルクリック追加、ノード編集を維持する。
- Reactの保留レンダー、Pixi runtime再生成、イベント再利用で未確定値を操作へ漏らさない。
- runtime切替、`pointerupoutside`、`pointercancel`、unbindでgestureを一度だけキャンセルする。
- ロードマップはこの実装PRへ含めず、マージ後処理で更新する。
- 各TaskのRED確認後に最小実装を行い、Task単位でコミットする。

---

### Task 1: ビューポート座標モデル

**Files:**
- Create: `client/src/components/map/mapViewport.ts`
- Create: `client/src/components/map/__tests__/mapViewport.test.ts`

**Interfaces:**
- Consumes: `Point` from `client/src/components/map/mapGeometry.ts`
- Produces: `Viewport`, `INITIAL_VIEWPORT`, `MIN_VIEWPORT_SCALE`, `MAX_VIEWPORT_SCALE`, `isValidViewport`, `worldToScreen`, `screenToWorld`, `panViewport`

- [ ] **Step 1: 座標変換とパン計算の失敗テストを書く**

```ts
import {
  INITIAL_VIEWPORT,
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  isValidViewport,
  panViewport,
  screenToWorld,
  worldToScreen,
} from "@/components/map/mapViewport";

describe("map viewport", () => {
  it("初期viewportではワールド座標と画面座標が一致する", () => {
    expect(worldToScreen({ x: 25, y: 40 }, INITIAL_VIEWPORT)).toEqual({ x: 25, y: 40 });
    expect(screenToWorld({ x: 25, y: 40 }, INITIAL_VIEWPORT)).toEqual({ x: 25, y: 40 });
  });

  it("offsetと倍率を含む座標を相互変換する", () => {
    const viewport = { offsetX: 40, offsetY: -20, scale: 2 };
    const world = { x: 30, y: 25 };

    const screen = worldToScreen(world, viewport);

    expect(screen).toEqual({ x: 100, y: 30 });
    expect(screenToWorld(screen, viewport)).toEqual(world);
  });

  it("入力を変更せず画面差分だけoffsetを移動する", () => {
    const viewport = { offsetX: 10, offsetY: 20, scale: 2 };

    expect(panViewport(viewport, 15, -5)).toEqual({ offsetX: 25, offsetY: 15, scale: 2 });
    expect(viewport).toEqual({ offsetX: 10, offsetY: 20, scale: 2 });
  });

  it.each([
    [{ offsetX: Number.NaN, offsetY: 0, scale: 1 }],
    [{ offsetX: 0, offsetY: Number.POSITIVE_INFINITY, scale: 1 }],
    [{ offsetX: 0, offsetY: 0, scale: 0 }],
    [{ offsetX: 0, offsetY: 0, scale: MIN_VIEWPORT_SCALE - 0.01 }],
    [{ offsetX: 0, offsetY: 0, scale: MAX_VIEWPORT_SCALE + 0.01 }],
  ])("無効なviewportを拒否する", (viewport) => {
    expect(isValidViewport(viewport)).toBe(false);
  });

  it("無効なパン差分では元のviewportを返す", () => {
    expect(panViewport(INITIAL_VIEWPORT, Number.NaN, 1)).toBe(INITIAL_VIEWPORT);
  });

  it("有限値同士の加算がoverflowするパンでは元のviewportを返す", () => {
    const nearLimit = { ...INITIAL_VIEWPORT, offsetX: Number.MAX_VALUE };

    expect(panViewport(nearLimit, Number.MAX_VALUE, 0)).toBe(nearLimit);
  });
});
```

- [ ] **Step 2: 座標モデルのテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/mapViewport.test.ts`

Expected: FAIL with `Cannot find module '@/components/map/mapViewport'`.

- [ ] **Step 3: 純粋な座標関数を実装する**

```ts
import type { Point } from "@/components/map/mapGeometry";

export type Viewport = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export const INITIAL_VIEWPORT: Viewport = { offsetX: 0, offsetY: 0, scale: 1 };
export const MIN_VIEWPORT_SCALE = 0.25;
export const MAX_VIEWPORT_SCALE = 4;

export function isValidViewport(viewport: Viewport): boolean {
  return Number.isFinite(viewport.offsetX)
    && Number.isFinite(viewport.offsetY)
    && Number.isFinite(viewport.scale)
    && viewport.scale >= MIN_VIEWPORT_SCALE
    && viewport.scale <= MAX_VIEWPORT_SCALE;
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.scale + viewport.offsetX,
    y: point.y * viewport.scale + viewport.offsetY,
  };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  };
}

export function panViewport(viewport: Viewport, dx: number, dy: number): Viewport {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !isValidViewport(viewport)) {
    return viewport;
  }
  const candidate = {
    ...viewport,
    offsetX: viewport.offsetX + dx,
    offsetY: viewport.offsetY + dy,
  };
  return isValidViewport(candidate) ? candidate : viewport;
}
```

- [ ] **Step 4: 座標モデルのテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/mapViewport.test.ts`

Expected: PASS.

- [ ] **Step 5: 座標モデルをコミットする**

```bash
git add client/src/components/map/mapViewport.ts client/src/components/map/__tests__/mapViewport.test.ts
git commit -m "feat(map): ビューポート座標変換を追加"
```

---

### Task 2: Pixi非依存のポインターgesture契約

**Files:**
- Modify: `client/src/components/map/pixi/pointerGesture.ts`
- Modify: `client/src/components/map/pixi/nodeMoveGesture.ts`
- Modify: `client/src/components/map/pixi/nodeConnectionGesture.ts`
- Modify: `client/src/components/map/pixi/__tests__/nodeMoveGesture.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts`

**Interfaces:**
- Consumes: `Point` from `mapGeometry.ts`
- Produces: `PointerSample`; `PointerGesture.move(sample)` and `PointerGesture.end(sample)`

- [ ] **Step 1: gestureテストのpointer fixtureを画面・ワールド座標へ分ける**

両テストのfixtureを次の形式へ変更し、移動テストへ画面差分4px・ワールド差分2pxのケースを加える。

```ts
const pointer = (
  screenX: number,
  screenY: number,
  worldX = screenX,
  worldY = screenY,
) => ({
  pointerId: 1,
  pointerType: "mouse",
  screen: { x: screenX, y: screenY },
  world: { x: worldX, y: worldY },
});

it("画面ピクセルで閾値を判定しワールド差分で移動する", () => {
  const onMoveNode = jest.fn();
  const gesture = createNodeMoveGesture({
    nodeId: 1,
    startSample: pointer(100, 60, 50, 30),
    nodesRef: { current: [node] },
    onMoveNodeRef: { current: onMoveNode },
    dragThreshold: 4,
  });

  gesture?.move(pointer(104, 64, 52, 32));

  expect(onMoveNode).toHaveBeenCalledWith(1, node.x + 2, node.y + 2);
});
```

接続テストではターゲットのワールド座標と異なる画面座標を渡す。

```ts
gesture?.move(pointer(440, 120, 220, 60));
expect(onConnectionTargetChangeRef.current).toHaveBeenCalledWith(2);
```

- [ ] **Step 2: 旧gesture APIによりテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/nodeMoveGesture.test.ts src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts`

Expected: FAIL because `startSample` and `PointerSample` are not implemented.

- [ ] **Step 3: `PointerSample`を定義してgestureからPixi型を除去する**

```ts
import type { Point } from "@/components/map/mapGeometry";

export type LatestValue<T> = { readonly current: T };

export type PointerSample = {
  pointerId: number;
  pointerType: string;
  screen: Point;
  world: Point;
};

export type PointerGesture = {
  move: (sample: PointerSample) => void;
  end: (sample: PointerSample) => void;
  cancel: () => void;
};
```

`nodeMoveGesture.ts`は開始値をコピーし、閾値と移動差分を分離する。

```ts
const startScreen = { ...startSample.screen };
const startWorld = { ...startSample.world };

move(sample) {
  if (!active) return;
  const screenDx = sample.screen.x - startScreen.x;
  const screenDy = sample.screen.y - startScreen.y;
  if (!dragging) {
    if (Math.abs(screenDx) < dragThreshold && Math.abs(screenDy) < dragThreshold) return;
    dragging = true;
  }
  onMoveNodeRef.current(
    nodeId,
    node.x + sample.world.x - startWorld.x,
    node.y + sample.world.y - startWorld.y,
  );
}
```

`nodeConnectionGesture.ts`の候補判定は`sample.world`だけを使う。

```ts
const findTargetId = (sample: PointerSample) => {
  const target = findNodeAtPoint(nodesRef.current, sample.world);
  return target && canConnectNodes(nodesRef.current, sourceNodeId, target.id)
    ? target.id
    : null;
};
```

- [ ] **Step 4: gesture単体テストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/nodeMoveGesture.test.ts src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts`

Expected: PASS.

- [ ] **Step 5: gesture契約変更をコミットする**

```bash
git add client/src/components/map/pixi/pointerGesture.ts client/src/components/map/pixi/nodeMoveGesture.ts client/src/components/map/pixi/nodeConnectionGesture.ts client/src/components/map/pixi/__tests__/nodeMoveGesture.test.ts client/src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts
git commit -m "refactor(map): ポインター座標を入力境界で分離"
```

---

### Task 3: ビューポート状態Hook

**Files:**
- Create: `client/src/components/map/useMapViewport.ts`
- Create: `client/src/components/map/__tests__/useMapViewport.test.tsx`

**Interfaces:**
- Consumes: `Viewport`, `INITIAL_VIEWPORT`, `isValidViewport`, `panViewport`
- Produces: `viewport`, `viewportRef`, `setViewport`, `panBy`

- [ ] **Step 1: 同期Ref、連続更新、callback安定性の失敗テストを書く**

```tsx
import { startTransition } from "react";
import { flushSync } from "react-dom";
import { act, renderHook } from "@testing-library/react";
import { useMapViewport } from "@/components/map/useMapViewport";

describe("useMapViewport", () => {
  it("同一batchのパンを直前のviewportへ蓄積する", () => {
    const { result } = renderHook(() => useMapViewport());

    act(() => {
      result.current.panBy(10, 20);
      result.current.panBy(-3, 4);
    });

    expect(result.current.viewport).toEqual({ offsetX: 7, offsetY: 24, scale: 1 });
    expect(result.current.viewportRef.current).toEqual(result.current.viewport);
  });

  it("絶対viewportを同期的に反映し無効値を拒否する", () => {
    const { result } = renderHook(() => useMapViewport());
    const next = { offsetX: 50, offsetY: -10, scale: 1 };

    act(() => {
      result.current.setViewport(next);
      result.current.setViewport({ offsetX: Number.NaN, offsetY: 0, scale: 1 });
    });

    expect(result.current.viewport).toEqual(next);
  });

  it("更新後もcommand参照を維持する", () => {
    const { result } = renderHook(() => useMapViewport());
    const initial = {
      setViewport: result.current.setViewport,
      panBy: result.current.panBy,
    };

    act(() => result.current.panBy(1, 2));

    expect(result.current.setViewport).toBe(initial.setViewport);
    expect(result.current.panBy).toBe(initial.panBy);
  });

  it("保留中と緊急のパン更新を同じ同期Refへ蓄積する", () => {
    const { result } = renderHook(() => useMapViewport());

    act(() => {
      startTransition(() => result.current.panBy(10, 0));
      flushSync(() => result.current.panBy(0, 20));
    });

    expect(result.current.viewport).toEqual({ offsetX: 10, offsetY: 20, scale: 1 });
    expect(result.current.viewportRef.current).toEqual(result.current.viewport);
  });
});
```

- [ ] **Step 2: HookテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/useMapViewport.test.tsx`

Expected: FAIL with `Cannot find module '@/components/map/useMapViewport'`.

- [ ] **Step 3: 同期Refを所有するHookを実装する**

```ts
import { useCallback, useRef, useState } from "react";
import {
  INITIAL_VIEWPORT,
  isValidViewport,
  panViewport,
  type Viewport,
} from "@/components/map/mapViewport";

export function useMapViewport() {
  const [viewport, setViewportState] = useState<Viewport>(INITIAL_VIEWPORT);
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);

  const setViewport = useCallback((next: Viewport) => {
    if (!isValidViewport(next)) return;
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const next = panViewport(viewportRef.current, dx, dy);
    if (next !== viewportRef.current) setViewport(next);
  }, [setViewport]);

  return { viewport, viewportRef, setViewport, panBy };
}
```

- [ ] **Step 4: HookテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/useMapViewport.test.tsx`

Expected: PASS.

- [ ] **Step 5: Hookをコミットする**

```bash
git add client/src/components/map/useMapViewport.ts client/src/components/map/__tests__/useMapViewport.test.tsx
git commit -m "feat(map): ビューポート状態管理を追加"
```

---

### Task 4: 空白ドラッグのパンgesture

**Files:**
- Create: `client/src/components/map/pixi/canvasPanGesture.ts`
- Create: `client/src/components/map/pixi/__tests__/canvasPanGesture.test.ts`

**Interfaces:**
- Consumes: `PointerSample`, `LatestValue`, `Viewport`, `panViewport`
- Produces: `createCanvasPanGesture(options): PointerGesture`

- [ ] **Step 1: 閾値、総差分、終了状態の失敗テストを書く**

```ts
import { createCanvasPanGesture } from "@/components/map/pixi/canvasPanGesture";

const sample = (x: number, y: number) => ({
  pointerId: 1,
  pointerType: "mouse",
  screen: { x, y },
  world: { x, y },
});

describe("createCanvasPanGesture", () => {
  it("4px未満ではviewportを変更しない", () => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createCanvasPanGesture({
      startSample: sample(100, 50),
      startViewport: { offsetX: 10, offsetY: 20, scale: 1 },
      onViewportChangeRef,
      dragThreshold: 4,
    });

    gesture.move(sample(103, 53));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });

  it("開始viewportへ開始点からの総差分を適用する", () => {
    const onViewportChange = jest.fn();
    const gesture = createCanvasPanGesture({
      startSample: sample(100, 50),
      startViewport: { offsetX: 10, offsetY: 20, scale: 2 },
      onViewportChangeRef: { current: onViewportChange },
      dragThreshold: 4,
    });

    gesture.move(sample(104, 51));
    gesture.move(sample(110, 60));

    expect(onViewportChange.mock.calls).toEqual([
      [{ offsetX: 14, offsetY: 21, scale: 2 }],
      [{ offsetX: 20, offsetY: 30, scale: 2 }],
    ]);
  });

  it.each(["end", "cancel"] as const)("%s後のmoveを無視する", (finish) => {
    const onViewportChangeRef = { current: jest.fn() };
    const gesture = createCanvasPanGesture({
      startSample: sample(0, 0),
      startViewport: { offsetX: 0, offsetY: 0, scale: 1 },
      onViewportChangeRef,
      dragThreshold: 4,
    });

    if (finish === "end") gesture.end(sample(0, 0));
    else gesture.cancel();
    gesture.move(sample(10, 10));

    expect(onViewportChangeRef.current).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: パンgestureテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/canvasPanGesture.test.ts`

Expected: FAIL with `Cannot find module '@/components/map/pixi/canvasPanGesture'`.

- [ ] **Step 3: パンgestureを実装する**

```ts
import { panViewport, type Viewport } from "@/components/map/mapViewport";
import type {
  LatestValue,
  PointerGesture,
  PointerSample,
} from "@/components/map/pixi/pointerGesture";

type CanvasPanGestureOptions = {
  startSample: PointerSample;
  startViewport: Viewport;
  onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
  dragThreshold: number;
};

export function createCanvasPanGesture({
  startSample,
  startViewport,
  onViewportChangeRef,
  dragThreshold,
}: CanvasPanGestureOptions): PointerGesture {
  const startScreen = { ...startSample.screen };
  let active = true;
  let dragging = false;
  const finish = () => { active = false; };

  return {
    move(sample) {
      if (!active) return;
      const dx = sample.screen.x - startScreen.x;
      const dy = sample.screen.y - startScreen.y;
      if (!dragging) {
        if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
        dragging = true;
      }
      const viewport = panViewport(startViewport, dx, dy);
      if ((dx !== 0 || dy !== 0) && viewport === startViewport) return;
      onViewportChangeRef.current(viewport);
    },
    end: finish,
    cancel: finish,
  };
}
```

- [ ] **Step 4: パンgestureテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/canvasPanGesture.test.ts`

Expected: PASS.

加算がoverflowして`panViewport`が開始viewport参照を返した場合はcallbackを呼ばず、直前の有効なパン結果を開始位置へ巻き戻さない。開始後にpointerが開始点へ戻ったゼロ差分では開始viewportを通知し、正当な復帰操作を反映する。

- [ ] **Step 5: パンgestureをコミットする**

```bash
git add client/src/components/map/pixi/canvasPanGesture.ts client/src/components/map/pixi/__tests__/canvasPanGesture.test.ts
git commit -m "feat(map): 空白ドラッグのパン操作を追加"
```

---

### Task 5: stageイベントへのパン統合

> **現行責務の参照:** Step 3以降の`pointerGestureSession`への委譲は、後続の`2026-09-08-phase3-srp-refactor.md`で導入された現行構成を示す。このTaskの当初の実装順で新規作成するファイルではない。

**Files:**
- Modify: `client/src/components/map/pixi/stageInteractions.ts`
- Modify: `client/src/components/map/useMapStageInteractions.ts`
- Modify: `client/src/components/map/pixi/__tests__/stageInteractions.test.ts`
- Modify: `client/src/components/map/__tests__/useMapStageInteractions.test.tsx`

**Interfaces:**
- Consumes: `viewportRef: LatestValue<Viewport>` and `onViewportChange: (viewport: Viewport) => void`
- Produces: 正規化済みpointerを使うパン・移動・接続調停、`pointercancel` cleanup

- [ ] **Step 1: stage境界のパンと座標変換テストを書く**

既存の位置引数fixtureを、以降のtouch拡張でも使えるoptions形式へ置換する。既存呼び出しも同じ意味になるよう更新する。

```ts
type PointerEvent = {
  globalX: number;
  globalY: number;
  pointerId: number;
  pointerType: string;
  composedPath: () => unknown[];
  target?: unknown;
  shiftKey?: boolean;
  button: number;
};

type PointerOptions = {
  target?: unknown;
  shiftKey?: boolean;
  pointerId?: number;
  pointerType?: string;
  path?: unknown[];
  button?: number;
};

function pointer(
  globalX: number,
  globalY: number,
  options: PointerOptions = {},
): PointerEvent {
  const eventPath = options.path
    ?? (boundStageForPointer === null ? [] : [boundStageForPointer]);
  return {
    globalX,
    globalY,
    pointerId: options.pointerId ?? 1,
    pointerType: options.pointerType ?? "mouse",
    target: options.target,
    shiftKey: options.shiftKey ?? false,
    button: options.button ?? 0,
    composedPath: () => eventPath,
  };
}
```

pointerdownは空白とノードのどちらもprimary button（`button === 0`）だけが開始できることを固定する。一方、開始済みgestureの`pointerup`／`pointerupoutside`は所有pointer IDで判定し、解放時の`button`値に依存せず終了する。

```ts
it.each([1, 2])("button %sでは空白選択解除やパンを開始しない", (button) => {
  const { stage, handlers } = createStage();
  const { controller, onSelectNodeRef, onViewportChangeRef } = createController();
  controller.bind(stage as never);

  handlers.pointerdown?.(pointer(0, 0, { target: stage, button }));
  handlers.pointermove?.(pointer(20, 20, { button }));
  expect(onSelectNodeRef.current).not.toHaveBeenCalled();
  expect(onViewportChangeRef.current).not.toHaveBeenCalled();
});

it.each([1, 2])("button %sではノード選択や移動を開始しない", (button) => {
  const { stage, handlers } = createStage();
  const { controller, onSelectNodeRef, onMoveNodeRef } = createController();
  controller.bind(stage as never);

  controller.createNodePointerDownHandler()(1, pointer(50, 50, { button }) as never);
  handlers.pointermove?.(pointer(70, 70, { button }));
  expect(onSelectNodeRef.current).not.toHaveBeenCalled();
  expect(onMoveNodeRef.current).not.toHaveBeenCalled();
});

it.each(["pointerup", "pointerupoutside"] as const)(
  "解放buttonに関係なく所有pointerの%sでgestureを終了する",
  (eventName) => {
    const { stage, handlers } = createStage();
    const { controller, onMoveNodeRef } = createController();
    controller.bind(stage as never);

    controller.createNodePointerDownHandler()(1, pointer(100, 60) as never);
    handlers[eventName]?.(pointer(100, 60, { button: 2 }));
    handlers.pointermove?.(pointer(110, 70));
    expect(onMoveNodeRef.current).not.toHaveBeenCalled();
  },
);
```

`createStage`のhandler mapへ`pointercancel`を追加する。

```ts
type StageEvent = "pointerdown" | "pointermove" | "pointerup" | "pointerupoutside" | "pointercancel";
const handlers: Partial<Record<StageEvent, Handler>> = {};
```

`createController`でviewport用Refを作り、既存のcontroller生成とreturnを次の内容へ置換する。

```ts
// `overrides`の型へ`viewport: Viewport`を追加する。
const viewportRef = {
  current: overrides.viewport ?? INITIAL_VIEWPORT,
};
const onViewportChangeRef = { current: jest.fn() };

const controller = createStageInteractions({
  nodesRef,
  viewportRef,
  onSelectNodeRef,
  onMoveNodeRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
  onViewportChangeRef,
  dragThreshold: overrides.dragThreshold,
});

return {
  controller,
  nodesRef,
  viewportRef,
  onSelectNodeRef,
  onMoveNodeRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
  onViewportChangeRef,
};
```

次のケースを`stageInteractions.test.ts`へ追加する。

```ts
it("空白ドラッグを画面差分のviewport変更へ変換する", () => {
  const { stage, handlers } = createStage();
  const { controller, onSelectNodeRef, onViewportChangeRef } = createController({
    viewport: { offsetX: 40, offsetY: 20, scale: 2 },
  });
  controller.bind(stage as never);

  handlers.pointerdown?.(pointer(100, 80, { target: stage }));
  handlers.pointermove?.(pointer(110, 90));

  expect(onSelectNodeRef.current).toHaveBeenCalledWith(null);
  expect(onViewportChangeRef.current).toHaveBeenCalledWith({
    offsetX: 50,
    offsetY: 30,
    scale: 2,
  });
});

it("非等倍viewportでノードをワールド差分だけ移動する", () => {
  const { stage, handlers } = createStage();
  const { controller, onMoveNodeRef } = createController({
    viewport: { offsetX: 40, offsetY: 20, scale: 2 },
  });
  controller.bind(stage as never);

  controller.createNodePointerDownHandler()(1, pointer(80, 60, { path: [stage] }) as never);
  handlers.pointermove?.(pointer(100, 80));

  expect(onMoveNodeRef.current).toHaveBeenCalledWith(1, 30, 50);
});

it("非等倍viewportで接続先をワールド座標から判定する", () => {
  const { stage, handlers } = createStage();
  const { controller, onConnectionTargetChangeRef, onConnectNodesRef } = createController({
    nodes: [node, targetNode],
    viewport: { offsetX: 40, offsetY: 20, scale: 2 },
  });
  controller.bind(stage as never);

  controller.createNodePointerDownHandler()(1, pointer(80, 100, {
    shiftKey: true,
    path: [stage],
  }) as never);
  handlers.pointermove?.(pointer(480, 140));
  handlers.pointerup?.(pointer(480, 140));

  expect(onConnectionTargetChangeRef.current).toHaveBeenCalledWith(2);
  expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
});

it("pointercancelで所有中のパンを停止する", () => {
  const { stage, handlers } = createStage();
  const { controller, onViewportChangeRef } = createController();
  controller.bind(stage as never);
  handlers.pointerdown?.(pointer(0, 0, { target: stage }));

  handlers.pointercancel?.(pointer(0, 0));
  handlers.pointermove?.(pointer(20, 20));

  expect(onViewportChangeRef.current).not.toHaveBeenCalled();
});
```

Hookテストでは`viewportRef`と`onViewportChange`を渡し、stageへの登録回数を5イベントへ更新する。

- [ ] **Step 2: stage境界テストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/stageInteractions.test.ts src/components/map/__tests__/useMapStageInteractions.test.tsx`

Expected: FAIL because viewport options, blank pan, and `pointercancel` are not wired.

- [ ] **Step 3: Pixiイベントを正規化し、gesture所有権をsessionへ委譲する**

`StageInteractionOptions`へ次を追加する。

```ts
viewportRef: LatestValue<Viewport>;
onViewportChangeRef: LatestValue<(viewport: Viewport) => void>;
```

座標変換と有限値検証は`pointerSample.ts`に集約し、`stageInteractions`は有効なsampleだけを調停する。

```ts
const sample = toPointerSample(event, viewportRef.current);
if (!hasFinitePointerCoordinates(sample)) return;
```

node gestureには`startEvent`ではなく`startSample`を渡し、move/upでは受信時点のsampleを渡す。単一pointer gestureの開始・所有判定・終了・キャンセルは`createPointerGestureSession()`が担う。

- [ ] **Step 4: 空白pointer downからパンgestureを開始する**

再入で作られた新gestureを古いblank処理が壊さないよう、開始時のbindingとsessionのlease identityを比較する。

```ts
const handleStagePointerDown = (event: FederatedPointerEvent) => {
  if (activeBinding !== binding || event.target !== stage || event.button !== 0) return;
  const sample = toPointerSample(event, viewportRef.current);
  if (!hasFinitePointerCoordinates(sample)) return;

  const gestureAtEntry = pointerGestures.current();
  if (gestureAtEntry !== null && event.pointerId !== gestureAtEntry.pointerId) return;
  try {
    onSelectNodeRef.current(null);
  } finally {
    if (activeBinding === binding && pointerGestures.current() === gestureAtEntry) {
      pointerGestures.cancel();
    }
  }
  if (activeBinding !== binding || pointerGestures.hasActive()) return;

  const gesture = createCanvasPanGesture({
    startSample: sample,
    startViewport: viewportRef.current,
    onViewportChangeRef,
    dragThreshold,
  });
  if (gesture) pointerGestures.start(sample.pointerId, gesture);
};
```

`pointercancel`は所有pointerの場合だけ`pointerGestures.cancel()`を呼ぶ。bindとcleanupへ`on`/`off`を対称に追加する。

- [ ] **Step 5: Hookから最新viewport callbackを配線する**

`UseMapStageInteractionsOptions`へ`viewportRef`と`onViewportChange`を加え、既存callbackと同じ`useLayoutEffect`で最新Refを更新する。

```ts
const onViewportChangeRef = useRef(onViewportChange);
useLayoutEffect(() => {
  onViewportChangeRef.current = onViewportChange;
}, [onViewportChange]);
```

controller生成時に`viewportRef`と`onViewportChangeRef`を渡す。runtimeのeffect依存へviewport値自体を追加せず、パンのたびにstageを再bindしない。

- [ ] **Step 6: stage境界テストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/stageInteractions.test.ts src/components/map/__tests__/useMapStageInteractions.test.tsx src/components/map/pixi/__tests__/nodeMoveGesture.test.ts src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts`

Expected: PASS.

- [ ] **Step 7: stage統合をコミットする**

```bash
git add client/src/components/map/pixi/stageInteractions.ts client/src/components/map/useMapStageInteractions.ts client/src/components/map/pixi/__tests__/stageInteractions.test.ts client/src/components/map/__tests__/useMapStageInteractions.test.tsx
git commit -m "feat(map): ステージ操作へパンを統合"
```

---

### Task 6: ワールド描画コンテナ

**Files:**
- Modify: `client/src/components/map/pixi/renderMapScene.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapScene.test.ts`
- Modify: `client/src/components/map/pixi/testing/pixiTestHarness.ts`

**Interfaces:**
- Consumes: `viewport: Viewport`
- Produces: viewport変換済み`worldContainer`へエッジとノードを描画する`renderMapScene`

- [ ] **Step 1: worldContainer変換の失敗テストを書く**

Pixi fixtureのContainerへ`position.set`と`scale.set` spyを追加し、生成instanceを`containers`へ保存する。

```ts
const containers: Array<{
  addChild: jest.Mock;
  position: { set: jest.Mock };
  scale: { set: jest.Mock };
}> = [];

const Container = jest.fn().mockImplementation(() => {
  const handlers: Record<string, PointerHandler> = {};
  const container = {
    addChild: jest.fn(),
    position: { set: jest.fn() },
    scale: { set: jest.fn() },
    on: jest.fn((event: string, handler: PointerHandler) => {
      handlers[event] = handler;
    }),
    eventMode: "none",
    cursor: "default",
    destroy: jest.fn(),
  };
  containers.push(container);
  containerHandlers.push(handlers);
  return container;
});
```

Harnessの戻り値へ`containers`を追加する。既存テストは、stageの直下ではなく最初のContainerであるworldへエッジ、ノード1、ノード2の順で追加される期待へ変更する。空ノードでも変換済みの空worldがstageへ1つ追加される期待へ変更する。

```ts
it("前の描画を破棄してworld内へエッジをノードより先に追加する", () => {
  const harness = createPixiTestHarness();
  const previousChild = { destroy: jest.fn() };
  harness.children.push(previousChild);

  renderMapScene(harness.app as never, harness.constructors as never, {
    nodes,
    selectedNodeId: null,
    editingNodeId: null,
    connectionTargetNodeId: null,
    onNodePointerDown: jest.fn(),
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
  });

  const world = harness.containers[0];
  expect(previousChild.destroy).toHaveBeenCalledWith({ children: true, context: true });
  expect(harness.stage.addChild).toHaveBeenCalledWith(world);
  expect(world.addChild.mock.calls.map(([child]) => child)).toEqual([
    harness.Graphics.mock.results[0].value,
    harness.containers[1],
    harness.containers[2],
  ]);
});
```

```ts
it("viewportを適用したworld containerへエッジとノードを描画する", () => {
  const harness = createPixiTestHarness();
  const viewport = { offsetX: 30, offsetY: -10, scale: 2 };

  renderMapScene(harness.app as never, harness.constructors as never, {
    nodes,
    selectedNodeId: null,
    editingNodeId: null,
    connectionTargetNodeId: null,
    onNodePointerDown: jest.fn(),
    viewport,
  });

  const world = harness.containers[0];
  expect(world.position.set).toHaveBeenCalledWith(30, -10);
  expect(world.scale.set).toHaveBeenCalledWith(2);
  expect(harness.stage.addChild).toHaveBeenCalledWith(world);
});
```

- [ ] **Step 2: 描画テストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/renderMapScene.test.ts`

Expected: FAIL because `viewport` is not consumed and stage receives rendered children directly.

- [ ] **Step 3: worldContainerへ変換を適用する**

```ts
export type RenderMapSceneOptions = RenderMapNodesOptions & {
  viewport: Viewport;
};

export function renderMapScene(app, constructors, options): void {
  clearMapScene(app);
  const worldContainer = new constructors.Container();
  worldContainer.position.set(options.viewport.offsetX, options.viewport.offsetY);
  worldContainer.scale.set(options.viewport.scale);
  renderMapEdges(worldContainer, constructors, options.nodes);
  renderMapNodes(worldContainer, constructors, options);
  app.stage.addChild(worldContainer);
}
```

- [ ] **Step 4: 描画関連テストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/renderMapScene.test.ts src/components/map/pixi/__tests__/renderMapNodes.test.ts src/components/map/pixi/__tests__/renderMapEdges.test.ts src/components/map/pixi/__tests__/clearMapScene.test.ts`

Expected: PASS.

- [ ] **Step 5: 描画コンテナをコミットする**

```bash
git add client/src/components/map/pixi/renderMapScene.ts client/src/components/map/pixi/__tests__/renderMapScene.test.ts client/src/components/map/pixi/testing/pixiTestHarness.ts
git commit -m "refactor(map): 描画をワールドコンテナへ分離"
```

---

### Task 7: MapStageとDOM編集欄の座標統合

**Files:**
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/NodeLabelEditor.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`
- Modify: `client/src/components/map/__tests__/NodeLabelEditor.test.tsx`
- Consume: `client/src/components/map/mapDoubleClickAction.ts`

**Interfaces:**
- Consumes: `useMapViewport`, `resolveMapDoubleClickAction`
- Produces: viewport対応の追加・編集・描画・gesture配線

- [ ] **Step 1: パン後の追加・編集欄位置の失敗テストを書く**

`MapStage.test.tsx`の`MockPointerEvent`と`pointer` fixtureへ`pointerType: "mouse"`を追加する。Pixi Container mockへ`position.set`と`scale.set`を加え、変換を受けたContainerを識別するhelperを用意する。world Containerは`pointerdown` listenerを持たないため、`mockNodePointerHandlers`にはlistener登録時だけ追加し、既存のnode indexを維持する。

```ts
type MockContainer = {
  position: { set: jest.Mock };
  scale: { set: jest.Mock };
};
const mockContainers: MockContainer[] = [];

const lastWorldContainer = () => [...mockContainers]
  .reverse()
  .find((container) => container.position.set.mock.calls.length > 0);
```

Container constructor内では作成instanceを`mockContainers`へ追加し、`on("pointerdown", handler)`を受け取った時だけ対応するhandlersを`mockNodePointerHandlers`へ追加する。`beforeEach`で両配列を空にする。

空白pointerをドラッグしてからダブルクリックする。

```tsx
it("パン後の空白ダブルクリックをワールド座標へ戻して追加する", async () => {
  const onDoubleClick = jest.fn();
  await renderReady(<MapStage {...defaultProps} onDoubleClick={onDoubleClick} />);
  const container = document.querySelector(".cursor-crosshair") as HTMLElement;
  mockStageBounds(container);

  act(() => {
    mockStageHandlers.pointerdown?.(pointer(100, 100, { target: mockStage }));
    mockStageHandlers.pointermove?.(pointer(140, 120));
    mockStageHandlers.pointerup?.(pointer(140, 120));
  });
  fireEvent.doubleClick(container, { clientX: 240, clientY: 170 });

  expect(onDoubleClick).toHaveBeenCalledWith(200, 150);
});
```

`NodeLabelEditor.test.tsx`へviewportを渡す。

```tsx
it("viewportに合わせて編集欄の位置と寸法を変換する", () => {
  render(
    <NodeLabelEditor
      node={node}
      viewport={{ offsetX: 20, offsetY: -10, scale: 2 }}
      value="下書き"
      onChange={jest.fn()}
      onCommit={jest.fn()}
      onCancel={jest.fn()}
    />,
  );

  expect(screen.getByTestId("node-label-input")).toHaveStyle({
    left: "120px",
    top: "50px",
    width: "200px",
    height: "120px",
    lineHeight: "120px",
    fontSize: "28px",
  });
});
```

- [ ] **Step 2: MapStage境界テストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx src/components/map/__tests__/NodeLabelEditor.test.tsx`

Expected: FAIL because MapStage does not own viewport and editor has no viewport prop.

- [ ] **Step 3: MapStageでviewportを生成して全境界へ渡す**

```tsx
const {
  viewport,
  viewportRef,
  setViewport,
} = useMapViewport();

const { connectionTargetNodeId, createNodePointerDownHandler } = useMapStageInteractions({
  runtime,
  nodes,
  viewportRef,
  onViewportChange: setViewport,
  onSelectNode,
  onMoveNode,
  onConnectNodes,
});
```

scene描画effectで`createNodePointerDownHandler()`を呼び、その時点のbinding leaseを捕捉したhandlerを`renderMapScene` optionsへ渡す。あわせて`viewport`を渡す。ダブルクリックは座標変換・hit判定・action選択を`resolveMapDoubleClickAction`へ委譲し、非有限な変換結果の`null`を無視する。

```ts
const action = resolveMapDoubleClickAction({
  client: { x: event.clientX, y: event.clientY },
  bounds: container.getBoundingClientRect(),
  viewport: viewportRef.current,
  nodes,
});
if (action === null) return;

if (action.type === "edit") editing.startEditing(action.nodeId);
else onDoubleClick(action.point.x, action.point.y);
```

- [ ] **Step 4: NodeLabelEditorをviewportへ追従させる**

`viewport: Viewport` propを追加し、既存スタイルを次へ置換する。

```tsx
const position = worldToScreen({ x: node.x, y: node.y }, viewport);
const width = node.width * viewport.scale;
const height = node.height * viewport.scale;

style={{
  left: position.x,
  top: position.y,
  width,
  height,
  lineHeight: `${height}px`,
  fontSize: 14 * viewport.scale,
}}
```

MapStageから`viewport={viewport}`を渡す。

- [ ] **Step 5: MapStage境界テストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx src/components/map/__tests__/NodeLabelEditor.test.tsx`

Expected: PASS.

- [ ] **Step 6: 座標統合をコミットする**

```bash
git add client/src/components/map/MapStage.tsx client/src/components/map/NodeLabelEditor.tsx client/src/components/map/__tests__/MapStage.test.tsx client/src/components/map/__tests__/NodeLabelEditor.test.tsx
git commit -m "feat(map): パン後の追加と編集位置を同期"
```

---

### Task 8: 操作案内と完全検証

**Files:**
- Modify: `client/src/components/layout/AppHeader.tsx`
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`

**Interfaces:**
- Consumes: 承認済みパン操作
- Produces: ユーザーが空白ドラッグ操作を発見できる案内

- [ ] **Step 1: 操作案内の失敗テストを書く**

```tsx
expect(
  screen.getByText(
    "空白ダブルクリックで追加・ノードダブルクリックで編集・空白ドラッグで移動・Shift+ノードドラッグで接続",
  ),
).toBeInTheDocument();
```

- [ ] **Step 2: ヘッダーテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/components/layout/__tests__/AppHeader.test.tsx`

Expected: FAIL because the old operation hint is rendered.

- [ ] **Step 3: AppHeaderの案内を更新する**

```tsx
<span className="ml-4 text-sm text-zinc-600 dark:text-zinc-400">
  空白ダブルクリックで追加・ノードダブルクリックで編集・空白ドラッグで移動・Shift+ノードドラッグで接続
</span>
```

- [ ] **Step 4: ヘッダーテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/components/layout/__tests__/AppHeader.test.tsx`

Expected: PASS.

- [ ] **Step 5: client全体を検証する**

Run: `cd client && npm run verify`

Expected: Tailwind CSS scan、ESLint、TypeScript、全Jest suite、Next.js production buildがすべて成功する。

- [ ] **Step 6: 差分の空白エラーを検証する**

Run: `git diff --check main...HEAD`

Expected: 出力なし、exit code 0。

- [ ] **Step 7: 操作案内をコミットする**

```bash
git add client/src/components/layout/AppHeader.tsx client/src/components/layout/__tests__/AppHeader.test.tsx
git commit -m "docs(ui): パン操作の案内を追加"
```

## PR 1 完了確認

- [ ] 空白ドラッグでviewportだけが移動し、nodesは変更されない。
- [ ] 4px未満の空白操作はパンせず、選択だけ解除する。
- [ ] パン後も追加、編集、ノード移動、接続がワールド座標で成立する。
- [ ] runtime切替と全終了イベントでlistenerとgestureが残らない。
- [ ] `npm run verify`と`git diff --check main...HEAD`が成功する。
- [ ] PRマージ後の後処理で`ROADMAP.md`のパンを完了、Phase 3を`1 / 4`、次項目をズームへ更新する。
