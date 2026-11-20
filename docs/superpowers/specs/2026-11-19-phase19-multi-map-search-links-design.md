# Phase 19: 複数マップの検索とリンク 設計書

作成日: 2026-11-19。対象: Phase 19 全 6 項目（カード #24: 候補013「全マップ横断検索」・候補024「マップ間リンク」・候補031「マップのお気に入り・最近使用」・候補032「マップのフォルダー管理」・候補056「被リンク一覧」・候補057「リンク切れの検出」）。前提: Phase 10（ノード検索と移動）・Phase 11（折りたたみ）・Phase 12（複数マップ）・Phase 16（保存保護・一括バックアップ/復元・競合検出・ゴミ箱）・Phase 18（詳細メモ・URL・タグ・Markdownメモ・出典情報・`NODE_ATTRIBUTE_POLICY`）。状態: サブエージェントレビュー 2 周通過・自動承認済み（設計確定）。

## 決めたこと（ユーザー確認済み・推奨採用）

1. **実装スコープ（ユーザー確認済み）**: カード #24 に記載された Phase 19 の全 6 項目をまとめて 1 PR で実装する。
2. **お気に入り・最近使用・フォルダーの永続化（独立キー空間）**: `MapIndexV1`（`draw-my-map.maps.v1`）は変更せず、独立したストレージキー `draw-my-map.library-meta.v1` に保存する。
   - 理由: `libraryRestoreJournal.ts` の `decodeStrictIndex` が `MapIndexV1` / `MapIndexEntry` の厳格キー検査（`hasOnlyKeys`）を行っており、複数タブ競合検出も `MAP_INDEX_STORAGE_KEY` を監視している。ゴミ箱（`draw-my-map.trash.v1`）と同様に独立キー空間とすることで、既存互換性を 100% 維持し、メタデータ破損時もマップ本体を保護モードに落とさず回復でき、お気に入り・フォルダー操作で編集競合を誤発火させない。
   - メモリ状態は `useMapLibrary` の `PersistentLibraryState` に統合して `commitLibrary` 経由で更新し、`revisionRef` によるバックアップ/復元プレビュー鮮度検証と完全同期させる（L-036, L-476）。
3. **マップ間リンクの持ち方**: `Node` の任意属性 `mapLinks?: readonly NodeMapLink[]`（V3 保存形式のまま任意項目。版は上げない）として持つ。1 ノード最大 10 件。削除は配列添字ではなく `NodeMapLink` の値一致（`nodeMapLinkKey`）で行う（L-035）。
4. **フォルダー構造**: 1 階層（フラット）のフォルダー管理（最大 50 件）。1 マップは 0 または 1 個のフォルダーに所属し、未所属は「未分類」。フォルダー削除時は中のマップを消さず「未分類」へ戻す。
5. **全マップ横断検索の検索対象**: ノードのラベル・詳細メモ・タグ・添付 URL・出典（タイトル・ページ・URL）を NFKC＋小文字化の部分一致で検索し、一致種別を表示する（既存のマップ内検索 `nodeLabelSearch.ts` の挙動は変更しない）。
6. **一括バックアップ・復元との連携**:
   - `LibraryBackupV1` に任意項目 `folders`・`mapMeta` を追加する（`version: 1` のまま後方互換維持）。
   - 追加復元時、バックアップ内のマップ同士を指す `mapLinks.targetMapId` は新規採番された `mapId` へ自動リマップする。
7. **キャンバス印**: マップ間リンク用のキャンバス印は追加しない（URL 添付 `links` の既存青丸印のみ維持し、マップ間リンクの編集・移動・確認は右パネルとダイアログで行う）。
8. **参照知見 ID（優先度 A）**: `L-001`, `L-002`, `L-003`, `L-035`, `L-036`, `L-037`, `L-044`, `L-046`, `L-047`, `L-050`, `L-056`, `L-057`, `L-058`, `L-060`, `L-061`, `L-397`, `L-408`, `L-443`, `L-453`, `L-454`, `L-458`, `L-460`, `L-461`, `L-467`, `L-468`, `L-470`, `L-473`, `L-474`, `L-475`, `L-476`, `L-521`, `L-522`, `L-537`, `L-538`, `L-539`, `L-575`, `L-669`, `L-835`, `L-836`。

---

## 1. 目的と境界

複数マップが増えた状態でも目的のマップ・ノードをすぐに見つけ、マップ同士やノード同士を相互に参照・整理し、削除や編集に伴う参照切れを検知・修正できるようにする。

### 対象外（YAGNI）

- フォルダーの多階層ネスト（サブフォルダー）、1 マップの複数フォルダー所属、フォルダーのドラッグ＆ドロップ並べ替え。
- マップ間リンクのキャンバス上バッジ・ミニプレビュー・リンクグラフ可視化ビュー。
- ノード削除・マップ削除時の自動一括リンク書き換え（リンク切れ検出により利用者が明示的に確認・整理する）。
- 全マップ横断の一括置換や、検索結果からのインライン編集。
- ゴミ箱内マップの横断検索・被リンク対象化（ゴミ箱内のマップはアクティブなリンク先ではないため、そこを指すリンクはリンク切れとして検出する）。
- 別タブでの `draw-my-map.library-meta.v1` のリアルタイム自動同期（画面の表示は再読み込みまたはこちらのタブの次の書き込みで最新になる）。書き込みは、直前にストレージ上の最新メタを読んでその操作の変更だけを当てるので、別タブの更新を消さない（3.1 節「複数タブでの書き込み」）。

---

## 2. 既存実装との制約・接点・安全制限

- `MapIndexV1`（`draw-my-map.maps.v1`）と `libraryRestoreJournal.ts` の厳格キー検査はそのまま維持する。
- `Node` 任意属性追加時は `NODE_ATTRIBUTE_POLICY` と `nodeAttributePolicy.test.ts`（`SAMPLE` / `DIFFERENT` / キー一覧アサーション）を更新する。
- `MapEditor` は `key={`${view.currentMap.id}:${view.storageMode}`}` で再マウントされ、マウント直後は `nodes = []` から `useMapStorageRestoration` の `useEffect` で復元（`replaceMap` → `documentRevision` 進行 → `hydrated = true`）される。`useMapPersistence` の戻り値へ `hydrated: boolean` を追加公開し、他マップ特定ノードへのジャンプはこの復元完了を待ってから 1 回限り実行する。
- `NodeDetailPanel.test.tsx` が見出し配列と未選択案内件数を厳密検証しているため、2 節追加（計 7 節）に合わせてテストも更新する。
- **保護モード（`storageMode === "protected"`）での制限（L-002, L-061）**:
  - 保護モードでは `maps` は現在マップ 1 件のみ・`storage` は `noopProtectedStorage` であり、他マップは一切読めない前提に統一する。
  - 既存の「マップ一覧」「新しいマップ」ボタンは無効のまま維持し、マップ一覧ダイアログ（フォルダー管理・リンク切れ一括検出ダイアログを含む）は開かない。
  - ヘッダーの「全マップ検索」ボタンは保護モードでも有効とし、ダイアログ内で「保護モードのため現在開いているマップのみ検索しています」と明示して現在マップ内の検索・ジャンプを提供する。
  - 右パネルの「マップ間リンク」では、他マップを指すリンクを `missing-map`（リンク切れ）と誤判定せず、専用の `status: "protected-unavailable"` として「保護モードのため他マップのリンク先を確認・移動できません」と表示し移動ボタンのみ無効化する（リンク切れ扱いしない・L-002）。
  - 右パネルの「被リンク」では現在マップ内の被リンクのみ表示し、「保護モードのため他マップからの被リンクは確認できません」と注意表示する。
  - `libraryMetaStatus` は保護モードでは `"unavailable"` とし、メタデータへの書き込みは一切行わない。
