# マウス接続機能の単一責任リファクタリング実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **履歴注記（2026-09-13）:** 本書はマウス接続機能を実装した時点のAPIを記録した完了済み計画であり、`handleNodePointerDown`／`onNodePointerDown`の例は現行controller契約ではない。現在のbinding lease付き`createNodePointerDownHandler`は`docs/superpowers/specs/2026-09-04-phase3-viewport-navigation-design.md`と`docs/superpowers/plans/2026-09-04-phase3-zoom-focus.md`を参照すること。

**Goal:** Shift+ドラッグによる既存ノード接続の外部動作を維持しながら、ドメイン更新、移動ジェスチャー、接続ジェスチャー、PixiJSイベントルーティング、React統合を単一責任の単位へ分離する。

**Architecture:** `nodeTree` が接続検証と親付け替えを純粋処理として提供し、`useNodes` は結果をReact状態へ反映する。PixiJS側は移動・接続を独立した `PointerGesture` として実装し、`stageInteractions` はイベントの振り分けだけ、`useMapStageInteractions` はReactとPixiJSのライフサイクル接続だけを担当する。

**Tech Stack:** TypeScript、React 19、Next.js 16、PixiJS 8、Jest、Testing Library

**Spec:** `docs/superpowers/specs/2026-09-03-mouse-connection-srp-refactor-design.md`

## Global Constraints

- Shift+ドラッグ、通常ドラッグ、候補表示、親の付け替え、選択状態の外部動作を変更しない。
- `MapStage` と `useNodes` の公開APIを変更しない。
- 接続線プレビュー、接続解除UI、複数親、キャンバスのパンを追加しない。
- reducer、状態管理ライブラリ、新しいランタイム依存関係を導入しない。
- `main` から変更されていない領域を便乗して整理しない。
- `git commit` は実行しない。各Taskの終了時は `git status --short` で差分だけ確認する。
- テスト変更時は、どの本番コード破壊を検出するテストかを明確にし、実装前に意図した失敗を確認する。

---

## ファイル構成

### 新規作成

- `client/src/components/map/useMapStageInteractions.ts` — ReactとPixiJSステージ操作の同期。
- `client/src/components/map/__tests__/useMapStageInteractions.test.tsx` — ステージ購読、候補状態、クリーンアップ。
- `client/src/components/map/pixi/pointerGesture.ts` — 最新値refとポインタージェスチャーの共通型。
- `client/src/components/map/pixi/nodeMoveGesture.ts` — 通常ドラッグ移動だけを処理。
- `client/src/components/map/pixi/nodeConnectionGesture.ts` — Shiftドラッグ接続だけを処理。
- `client/src/components/map/pixi/__tests__/nodeMoveGesture.test.ts` — 移動ジェスチャー単体。
- `client/src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts` — 接続ジェスチャー単体。

### 変更

- `client/src/domain/nodes/nodeTree.ts` — 純粋な親付け替え関数を追加。
- `client/src/domain/nodes/__tests__/nodeTree.test.ts` — 参照維持と入力非変更を追加。
- `client/src/hooks/useNodes.ts` — 接続変更をドメインへ委譲。
- `client/src/hooks/__tests__/useNodes.test.ts` — Hook境界の接続回帰ケースを維持。
- `client/src/components/map/pixi/stageInteractions.ts` — ジェスチャー選択とイベント委譲へ限定。
- `client/src/components/map/pixi/__tests__/stageInteractions.test.ts` — オーケストレーション境界へ絞る。
- `client/src/components/map/MapStage.tsx` — 専用Hookを構成するだけに変更。
- `client/src/components/map/__tests__/MapStage.test.tsx` — 公開統合動作を維持。

### 構造変更しない

- `ROADMAP.md`
- `client/src/app/page.tsx`
- `client/src/components/layout/AppHeader.tsx`
- `client/src/components/layout/__tests__/AppHeader.test.tsx`
- `client/src/components/map/pixi/renderMapNodes.ts`
- `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`
- `client/src/components/map/pixi/__tests__/renderMapScene.test.ts`

---

### Task 1: 親子接続の変更を純粋なドメイン処理へ集約する

**Files:**
- Modify: `client/src/domain/nodes/nodeTree.ts`
- Modify: `client/src/domain/nodes/__tests__/nodeTree.test.ts`
- Modify: `client/src/hooks/useNodes.ts`
- Test: `client/src/hooks/__tests__/useNodes.test.ts`

