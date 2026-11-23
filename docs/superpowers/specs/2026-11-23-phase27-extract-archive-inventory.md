# Phase 27: 枝切り出し・マップアーカイブ操作入口インベントリ（L-061）

設計: `2026-11-23-phase27-map-split-merge-design.md` §操作入口インベントリ（L-061）  
関連: `2026-11-23-phase25-lock-inventory.md`（「枝切り出し（別マップ化）」行）

| 入口 | 拒否／無効条件 | 実装ファイル |
|------|----------------|--------------|
| `NodeContextMenu「枝を別マップに切り出す」` | **表示**: マップ表示・主選択ちょうど 1・非ルート。アウトライン／件数≠1／ルートでは非表示。**操作**: 保護／競合／枝内全 ID ∪ 離脱元親のいずれか locked → `disabled`。**meta（libraryMetaStatus）は関与しない**（非 ready でも meta 理由で disabled にしない）。**関与:** 枝内全 ID ∪ 離脱元親（ルート直下なら親検査なし） | `nodeBranchExtractAvailability.ts` / `NodeContextMenu.tsx` / `MapStage.tsx` / `useBranchExtractDialog.ts` / `BranchExtractDialog.tsx` / `MapEditor.tsx` / `useMapLibraryDialogState.ts` / `page.tsx`。確認ダイアログ中は親 inert・shortcuts 停止（既存ダイアログ慣行）、Undo 不可を文言で明示 |
| `MapLibraryListScreen「アーカイブ」` | **表示**: ライブラリスクリーン。**操作**: `libraryMetaStatus !== "ready"` または保護モード → `disabled`。**関与:** —（マップ meta のみ） | `MapLibraryListScreen.tsx` / `MapLibraryListRow.tsx` / `useMapLibrary`（`archiveMap`）/ `mapLibraryMetaActions.ts`（`runArchiveMap`） |
| `MapLibraryListScreen「アーカイブ解除」` | **表示**: アーカイブタブ。**操作**: 同上（meta 未 ready／保護 → `disabled`）。**関与:** — | 同上（`unarchiveMap` / `runUnarchiveMap`） |

共通ガード（切り出し）: `assertNodesEditable`（`client/src/domain/nodes/nodeEditLock.ts`）— 対象は枝内 ∪ 離脱元親。assert 実装パスは Task 2、表の実装ファイル列（UI）は Task 1（アーカイブ）／ Task 3（切り出し UI）で確定。

メモ:
- **058 切り出し**: meta 非関与。拒否はアウトライン／保護／競合／locked のみ。確認ダイアログの inert／shortcuts／Undo 明示は切り出し入口の実装セル注記を参照。
- **060 アーカイブ**: meta ready かつ非保護でのみ操作可。書込失敗時は通知のみ・本体非タッチ。

統合テスト: `client/src/app/__tests__/pageBranchExtract.test.tsx`

## 型コメント・docs 同期（Task 4 / L-203）

| 箇所 | 状態 |
|------|------|
| `client/src/domain/mapLibrary/mapLibraryMetaModel.ts`（`MapUserMeta.archivedAt` コメント） | 済 |
| `docs/specifications/data-model.md`（`MapUserMeta`・`filterAndSortMapsForList`・codec） | 済 |
| `docs/specifications/features.md`（Phase 27・28.5 アーカイブ・32 章・切り出し） | 済 |
| `docs/architecture/overview.md`（`extractBranchToNewMap`・`archiveMap` 流れ） | 済 |
| `docs/specifications/api.md`（`extractBranchToNewMap` / `archiveMap` / `unarchiveMap`） | 済 |
| `ROADMAP.md`（058/060 完了・Phase 27 進行中・現在地） | 済 |
