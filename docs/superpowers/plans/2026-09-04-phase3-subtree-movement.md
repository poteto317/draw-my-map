# Phase 3 子孫ノード一括移動 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ドラッグしたノードを根とする部分木全体を同じ差分だけ線形時間で移動し、親子の相対配置を維持する。

**Architecture:** `nodeTree.ts`の純粋関数が親子索引、循環防止、対象座標更新を担当し、`useNodes.moveNode`は最新の同期snapshotへ結果を反映する。Pixi gestureはツリーを知らず、従来どおりドラッグ対象の絶対的な移動先ワールド座標だけを通知する。

**Tech Stack:** TypeScript、React 19、Next.js 16、PixiJS 8、Jest、Testing Library

**Spec:** `docs/superpowers/specs/2026-09-04-phase3-subtree-movement-design.md`

## Global Constraints

- `docs/superpowers/plans/2026-09-04-phase3-zoom-focus.md`のPRがmainへマージ済みであること。
- 新しい外部ライブラリは追加しない。
- `useNodes.moveNode(id, x, y)`の公開APIを変更しない。
- 対象ノードと全子孫へ同じ`dx`と`dy`を適用する。
- 無関係なノードの値とオブジェクト参照を維持する。
- 入力配列と入力ノードを変更しない。
- 欠損ノード、非有限座標、不正な循環で状態を破損しない。
- 1回の移動は`O(全ノード数 + 到達した子孫数)`とする。
- Pixi gestureへツリー探索責務を追加しない。
- ロードマップはこの実装PRへ含めず、マージ後処理で更新する。
- 各TaskのRED確認後に最小実装を行い、Task単位でコミットする。

---

### Task 1: 部分木移動の純粋関数

**Files:**
- Modify: `client/src/domain/nodes/nodeTree.ts`
- Modify: `client/src/domain/nodes/__tests__/nodeTree.test.ts`

**Interfaces:**
- Consumes: `Node`, 一意なnode IDと`parentId`の既存契約
- Produces: `moveNodeSubtree(nodes, rootId, x, y): Node[] | null`

- [ ] **Step 1: 深いツリー、分岐、参照維持の失敗テストを書く**

既存の`node` helperが座標を受け取れるようにする。

```ts
function node(id: number, parentId: number | null, x = 0, y = 0): Node {
  return { id, parentId, x, y, width: 1, height: 1, label: "" };
}
```

次のテストを追加する。

```ts
describe("moveNodeSubtree", () => {
  it("ルートと深い子孫へ同じ差分を適用する", () => {
    const nodes = [
      node(1, null, 10, 20),
      node(2, 1, 30, 40),
      node(3, 2, 80, 90),
    ];

    expect(moveNodeSubtree(nodes, 1, 25, 45)).toEqual([
      node(1, null, 25, 45),
      node(2, 1, 45, 65),
      node(3, 2, 95, 115),
    ]);
    expect(nodes.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 80, y: 90 },
    ]);
  });

  it("中間ノードの部分木だけを移動し無関係な参照を維持する", () => {
    const root = node(1, null, 0, 0);
    const branch = node(2, 1, 20, 20);
    const leaf = node(3, 2, 40, 40);
    const sibling = node(4, 1, 20, 100);

    const moved = moveNodeSubtree([root, branch, leaf, sibling], 2, 30, 35)!;

    expect(moved[0]).toBe(root);
    expect(moved[1]).toEqual({ ...branch, x: 30, y: 35 });
    expect(moved[2]).toEqual({ ...leaf, x: 50, y: 55 });
    expect(moved[3]).toBe(sibling);
  });

  it("葉ノードだけを移動する", () => {
    const root = node(1, null, 0, 0);
    const leaf = node(2, 1, 20, 20);
    const moved = moveNodeSubtree([root, leaf], 2, 50, 60)!;

    expect(moved[0]).toBe(root);
    expect(moved[1]).toEqual({ ...leaf, x: 50, y: 60 });
  });
});
```

- [ ] **Step 2: 欠損、無効値、ゼロ差分、循環の失敗テストを書く**