**Interfaces:**
- Consumes: `canConnectNodes(nodes, parentId, childId): boolean`
- Produces: `connectNodeTree(nodes, parentId, childId): Node[] | null`

- [ ] **Step 1: 親付け替えの失敗テストを追加する**

`nodeTree.test.ts` のimportへ `connectNodeTree` を追加し、次のテストを追加する。対象子だけが新しいオブジェクトになり、親と無関係ノードの参照が維持されることを直接確認する。

```ts
describe("connectNodeTree", () => {
  it("reparents only the requested child and preserves other node references", () => {
    const parent = node(1, null);
    const child = node(2, 1);
    const newParent = node(3, null);
    const nodes = [parent, child, newParent];

    const connected = connectNodeTree(nodes, 3, 2);

    expect(connected).not.toBeNull();
    expect(connected?.[0]).toBe(parent);
    expect(connected?.[1]).toEqual({ ...child, parentId: 3 });
    expect(connected?.[1]).not.toBe(child);
    expect(connected?.[2]).toBe(newParent);
    expect(nodes[1].parentId).toBe(1);
  });

  it.each([
    [2, 2],
    [2, 1],
    [99, 2],
    [1, 99],
  ])("returns null without mutating input for invalid connection %s -> %s", (
    parentId,
    childId,
  ) => {
    const nodes = [node(1, null), node(2, 1)];
    const snapshot = nodes.map((current) => ({ ...current }));

    expect(connectNodeTree(nodes, parentId, childId)).toBeNull();
    expect(nodes).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: ドメインテストが意図どおり失敗することを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/domain/nodes/__tests__/nodeTree.test.ts
```

Expected: `connectNodeTree is not a function` またはexport欠損でFAILし、既存の `collectSubtreeIds` と `canConnectNodes` テストはPASSする。

- [ ] **Step 3: 最小の純粋関数を実装する**

`nodeTree.ts` に次を追加する。

```ts
export function connectNodeTree(
  nodes: readonly Node[],
  parentId: number,
  childId: number,
): Node[] | null {
  if (!canConnectNodes(nodes, parentId, childId)) return null;

  return nodes.map((node) => (
    node.id === childId ? { ...node, parentId } : node
  ));
}
```

- [ ] **Step 4: ドメインテストが成功することを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/domain/nodes/__tests__/nodeTree.test.ts
```

Expected: `collectSubtreeIds`、`canConnectNodes`、`connectNodeTree` の全ケースがPASSする。

- [ ] **Step 5: `useNodes` をドメイン委譲へ変更する**

`useNodes.ts` は `canConnectNodes` ではなく `connectNodeTree` をimportし、接続処理を次へ置き換える。

```ts
const connectNodes = useCallback((parentId: number, childId: number) => {
  const connectedNodes = connectNodeTree(nodesRef.current, parentId, childId);
  if (!connectedNodes) return false;

  updateNodes(() => connectedNodes);
  setSelectedNodeId(childId);
  return true;
}, [updateNodes]);
```

これによりHookは検証条件と配列変換を持たず、成功結果の反映だけを行う。

- [ ] **Step 6: Hookとドメインの隣接テストを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/domain/nodes/__tests__/nodeTree.test.ts src/hooks/__tests__/useNodes.test.ts
```

Expected: 親の付け替え、循環拒否、同一batch、選択更新を含めてPASSする。

- [ ] **Step 7: コミットせず差分を確認する**

Run:

```bash
git status --short
git diff --check
```

Expected: 対象ファイルだけが変更され、空白エラーがない。

---

### Task 2: 通常ドラッグ移動を独立したジェスチャーへ抽出する

**Files:**
- Create: `client/src/components/map/pixi/pointerGesture.ts`
- Create: `client/src/components/map/pixi/nodeMoveGesture.ts`
- Create: `client/src/components/map/pixi/__tests__/nodeMoveGesture.test.ts`
- Modify later in Task 4: `client/src/components/map/pixi/stageInteractions.ts`

**Interfaces:**
- Produces: `LatestValue<T>`
- Produces: `PointerGesture`
- Produces: `createNodeMoveGesture(options): PointerGesture | null`

- [ ] **Step 1: 共通契約を作成する**

`pointerGesture.ts` を作成する。

```ts
import type { FederatedPointerEvent } from "pixi.js";

export type LatestValue<T> = {
  readonly current: T;
};

export type PointerGesture = {
  move: (event: FederatedPointerEvent) => void;
  end: (event: FederatedPointerEvent) => void;
  cancel: () => void;
};
```

