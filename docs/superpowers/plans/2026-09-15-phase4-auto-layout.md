# Phase 4 Auto Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ツリーを左から右へ重なりなく整列し、手動配置と自動配置を切り替えながら構造変更後の座標を原子的に更新できるようにする。

**Architecture:** 公開関数`layoutNodeForest`を入口とし、ツリー検証・索引構築と座標計算を独立した純粋モジュールへ分離する。`useNodes`がレイアウトモードとツリー変更の原子的適用を所有し、`AppHeader`と`page.tsx`はモードの表示・配線だけを担当する。

**Tech Stack:** TypeScript 5、React 19、Next.js 16、Jest 30、Testing Library、PixiJS 8、Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-09-15-phase4-auto-layout-design.md`

## Global Constraints

- レイアウト方向は左から右とし、同じ深さのノードを同じX列へ揃える。
- 兄弟と複数ルートは入力配列の順序を維持する。
- 最初のルートノードの現在の左上X座標とY座標を維持する。
- 自動モード中はノードドラッグを無効化し、手動モードへ戻しても現在座標を維持する。
- 自動モードへの切り替え直後と、追加・削除・接続後だけ全体を再配置する。
- 無効入力または演算overflowでは、ノード・選択・モードを一部も変更しない。
- 時間計算量と追加メモリを`O(n)`に保ち、再帰呼び出しと全ノードペア探索を使わない。
- 新しい外部依存を追加しない。
- `ROADMAP.md`の完了チェックは各PRのマージ後処理で更新し、実装PRでは変更しない。
- クライアント変更ごとに`client`ディレクトリから対象テストを実行し、PR単位で`npm run verify`を実行する。

## File Structure

- Create: `client/src/domain/nodes/nodeLayoutForest.ts` — 入力検証、親子索引、ルート順、深さ、post-orderを線形時間で構築する。
- Create: `client/src/domain/nodes/nodeLayoutGeometry.ts` — 列位置、部分木span、座標、列内の重なり不変条件を計算する。
- Create: `client/src/domain/nodes/nodeAutoLayout.ts` — 2つの純粋モジュールを合成し、`Node[] | null`の公開契約へ変換する。
- Create: `client/src/domain/nodes/__tests__/nodeLayoutForest.test.ts` — 整合性、循環、深いツリー、入力順を検証する。
- Create: `client/src/domain/nodes/__tests__/nodeAutoLayout.test.ts` — アンカー、整列、非重複、参照保持、overflowを検証する。
- Modify: `client/src/config/shapes.ts` — `TREE_VERTICAL_GAP`を既存間隔から導出する。
- Create: `client/src/types/nodeLayout.ts` — UIとHookで共有する`NodeLayoutMode`だけを定義する。
- Modify: `client/src/hooks/useNodes.ts` — モードstate、原子的ツリー更新、ドラッグ抑止を所有する。
- Modify: `client/src/hooks/__tests__/useNodes.test.ts` — モード遷移と全commandの自動配置契約を検証する。
- Modify: `client/src/components/layout/AppHeader.tsx` — セグメントボタンとモード別操作案内を表示する。
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx` — アクセシビリティ属性、表示、callbackを検証する。
- Modify: `client/src/app/page.tsx` — Hookのモードstateとcommandをヘッダーへ渡す。
- Modify: `client/src/app/__tests__/page.test.tsx` — ページ境界のprops配線を検証する。
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx` — 実際の`useNodes`とPixi操作を通す自動モード統合テストを追加する。

---

## PR 1: レイアウトエンジン

### Task 1: ツリー検証と走査順の構築

**Files:**
- Create: `client/src/domain/nodes/nodeLayoutForest.ts`
- Create: `client/src/domain/nodes/__tests__/nodeLayoutForest.test.ts`

**Interfaces:**
- Consumes: `Node` from `@/types/node`
- Produces: `indexNodeForest(nodes: readonly Node[]): IndexedNodeForest | null`
- Produces: `IndexedNodeForest` with `nodes`, `roots`, `childrenByParent`, `depthById`, `nodesByDepth`, `postOrder`

- [ ] **Step 1: Write the failing validation and ordering tests**

```ts
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null): Node {
  return { id, parentId, x: id * 10, y: id * 20, width: 100, height: 60, label: String(id) };
}

