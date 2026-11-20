# Phase 19: 複数マップの検索とリンク 実装プラン

作成日: 2026-11-19
設計書: `docs/superpowers/specs/2026-11-19-phase19-multi-map-search-links-design.md`
対象: Phase 19 全 6 項目（カード #24: 候補013・024・031・032・056・057）
作業 worktree: `/Users/mash/Desktop/draw-my-map/.worktrees/feat-phase19-multi-map-search-links`
状態: サブエージェントレビュー 2 周通過・自動承認済み（実装開始）

## Global Constraints

1. **言語**: 返答・コメント・UI 文言・エラーメッセージ・ドキュメントはすべて日本語で書く（識別子・コマンド・技術固有名詞は英語可）。
2. **TDD 厳守**: 各タスクで必ず実装コードより先に失敗するテスト（RED）を追加し、失敗を確認してから最小実装で GREEN にする。
3. **コミットしない**: 本プランの各タスク実行中は `git commit` を実行しない（後続の `/commit-ja` ステップで責務単位にコミットする）。
4. **サブエージェント駆動・1 タスク逐次実行**: 各タスクは独立した実装サブエージェントが実行し、完了後に別サブエージェントによる二段階レビュー（仕様適合・コード品質）を通過してから次タスクへ進む。
5. **検証コマンド**: 各タスク完了時は `cd <worktree>/client && npm run typecheck` および対象 Jest テストを実行して全通過を確認する。最終タスク（Task 10）で `tailwind:scan`・`lint`・`typecheck`・`npm test -- --runInBand`・`npm run build` の全検証を通す。
6. **任意属性の規約**: `Node` の任意属性（`mapLinks`）や `MapUserMeta`（`favorite` / `lastOpenedAt` / `folderId`）は値が無い・空のときはキーごと持たない（`undefined` や `[]` を残さない）。
7. **知見 ID の遵守**:
   - データ消失・破壊: `L-001`（全保存関数の成否返却と呼び出し元分岐）, `L-002`（`corrupt`/`read-error`/`protected` を空やリンク切れと混同しない）, `L-003`（検証先行）, `L-443`（正規化前の入力長・件数先行チェック）, `L-453`（古いクロージャ基準の上書き防止・単一合成書込）, `L-454`（省略引数の `undefined` 上書き防止）, `L-458`（孤立参照の明示扱い）, `L-460`（フィルタ配列で原本配列を破壊しない・フィルタ基準フォーカス）, `L-461`（共有既定値参照を返さない）, `L-537`（複数キー/合成更新整合）, `L-575`（主処理確定後の後始末失敗で巻き戻さない）, `L-669`（破損/未読込時に自動上書きしない）, `L-836`（正規化前後上限整合）。
   - 非同期・状態: `L-035`（`NodeMapLink` 削除は添字ではなく値一致）, `L-036`（`commitLibrary` / `revisionRef` 同期・統合計画同値チェック）, `L-037`（`PendingMapNodeNavigation` に `sessionNumber` + `token` を含め 1 回限り消費＆遷移時クリア）, `L-467`/`L-468`/`L-521`（レンダー中副作用・ミラー ref 不整合禁止）, `L-538`（現在時刻の引数注入）。
   - ロジック・エラー: `L-044`（未知キー/不正入力拒否）, `L-046`/`L-047`（`parsePositiveNodeIdString` + `Number.isSafeInteger(v) && v >= 1`）, `L-050`/`L-056`（ストレージ例外捕捉）, `L-470`（厳格デコード）, `L-539`（衝突不能複合キー）。
   - UI・A11y・設計: `L-057`/`L-058`（拒否理由の明示・無効状態の完全抑止）, `L-060`（必須 props で配線漏れ防止）, `L-061`（保護モード・競合モードの全入口制限）, `L-397`（削除後フォーカス復帰・`documentRevision` を `key` に入れない）, `L-408`/`L-473`/`L-474`（IME・repeat Enter 抑止・確認画面キャンセル既定フォーカス）, `L-475`（削除フォルダーのフィルタ解除）, `L-476`（ストレージラッパー経由）, `L-522`（`isEditableTarget` + `isProcessableKeyEvent` 共用）, `L-835`（ボタン入れ子禁止）。

---

## Interfaces（タスク間の契約）

### Task 1 が提供するインターフェース
- `client/src/types/node.ts`:
  - `export type NodeMapLink = { readonly targetMapId: string; readonly targetNodeId?: number };`
  - `Node` に `mapLinks?: readonly NodeMapLink[];` を追加。
- `client/src/domain/nodes/nodeMapLink.ts`:
  - `NODE_MAP_LINKS_MAX_COUNT = 10`
  - `isValidTargetNodeId(value: unknown): value is number`
  - `parsePositiveNodeIdString(raw: string): number | null`
  - `normalizeNodeMapLink(input: { targetMapId: unknown; targetNodeId?: unknown }): NodeMapLinkResult`
  - `nodeMapLinkKey(link: NodeMapLink): string`
  - `uniqueNodeMapLinks(links: readonly NodeMapLink[]): NodeMapLink[]`
  - `areNodeMapLinksEqual(a: readonly NodeMapLink[] | undefined, b: readonly NodeMapLink[] | undefined): boolean`
  - `withNodeMapLinks(node: Node, mapLinks: readonly NodeMapLink[] | undefined): Node`
  - `addNodeMapLink(nodes: readonly Node[], nodeId: number, currentMapId: string, input: { targetMapId: string; targetNodeId?: number }): AddNodeMapLinkResult`
  - `removeNodeMapLink(nodes: readonly Node[], nodeId: number, target: NodeMapLink): Node[] | null`
  - `remapNodeMapLinks(nodes: readonly Node[], mapIdMapping: ReadonlyMap<string, string>): Node[]`
  - `AddNodeMapLinkOutcome`, `NodeMapLinkFailureReason`, `formatNodeMapLinkFailure(reason: NodeMapLinkFailureReason): string`
- `client/src/hooks/nodeMergePreview.ts`:
  - `NodeMergePreview` に `mapLinkText: string | null` を追加（既存 `noteText`/`linkText`/`tagText`/`sourceText` と統一）。