このTaskでは型だけを作り、既存 `stageInteractions.ts` の `LatestValue` はTask 4まで残す。

- [ ] **Step 2: 移動ジェスチャーの失敗テストを作成する**

`nodeMoveGesture.test.ts` に固定ノードとイベントfixtureを定義し、次を検証する。

```ts
import { createNodeMoveGesture } from "@/components/map/pixi/nodeMoveGesture";
import type { Node } from "@/types/node";

const node: Node = {
  id: 1,
  parentId: null,
  x: 20,
  y: 40,
  width: 100,
  height: 60,
  label: "Node",
};

const pointer = (globalX: number, globalY: number) => ({ globalX, globalY });

describe("createNodeMoveGesture", () => {
  it("returns null when the source node is missing", () => {
    expect(createNodeMoveGesture({
      nodeId: 1,
      startEvent: pointer(100, 60) as never,
      nodesRef: { current: [] },
      onMoveNodeRef: { current: jest.fn() },
      dragThreshold: 4,
    })).toBeNull();
  });

  it("ignores movement below the threshold", () => {
    const onMoveNode = jest.fn();
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startEvent: pointer(100, 60) as never,
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    gesture?.move(pointer(103, 63) as never);

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("preserves displacement after reaching the threshold", () => {
    const onMoveNode = jest.fn();
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startEvent: pointer(100, 60) as never,
      nodesRef: { current: [node] },
      onMoveNodeRef: { current: onMoveNode },
      dragThreshold: 4,
    });

    gesture?.move(pointer(104, 61) as never);
    gesture?.move(pointer(110, 66) as never);

    expect(onMoveNode).toHaveBeenNthCalledWith(1, 1, 24, 41);
    expect(onMoveNode).toHaveBeenNthCalledWith(2, 1, 30, 46);
  });

  it("uses the latest callback and stops after end or cancel", () => {
    const initial = jest.fn();
    const latest = jest.fn();
    const onMoveNodeRef = { current: initial };
    const gesture = createNodeMoveGesture({
      nodeId: 1,
      startEvent: pointer(100, 60) as never,
      nodesRef: { current: [node] },
      onMoveNodeRef,
      dragThreshold: 4,
    });
    onMoveNodeRef.current = latest;

    gesture?.move(pointer(104, 64) as never);
    gesture?.end(pointer(104, 64) as never);
    gesture?.move(pointer(110, 70) as never);

    expect(initial).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
```

終了とキャンセルは `it.each(["end", "cancel"])` で両方確認してもよいが、期待値はどちらも「終了後のmoveがコールバックを呼ばない」とする。

- [ ] **Step 3: 新規テストがexport欠損で失敗することを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/pixi/__tests__/nodeMoveGesture.test.ts
```

Expected: `createNodeMoveGesture` が存在しないためFAILする。

- [ ] **Step 4: 移動ジェスチャーを実装する**

`nodeMoveGesture.ts` を作成する。

```ts
import type { LatestValue, PointerGesture } from "@/components/map/pixi/pointerGesture";
import type { Node } from "@/types/node";
import type { FederatedPointerEvent } from "pixi.js";

type NodeMoveGestureOptions = {
  nodeId: number;
  startEvent: FederatedPointerEvent;
  nodesRef: LatestValue<readonly Node[]>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  dragThreshold: number;
};

export function createNodeMoveGesture({
  nodeId,
  startEvent,
  nodesRef,
  onMoveNodeRef,
  dragThreshold,
}: NodeMoveGestureOptions): PointerGesture | null {
  const node = nodesRef.current.find((currentNode) => currentNode.id === nodeId);
  if (!node) return null;

  let active = true;
  let dragging = false;
  const finish = () => {
    active = false;
  };

  return {
    move(event) {
      if (!active) return;
      const dx = event.globalX - startEvent.globalX;
      const dy = event.globalY - startEvent.globalY;
      if (!dragging) {
        if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
        dragging = true;
      }
      onMoveNodeRef.current(nodeId, node.x + dx, node.y + dy);
    },
    end: finish,
    cancel: finish,
  };
}
```

- [ ] **Step 5: 移動ジェスチャーテストを成功させる**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/pixi/__tests__/nodeMoveGesture.test.ts
```

Expected: 欠損、閾値、変位、最新コールバック、終了・キャンセルがPASSする。

- [ ] **Step 6: コミットせず差分を確認する**

Run:

```bash
git status --short
git diff --check
```

Expected: 共通型、移動ジェスチャー、そのテストだけが新規追加され、空白エラーがない。

---