```ts
it("欠損ノードと非有限座標を拒否する", () => {
  const nodes = [node(1, null)];
  expect(moveNodeSubtree(nodes, 99, 1, 1)).toBeNull();
  expect(moveNodeSubtree(nodes, 1, Number.NaN, 1)).toBeNull();
  expect(moveNodeSubtree(nodes, 1, 1, Number.POSITIVE_INFINITY)).toBeNull();
});

it("ゼロ差分では新しい配列と既存node参照を返す", () => {
  const root = node(1, null, 10, 20);
  const child = node(2, 1, 30, 40);
  const nodes = [root, child];

  const moved = moveNodeSubtree(nodes, 1, 10, 20)!;

  expect(moved).not.toBe(nodes);
  expect(moved[0]).toBe(root);
  expect(moved[1]).toBe(child);
});

it("循環を有限回で処理し到達ノードを一度ずつ移動する", () => {
  const cyclic = [
    node(1, 3, 0, 0),
    node(2, 1, 10, 10),
    node(3, 2, 20, 20),
    node(4, null, 100, 100),
  ];

  expect(moveNodeSubtree(cyclic, 1, 5, 5)).toEqual([
    node(1, 3, 5, 5),
    node(2, 1, 15, 15),
    node(3, 2, 25, 25),
    cyclic[3],
  ]);
});
```

ゼロ差分テストでは入力配列を変数へ保存し、戻り値がその配列とは別参照であることも検証する。

- [ ] **Step 3: 線形走査の失敗テストを書く**

```ts
it("逆順の深いツリーを線形回数の配列読み取りで移動する", () => {
  const count = 100;
  const deepTree = Array.from(
    { length: count },
    (_, index) => {
      const id = count - index;
      return node(id, id === 1 ? null : id - 1, id, id);
    },
  );
  let reads = 0;
  const observed = new Proxy(deepTree, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) reads += 1;
      return Reflect.get(target, property, receiver);
    },
  });

  expect(moveNodeSubtree(observed, 1, 20, 20)).not.toBeNull();
  expect(reads).toBeLessThanOrEqual(count * 3);
});
```

- [ ] **Step 4: ドメインテストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeTree.test.ts`

Expected: FAIL because `moveNodeSubtree` is not exported.

- [ ] **Step 5: 隣接索引と幅優先探索で部分木を移動する**

```ts
export function moveNodeSubtree(
  nodes: readonly Node[],
  rootId: number,
  x: number,
  y: number,
): Node[] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  let root: Node | undefined;
  const childrenByParent = new Map<number, number[]>();
  for (const current of nodes) {
    if (current.id === rootId) root = current;
    if (current.parentId !== null) {
      const children = childrenByParent.get(current.parentId);
      if (children) children.push(current.id);
      else childrenByParent.set(current.parentId, [current.id]);
    }
  }
  if (!root) return null;

  const dx = x - root.x;
  const dy = y - root.y;
  const subtreeIds = new Set<number>();
  const queue = [rootId];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (subtreeIds.has(id)) continue;
    subtreeIds.add(id);
    for (const childId of childrenByParent.get(id) ?? []) queue.push(childId);
  }

  return nodes.map((current) => {
    if (!subtreeIds.has(current.id) || (dx === 0 && dy === 0)) return current;
    return { ...current, x: current.x + dx, y: current.y + dy };
  });
}
```

- [ ] **Step 6: ドメインテストをGREENにする**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeTree.test.ts`

Expected: PASS.

- [ ] **Step 7: 部分木移動をコミットする**

```bash
git add client/src/domain/nodes/nodeTree.ts client/src/domain/nodes/__tests__/nodeTree.test.ts
git commit -m "feat(nodes): 部分木の一括移動を追加"
```

---

### Task 2: `useNodes.moveNode`への統合

**Files:**
- Modify: `client/src/hooks/useNodes.ts`
- Modify: `client/src/hooks/__tests__/useNodes.test.ts`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- Consumes: `moveNodeSubtree`
- Produces: 公開シグネチャを維持した部分木移動command

- [ ] **Step 1: 親・中間ノード・葉のHook失敗テストを書く**

