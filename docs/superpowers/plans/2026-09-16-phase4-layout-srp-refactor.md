# Phase 4 Layout SRP Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 4レイアウトエンジンを処理段階別の純粋モジュールへ分割し、不要な末尾計算による有効な大座標入力の拒否と、設定gapが丸めで縮む配置の誤受理を解消する。

**Architecture:** `nodeLayoutForest`と`nodeLayoutGeometry`を合成境界だけに縮小し、親子索引、走査、数値演算、寸法、配置、間隔検証を独立モジュールへ移す。公開APIは維持し、各責務を直接テストしたうえで既存公開テストを統合回帰として残す。

**Tech Stack:** TypeScript 5、Jest 30、Next.js 16

**Spec:** `docs/superpowers/specs/2026-09-16-phase4-layout-srp-refactor-design.md`

## Global Constraints

- `layoutNodeForest(nodes: readonly Node[]): Node[] | null`を変更しない。
- 有効入力では新しい配列を返し、座標が変わらないノード参照を維持する。
- 最初のルートのX・Y、入力順、座標以外のフィールドを維持する。
- 無効入力、循環、overflow、精度飽和では`null`を返す。
- 公開動作維持の例外として、未使用末尾演算による有効大座標の誤拒否と、丸めで水平・兄弟・ツリーgapが縮む配置の誤受理を修正する。それ以外の公開契約は維持する。
- 本番処理は`O(n)`、非再帰、全ペア探索なしとする。
- 外部依存と機能を追加しない。
- テストを先に失敗させてから実装する。
- Gitコミットを作成しない。

---

### Task 1: 親子索引とツリー走査の分離

**Files:**
- Create: `client/src/domain/nodes/nodeLayoutForestRelations.ts`
- Create: `client/src/domain/nodes/nodeLayoutForestTraversal.ts`
- Modify: `client/src/domain/nodes/nodeLayoutForest.ts`
- Create: `client/src/domain/nodes/__tests__/nodeLayoutForestRelations.test.ts`
- Create: `client/src/domain/nodes/__tests__/nodeLayoutForestTraversal.test.ts`
- Modify: `client/src/domain/nodes/__tests__/nodeLayoutForest.test.ts`

**Interfaces:**
- Produces: `buildNodeForestRelations(nodes: readonly Node[]): NodeForestRelations | null`
- Produces: `traverseNodeForest(relations: NodeForestRelations): NodeForestTraversal | null`
- Preserves: `indexNodeForest(nodes: readonly Node[]): IndexedNodeForest | null`

- [ ] **Step 1: Add failing direct unit tests for relations and traversal**

```ts
expect(buildNodeForestRelations([
  node(2, 1), node(1, null), node(3, 1), node(9, null),
])?.roots.map(({ id }) => id)).toEqual([1, 9]);

expect(buildNodeForestRelations([node(1, 99)])).toBeNull();
expect(buildNodeForestRelations([node(1, null), node(1, null)])).toBeNull();

const traversal = traverseNodeForest(validRelations);
expect(traversal?.depthById.get(4)).toBe(2);
expect(traversal?.nodesByDepth.map((level) => level.map(({ id }) => id)))
  .toEqual([[1, 9], [2, 3], [4]]);
expect(traverseNodeForest(cyclicRelations)).toBeNull();
```

- [ ] **Step 2: Verify RED**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeLayoutForestRelations.test.ts src/domain/nodes/__tests__/nodeLayoutForestTraversal.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 3: Implement relation building only**

```ts
export type NodeForestRelations = {
  nodes: readonly Node[];
  roots: readonly Node[];
  childrenByParent: ReadonlyMap<number, readonly Node[]>;
};

export function buildNodeForestRelations(
  nodes: readonly Node[],
): NodeForestRelations | null {
  // Pass 1: validate node values and unique IDs.
  // Pass 2: validate parent existence and build ordered roots/children.
}
```

Move `isValidNode`, `nodesById`, `roots`, and `childrenByParent` from `nodeLayoutForest.ts`. Do not perform traversal here.

- [ ] **Step 4: Implement traversal only**

```ts
export type NodeForestTraversal = {
  depthById: ReadonlyMap<number, number>;
  nodesByDepth: readonly (readonly Node[])[];
  postOrder: readonly Node[];
};

export function traverseNodeForest(
  relations: NodeForestRelations,
): NodeForestTraversal | null {
  // Use the existing explicit entering/exiting stack.
  // Reject revisits and traversal counts unequal to relations.nodes.length.
}
```