### Task 3: Shiftドラッグ接続を独立したジェスチャーへ抽出する

**Files:**
- Create: `client/src/components/map/pixi/nodeConnectionGesture.ts`
- Create: `client/src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts`
- Consume: `client/src/components/map/pixi/pointerGesture.ts`
- Consume: `client/src/components/map/mapGeometry.ts`
- Consume: `client/src/domain/nodes/nodeTree.ts`

**Interfaces:**
- Consumes: `LatestValue<T>` と `PointerGesture`
- Consumes: `findNodeAtPoint(nodes, point)`
- Consumes: `canConnectNodes(nodes, parentId, childId)`
- Produces: `createNodeConnectionGesture(options): PointerGesture | null`

- [ ] **Step 1: 接続ジェスチャーの失敗テストを作成する**

`nodeConnectionGesture.test.ts` に接続元と接続先を用意する。

```ts
import { createNodeConnectionGesture } from "@/components/map/pixi/nodeConnectionGesture";
import type { Node } from "@/types/node";

const source: Node = {
  id: 1,
  parentId: null,
  x: 20,
  y: 40,
  width: 100,
  height: 60,
  label: "Source",
};
const target: Node = { ...source, id: 2, x: 200, label: "Target" };
const pointer = (globalX: number, globalY: number) => ({ globalX, globalY });

function createGesture(nodes: readonly Node[] = [source, target]) {
  const onConnectNodesRef = { current: jest.fn(() => true) };
  const onConnectionTargetChangeRef = { current: jest.fn() };
  const gesture = createNodeConnectionGesture({
    sourceNodeId: 1,
    nodesRef: { current: nodes },
    onConnectNodesRef,
    onConnectionTargetChangeRef,
  });
  return { gesture, onConnectNodesRef, onConnectionTargetChangeRef };
}
```

次のケースを個別のテストで追加する。

```ts
it("notifies only when the valid target changes", () => {
  const { gesture, onConnectionTargetChangeRef } = createGesture();
  gesture?.move(pointer(220, 60) as never);
  gesture?.move(pointer(230, 70) as never);
  gesture?.move(pointer(500, 500) as never);

  expect(onConnectionTargetChangeRef.current.mock.calls).toEqual([[2], [null]]);
});

it("connects from the source to the pointerup target without pointermove", () => {
  const { gesture, onConnectNodesRef, onConnectionTargetChangeRef } = createGesture();
  gesture?.end(pointer(220, 60) as never);

  expect(onConnectNodesRef.current).toHaveBeenCalledWith(1, 2);
  expect(onConnectionTargetChangeRef.current).toHaveBeenLastCalledWith(null);
});

it("rejects a target that would create a cycle", () => {
  const parent = { ...source, parentId: null };
  const child = { ...target, parentId: 1 };
  const refs = {
    nodes: [parent, child],
  };
  const onConnectNodesRef = { current: jest.fn(() => true) };
  const onConnectionTargetChangeRef = { current: jest.fn() };
  const gesture = createNodeConnectionGesture({
    sourceNodeId: 2,
    nodesRef: { current: refs.nodes },
    onConnectNodesRef,
    onConnectionTargetChangeRef,
  });

  gesture?.move(pointer(50, 50) as never);
  gesture?.end(pointer(50, 50) as never);

  expect(onConnectionTargetChangeRef.current).not.toHaveBeenCalledWith(1);
  expect(onConnectNodesRef.current).not.toHaveBeenCalled();
});
```

加えて、開始ノード欠損で `null`、空白endで非接続、cancelで非接続かつ候補解除、完了後のmove/end無効、最新ref使用を検証する。

- [ ] **Step 2: 新規テストがexport欠損で失敗することを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts
```

Expected: `createNodeConnectionGesture` が存在しないためFAILする。

- [ ] **Step 3: 接続ジェスチャーを実装する**

`nodeConnectionGesture.ts` を作成する。

```ts
import { findNodeAtPoint } from "@/components/map/mapGeometry";
import type { LatestValue, PointerGesture } from "@/components/map/pixi/pointerGesture";
import { canConnectNodes } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";

type NodeConnectionGestureOptions = {
  sourceNodeId: number;
  nodesRef: LatestValue<readonly Node[]>;
  onConnectNodesRef: LatestValue<(parentId: number, childId: number) => void>;
  onConnectionTargetChangeRef: LatestValue<(id: number | null) => void>;
};