```tsx
it("moveNodeは親と全子孫へ同じ差分を適用する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  act(() => {
    result.current.addNode(100, 100);
    result.current.addChildNode(1);
    result.current.addChildNode(2);
    result.current.addNode(600, 100);
  });
  const before = result.current.nodes.map((node) => ({ ...node }));
  const root = before.find((node) => node.id === 1)!;

  act(() => result.current.moveNode(1, root.x + 25, root.y - 10));

  for (const nodeId of [1, 2, 3]) {
    const oldNode = before.find((node) => node.id === nodeId)!;
    const movedNode = result.current.nodes.find((node) => node.id === nodeId)!;
    expect(movedNode).toMatchObject({ x: oldNode.x + 25, y: oldNode.y - 10 });
  }
  expect(result.current.nodes.find((node) => node.id === 4)).toEqual(before[3]);
});

it("中間ノードから配下だけを移動する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  act(() => {
    result.current.addNode(100, 100);
    result.current.addChildNode(1);
    result.current.addChildNode(2);
  });
  const before = result.current.nodes.map((node) => ({ ...node }));
  const middle = before[1];

  act(() => result.current.moveNode(2, middle.x + 10, middle.y + 15));

  expect(result.current.nodes[0]).toEqual(before[0]);
  expect(result.current.nodes[1]).toMatchObject({ x: middle.x + 10, y: middle.y + 15 });
  expect(result.current.nodes[2]).toMatchObject({
    x: before[2].x + 10,
    y: before[2].y + 15,
  });
});
```

既存の「指定ノードだけを移動する」テストは2つの無関係なルートを使用しているため、テスト名を「葉または子孫のないノードだけを移動する」へ変更して維持する。

- [ ] **Step 2: 連続更新と最新snapshotの失敗テストを書く**

```tsx
it("同一batchの絶対移動先を子孫へ重複加算しない", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  act(() => {
    result.current.addNode(100, 100);
    result.current.addChildNode(1);
  });
  const root = { ...result.current.nodes[0] };
  const child = { ...result.current.nodes[1] };

  act(() => {
    result.current.moveNode(1, root.x + 10, root.y + 5);
    result.current.moveNode(1, root.x + 20, root.y + 15);
  });

  expect(result.current.nodes[0]).toMatchObject({ x: root.x + 20, y: root.y + 15 });
  expect(result.current.nodes[1]).toMatchObject({ x: child.x + 20, y: child.y + 15 });
});

it("初回取得したmoveNodeは最新ツリーの子孫を移動する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  const moveNode = result.current.moveNode;
  act(() => {
    result.current.addNode(100, 100);
    result.current.addChildNode(1);
  });
  const root = { ...result.current.nodes[0] };
  const child = { ...result.current.nodes[1] };

  act(() => moveNode(1, root.x + 30, root.y + 40));

  expect(result.current.nodes[1]).toMatchObject({
    x: child.x + 30,
    y: child.y + 40,
  });
  expect(result.current.moveNode).toBe(moveNode);
});

it("欠損ノードと非有限座標ではstateを変更しない", () => {
  const { result } = renderHook(() => useNodes());
  act(() => result.current.addNode(100, 100));
  const before = result.current.nodes;

  act(() => {
    result.current.moveNode(99, 1, 1);
    result.current.moveNode(1, Number.NaN, 1);
  });

  expect(result.current.nodes).toBe(before);
});
```

- [ ] **Step 3: 実際のMapStageとHookを通す統合失敗テストを書く**

