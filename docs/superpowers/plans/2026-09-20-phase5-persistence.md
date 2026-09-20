# Phase 5 Data Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** マップをバージョン付きJSONとして安全に入出力し、同じ形式で`localStorage`へ自動保存・自動復元できるようにする。

**Architecture:** 未知データの正規化、親子グラフ検証、JSON Codecを純粋なドメイン層へ分離する。`useNodes`は検証済み状態の原子的置き換えだけを受け持ち、Storage・Fileアダプターと`useMapPersistence`がブラウザI/Oを調停し、UIはcommandと通知だけを表示する。

**Tech Stack:** TypeScript 5、React 19、Next.js 16、PixiJS 8、Jest 30、Testing Library、Tailwind CSS 4、Web Storage API、Blob / File API

**Spec:** `docs/superpowers/specs/2026-09-20-phase5-persistence-design.md`

## Global Constraints

- 保存形式は`version: 1`、`layoutMode`、`nodes`だけを持つ。
- JSONインポートは現在のマップ全体を置き換え、部分マージしない。
- 選択、編集中状態、viewportは保存しない。
- 不正データでは現在状態を一切変更しない。
- `localStorage`キーは`draw-my-map.map.v1`とする。
- 変更後300msで最新状態だけを自動保存する。
- 初期復元前の空マップで保存値を上書きしない。
- インポート済みIDと新規IDを衝突させない。
- 利用者向け通知は日本語にする。
- 新しい外部依存を追加しない。
- Hookのrender中に`window`、`localStorage`、`File`へアクセスせず、ブラウザAPIはeffectまたはユーザー操作時に解決する。
- PNG / SVG画像出力はこの計画の対象外とする。
- 実装コードを書く前に、対応するテストを追加して失敗を確認する。
- client変更後は`client`ディレクトリで`npm run verify`を実行する。

## File Structure

### PR 1: Codecと状態置換

- Create: `client/src/types/mapDocument.ts` — 永続化ドキュメント型と共通結果型
- Create: `client/src/domain/persistence/mapDocumentNode.ts` — 未知のノード値の正規化
- Create: `client/src/domain/persistence/mapDocumentGraph.ts` — ID・親参照・循環の検証
- Create: `client/src/domain/persistence/mapDocumentCodec.ts` — JSON解析・生成の公開境界
- Create: `client/src/domain/persistence/__tests__/mapDocumentNode.test.ts`
- Create: `client/src/domain/persistence/__tests__/mapDocumentGraph.test.ts`
- Create: `client/src/domain/persistence/__tests__/mapDocumentCodec.test.ts`
- Modify: `client/src/hooks/useNodeLayoutState.ts` — 検証済みstateの原子的置き換え
- Modify: `client/src/hooks/useNodes.ts` — `replaceMap`と衝突しないID採番
- Modify: `client/src/hooks/__tests__/useNodeLayoutState.test.ts`
- Modify: `client/src/hooks/__tests__/useNodes.test.ts`

### PR 2: Storage・File・UI統合