- **競合状態（`conflict` / `externallyDeleted`）での制限（L-061）**:
  - 既存の `flushCurrentSession()` 経路を通る操作（他マップへのジャンプ・マップ切替・枝の他マップ移動・一括復元）は自動的に競合で拒否され、エラー通知を表示して `pendingNavigation` を発行しない。
  - 現在マップ内のノード編集（`addNodeMapLink` / `removeNodeMapLink`）は既存の `links` / `sources` と同じく通常のノード編集として扱い（保存時に競合で抑止）、独立キーのメタデータ操作（お気に入り・フォルダー）は本体競合とは独立して動作する。

---

## 3. データモデルと永続化

### 3.1 マップライブラリメタデータ（`domain/mapLibrary/mapLibraryMeta.ts` + `services/persistence/mapLibraryMetaStorage.ts`）

- ストレージキー: `MAP_LIBRARY_META_STORAGE_KEY = "draw-my-map.library-meta.v1"`
- 定数:
  - `MAX_MAP_FOLDERS = 50`
  - `MAX_MAP_FOLDER_NAME_LENGTH = 50`（コードポイント数）
  - `MAX_MAP_FOLDER_NAME_INPUT_LENGTH = 256`（正規化前の先行上限・L-443）
  - `MAX_RECENT_MAPS = 20`
  - `MAP_FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/`
- 型:
  ```ts
  export type MapFolder = {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };

  export type MapUserMeta = {
    readonly favorite?: boolean;
    readonly lastOpenedAt?: string;
    readonly folderId?: string;
  };

  export type MapLibraryMetaV1 = {
    readonly version: 1;
    readonly folders: readonly MapFolder[];
    readonly mapMeta: Readonly<Record<string, MapUserMeta>>;
  };

  export type MapLibraryMetaStatus = "ready" | "corrupt" | "unavailable";

  export type MapListTab = "all" | "favorites" | "recent";

  export type MapListFolderFilter =
    | { readonly kind: "all" }
    | { readonly kind: "unclassified" }
    | { readonly kind: "folder"; readonly folderId: string };
  ```
- 空既定値は毎回新しいオブジェクトを返す `createEmptyMapLibraryMeta()` とし、共有定数参照を返さない（L-461）。
- フォルダー名規則（`normalizeMapFolderName` / `mapFolderNameKey`）:
  - `nodeTag.ts` と同一の文字検証規則を採用する：
    1. 前後空白を削り、入力先行長（256）を検査（L-443）。空は `empty`。
    2. 連続空白（`\s+`）を半角スペース 1 個へ正規化。
    3. 制御文字および `nodeTag.ts` と同じ不可視書式文字集合（絵文字結合子 `U+200D`・異体字セレクタ `U+FE0E`/`U+FE0F` のみ例外許可）を含む場合は `invalid`。
    4. 重複判定鍵 `mapFolderNameKey(name)`: `U+200D`/`U+FE0E`/`U+FE0F` を除去 → `normalize("NFKC")` → 連続空白まとめ → `trim()` → `toLowerCase()` → `normalize("NFKC")`。鍵が空文字列になる場合は `invalid`。
    5. 正規化後 `name` のコードポイント数（`Array.from(name).length`）が 50 を超える場合は `too-long`（L-836）。
- デコード規則（`decodeMapLibraryMeta(raw)`）:
  - `raw === null`: `{ ok: true, meta: createEmptyMapLibraryMeta(), repaired: false }`（初回未作成）。
  - JSON 解析失敗、`version !== 1`、未知のトップレベルキー、`folders` が配列でない、`mapMeta` がプレーンオブジェクトでない場合は `{ ok: false, reason: "corrupt" }`（L-002, L-044, L-470）。
  - `folders` が `MAX_MAP_FOLDERS` を超える、要素がプレーンオブジェクトでない・未知キーあり・`id` が `MAP_FOLDER_ID_PATTERN` 違反・`name` が `normalizeMapFolderName(name)` 失敗または未正規化（`normalized !== name`）・重複 `id`・重複 `mapFolderNameKey`・`createdAt`/`updatedAt` が厳密 ISO 8601 でない（`normalizeMapTimestamp(v).repaired !== false`）場合は `{ ok: false, reason: "corrupt" }`。
  - `mapMeta` のキーが `isValidMapId` に違反、または値がプレーンオブジェクトでない・未知キーあり・型不正（`favorite` が boolean でない、`lastOpenedAt` が厳密 ISO 8601 でない、`folderId` が `MAP_FOLDER_ID_PATTERN` 違反）の場合は `{ ok: false, reason: "corrupt" }`。
  - `mapMeta[mapId].folderId` が `folders` に存在しない ID を指している場合のみ、その `folderId` を取り除いて `repaired: true` として回復する（孤立フォルダー参照の安全な修復）。`favorite: false` も外して `repaired: true` とし、全フィールドが空になったエントリは削除する。
- ストレージ I/O（`mapLibraryMetaStorage.ts`）:
  - `readMapLibraryMeta(storage)`: 読込例外を捕捉し `{ ok: false, reason: "read-error" }`、破損なら `{ ok: false, reason: "corrupt" }`、正常なら `{ ok: true, meta, repaired }`（L-002, L-056）。
  - `writeMapLibraryMeta(storage, meta)`: `try/catch` で `QuotaExceededError` 等を捕捉し `{ ok: true } | { ok: false, reason: "quota" | "write-error" }` を返す（L-001, L-056）。
  - `resetMapLibraryMeta(storage)`: 破損時の明示的初期化用。`MAP_LIBRARY_META_STORAGE_KEY` を空の `MapLibraryMetaV1` で上書きし成否を返す。
- 破損・読込不可時の挙動（L-002, L-669）:
  - `corrupt`: マップ本体は通常モードで編集継続する。マップ一覧ダイアログに `role="alert"` で破損案内と明示的な「メタデータを初期化」ボタンを表示し、押されるまで自動上書きしない。
  - `unavailable`（保護モード以外の `read-error`）: マップ本体は通常モードで編集継続する。マップ一覧ダイアログに `role="alert"` で「お気に入り・フォルダー情報を読み込めませんでした」と案内し、初期化ボタンは表示しない（一時読込不能で既存データを消さないため）。
  - **複数タブでの書き込み**: メタデータを書き込む操作（お気に入り・フォルダーの操作、マップの切り替え・作成・別名保存・枝の移動による最終閲覧日時の記録、マップの削除による掃除、一括バックアップの追加復元によるメタデータの統合、破損時の「メタデータを初期化」）は、書き込みの直前にストレージ上の最新の `draw-my-map.library-meta.v1` を読み（1 操作につき 1 回）、その操作の変更だけを当てて書き戻します。起動時に読んだメモリ上の値を基に全体を書き直さないので、別タブで付けたお気に入りや作ったフォルダー・所属を、こちらのタブの次の操作で消しません（同じ項目を同時に変えたときは後から書いた方が残る後勝ち）。書き込んだ後は、画面のメタデータも書いた結果（別タブの更新を含む）に更新します。書き込みの直前の読み取りが失敗した・壊れていたときは書き込みません。お気に入り・フォルダーの操作は「破損」「読み込めない」の扱いで拒否してその状態を画面へ反映し、マップの切り替えなどの主処理は成功させたうえで warning で記録を保存できなかったことを伝えます（追加復元はお気に入り・フォルダーを復元しなかったことを warning で伝えます）。フォルダーの上限（50 件）や重複名の判定も、この最新の値で行います。一括バックアップの書き出しも、他マップの本体と同じくストレージ上の最新のメタデータを 1 回読んで使うので、別タブで付けたお気に入り・フォルダーも含まれます（読むだけで書き込まず、画面の状態も変えません。最新が壊れている・読めないときはメタデータ抜きで書き出します）。「メタデータを初期化」は、最新がまだ壊れているときだけ空のメタデータで初期化します。別タブですでに初期化・更新されて読める状態なら上書きせず、画面をその最新（正常な状態）に更新して、warning「別のタブでお気に入り・フォルダー情報がすでに回復していたため、初期化せずに最新の情報を読み込みました。」で伝えます（直前の読み取りに失敗したときは書き込まず、「読み込めない」の扱いで拒否します）。（`mapLibraryMetaActions.ts` の `readLatestLibraryMeta`・`resolveReadyMeta`）。
  - `libraryMetaStatus !== "ready"` または保護モード中は、お気に入り・フォルダー割り当て・フォルダー管理の全書き込み操作を UI で `disabled` としフック側でも拒否する。