- `client/src/hooks/useNodes.ts`:
  - `addNodeMapLink(nodeId: number, currentMapId: string, input: { targetMapId: string; targetNodeId?: number }): AddNodeMapLinkOutcome`
  - `removeNodeMapLink(nodeId: number, target: NodeMapLink): boolean`

### Task 2 が提供するインターフェース
- `client/src/domain/mapLibrary/mapLibraryMeta.ts`:
  - `MAX_MAP_FOLDERS = 50`, `MAX_MAP_FOLDER_NAME_LENGTH = 50`, `MAX_MAP_FOLDER_NAME_INPUT_LENGTH = 256`, `MAX_RECENT_MAPS = 20`, `MAP_FOLDER_ID_PATTERN`
  - `MapFolder`, `MapUserMeta`, `MapLibraryMetaV1`, `MapLibraryMetaStatus` (`"ready" | "corrupt" | "unavailable"`), `MapListTab` (`"all" | "favorites" | "recent"`), `MapListFolderFilter` (`{ kind: "all" } | { kind: "unclassified" } | { kind: "folder"; folderId: string }`)
  - `createEmptyMapLibraryMeta(): MapLibraryMetaV1`
  - `normalizeMapFolderName(raw: string)`, `mapFolderNameKey(name: string): string`, `formatMapFolderFailure(reason)`
  - `decodeMapLibraryMeta(raw: string | null)`, `encodeMapLibraryMeta(meta: MapLibraryMetaV1): string`
  - `toggleMapFavorite(meta, mapId)`, `recordMapOpened(meta, mapId, openedAt)`, `assignMapFolder(meta, mapId, folderId: string | null)`, `createMapFolder(meta, id, rawName, now)`, `renameMapFolder(meta, folderId, rawName, now)`, `deleteMapFolder(meta, folderId)`, `pruneMapMetaForRemovedMap(meta, mapId)`, `mergeLibraryMetaForRestore(existingMeta, backupFolders, backupMapMeta, mapIdMapping, generateId)`
  - `filterAndSortMapsForList(maps, meta, filter: { tab: MapListTab; folderFilter: MapListFolderFilter }): MapIndexEntry[]`
  - `validateBackupLibraryMeta(folders, mapMeta, validMapIds): { ok: true; folders?: MapFolder[]; mapMeta?: Record<string, MapUserMeta> } | { ok: false; error: string }`
- `client/src/services/persistence/mapLibraryMetaStorage.ts`:
  - `MAP_LIBRARY_META_STORAGE_KEY = "draw-my-map.library-meta.v1"`
  - `readMapLibraryMeta(storage)`, `writeMapLibraryMeta(storage, meta)`, `resetMapLibraryMeta(storage)`

### Task 3 が提供するインターフェース
- `client/src/domain/mapLibrary/crossMapCorpus.ts`:
  - `ReadableMapSnapshot`, `UnreadableMapInfo`, `CrossMapCorpus`, `OtherMapsCorpus`
  - `createEmptyOtherMapsCorpus(): OtherMapsCorpus`（毎回新しいオブジェクト・配列を返す・L-461）
  - `composeCrossMapCorpus({ otherMapsCorpus, currentMapId, currentMapName, currentNodes }): CrossMapCorpus`
- `client/src/services/persistence/mapLibraryCorpusReader.ts`:
  - `readOtherMapsCorpus({ maps, currentMapId, storage }): OtherMapsCorpus`
- `client/src/domain/search/crossMapSearch.ts`:
  - `MAX_CROSS_MAP_SEARCH_RESULTS = 100`
  - `CrossMapSearchMatchField`, `CrossMapSearchMatch`, `CrossMapSearchResult`
  - `searchCrossMapCorpus(corpus: CrossMapCorpus, query: string, limit?: number): CrossMapSearchResult`
- `client/src/domain/mapLibrary/mapLinkGraph.ts`:
  - `ResolvedNodeMapLink` (`status: "valid" | "missing-map" | "missing-node" | "unreadable-map" | "protected-unavailable"`), `BacklinkItem`, `BacklinkCollectionResult`, `BrokenMapLinkItem`, `BrokenMapLinksResult`
  - `resolveNodeMapLink(link, corpus, options?: { storageMode?: "persistent" | "protected"; currentMapId?: string }): ResolvedNodeMapLink`
  - `collectBacklinks(corpus, targetMapId, targetNodeId): BacklinkCollectionResult`
  - `collectBrokenMapLinks(corpus): BrokenMapLinksResult`

### Task 4 が提供するインターフェース
- `client/src/domain/mapLibrary/libraryBackupCodec.ts`:
  - `LibraryBackupV1` に任意項目 `folders?: readonly MapFolder[]; mapMeta?: Readonly<Record<string, MapUserMeta>>;` を追加。
  - `createLibraryBackup(maps, currentMapId, exportedAt, meta?: { folders?: readonly MapFolder[]; mapMeta?: Readonly<Record<string, MapUserMeta>> })`
- `client/src/services/persistence/libraryBackupExport.ts`:
  - Task 4 では `prepareLibraryBackup` に任意オプション `libraryMeta?: MapLibraryMetaV1; libraryMetaStatus?: MapLibraryMetaStatus` を追加し、`ready` 時のみ任意メタを含める（Task 5 で `useMapLibrary.ts` から配線したうえで必須化して L-060 を担保）。
- `client/src/services/persistence/libraryRestoreTransaction.ts`:
  - `planLibraryRestore` が `mapIdMapping: Map<string, string>` を返し、各復元マップへ `remapNodeMapLinks` を適用する。

### Task 5 が提供するインターフェース
- `client/src/hooks/mapLibraryState.ts`:
  - `MapLibraryView`（`ready`）に `libraryMeta: MapLibraryMetaV1`, `libraryMetaStatus: MapLibraryMetaStatus` を追加。
  - `PersistentLibraryState` に `libraryMeta: MapLibraryMetaV1`, `libraryMetaStatus: MapLibraryMetaStatus` を統合。
  - `MapLibraryOperationResult`（`ok: true`）に `sessionNumber?: number` を追加。