export function createNodeConnectionGesture({
  sourceNodeId,
  nodesRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
}: NodeConnectionGestureOptions): PointerGesture | null {
  if (!nodesRef.current.some((node) => node.id === sourceNodeId)) return null;

  let active = true;
  let targetNodeId: number | null = null;

  const findTargetId = (event: { globalX: number; globalY: number }) => {
    const target = findNodeAtPoint(nodesRef.current, {
      x: event.globalX,
      y: event.globalY,
    });
    return target && canConnectNodes(nodesRef.current, sourceNodeId, target.id)
      ? target.id
      : null;
  };

  const finish = () => {
    if (!active) return false;
    active = false;
    onConnectionTargetChangeRef.current(null);
    return true;
  };

  return {
    move(event) {
      if (!active) return;
      const nextTargetNodeId = findTargetId(event);
      if (nextTargetNodeId === targetNodeId) return;
      targetNodeId = nextTargetNodeId;
      onConnectionTargetChangeRef.current(nextTargetNodeId);
    },
    end(event) {
      if (!active) return;
      const droppedNodeId = findTargetId(event);
      if (droppedNodeId !== null) {
        onConnectNodesRef.current(sourceNodeId, droppedNodeId);
      }
      finish();
    },
    cancel() {
      finish();
    },
  };
}
```

`FederatedPointerEvent` を `findTargetId` の引数に使ってもよいが、公開する `PointerGesture` の型と一致させる。

- [ ] **Step 4: 接続ジェスチャーテストを成功させる**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts
```

Expected: 候補遷移、pointerup再評価、循環拒否、空白、cancel、最新refがPASSする。

- [ ] **Step 5: ドメインと接続ジェスチャーの隣接テストを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts src/domain/nodes/__tests__/nodeTree.test.ts
```

Expected: UI候補判定とドメイン最終検証の両方がPASSする。

- [ ] **Step 6: コミットせず差分を確認する**

Run:

```bash
git status --short
git diff --check
```

Expected: 接続ジェスチャーとテストだけが追加され、空白エラーがない。

---

### Task 4: `stageInteractions` をPixiJSイベントルーティングへ限定する

**Files:**
- Modify: `client/src/components/map/pixi/stageInteractions.ts`
- Modify: `client/src/components/map/pixi/__tests__/stageInteractions.test.ts`
- Consume: `client/src/components/map/pixi/nodeMoveGesture.ts`
- Consume: `client/src/components/map/pixi/nodeConnectionGesture.ts`
- Consume: `client/src/components/map/pixi/pointerGesture.ts`

**Interfaces:**
- Consumes: `createNodeMoveGesture(options): PointerGesture | null`
- Consumes: `createNodeConnectionGesture(options): PointerGesture | null`
- Preserves: `createStageInteractions(options)` と戻り値 `{ bind, handleNodePointerDown }`

- [ ] **Step 1: 新ジェスチャー単体テストが抽出前のアルゴリズムを保護していることを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/pixi/__tests__/nodeMoveGesture.test.ts src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts src/components/map/pixi/__tests__/stageInteractions.test.ts
```

Expected: 3スイートがPASSする。ここが振る舞い保持のリファクタリング開始点となる。

- [ ] **Step 2: `stageInteractions.ts` をルーティング実装へ置き換える**

既存の `MoveDragState`、`ConnectDragState`、座標計算、候補探索、接続確定を削除する。`LatestValue` は `pointerGesture.ts` からimportして再exportし、既存import互換性を保つ。