- メタデータ操作の純粋関数（`domain/mapLibrary/mapLibraryMeta.ts`）:
  - `toggleMapFavorite(meta, mapId)`: `favorite` をトグル（`false` はキー除去）。
  - `recordMapOpened(meta, mapId, openedAt)`: `lastOpenedAt` を更新（現在時刻は引数で受け取る・L-538）。
  - `assignMapFolder(meta, mapId, folderId: string | null)`: `folderId === null` なら未分類化（キー除去）。存在しない `folderId` は `{ ok: false, reason: "folder-missing" }` を返す。
  - `createMapFolder(meta, id, rawName, now)`: 正規化・重複・上限（50件）チェック後に追加。
  - `renameMapFolder(meta, folderId, rawName, now)`: 正規化・存在・他フォルダーとの重複チェック後に更新。
  - `deleteMapFolder(meta, folderId)`: フォルダーを削除し、そのフォルダーを参照する全 `mapMeta` から `folderId` を除去（マップ自体は残す）。
  - `pruneMapMetaForRemovedMap(meta, mapId)`: 削除・ゴミ箱移動されたマップの `mapMeta[mapId]` を除去。
  - `filterAndSortMapsForList(maps, meta, filter)`:
    - `filter`: `{ tab: MapListTab; folderFilter: MapListFolderFilter }`
    - **適用順序**: ①先に `folderFilter` で絞り込む（`all`: 全件、`unclassified`: `folderId === undefined`、`folder`: `folderId === filter.folderId`）→ ②次に `tab` を適用する：
      - `tab === "all"`: `sortMapEntriesForDisplay` 順。
      - `tab === "favorites"`: `meta.mapMeta[m.id]?.favorite === true` のみ（`sortMapEntriesForDisplay` 順）。
      - `tab === "recent"`: `meta.mapMeta[m.id]?.lastOpenedAt` を持つマップのみを `lastOpenedAt` 降順 → `id` 昇順で最大 `MAX_RECENT_MAPS`（20件）（L-002: `lastOpenedAt` 未記録のマップを混ぜない）。
    - 元の `maps` 配列を破壊せず新しい配列を返す（L-460）。

### 3.2 マップ間リンク（`types/node.ts` + `domain/nodes/nodeMapLink.ts`）

- 型（`types/node.ts`）:
  ```ts
  export type NodeMapLink = {
    readonly targetMapId: string;
    readonly targetNodeId?: number;
  };
  ```
  `Node` に任意項目 `mapLinks?: readonly NodeMapLink[]` を追加。値が無い・空配列のときはキーごと持たない。
- 定数・関数（`domain/nodes/nodeMapLink.ts`）:
  - `NODE_MAP_LINKS_MAX_COUNT = 10`
  - `isValidTargetNodeId(value: unknown): value is number`: `typeof value === "number" && Number.isSafeInteger(value) && value >= 1`（L-046, L-047）。
  - `parsePositiveNodeIdString(raw: string): number | null`: `/^[1-9][0-9]*$/` を満たす文字列のみ `Number(raw)` へ変換し `isValidTargetNodeId` を検証して返す（`<select>` 値復号用・L-046）。
  - `normalizeNodeMapLink(input: { targetMapId: unknown; targetNodeId?: unknown })`:
    - `targetMapId` が文字列かつ `isValidMapId(targetMapId)` でなければ `invalid-map-id`。
    - `targetNodeId` が `undefined` なら `{ targetMapId }`（キー省略）。
    - `targetNodeId` が定義されていて `isValidTargetNodeId` を満たさなければ `invalid-node-id`。
  - `nodeMapLinkKey(link: NodeMapLink): string`:
    - `link.targetNodeId === undefined ? `${link.targetMapId}:map` : `${link.targetMapId}:node:${link.targetNodeId}``（`targetMapId` は `[A-Za-z0-9_-]` のみのため `:` と衝突不能・L-539）。
  - `uniqueNodeMapLinks(links: readonly NodeMapLink[]): NodeMapLink[]`（先勝ちで重複除去）。
  - `areNodeMapLinksEqual(a, b): boolean`（`undefined` と `[]` は同値、要素順に `targetMapId` と `targetNodeId` を厳密比較）。
  - `withNodeMapLinks(node, mapLinks | undefined): Node`（空/undefined ならキーを外す）。
  - `addNodeMapLink(nodes, nodeId, currentMapId, input)`:
    - 検査順: `node-missing` → `normalizeNodeMapLink` → 自己ノード検査（`link.targetMapId === currentMapId && link.targetNodeId === nodeId` なら `self-node`）→ `duplicate` → `too-many`（>= 10）。
    - 成功時は末尾追加。
  - `removeNodeMapLink(nodes, nodeId, target: NodeMapLink): Node[] | null`（`nodeMapLinkKey` 一致で削除。対象ノード不在または一致するリンク不在は `null`。最後の 1 件削除時は `mapLinks` キーを外す・L-035）。
  - `remapNodeMapLinks(nodes, mapIdMapping: ReadonlyMap<string, string>): Node[]`:
    - 各ノードの `mapLinks` について、`mapIdMapping.get(link.targetMapId)` があれば新 ID に置換し、`uniqueNodeMapLinks` で正規化（一括復元時のリマップ用）。
  - `AddNodeMapLinkOutcome`, `formatNodeMapLinkFailure`（`never` 網羅）。
- V3 保存形式（`domain/persistence/mapDocumentNodeMapLinks.ts`）:
  - `normalizeMapDocumentNodeMapLinks(value, index, version)`:
    - `version !== 3 || value === undefined` → `{ ok: true, value: undefined }`（V1/V2 互換維持）。
    - 配列でない・件数 > 10・要素がプレーンオブジェクトでない・`targetMapId` / `targetNodeId` 以外の未知キーあり・正規化失敗は文書全体失敗（L-044, L-443, L-470）。
    - 成功時は `uniqueNodeMapLinks` 適用、空配列なら `undefined`。
    - JSON 読み込み（置き換え）では、自分自身を指すリンク（`targetMapId` が読み込んだマップで `targetNodeId` が同じノード）を検査しません（割り切り。手で作った・ほかのマップから持ってきたファイルでしか起きず、害はリンクを押すと自分のノードへ移動するだけのため。リンクの追加では `self-node` で拒否し、統合では除きます）。
  - `mapDocumentNodeProjection.ts`, `mapDocumentNode.ts` に `mapLinks` を追加。
