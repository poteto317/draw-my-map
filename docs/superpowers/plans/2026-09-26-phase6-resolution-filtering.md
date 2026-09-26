# Phase 6 Resolution Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ノード重要度を保存・編集でき、ズーム倍率または手動指定に応じて、祖先経路を保ったままノードとエッジの表示密度を切り替えられるようにする。

**Architecture:** 完全な`Node[]`を唯一のマップ状態として維持し、表示対象IDは重要度・フィルターモード・viewport scaleから純粋関数で導出する。PixiJS描画は識別可能なノード・エッジ表示対象を返し、表示遷移専用Hookがopacityと当たり判定だけを更新する。永続化はV2を書き出し、V1を`medium`重要度へ移行して読み込む。

**Tech Stack:** TypeScript 5、React 19、Next.js 16、PixiJS 8、Jest 30、Testing Library、Tailwind CSS 4、Web Storage API

**Spec:** `docs/superpowers/specs/2026-09-26-phase6-resolution-filtering-design.md`

## Global Constraints

- 重要度は`high`、`medium`、`low`の3値とする。
- 新規ノードとV1から読み込んだノードの重要度は`medium`とする。
- フィルターモードは`auto`、`high`、`medium`、`all`とする。
- 自動表示の基本境界は`0.6`と`1.0`、ヒステリシス幅は`0.05`とする。
- 表示条件を満たすノードに加えて、その祖先をすべて表示する。
- フィルターは完全な`Node[]`を変更せず、表示、当たり判定、選択・編集可能性だけへ適用する。
- PNG / SVG出力、自動レイアウト、JSON保存は常に完全なマップを対象とする。
- フィルターモード、viewport、opacity、アニメーション進捗は永続化しない。
- JSON出力はV2とし、V1入力を受理して`medium`を補完する。
- Storageキー`draw-my-map.map.v1`は変更しない。
- フェード時間は160ms、ease-outとし、reduced motionでは即時切替する。
- 非表示へ移行するノードはフェード開始時点で操作不能にする。
- 新しい外部依存を追加しない。
- 実装コードより先に対応テストを追加し、REDを確認する。
- client変更後は`client`ディレクトリで`npm run verify`を実行する。
- `ROADMAP.md`は各PRのマージ後処理で実装済み項目だけ更新する。

## File Structure

### PR 1: 重要度モデルとV2永続化

- Create: `client/src/types/nodeImportance.ts` — 重要度型
- Create: `client/src/types/nodeResolution.ts` — 表示レベル、フィルターモードの型
- Modify: `client/src/types/node.ts` — `Node.importance`を必須化
- Create: `client/src/domain/nodes/nodeImportance.ts` — 既定重要度
- Create: `client/src/domain/nodes/nodeResolution.ts` — 重要度と表示レベルの判定
- Create: `client/src/domain/nodes/__tests__/nodeResolution.test.ts`
- Modify: `client/src/domain/nodes/nodePlacement.ts` — 新規ノードへ既定重要度を設定
- Modify: `client/src/domain/nodes/__tests__/nodePlacement.test.ts`
- Modify: `client/src/hooks/useNodes.ts` — `updateNodeImportance` command
- Create: `client/src/domain/nodes/nodeImportanceUpdate.ts` — 重要度更新の純粋変換
- Create: `client/src/domain/nodes/__tests__/nodeImportanceUpdate.test.ts`
- Modify: `client/src/hooks/__tests__/useNodes.test.ts`
- Modify: `client/src/types/mapDocument.ts` — V1入力とV2出力の型
- Modify: `client/src/domain/persistence/mapDocumentNode.ts` — version別ノード正規化
- Modify: `client/src/domain/persistence/mapDocumentNodeProjection.ts` — V2投影
- Create: `client/src/domain/persistence/mapDocumentNodeImportance.ts` — V1既定値とV2重要度検証
- Create: `client/src/domain/persistence/mapDocumentEncoder.ts` — V2生成とJSON直列化
- Create: `client/src/domain/persistence/mapDocumentDecoder.ts` — JSON解析、version振り分け、グラフ検証
- Modify: `client/src/domain/persistence/mapDocumentCodec.ts` — 互換APIの再公開
- Modify: `client/src/domain/persistence/__tests__/mapDocumentNode.test.ts`
- Modify: `client/src/domain/persistence/__tests__/mapDocumentNodeProjection.test.ts`
- Create: `client/src/domain/persistence/__tests__/mapDocumentNodeImportance.test.ts`
- Create: `client/src/domain/persistence/__tests__/mapDocumentEncoder.test.ts`
- Create: `client/src/domain/persistence/__tests__/mapDocumentDecoder.test.ts`
- Modify: `client/src/domain/persistence/__tests__/mapDocumentCodec.test.ts` — 公開APIの往復統合テスト
- Modify: `client/src/hooks/__tests__/useMapStorageRestoration.test.tsx`
- Modify: `client/src/app/__tests__/page.test.tsx`
- Create: `client/src/testing/createTestNode.ts` — setup用Node既定値
- Modify: Node fixtureを持つ既存`client/src/**/__tests__/*.{ts,tsx}` — setupを共通factoryへ移行し、期待値と契約では`importance`を明示