Move only depth, order, post-order, cycle, and unreachable-node logic. Keep the 2,000-level test against this direct boundary.

- [ ] **Step 5: Reduce `indexNodeForest` to composition and verify GREEN**

```ts
export function indexNodeForest(nodes: readonly Node[]): IndexedNodeForest | null {
  const relations = buildNodeForestRelations(nodes);
  if (!relations) return null;
  const traversal = traverseNodeForest(relations);
  if (!traversal) return null;
  return { ...relations, ...traversal };
}
```

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeLayoutForestRelations.test.ts src/domain/nodes/__tests__/nodeLayoutForestTraversal.test.ts src/domain/nodes/__tests__/nodeLayoutForest.test.ts`

Expected: PASS. `nodeLayoutForest.test.ts` retains success/failure propagation and the composed boundary's linear input-read contract for 2,000 reverse-ordered nodes.

---

### Task 2: レイアウト計算段階の分離と不要な末尾計算の除去

**Files:**
- Create: `client/src/domain/nodes/nodeLayoutArithmetic.ts`
- Create: `client/src/domain/nodes/nodeLayoutMetrics.ts`
- Create: `client/src/domain/nodes/nodeLayoutPlacement.ts`
- Create: `client/src/domain/nodes/nodeLayoutSpacing.ts`
- Modify: `client/src/domain/nodes/nodeLayoutGeometry.ts`
- Create: `client/src/domain/nodes/__tests__/nodeLayoutArithmetic.test.ts`
- Create: `client/src/domain/nodes/__tests__/nodeLayoutMetrics.test.ts`
- Create: `client/src/domain/nodes/__tests__/nodeLayoutPlacement.test.ts`
- Create: `client/src/domain/nodes/__tests__/nodeLayoutSpacing.test.ts`
- Modify: `client/src/domain/nodes/__tests__/nodeAutoLayout.test.ts`

**Interfaces:**
- Produces: checked arithmetic, bounded rounding tolerance, and shared measured-gap validation
- Produces: `calculateNodeLayoutMetrics(forest): NodeLayoutMetrics | null`
- Produces: `placeNodeForest(forest, metrics): ReadonlyMap<number, LayoutPoint> | null`
- Produces: `hasValidVerticalSpacing(forest, positions): boolean`
- Preserves: `calculateNodePositions(forest): ReadonlyMap<number, LayoutPoint> | null`

- [ ] **Step 1: Add public RED tests for unused trailing calculations**

```ts
it("単一葉の未使用bottomとchildTopを計算せず大座標を維持する", () => {
  const root = node(1, null, 0, Number.MAX_VALUE);
  const result = layoutNodeForest([root]);
  expect(result).toEqual([root]);
  expect(result?.[0]).toBe(root);
});

it("最後の子の後へ未使用gapを加算しない", () => {
  const root = node(1, null, 0, Number.MAX_VALUE);
  const child = node(2, 1);
  const result = layoutNodeForest([root, child]);
  expect(result).not.toBeNull();
  expect(result?.[0].y).toBe(Number.MAX_VALUE);
  expect(result?.[1].y).toBe(Number.MAX_VALUE);
});
```

- [ ] **Step 2: Verify bug RED**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeAutoLayout.test.ts -t '未使用|最後の子'`

Expected: FAIL with `null` returned by the current unused child-top, trailing-gap, root-bottom, or level-bottom arithmetic.

- [ ] **Step 3: Add failing direct tests for every new responsibility**

```ts
expect(checkedAdd(Number.MAX_VALUE, 1)).toBeNull();
expect(checkedSubtract(-Number.MAX_VALUE, 1)).toBeNull();
expect(checkedMultiply(Number.MAX_VALUE, 2)).toBeNull();

expect(calculateNodeLayoutMetrics(forest)?.columnX).toEqual([80, 340, 660]);
expect(placeNodeForest(forest, metrics)?.get(firstRoot.id)).toEqual({ x: 80, y: 0.1 });
expect(hasValidVerticalSpacing(forest, exactGapPositions)).toBe(true);
expect(hasValidVerticalSpacing(forest, overlappingPositions)).toBe(false);
expect(hasValidVerticalSpacing(forest, ulpShortfallPositions)).toBe(true);
expect(hasValidVerticalSpacing(forest, meaningfulShortfallPositions)).toBe(false);
```