- Create: `client/src/services/persistence/mapStorage.ts` — Web Storage読み書き
- Create: `client/src/services/persistence/mapFileTransfer.ts` — File読み込みとJSONダウンロード
- Create: `client/src/services/persistence/__tests__/mapStorage.test.ts`
- Create: `client/src/services/persistence/__tests__/mapFileTransfer.test.ts`
- Create: `client/src/hooks/useMapPersistence.ts` — 復元・デバウンス保存・入出力の調停
- Create: `client/src/hooks/__tests__/useMapPersistence.test.tsx`
- Create: `client/src/components/layout/MapPersistenceControls.tsx`
- Create: `client/src/components/layout/MapPersistenceNotice.tsx`
- Create: `client/src/components/layout/__tests__/MapPersistenceControls.test.tsx`
- Create: `client/src/components/layout/__tests__/MapPersistenceNotice.test.tsx`
- Modify: `client/src/components/layout/AppHeader.tsx` — 永続化UIの配置slot
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`
- Modify: `client/src/app/page.tsx` — `useNodes`と永続化Hook/UIの配線
- Modify: `client/src/app/__tests__/page.test.tsx`

---

### Task 1: 永続化型とノード正規化

**Files:**
- Create: `client/src/types/mapDocument.ts`
- Create: `client/src/domain/persistence/mapDocumentNode.ts`
- Test: `client/src/domain/persistence/__tests__/mapDocumentNode.test.ts`

**Interfaces:**
- Produces: `MapDocumentV1`
- Produces: `MapDocumentResult<T> = { ok: true; value: T } | { ok: false; error: string }`
- Produces: `normalizeMapDocumentNode(value: unknown, index: number): MapDocumentResult<Node>`

- [ ] **Step 1: Write failing normalization tests**

Create tests with a literal valid node and table-driven invalid fields. Expectations must use literal Japanese errors rather than production constants.

```ts
const validNode = {
  id: 10,
  parentId: null,
  x: 12,
  y: -5,
  width: 160,
  height: 64,
  label: "ルート",
};

it("既知フィールドだけを持つ新しいNodeへ正規化する", () => {
  const input = { ...validNode, ignored: "value" };
  expect(normalizeMapDocumentNode(input, 0)).toEqual({
    ok: true,
    value: validNode,
  });
});