### PR 2: 表示判定とフィルターUI

- Create: `client/src/domain/nodes/nodeResolutionFilter.ts` — 自動レベルと可視ID導出
- Create: `client/src/domain/nodes/__tests__/nodeResolutionFilter.test.ts`
- Create: `client/src/hooks/useMapResolutionFilter.ts` — モード、レベル、可視IDの調停
- Create: `client/src/hooks/__tests__/useMapResolutionFilter.test.ts`
- Create: `client/src/components/layout/NodeImportanceSelector.tsx`
- Create: `client/src/components/layout/ResolutionFilterSelector.tsx`
- Create: `client/src/components/layout/__tests__/NodeImportanceSelector.test.tsx`
- Create: `client/src/components/layout/__tests__/ResolutionFilterSelector.test.tsx`
- Modify: `client/src/components/layout/AppHeader.tsx` — フィルターUI用slot
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`
- Modify: `client/src/components/map/pixi/renderMapNodes.ts` — 可視ノードだけを対話可能にする
- Modify: `client/src/components/map/pixi/renderMapEdges.ts` — 可視エッジだけを描画
- Modify: `client/src/components/map/pixi/renderMapScene.ts` — 可視IDを描画へ伝播
- Modify: `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapEdges.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapScene.test.ts`
- Modify: `client/src/components/map/pixi/stageInteractions.ts` — 可視IDによる入口検証
- Modify: `client/src/components/map/pixi/__tests__/stageInteractions.test.ts`
- Modify: `client/src/components/map/useMapStageInteractions.ts` — 可視ID Refの同期
- Modify: `client/src/components/map/__tests__/useMapStageInteractions.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx` — scale通知、可視ID、非表示化reset
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`
- Modify: `client/src/app/page.tsx` — 重要度・フィルターUI・MapStageの配線
- Modify: `client/src/app/__tests__/page.test.tsx`

### PR 3: フェードアニメーション