- 構造操作・同値比較・属性ポリシー:
  - `NODE_ATTRIBUTE_POLICY.mapLinks = { split: "original-only", merge: "union", parentInsert: "none" }`。
  - `nodeMerge.ts`: `mapLinks` の union・`map-links-too-many`・`mapLinkSourceCount` / `mapLinkDuplicateCount`（既存 `linkSourceCount`/`tagSourceCount`/`sourceSourceCount` の命名規則に統一）・`isSameNodeMergePlan` を追加。`planNodeMerge`・`mergeNodes`（ドメインと `useNodes`）は末尾の引数に現在マップの ID（`currentMapId`）を受け取り、統合するノード（残すノード・吸収されるノード）を指すリンク（`isSelfNodeMapLink` を選んだ各ノードに当てる。追加時の `self-node` と同じ判定。吸収されるノードを指すものは統合の直後にリンク切れになるため）を重複除去の前に除いて `mapLinkSelectedTargetCount` に数える（`isSameNodeMergePlan` の比較対象。上限判定は除いた後の件数）。`useNodeMergeDialog` は `mapId` を渡す。`nodeMergePreview.ts` にプレビュー文言「マップ間リンク: N 件（重複 M 件を除く）」（重複 0 件時は括弧なし。統合するノードを指すリンクを除いたときは「N 件（重複 M 件、統合するノードを指すリンク K 件を除く）」のように 0 件の項目を省いて添え、残りが 0 件でも行を出す）を追加。
  - `mapHistory.ts`: `areNodesEqual` の `mapLinks` キーで `areNodeMapLinksEqual` を使用。
  - `mapConflict.ts`: `areNodesEqual` に `areNodeMapLinksEqual` を追加。
  - `nodeAttributePolicy.test.ts`: `SAMPLE`・`DIFFERENT`・キー一覧へ `mapLinks` を追加。

### 3.3 一括バックアップ・復元（`libraryBackupCodec.ts` / `libraryBackupExport.ts` / `libraryRestoreTransaction.ts`）

- `LibraryBackupV1` に任意フィールドを追加（`version: 1` 維持）:
  ```ts
  folders?: readonly MapFolder[];
  mapMeta?: Readonly<Record<string, MapUserMeta>>;
  ```
- **エクスポート時（`prepareLibraryBackup`）**:
  - `libraryMetaStatus === "ready"` のとき：
    - `folders`: `libraryMeta.folders` が 1 件以上あれば空フォルダーも含め全件を出力（0 件ならキー省略）。
    - `mapMeta`: アクティブな `maps` に含まれる `mapId` のエントリだけを抽出し、1 件以上あれば出力（0 件ならキー省略）。
  - `libraryMetaStatus !== "ready"` のときは `folders` / `mapMeta` を含めずマップ本体のみエクスポートする（救出優先）。ready のときも、出力するメタデータは `prepareBackup` の時点でストレージから読んだ最新（`resolveBackupLibraryMeta`。別タブの更新を含む）を使い、最新が壊れている・読めないときはマップ本体のみにする。読むだけで画面の状態へは反映しない（`revisionRef` を進めると、開いている復元のプレビューまで古い扱いになるため）。
- **デコード時（`decodeLibraryBackup`）**:
  - トップレベルキーは許可リスト（`format`, `version`, `exportedAt`, `currentMapId`, `maps`, `folders`, `mapMeta`）で検査し、未知キーは拒否する（L-044）。
  - `folders` / `mapMeta` が省略されている旧 V1 バックアップはそのまま正常デコードする。
  - `mapMeta` 検証時は要素走査前に `Object.keys(mapMeta).length > value.maps.length` を先行拒否する（L-443）。
  - 存在する場合は厳格検証（L-044, L-470）：`decodeMapLibraryMeta` と同一の型・未知キー・フォルダー上限（50）・フォルダー名・ID・厳密 ISO 日時検査に加え、`mapMeta` のキーは `backup.maps` に含まれる `id` のみ、`folderId` は同バックアップ内の `folders` に存在する ID のみ許可する。違反があればバックアップ全体を拒否する。
- **追加復元時（`planLibraryRestore` / `writeLibraryRestore`）**:
  - 復元される全マップに新規 `mapId` を採番し、`mapIdMapping: Map<oldMapId, newMapId>` を作成する。
  - 各復元マップの `document.nodes` に対し `remapNodeMapLinks(nodes, mapIdMapping)` を適用してバックアップ内マップ同士のリンクを維持する（バックアップ外の `targetMapId` はそのまま残す）。
  - `writeLibraryRestore` でメインインデックスとマップ本体書き込みが確定した**後**、`libraryMetaStatus === "ready"` かつバックアップに `folders` または `mapMeta` がある場合は、`mergeLibraryMetaForRestore(existingMeta, backupFolders, backupMapMeta, mapIdMapping, generateId)` でメタデータを統合し `writeMapLibraryMeta` で保存する：
    1. バックアップの各フォルダーについて、同じ `mapFolderNameKey` の既存フォルダーがあればそこへ合流（`folderIdMapping.set(bf.id, existingId)`）。
    2. 無ければ、合計フォルダー数が `MAX_MAP_FOLDERS`（50）未満なら追加する（既存フォルダーと `id` が衝突している場合は `generateId()` で新 ID を採番し `folderIdMapping` に記録）。
    3. 50 件上限に達していたら追加せず `droppedFolderCount` を記録する。
    4. バックアップの各 `mapMeta[oldMapId]` を `newMapId` へ付け替え、`folderId` を `folderIdMapping.get(oldFolderId)` へ変換する（上限超過でマッピングが無い場合は `folderId` キーを外し未分類化）。
  - `libraryMetaStatus` が `corrupt` / `unavailable` でバックアップに `folders` または `mapMeta` がある場合は、メタデータを上書きせず（L-669）、成功通知の代わりに warning「バックアップのマップを追加しましたが、お気に入り・フォルダー情報が破損しているため（`unavailable` は「読み込めなかったため」）、バックアップのお気に入り・フォルダーは復元していません。」を返す（L-001）。`folders` / `mapMeta` の無いバックアップは状態によらず通常の成功通知。
  - メタデータ保存失敗や上限超過による未分類化は警告通知に留め、確定済みのマップ本体復元は巻き戻さない（L-575）。

---

## 4. 横断読み込み・検索・リンクグラフのドメイン

### 4.1 全マップ共通スナップショット（`domain/mapLibrary/crossMapCorpus.ts` + `services/persistence/mapLibraryCorpusReader.ts`）

- 型:
  ```ts
  export type ReadableMapSnapshot = {
    readonly mapId: string;
    readonly mapName: string;
    readonly isCurrent: boolean;
    readonly nodes: readonly Node[];
  };

  export type UnreadableMapInfo = {
    readonly mapId: string;
    readonly mapName: string;
    readonly reason: "read-error" | "corrupt";
  };

  export type CrossMapCorpus = {
    readonly readableMaps: readonly ReadableMapSnapshot[];
    readonly unreadableMaps: readonly UnreadableMapInfo[];
  };
  ```
- 読み込み規則:
  - 他マップ読み込み関数 `readOtherMapsCorpus({ maps, currentMapId, storage })` と、現在マップ合成関数 `composeCrossMapCorpus({ otherMapsCorpus, currentMapId, currentMapName, currentNodes })` の 2 段に分離する。
  - `readOtherMapsCorpus`: `maps` のうち `entry.id !== currentMapId` のマップを表示順で走査し、`readMapBody(storage, entry.id)` → 既存 `parseMapDocumentJson(value)`（`parsed.value.nodes`）で読み取る。
    - `readMapBody` 失敗 → `unreadableMaps` に `reason: "read-error"`。
    - `value === null`（未保存の新規空マップ）→ `readableMaps` に `nodes: []`。
    - `parseMapDocumentJson` 失敗 → `unreadableMaps` に `reason: "corrupt"`（L-002）。
    - 成功 → `readableMaps` に `nodes: parsed.value.nodes`。
  - `composeCrossMapCorpus`: 現在マップ（`{ mapId: currentMapId, mapName: currentMapName, isCurrent: true, nodes: currentNodes }`）を先頭に置き、後ろに `otherMapsCorpus.readableMaps` を連結した `CrossMapCorpus` を返す。
  - **キャッシュ方針と更新契機**: `MapEditor` 内に `corpusRefreshKey` state（初期値 `0`）を持ち、`CrossMapSearchDialog` または `BrokenMapLinksDialog` を開くたびに `setCorpusRefreshKey((k) => k + 1)` で更新する。`otherMapsCorpus` の `useMemo` は `[他マップのキー, mapId, storageSession.storage, storageMode, corpusRefreshKey]` に依存させ（保護モード時は空の `otherMapsCorpus` を返す）、現在マップの編集（`nodes` 変更）では他マップを再読込せず `composeCrossMapCorpus` だけを軽量に再計算する。`maps` 配列そのものには依存させない（自動保存のたびに現在マップの `updatedAt` がインデックスへ書かれ `maps` が新しい配列になるため）。代わりに純関数 `otherMapsCorpusKey(maps, currentMapId)`（`crossMapCorpus.ts`。現在マップ以外の項目を表示順に並べた `id`・`name`・`updatedAt` から作る文字列）が変わったときだけ、読み込みに使う `maps` を差し替える。他マップの追加・削除・ゴミ箱・復元・名前変更・本体の置き換え（`updatedAt` の変化）と `corpusRefreshKey` の更新では読み直す。