describe("indexNodeForest", () => {
  it("入力順のルート・子と、子が親より前でも有効な深さ・post-orderを返す", () => {
    const indexed = indexNodeForest([
      node(4, 2), node(2, 1), node(3, 1), node(1, null), node(9, null),
    ]);

    expect(indexed?.roots.map(({ id }) => id)).toEqual([1, 9]);
    expect(indexed?.childrenByParent.get(1)?.map(({ id }) => id)).toEqual([2, 3]);
    expect(indexed?.depthById.get(4)).toBe(2);
    expect(indexed?.nodesByDepth.map((level) => level.map(({ id }) => id)))
      .toEqual([[1, 9], [2, 3], [4]]);
    expect(indexed?.postOrder.map(({ id }) => id).indexOf(4))
      .toBeLessThan(indexed!.postOrder.map(({ id }) => id).indexOf(2));
  });

  it.each([
    ["ID重複", [node(1, null), node(1, null)]],
    ["親欠損", [node(1, 99)]],
    ["自己参照", [node(1, 1)]],
    ["循環", [node(1, 2), node(2, 1)]],
    ["非有限ID", [{ ...node(1, null), id: Number.NaN }]],
    ["非有限座標", [{ ...node(1, null), x: Number.POSITIVE_INFINITY }]],
    ["非有限サイズ", [{ ...node(1, null), height: Number.NaN }]],
    ["幅0", [{ ...node(1, null), width: 0 }]],
    ["高さ負数", [{ ...node(1, null), height: -1 }]],
  ])("%sを拒否する", (_name, nodes) => {
    expect(indexNodeForest(nodes)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeLayoutForest.test.ts`

Expected: FAIL because `@/domain/nodes/nodeLayoutForest` does not exist.

- [ ] **Step 3: Implement finite validation, indexes, iterative depth traversal, and iterative post-order**

```ts
import type { Node } from "@/types/node";

export type IndexedNodeForest = {
  nodes: readonly Node[];
  roots: readonly Node[];
  childrenByParent: ReadonlyMap<number, readonly Node[]>;
  depthById: ReadonlyMap<number, number>;
  nodesByDepth: readonly (readonly Node[])[];
  postOrder: readonly Node[];
};

function isValidNode(node: Node): boolean {
  return Number.isFinite(node.id)
    && Number.isFinite(node.x)
    && Number.isFinite(node.y)
    && Number.isFinite(node.width)
    && Number.isFinite(node.height)
    && node.width > 0
    && node.height > 0;
}

export function indexNodeForest(nodes: readonly Node[]): IndexedNodeForest | null {
  const nodesById = new Map<number, Node>();
  const childrenByParent = new Map<number, Node[]>();
  const roots: Node[] = [];

  for (const node of nodes) {
    if (!isValidNode(node) || nodesById.has(node.id)) return null;
    nodesById.set(node.id, node);
  }
  for (const node of nodes) {
    if (node.parentId === null) roots.push(node);
    else {
      if (!nodesById.has(node.parentId)) return null;
      const siblings = childrenByParent.get(node.parentId) ?? [];
      siblings.push(node);
      childrenByParent.set(node.parentId, siblings);
    }
  }

  const depthById = new Map<number, number>();
  const nodesByDepth: Node[][] = [];
  const postOrder: Node[] = [];
  const stack = [...roots].reverse().map((node) => ({ node, depth: 0, exiting: false }));
  const visiting = new Set<number>();

  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.exiting) {
      visiting.delete(frame.node.id);
      postOrder.push(frame.node);
      continue;
    }
    if (visiting.has(frame.node.id) || depthById.has(frame.node.id)) return null;
    visiting.add(frame.node.id);
    depthById.set(frame.node.id, frame.depth);
    (nodesByDepth[frame.depth] ??= []).push(frame.node);
    stack.push({ ...frame, exiting: true });
    const children = childrenByParent.get(frame.node.id) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], depth: frame.depth + 1, exiting: false });
    }
  }
  if (depthById.size !== nodes.length) return null;
  return { nodes, roots, childrenByParent, depthById, nodesByDepth, postOrder };
}
```

The implementation must keep the loop non-recursive and must not call `find`, `filter`, or scan `nodes` from inside traversal loops.

- [ ] **Step 4: Add and pass the deep reverse-order linear-read test**

```ts
it("逆順の深いツリーを線形範囲の入力読み取りで索引化する", () => {
  const count = 2_000;
  const input = Array.from({ length: count }, (_, index) => {
    const id = count - index;
    return node(id, id === 1 ? null : id - 1);
  });
  let reads = 0;
  const observed = new Proxy(input, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) reads += 1;
      return Reflect.get(target, property, receiver);
    },
  });

  expect(indexNodeForest(observed)?.depthById.get(count)).toBe(count - 1);
  expect(reads).toBeLessThanOrEqual(count * 3);
});
```

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeLayoutForest.test.ts`

Expected: PASS, including the 2,000-level tree without stack overflow.

- [ ] **Step 5: Commit the tree-index deliverable**

```bash
git add client/src/domain/nodes/nodeLayoutForest.ts client/src/domain/nodes/__tests__/nodeLayoutForest.test.ts
git commit -m "feat(layout): ツリー検証と走査順を追加"
```

### Task 2: 部分木spanと重なり回避座標の計算

**Files:**
- Modify: `client/src/config/shapes.ts`
- Create: `client/src/domain/nodes/nodeLayoutGeometry.ts`
- Create: `client/src/domain/nodes/__tests__/nodeAutoLayout.test.ts`

**Interfaces:**
- Consumes: `IndexedNodeForest` from Task 1
- Consumes: `CHILD_HORIZONTAL_GAP`, `SIBLING_VERTICAL_GAP`, `TREE_VERTICAL_GAP`
- Produces: `calculateNodePositions(forest: IndexedNodeForest): ReadonlyMap<number, LayoutPoint> | null`
- Produces: `LayoutPoint = { x: number; y: number }`

- [ ] **Step 1: Add the derived tree gap and write failing geometry tests through the planned public API**

Append to `client/src/config/shapes.ts`:

```ts
export const TREE_VERTICAL_GAP = SIBLING_VERTICAL_GAP * 2;
```

Create tests with the public import, which remains RED until Task 3 adds the wrapper:

```ts
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  CHILD_HORIZONTAL_GAP,
  SIBLING_VERTICAL_GAP,
  TREE_VERTICAL_GAP,
} from "@/config/shapes";
import type { Node } from "@/types/node";

function node(
  id: number,
  parentId: number | null,
  x = 0,
  y = 0,
  width = 100,
  height = 60,
): Node {
  return { id, parentId, x, y, width, height, label: `node-${id}` };
}

it("最初のルートを固定し、深さごとの最大幅でX列を揃える", () => {
  const result = layoutNodeForest([
    node(1, null, 80, 120, 140),
    node(2, 1, 900, 900, 80),
    node(3, 2, -10, -10, 100),
    node(4, 1, 500, 500, 200),
  ])!;

  expect(result.find(({ id }) => id === 1)).toMatchObject({ x: 80, y: 120 });
  expect(result.find(({ id }) => id === 2)?.x).toBe(80 + 140 + CHILD_HORIZONTAL_GAP);
  expect(result.find(({ id }) => id === 4)?.x).toBe(80 + 140 + CHILD_HORIZONTAL_GAP);
  expect(result.find(({ id }) => id === 3)?.x)
    .toBe(80 + 140 + CHILD_HORIZONTAL_GAP + 200 + CHILD_HORIZONTAL_GAP);
});

it("親を子グループ中央へ置き、入力順の兄弟を縦方向へ離す", () => {
  const result = layoutNodeForest([
    node(1, null, 50, 70),
    node(2, 1),
    node(3, 1),
  ])!;
  const [root, first, second] = result;

  expect(root.y).toBe(70);
  expect(second.y).toBe(first.y + first.height + SIBLING_VERTICAL_GAP);
  expect(root.y + root.height / 2)
    .toBe((first.y + (second.y + second.height)) / 2);
});

it("複数ルートを入力順に積み、部分木区間の間へtree gapを置く", () => {
  const result = layoutNodeForest([
    node(1, null, 30, 40), node(2, 1), node(9, null),
  ])!;
  const firstTreeBottom = Math.max(
    ...result.filter(({ id }) => id !== 9).map((current) => current.y + current.height),
  );
  const secondRoot = result.find(({ id }) => id === 9)!;

  expect(secondRoot.x).toBe(30);
  expect(secondRoot.y).toBe(firstTreeBottom + TREE_VERTICAL_GAP);
});
```