- Create: `client/src/components/map/pixi/mapVisibilityTween.ts` — opacity補間の純粋関数
- Create: `client/src/components/map/pixi/__tests__/mapVisibilityTween.test.ts`
- Create: `client/src/components/map/pixi/mapVisibilityAnimator.ts` — frame schedulingと表示対象更新
- Create: `client/src/components/map/pixi/__tests__/mapVisibilityAnimator.test.ts`
- Create: `client/src/components/map/useMapVisibilityTransition.ts` — animator lifecycleのReact接続
- Create: `client/src/components/map/__tests__/useMapVisibilityTransition.test.tsx`
- Modify: `client/src/components/map/pixi/renderMapNodes.ts` — ノード表示対象を返す
- Modify: `client/src/components/map/pixi/renderMapEdges.ts` — エッジを個別表示対象として返す
- Modify: `client/src/components/map/pixi/renderMapScene.ts` — scene表示対象の集約
- Modify: `client/src/components/map/MapStage.tsx` — scene差替えと可視目標をtransitionへ通知
- Modify: `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapEdges.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapScene.test.ts`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`

---

## PR 1: 重要度モデルとV2永続化

### Task 1: 重要度型と新規ノードの既定値

**Files:**
- Create: `client/src/types/nodeImportance.ts`
- Create: `client/src/types/nodeResolution.ts`
- Modify: `client/src/types/node.ts`
- Create: `client/src/domain/nodes/nodeImportance.ts`
- Create: `client/src/domain/nodes/nodeResolution.ts`
- Test: `client/src/domain/nodes/__tests__/nodeResolution.test.ts`
- Modify: `client/src/domain/nodes/nodePlacement.ts`
- Test: `client/src/domain/nodes/__tests__/nodePlacement.test.ts`
- Create: `client/src/testing/createTestNode.ts`
- Modify: Node fixtureを持つ既存`client/src/**/__tests__/*.{ts,tsx}`

**Interfaces:**
- Produces: `NodeImportance = "high" | "medium" | "low"`
- Produces: `DEFAULT_NODE_IMPORTANCE: NodeImportance`
- Produces: `ResolutionLevel = "high" | "medium" | "all"`
- Produces: `ResolutionFilterMode = "auto" | ResolutionLevel`
- Produces: `isNodeVisibleAtLevel(importance: NodeImportance, level: ResolutionLevel): boolean`

- [ ] **Step 1: Write failing resolution visibility tests**

```ts
import { isNodeVisibleAtLevel } from "@/domain/nodes/nodeResolution";

it.each([
  ["high", "high", true],
  ["medium", "high", false],
  ["low", "high", false],
  ["high", "medium", true],
  ["medium", "medium", true],
  ["low", "medium", false],
  ["high", "all", true],
  ["medium", "all", true],
  ["low", "all", true],
] as const)("%sを%sで表示する=%s", (importance, level, expected) => {
  expect(isNodeVisibleAtLevel(importance, level)).toBe(expected);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeResolution.test.ts`

Expected: FAIL because `nodeResolution.ts` does not exist.

- [ ] **Step 3: Add types and minimal importance rules**

```ts
export type NodeImportance = "high" | "medium" | "low";
```

```ts
export type ResolutionLevel = "high" | "medium" | "all";
export type ResolutionFilterMode = "auto" | ResolutionLevel;
```

```ts
export const DEFAULT_NODE_IMPORTANCE: NodeImportance = "medium";
```

```ts
const importanceRank: Record<NodeImportance, number> = { high: 2, medium: 1, low: 0 };
const minimumVisibleRank: Record<ResolutionLevel, number> = { high: 2, medium: 1, all: 0 };

export function isNodeVisibleAtLevel(
  importance: NodeImportance,
  level: ResolutionLevel,
): boolean {
  return importanceRank[importance] >= minimumVisibleRank[level];
}
```

Add `importance: NodeImportance` to `Node`. Set `importance: DEFAULT_NODE_IMPORTANCE` in `nodePlacement.createNode`.

- [ ] **Step 4: Update placement tests and all typed Node fixtures**

Add this assertion to each root, child, and sibling creation test:

```ts
expect(created).toMatchObject({ importance: "medium" });
```

Use `npm run typecheck` as the exhaustive list. Setup用Nodeは`client/src/testing/createTestNode.ts`へ既定値を集約し、期待値、永続化契約、不正入力では`importance`を明示する。フィールドをoptionalにせず、V1 decoding以外へruntime fallbackを追加しない。

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeResolution.test.ts src/domain/nodes/__tests__/nodePlacement.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add client/src/types client/src/domain/nodes client/src/testing client/src/components client/src/hooks client/src/services
git commit -m "feat(nodes): ノード重要度の基盤を追加"
```

### Task 2: 重要度更新command

**Files:**
- Create: `client/src/domain/nodes/nodeImportanceUpdate.ts`
- Test: `client/src/domain/nodes/__tests__/nodeImportanceUpdate.test.ts`
- Modify: `client/src/hooks/useNodes.ts`
- Test: `client/src/hooks/__tests__/useNodes.test.ts`

**Interfaces:**
- Consumes: `NodeImportance`
- Produces: `updateNodeImportance(id: number, importance: NodeImportance): boolean`

- [ ] **Step 1: Write failing Hook tests**

```ts
it("指定ノードの重要度だけを非構造変更として更新する", () => {
  const { result } = renderHook(() => useNodes());
  act(() => {
    result.current.addNode(100, 100);
    result.current.addNode(300, 100);
  });

  let updated = false;
  act(() => { updated = result.current.updateNodeImportance(1, "high"); });

  expect(updated).toBe(true);
  expect(result.current.nodes.map((node) => node.importance)).toEqual(["high", "medium"]);
});

it("存在しないノードの重要度更新ではstateを変更しない", () => {
  const { result } = renderHook(() => useNodes());
  act(() => { result.current.addNode(100, 100); });
  const before = result.current.nodes;
  let updated = true;

  act(() => { updated = result.current.updateNodeImportance(999, "low"); });

  expect(updated).toBe(false);
  expect(result.current.nodes).toBe(before);
});
```

For auto layout, spy on or compare node object positions before and after importance update and assert coordinates are unchanged.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeImportanceUpdate.test.ts src/hooks/__tests__/useNodes.test.ts`

Expected: FAIL because `updateNodeImportance` is absent.

- [ ] **Step 3: Implement the non-structural command**

```ts
export function replaceNodeImportance(
  nodes: readonly Node[],
  id: number,
  importance: NodeImportance,
): Node[] | null {
  if (!nodes.some((node) => node.id === id)) return null;
  return nodes.map((node) => (
    node.id === id ? { ...node, importance } : node
  ));
}
```

Hookは`replaceNodeImportance`を`applyNonStructuralChange`へ渡す。正しい対象更新、対象外ノードの参照維持、不在IDの`null`を純粋関数テストで確認し、Hookでは公開commandと状態遷移を確認する。

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeImportanceUpdate.test.ts src/hooks/__tests__/useNodes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add client/src/domain/nodes/nodeImportanceUpdate.ts client/src/domain/nodes/__tests__/nodeImportanceUpdate.test.ts client/src/hooks/useNodes.ts client/src/hooks/__tests__/useNodes.test.ts
git commit -m "feat(nodes): 重要度更新commandを追加"
```

### Task 3: V2保存とV1互換読み込み

**Files:**
- Modify: `client/src/types/mapDocument.ts`
- Modify: `client/src/domain/persistence/mapDocumentNode.ts`
- Modify: `client/src/domain/persistence/mapDocumentNodeProjection.ts`
- Create: `client/src/domain/persistence/mapDocumentNodeImportance.ts`
- Create: `client/src/domain/persistence/mapDocumentEncoder.ts`
- Create: `client/src/domain/persistence/mapDocumentDecoder.ts`
- Modify: `client/src/domain/persistence/mapDocumentCodec.ts`
- Modify: `client/src/domain/persistence/__tests__/mapDocumentNode.test.ts`
- Modify: `client/src/domain/persistence/__tests__/mapDocumentNodeProjection.test.ts`
- Create: `client/src/domain/persistence/__tests__/mapDocumentNodeImportance.test.ts`
- Create: `client/src/domain/persistence/__tests__/mapDocumentEncoder.test.ts`
- Create: `client/src/domain/persistence/__tests__/mapDocumentDecoder.test.ts`
- Modify: `client/src/domain/persistence/__tests__/mapDocumentCodec.test.ts`
- Modify: `client/src/hooks/__tests__/useMapStorageRestoration.test.tsx`
- Modify: `client/src/app/__tests__/page.test.tsx`

**Interfaces:**
- Produces: `MapDocumentV2 = NodeMapState & { version: 2 }`
- Produces: `MapDocument = MapDocumentV2`
- Produces: `normalizeMapDocumentNode(value, index, version): MapDocumentResult<Node>`
- Changes: `createMapDocument(...): MapDocumentV2`
- Changes: `parseMapDocumentJson(...): MapDocumentResult<MapDocumentV2>`

- [ ] **Step 1: Add failing Codec compatibility tests**

```ts
it("V2で重要度を往復する", () => {
  const document = createMapDocument([
    { ...node(1, null), importance: "high" },
    { ...node(2, 1), importance: "low" },
  ], "manual");

  expect(document.version).toBe(2);
  expect(parseMapDocumentJson(serializeMapDocument(document))).toEqual({
    ok: true,
    value: document,
  });
});

it("V1ノードへmediumを補完してV2として返す", () => {
  const legacy = JSON.stringify({
    version: 1,
    layoutMode: "manual",
    nodes: [{ id: 1, parentId: null, x: 0, y: 0, width: 160, height: 64, label: "旧形式" }],
  });

  expect(parseMapDocumentJson(legacy)).toEqual({
    ok: true,
    value: {
      version: 2,
      layoutMode: "manual",
      nodes: [expect.objectContaining({ id: 1, importance: "medium" })],
    },
  });
});

it.each([undefined, "urgent", 1])("V2の不正重要度%pを拒否する", (importance) => {
  const json = JSON.stringify({
    version: 2,
    layoutMode: "manual",
    nodes: [{ ...node(1, null), importance }],
  });
  expect(parseMapDocumentJson(json)).toEqual({
    ok: false,
    error: "node[0].importanceはhigh、medium、lowのいずれかである必要があります。",
  });
});
```

Also assert that V1 ignores an unknown `importance` field and still returns `medium`, while version 3 returns `未対応のマップ形式です。`.

- [ ] **Step 2: Run Codec tests and verify RED**

Run: `npm test -- --runInBand src/domain/persistence/__tests__/mapDocumentNodeImportance.test.ts src/domain/persistence/__tests__/mapDocumentEncoder.test.ts src/domain/persistence/__tests__/mapDocumentDecoder.test.ts src/domain/persistence/__tests__/mapDocumentCodec.test.ts`

Expected: FAIL because the responsibility-specific modules do not exist and V1 importance is not migrated.

- [ ] **Step 3: Split legacy input from current output types**

```ts
type MapDocumentV1Node = Pick<
  Node,
  "id" | "parentId" | "x" | "y" | "width" | "height" | "label"
>;

export type MapDocumentV1 = {
  version: 1;
  layoutMode: NodeLayoutMode;
  nodes: MapDocumentV1Node[];
};

export type MapDocumentV2 = NodeMapState & { version: 2 };
export type MapDocument = MapDocumentV2;
```

Keep `MapDocumentV1Node` private unless a test requires a public fixture type.

- [ ] **Step 4: Implement version-aware node normalization**

```ts
const importanceResult = normalizeMapDocumentNodeImportance(
  node.importance,
  index,
  version,
);
if (!importanceResult.ok) return importanceResult;
```

`mapDocumentNodeImportance`はV1の既定値補完とV2値検証だけを担当する。`mapDocumentEncoder`は投影、V2生成、直列化を担当し、`mapDocumentDecoder`はJSON解析、version振り分け、ノード・グラフ検証を担当する。`mapDocumentCodec`は従来の公開関数を再公開する互換ファサードとする。

- [ ] **Step 5: Update storage and page expectations**

Change expected snapshots to version 2 with `importance: "medium"`. Keep the literal V1 import fixture in `page.test.tsx` and assert the rendered node is normalized with medium importance. Assert restored V1 data is later saved as V2 after the 300ms debounce.

- [ ] **Step 6: Run persistence and integration tests**

Run: `npm test -- --runInBand src/domain/persistence src/hooks/__tests__/useMapStorageRestoration.test.tsx src/hooks/__tests__/useMapStoragePersistence.test.tsx src/app/__tests__/page.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run PR 1 verification**

Run: `npm run verify`

Expected: Tailwind scan, ESLint, TypeScript, all Jest suites, and Next.js build PASS.

- [ ] **Step 8: Commit Task 3 / PR 1 completion**

```bash
git add client/src
git commit -m "feat(persistence): 重要度をV2形式で保存"
```

---

## PR 2: 表示判定とフィルターUI

### Task 4: 自動レベルと祖先を含む可視ID

**Files:**
- Create: `client/src/domain/nodes/nodeResolutionFilter.ts`
- Test: `client/src/domain/nodes/__tests__/nodeResolutionFilter.test.ts`

**Interfaces:**
- Produces: `resolveAutomaticResolutionLevel(scale, previousLevel): ResolutionLevel`
- Produces: `resolveResolutionLevel(mode, scale, previousLevel): ResolutionLevel`
- Produces: `collectVisibleNodeIds(nodes, level): ReadonlySet<number>`

- [ ] **Step 1: Write failing boundary and ancestry tests**

```ts
it.each([
  [0.25, null, "high"], [0.599, null, "high"],
  [0.6, null, "medium"], [0.999, null, "medium"],
  [1, null, "all"],
  [0.64, "high", "high"], [0.65, "high", "medium"],
  [0.55, "medium", "medium"], [0.549, "medium", "high"],
  [1.04, "medium", "medium"], [1.05, "medium", "all"],
  [0.95, "all", "all"], [0.949, "all", "medium"],
] as const)("scale=%s previous=%s => %s", (scale, previous, expected) => {
  expect(resolveAutomaticResolutionLevel(scale, previous)).toBe(expected);
});

it("条件を満たす孫と祖先だけを表示する", () => {
  const nodes = [
    node(1, null, "low"),
    node(2, 1, "low"),
    node(3, 2, "high"),
    node(4, 1, "low"),
  ];
  expect([...collectVisibleNodeIds(nodes, "high")]).toEqual([1, 2, 3]);
});
```

Add a 10,000-node chain test and malformed missing-parent/cycle tests that complete without throwing.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeResolutionFilter.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure resolution rules**

Use exported constants `HIGH_TO_MEDIUM_SCALE = 0.65`, `MEDIUM_TO_HIGH_SCALE = 0.55`, `MEDIUM_TO_ALL_SCALE = 1.05`, `ALL_TO_MEDIUM_SCALE = 0.95`. Manual modes return themselves. Build `nodesById`, select nodes with `isNodeVisibleAtLevel`, then iteratively follow `parentId` with a per-path visited set. Finally construct the returned Set by iterating the original array so insertion order matches node order.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeResolutionFilter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add client/src/domain/nodes/nodeResolutionFilter.ts client/src/domain/nodes/__tests__/nodeResolutionFilter.test.ts
git commit -m "feat(filter): 解像度別の可視ノード判定を追加"
```

### Task 5: フィルター状態Hook

**Files:**
- Create: `client/src/hooks/useMapResolutionFilter.ts`
- Test: `client/src/hooks/__tests__/useMapResolutionFilter.test.ts`

**Interfaces:**
- Consumes: `{ nodes, scale, resetRevision }`
- Produces: `{ mode, level, visibleNodeIds, setMode }`

- [ ] **Step 1: Write failing Hook tests**

Test these exact transitions: initial `auto/all` at scale 1; zoom to 0.5 becomes high; manual medium remains medium at scale 0.25; returning auto at 0.25 becomes high; importance changes recalculate IDs; `resetRevision` increments and mode returns auto.

```ts
const { result, rerender } = renderHook(
  ({ scale, resetRevision }) => useMapResolutionFilter({ nodes, scale, resetRevision }),
  { initialProps: { scale: 1, resetRevision: 0 } },
);
expect(result.current).toMatchObject({ mode: "auto", level: "all" });
act(() => result.current.setMode("medium"));
rerender({ scale: 0.25, resetRevision: 0 });
expect(result.current.level).toBe("medium");
rerender({ scale: 0.25, resetRevision: 1 });
expect(result.current).toMatchObject({ mode: "auto", level: "high" });
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- --runInBand src/hooks/__tests__/useMapResolutionFilter.test.ts`

Expected: FAIL because the Hook does not exist.

- [ ] **Step 3: Implement Hook state and memoized derived IDs**

Keep only `mode` and the previous auto level as state/ref. Derive `level` with `resolveResolutionLevel`; derive IDs with `useMemo`. In a `useLayoutEffect` keyed by `resetRevision`, set mode to auto and clear the previous auto level before paint.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --runInBand src/hooks/__tests__/useMapResolutionFilter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add client/src/hooks/useMapResolutionFilter.ts client/src/hooks/__tests__/useMapResolutionFilter.test.ts
git commit -m "feat(filter): 表示モード状態を追加"
```

### Task 6: 重要度・表示モードUI

**Files:**
- Create: `client/src/components/layout/NodeImportanceSelector.tsx`
- Create: `client/src/components/layout/ResolutionFilterSelector.tsx`
- Test: `client/src/components/layout/__tests__/NodeImportanceSelector.test.tsx`
- Test: `client/src/components/layout/__tests__/ResolutionFilterSelector.test.tsx`
- Modify: `client/src/components/layout/AppHeader.tsx`
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`

**Interfaces:**
- `NodeImportanceSelector({ importance, disabled, onChange })`
- `ResolutionFilterSelector({ mode, level, onChange })`

- [ ] **Step 1: Write failing selector tests**

Assert exact button names, `type="button"`, disabled state, `aria-pressed`, and callback values. For auto mode assert text `現在: すべて` when level is all.

```ts
await user.click(screen.getByRole("button", { name: "重要度 高" }));
expect(onChange).toHaveBeenCalledWith("high");

await user.click(screen.getByRole("button", { name: "表示 中以上" }));
expect(onChange).toHaveBeenCalledWith("medium");
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- --runInBand src/components/layout/__tests__/NodeImportanceSelector.test.tsx src/components/layout/__tests__/ResolutionFilterSelector.test.tsx`

Expected: FAIL because both components are absent.

- [ ] **Step 3: Implement focused presentational components**

Use literal option arrays and Tailwind classes already used by `LayoutModeSelector`. Do not import `useNodes`, viewport, or persistence APIs into either component.

- [ ] **Step 4: Add selectors to `AppHeader` placement**

Add `importanceControls?: ReactNode` and `resolutionControls?: ReactNode` slots next to the existing layout controls. `AppHeader` only places these slots and does not import node state or resolution logic. Extend `AppHeader.test.tsx` with literal controls and assert both are rendered in DOM order after `LayoutModeOperationHint` and before operation controls.

- [ ] **Step 5: Run UI tests and verify GREEN**

Run: `npm test -- --runInBand src/components/layout/__tests__/NodeImportanceSelector.test.tsx src/components/layout/__tests__/ResolutionFilterSelector.test.tsx src/components/layout/__tests__/AppHeader.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add client/src/components/layout
git commit -m "feat(filter): 重要度と表示レベルUIを追加"
```

### Task 7: PixiJS表示・操作境界へ可視IDを適用

**Files:**
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`
- Modify: `client/src/components/map/pixi/renderMapEdges.ts`
- Modify: `client/src/components/map/pixi/renderMapScene.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapEdges.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapScene.test.ts`
- Modify: `client/src/components/map/pixi/stageInteractions.ts`
- Modify: `client/src/components/map/useMapStageInteractions.ts`
- Modify: `client/src/components/map/pixi/__tests__/stageInteractions.test.ts`
- Modify: `client/src/components/map/__tests__/useMapStageInteractions.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`
- Modify: `client/src/app/page.tsx`
- Modify: `client/src/app/__tests__/page.test.tsx`

**Interfaces:**
- `MapStage` consumes `visibleNodeIds: ReadonlySet<number>` and `onViewportScaleChange(scale: number)`.
- `renderMapScene` and child renderers consume `visibleNodeIds`.
- Stage interactions consume `visibleNodeIdsRef`.

- [ ] **Step 1: Write failing rendering tests**

For nodes, pass a Set excluding node 1 and assert its container has `alpha: 0`, `visible: false`, and `eventMode: "none"`; included nodes remain alpha 1 and interactive. For edges, use two child edges and assert only the edge whose parent and child are both visible is allocated/drawn.

- [ ] **Step 2: Write failing interaction tests**

Start a pointer gesture on a node excluded from `visibleNodeIdsRef` and assert selection, move, and connection callbacks remain untouched. Change visible IDs while dragging and assert `cancelActiveGesture` prevents the subsequent move/up from mutating the node.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- --runInBand src/components/map/pixi/__tests__/renderMapNodes.test.ts src/components/map/pixi/__tests__/renderMapEdges.test.ts src/components/map/pixi/__tests__/stageInteractions.test.ts src/components/map/__tests__/useMapStageInteractions.test.tsx`

Expected: FAIL because visible IDs are not accepted.

- [ ] **Step 4: Apply visibility at both rendering and gesture entry**

Add `visibleNodeIds` to renderer options. For this PR, hidden targets switch immediately. Add `visibleNodeIdsRef.current.has(nodeId)` to both node pointerdown validity checks. In the React wrapper, synchronize the Set in `useLayoutEffect` and cancel active gestures when any active node becomes hidden.

- [ ] **Step 5: Connect viewport scale without moving viewport ownership**

Keep viewport state inside`MapStage`. Add an effect calling `onViewportScaleChange(viewport.scale)` only when scale changes. `page.tsx` stores the latest scale, gives it to `useMapResolutionFilter`, then passes `visibleNodeIds` back to `MapStage`.

- [ ] **Step 6: Reset selection/editing before paint**

In `MapStage`, when `selectedNodeId` is not in `visibleNodeIds`, use `useLayoutEffect` to call `onSelectNode(null)`, `editing.cancelEditing()`, and `cancelActiveGesture()`. Update double-click hit resolution to use only visible nodes.

- [ ] **Step 7: Wire page-level selectors and add integration assertions**

Find `selectedNode` from the complete node array. Render `NodeImportanceSelector` through the header slot and call `updateNodeImportance(selectedNode.id, importance)` only when selection still exists. Render `ResolutionFilterSelector` from the filter Hook result. Create a node, select it through the MapStage mock callback, change importance to high, and assert the mock receives a node with `importance: "high"`. Change display mode and assert the MapStage mock receives the corresponding `visibleNodeIds`.

- [ ] **Step 8: Run MapStage and page tests**

Run: `npm test -- --runInBand src/components/map src/app/__tests__/page.test.tsx`

Expected: PASS, including hidden-node pointer, selection reset, manual mode, and auto zoom tests.

- [ ] **Step 9: Run PR 2 verification**

Run: `npm run verify`

Expected: all checks PASS.

- [ ] **Step 10: Commit Task 7 / PR 2 completion**

```bash
git add client/src
git commit -m "feat(filter): 可視ノードへ描画と操作を制限"
```

---

## PR 3: フェードアニメーション

### Task 8: opacity補間と表示アニメーター

**Files:**
- Create: `client/src/components/map/pixi/mapVisibilityTween.ts`
- Test: `client/src/components/map/pixi/__tests__/mapVisibilityTween.test.ts`
- Create: `client/src/components/map/pixi/mapVisibilityAnimator.ts`
- Test: `client/src/components/map/pixi/__tests__/mapVisibilityAnimator.test.ts`

**Interfaces:**
- `sampleVisibilityTween(tween, now): { opacity: number; done: boolean }`
- `MapVisibilityTarget = { key: string; setOpacity(value): void; setInteractive(enabled): void; setRendered(rendered): void }`
- `createMapVisibilityAnimator(dependencies)` returns `{ replaceTargets, setVisibleKeys, dispose }`

- [ ] **Step 1: Write failing tween tests**

```ts
expect(sampleVisibilityTween({
  from: 0,
  to: 1,
  startedAt: 100,
  durationMs: 160,
}, 180)).toEqual({ opacity: 0.875, done: false });

expect(sampleVisibilityTween({
  from: 1,
  to: 0,
  startedAt: 100,
  durationMs: 160,
}, 260)).toEqual({ opacity: 0, done: true });
```

Use cubic ease-out `1 - (1 - progress) ** 3` and clamp progress to`0...1`.

- [ ] **Step 2: Run tween tests and verify RED**

Run: `npm test -- --runInBand src/components/map/pixi/__tests__/mapVisibilityTween.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure tween**

Keep time math and easing free of PixiJS, React, and browser globals. Return exact endpoints at/beyond duration.

- [ ] **Step 4: Write failing animator tests with injected scheduler**

Use deterministic `now`, captured frame callback, and spies for target methods. Assert:

- hiding calls `setInteractive(false)` before the first frame;
- mid-frame opacity follows tween;
- completion calls `setRendered(false)`;
- showing calls `setRendered(true)` before animation and enables interaction only for visible targets;
- reversing at 80ms starts from the sampled 0.125/0.875 opacity rather than 0 or 1;
- reduced motion applies endpoint immediately without requesting a frame;
- replacing scene targets applies tracked opacity to the replacement;
- dispose cancels the scheduled frame and ignores later callback invocation.

- [ ] **Step 5: Implement the animator**

Inject these dependencies instead of reading globals inside the state machine:

```ts
type AnimatorDependencies = {
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  reducedMotion: () => boolean;
  durationMs?: number;
};
```

Track opacity/tween state by stable target key (`node:<id>`, `edge:<childId>`). `replaceTargets` must detach old objects without deleting logical tween state for keys still present.

- [ ] **Step 6: Run animator tests and verify GREEN**

Run: `npm test -- --runInBand src/components/map/pixi/__tests__/mapVisibilityTween.test.ts src/components/map/pixi/__tests__/mapVisibilityAnimator.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 8**

```bash
git add client/src/components/map/pixi/mapVisibilityTween.ts client/src/components/map/pixi/mapVisibilityAnimator.ts client/src/components/map/pixi/__tests__
git commit -m "feat(filter): 表示フェード制御を追加"
```

### Task 9: PixiJS sceneとReact lifecycleへフェードを統合

**Files:**
- Create: `client/src/components/map/useMapVisibilityTransition.ts`
- Test: `client/src/components/map/__tests__/useMapVisibilityTransition.test.tsx`
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`
- Modify: `client/src/components/map/pixi/renderMapEdges.ts`
- Modify: `client/src/components/map/pixi/renderMapScene.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapEdges.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapScene.test.ts`
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- `RenderedMapScene = { worldContainer: Container; visibilityTargets: Map<string, MapVisibilityTarget> }`
- `useMapVisibilityTransition({ scene, nodes, visibleNodeIds, reducedMotionQuery? })`

- [ ] **Step 1: Refactor renderer tests to require stable targets**

Assert each rendered node returns key`node:<id>` and each valid edge returns key`edge:<childId>`. Assert target adapters set Pixi `alpha`, `visible`, and node `eventMode`; edge targets never become interactive.

- [ ] **Step 2: Make edges individually addressable**

Replace the single combined edge Graphics with one Graphics per valid child relation. Preserve linear parent lookup and existing curve assertions. Return each edge adapter keyed by child ID.

- [ ] **Step 3: Write failing Hook lifecycle tests**

Render the Hook with mock scenes, rerender with a new visible Set, and assert animator calls. Rerender with a replacement scene and assert `replaceTargets`. Unmount and assert `dispose` exactly once. Mock `matchMedia("(prefers-reduced-motion: reduce)")` for immediate mode.

- [ ] **Step 4: Implement the lifecycle Hook**

Create the animator once per mounted `MapStage`; update its target registry whenever scene changes and visible keys whenever nodes/visible IDs change. Derive visible edge keys only when both parent and child are in the Set. Remove all browser listeners and dispose the animator on unmount.

- [ ] **Step 5: Integrate the returned scene in `MapStage`**

Store the whole`RenderedMapScene`, not only `worldContainer`. Viewport effects continue applying transforms to`scene.worldContainer`. Rendering creates all node/edge targets; visibility transition decides alpha/visible state. Preserve the PR 2 rule that hidden nodes are immediately non-interactive.

- [ ] **Step 6: Add MapStage animation integration tests**

With fake time/frame callbacks, verify node and edge opacity at start, 80ms, and 160ms; visibility target reversal; scene rebuild during animation; selected node reset before fade; and reduced motion endpoint behavior.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- --runInBand src/components/map/pixi src/components/map/__tests__/useMapVisibilityTransition.test.tsx src/components/map/__tests__/MapStage.test.tsx`

Expected: PASS.

- [ ] **Step 8: Run PR 3 and full Phase 6 verification**

Run: `npm run verify`

Expected: Tailwind scan, ESLint, TypeScript, all Jest suites, and Next.js build PASS.

- [ ] **Step 9: Commit Task 9 / Phase 6 completion**

```bash
git add client/src
git commit -m "feat(filter): ノードとエッジをフェード表示"
```

## Cross-PR Review Checklist

- [ ] V1 JSONと既存localStorageを読み込み、全ノードが`medium`になる。
- [ ] V2 JSONを再読込して重要度が失われない。
- [ ] 自動モードの4つのヒステリシス境界をテストする。
- [ ] 手動モード中のズームでレベルが変わらない。
- [ ] 高重要度の子孫へ至る低重要度祖先が表示される。
- [ ] 非表示ノードを選択、編集、ドラッグ、接続できない。
- [ ] 非表示化中のジェスチャーがcancelされる。
- [ ] 自動レイアウトと画像出力が完全なNode配列を使う。
- [ ] フェード反転、scene再作成、unmount、reduced motionをテストする。
- [ ] 各PRで`npm run verify`が成功する。
- [ ] 各PRマージ後に`ROADMAP.md`を実装結果と一致させる。