- `client/src/hooks/useMapLibrary.ts`:
  - `toggleFavorite(mapId)`, `assignFolder(mapId, folderId)`, `createFolder(name)`, `renameFolder(folderId, name)`, `deleteFolder(folderId)`, `resetLibraryMeta()` を公開。
  - `switchMap` 成功時に遷移先 `sessionNumber` を返す。
  - `prepareBackup` が `libraryMeta` / `libraryMetaStatus` を `prepareLibraryBackup` へ渡す（`libraryBackupExport.ts` の該当オプションを必須化）。
  - すべてのマップ作成・切替・別名保存・枝移動・削除・復元で `libraryMeta` の `lastOpenedAt` / 掃除 / マージを単一書込＋`commitLibrary` で整合させる。
- `client/src/hooks/useMapPersistence.ts`:
  - `UseMapPersistenceResult` に `hydrated: boolean` を追加公開。

### Task 6〜9 が提供する UI・配線インターフェース
- Task 6:
  - `client/src/types/mapLibraryDialog.ts`: `folders` / `folderRename` / `folderDeleteConfirm` 画面とフォルダー用 `FocusTarget`。
  - `client/src/hooks/useMapLibraryDialogState.ts`: `listTab`, `setListTab`, `folderFilter`, `setFolderFilter`, `publishShellNotice(notice: OperationNotice)`, `closeSilently()` を公開。
  - `client/src/components/layout/MapFolderManagerScreen.tsx` と `MapLibraryListScreen.tsx` / `MapLibraryDialog.tsx` のお気に入り・最近使用・フォルダー対応、および `page.tsx` へのメタデータ/フォルダー配線完了。
- Task 7:
  - `client/src/components/layout/NodeMapLinksSection.tsx`, `client/src/components/layout/NodeBacklinksSection.tsx`（単体実装・テスト完結）。
- Task 8:
  - `client/src/components/layout/CrossMapSearchDialog.tsx`, `client/src/components/layout/BrokenMapLinksDialog.tsx`（単体実装・テスト完結）。
- Task 9:
  - `client/src/types/pendingMapNavigation.ts`: `PendingMapNodeNavigation = { readonly mapId: string; readonly sessionNumber: number; readonly nodeId: number; readonly token: number }`。
  - `client/src/hooks/useCrossMapCorpus.ts`: `MapEditor` 向け `otherMapsCorpus` キャッシュと `corpus` 合成フック。
  - `NodeDetailPanel.tsx`（7 節化・必須 props 追加）、`MapLibraryListScreen.tsx` / `MapLibraryDialog.tsx`（「リンク切れを確認」ボタンと `onOpenBrokenLinks` 必須 prop 追加）、`MapEditor.tsx`・`page.tsx` の完全配線。

---

## Task 1: マップ間リンク（`NodeMapLink`）ドメイン・V3 永続化・統合・履歴・競合・`useNodes`

**目的**: `Node.mapLinks` を追加し、ドメイン規則・V3 保存往復・統合（計画/文言/プレビュー/ダイアログ）・分割・複製・履歴・競合・`NODE_ATTRIBUTE_POLICY`・`useNodes` 操作を TDD で完成させる。

**対象ファイル**:
- 新規:
  - `client/src/domain/nodes/nodeMapLink.ts`
  - `client/src/domain/nodes/__tests__/nodeMapLink.test.ts`
  - `client/src/domain/persistence/mapDocumentNodeMapLinks.ts`
  - `client/src/domain/persistence/__tests__/mapDocumentNodeMapLinks.test.ts`
- 更新:
  - `client/src/types/node.ts`
  - `client/src/domain/nodes/nodeAttributePolicy.ts`
  - `client/src/domain/nodes/__tests__/nodeAttributePolicy.test.ts`
  - `client/src/domain/persistence/mapDocumentNodeProjection.ts`
  - `client/src/domain/persistence/mapDocumentNode.ts`
  - `client/src/domain/nodes/nodeMerge.ts`
  - `client/src/domain/nodes/nodeMergeMessages.ts`
  - `client/src/domain/nodes/__tests__/nodeMerge.test.ts`
  - `client/src/domain/nodes/__tests__/nodeMergeMessages.test.ts`
  - `client/src/hooks/nodeMergePreview.ts`
  - `client/src/hooks/__tests__/nodeMergePreview.test.ts`
  - `client/src/hooks/__tests__/useNodeMergeDialog.test.ts`
  - `client/src/components/layout/NodeMergeDialog.tsx`
  - `client/src/components/layout/__tests__/NodeMergeDialog.test.tsx`
  - `client/src/domain/history/mapHistory.ts`
  - `client/src/domain/mapLibrary/mapConflict.ts`
  - `client/src/hooks/useNodes.ts`
  - `client/src/hooks/__tests__/useNodes.test.ts`

**手順**:
1. **RED**: `nodeMapLink.test.ts` と `mapDocumentNodeMapLinks.test.ts` を作成し、正規化・`parsePositiveNodeIdString`（`"1"` 成功、`"0"`/`"-1"`/`"1.5"`/`"1a"`/`""` 拒否）・`nodeMapLinkKey`・自己ノード拒否（同一マップの他ノード・現在マップ全体は許可）・重複・上限 10・値一致削除（`removeNodeMapLink(nodes, nodeId, target)` で最後の 1 件削除時にキー除去）・`remapNodeMapLinks`・V3 往復（V1/V2 互換、未知キー拒否、件数超過拒否）の失敗テストを書く。
2. **GREEN**: `types/node.ts`、`nodeMapLink.ts`、`mapDocumentNodeMapLinks.ts`、`mapDocumentNodeProjection.ts`、`mapDocumentNode.ts` を実装してテストを通す。
3. **RED → GREEN（既存機能整合）**:
   - `nodeAttributePolicy.ts` に `mapLinks: { split: "original-only", merge: "union", parentInsert: "none" }` を追加し、`nodeAttributePolicy.test.ts`（`SAMPLE` / `DIFFERENT` / `copy` のディープコピー / キー配列）を更新して RED を確認。
   - `nodeMerge.ts`（`mapLinks` 統合、`map-links-too-many`、`mapLinkSourceCount`、`mapLinkDuplicateCount`、`isSameNodeMergePlan`）、`nodeMergeMessages.ts`（`"map-links-too-many"` の失敗文言）、`hooks/nodeMergePreview.ts`（`mapLinkText: string | null`、文言「マップ間リンク: N 件（重複 M 件を除く）」、重複 0 件は括弧なし）、`NodeMergeDialog.tsx`（`preview.mapLinkText` 表示）、`mapHistory.ts`（`areNodesEqual` の `mapLinks` 分岐）、`mapConflict.ts`（`areNodesEqual`）を実装し、`nodeMerge.test.ts` / `nodeMergeMessages.test.ts` / `nodeMergePreview.test.ts` / `useNodeMergeDialog.test.ts` / `NodeMergeDialog.test.tsx` にテストを追加・更新して全テスト GREEN を確認。