- [ ] **Step 2: Run the geometry tests and confirm RED**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeAutoLayout.test.ts`

Expected: FAIL because `nodeAutoLayout.ts` does not exist.

- [ ] **Step 3: Implement column positions, post-order spans, iterative placement, and overlap validation**

Create `client/src/domain/nodes/nodeLayoutGeometry.ts` with these exact responsibilities:

```ts
import {
  CHILD_HORIZONTAL_GAP,
  SIBLING_VERTICAL_GAP,
  TREE_VERTICAL_GAP,
} from "@/config/shapes";
import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";

export type LayoutPoint = { x: number; y: number };

function finite(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function calculateNodePositions(
  forest: IndexedNodeForest,
): ReadonlyMap<number, LayoutPoint> | null {
  if (forest.nodes.length === 0) return new Map();
  const maxWidthByDepth = forest.nodesByDepth.map((level) => {
    let maxWidth = 0;
    for (const node of level) maxWidth = Math.max(maxWidth, node.width);
    return maxWidth;
  });
  const columnX = [forest.roots[0].x];
  for (let depth = 1; depth < maxWidthByDepth.length; depth += 1) {
    const x = finite(columnX[depth - 1] + maxWidthByDepth[depth - 1] + CHILD_HORIZONTAL_GAP);
    if (x === null) return null;
    columnX.push(x);
  }

  const spans = new Map<number, number>();
  const childrenHeights = new Map<number, number>();
  for (const current of forest.postOrder) {
    const children = forest.childrenByParent.get(current.id) ?? [];
    let childrenHeight = 0;
    for (const child of children) {
      const childSpan = spans.get(child.id)!;
      childrenHeight = childrenHeight + childSpan;
      if (!Number.isFinite(childrenHeight)) return null;
    }
    if (children.length > 1) {
      childrenHeight += SIBLING_VERTICAL_GAP * (children.length - 1);
    }
    const span = Math.max(current.height, childrenHeight);
    if (!Number.isFinite(childrenHeight) || !Number.isFinite(span)) return null;
    childrenHeights.set(current.id, childrenHeight);
    spans.set(current.id, span);
  }

  const positions = new Map<number, LayoutPoint>();
  let nextTreeTop: number | null = null;
  for (const [rootIndex, root] of forest.roots.entries()) {
    const rootSpan = spans.get(root.id)!;
    const top = rootIndex === 0
      ? root.y - (rootSpan - root.height) / 2
      : nextTreeTop!;
    if (!Number.isFinite(top)) return null;
    const stack = [{ node: root, top }];
    while (stack.length > 0) {
      const frame = stack.pop()!;
      const depth = forest.depthById.get(frame.node.id)!;
      const span = spans.get(frame.node.id)!;
      const y = frame.top + (span - frame.node.height) / 2;
      if (!Number.isFinite(y)) return null;
      positions.set(frame.node.id, { x: columnX[depth], y });

      const children = forest.childrenByParent.get(frame.node.id) ?? [];
      const childFrames: Array<{ node: (typeof children)[number]; top: number }> = [];
      let childTop = frame.top + (span - childrenHeights.get(frame.node.id)!) / 2;
      for (const child of children) {
        childFrames.push({ node: child, top: childTop });
        childTop += spans.get(child.id)! + SIBLING_VERTICAL_GAP;
        if (!Number.isFinite(childTop)) return null;
      }
      for (let index = childFrames.length - 1; index >= 0; index -= 1) {
        stack.push(childFrames[index]);
      }
    }
    nextTreeTop = top + rootSpan + TREE_VERTICAL_GAP;
    if (!Number.isFinite(nextTreeTop)) return null;
  }

  for (const level of forest.nodesByDepth) {
    let previousBottom: number | null = null;
    for (const current of level) {
      const point = positions.get(current.id)!;
      if (previousBottom !== null && point.y < previousBottom + SIBLING_VERTICAL_GAP) return null;
      previousBottom = point.y + current.height;
      if (!Number.isFinite(previousBottom)) return null;
    }
  }
  return positions;
}
```

Do not sort levels and do not use a rectangle all-pairs loop. Traversal order from Task 1 is the vertical order invariant.

- [ ] **Step 4: Temporarily add the thin public wrapper and make the geometry tests GREEN**

Create `client/src/domain/nodes/nodeAutoLayout.ts`:

```ts
import { calculateNodePositions } from "@/domain/nodes/nodeLayoutGeometry";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { Node } from "@/types/node";

export function layoutNodeForest(nodes: readonly Node[]): Node[] | null {
  const forest = indexNodeForest(nodes);
  if (!forest) return null;
  const positions = calculateNodePositions(forest);
  if (!positions) return null;
  return nodes.map((node) => {
    const point = positions.get(node.id)!;
    return point.x === node.x && point.y === node.y
      ? node
      : { ...node, x: point.x, y: point.y };
  });
}
```

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeAutoLayout.test.ts`

Expected: PASS for anchoring, X columns, centered siblings, and multiple roots.

- [ ] **Step 5: Commit the geometry deliverable**

```bash
git add client/src/config/shapes.ts client/src/domain/nodes/nodeLayoutGeometry.ts client/src/domain/nodes/nodeAutoLayout.ts client/src/domain/nodes/__tests__/nodeAutoLayout.test.ts
git commit -m "feat(layout): 重なりを避ける座標計算を追加"
```

### Task 3: 公開レイアウト契約の境界値と不変条件

**Files:**
- Modify: `client/src/domain/nodes/__tests__/nodeAutoLayout.test.ts`
- Modify: `client/src/domain/nodes/nodeAutoLayout.ts`
- Modify: `client/src/domain/nodes/nodeLayoutGeometry.ts`

**Interfaces:**
- Consumes: Task 1 and Task 2 interfaces
- Produces: `layoutNodeForest(nodes: readonly Node[]): Node[] | null`

- [ ] **Step 1: Add failing tests for immutability, independent overlap checking, invalid input, and arithmetic overflow**

```ts
function overlaps(a: Node, b: Node): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

it("有効入力では新配列を返し、未移動参照と座標以外を維持する", () => {
  const root = node(1, null, 80, 120);
  const child = node(2, 1, 0, 0);
  const input = [root, child];
  const snapshot = input.map((current) => ({ ...current }));
  const result = layoutNodeForest(input)!;

  expect(result).not.toBe(input);
  expect(result[0]).toBe(root);
  expect(result[1]).not.toBe(child);
  expect(result.map(({ id, parentId, width, height, label }) => ({ id, parentId, width, height, label })))
    .toEqual(snapshot.map(({ id, parentId, width, height, label }) => ({ id, parentId, width, height, label })));
  expect(input).toEqual(snapshot);
});

it("異なる寸法・深さ・複数ルートの全組み合わせが重ならない", () => {
  const result = layoutNodeForest([
    node(1, null, 20, 50, 130, 90), node(2, 1, 0, 0, 70, 40),
    node(3, 1, 0, 0, 200, 120), node(4, 2, 0, 0, 50, 180),
    node(9, null, 0, 0, 160, 75), node(10, 9, 0, 0, 90, 60),
  ])!;
  for (let left = 0; left < result.length; left += 1) {
    for (let right = left + 1; right < result.length; right += 1) {
      expect(overlaps(result[left], result[right])).toBe(false);
    }
  }
});

it.each([
  ["空配列", [], []],
  ["ID重複", [node(1, null), node(1, null)], null],
  ["親欠損", [node(1, 99)], null],
  ["循環", [node(1, 2), node(2, 1)], null],
  ["列位置overflow", [node(1, null, Number.MAX_VALUE, 0, Number.MAX_VALUE), node(2, 1)], null],
  ["部分木span overflow", [node(1, null), node(2, 1, 0, 0, 1, Number.MAX_VALUE), node(3, 1, 0, 0, 1, Number.MAX_VALUE)], null],
])("%sの公開結果を返す", (_name, input, expected) => {
  expect(layoutNodeForest(input)).toEqual(expected);
});
```

- [ ] **Step 2: Run both domain suites and confirm any missing checks fail**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeLayoutForest.test.ts src/domain/nodes/__tests__/nodeAutoLayout.test.ts`

Expected: At least the overflow cases FAIL until every intermediate arithmetic result is checked.

- [ ] **Step 3: Tighten each arithmetic boundary without changing the public signature**

Use explicit checked helpers for addition, subtraction, and multiplication:

```ts
function checkedAdd(left: number, right: number): number | null {
  const result = left + right;
  if (!Number.isFinite(result)) return null;
  if (right > 0 && result <= left) return null;
  if (right < 0 && result >= left) return null;
  return result;
}

function checkedSubtract(left: number, right: number): number | null {
  const result = left - right;
  if (!Number.isFinite(result)) return null;
  if (right > 0 && result >= left) return null;
  if (right < 0 && result <= left) return null;
  return result;
}

function checkedMultiply(left: number, right: number): number | null {
  const result = left * right;
  return Number.isFinite(result) ? result : null;
}
```

Apply them before every column, gap, span, top, Y, and bottom update. The monotonicity checks reject finite-number precision saturation such as `Number.MAX_VALUE + 100 === Number.MAX_VALUE`, which would otherwise permit overlapping rectangles. Return `null` immediately when a helper returns `null`; never retain partial positions as a result.

- [ ] **Step 4: Run domain suites and the whole test suite**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeLayoutForest.test.ts src/domain/nodes/__tests__/nodeAutoLayout.test.ts`

Expected: PASS.

Run: `cd client && npm test -- --runInBand`

Expected: all suites PASS with no regression.

- [ ] **Step 5: Commit the hardened public contract**

```bash
git add client/src/domain/nodes/nodeAutoLayout.ts client/src/domain/nodes/nodeLayoutGeometry.ts client/src/domain/nodes/__tests__/nodeAutoLayout.test.ts
git commit -m "test(layout): レイアウト境界値の検証を拡充"
```

### PR 1 Verification and Merge Checkpoint

- [ ] Run: `cd client && npm run verify`
- [ ] Expected: Tailwind scan, ESLint, TypeScript, all Jest suites, and Next.js build PASS.
- [ ] Create and merge the layout-engine PR.
- [ ] During post-merge cleanup, mark the first two Phase 4 roadmap items complete and sync local `main` with `origin/main`.

---

## PR 2: Hookの自動更新

### Task 4: レイアウトモードと切り替え時の原子的整列

**Files:**
- Create: `client/src/types/nodeLayout.ts`
- Modify: `client/src/hooks/useNodes.ts:1-117`
- Modify: `client/src/hooks/__tests__/useNodes.test.ts`

**Interfaces:**
- Consumes: `layoutNodeForest(nodes: readonly Node[]): Node[] | null`
- Produces: `NodeLayoutMode = "manual" | "auto"`
- Extends `UseNodesReturn` with `layoutMode: NodeLayoutMode` and `setLayoutMode(mode: NodeLayoutMode): void`

- [ ] **Step 1: Write failing mode-transition and stale-command tests**

```ts
it("手動配置で開始し、自動配置への切り替え直後に全体を整列する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  act(() => {
    result.current.addNode(100, 100);
    result.current.addNode(500, 300);
  });
  const firstRoot = result.current.nodes[0];

  act(() => result.current.setLayoutMode("auto"));

  expect(result.current.layoutMode).toBe("auto");
  expect(result.current.nodes[0]).toMatchObject({ x: firstRoot.x, y: firstRoot.y });
  expect(result.current.nodes[1].x).toBe(firstRoot.x);
  expect(result.current.nodes[1].y).toBeGreaterThan(firstRoot.y + firstRoot.height);
});

it("初回renderで取得したsetLayoutModeが最新ノードを整列し参照も安定する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  const setLayoutMode = result.current.setLayoutMode;
  act(() => {
    result.current.addNode(100, 100);
    result.current.addNode(400, 400);
  });
  act(() => setLayoutMode("auto"));

  expect(result.current.layoutMode).toBe("auto");
  expect(result.current.setLayoutMode).toBe(setLayoutMode);
  expect(result.current.nodes[1].x).toBe(result.current.nodes[0].x);
});

it("無効な現在ノードでは自動モードへの切り替えを原子的に拒否する", () => {
  const { result } = renderHook(() => useNodes());
  act(() => result.current.addNode(Number.NaN, 100));
  const nodesBefore = result.current.nodes;

  act(() => result.current.setLayoutMode("auto"));

  expect(result.current.layoutMode).toBe("manual");
  expect(result.current.nodes).toBe(nodesBefore);
});
```

- [ ] **Step 2: Run the hook suite and confirm RED**

Run: `cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts`

Expected: FAIL because `layoutMode` and `setLayoutMode` are absent.

- [ ] **Step 3: Add the shared type and separate raw commit from layout-aware tree commit**

Create `client/src/types/nodeLayout.ts`:

```ts
export type NodeLayoutMode = "manual" | "auto";
```

In `useNodes.ts`, add stable state/ref boundaries:

```ts
const [layoutMode, setLayoutModeState] = useState<NodeLayoutMode>("manual");
const layoutModeRef = useRef<NodeLayoutMode>(layoutMode);

const commitNodes = useCallback((nextNodes: Node[]) => {
  nodesRef.current = nextNodes;
  setNodes(nextNodes);
}, []);

const applyTreeChange = useCallback((candidateNodes: Node[]): boolean => {
  const nextNodes = layoutModeRef.current === "auto"
    ? layoutNodeForest(candidateNodes)
    : candidateNodes;
  if (!nextNodes) return false;
  commitNodes(nextNodes);
  return true;
}, [commitNodes]);

const setLayoutMode = useCallback((mode: NodeLayoutMode) => {
  if (mode === layoutModeRef.current) return;
  let nextNodes: Node[] | null = [...nodesRef.current];
  if (mode === "auto") nextNodes = layoutNodeForest(nodesRef.current);
  if (!nextNodes) return;
  if (mode === "auto") commitNodes(nextNodes);
  layoutModeRef.current = mode;
  setLayoutModeState(mode);
}, [commitNodes]);

const selectNode = useCallback((id: number | null) => {
  setSelectedNodeId(id);
}, []);
```

Expose `layoutMode` and `setLayoutMode` from `UseNodesReturn` and the returned object. Keep `nodesRef`, `layoutModeRef`, React state, and selection unchanged when layout returns `null`.

- [ ] **Step 4: Make label updates bypass auto layout and pass the focused tests**

Replace the old generic `updateNodes` use in label editing with a raw commit:

```ts
const updateNodeLabel = useCallback((id: number, label: string) => {
  const nextNodes = nodesRef.current.map((node) => (
    node.id === id ? { ...node, label } : node
  ));
  commitNodes(nextNodes);
}, [commitNodes]);
```

Run: `cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts`

Expected: PASS for existing manual behavior and the three new mode tests.

- [ ] **Step 5: Commit the mode state deliverable**

```bash
git add client/src/types/nodeLayout.ts client/src/hooks/useNodes.ts client/src/hooks/__tests__/useNodes.test.ts
git commit -m "feat(layout): 自動配置モードを追加"
```

### Task 5: 構造commandの自動再配置とドラッグ抑止

**Files:**
- Modify: `client/src/hooks/useNodes.ts`
- Modify: `client/src/hooks/__tests__/useNodes.test.ts`

**Interfaces:**
- Consumes: `applyTreeChange(candidateNodes: Node[]): boolean` from Task 4
- Preserves: `addNode(): number`, `addChildNode(): number | null`, `addSiblingNode(): number | null`, `connectNodes(): boolean`, `deleteNode(): void`

- [ ] **Step 1: Write failing tests for every structural command and the move guard**

```ts
it("自動モード中は追加・削除・接続の各成功後に全体を再配置する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  act(() => {
    result.current.addNode(100, 100);
    result.current.addNode(600, 300);
    result.current.setLayoutMode("auto");
  });
  act(() => result.current.addChildNode(1));
  expect(result.current.nodes.find((node) => node.id === 3)?.x)
    .toBe(result.current.nodes[0].x + result.current.nodes[0].width + CHILD_HORIZONTAL_GAP);

  act(() => result.current.addSiblingNode(3));
  const children = result.current.nodes.filter(({ parentId }) => parentId === 1);
  expect(children[1].y).toBe(children[0].y + children[0].height + SIBLING_VERTICAL_GAP);

  act(() => result.current.connectNodes(2, 3));
  expect(result.current.nodes.find(({ id }) => id === 3)?.parentId).toBe(2);
  expect(result.current.nodes.find(({ id }) => id === 3)?.x)
    .toBe(result.current.nodes.find(({ id }) => id === 2)!.x + RECT_WIDTH + CHILD_HORIZONTAL_GAP);

  act(() => result.current.deleteNode(3));
  expect(result.current.nodes.some(({ id }) => id === 3)).toBe(false);
  expect(result.current.nodes[0]).toMatchObject({ x: 50, y: 70 });
});

it("自動モード中のmoveNodeは配列参照と全座標を維持する", () => {
  const { result } = renderHook(() => useNodes());
  act(() => result.current.addNode(100, 100));
  act(() => result.current.setLayoutMode("auto"));
  const nodesBefore = result.current.nodes;

  act(() => result.current.moveNode(nodesBefore[0].id, 900, 900));

  expect(result.current.nodes).toBe(nodesBefore);
});

it("空の自動モードで最初に追加したルート位置をアンカーにする", () => {
  const { result } = renderHook(() => useNodes());
  act(() => result.current.setLayoutMode("auto"));
  act(() => result.current.addNode(320, 240));

  expect(result.current.nodes[0]).toMatchObject({
    x: 320 - RECT_WIDTH / 2,
    y: 240 - RECT_HEIGHT / 2,
  });
});

it("自動モードで兄弟削除後に残った兄弟を親の中央へ戻す", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  act(() => {
    result.current.addNode(100, 100);
    result.current.addChildNode(1);
    result.current.addChildNode(1);
    result.current.setLayoutMode("auto");
  });
  expect(result.current.nodes.find(({ id: nodeId }) => nodeId === 3)?.y).not.toBe(70);

  act(() => result.current.deleteNode(2));

  expect(result.current.nodes.find(({ id: nodeId }) => nodeId === 3)?.y).toBe(70);
});

it("自動配置に失敗した追加はstateを変えずID契約を維持する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  act(() => result.current.setLayoutMode("auto"));
  const before = result.current.nodes;
  let rejectedId!: number;

  act(() => { rejectedId = result.current.addNode(Number.NaN, 0); });

  expect(rejectedId).toBe(1);
  expect(result.current.nodes).toBe(before);
  expect(result.current.layoutMode).toBe("auto");
});

it("自動配置に失敗した子追加はnullを返し選択を変えない", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  act(() => result.current.addNode(Number.MAX_VALUE, 0));
  act(() => result.current.setLayoutMode("auto"));
  const nodesBefore = result.current.nodes;
  let childId!: number | null;

  act(() => { childId = result.current.addChildNode(1); });

  expect(childId).toBeNull();
  expect(result.current.nodes).toBe(nodesBefore);
  expect(result.current.selectedNodeId).toBeNull();
});

it("自動配置に失敗した兄弟追加と接続は既存stateを維持する", () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { result } = renderHook(() => useNodes());
  act(() => result.current.addNode(0, Number.MAX_VALUE));
  act(() => result.current.setLayoutMode("auto"));
  const beforeSibling = result.current.nodes;
  let siblingId!: number | null;
  act(() => { siblingId = result.current.addSiblingNode(1); });
  expect(siblingId).toBeNull();
  expect(result.current.nodes).toBe(beforeSibling);

  act(() => result.current.setLayoutMode("manual"));
  act(() => result.current.addNode(0, 0));
  act(() => result.current.moveNode(1, Number.MAX_VALUE, 0));
  act(() => result.current.setLayoutMode("auto"));
  const beforeConnection = result.current.nodes;
  act(() => result.current.selectNode(1));
  let connected!: boolean;
  act(() => { connected = result.current.connectNodes(1, 3); });
  expect(connected).toBe(false);
  expect(result.current.nodes).toBe(beforeConnection);
  expect(result.current.selectedNodeId).toBe(1);
});
```

Import `CHILD_HORIZONTAL_GAP`, `SIBLING_VERTICAL_GAP`, `RECT_WIDTH`, and `RECT_HEIGHT` from `@/config/shapes` in the test.

- [ ] **Step 2: Run the hook suite and confirm RED**

Run: `cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts`

Expected: FAIL because structural commands still commit raw candidates and `moveNode` still moves in auto mode.

- [ ] **Step 3: Route successful structural candidates through one atomic boundary**

Use these command shapes in `useNodes.ts`:

```ts
const addNode = useCallback((x: number, y: number) => {
  const id = generateNodeId();
  applyTreeChange([...nodesRef.current, createRootNode(id, x, y)]);
  return id;
}, [applyTreeChange, generateNodeId]);

const addChildNode = useCallback((parentId: number) => {
  const current = nodesRef.current;
  if (!current.some((node) => node.id === parentId)) return null;
  const id = generateNodeId();
  const child = createChildNode(current, parentId, id);
  if (!child || !applyTreeChange([...current, child])) return null;
  setSelectedNodeId(id);
  return id;
}, [applyTreeChange, generateNodeId]);

const moveNode = useCallback((id: number, x: number, y: number) => {
  if (layoutModeRef.current === "auto") return;
  const movedNodes = moveNodeSubtree(nodesRef.current, id, x, y);
  if (movedNodes) commitNodes(movedNodes);
}, [commitNodes]);
```

Apply the same candidate-first pattern to siblings, connection, and deletion. Only update selection after `applyTreeChange` returns `true`. For deletion, calculate `subtreeIds`, apply the filtered candidate, and clear a selected descendant only after success.

- [ ] **Step 4: Add explicit non-layout tests for label, selection, and mode return coordinates**

```ts
it("自動モード中のラベル・選択変更は座標を再計算しない", () => {
  const { result } = renderHook(() => useNodes());
  act(() => result.current.addNode(100, 100));
  act(() => result.current.setLayoutMode("auto"));
  const positioned = result.current.nodes;
  act(() => {
    result.current.updateNodeLabel(positioned[0].id, "更新");
    result.current.selectNode(positioned[0].id);
  });
  expect(result.current.nodes[0]).toMatchObject({ x: positioned[0].x, y: positioned[0].y });
});

it("手動モードへ戻しても自動配置済み座標を維持する", () => {
  const { result } = renderHook(() => useNodes());
  act(() => {
    result.current.addNode(100, 100);
    result.current.addNode(500, 300);
    result.current.setLayoutMode("auto");
  });
  const autoCoordinates = result.current.nodes.map(({ x, y }) => ({ x, y }));
  act(() => result.current.setLayoutMode("manual"));
  expect(result.current.nodes.map(({ x, y }) => ({ x, y }))).toEqual(autoCoordinates);
});
```

Run: `cd client && npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts`

Expected: PASS for all old and new Hook contracts.

- [ ] **Step 5: Commit the structural update deliverable**

```bash
git add client/src/hooks/useNodes.ts client/src/hooks/__tests__/useNodes.test.ts
git commit -m "feat(layout): 構造変更後に自動整列する"
```

### PR 2 Verification and Merge Checkpoint

- [ ] Run: `cd client && npm run verify`
- [ ] Expected: Tailwind scan, ESLint, TypeScript, all Jest suites, and Next.js build PASS.
- [ ] Create and merge the Hook auto-update PR.
- [ ] During post-merge cleanup, mark the Phase 4 automatic-update roadmap item complete and sync local `main` with `origin/main`.

---

## PR 3: モードUIと統合

### Task 6: ヘッダーの手動・自動セグメント切り替え

**Files:**
- Modify: `client/src/components/layout/AppHeader.tsx:1-12`
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `NodeLayoutMode` from `@/types/nodeLayout`
- Produces props: `{ layoutMode: NodeLayoutMode; onLayoutModeChange: (mode: NodeLayoutMode) => void }`

- [ ] **Step 1: Replace zero-prop tests with failing accessible-control tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { AppHeader } from "@/components/layout/AppHeader";

const onLayoutModeChange = jest.fn();

it("現在モードをaria-pressedで示しクリックしたモードを通知する", () => {
  render(<AppHeader layoutMode="manual" onLayoutModeChange={onLayoutModeChange} />);
  const manual = screen.getByRole("button", { name: "手動配置" });
  const auto = screen.getByRole("button", { name: "自動配置" });
  expect(manual).toHaveAttribute("type", "button");
  expect(manual).toHaveAttribute("aria-pressed", "true");
  expect(auto).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(auto);
  expect(onLayoutModeChange).toHaveBeenCalledWith("auto");
});

it.each([
  ["manual", /ノードドラッグで移動/],
  ["auto", /追加・削除・接続時に自動整列/],
] as const)("%sモードの操作案内を表示する", (layoutMode, hint) => {
  render(<AppHeader layoutMode={layoutMode} onLayoutModeChange={onLayoutModeChange} />);
  expect(screen.getByText(hint)).toBeInTheDocument();
});
```

Retain the existing title assertion and style assertion, passing the required props.

```tsx
it("手動モードの操作ヒントへ既存の文字色を適用する", () => {
  render(<AppHeader layoutMode="manual" onLayoutModeChange={onLayoutModeChange} />);
  const hint = screen.getByText(
    "空白ダブルクリックで追加・ノードダブルクリックで編集・ノードドラッグで移動・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続",
  );
  expect(hint).toHaveClass("text-zinc-600", "dark:text-zinc-400");
});
```

- [ ] **Step 2: Run the component suite and confirm RED**

Run: `cd client && npm test -- --runInBand src/components/layout/__tests__/AppHeader.test.tsx`

Expected: FAIL because `AppHeader` accepts no props and has no buttons.

- [ ] **Step 3: Implement the controlled segmented buttons and mode-specific hint**

```tsx
import type { NodeLayoutMode } from "@/types/nodeLayout";

type AppHeaderProps = {
  layoutMode: NodeLayoutMode;
  onLayoutModeChange: (mode: NodeLayoutMode) => void;
};

const baseButton = "px-3 py-1 text-sm transition-colors";
const selectedButton = "bg-blue-600 text-white";
const idleButton = "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";

export function AppHeader({ layoutMode, onLayoutModeChange }: AppHeaderProps) {
  const hint = layoutMode === "manual"
    ? "空白ダブルクリックで追加・ノードダブルクリックで編集・ノードドラッグで移動・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続"
    : "空白ダブルクリックで追加・ノードダブルクリックで編集・追加・削除・接続時に自動整列・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続";

  return (
    <header className="flex items-center gap-4 bg-white px-6 py-3 shadow-sm dark:bg-zinc-800">
      <h1 className="shrink-0 text-lg font-semibold text-zinc-800 dark:text-zinc-100">Draw My Map</h1>
      <div className="flex overflow-hidden rounded-md" role="group" aria-label="レイアウトモード">
        {(["manual", "auto"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={layoutMode === mode}
            className={`${baseButton} ${layoutMode === mode ? selectedButton : idleButton}`}
            onClick={() => onLayoutModeChange(mode)}
          >
            {mode === "manual" ? "手動配置" : "自動配置"}
          </button>
        ))}
      </div>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</span>
    </header>
  );
}
```

- [ ] **Step 4: Run the component suite and Tailwind scan**

Run: `cd client && npm test -- --runInBand src/components/layout/__tests__/AppHeader.test.tsx`

Expected: PASS.

Run: `cd client && npm run tailwind:scan`

Expected: PASS with all static class names detected.

- [ ] **Step 5: Commit the header deliverable**

```bash
git add client/src/components/layout/AppHeader.tsx client/src/components/layout/__tests__/AppHeader.test.tsx
git commit -m "feat(layout): 配置モード切り替えUIを追加"
```

### Task 7: ページ境界のモード配線

**Files:**
- Modify: `client/src/app/page.tsx:7-39`
- Modify: `client/src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `layoutMode`, `setLayoutMode` from `useNodes`
- Passes: `layoutMode`, `onLayoutModeChange={setLayoutMode}` to `AppHeader`
- Preserves: all current `MapStage` props

- [ ] **Step 1: Instrument component mocks and write the failing wiring assertion**

```tsx
const mockAppHeader = jest.fn((_props: object) => <header>Header</header>);
const mockMapStage = jest.fn((_props: object) => <div data-testid="map-stage" />);

jest.mock("@/components/layout/AppHeader", () => ({
  AppHeader: (props: object) => mockAppHeader(props),
}));
jest.mock("@/components/map/MapStage", () => ({
  MapStage: (props: object) => mockMapStage(props),
}));

it("useNodesの配置モードと変更commandをヘッダーへ渡す", () => {
  render(<Home />);
  expect(mockAppHeader.mock.calls[0][0]).toEqual(expect.objectContaining({
    layoutMode: "manual",
    onLayoutModeChange: expect.any(Function),
  }));
});
```

Keep the existing flexible-height layout assertion and clear both mocks in `beforeEach`.

- [ ] **Step 2: Run the page suite and confirm RED**

Run: `cd client && npm test -- --runInBand src/app/__tests__/page.test.tsx`

Expected: FAIL because `Home` currently renders `<AppHeader />` without mode props.

- [ ] **Step 3: Destructure and pass the exact Hook values**

```tsx
const {
  nodes,
  selectedNodeId,
  layoutMode,
  setLayoutMode,
  addNode,
  addChildNode,
  addSiblingNode,
  selectNode,
  updateNodeLabel,
  moveNode,
  connectNodes,
  deleteNode,
} = useNodes();

// JSX
<AppHeader layoutMode={layoutMode} onLayoutModeChange={setLayoutMode} />
```

Do not pass layout mode into `MapStage`; the Hook remains the single acceptance boundary for node movement.

- [ ] **Step 4: Run page and header suites**

Run: `cd client && npm test -- --runInBand src/app/__tests__/page.test.tsx src/components/layout/__tests__/AppHeader.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the page-wiring deliverable**

```bash
git add client/src/app/page.tsx client/src/app/__tests__/page.test.tsx
git commit -m "feat(layout): 配置モードをページへ接続"
```

### Task 8: 実HookとPixi操作を通す統合回帰テスト

**Files:**
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- Consumes: final `useNodes` interface and existing `MapStage` props
- Verifies: automatic add/connect layout and auto-mode drag rejection without changing `MapStage`

- [ ] **Step 1: Add an auto-mode integration harness**

```tsx
function AutoLayoutHarness() {
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
    setLayoutMode,
  } = useNodes();
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const firstRootId = addNode(100, 100);
    addNode(500, 300);
    selectNode(firstRootId);
    setLayoutMode("auto");
  }, [addNode, selectNode, setLayoutMode]);

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
      <output data-testid="selected-node-id">{selectedNodeId}</output>
    </>
  );
}
```

Task 5 makes `addNode` stable with `useCallback`; Task 4 makes `selectNode` and `setLayoutMode` stable. Depending only on these commands prevents an effect loop while the ref guard remains safe under Strict Mode.

- [ ] **Step 2: Write integration tests for automatic connection placement and drag rejection**

```tsx
it("自動モードでShift接続した子を親の右列へ再配置する", async () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { getByTestId } = await renderReady(<AutoLayoutHarness />);

  act(() => {
    mockNodePointerHandlers[0].pointerdown?.(pointer(100, 100, { shiftKey: true }));
    mockStageHandlers.pointermove?.(pointer(100, 220));
    mockStageHandlers.pointerup?.(pointer(100, 220));
  });

  const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
  const parent = nodes.find(({ id }) => id === 1)!;
  const child = nodes.find(({ id }) => id === 2)!;
  expect(child.parentId).toBe(parent.id);
  expect(child.x).toBe(parent.x + parent.width + CHILD_HORIZONTAL_GAP);
});