- [ ] **Step 4: Verify responsibility tests RED**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeLayoutArithmetic.test.ts src/domain/nodes/__tests__/nodeLayoutMetrics.test.ts src/domain/nodes/__tests__/nodeLayoutPlacement.test.ts src/domain/nodes/__tests__/nodeLayoutSpacing.test.ts`

Expected: FAIL because the four modules are absent.

- [ ] **Step 5: Extract arithmetic and metrics**

```ts
export function checkedAdd(left: number, right: number): number | null;
export function checkedSubtract(left: number, right: number): number | null;
export function checkedMultiply(left: number, right: number): number | null;
export function calculateRoundingTolerance(
  first: number,
  second: number,
  absoluteLimit: number,
): number;
export function hasSufficientGap(
  start: number,
  end: number,
  requiredGap: number,
): boolean;

export type NodeLayoutMetrics = {
  columnX: readonly number[];
  spanById: ReadonlyMap<number, number>;
  childrenHeightById: ReadonlyMap<number, number>;
};
```

Move existing checked arithmetic. Add pure `hasSufficientGap(start, end, requiredGap)` using checked subtraction and bounded rounding tolerance; derive its absolute tolerance limit inside the function as `requiredGap * 1e-9`. Share it across metrics, placement, and spacing. Move maximum-width columns and post-order span calculation into `calculateNodeLayoutMetrics`, validating each measured horizontal gap before accepting the next column.

- [ ] **Step 6: Extract placement and remove unused trailing operations**

```ts
export function placeNodeForest(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
): ReadonlyMap<number, LayoutPoint> | null;
```

Apply these exact loop rules:

- When `children.length === 0`, do not calculate `childrenTop`.
- Push each child frame in input order, but calculate `childTop + childSpan + gap` only when another child follows.
- Calculate `rootBottom + TREE_VERTICAL_GAP` only when another root follows.
- Validate the measured tree gap with `hasSufficientGap` before accepting the next tree top.
- Preserve the first root's exact input Y while still validating its intermediate calculated Y.

- [ ] **Step 7: Extract spacing validation without unused last-node bottom**

```ts
export function hasValidVerticalSpacing(
  forest: IndexedNodeForest,
  positions: ReadonlyMap<number, LayoutPoint>,
): boolean;
```

For each depth, validate every point's existence and finite Y and store the previous node, not a precomputed previous bottom. Starting with the second node only, calculate the previous rectangle bottom and use shared `hasSufficientGap` to validate the actual difference, overlap, and bounded ULP shortfall. This avoids a rounded minimum-top comparison and computing a bottom after the final node.

- [ ] **Step 8: Reduce geometry to composition and verify GREEN**

```ts
export function calculateNodePositions(
  forest: IndexedNodeForest,
): ReadonlyMap<number, LayoutPoint> | null {
  if (forest.nodes.length === 0) return new Map();
  const metrics = calculateNodeLayoutMetrics(forest);
  if (!metrics) return null;
  const positions = placeNodeForest(forest, metrics);
  if (!positions || !hasValidVerticalSpacing(forest, positions)) return null;
  return positions;
}
```

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeLayoutArithmetic.test.ts src/domain/nodes/__tests__/nodeLayoutMetrics.test.ts src/domain/nodes/__tests__/nodeLayoutPlacement.test.ts src/domain/nodes/__tests__/nodeLayoutSpacing.test.ts src/domain/nodes/__tests__/nodeAutoLayout.test.ts`

Expected: PASS, including the public large-coordinate regressions and all prior overflow/saturation cases.

---

### Task 3: 全体検証と再棚卸し

**Files:**
- Inspect: every file in `git diff --name-only origin/main...HEAD`
- Inspect: every uncommitted file in `git status --short`

**Interfaces:**
- Consumes all Task 1–2 modules
- Produces no new API

- [ ] **Step 1: Run focused domain tests**

Run: `cd client && npm test -- --runInBand src/domain/nodes/__tests__`

Expected: all node-domain suites PASS.

- [ ] **Step 2: Run full verification**

Run: `cd client && npm run verify`

Expected: Tailwind scan, ESLint, TypeScript, all Jest suites, and Next.js build PASS.

- [ ] **Step 3: Re-audit single responsibility**

Verify:

- `nodeLayoutForest.ts` only composes relations and traversal.
- `nodeLayoutGeometry.ts` only composes metrics, placement, and spacing.
- Each new file has one reason to change and no duplicated calculation block.
- Tests align one file per responsibility; public tests retain integration contracts.
- No changed production file combines validation, calculation, state mutation, and presentation.

- [ ] **Step 4: Preserve the uncommitted state**

Run: `git status --short`

Expected: refactor and test files remain uncommitted; no commit is created.