### 4.2 全マップ横断検索（`domain/search/crossMapSearch.ts`）

- 定数: `MAX_CROSS_MAP_SEARCH_RESULTS = 100`
- 型:
  ```ts
  export type CrossMapSearchMatchField = "label" | "note" | "tag" | "link" | "source";

  export type CrossMapSearchMatch = {
    readonly mapId: string;
    readonly mapName: string;
    readonly isCurrentMap: boolean;
    readonly nodeId: number;
    readonly label: string;
    readonly parentLabel: string | null;
    readonly matchedBy: CrossMapSearchMatchField;
    readonly snippet?: string;
  };

  export type CrossMapSearchResult = {
    readonly matches: readonly CrossMapSearchMatch[];
    readonly total: number;
    readonly matchedMapCount: number;
    readonly unreadableMaps: readonly UnreadableMapInfo[];
  };
  ```
- 関数: `searchCrossMapCorpus(corpus: CrossMapCorpus, query: string, limit = MAX_CROSS_MAP_SEARCH_RESULTS): CrossMapSearchResult`
  - クエリ正規化: `normalizeNodeSearchQuery(query)`（NFKC + 小文字化 + trim）。空なら `{ matches: [], total: 0, matchedMapCount: 0, unreadableMaps: corpus.unreadableMaps }`。
  - 各 `readableMap` で親ラベル解決用の `Map<number, string>` を作り、各 `node` について以下の順で最初に一致した種別と `snippet`（任意）を採用：
    1. `label`: `node.label !== ""` かつ `normalizeNodeSearchText(node.label).includes(normalizedQuery)`（`snippet` なし）
    2. `note`: `node.note` が存在し一致（一致周辺を抜粋した最大 80 文字の文字列を `snippet` に格納）
    3. `tag`: `node.tags` のいずれかが一致（一致したタグを `snippet` に格納）
    4. `link`: `node.links` のいずれか（元 `href` または `decodeURI(href)`）が一致（一致した URL を `snippet` に格納）
    5. `source`: `node.sources` のいずれかの `title` / `page` / `url`（`decodeURI` 含む）が一致（一致した出典タイトルを `snippet` に格納）
  - 並び順: `corpus.readableMaps` 順（現在マップ先頭 → 他マップ表示順）、各マップ内は `nodes` 配列順。
  - `limit`（100）件まで `matches` に格納し、`total` と `matchedMapCount` は全件カウントする。

### 4.3 リンク解決・被リンク・リンク切れ検出（`domain/mapLibrary/mapLinkGraph.ts`）

- `resolveNodeMapLink(link: NodeMapLink, corpus: CrossMapCorpus, options?: { storageMode?: "persistent" | "protected"; currentMapId?: string }): ResolvedNodeMapLink`:
  - `options?.storageMode === "protected"` かつ `options.currentMapId !== undefined && link.targetMapId !== options.currentMapId` の場合 → `{ status: "protected-unavailable", link }`（リンク切れ扱いしない・L-002）。
  - `readableMaps` に `link.targetMapId` がある場合：
    - `link.targetNodeId === undefined` → `{ status: "valid", link, targetMapName }`
    - `targetNodeId` が対象マップの `nodes` に存在 → `{ status: "valid", link, targetMapName, targetNodeLabel }`
    - 存在しない → `{ status: "missing-node", link, targetMapName }`
  - `unreadableMaps` に `link.targetMapId` がある場合：
    - `targetNodeId` の有無を問わず `{ status: "unreadable-map", link, targetMapName }` とする（L-002: 読めないマップを正常扱いしない）。
  - どちらにも存在しない場合 → `{ status: "missing-map", link }`。
- `collectBacklinks(corpus: CrossMapCorpus, targetMapId: string, targetNodeId: number): BacklinkCollectionResult`:
  - 全 `readableMaps` の全 `nodes` の `mapLinks` を走査。
  - `link.targetMapId === targetMapId` かつ `link.targetNodeId === targetNodeId` は `matchScope: "node"`、`link.targetNodeId === undefined` は `matchScope: "map"` として収集する。
  - 同一ノードからの重複はキー `${sourceMapId}:${sourceNodeId}:${matchScope}` で一意化する（同一ノードが対象ノードと対象マップ全体の両方を指している場合は `node` と `map` をそれぞれ 1 件ずつ表示する）。
  - 並び順: `matchScope === "node"` を先、`matchScope === "map"` を後とし、各区分内は `readableMaps` 順 → `nodes` 配列順。
  - 返却: `{ items: readonly BacklinkItem[]; unreadableMaps: readonly UnreadableMapInfo[] }`。
- `collectBrokenMapLinks(corpus: CrossMapCorpus): BrokenMapLinksResult`:
  - 全 `readableMaps` の全 `nodes` の `mapLinks` を走査し、`resolveNodeMapLink` の結果が `"missing-map" | "missing-node" | "unreadable-map"` のものをすべて収集する。
  - 各要素 `BrokenMapLinkItem`: `{ sourceMapId, sourceMapName, isCurrentMap, sourceNodeId, sourceNodeLabel, link, status: "missing-map" | "missing-node" | "unreadable-map", targetMapName?: string }`（位置インデックス `linkIndex` は持たず `link` 値で識別する・L-035）。
  - 返却: `{ items: readonly BrokenMapLinkItem[]; unreadableMaps: readonly UnreadableMapInfo[] }`。

---

## 5. フック・状態管理・ジャンプ配線

### 5.1 `useNodes` の追加操作（`client/src/hooks/useNodes.ts`）

- `addNodeMapLink(nodeId: number, currentMapId: string, input: { targetMapId: string; targetNodeId?: number }): AddNodeMapLinkOutcome`
  - 最新 ref（`getCurrentState().nodes`）で `addNodeMapLink` を判定し、成功時のみ `applyNonStructuralChange` を実行して `{ ok: true }` を返す（1 回の Undo/Redo、`documentRevision` は進めない。L-001, L-453）。
- `removeNodeMapLink(nodeId: number, target: NodeMapLink): boolean`
  - `nodeMapLinkKey` 一致で 1 回の Undo/Redo 削除を行い、受理可否を返す（L-035）。

### 5.2 `useMapLibrary` のメタデータ統合（`client/src/hooks/useMapLibrary.ts` / `mapLibraryState.ts`）

- `libraryMeta: MapLibraryMetaV1` と `libraryMetaStatus: MapLibraryMetaStatus` を `PersistentLibraryState` 内に含め、`commitLibrary` 経由で一括更新することで `revisionRef`（バックアップ・復元プレビューの鮮度検証）と完全同期させる（L-036, L-476）。`view`（`ready` 時）へ `libraryMeta`・`libraryMetaStatus` を公開する。
- 起動時（`mapLibraryStartup` 完了後）:
  - 保護モード時は `libraryMetaStatus = "unavailable"`、`libraryMeta = createEmptyMapLibraryMeta()` とし、ストレージへ一切アクセスしない。
  - 通常モード時は `readMapLibraryMeta(storage)` を実行：
    - `ok: true` なら `libraryMetaStatus = "ready"` とし、現在マップの `lastOpenedAt` を記録して保存する（保存失敗時は既存の `startupNotice` が無ければ警告通知を出し、既存の `startupNotice` がある場合は上書きせず起動を継続する）。
    - `reason: "corrupt"` なら `libraryMetaStatus = "corrupt"`、`libraryMeta = createEmptyMapLibraryMeta()`（自動上書きはしない・L-002）。
    - `reason: "read-error"` なら `libraryMetaStatus = "unavailable"`、`libraryMeta = createEmptyMapLibraryMeta()`。