it("自動モードのpointer dragは実ノード座標を変えない", async () => {
  const { getByTestId } = await renderReady(<AutoLayoutHarness />);
  const before = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
  const root = before[0];

  act(() => {
    mockNodePointerHandlers[0].pointerdown?.(pointer(root.x + 10, root.y + 10));
    mockStageHandlers.pointermove?.(pointer(root.x + 80, root.y + 90));
    mockStageHandlers.pointerup?.(pointer(root.x + 80, root.y + 90));
  });

  const after = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
  expect(after.map(({ x, y }) => ({ x, y })))
    .toEqual(before.map(({ x, y }) => ({ x, y })));
});

it("自動モードのキーボード追加・削除後も最終座標を整列する", async () => {
  let id = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++id);
  const { getByTestId } = await renderReady(<AutoLayoutHarness />);

  fireEvent.keyDown(window, { key: "Tab" });
  let nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
  const root = nodes.find(({ id: nodeId }) => nodeId === 1)!;
  const child = nodes.find(({ id: nodeId }) => nodeId === 3)!;
  expect(child).toMatchObject({
    parentId: root.id,
    x: root.x + root.width + CHILD_HORIZONTAL_GAP,
    y: root.y,
  });
  expect(getByTestId("selected-node-id")).toHaveTextContent("3");

  fireEvent.keyDown(getByTestId("node-label-input"), { key: "Enter" });
  fireEvent.keyDown(window, { key: "Delete" });
  nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
  expect(nodes.map(({ id: nodeId }) => nodeId)).toEqual([1, 2]);
  expect(nodes[0]).toMatchObject({ x: root.x, y: root.y });
});
```

Import `CHILD_HORIZONTAL_GAP` from `@/config/shapes`. Use rendered node coordinates when generating pointer positions so the test remains valid after auto layout.

- [ ] **Step 3: Run the MapStage suite and resolve only integration-test defects**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/MapStage.test.tsx`