4. **RED → GREEN（`useNodes`）**: `useNodes.test.ts` に `addNodeMapLink` / `removeNodeMapLink` と Undo/Redo（1 操作）・`documentRevision` 非進行のテストを追加し、`useNodes.ts` に実装する。
5. **検証**: `cd client && npm run typecheck && npx jest src/domain/nodes src/domain/persistence src/domain/history src/domain/mapLibrary/mapConflict src/hooks/__tests__/useNodes.test.ts src/hooks/__tests__/nodeMergePreview.test.ts src/hooks/__tests__/useNodeMergeDialog.test.ts src/components/layout/__tests__/NodeMergeDialog.test.tsx`

---

## Task 2: マップライブラリメタデータ（お気に入り・最近使用・フォルダー）ドメイン・ストレージ I/O

**目的**: 独立キー `draw-my-map.library-meta.v1` のドメインモデル（お気に入り・最近使用・フォルダー・絞り込み・復元マージ・バックアップ検証）とストレージ I/O を TDD で実装する。

**対象ファイル**:
- 新規:
  - `client/src/domain/mapLibrary/mapLibraryMeta.ts`
  - `client/src/domain/mapLibrary/__tests__/mapLibraryMeta.test.ts`
  - `client/src/services/persistence/mapLibraryMetaStorage.ts`
  - `client/src/services/persistence/__tests__/mapLibraryMetaStorage.test.ts`

**手順**:
1. **RED**: `mapLibraryMeta.test.ts` を作成し、以下を網羅する失敗テストを書く：
   - `createEmptyMapLibraryMeta` が毎回別参照を返す（L-461）
   - フォルダー名正規化（前後空白除去・連続空白まとめ・制御文字/不可視書式拒否・`U+200D`/`U+FE0E`/`U+FE0F` 例外許可と鍵除去・空鍵拒否・先行長 256・コードポイント数 50 上限・NFKC 小文字化重複判定）
   - `decodeMapLibraryMeta`（`null` → 空、未知キー/不正型/未正規化名/不正日時/上限 50 超過/重複名 → `corrupt`、孤立 `folderId`・`favorite: false` → 安全修復 `repaired: true`）
   - `toggleMapFavorite`・`recordMapOpened`・`assignMapFolder`（部分更新で他の既存フィールドを `undefined` 消去しない L-454、空になった項目だけキー除去、存在しない `folderId` 拒否）・`createMapFolder`（上限 50・重複）・`renameMapFolder`・`deleteMapFolder`（参照 `folderId` のみ除去しマップ残存）・`pruneMapMetaForRemovedMap`
   - `filterAndSortMapsForList`（`MapListFolderFilter` 判別共用体による先絞り込み → `all`/`favorites`/`recent`（`lastOpenedAt` 未記録除外・最大 20 件・降順）・原本配列非破壊）
   - `mergeLibraryMetaForRestore`（同名フォルダー合流・ID 衝突時の新 ID 採番・50 件上限超過時の `droppedFolderCount` と未分類化・`mapMeta` ID 付け替え）
   - `validateBackupLibraryMeta`（先行件数チェック・存在しない `mapId`/`folderId` 拒否）
2. **GREEN**: `mapLibraryMeta.ts` を実装し、テスト GREEN を確認。
3. **RED → GREEN**: `mapLibraryMetaStorage.test.ts`（正常往復・`null`・`corrupt`・`getItem` 例外 → `read-error`・`setItem` の `QuotaExceededError` → `quota`・その他書込例外 → `write-error`・`resetMapLibraryMeta`）を作成し、`mapLibraryMetaStorage.ts` を実装して GREEN を確認。
4. **検証**: `cd client && npm run typecheck && npx jest src/domain/mapLibrary/__tests__/mapLibraryMeta.test.ts src/services/persistence/__tests__/mapLibraryMetaStorage.test.ts`

---

## Task 3: 全マップ共通スナップショット・横断検索・リンク解決・被リンク・リンク切れ検出ドメイン

**目的**: 横断検索・マップ間リンク解決・被リンク収集・リンク切れ一括検出の共通読み込み基盤と純粋ドメインロジックを TDD で実装する。

**対象ファイル**:
- 新規:
  - `client/src/domain/mapLibrary/crossMapCorpus.ts`
  - `client/src/domain/mapLibrary/__tests__/crossMapCorpus.test.ts`
  - `client/src/services/persistence/mapLibraryCorpusReader.ts`
  - `client/src/services/persistence/__tests__/mapLibraryCorpusReader.test.ts`
  - `client/src/domain/search/crossMapSearch.ts`
  - `client/src/domain/search/__tests__/crossMapSearch.test.ts`
  - `client/src/domain/mapLibrary/mapLinkGraph.ts`
  - `client/src/domain/mapLibrary/__tests__/mapLinkGraph.test.ts`