```ts
import { createNodeConnectionGesture } from "@/components/map/pixi/nodeConnectionGesture";
import { createNodeMoveGesture } from "@/components/map/pixi/nodeMoveGesture";
import type { LatestValue, PointerGesture } from "@/components/map/pixi/pointerGesture";
import type { Node } from "@/types/node";
import type { Container, FederatedPointerEvent } from "pixi.js";

export type { LatestValue } from "@/components/map/pixi/pointerGesture";

type StageInteractionOptions = {
  nodesRef: LatestValue<readonly Node[]>;
  onSelectNodeRef: LatestValue<(id: number | null) => void>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  onConnectNodesRef: LatestValue<(parentId: number, childId: number) => void>;
  onConnectionTargetChangeRef: LatestValue<(id: number | null) => void>;
  dragThreshold?: number;
};

type InteractiveStage = Pick<Container, "on" | "off">;

export function createStageInteractions({
  nodesRef,
  onSelectNodeRef,
  onMoveNodeRef,
  onConnectNodesRef,
  onConnectionTargetChangeRef,
  dragThreshold = 4,
}: StageInteractionOptions) {
  let activeGesture: PointerGesture | null = null;

  const handleNodePointerDown = (nodeId: number, event: FederatedPointerEvent) => {
    onSelectNodeRef.current(nodeId);
    activeGesture = event.shiftKey
      ? createNodeConnectionGesture({
        sourceNodeId: nodeId,
        nodesRef,
        onConnectNodesRef,
        onConnectionTargetChangeRef,
      })
      : createNodeMoveGesture({
        nodeId,
        startEvent: event,
        nodesRef,
        onMoveNodeRef,
        dragThreshold,
      });
  };

  const handlePointerMove = (event: FederatedPointerEvent) => {
    activeGesture?.move(event);
  };

  const bind = (stage: InteractiveStage) => {
    const handleStagePointerDown = (event: FederatedPointerEvent) => {
      if (event.target === stage) onSelectNodeRef.current(null);
    };
    const handlePointerUp = (event: FederatedPointerEvent) => {
      activeGesture?.end(event);
      activeGesture = null;
    };
    const handlePointerUpOutside = () => {
      activeGesture?.cancel();
      activeGesture = null;
    };

    stage.on("pointerdown", handleStagePointerDown);
    stage.on("pointermove", handlePointerMove);
    stage.on("pointerup", handlePointerUp);
    stage.on("pointerupoutside", handlePointerUpOutside);

    return () => {
      stage.off("pointerdown", handleStagePointerDown);
      stage.off("pointermove", handlePointerMove);
      stage.off("pointerup", handlePointerUp);
      stage.off("pointerupoutside", handlePointerUpOutside);
    };
  };

  return { bind, handleNodePointerDown };
}
```

- [ ] **Step 3: `stageInteractions.test.ts` をルーティング境界へ絞る**

残すケースは次のとおり。

- ステージ直下だけ選択解除する。
- ノードpointerdownは最新の選択コールバックを呼ぶ。
- Shiftなしのpointerdown・moveが移動を発生させる。
- Shiftありのpointerdown・pointerupが接続を発生させ、移動を発生させない。
- 欠損ノードは選択せず、進行中のジェスチャーをキャンセルして後続の移動・接続を発生させない。
- pointerupとpointerupoutsideの後は追加moveを無視する。
- 登録した4リスナーを同一参照で解除する。

閾値の境界値、変位の複数回計算、候補遷移、循環拒否、最新の移動・接続コールバックは各ジェスチャー単体テストへ移し、ここでは重複させない。

- [ ] **Step 4: PixiJS操作テストを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/pixi/__tests__/nodeMoveGesture.test.ts src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts src/components/map/pixi/__tests__/stageInteractions.test.ts
```

Expected: アルゴリズム単体とルーティング境界がすべてPASSする。

- [ ] **Step 5: 型チェックで共通契約の整合性を確認する**

Run:

```bash
cd client
npm run typecheck
```

Expected: `LatestValue`、`PointerGesture`、PixiJSイベント型のエラーがない。

- [ ] **Step 6: コミットせず差分を確認する**

Run:

```bash
git status --short
git diff --check
```

Expected: `stageInteractions.ts` から移動閾値計算と接続候補探索が消え、空白エラーがない。

---

### Task 5: ReactとPixiJS操作の同期を専用Hookへ抽出する

**Files:**
- Create: `client/src/components/map/useMapStageInteractions.ts`
- Create: `client/src/components/map/__tests__/useMapStageInteractions.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`
- Test: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- Consumes: `PixiRuntime | null`
- Consumes: `createStageInteractions(options)`
- Produces: `useMapStageInteractions(options): { connectionTargetNodeId: number | null; onNodePointerDown: (nodeId, event) => void }`

- [ ] **Step 1: Hookの失敗テストを作成する**

`useMapStageInteractions.test.tsx` では、`on`/`off` のhandler mapを持つステージを使う。実際の `createStageInteractions` を通し、PixiJS本体は起動しない。

```ts
import { act, renderHook } from "@testing-library/react";
import { useMapStageInteractions } from "@/components/map/useMapStageInteractions";
import type { Node } from "@/types/node";

type StageEvent = "pointerdown" | "pointermove" | "pointerup" | "pointerupoutside";
type Handler = (event: { globalX: number; globalY: number; target?: unknown }) => void;