```tsx
function SubtreeMoveHarness() {
  const {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    connectNodes,
    deleteNode,
  } = useNodes();
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const rootId = addNode(100, 100);
    const childId = addChildNode(rootId)!;
    addChildNode(childId);
    addNode(600, 100);
  }, [addNode, addChildNode]);

  return (
    <>
      <MapStage
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        onDoubleClick={addNode}
        onAddChildNode={addChildNode}
        onAddSiblingNode={addSiblingNode}
        onSelectNode={selectNode}
        onUpdateLabel={updateNodeLabel}
        onMoveNode={moveNode}
        onConnectNodes={connectNodes}
        onDeleteNode={deleteNode}
      />
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
    </>
  );
}

it("親ノードのpointer dragで子孫だけを同じ差分だけ移動する", async () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { getByTestId } = await renderReady(<SubtreeMoveHarness />);
  const before = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
  const root = before[0];

  act(() => {
    mockNodePointerHandlers[0].pointerdown?.(pointer(root.x + 10, root.y + 10));
    mockStageHandlers.pointermove?.(pointer(root.x + 30, root.y + 25));
    mockStageHandlers.pointerup?.(pointer(root.x + 30, root.y + 25));
  });

  const after = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
  for (const nodeId of [1, 2, 3]) {
    const oldNode = before.find((node) => node.id === nodeId)!;
    const movedNode = after.find((node) => node.id === nodeId)!;
    expect(movedNode).toMatchObject({ x: oldNode.x + 20, y: oldNode.y + 15 });
  }
  expect(after.find((node) => node.id === 4)).toEqual(before.find((node) => node.id === 4));
});
```

- [ ] **Step 4: Hookと統合テストがREDになることを確認する**

Run: `cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts src/components/map/__tests__/MapStage.test.tsx`

Expected: FAIL because descendants remain at their old coordinates.

- [ ] **Step 5: `moveNode`を純粋関数へ委譲する**

importへ`moveNodeSubtree`を追加し、既存実装を置換する。

```ts
const moveNode = useCallback((id: number, x: number, y: number) => {
  const movedNodes = moveNodeSubtree(nodesRef.current, id, x, y);
  if (!movedNodes) return;
  updateNodes(() => movedNodes);
}, [updateNodes]);
```

- [ ] **Step 6: Hookと統合テストをGREENにする**

Run: `cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts src/domain/nodes/__tests__/nodeTree.test.ts src/components/map/__tests__/MapStage.test.tsx`

Expected: PASS.

- [ ] **Step 7: Hook統合をコミットする**

```bash
git add client/src/hooks/useNodes.ts client/src/hooks/__tests__/useNodes.test.ts client/src/components/map/__tests__/MapStage.test.tsx
git commit -m "feat(nodes): ドラッグ移動を部分木へ適用"
```

---

### Task 3: 関連回帰と完全検証

**Files:**
- Verify: `client/src/domain/nodes/__tests__/nodeTree.test.ts`
- Verify: `client/src/hooks/__tests__/useNodes.test.ts`
- Verify: `client/src/components/map/pixi/__tests__/nodeMoveGesture.test.ts`
- Verify: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- Consumes: `moveNodeSubtree`からMapStageまでの完成した移動経路
- Produces: PR全体の検証結果

- [ ] **Step 1: gesture、Hook、ドメインの関連テストを実行する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx src/components/map/pixi/__tests__/nodeMoveGesture.test.ts src/hooks/__tests__/useNodes.test.ts src/domain/nodes/__tests__/nodeTree.test.ts`

Expected: PASS.

- [ ] **Step 2: client全体を検証する**

Run: `cd client && npm run verify`

Expected: Tailwind CSS scan、ESLint、TypeScript、全Jest suite、Next.js production buildがすべて成功する。

- [ ] **Step 3: 差分の空白エラーを検証する**

Run: `git diff --check main...HEAD`

Expected: 出力なし、exit code 0。

## PR 3 完了確認

- [ ] ルートと中間ノードのドラッグで、その部分木だけが同じ差分を保って移動する。
- [ ] 葉ノードの操作感と`moveNode`公開APIを維持する。
- [ ] 欠損、非有限座標、不正な循環でstateを変更または破損しない。
- [ ] 逆順の深いツリーでも処理が線形回数に収まる。
- [ ] 任意のviewport倍率でgestureがワールド座標の移動先を通知する。
- [ ] `npm run verify`と`git diff --check main...HEAD`が成功する。
- [ ] PRマージ後の後処理で`ROADMAP.md`の子孫一括移動とPhase 3を完了し、次項目をPhase 4のツリー自動レイアウトへ更新する。