**手順**:
1. **RED → GREEN（コーパス基盤）**: `crossMapCorpus.test.ts` と `mapLibraryCorpusReader.test.ts` を書き、`createEmptyOtherMapsCorpus`（毎回新参照・L-461）、`readOtherMapsCorpus`（現在マップ除外・本体未保存 `null` は正常な空 `nodes: []`・`readMapBody` 失敗は `read-error`・`parseMapDocumentJson` 失敗は `corrupt`・V1/V2/V3 読込対応）と `composeCrossMapCorpus`（現在マップを先頭に合成）を実装。
2. **RED → GREEN（横断検索）**: `crossMapSearch.test.ts` を書き、5 フィールド優先順（`label` > `note` > `tag` > `link`（元 URL と `decodeURI`） > `source`（title/page/url））・NFKC/小文字化/trim・空クエリ 0 件・スニペット抜粋・`parentLabel` 解決・上限 100 件と全件 `total`/`matchedMapCount`・`unreadableMaps` 伝播を実装。
3. **RED → GREEN（リンクグラフ）**: `mapLinkGraph.test.ts` を書き、`resolveNodeMapLink`（`valid`（マップ全体・特定ノード）・`missing-map`・`missing-node`・`unreadable-map`・保護モードの `protected-unavailable`）、`collectBacklinks`（`node` 直接と `map` 全体の一意化と並び順・`unreadableMaps` 伝播）、`collectBrokenMapLinks`（値ベース `link` 保持・`valid` と `protected-unavailable` 除外・`unreadableMaps` 伝播）を実装。
4. **検証**: `cd client && npm run typecheck && npx jest src/domain/mapLibrary/__tests__/crossMapCorpus.test.ts src/services/persistence/__tests__/mapLibraryCorpusReader.test.ts src/domain/search/__tests__/crossMapSearch.test.ts src/domain/mapLibrary/__tests__/mapLinkGraph.test.ts`

---

## Task 4: 一括バックアップ・復元へのメタデータ統合とマップ間リンク ID リマップ

**目的**: 一括バックアップ JSON（`LibraryBackupV1`）へ任意の `folders` / `mapMeta` を組み込み、追加復元時にバックアップ内 `mapLinks.targetMapId` を新規採番 ID へ自動リマップできるようにする。

**対象ファイル**:
- 更新:
  - `client/src/domain/mapLibrary/libraryBackupCodec.ts`
  - `client/src/domain/mapLibrary/__tests__/libraryBackupCodec.test.ts`
  - `client/src/services/persistence/libraryBackupExport.ts`
  - `client/src/services/persistence/__tests__/libraryBackupExport.test.ts`
  - `client/src/services/persistence/libraryRestoreTransaction.ts`
  - `client/src/services/persistence/__tests__/libraryRestoreTransaction.test.ts`

**手順**:
1. **RED**: 既存 3 テストファイルに以下を追加・更新して RED を確認：
   - `libraryBackupCodec.test.ts`: 既存テスト（L40-72）のトップレベル `ignored: "outer"` はトップレベル未知キー拒否仕様（L-044）に合わせて拒否テストへ分離・更新する（許可リスト: `format`, `version`, `exportedAt`, `currentMapId`, `maps`, `folders`, `mapMeta`）。併せて `folders` / `mapMeta` 無し旧 V1 バックアップの後方互換、メタ付きバックアップの往復、`mapMeta` の先行件数超過・存在しない `mapId`/`folderId`・不正フォルダー名の拒否テストを追加。
   - `libraryBackupExport.test.ts`: `libraryMetaStatus === "ready"` 時は空フォルダー含む `folders` とアクティブマップの `mapMeta` を含め（0 件ならキー省略）、`corrupt`/`unavailable` 時はメタ抜きで正常エクスポートするテストを追加。
   - `libraryRestoreTransaction.test.ts`: `planLibraryRestore` が `mapIdMapping` を返し、バックアップ内マップ同士の `mapLinks.targetMapId` を新 ID へリマップし、バックアップ外の `targetMapId` はそのまま保持するテストを追加。
2. **GREEN**: `libraryBackupCodec.ts`・`libraryBackupExport.ts`（Task 4 では既存 `useMapLibrary.ts` との途中 `typecheck` 整合のため `libraryMeta` / `libraryMetaStatus` を任意オプションとして受け入れ、Task 5 で必須化）・`libraryRestoreTransaction.ts` を更新して全テスト GREEN を確認。
3. **検証**: `cd client && npm run typecheck && npx jest src/domain/mapLibrary/__tests__/libraryBackupCodec.test.ts src/services/persistence/__tests__/libraryBackupExport.test.ts src/services/persistence/__tests__/libraryRestoreTransaction.test.ts`

---

## Task 5: `useMapLibrary`・`useMapPersistence` 統合（メタデータ状態管理・`hydrated` 公開・`sessionNumber` 返却）

**目的**: `useMapLibrary` の `PersistentLibraryState` に `libraryMeta` / `libraryMetaStatus` を統合して `commitLibrary`・`revisionRef` と完全同期させ、全メタデータ操作・`lastOpenedAt` 自動記録・削除時単一書込・バックアップ/復元連携・`switchMap` の `sessionNumber` 返却・`useMapPersistence.hydrated` 公開を実装する。

**対象ファイル**:
- 更新（必要に応じて `client/src/hooks/mapLibraryMetaActions.ts` を新規切り出し）:
  - `client/src/hooks/mapLibraryState.ts`
  - `client/src/hooks/__tests__/mapLibraryState.test.ts`
  - `client/src/services/persistence/libraryBackupExport.ts`（`libraryMeta` / `libraryMetaStatus` を必須化・L-060）
  - `client/src/services/persistence/__tests__/libraryBackupExport.test.ts`（必須化に合わせた呼び出し更新）
  - `client/src/hooks/useMapLibrary.ts`
  - `client/src/hooks/__tests__/useMapLibrary.test.tsx`
  - `client/src/hooks/useMapPersistence.ts`
  - `client/src/hooks/__tests__/useMapPersistence.test.tsx`

