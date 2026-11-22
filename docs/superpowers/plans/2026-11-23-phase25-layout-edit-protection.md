# Phase 25: 配置調整と編集保護 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. Worktree: `.worktrees/feat/phase25-layout-edit-protection`（実装開始時に `using-git-worktrees` で作成）。**Do not commit** during `/feature`.

**Goal:** ツリー方向・間隔・手動整列/等間隔・グリッドスナップ・編集ロックを実装し Phase 25（046–050）を完了する。

**Architecture:** マップ文書 V3 に `treeDirection` / `layoutSpacing`、ノードに `locked`。自動レイアウトは spacing と方向を引数化。手動は整列ドメインとスナップ終了時丸め。ロックは `assertNodesEditable` で全 mutation 入口を早期拒否。

**Tech Stack:** React, Pixi, Jest, TypeScript, localStorage

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-23-phase25-layout-edit-protection-design.md`
- Node id: `number`。TDD。`/feature` 中はコミットしない。日本語 UI。
- 知見: L-825, L-061, L-214, L-526, L-921, L-203
- 検証: `cd client && npm run verify`

---

### Task 0: ロック操作インベントリ固定（L-061）

**Files:**
- Create: `docs/superpowers/specs/2026-11-23-phase25-lock-inventory.md`（設計表を実ファイルパス付きでコピー固定）
- Test: `client/src/components/map/__tests__/MapEditor.editLock.integration.test.tsx`（骨格のみ、RED から）

**Interfaces:**
- インベントリ各行に **実装ファイルパス** を追記し、Task 7 完了前に全行が grep で存在することを検証

- [ ] RED: 代表 3 経路（ドラッグ・削除・統合）で locked 拒否の統合テストが失敗
- [ ] インベントリ md が設計と同期

---

### Task 1: 永続化と型（046/047/050 基盤）

**Files:**
- Modify: `client/src/types/nodeMapState.ts`, `client/src/types/node.ts`（`locked?: true`）
- Create: `client/src/types/treeDirection.ts`, `client/src/types/layoutSpacing.ts`
- Create: `client/src/domain/persistence/mapDocumentTreeDirection.ts` + test
- Create: `client/src/domain/persistence/mapDocumentLayoutSpacing.ts` + test
- Create: `client/src/domain/persistence/mapDocumentNodeLocked.ts` + test
- Modify: `mapDocumentDecoder.ts`, `mapDocumentEncoder.ts`, `mapDocumentNode.ts`, `mapDocumentNodeProjection.ts`
- Modify: `nodeAttributePolicy.ts` + `__tests__/nodeAttributePolicy.test.ts`
- Modify: `mapConflict.ts`, `mapHistory.ts`（`locked` 比較）

**Interfaces:**
- `type TreeDirection = "lr" | "tb"`
- `type LayoutSpacing = { childGap: number; siblingGap: number }`
- `normalizeMapDocumentTreeDirection(raw, version): MapDocumentResult<TreeDirection>`
- `normalizeMapDocumentLayoutSpacing(raw, version): MapDocumentResult<LayoutSpacing | undefined>`
- `normalizeMapDocumentNodeLocked(raw, index, version)` → `true | undefined`
- `resolveLayoutSpacing(state): LayoutSpacing` — 欠落時 shapes 定数

- [ ] RED/GREEN: decode 成功/失敗境界、省略キー、locked normalize、policy テスト、履歴/競合 equal

---

### Task 2: spacing 解決と自動レイアウト（047 + lr）

**Files:**
- Create: `client/src/domain/nodes/resolveLayoutSpacing.ts`（`resolveLayoutSpacing(state)` をここに置く）+ test
- Create: `client/src/domain/nodes/resolveLayoutMetrics.ts` + test
- Modify: `nodeAutoLayout.ts`, `nodeLayoutMetrics.ts`, `nodeIndentPlacement.ts`, `nodeManualPlacement.ts` — 定数の直参照を `LayoutSpacing` 引数へ
- Modify: **全** `layoutNodeForest(` 呼び出し元（`useNodesAutoLayout`, `useNodeLayoutState`, `nodeBranchMove`, `nodeForestInsertion` 等）— state から direction/spacing を渡す

**Interfaces:**
- `resolveLayoutSpacing(state: NodeMapState): LayoutSpacing`
- `resolveLayoutMetrics(spacing: LayoutSpacing): { childGap: number; siblingGap: number }`
- `layoutNodeForest(..., options: { direction: TreeDirection; spacing: LayoutSpacing })` — Task 3 で tb 実装、Task 2 は lr のみ回帰

- [ ] RED/GREEN: 既存 auto layout テストが spacing 引数化後も通る、gap 変更で座標変化
- [ ] RED/GREEN: manual プレースホルダ（`nodeManualPlacement` / `nodeIndentPlacement`）がマップ間隔を参照

---

### Task 3: ツリー方向 tb（046）

**Files:**
- Modify: `nodeAutoLayout.ts`, `nodeLayoutPlacement.ts`, forest 関連 — 軸入替
- Modify: `useNodeLayoutState` — manual→auto で relayout
- Create: `client/src/components/layout/TreeDirectionControl.tsx` + test

**Interfaces:**
- `layoutNodeForest` の `tb` 分岐（子は +Y、兄弟は +X）
- `onTreeDirectionChange(dir)` → auto 時即 layout + 1 history

- [ ] RED/GREEN: tb の深さ/兄弟テスト、**tb×spacing 軸**、lr 退行、decode 既定 lr
- [ ] RED/GREEN: manual 時 TreeDirectionControl disabled+ツールチップ、**manual→auto で 1 回 layout + 単一 Undo**

---

### Task 4: 間隔 UI（047）

**Files:**
- Create: `client/src/components/layout/LayoutSpacingControl.tsx` + test
- Modify: `MapEditor` ヘッダー、spacing 変更ハンドラ

**Interfaces:**
- 8–400 クリップ、auto 時変更で Task 2 layout トリガ

- [ ] RED/GREEN: manual で座標不変、auto で変更反映 + **単一 Undo**；L-214: 選択消失でメニュー閉じ

---

### Task 5: 整列・等間隔（048）

**Files:**
- Create: `client/src/domain/nodes/selectionAlign.ts` + test
- Create: `client/src/domain/nodes/selectionDistribute.ts` + test
- Create: `client/src/hooks/useSelectionLayoutActions.ts` + test
- Create: `client/src/components/layout/SelectionAlignMenu.tsx` + test
- Modify: `MapEditor`

**Interfaces:**
- `alignSelection(nodes, selectedIds, op): Result<Node[]>` — 6 ops、左端基準
- `distributeSelection(nodes, selectedIds, axis: "x"|"y"): Result<Node[]>` — gap 等分仕様どおり
- 選択に locked 含む → err

- [ ] RED/GREEN: 各 op、**2 件選択時 distribute 無移動**、水平/垂直 distribute、locked 拒否、manual のみ、**1 操作 = 1 Undo**；L-214 メニュー閉じ

---

### Task 6: スナップ・グリッド（049）

**Depends:** Task 7（ドラッグ経路で locked 拒否を先に入れる）

**Files:**
- Create: `client/src/services/layoutSnapStorage.ts` + test（L-921 契約）
- Create: `client/src/domain/nodes/snapGrid.ts` + test
- Create: `client/src/hooks/useLayoutSnapPrefs.ts` + test
- Create: `client/src/components/map/pixi/renderSnapGrid.ts` または MapStage オーバーレイ
- Create: `client/src/components/layout/SnapGridControl.tsx` + test
- Modify: 手動ドラッグ終了経路（pointerup snap）

**Interfaces:**
- `readSnapPrefs(): SnapPrefsResult`, `writeSnapPrefs(partial): WriteResult`
- `snapToGrid(value, step): number`
- グリッド描画: ビューポート内のみ、transform 不変時更新なし

- [ ] RED/GREEN: round 負座標、corrupt≠空、storage イベント、ドラッグ snap、**gridStep 4–64 倍数**、**manual のみ UI／auto 非表示**、**同一 transform 連続で prefs 更新なし（L-526）**；L-214 メニュー閉じ

---

### Task 7: 編集ロックドメイン（050）

**Files:**
- Create: `client/src/domain/nodes/nodeEditLock.ts` + test（`assertNodesEditable`, `lockSubtree`, `toggleNodeLock`）
- Modify: 操作入口インベントリ表の各ファイル（drag, delete, merge, split, clipboard, importance, sibling reorder…）
- Modify: `nodeSubtreeInsertion.ts`（クリップボード規則）

**Interfaces:**
- `assertNodesEditable(nodeIds: ReadonlyArray<number>, nodes: readonly Node[]): Result<void>`
- `lockSubtree(nodes, rootId): Node[]` / `unlockSubtree`

- [ ] RED/GREEN: 表の各入口で locked 拒否、クリップボード規則、subtree 部分 locked
- [ ] GREEN: Task 0 の MapEditor 統合テスト（ドラッグ・削除・統合 + 表の追加行）

---

### Task 8: ロック UI・描画ヒント（050）

**Files:**
- Create: `client/src/components/layout/LockControls.tsx` + test
- Modify: `renderMapNodes.ts`（鍵/枠ヒント）
- Modify: MapEditor + L-214 メニュー閉じ

- [ ] RED/GREEN: 単一選択トグル、枝ロック 1 Undo、選択消失でメニュー閉じ

---

### Task 9: 仕様・ROADMAP・verify

**Files:**
- Modify: `docs/specifications/features.md`（Phase 25 節、L-203 列挙同期）
- Modify: `ROADMAP.md`（046–050 完了、現在地）

- [ ] `cd client && npm run verify`