function createRuntime() {
  const handlers: Partial<Record<StageEvent, Handler>> = {};
  const stage = {
    eventMode: "none",
    hitArea: null as unknown,
    on: jest.fn((name: StageEvent, handler: Handler) => {
      handlers[name] = handler;
      return stage;
    }),
    off: jest.fn((name: StageEvent, handler: Handler) => {
      if (handlers[name] === handler) delete handlers[name];
      return stage;
    }),
  };
  const runtime = {
    app: { stage, screen: { x: 0, y: 0, width: 800, height: 600 } },
    constructors: {},
  };
  return { runtime, stage, handlers };
}

const nodes: Node[] = [
  { id: 1, parentId: null, x: 20, y: 40, width: 100, height: 60, label: "親" },
  { id: 2, parentId: null, x: 200, y: 40, width: 100, height: 60, label: "子" },
];
```

次をテストする。

```ts
it("binds and removes stage listeners with the runtime lifecycle", () => {
  const { runtime, stage } = createRuntime();
  const { unmount } = renderHook(() => useMapStageInteractions({
    runtime: runtime as never,
    nodes,
    onSelectNode: jest.fn(),
    onMoveNode: jest.fn(),
    onConnectNodes: jest.fn(() => true),
  }));

  expect(stage.on).toHaveBeenCalledTimes(4);
  unmount();
  expect(stage.off).toHaveBeenCalledTimes(4);
});

it("publishes and clears the connection target", () => {
  const { runtime, handlers } = createRuntime();
  const onConnectNodes = jest.fn(() => true);
  const { result } = renderHook(() => useMapStageInteractions({
    runtime: runtime as never,
    nodes,
    onSelectNode: jest.fn(),
    onMoveNode: jest.fn(),
    onConnectNodes,
  }));

  act(() => {
    result.current.onNodePointerDown(1, {
      globalX: 50,
      globalY: 50,
      shiftKey: true,
    } as never);
    handlers.pointermove?.({ globalX: 220, globalY: 60 });
  });
  expect(result.current.connectionTargetNodeId).toBe(2);

  act(() => handlers.pointerup?.({ globalX: 220, globalY: 60 }));
  expect(onConnectNodes).toHaveBeenCalledWith(1, 2);
  expect(result.current.connectionTargetNodeId).toBeNull();
});
```

加えて、`runtime: null` ではリスナーを登録しないことを確認する。

- [ ] **Step 2: 新規Hookテストがimport欠損で失敗することを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/__tests__/useMapStageInteractions.test.tsx
```

Expected: `useMapStageInteractions` が存在しないためFAILする。

- [ ] **Step 3: 専用Hookを実装する**

`useMapStageInteractions.ts` を作成する。

```ts
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createStageInteractions } from "@/components/map/pixi/stageInteractions";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import type { Node } from "@/types/node";

type UseMapStageInteractionsOptions = {
  runtime: PixiRuntime | null;
  nodes: readonly Node[];
  onSelectNode: (id: number | null) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onConnectNodes: (parentId: number, childId: number) => void;
};

export function useMapStageInteractions({
  runtime,
  nodes,
  onSelectNode,
  onMoveNode,
  onConnectNodes,
}: UseMapStageInteractionsOptions) {
  const [connectionTargetNodeId, setConnectionTargetNodeId] = useState<number | null>(null);
  const nodesRef = useRef<readonly Node[]>(nodes);
  const onSelectNodeRef = useRef(onSelectNode);
  const onMoveNodeRef = useRef(onMoveNode);
  const onConnectNodesRef = useRef(onConnectNodes);
  const onConnectionTargetChangeRef = useRef(setConnectionTargetNodeId);

  useLayoutEffect(() => {
    nodesRef.current = nodes;
    onSelectNodeRef.current = onSelectNode;
    onMoveNodeRef.current = onMoveNode;
    onConnectNodesRef.current = onConnectNodes;
  }, [nodes, onSelectNode, onMoveNode, onConnectNodes]);

  const interactionsRef = useRef<ReturnType<typeof createStageInteractions> | null>(null);
  interactionsRef.current ??= createStageInteractions({
    nodesRef,
    onSelectNodeRef,
    onMoveNodeRef,
    onConnectNodesRef,
    onConnectionTargetChangeRef,
  });
  const interactions = interactionsRef.current;

  useEffect(() => {
    if (!runtime) return;
    runtime.app.stage.eventMode = "static";
    runtime.app.stage.hitArea = runtime.app.screen;
    return interactions.bind(runtime.app.stage);
  }, [runtime, interactions]);

  return {
    connectionTargetNodeId,
    onNodePointerDown: interactions.handleNodePointerDown,
  };
}
```