- 公開アクション（すべて成否 `Result` を返し、保護モードまたは `libraryMetaStatus !== "ready"` 中の書き込みは拒否・L-001, L-061）:
  - `toggleFavorite(mapId: string)`
  - `assignFolder(mapId: string, folderId: string | null)`
  - `createFolder(name: string)`
  - `renameFolder(folderId: string, name: string)`
  - `deleteFolder(folderId: string)`
  - `resetLibraryMeta()`（`libraryMetaStatus === "corrupt"` の明示的初期化用。保護モードでは拒否）
- 既存アクションへのフック（メタデータ書込失敗でも主処理の成功は巻き戻さない・L-575）:
  - `switchMap` / `createMap` / `saveCurrentAsNewMap` / `moveBranchToMap` 成功時: 遷移先・新規作成マップの `lastOpenedAt` を更新して `commitLibrary` へ反映する。また `switchMap` 成功戻り値に遷移先 `sessionNumber` を含める。
  - `deleteMap`（ゴミ箱移動）および `permanentlyDeleteMap`（完全削除）の共通処理 `completeActiveMapDeletion` 成功時: 削除対象マップの `pruneMapMetaForRemovedMap` と、現在マップ削除に伴い次に開くマップ（最後の 1 件削除時は新規作成マップ）の `recordMapOpened` を**メモリ上で 1 つの `nextMeta` に合成し、1 回だけ `writeMapLibraryMeta` で保存**してから `commitLibrary` する（L-453, L-537）。
  - `confirmRestore`（一括復元）成功時: バックアップの `folders` / `mapMeta` をマージして 1 回だけ `writeMapLibraryMeta` で保存し `commitLibrary` に反映する。
  - `isLibraryBackupPreviewCurrent`: `revisionRef` の一致によりメタデータ変更後の古いプレビューも自動的に無効化する。

### 5.3 コンポーネント所有境界とジャンプ配線（`page.tsx` ↔ `MapEditor`）

- 型:
  ```ts
  export type PendingMapNodeNavigation = {
    readonly mapId: string;
    readonly sessionNumber: number;
    readonly nodeId: number;
    readonly token: number;
  };
  ```
- **所有境界**:
  - `MapLibraryDialog`（一覧・お気に入り・最近使用・フォルダー管理・ゴミ箱・バックアップ）はシェル（`page.tsx`）が所有する。
  - `CrossMapSearchDialog` と `BrokenMapLinksDialog` は `MapEditor` が所有する（`currentNodes`、`removeNodeMapLink`、`nodeSearchNavigation`、`editorShortcutsEnabled`、`dialogMouseClickedAtRef` に直接アクセスできる）。両ダイアログ表示中も `MapEditor` の `editorShortcutsEnabled` を `false`（背景 `inert`）にし、`onMouseClick` で `dialogMouseClickedAtRef` を更新する（L-060, L-061, L-408）。
- **シェル ↔ `MapEditor` の接続 props**:
  - `pendingNavigation: PendingMapNodeNavigation | null` / `onConsumePendingNavigation(token: number)`
  - `onSwitchToMapTarget(targetMapId: string, targetNodeId?: number): void`（`page.tsx` 側で保護モード拒否 → `library.switchMap(targetMapId)` → 成功かつ `targetNodeId !== undefined` なら `{ mapId: targetMapId, sessionNumber: result.sessionNumber, nodeId: targetNodeId, token }` を設定、失敗時は `shellNotice` に alert 通知・L-001）
  - **破棄条件（L-037）**: `page.tsx` 側で他のマップ切替・作成・削除・復元・保護モード移行が発生したとき、および対象マップと異なる遷移が起きたときは必ず `pendingNavigation` を `null` にクリアする。
  - `brokenLinksDialogRequest: number`（マップ一覧ダイアログの「リンク切れを確認」押下時に一覧を閉じてインクリメント → `MapEditor` が `BrokenMapLinksDialog` を開く）
  - `onBrokenLinksDialogClosed: () => void`（`BrokenMapLinksDialog` 閉鎖時にヘッダーの「マップ一覧」ボタン `listButtonRef` へフォーカスを戻す）
- **ジャンプ実行（`MapEditor` 内）**:
  - **同一マップ内への移動**（`targetMapId === mapId`）: `MapEditor` 内のヘルパー `navigateToLocalNode(nodeId)` を実行する：
    1. `nodes` に `nodeId` が存在しなければ `operationNotices` に `alert`「移動先のノードが見つかりませんでした」を出して終了。
    2. `viewMode === "outline"` の場合は `returnToCanvas()` を通さず、直接 `setViewMode("map")`・`setViewportScale(INITIAL_VIEWPORT.scale)`・`resolutionFilter.resetViewportScale(INITIAL_VIEWPORT.scale)` を行い、さらに古いクロージャの `resolutionVisibleNodeIds` を使わないよう `INITIAL_VIEWPORT.scale` 基準の `collectVisibleNodeIds` で `resolveNodeSearchReveal` を計算して必要な祖先展開・解像度切替・`selectNode(nodeId)`・`issueFocusRequest(nodeId)` を実行する（L-453）。
    3. `viewMode === "map"` の場合は既存の `nodeSearchNavigation.navigateToNode(nodeId)` をそのまま呼ぶ。
  - **別マップ切替後の消費**（`pendingNavigation !== null && pendingNavigation.mapId === mapId && pendingNavigation.sessionNumber === storageSession.sessionNumber && persistence.hydrated`）:
    - `useEffect` で `navigateToLocalNode(pendingNavigation.nodeId)` を実行し、対象ノード不在・復元失敗時も含めて必ず `onConsumePendingNavigation(pendingNavigation.token)` を呼んで 1 回限り消費する（L-037）。
  - 詳細メモの編集中に右パネルから他マップへ移動した場合、クリックに伴う `blur` でメモが確定してから `flushCurrentSession()` が走ることを統合テストで検証する（L-397）。

---

## 6. UI 設計

### 6.1 ヘッダー拡張（`MapEditor.tsx`）

- `MapEditor` 内の `AppHeader` の `searchControls` スロットに、既存 `NodeSearchBox` の隣として **「全マップ検索」** ボタンを配置する（`viewMode === "outline"` でも利用できるよう、アウトライン表示中も表示する）。
  - `ref={crossMapSearchButtonRef}`, `aria-haspopup="dialog"`, `aria-expanded={crossMapSearchOpen}`。
  - 保護モードでも有効（現在マップ内の検索が可能）。
- グローバルショートカット `Cmd/Ctrl+Shift+F`:
  - `editorShortcutsEnabled` が `true`、かつ既存の `isProcessableKeyEvent`（repeat / IME 除外）および `!isEditableTarget(event.target)`（ボタン上でも有効・テキスト入力や `contenteditable` は除外）を満たすとき、`CrossMapSearchDialog` を開く（L-408, L-474, L-522）。

### 6.2 全マップ横断検索ダイアログ（`CrossMapSearchDialog.tsx`）