**手順**:
1. **RED**: 以下を検証する失敗テストを追加：
   - `mapLibraryState.test.ts`: `PersistentLibraryState` と `toMapLibraryView` の `libraryMeta` / `libraryMetaStatus`（保護モード時は `unavailable`）。
   - `useMapLibrary.test.tsx`:
     - 起動時のメタ読み込み（正常＋初期マップ `lastOpenedAt` 記録、`corrupt` 時の非上書き維持 L-669、`read-error` 時の `unavailable`、保護モード時の `unavailable`、既存 `startupNotice` 非上書き）。
     - 各メタ操作（`toggleFavorite`, `assignFolder`, `createFolder`, `renameFolder`, `deleteFolder`, `resetLibraryMeta`）の成否・書込失敗時の状態維持（L-001）・保護モード/`corrupt`/`unavailable` での拒否（L-061）・`revisionRef` 更新による古いバックアッププレビュー無効化（L-036）。
     - `prepareBackup` が `libraryMeta` / `libraryMetaStatus` を `prepareLibraryBackup` へ渡すこと。
     - `switchMap` 成功時の遷移先 `sessionNumber` 返却と `lastOpenedAt` 更新。
     - `createMap` / `saveCurrentAsNewMap` / `moveBranchToMap` 成功時の `lastOpenedAt` 更新（`libraryMetaStatus !== "ready"` 時は自動上書きしない L-669、メタ書込失敗でも主処理を巻き戻さない L-575）。
     - `completeActiveMapDeletion`（`deleteMap` / `permanentlyDeleteMap`）での削除掃除＋次マップ `lastOpenedAt` の単一書込（L-453, L-537）。
     - `confirmRestore` 後のメタマージ保存と、`droppedFolderCount > 0` または書込失敗時の警告通知（確定済みマップ復元は巻き戻さない L-575）。
   - `useMapPersistence.test.tsx`: `hydrated` 公開の検証。
2. **GREEN**: `mapLibraryState.ts`・`libraryBackupExport.ts`（必須化）・`useMapLibrary.ts`（必要なら `mapLibraryMetaActions.ts` 分離）・`useMapPersistence.ts` を実装し、`useMapLibrary.test.tsx` の既存厳密 `toEqual` アサーション（`operations` への `MAP_LIBRARY_META_STORAGE_KEY` 書込反映と `switchMap` 戻り値の `sessionNumber`）も新仕様へ追従させて全テスト GREEN を確認。
3. **検証**: `cd client && npm run typecheck && npx jest src/hooks src/services/persistence/__tests__/libraryBackupExport.test.ts`

---

## Task 6: マップ一覧ダイアログ拡張（お気に入り・最近使用・フォルダー絞り込み・フォルダー管理画面）と `page.tsx` メタデータ配線

**目的**: マップ一覧ダイアログでお気に入り・最近使用・フォルダー絞り込み・フォルダー割り当て・フォルダー管理（作成/名前変更/削除確認）・破損時メタデータ初期化ができるようにし、`page.tsx` へのメタデータ/フォルダー配線を完了させる（「リンク切れを確認」ボタンと `onOpenBrokenLinks` 必須 prop は `BrokenMapLinksDialog` 接続時の Task 9 で追加し、途中タスクの未配線ボタンや `typecheck` 破綻を防ぐ）。

**対象ファイル**:
- 新規:
  - `client/src/components/layout/MapFolderManagerScreen.tsx`
  - `client/src/components/layout/__tests__/MapFolderManagerScreen.test.tsx`
- 更新:
  - `client/src/types/mapLibraryDialog.ts`
  - `client/src/hooks/mapLibraryDialogState.ts`
  - `client/src/hooks/useMapLibraryDialogState.ts`
  - `client/src/hooks/__tests__/mapLibraryDialogState.test.ts`
  - `client/src/hooks/__tests__/useMapLibraryDialogState.test.tsx`
  - `client/src/hooks/__tests__/useMapLibraryDialogBackup.test.tsx`
  - `client/src/components/layout/mapLibraryListButtons.ts`
  - `client/src/components/layout/__tests__/mapLibraryListButtons.test.ts`
  - `client/src/components/layout/MapLibraryListScreen.tsx`
  - `client/src/components/layout/MapLibraryDialog.tsx`
  - `client/src/components/layout/__tests__/MapLibraryListScreen.test.tsx`
  - `client/src/components/layout/__tests__/MapLibraryDialog.test.tsx`
  - `client/src/components/layout/__tests__/MapLibraryBackupRestoreDialog.test.tsx`
  - `client/src/app/page.tsx`

**手順**:
1. **RED**:
   - `mapLibraryDialogState.test.ts` / `useMapLibraryDialogState.test.tsx`: `folders` / `folderRename` / `folderDeleteConfirm` 遷移・Escape・`isTargetMissing`・選択中フォルダー削除時の `folderFilter` 自動リセット（L-475）・フィルタ中マップ削除の `filteredMaps` 基準隣行フォーカス（L-460）・`publishShellNotice`・`closeSilently`（`headerFocusRequest` 非発行）・`useLayoutEffect` での ref 同期（L-467/L-468/L-521）。
   - `MapFolderManagerScreen.test.tsx`: フォルダー作成・上限 50 の status 案内・IME/repeat 抑止・名前変更画面遷移（Enter/blur 二重確定抑止 L-473）・削除確認キャンセル既定フォーカス＆repeat Enter 抑止（L-408）。
   - `MapLibraryListScreen.test.tsx` / `MapLibraryDialog.test.tsx`: お気に入りボタン非入れ子（L-835）・最近使用タブのボタン外 `<span>` 最終閲覧日時表示・フォルダー絞り込み・フォルダー割り当て・`corrupt` 時初期化ボタン・`unavailable` 時初期化ボタンなし。
2. **GREEN**: 上記ファイルすべてと `page.tsx` のメタデータ/フォルダー配線、および既存 4 テストファイル（`MapLibraryBackupRestoreDialog.test.tsx`, `useMapLibraryDialogState.test.tsx`, `useMapLibraryDialogBackup.test.tsx`, `mapLibraryListButtons.test.ts`）を更新し、全テスト GREEN と `typecheck` 通過を確認。
3. **検証**: `cd client && npm run typecheck && npx jest src/hooks/__tests__/mapLibrary src/hooks/__tests__/useMapLibraryDialog src/components/layout/__tests__/MapLibrary src/components/layout/__tests__/mapLibraryListButtons.test.ts src/components/layout/__tests__/MapFolderManagerScreen.test.tsx`

---

## Task 7: 右パネル「マップ間リンク」「被リンク」節コンポーネント単体実装

**目的**: 右パネルに追加する 2 つの新セクション（`NodeMapLinksSection` と `NodeBacklinksSection`）を単体で TDD 実装する（`NodeDetailPanel.tsx` の必須 props 追加・7 節化は `MapEditor.tsx` 配線と同じ Task 9 で行い、途中タスクの `typecheck` 破綻と L-060 違反を防ぐ）。

