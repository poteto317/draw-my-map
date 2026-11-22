# Phase 23: テンプレートと部分再利用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 組み込みマップテンプレート、枝の部品ライブラリ、書き出し対象（全件／表示中／選択）を実装し Phase 23 を完了する。

**Architecture:** `resolveExportNodes` でノード集合を決め既存 PNG/SVG/Markdown/JSON フックへ渡す。部品は単一キー `draw-my-map.parts.v1`。テンプレは組み込み `MapDocumentV3` を `writeMapBody` 付き新規作成へ渡す。作業はメインチェックアウトのブランチ `feat/phase23-template-reuse-export`（worktree 不使用）。

**Tech Stack:** Next.js / React / TypeScript / Jest / localStorage

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-11-22-phase23-template-reuse-export-design.md` に従う。
- Node `id` は `number`。`visibleNodeIds` は `ReadonlySet<number>`。
- TDD: 実装前に失敗するテストを先に書く。
- **コミットしない**（`/feature` 中。コミットは後の `/commit-ja`）。
- 変更後は対象テスト、完了時は `cd client && npm run verify`。
- 日本語 UI 文言。識別子は英語。
- 知見: L-001, L-002, L-014, L-060, L-461, L-537, L-921。

---

### Task 1: ExportScope と resolveExportNodes

**Files:**
- Create: `client/src/domain/exportScope/exportScope.ts`
- Create: `client/src/domain/exportScope/resolveExportNodes.ts`
- Create: `client/src/domain/exportScope/__tests__/resolveExportNodes.test.ts`
- Create: `client/src/domain/exportScope/exportFormatAvailability.ts`
- Create: `client/src/domain/exportScope/__tests__/exportFormatAvailability.test.ts`

**Interfaces:**
- Produces:
  - `type ExportScope = "all" | "visible" | "selection"`
  - `resolveSelectionTargetIds(viewMode: "map" | "outline", selectedNodeId: number | null, selectedNodeIds: readonly number[]): readonly number[]` — map は `selectedNodeIds`、outline は `selectedNodeId` があれば `[selectedNodeId]`、なければ `[]`
  - `resolveExportNodes(scope, nodes, visibleNodeIds, selectionTargetIds): Node[]`
  - `isExportFormatEnabled(scope, format): boolean` where `format` is `"png" | "svg" | "markdown" | "json" | "bullets"`
  - `canUseSelectionScope(selectionTargetIds): boolean` → `selectionTargetIds.length === 1`

**Notes:** `selection` は `collectSubtreeIds`（`domain/nodes/nodeTree.ts`）を使う。選択が 1 件でないとき空配列。MapEditor / 部品登録は必ず `resolveSelectionTargetIds` 経由。

- [ ] **Step 1:** `resolveExportNodes` / `exportFormatAvailability` の失敗テストを書く（all / visible フィルタ / selection 部分木 / 形式表どおり）。
- [ ] **Step 2:** 実装してテストを通す。
- [ ] **Step 3:** コミットしない。

---

### Task 2: 既存書き出しフックを nodes 引数前提に揃える＋ヘッダー配線

**Files:**
- Modify: `client/src/hooks/useMapImageExport.ts` および PNG/SVG 下位（渡された nodes のみ）
- Modify: `client/src/hooks/useOutlineExport.ts` / `useMapJsonExport.ts` または呼び出し側
- Modify: `client/src/components/map/MapEditor.tsx`（scope state + `visibleNodeIds` + selection）
- Create: `client/src/components/layout/ExportScopeControl.tsx`（+ test）
- Modify: `client/src/components/map/__tests__/MapEditor.test.tsx`（配線）

**Interfaces:**
- Consumes: Task 1 の `ExportScope`, `resolveSelectionTargetIds`, `resolveExportNodes`, `isExportFormatEnabled`, `canUseSelectionScope`
- Produces: ヘッダーで scope 切替。無効形式は非表示または disabled。

- [ ] **Step 1:** MapEditor 配線テストを RED:
  - scope=visible で `visibleNodeIds` のノードだけが image/outline に渡る
  - selection+選択0/2+ で selection スコープ／該当ボタン無効（map の複数選択と outline の単一選択の両方）
  - selection で SVG・箇条書きが無効
  - visible で JSON・箇条書きが無効
  - visibleNodeIds が空のとき visible 書き出し無効
  - selection JSON で根の `parentId === null`（正規化）
  - 空集合時に短い理由 notice（または disabled + accessible name）
- [ ] **Step 2:** `ExportScopeControl` と MapEditor 配線、hooks 引数化、selection JSON 正規化を実装して GREEN。
- [ ] **Step 3:** 関連 Jest を通す。コミットしない。

---

### Task 3: 部品ドメイン + storage

**Files:**
- Create: `client/src/domain/parts/partsModel.ts`
- Create: `client/src/domain/parts/partsCodec.ts`
- Create: `client/src/domain/parts/__tests__/partsCodec.test.ts`
- Create: `client/src/services/persistence/partsStorage.ts`
- Create: `client/src/services/persistence/__tests__/partsStorage.test.ts`

**Interfaces:**
- Produces:
  - `type Part = { id: string; name: string; nodes: Node[]; createdAt: string }`
  - `type PartsStore = { version: 1; parts: Part[] }`
  - `MAX_PART_NODES = 10_000`
  - `buildPartFromSubtree(nodes, rootId, name, createdAt): { ok: true; part: Part } | { ok: false; reason: "too-large" | "root-missing" }` — 上限検証はここ（Task 4 では再実装しない）
  - `encodePartsStore` / `decodePartsStore`
  - `readParts(): { status: "ok"; store; repaired?: boolean } | { status: "corrupt"; ... } | { status: "read-error"; ... }`
  - `writeParts(store): { status: "ok" } | { status: "quota-exceeded" } | { status: "write-error" }`
- キー: `draw-my-map.parts.v1`。フォールバックは毎回新規オブジェクト。

- [ ] **Step 1:** codec / storage テスト RED（round-trip、corrupt≠空成功、共有デフォルト mutate 防止、部分破損エントリ除外+`repaired`、`buildPartFromSubtree` の too-large）。
- [ ] **Step 2:** 実装 GREEN。コミットしない。

---

### Task 4: 部品フック + コマンドパレット配線

**Files:**
- Create: `client/src/hooks/usePartsLibrary.ts` (+ test)
- Modify: `client/src/domain/commands/commandCatalog.ts`
- Modify: `client/src/domain/commands/resolveCommandAvailability.ts`（または同等）
- Modify: コマンドディスパッチと MapEditor / page 配線
- Modify: `client/src/hooks/useNodes.ts`（必要なら insert の targetParentId 公開）
- Create: `client/src/hooks/__tests__/usePartsLibrary.test.tsx`
- Modify: `client/src/components/map/__tests__/MapEditorCommandPalette.test.tsx`（または同等の配線テスト）

**Interfaces:**
- Consumes: Task 3 の `buildPartFromSubtree` / `readParts` / `writeParts`、Task 1 の `resolveSelectionTargetIds`、`insertNodeSubtree` / `applySubtreeInsertion`
- Produces:
  - `registerPartFromSelection(name): Result` — `buildPartFromSubtree` → 最新読取→append→write（上限は Task 3 に委譲）
  - `insertPart(partId, mode: "root" | "child"): Result` — **root**: 部分木全体を挿入しルートのみ `parentId: null`（トップレベル1本）。**child**: 選択1件の子
  - `deletePart(partId): Result`（最新読取→除去→write）
  - コマンド例: `edit.register-part`, `edit.insert-part`, `edit.delete-part`
  - quota / read-error / corrupt / 上限超過は notice へ

- [ ] **Step 1:** RED:
  - 選択0/2+ で register・insert-child 不可（map 複数選択 + outline は `resolveSelectionTargetIds`）
  - insert root でトップレベルが1本、`parentId: null`
  - deletePart 後に一覧から消える（再読込マージ）
  - `buildPartFromSubtree` が too-large のとき register 失敗
  - quota-exceeded で notice
- [ ] **Step 2:** 実装 GREEN。コミットしない。

---

### Task 5: 組み込みテンプレート + 新規作成ダイアログ

**Files:**
- Create: `client/src/domain/templates/builtinTemplates.ts`（議事録・学習・企画・比較）
- Create: `client/src/domain/templates/__tests__/builtinTemplates.test.ts`
- Modify: `client/src/hooks/useMapLibrary.ts`（templateId 付き作成、または新関数 `createMapFromTemplate`）
- Modify: `client/src/components/layout/MapLibraryDialog.tsx`（+ test）
- Modify: 呼び出し page / dialog state

**Interfaces:**
- Produces: `listBuiltinTemplates(): { id; name; document: MapDocumentV3 }[]`
- `createMapFromTemplate({ name, templateId | null }): MapLibraryOperationResult` — 既存 `useMapLibrary` の操作結果型に合わせる。null/空は従来 `createMap`。テンプレ時は body 書き込み後に開く。`writeMapBody` 失敗時は index 非追加・body 除去（`saveCurrentAsNewMap` と同様）。

- [ ] **Step 1:** RED:
  - 各テンプレの graph 検証
  - ダイアログでテンプレ選択が `createMapFromTemplate`（`writeMapBody` 経路）を呼ぶ（空 `createMap` に落ちない）
  - `writeMapBody` 失敗モックで index 非追加・body 未残存、`MapLibraryOperationResult` が失敗、notice
- [ ] **Step 2:** 実装 GREEN。コミットしない。

---

### Task 6: 仕様・ROADMAP・最終検証

**Files:**
- Modify: `docs/specifications/features.md`
- Modify: `ROADMAP.md`（Phase 23 4 項目を `[x]`、現在地・最終更新）

- [ ] **Step 1:** 仕様と ROADMAP を設計どおり更新。
- [ ] **Step 2:** `cd client && npm run verify` を通し、失敗したら直す。
- [ ] **Step 3:** コミットしない（次ステップ `/refactor-srp` へ）。