- `MapEditor` 内にマウント。`role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `useDialogFocusTrap`。開くたびに `corpusRefreshKey` をインクリメントする。
- 構成:
  - 保護モード時は「保護モードのため現在開いているマップのみ検索しています」の案内バナーを表示（L-002, L-061）。
  - 検索入力欄（ラベル「全マップを検索」、自動フォーカス、IME 変換中・repeat Enter 抑止・L-474, L-408）。
  - 結果件数・該当マップ数表示（`role="status"` 例: `「キーワード」に 12 件一致（3 マップ）`、100 件超過時は `先頭 100 件を表示`）。
  - `unreadableMaps` がある場合の警告バナー（`role="alert"`、読み取れなかったマップ名を列挙・L-002）。
  - 結果リスト（`role="listbox"`（`aria-label="検索結果"`）/ `role="option"` のボタン要素の非入れ子構成・L-835）:
    - 各行: マップ名（現在マップには「現在」バッジ）・ノードラベル・親ラベル（任意）・一致種別バッジ（ラベル/メモ/タグ/リンク/出典）・スニペット（任意）。
    - 上下キーで選択移動、Enter またはクリックで移動。`NodeSearchBox` と同じく、検索欄を `role="combobox"`（`aria-autocomplete="list"`・`aria-controls`・`aria-expanded`・`aria-activedescendant`）にし、選択中の候補は `aria-selected="true"` で伝える（フォーカスは検索欄に残し、候補は `tabIndex={-1}`）。
  - 閉じるボタン / Escape キーで閉じ、`crossMapSearchButtonRef` へフォーカス復帰。

### 6.3 マップ一覧ダイアログ拡張（`MapLibraryListScreen.tsx` / `MapFolderManagerScreen.tsx` / `MapLibraryDialog.tsx` / `mapLibraryDialogState.ts`）

- ダイアログ幅を `max-w-[36rem]` に拡張。
- `useMapLibraryDialogState` がリストの絞り込み状態（`listTab: MapListTab`, `folderFilter: MapListFolderFilter`）を保持する（画面遷移による `MapLibraryListScreen` のアンマウントでも維持され、選択中フォルダーが削除された場合は自動で `{ kind: "all" }` へ戻す・L-475）。
- フィルタ適用中にマップを削除したときのフォーカス移動は、`filteredMaps`（絞り込み後の表示配列）を基準に隣行を選ぶ（L-460, L-475）。
- `MapLibraryDialogScreen` への追加画面（3 状態）：
  - `{ kind: "folders" }`（`onEscape` → `"list"`）
  - `{ kind: "folderRename"; folderId: string }`（`onEscape` → `"folders"`、対象消失時は `isTargetMissing` 扱いでフォルダー一覧へ戻す）
  - `{ kind: "folderDeleteConfirm"; folderId: string }`（`onEscape` → `"folders"`、対象消失時は同上、キャンセルボタンを既定フォーカス・repeat Enter 抑止・L-408）
- `MapLibraryDialogFocusTarget` にフォルダー関連ターゲット（`folderButton` / `folderRow` / `folderCreateInput` 等）を追加し、既存と同じ属性ベース検索でフォーカス復帰する。
- **一覧画面（`MapLibraryListScreen`）**:
  - 上部: 見出し「マップ一覧」＋「新しいマップ」ボタン＋「フォルダー管理」ボタン（保護モードまたは `libraryMetaStatus !== "ready"` 時は `disabled`）。
  - ステータスバナー:
    - `libraryMetaStatus === "corrupt"`: `role="alert"` で破損案内＋「メタデータを初期化」ボタンを表示。
    - `libraryMetaStatus === "unavailable"`（保護モード以外）: `role="alert"` で読込失敗案内を表示（初期化ボタンなし）。
  - フィルタバー:
    - 表示切替ボタン群（`aria-pressed`）: 「すべて」「お気に入り」「最近使用」。
    - フォルダー絞り込み `<select aria-label="フォルダーで絞り込み">`: 「すべてのフォルダー」「未分類」＋登録済みフォルダー一覧。長いフォルダー名（最大 50 コードポイント）でもダイアログの幅を超えないよう `min-w-0 max-w-full truncate`（行のフォルダー選択も `min-w-0 max-w-full`）。
  - マップ一覧各行（ボタン入れ子なし・L-835）:
    - お気に入りトグルボタン（★/☆、`aria-pressed`、状態によらない `aria-label="お気に入り: ${map.name}"`（重要度・表示の切り替えボタンと同じく状態は `aria-pressed` だけで伝える）、保護モードまたは `libraryMetaStatus !== "ready"` 時は `disabled`）。
    - マップを開くボタン（マップ名・所属フォルダー名バッジ・`（開いています）`）。
    - 日時 `<span>`（既存と同じくボタン外配置。最近使用タブ時は `最終閲覧: ...`、それ以外は既存の更新日時）。
    - 所属フォルダー選択 `<select aria-label="${map.name}のフォルダー">`（保護モードまたは `libraryMetaStatus !== "ready"` 時は `disabled`）。
    - 「名前を変更」「削除」ボタン（既存通り）。
  - 絞り込み結果が 0 件のときは空状態メッセージ（「該当するマップはありません」）を表示。
  - 下部操作: 「リンク切れを確認」「ゴミ箱」「全マップをバックアップ」「バックアップから復元」＋「閉じる」。
- **フォルダー管理画面（`MapFolderManagerScreen`）**:
  - 新規作成フォーム（フォルダー名入力＋「作成」、`<form noValidate>`, IME/repeat 抑止、上限 50 件の `role="status"` 案内、失敗は `role="alert"`）。
  - 登録済みフォルダー一覧: フォルダー名・所属マップ数・「名前を変更」（`folderRename` 画面へ遷移）・「削除」（`folderDeleteConfirm` 画面へ遷移、「中のマップは削除されず『未分類』になります」を明記）。
  - 「マップ一覧に戻る」ボタン。

### 6.4 右パネル拡張（`NodeDetailPanel.tsx` / `NodeMapLinksSection.tsx` / `NodeBacklinksSection.tsx`）

- セクション順（全 7 節）:
  1. 詳細メモ
  2. タグ
  3. リンク
  4. 出典
  5. **マップ間リンク**（`NodeMapLinksSection`）
  6. **被リンク**（`NodeBacklinksSection`）
  7. イラスト
- **`NodeMapLinksSection`**:
  - `key={selectedNode ? \`mapLinks:${selectedNode.id}\` : "mapLinks:none"}`（`documentRevision` は `key` に含めず props で監視して下書き・エラーのみリセット、フォーカス喪失を防止・L-397）。
  - 見出し「マップ間リンク」。未選択時は「ノードを選択してください」のみ表示。
  - 件数表示「N / 10 件」。上限到達時は `role="status"` で案内（入力・ボタンは `disabled` にしない）。
  - 登録済みリンク一覧:
    - 各行は解決結果（`resolveNodeMapLink(link, corpus, { storageMode, currentMapId })`）を表示：
      - `valid`: 移動ボタン（`対象マップ名` または `対象マップ名 / 対象ノード名`）＋削除ボタン（`link` 値を渡す・L-035）。
      - `protected-unavailable`: 「保護モードのため確認不可」表示（リンク切れ扱いしない・L-002。移動ボタンは無効または非表示）＋削除ボタン。
      - `missing-map` / `missing-node` / `unreadable-map`: 「リンク切れ」表示＋理由（`対象マップが見つかりません` / `対象ノードが見つかりません` / `対象マップを読み取れません`）＋削除ボタン。
    - 削除後フォーカスは対象マップセレクトへ戻す（L-397）。
  - 追加フォーム（`<form noValidate>`）:
    - 「対象マップ」`<select>`（`maps` 一覧）
    - 「対象ノード（任意）」`<select>`（「マップ全体」＋選択中対象マップの `readableMaps` から得たノード一覧。対象が現在マップのときは自分自身のノード `selectedNode.id` を選択肢から除外。対象マップが読込不可時は「マップ全体」のみ＋注意文言）。値復号には `parsePositiveNodeIdString` を使用（L-046）。
    - 「追加」ボタン。成功時は 1 回の Undo/Redo。失敗は `role="alert"` で通知（L-057）。
- **`NodeBacklinksSection`**:
  - 見出し「被リンク」。未選択時は「ノードを選択してください」のみ表示。
  - 保護モード時は「保護モードのため他マップからの被リンクは確認できません」と注意表示（現在マップ内の被リンクは引き続き表示・L-002）。
  - `collectBacklinks(corpus, currentMapId, selectedNode.id)` の結果を表示。
  - 0 件のときは「このノードへの被リンクはありません」。
  - 各行: 参照元マップ名・参照元ノード名・対象区分（「このノードへ」/「このマップ全体へ」）。クリックで参照元へ移動。
  - `unreadableMaps.length > 0` のときは「一部のマップを読み取れなかったため、すべての被リンクを表示できていません」と注意表示（L-002）。

### 6.5 リンク切れ検出ダイアログ（`BrokenMapLinksDialog.tsx`）

- `MapEditor` 内にマウント。入口はマップ一覧ダイアログの「リンク切れを確認」ボタン（一覧を閉じて `brokenLinksDialogRequest` 経由で開き、開くたびに `corpusRefreshKey` をインクリメント）。
- `role="dialog"`, `aria-modal="true"`, `useDialogFocusTrap`。
- 表示内容:
  - `collectBrokenMapLinks(corpus)` をスキャンして結果を表示。
  - `unreadableMaps.length > 0` のときは読み取れなかったマップ一覧を警告表示（L-002）。
  - 0 件のときは「リンク切れは見つかりませんでした」を表示。
  - 1 件以上のときは件数と一覧を表示：
    - 参照元マップ名（現在マップバッジ）・参照元ノード名・リンク先情報（対象マップ名または ID・対象ノード ID）・理由バッジ（マップなし / ノードなし / 読込失敗）。
    - 「参照元へ移動」ボタン（クリックでダイアログを閉じ、参照元マップ・参照元ノードへ移動）。
    - 現在マップのリンク切れに限り「このリンクを削除」ボタンも提供（`removeNodeMapLink(item.sourceNodeId, item.link)` で 1 回の Undo/Redo 削除・即座に再スキャン・L-035）。
  - 「閉じる」ボタン / Escape で閉じ、`onBrokenLinksDialogClosed()` でヘッダーの「マップ一覧」ボタンへフォーカスを戻す。

---

## 7. 既存機能との接続マトリクス

| 機能 | 扱い |
| --- | --- |
| 保存・JSON・localStorage（マップ本体） | V3 任意項目 `mapLinks` を往復（V1/V2 互換維持） |
| 保存・localStorage（メタデータ） | 独立キー `draw-my-map.library-meta.v1` に `folders`・`mapMeta` を保存（`PersistentLibraryState` に統合して `revisionRef` と同期） |
| Undo / Redo | `mapLinks` の追加・削除は 1 操作で履歴記録。お気に入り・最近使用・フォルダー操作はマップ編集履歴の対象外 |
| 複製・コピー＆貼り付け・枝の他マップ移動 | `mapLinks` を値コピーで引き継ぐ。別マップへの枝の移動では、移動先でノード ID を振り直すので、枝の中のノードを指していたリンク（`targetMapId` が移動元マップで `targetNodeId` が枝の中の旧 ID）は、移動先マップ・新しい ID へ付け替えます（付け替えて重複したら 1 件にまとめます。`remapMovedBranchMapLinks`）。枝の外のノード・マップ全体・ほかのマップを指すリンクは値のまま写します。枝の外（移動元マップのほかのノードや、ほかのマップ）から枝の中を指していたリンクは書き換えません（割り切り。移動の後は「リンク切れを確認」で「ノードなし」として見つかり、利用者が直します）（`transferNodeBranch` は移動元・移動先のマップ ID を受け取る） |
| 分割・統合・親挿入 | 分割は元ノードのみ保持、統合は union（10件超過は拒否）、親挿入は持たない |
| 競合検出（複数タブ） | `mapConflict.ts` で `mapLinks` 差分を検出。競合中は他マップジャンプ・一括復元を拒否（`flushCurrentSession` 経路） |
| 保護モード | マップ一覧・フォルダー管理・メタデータ書込・リンク切れ一括ダイアログ・他マップ移動を無効化。現在マップの横断検索・右パネル閲覧編集は利用可能（他マップ向けリンクは `protected-unavailable` としてリンク切れ誤判定を防ぐ） |
| 一括バックアップ・復元 | バックアップに任意で `folders`・`mapMeta` を含め、追加復元時はバックアップ内 `mapLinks.targetMapId` を新 ID へリマップし、フォルダー・メタを安全にマージ |
| ゴミ箱 | ゴミ箱移動時に `mapMeta` の削除と次マップの `lastOpenedAt` 更新を 1 回の書き込みで反映。ゴミ箱内マップへのリンクはリンク切れとして検出し、元 ID 復元時は再び有効になる |
| アウトライン表示 | 横断検索・リンクジャンプで別ノードへ飛ぶ場合は `returnToCanvas()` を通さず直接マップ表示と初期ズーム基準で解像度判定してから対象ノードへフォーカス |

---

## 8. テスト・検証計画

1. **ドメイン単体テスト**:
   - `mapLibraryMeta.test.ts`: フォルダー名正規化・重複・上限 50・デコード/破損/孤立フォルダー修復・お気に入り/最近使用/フォルダー絞り込み（適用順含む）・削除時の未分類戻し・不変性。
   - `nodeMapLink.test.ts`: 正規化・`parsePositiveNodeIdString`・自己ノード拒否・重複・上限 10・値一致削除・リマップ・V3 往復・`nodeAttributePolicy.test.ts`・`nodeMerge.test.ts`・`mapHistory.test.ts`・`mapConflict.test.ts`。
   - `crossMapSearch.test.ts`: 5 フィールド検索優先順・正規化・上限 100・現在マップ先頭・読込不可マップ警告。
   - `mapLinkGraph.test.ts`: `valid` / `missing-map` / `missing-node` / `unreadable-map` / `protected-unavailable` 解決・被リンク（ノード直接＋マップ全体、一意化と順）・リンク切れ一括検出。
   - `libraryBackupCodec.test.ts` / `libraryRestoreTransaction.test.ts`: メタデータ付きバックアップ往復・旧バックアップ互換・未知キー/不正メタ拒否・復元時 `mapLinks` ID リマップ・フォルダーマージ（同名合流・ID衝突採番・50件上限）。
2. **コンポーネントテスト**:
   - `CrossMapSearchDialog.test.tsx`、`BrokenMapLinksDialog.test.tsx`、`MapFolderManagerScreen.test.tsx`、`MapLibraryListScreen.test.tsx`、`NodeMapLinksSection.test.tsx`、`NodeBacklinksSection.test.tsx`、`NodeDetailPanel.test.tsx`（7 節・見出し順更新）。
3. **ページ統合テスト（`client/src/app/__tests__/`）**:
   - 全マップ横断検索→他マップの折りたたみ内・解像度非表示ノードへの自動展開＋フォーカス遷移・アウトラインからの直接ジャンプ・保護モード時の現在マップ限定表示。
   - マップ間リンク追加→他マップ特定ノードジャンプ（詳細メモ未確定下書きの `blur`→`flush` 含む）→被リンク一覧からの逆ジャンプ→ノード/マップ削除後のリンク切れ検出と削除。
   - お気に入り・最近使用・フォルダー作成/名前変更/割り当て/絞り込み/削除（マップ非消失確認・フィルタ復帰・フィルタ中削除のフォーカス移動）・メタデータ破損時の非保護モード維持と初期化回復。
   - 一括バックアップ→追加復元後のマップ間リンク ID リマップとフォルダー復元。
4. **全体検証**: `client` で `npm run verify`（`tailwind:scan`, `lint`, `typecheck`, `test -- --runInBand`, `build`）をすべて成功させる。