Expected: PASS. Production `MapStage.tsx` should remain unchanged; movement is rejected by `useNodes`.

- [ ] **Step 4: Run all focused Phase 4 suites together**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeLayoutForest.test.ts src/domain/nodes/__tests__/nodeAutoLayout.test.ts src/hooks/__tests__/useNodes.test.ts src/components/layout/__tests__/AppHeader.test.tsx src/app/__tests__/page.test.tsx src/components/map/__tests__/MapStage.test.tsx`

Expected: PASS with no open handles or console errors.

- [ ] **Step 5: Commit the integration coverage**

```bash
git add client/src/components/map/__tests__/MapStage.test.tsx
git commit -m "test(layout): 自動配置の統合操作を検証"
```

### PR 3 Verification and Merge Checkpoint

- [ ] Run: `cd client && npm run verify`
- [ ] Expected: Tailwind scan, ESLint, TypeScript, all Jest suites, and Next.js build PASS.
- [ ] Manually confirm the header buttons switch modes, auto mode realigns immediately, and pointer drag does not move nodes.
- [ ] Create and merge the mode-UI PR.
- [ ] During post-merge cleanup, mark the final Phase 4 roadmap item and Phase 4 itself complete, record the next unfinished Phase 5 item, remove merged local/remote feature branches and worktrees, and sync local `main` with `origin/main`.

## Final Regression Checklist

- [ ] Manual mode retains all Phase 1–3 add, edit, select, connect, subtree-move, pan, zoom, focus, and delete behavior.
- [ ] Auto mode preserves first-root position, input order, and every non-coordinate node field.
- [ ] Empty forests succeed; malformed forests and arithmetic overflow fail atomically.
- [ ] Deep reverse-ordered forests complete without recursion or superlinear node-array reads.
- [ ] No runtime dependency was added to `client/package.json` or `client/package-lock.json`.
- [ ] `git diff --check` reports no whitespace errors before each PR is pushed.