- [ ] **Step 4: Hook単体テストを成功させる**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/__tests__/useMapStageInteractions.test.tsx
```

Expected: null runtime、リスナー登録解除、候補状態、接続確定がPASSする。

- [ ] **Step 5: `MapStage.tsx` を構成へ限定する**

`useEffect`、`useLayoutEffect`、接続候補の `useState`、最新値ref、`createStageInteractions` の直接importを削除し、専用Hookを使う。

```ts
const stageInteractions = useMapStageInteractions({
  runtime,
  nodes,
  onSelectNode,
  onMoveNode,
  onConnectNodes,
});
```

描画オプションは次へ置き換える。

```ts
renderMapScene(runtime.app, runtime.constructors, {
  nodes,
  selectedNodeId,
  editingNodeId: editing.editingNodeId,
  connectionTargetNodeId: stageInteractions.connectionTargetNodeId,
  onNodePointerDown: stageInteractions.onNodePointerDown,
});
```

描画effectの依存配列も `stageInteractions.connectionTargetNodeId` と `stageInteractions.onNodePointerDown` を参照する。Hookの戻り値が毎renderでオブジェクトになるため、必要なら分割代入して依存値を明示する。

- [ ] **Step 6: MapStage統合テストを確認する**

Run:

```bash
cd client
npm test -- --runInBand src/components/map/__tests__/useMapStageInteractions.test.tsx src/components/map/__tests__/MapStage.test.tsx
```

Expected: Shift接続、通常操作、キーボード作成、破棄レンダーのref保護を含めてPASSする。

- [ ] **Step 7: 型チェックとLintを確認する**

Run:

```bash
cd client
npm run lint
npm run typecheck
```

Expected: React Hook依存配列、PixiRuntime、FederatedPointerEventのエラーがない。

- [ ] **Step 8: コミットせず差分を確認する**

Run:

```bash
git status --short
git diff --check
```

Expected: `MapStage.tsx` からref同期とイベント購読が消え、空白エラーがない。

---

### Task 6: 全差分を再監査して検証する

**Files:**
- Review: `git diff main` に含まれる全ファイル
- Update only if implementation changed scope: `docs/superpowers/specs/2026-09-03-mouse-connection-srp-refactor-design.md`
- Update only if task detail changed: `docs/superpowers/plans/2026-09-03-mouse-connection-srp-refactor.md`

**Interfaces:**
- Consumes: Task 1〜5の完成状態
- Produces: 検証済みで未コミットの作業ツリー

- [ ] **Step 1: 集中テストをまとめて実行する**

Run:

```bash
cd client
npm test -- --runInBand \
  src/domain/nodes/__tests__/nodeTree.test.ts \
  src/hooks/__tests__/useNodes.test.ts \
  src/components/map/pixi/__tests__/nodeMoveGesture.test.ts \
  src/components/map/pixi/__tests__/nodeConnectionGesture.test.ts \
  src/components/map/pixi/__tests__/stageInteractions.test.ts \
  src/components/map/__tests__/useMapStageInteractions.test.tsx \
  src/components/map/__tests__/MapStage.test.tsx
```

Expected: 新しい責務単位と統合境界がすべてPASSする。

- [ ] **Step 2: プロジェクト指定の全検証を実行する**

Run:

```bash
cd client
npm run verify
```

Expected: Tailwindスキャン、ESLint、TypeScript、全Jestスイート、Next.js production buildが終了コード0になる。

- [ ] **Step 3: `main` 差分の全件分類を再確認する**

Run:

```bash
git diff --name-status main
git diff --stat main
git diff --check
```

次を目視確認する。

- `stageInteractions.ts` に移動閾値計算、変位計算、候補探索、循環判定がない。
- `MapStage.tsx` に最新値ref、接続候補state、PixiJSリスナー登録がない。
- `useNodes.ts` に接続可否条件や `parentId` 変更mapがない。
- `nodeMoveGesture.ts` に接続処理がない。
- `nodeConnectionGesture.ts` に移動処理やイベント購読がない。
- `useMapStageInteractions.ts` に描画、ツリー判定、座標計算がない。
- 構造変更不要とした文書、構成root、ヘッダー、ノード描画の責務が増えていない。

Expected: 未分類の本番差分と空白エラーがない。

- [ ] **Step 4: 自動コミットされていないことを確認する**

Run:

```bash
git status --short --branch
git log -1 --oneline
```

Expected: ブランチは `codex/mouse-connect-nodes`、変更は未コミットで、HEADは作業開始時の `90e60ea` のまま。