**対象ファイル**:
- 新規:
  - `client/src/components/layout/NodeMapLinksSection.tsx`
  - `client/src/components/layout/__tests__/NodeMapLinksSection.test.tsx`
  - `client/src/components/layout/NodeBacklinksSection.tsx`
  - `client/src/components/layout/__tests__/NodeBacklinksSection.test.tsx`

**手順**:
1. **RED**:
   - `NodeMapLinksSection.test.tsx`: 未選択案内・件数 `N / 10 件`・上限時 status 案内（入力非 disabled）・`valid` 移動ボタン・リンク切れ（`missing-map` / `missing-node` / `unreadable-map`）表示・保護モード `protected-unavailable` 表示（リンク切れ誤表示しない）・現在マップ選択時の自己ノード除外・対象マップ読込不可時は「マップ全体」のみ選択可＋注意文言・`parsePositiveNodeIdString` によるノード選択・値一致削除と対象マップセレクトへのフォーカス復帰（L-397）・`documentRevision` 変更時の下書き/エラーリセット。
   - `NodeBacklinksSection.test.tsx`: 未選択案内・0 件案内・`node` 直接と `map` 全体の区分表示とクリック移動・保護モード注意表示・`unreadableMaps` 警告表示。
2. **GREEN**: `NodeMapLinksSection.tsx`・`NodeBacklinksSection.tsx` を実装し、全テスト GREEN を確認。
3. **検証**: `cd client && npm run typecheck && npx jest src/components/layout/__tests__/NodeMapLinksSection.test.tsx src/components/layout/__tests__/NodeBacklinksSection.test.tsx`

---

## Task 8: 全マップ横断検索ダイアログ（`CrossMapSearchDialog`）とリンク切れ検出ダイアログ（`BrokenMapLinksDialog`）

**目的**: 全マップ横断検索ダイアログとリンク切れ一括検出ダイアログを、アクセシビリティ・キーボード操作・保護モード対応・読込失敗警告付きで TDD 実装する。

**対象ファイル**:
- 新規:
  - `client/src/components/layout/CrossMapSearchDialog.tsx`
  - `client/src/components/layout/__tests__/CrossMapSearchDialog.test.tsx`
  - `client/src/components/layout/BrokenMapLinksDialog.tsx`
  - `client/src/components/layout/__tests__/BrokenMapLinksDialog.test.tsx`

**手順**:
1. **RED**:
   - `CrossMapSearchDialog.test.tsx`: `role="dialog"` + 自動フォーカス、入力に応じたリアルタイム検索（ラベル・メモ・タグ・URL・出典の一致種別バッジとスニペット）、結果行のボタン非入れ子構成（L-835）、100 件上限表示、↑↓ キー移動・Enter 選択（IME/repeat 抑止）・Escape 閉鎖、保護モード時の現在マップ限定案内、`unreadableMaps` 警告バナー、`onMouseClick` 通知。
   - `BrokenMapLinksDialog.test.tsx`: 0 件案内、各理由バッジ（マップなし / ノードなし / 読込失敗）、参照元へ移動ボタン、現在マップ項目のみ表示される「このリンクを削除」ボタン（`item.link` 値渡し・L-035）、`unreadableMaps` 警告バナー、Escape / 閉じるボタン。
2. **GREEN**: 両ダイアログを実装し、テスト GREEN を確認。
3. **検証**: `cd client && npm run typecheck && npx jest src/components/layout/__tests__/CrossMapSearchDialog.test.tsx src/components/layout/__tests__/BrokenMapLinksDialog.test.tsx`

---

## Task 9: `NodeDetailPanel`・`MapLibraryDialog`・`MapEditor`・`page.tsx` 全体配線とページ統合テスト

**目的**: `NodeDetailPanel`（7 節化）・`MapLibraryDialog`（「リンク切れを確認」ボタン）・`MapEditor`・`page.tsx` を必須 props（L-060）で完全配線し、Phase 19 全 6 機能の E2E 動作をページ統合テストで固定する。

**対象ファイル**:
- 新規:
  - `client/src/types/pendingMapNavigation.ts`
  - `client/src/hooks/useCrossMapCorpus.ts`
  - `client/src/hooks/__tests__/useCrossMapCorpus.test.tsx`
  - `client/src/app/__tests__/pageCrossMapSearch.test.tsx`
  - `client/src/app/__tests__/pageMapLinksAndBacklinks.test.tsx`
  - `client/src/app/__tests__/pageMapFavoritesAndFolders.test.tsx`
- 更新:
  - `client/src/components/map/mapHistoryShortcut.ts`（`isProcessableKeyEvent` を `export` しショートカット間で共用・L-522）
  - `client/src/components/layout/NodeDetailPanel.tsx`
  - `client/src/components/layout/__tests__/NodeDetailPanel.test.tsx`（7 節・見出し順更新）
  - `client/src/components/layout/MapLibraryListScreen.tsx`（「リンク切れを確認」ボタン追加）
  - `client/src/components/layout/MapLibraryDialog.tsx`（`onOpenBrokenLinks` 必須 prop 追加）
  - `client/src/components/layout/__tests__/MapLibraryListScreen.test.tsx` / `MapLibraryDialog.test.tsx` / `MapLibraryBackupRestoreDialog.test.tsx`（`onOpenBrokenLinks` 追従）
  - `client/src/components/map/MapEditor.tsx`
  - `client/src/components/map/__tests__/MapEditor.test.tsx`
  - `client/src/components/map/__tests__/MapEditorOutline.test.tsx`
  - `client/src/app/page.tsx`