it.each([
  ["id", 0],
  ["id", 1.5],
  ["id", Number.MAX_SAFE_INTEGER + 1],
  ["parentId", -1],
  ["x", Number.NaN],
  ["y", Number.POSITIVE_INFINITY],
  ["width", 0],
  ["height", -1],
  ["label", 123],
])("node[0].%sの不正値を拒否する", (field, value) => {
  expect(normalizeMapDocumentNode({ ...validNode, [field]: value }, 0))
    .toEqual(expect.objectContaining({ ok: false }));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand src/domain/persistence/__tests__/mapDocumentNode.test.ts`

Expected: FAIL because `mapDocumentNode` and `mapDocument` do not exist.

- [ ] **Step 3: Add types and minimal node normalization**

```ts
export type MapDocumentV1 = {
  version: 1;
  layoutMode: NodeLayoutMode;
  nodes: Node[];
};

export type MapDocumentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

`normalizeMapDocumentNode` must use `typeof value === "object" && value !== null && !Array.isArray(value)`, `Number.isSafeInteger`, and `Number.isFinite`. Return a new object containing only the seven `Node` fields. Include `node[${index}]` in error messages so the user can identify the failing entry.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --runInBand src/domain/persistence/__tests__/mapDocumentNode.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add client/src/types/mapDocument.ts \
  client/src/domain/persistence/mapDocumentNode.ts \
  client/src/domain/persistence/__tests__/mapDocumentNode.test.ts
git commit -m "feat(persistence): 保存ノードの正規化を追加"
```

---

### Task 2: ノードグラフ検証

**Files:**
- Create: `client/src/domain/persistence/mapDocumentGraph.ts`
- Test: `client/src/domain/persistence/__tests__/mapDocumentGraph.test.ts`

**Interfaces:**
- Consumes: `MapDocumentResult<T>` from `@/types/mapDocument`
- Produces: `validateMapDocumentGraph(nodes: readonly Node[]): MapDocumentResult<Node[]>`

- [ ] **Step 1: Write failing graph tests**

Use complete `Node` fixtures. Cover valid parent-after-child input, duplicate IDs, missing parent, self-reference, a detached two-node cycle, and a 10,000-node chain.

```ts
it("親が子より後に現れるツリーと入力順を受理する", () => {
  const child = node(2, 1);
  const root = node(1, null);
  expect(validateMapDocumentGraph([child, root])).toEqual({
    ok: true,
    value: [child, root],
  });
});

it("ルートを持たない循環を拒否する", () => {
  const result = validateMapDocumentGraph([node(1, 2), node(2, 1)]);
  expect(result).toEqual({ ok: false, error: "親子関係が循環しています。" });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand src/domain/persistence/__tests__/mapDocumentGraph.test.ts`

Expected: FAIL because `validateMapDocumentGraph` does not exist.

- [ ] **Step 3: Implement iterative graph validation**

Build `nodesById` in one pass, reject duplicates, then validate each non-null parent. Detect cycles without recursion by following parent links with `visiting` and `visited` sets; finalize every ID in the current path before starting the next node. Return `[...nodes]` on success so later state replacement owns a mutable array without mutating input.

```ts
export function validateMapDocumentGraph(
  nodes: readonly Node[],
): MapDocumentResult<Node[]> {
  const nodesById = new Map<number, Node>();
  for (const current of nodes) {
    if (nodesById.has(current.id)) {
      return { ok: false, error: `ノードID ${current.id} が重複しています。` };
    }
    nodesById.set(current.id, current);
  }

  for (const current of nodes) {
    if (current.parentId !== null && !nodesById.has(current.parentId)) {
      return {
        ok: false,
        error: `親ノード ${current.parentId} が存在しません。`,
      };
    }
  }

  const stateById = new Map<number, "visiting" | "visited">();
  for (const start of nodes) {
    if (stateById.get(start.id) === "visited") continue;

    const path: number[] = [];
    let current: Node | undefined = start;
    while (current) {
      const state = stateById.get(current.id);
      if (state === "visiting") {
        return { ok: false, error: "親子関係が循環しています。" };
      }
      if (state === "visited") break;

      stateById.set(current.id, "visiting");
      path.push(current.id);
      current = current.parentId === null
        ? undefined
        : nodesById.get(current.parentId);
    }
    for (const id of path) stateById.set(id, "visited");
  }

  return { ok: true, value: [...nodes] };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --runInBand src/domain/persistence/__tests__/mapDocumentGraph.test.ts`

Expected: PASS without stack overflow.

- [ ] **Step 5: Commit Task 2**

```bash
git add client/src/domain/persistence/mapDocumentGraph.ts \
  client/src/domain/persistence/__tests__/mapDocumentGraph.test.ts
git commit -m "feat(persistence): 保存ツリーの整合性検証を追加"
```

---

### Task 3: Map Document Codec

**Files:**
- Create: `client/src/domain/persistence/mapDocumentCodec.ts`
- Test: `client/src/domain/persistence/__tests__/mapDocumentCodec.test.ts`

**Interfaces:**
- Consumes: `normalizeMapDocumentNode(value, index)`
- Consumes: `validateMapDocumentGraph(nodes)`
- Produces: `createMapDocument(nodes: readonly Node[], layoutMode: NodeLayoutMode): MapDocumentV1`
- Produces: `serializeMapDocument(document: MapDocumentV1): string`
- Produces: `parseMapDocumentJson(json: string): MapDocumentResult<MapDocumentV1>`

- [ ] **Step 1: Write failing Codec tests**

Cover empty and nested round trips, pretty JSON with trailing newline, invalid JSON, non-object root, unsupported version, invalid mode, non-array nodes, invalid node, and invalid graph. Assert that parsing creates new node objects and does not mutate the source object.

```ts
it("マップをインデント付きJSONへ変換して往復する", () => {
  const document = createMapDocument(
    [node(1, null, "親"), node(2, 1, "子")],
    "auto",
  );
  const json = serializeMapDocument(document);

  expect(json.endsWith("\n")).toBe(true);
  expect(json).toContain('\n  "version": 1');
  expect(parseMapDocumentJson(json)).toEqual({ ok: true, value: document });
});

it("未対応versionを拒否する", () => {
  expect(parseMapDocumentJson('{"version":2,"layoutMode":"manual","nodes":[]}'))
    .toEqual({ ok: false, error: "未対応のマップ形式です。" });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand src/domain/persistence/__tests__/mapDocumentCodec.test.ts`

Expected: FAIL because the Codec does not exist.

- [ ] **Step 3: Implement minimal Codec orchestration**

`parseMapDocumentJson` must catch only JSON parsing errors at the parse boundary, validate the top-level record, normalize every node, then validate the complete graph. `createMapDocument` copies the node array and each node so export snapshots cannot be mutated by later state changes.

```ts
export function serializeMapDocument(document: MapDocumentV1): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseMapDocumentJson(
  json: string,
): MapDocumentResult<MapDocumentV1> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSONを解析できませんでした。" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "マップデータの形式が不正です。" };
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    return { ok: false, error: "未対応のマップ形式です。" };
  }
  if (record.layoutMode !== "manual" && record.layoutMode !== "auto") {
    return { ok: false, error: "レイアウトモードが不正です。" };
  }
  if (!Array.isArray(record.nodes)) {
    return { ok: false, error: "ノード一覧が不正です。" };
  }

  const nodes: Node[] = [];
  for (const [index, candidate] of record.nodes.entries()) {
    const normalized = normalizeMapDocumentNode(candidate, index);
    if (!normalized.ok) return normalized;
    nodes.push(normalized.value);
  }
  const graph = validateMapDocumentGraph(nodes);
  if (!graph.ok) return graph;

  return {
    ok: true,
    value: { version: 1, layoutMode: record.layoutMode, nodes: graph.value },
  };
}
```

- [ ] **Step 4: Run persistence domain tests**

Run: `npm test -- --runInBand src/domain/persistence/__tests__`

Expected: all persistence domain suites PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add client/src/domain/persistence/mapDocumentCodec.ts \
  client/src/domain/persistence/__tests__/mapDocumentCodec.test.ts
git commit -m "feat(persistence): マップJSON形式を追加"
```

---

### Task 4: 原子的状態置換とID衝突防止

**Files:**
- Modify: `client/src/hooks/useNodeLayoutState.ts`
- Modify: `client/src/hooks/useNodes.ts`
- Modify: `client/src/hooks/__tests__/useNodeLayoutState.test.ts`
- Modify: `client/src/hooks/__tests__/useNodes.test.ts`

**Interfaces:**
- Produces from `useNodeLayoutState`: `replaceLayoutState(nodes: Node[], mode: NodeLayoutMode): void`
- Produces from `useNodes`: `replaceMap(document: MapDocumentV1): void`

- [ ] **Step 1: Write failing layout-state replacement tests**

Add a test proving nodes and mode update in one command, refs are immediately visible to a callback retained from the first render, and auto-mode coordinates are not recalculated.

```ts
it("検証済みノードとモードを座標維持したまま置き換える", () => {
  const { result } = renderHook(() => useNodeLayoutState());
  const imported = [node(10, null, 900, 800)];
  act(() => result.current.replaceLayoutState(imported, "auto"));
  expect(result.current.nodes).toBe(imported);
  expect(result.current.layoutMode).toBe("auto");
  expect(result.current.nodes[0]).toMatchObject({ x: 900, y: 800 });
});
```

- [ ] **Step 2: Run the layout-state test and verify RED**

Run: `npm test -- --runInBand src/hooks/__tests__/useNodeLayoutState.test.ts --testNamePattern='置き換える'`

Expected: FAIL because `replaceLayoutState` is missing.

- [ ] **Step 3: Implement `replaceLayoutState`**

Update `nodesRef`, `layoutModeRef`, `nodes` state, and `layoutMode` state in the same stable callback. Do not call `layoutNodeForest`.

- [ ] **Step 4: Run the layout-state suite and verify GREEN**

Run: `npm test -- --runInBand src/hooks/__tests__/useNodeLayoutState.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing `useNodes.replaceMap` and ID tests**

Test selection clearing and collision skipping for root, child, and sibling additions. Mock `Date.now()` to an imported ID so the regression is deterministic.

```ts
it("インポート時に選択を解除し使用中IDを飛ばす", () => {
  jest.spyOn(Date, "now").mockReturnValue(1_000);
  const { result } = renderHook(() => useNodes());
  act(() => result.current.replaceMap({
    version: 1,
    layoutMode: "manual",
    nodes: [node(1_000, null, 10, 20), node(1_001, 1_000, 200, 20)],
  }));
  let id!: number;
  act(() => { id = result.current.addNode(500, 20); });
  expect(id).toBe(1_002);
  expect(result.current.selectedNodeId).toBeNull();
});
```

- [ ] **Step 6: Run `useNodes` tests and verify RED**

Run: `npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts --testNamePattern='インポート'`

Expected: FAIL because `replaceMap` is missing.

- [ ] **Step 7: Implement `replaceMap` and collision skipping**

Reset `generateNodeIdRef.current` with `createMonotonicIdGenerator()` inside `replaceMap`. Add a focused helper that receives current nodes, repeatedly asks the generator for an ID, and skips IDs in a `Set`. Move root ID allocation inside `applyTreeChange` so same-batch imports and additions observe the latest node set. Preserve existing public return types.

- [ ] **Step 8: Run Hook suites**

Run: `npm test -- --runInBand src/hooks/__tests__/useNodeLayoutState.test.ts src/hooks/__tests__/useNodes.test.ts`

Expected: both suites PASS.

- [ ] **Step 9: Run PR 1 verification**

Run: `npm run verify`

Expected: Tailwind scan, ESLint, typecheck, all Jest suites, and Next.js build PASS.

- [ ] **Step 10: Commit Task 4**

```bash
git add client/src/hooks/useNodeLayoutState.ts \
  client/src/hooks/useNodes.ts \
  client/src/hooks/__tests__/useNodeLayoutState.test.ts \
  client/src/hooks/__tests__/useNodes.test.ts
git commit -m "feat(persistence): マップ全体の復元を追加"
```

**PR checkpoint:** PR 1はここまで。Codecと状態置換だけをレビュー・マージし、マージ後に最新`main`からPR 2ブランチを作る。

---

### Task 5: Web Storageアダプター

**Files:**
- Create: `client/src/services/persistence/mapStorage.ts`
- Test: `client/src/services/persistence/__tests__/mapStorage.test.ts`

**Interfaces:**
- Produces: `MAP_STORAGE_KEY = "draw-my-map.map.v1"`
- Produces: `readStoredMapJson(storage: Pick<Storage, "getItem">): MapDocumentResult<string | null>`
- Produces: `writeStoredMapJson(storage: Pick<Storage, "setItem">, json: string): MapDocumentResult<void>`

- [ ] **Step 1: Write failing adapter tests**

Use small in-memory doubles implementing only `getItem` or `setItem`. Cover missing value, stored value, read exception, successful write with the exact key, and write exception.

```ts
it("固定キーへJSONを保存する", () => {
  const setItem = jest.fn();
  expect(writeStoredMapJson({ setItem }, "{}\n")).toEqual({
    ok: true,
    value: undefined,
  });
  expect(setItem).toHaveBeenCalledWith("draw-my-map.map.v1", "{}\n");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --runInBand src/services/persistence/__tests__/mapStorage.test.ts`

Expected: FAIL because `mapStorage` does not exist.

- [ ] **Step 3: Implement thin exception boundaries**

Do not parse JSON here. Convert read exceptions to「ブラウザの保存データを読み取れませんでした。」and write exceptions to「ブラウザへ自動保存できませんでした。」.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --runInBand src/services/persistence/__tests__/mapStorage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add client/src/services/persistence/mapStorage.ts \
  client/src/services/persistence/__tests__/mapStorage.test.ts
git commit -m "feat(persistence): ブラウザ保存境界を追加"
```

---

### Task 6: JSONファイルアダプター

**Files:**
- Create: `client/src/services/persistence/mapFileTransfer.ts`
- Test: `client/src/services/persistence/__tests__/mapFileTransfer.test.ts`

**Interfaces:**
- Produces: `createMapJsonFileName(now: Date): string`
- Produces: `downloadMapJson(json: string, now?: Date): void`
- Produces: `readMapJsonFile(file: File): Promise<MapDocumentResult<string>>`

- [ ] **Step 1: Write failing filename and download tests**

Mock `URL.createObjectURL`, `URL.revokeObjectURL`, and `HTMLAnchorElement.prototype.click`. Assert MIME type `application/json`, filename `draw-my-map-20260920-123456.json`, click, and revoke even if click throws.

```ts
expect(createMapJsonFileName(new Date(2026, 8, 20, 12, 34, 56)))
  .toBe("draw-my-map-20260920-123456.json");
```

- [ ] **Step 2: Write failing file-read tests**

Use a real `File` for success. Mock `file.text()` rejection for failure and expect「JSONファイルを読み取れませんでした。」.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test -- --runInBand src/services/persistence/__tests__/mapFileTransfer.test.ts`

Expected: FAIL because `mapFileTransfer` does not exist.

- [ ] **Step 4: Implement file boundaries**

Use local date components with zero padding. Build a Blob, create an anchor, set `href` and `download`, click inside `try`, and revoke the URL in `finally`. `readMapJsonFile` catches `File.text()` failures and returns a result instead of throwing.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- --runInBand src/services/persistence/__tests__/mapFileTransfer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add client/src/services/persistence/mapFileTransfer.ts \
  client/src/services/persistence/__tests__/mapFileTransfer.test.ts
git commit -m "feat(persistence): JSONファイル入出力境界を追加"
```

---

### Task 7: `useMapPersistence`

**Files:**
- Create: `client/src/hooks/useMapPersistence.ts`
- Test: `client/src/hooks/__tests__/useMapPersistence.test.tsx`

**Interfaces:**
- Consumes: `nodes: readonly Node[]`
- Consumes: `layoutMode: NodeLayoutMode`
- Consumes: `replaceMap(document: MapDocumentV1): void`
- Produces: `exportJson(): void`
- Produces: `importJsonFile(file: File): Promise<void>`
- Produces: `notice: { kind: "status" | "warning" | "error"; message: string } | null`

- [ ] **Step 1: Write failing restoration tests**

Use `renderHook`, a storage double, and a stable `replaceMap` mock. Cover no value, valid value, invalid value, storage read exception, and rerender/Strict Mode behavior. For invalid storage, advance timers and assert `setItem` was not called.

```ts
it("壊れた保存値を空マップで上書きしない", () => {
  jest.useFakeTimers();
  const storage = storageDouble("{broken");
  const { result } = renderHook(() => useMapPersistence({
    nodes: [], layoutMode: "manual", replaceMap: jest.fn(), storage,
  }));
  act(() => jest.advanceTimersByTime(300));
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(result.current.notice).toEqual({
    kind: "warning",
    message: "保存データを復元できませんでした。空のマップで開始します。",
  });
});
```

- [ ] **Step 2: Run restoration tests and verify RED**

Run: `npm test -- --runInBand src/hooks/__tests__/useMapPersistence.test.tsx --testNamePattern='復元|上書き'`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement one-time restoration and baseline suppression**

Use a ref to prevent repeated restoration. Record the serialized post-restoration snapshot in `restoredSnapshotRef`; while the current serialized snapshot equals that baseline, do not auto-save. This rule must also cover no stored value and invalid stored value, so Strict Mode cannot trigger an empty overwrite.

- [ ] **Step 4: Write failing debounce tests**

Rerender with three different snapshots within 300ms, assert no early write, then assert exactly one write containing the latest label after 300ms. Verify unmount cancels the timer and write exceptions create an error notice.

- [ ] **Step 5: Implement debounced auto-save**

After hydration, serialize each snapshot. If it differs from the restoration baseline, schedule a 300ms timer; cleanup clears it. Call `writeStoredMapJson` only inside the timer.

- [ ] **Step 6: Write failing import/export tests**

Inject file adapter functions through an optional dependency object so tests do not patch browser globals. Assert export uses the current snapshot, import calls `replaceMap` once only after successful parse, and all failures preserve state and include「現在のマップは変更されていません」.

- [ ] **Step 7: Implement import/export commands and notices**

Define dependencies with production defaults:

```ts
type UseMapPersistenceDependencies = {
  storage?: Storage;
  downloadJson?: (json: string) => void;
  readFile?: (file: File) => Promise<MapDocumentResult<string>>;
};
```

Resolve `storage ?? window.localStorage` only inside mount/save effects so Next.js server rendering never reads `window`. Catch download exceptions at the hook boundary. Keep notice state independent from map state.

- [ ] **Step 8: Run the complete Hook suite**

Run: `npm test -- --runInBand src/hooks/__tests__/useMapPersistence.test.tsx`

Expected: PASS with fake timers restored in `afterEach`.

- [ ] **Step 9: Commit Task 7**

```bash
git add client/src/hooks/useMapPersistence.ts \
  client/src/hooks/__tests__/useMapPersistence.test.tsx
git commit -m "feat(persistence): 自動保存と復元を追加"
```

---

### Task 8: 永続化コントロールと通知UI

**Files:**
- Create: `client/src/components/layout/MapPersistenceControls.tsx`
- Create: `client/src/components/layout/MapPersistenceNotice.tsx`
- Create: `client/src/components/layout/__tests__/MapPersistenceControls.test.tsx`
- Create: `client/src/components/layout/__tests__/MapPersistenceNotice.test.tsx`
- Modify: `client/src/components/layout/AppHeader.tsx`
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`

**Interfaces:**
- Produces: `MapPersistenceControls({ onExport, onImport })`
- Produces: `MapPersistenceNotice({ notice })`
- Modifies `AppHeader` props with `persistenceControls: ReactNode` and `persistenceNotice: ReactNode`

- [ ] **Step 1: Write failing controls tests**

Assert button labels, `type="button"`, hidden file input acceptance, export callback, import callback, and no callback when no file. Use `userEvent.upload` with the same file twice and expect two imports; repeat with a rejected first import to prove the input is reset in `finally`.

```ts
expect(fileInput).toHaveAttribute("accept", "application/json,.json");
await user.upload(fileInput, file);
await user.upload(fileInput, file);
expect(onImport).toHaveBeenNthCalledWith(1, file);
expect(onImport).toHaveBeenNthCalledWith(2, file);
```

- [ ] **Step 2: Run controls tests and verify RED**

Run: `npm test -- --runInBand src/components/layout/__tests__/MapPersistenceControls.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement controls**

Use a ref for the hidden file input. The visible read button calls `.click()`. The input `onChange` awaits `onImport(file)` in `try/finally` and always resets `event.currentTarget.value`.

- [ ] **Step 4: Write failing notice tests**

Assert status notices use `role="status"`, warning/error notices use `role="alert"`, and null renders nothing.

- [ ] **Step 5: Implement notice rendering**

Keep tone-to-role/style mapping local to `MapPersistenceNotice`; do not expose CSS class decisions to the Hook.

- [ ] **Step 6: Write failing AppHeader composition test**

Render literal control and notice elements through the new props and assert both are inside the banner. Preserve existing mode selector and operation-hint tests.

- [ ] **Step 7: Add AppHeader slots**

Import only `ReactNode`. Render controls with the other header controls and notice in a full-width row so narrow-screen wrapping remains valid.

- [ ] **Step 8: Run layout component suites**

Run: `npm test -- --runInBand src/components/layout/__tests__`

Expected: all layout suites PASS.

- [ ] **Step 9: Commit Task 8**

```bash
git add client/src/components/layout/MapPersistenceControls.tsx \
  client/src/components/layout/MapPersistenceNotice.tsx \
  client/src/components/layout/AppHeader.tsx \
  client/src/components/layout/__tests__/MapPersistenceControls.test.tsx \
  client/src/components/layout/__tests__/MapPersistenceNotice.test.tsx \
  client/src/components/layout/__tests__/AppHeader.test.tsx
git commit -m "feat(persistence): JSON入出力UIを追加"
```

---

### Task 9: Page配線と統合検証

**Files:**
- Modify: `client/src/app/page.tsx`
- Modify: `client/src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `useNodes().nodes`, `layoutMode`, `replaceMap`
- Consumes: `useMapPersistence({ nodes, layoutMode, replaceMap })`
- Renders: `MapPersistenceControls` and `MapPersistenceNotice` through `AppHeader`

- [ ] **Step 1: Write failing page wiring tests**

Remove the existing `AppHeader` mock so the real header, controls, notice, `useNodes`, and `useMapPersistence` run together. Keep only the `MapStage` mock, and make it render `nodes` and `selectedNodeId` into test outputs while exposing its existing callbacks as buttons. Mock only `downloadMapJson` to avoid an actual browser download. Clear `localStorage` and restore timers/mocks in `beforeEach` / `afterEach`. Prove export receives the current snapshot, a valid selected file replaces nodes and mode, and an invalid selected file leaves the rendered node snapshot unchanged while showing an alert.

- [ ] **Step 2: Run page tests and verify RED**

Run: `npm test -- --runInBand src/app/__tests__/page.test.tsx`

Expected: FAIL because `page.tsx` does not connect persistence.

- [ ] **Step 3: Connect page state and UI**

```tsx
const persistence = useMapPersistence({ nodes, layoutMode, replaceMap });

<AppHeader
  layoutMode={layoutMode}
  onLayoutModeChange={setLayoutMode}
  persistenceControls={(
    <MapPersistenceControls
      onExport={persistence.exportJson}
      onImport={persistence.importJsonFile}
    />
  )}
  persistenceNotice={<MapPersistenceNotice notice={persistence.notice} />}
/>
```

- [ ] **Step 4: Run page and persistence suites**

Run: `npm test -- --runInBand src/app/__tests__/page.test.tsx src/hooks/__tests__/useMapPersistence.test.tsx src/components/layout/__tests__`

Expected: all selected suites PASS.

- [ ] **Step 5: Mutation-check critical regressions**

Temporarily remove each implementation branch, one at a time, and verify the named test fails before restoring it:

1. Remove graph cycle rejection → cycle test fails.
2. Remove restoration baseline suppression → invalid-storage overwrite test fails.
3. Remove input reset → repeated-file test fails.
4. Remove `replaceMap` selection clearing → selection test fails.

After restoration, rerun the affected suites and ensure they pass. Do not commit mutation code.

- [ ] **Step 6: Run full verification**

Run: `npm run verify`

Expected:

- Tailwind scan succeeds.
- ESLint reports no errors.
- `tsc --noEmit` succeeds.
- All Jest suites pass.
- Next.js production build succeeds.

- [ ] **Step 7: Audit final diff**

Run:

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Confirm no generated output, temporary file, mutation code, or unrelated change remains.

- [ ] **Step 8: Commit Task 9**

```bash
git add client/src/app/page.tsx client/src/app/__tests__/page.test.tsx
git commit -m "feat(persistence): マップ保存機能を画面へ統合"
```

**PR checkpoint:** PR 2はここまで。マージ後に`ROADMAP.md`のJSON入出力とlocalStorage自動保存を完了へ更新し、次の未完了項目を画像エクスポートへ変更する。

---

### Task 10: Phase 5後半への引き継ぎ確認

**Files:**
- Read: `ROADMAP.md`
- Read: `docs/superpowers/specs/2026-09-20-phase5-persistence-design.md`

**Interfaces:**
- Produces no code; confirms the next scoped design input.

- [ ] **Step 1: Confirm merged functionality against roadmap**

Verify JSON export/import and localStorage auto-save are present on merged`main`; do not mark image export complete.

- [ ] **Step 2: Record the next design scope**

The next brainstorming session must decide PNG/SVG support, exported bounds, background, scale, font/text handling, and whether viewport or full-map bounds determine output.