**手順**:
1. **RED（単体＋統合テスト先行）**:
   - `useCrossMapCorpus.test.tsx`: `corpusRefreshKey` 更新時のみ他マップを再読込し、現在マップの `nodes` 変更では再読込しないこと・保護モード時は空コーパスを返すことを検証する失敗テストを書く。
   - `NodeDetailPanel.test.tsx`: 7 節の見出し順 `["詳細メモ", "タグ", "リンク", "出典", "マップ間リンク", "被リンク", "イラスト"]` と未選択案内 7 件へ更新して RED を確認。
   - `pageCrossMapSearch.test.tsx`: 全マップ横断検索（ラベル/メモ/タグ/URL/出典）→ 他マップの折りたたみ内・解像度非表示ノードへの切替＆自動展開＆フォーカス、アウトライン表示からの直接ジャンプ、`Cmd/Ctrl+Shift+F`、ダイアログ閉鎖時の `crossMapSearchButtonRef` フォーカス復帰、対象ノード不在時の `alert`「移動先のノードが見つかりませんでした」＆1 回限り消費、保護モード時の現在マップ限定表示、競合中の他マップ移動拒否（`shellNotice` alert・`pendingNavigation` 非発行）の失敗テストを書く。
   - `pageMapLinksAndBacklinks.test.tsx`: マップ間リンク追加（Undo/Redo 含む）→ 他マップ特定ノードジャンプ（詳細メモ未確定下書きの `blur` → `flush` 保存確認含む・L-397）→ 被リンク一覧からの逆ジャンプ → 相手ノード削除・相手マップ削除後のリンク切れ検出ダイアログ（「リンク切れを確認」押下時に `closeSilently` で一覧を閉じて開く・閉鎖時 `listButtonRef` 復帰）での検出・移動・現在マップリンク削除 → 一括バックアップ＆追加復元後の `mapLinks` ID リマップ確認の失敗テストを書く。
   - `pageMapFavoritesAndFolders.test.tsx`: お気に入りトグル・お気に入りタブ・最近使用タブ（順序と未閲覧除外）・フォルダー作成/名前変更/割り当て/絞り込み/削除（マップ非消失・フィルタ自動リセット・フィルタ中マップ削除フォーカス）・メタデータ破損時の非保護モード維持と初期化回復・一括バックアップ＆復元後のフォルダー復元の失敗テストを書く。
2. **GREEN（配線実装）**:
   - `pendingMapNavigation.ts`・`useCrossMapCorpus.ts`・`mapHistoryShortcut.ts`（`export` 追加）を実装。
   - `NodeDetailPanel.tsx` に `NodeMapLinksSection`・`NodeBacklinksSection`（必須 props）を追加。
   - `MapLibraryListScreen.tsx` / `MapLibraryDialog.tsx` に「リンク切れを確認」ボタンと `onOpenBrokenLinks` 必須 prop を追加（関連テスト追従）。
   - `page.tsx`: `pendingNavigation` state とトークン ref、`onSwitchToMapTarget`（`library.switchMap` 成功時の `sessionNumber` 付き発行、失敗時は `dialog.publishShellNotice(result.notice)`、他のマップ遷移/作成/削除/復元/保護モード移行時は `setPendingNavigation(null)` でクリア・L-037）、`brokenLinksDialogRequest`（「リンク切れを確認」押下時に `dialog.closeSilently()` してインクリメント）と `onBrokenLinksDialogClosed`（`listButtonRef` フォーカス復帰）を実装。
   - `MapEditor.tsx`:
     - ヘッダーの `searchControls` に「全マップ検索」ボタンを追加（`crossMapSearchButtonRef`、アウトライン表示中も表示、保護モードでも有効）。
     - `Cmd/Ctrl+Shift+F` グローバルショートカット（`editorShortcutsEnabled` + `isProcessableKeyEvent` + `!isEditableTarget`）。
     - `CrossMapSearchDialog` / `BrokenMapLinksDialog` マウント（表示中は `editorShortcutsEnabled = false`・`inert`・`dialogMouseClickedAtRef` 更新、開くたびに `refreshCorpus()`、`CrossMapSearchDialog` 閉鎖時は `crossMapSearchButtonRef.current?.focus()`）。
     - `navigateToLocalNode(nodeId)`: 対象不在時は `operationNotices` に `alert`「移動先のノードが見つかりませんでした」を出す。アウトライン表示中なら `returnToCanvas()` を通さず直接マップ表示＋`INITIAL_VIEWPORT.scale` 基準の `collectVisibleNodeIds` で `resolveNodeSearchReveal`・展開・解像度切替・選択・フォーカス（L-453）。
     - `pendingNavigation` の `mapId` + `sessionNumber` + `persistence.hydrated` 消費 `useEffect`（対象不在・復元失敗時も含めて `onConsumePendingNavigation` で 1 回限り消費・L-037）。
     - `NodeDetailPanel` へ全必須 props を配線。
   - `MapEditor.test.tsx` / `MapEditorOutline.test.tsx` を必須 props に追従させる。
3. **検証**: `cd client && npm run typecheck && npx jest src/hooks/__tests__/useCrossMapCorpus.test.tsx src/components/layout/__tests__/NodeDetailPanel.test.tsx src/components/layout/__tests__/MapLibrary src/components/map/__tests__/MapEditor.test.tsx src/components/map/__tests__/MapEditorOutline.test.tsx src/app/__tests__`

---

## Task 10: ドキュメント・`ROADMAP.md` 更新と全体検証（`npm run verify`）

**目的**: 実装した Phase 19 全 6 項目に合わせて `ROADMAP.md` と全仕様書・手順書・README を更新し、`npm run verify` 全項目を通して完了を確認する。

**対象ファイル**:
- 更新:
  - `ROADMAP.md`（Phase 19 見出しを完了に更新、全 6 項目のチェックボックスを `[x]` 化、「現在地」と「最終更新: 2026-11-19」と次の未完了項目＝Phase 20「名前付きスナップショット（候補014）」を更新。実ブラウザ未確認である旨を明記）
  - `docs/specifications/features.md`
  - `docs/specifications/data-model.md`（`Node.mapLinks`、`draw-my-map.library-meta.v1`、`LibraryBackupV1` 任意項目を記載）
  - `docs/architecture/overview.md`
  - `docs/testing/browser-test-cases.md`（Phase 19 の実ブラウザ手動確認項目を追加）
  - `README.md`
  - `client/README.md`
  - `docs/README.md`

**手順**:
1. 実装コードと照合しながら上記ドキュメントを更新（実ブラウザ確認は未実施のため未確認として正直に記録）。
2. `client` ディレクトリで以下をすべて実行し、エラー 0・警告増加なし・全テスト通過を確認：
   - `npm run tailwind:scan`
   - `npm run lint`
   - `npm run typecheck`
   - `npm test -- --runInBand`
   - `npm run build`
