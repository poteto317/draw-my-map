# 複数タブの編集競合検出（候補008）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`。このリポジトリではタスクごとに実装サブエージェントを1つ起動し、別のサブエージェントが仕様適合とコード品質を順にレビューする。`superpowers:executing-plans` によるインライン実装は使わない。チェックボックスで進捗を追う。

**Goal:** 同一ブラウザの複数タブで Draw My Map を開いているとき、別タブでのマップ更新・削除によって、現在のタブの未保存データが黙って上書きされたり、逆に別タブの最新変更を自タブの古い内容で上書きしてしまう事故を防ぐ。

**Architecture:** `window` の `storage` イベントを監視して別タブでの本体・一覧の変更を早期検知するとともに、`writeBody` 実行直前にもストレージ上の最新値と照合する楽観ロックの二重防御を敷く。競合検知時は自動保存と flush を即座にブロックし、未保存データをメモリ上で保護したまま「別名で保存（flush バイパス）」、「最新を読み込む」、「JSON書き出し」の解決手段を提供する。

**Tech Stack:** Next.js 16、React 19、TypeScript、Jest 30、Testing Library。

**Spec:** `docs/superpowers/specs/2026-11-11-tab-sync-conflict-design.md`。実装者・レビュアーはこの設計も読む。

## Global Constraints

- 作業場所は `.worktrees/feat/phase16-tab-sync-conflict`。全回答・レビューは日本語。先にテストを追加して RED、実装後 GREEN を確認する（TDD 原則）。
- 既存の隔離モード `storageMode: "protected"`（再マウントを伴う）とは明確に区別し、通常モード `persistent` のままメモリ上の `conflictState: ConflictState`（`"none" | "conflict" | "externalUpdate" | "externallyDeleted"`）で自動保存・flush のみを安全に抑止する。
- 競合検知中における既存操作はガード対応表（設計書 3.3 節）に従う。「別名で保存」は旧マップへの flush を完全にバイパスして新規マップへ直接退避する（知見 L-061）。
- `MapBodyWriteResult` および `MapFlushResult` の型定義に `{ status: "conflict" }` を追加し、成否を呼び出し元で厳密に確認する（知見 L-001）。
- storage イベントの監視において、マップIDだけでなく `sessionNumber`（セッション世代番号）を照合し、ABA 問題を防止する（知見 L-037 / L-571）。
- `storage` イベントリスナーの登録・解除は React StrictMode の二重実行でリスナーが喪失しないよう安全に実装する（知見 L-469）。
- テストにおける `Storage.prototype` やイベントスパイは必ず `afterEach` で完全に復元する（知見 L-643, L-560）。
- ドキュメントの同一性判定は JSON 文字列表記差ではなく正規化されたデータ構造で比較する（知見 L-530）。
- 実装タスク内ではコミットしない。各タスク後に別エージェントの仕様適合・コード品質レビューを行い、指摘修正・再レビュー後に次へ進む。全タスク後に `client` で `npm run verify`。

## Review Focus

1. **競合時の上書き防止と成否伝播 (L-001, L-669)**: 競合検知中および `writeBody` 楽観ロック不一致時に、旧マップへの自動保存や flush が一切実行されず、未保存編集が保護されること。
2. **既存全操作のガードと別名保存 flush バイパス (L-061)**: 競合中に「別名で保存」を実行した際、旧マップへの flush をバイパスして新マップが安全に作成・切り替えされること。競合中の `switchMap`, `moveBranchToMap`, `confirmRestore` が安全に中断・拒否されること。
3. **ABA 問題・世代照合の堅牢性 (L-037, L-571)**: マップ切替や再作成の前後で、異なるセッションの storage イベントや古い非同期結果が現在のマップに誤適用されないこと。
4. **イベントリスナーとテストモックのライフサイクル (L-469, L-643, L-560)**: StrictMode 二重実行でもリスナーが喪失せず、テスト間でスパイやイベントリスナーが漏洩・連鎖破壊を起こさないこと。
5. **アクセシビリティと破壊的操作の誤実行防止 (L-153, L-408)**: 競合通知が常設ライブリージョンで確実に読み上げられ、最新読込の確認ダイアログでキャンセルが初期フォーカスされ、キーリピートが抑止されること。

## File Map

- `client/src/domain/mapLibrary/mapConflict.ts`（新規）: 競合判定、差分比較、退避名生成の純粋関数群。テストは `__tests__/mapConflict.test.ts`。
- `client/src/domain/mapLibrary/mapConflictMessages.ts`（新規）: 競合通知・確認メッセージ文言定義。
- `client/src/services/persistence/storageEventHub.ts`（新規）: window storage イベントの購読・抽象化。テストは `__tests__/storageEventHub.test.ts`。
- `client/src/services/persistence/protectedStorageSession.ts`: 保護モード用 `MapStorageSession` の新プロパティ（`sessionNumber: 0`, ダミー storage）対応。
- `client/src/types/mapStorageSession.ts`: `MapBodyWriteResult`, `MapFlushResult` に `{ status: "conflict" }` 追加。`MapStorageSession` に `readonly sessionNumber: number;` と `readonly storage: MapLibraryStorage;` を追加。
- `client/src/hooks/mapLibrarySession.ts`: `createPersistentMapSession` 内で `lastPersistedSnapshotRef` を保持し、`writeBody` 直前の楽観ロック照合を実装。セッション番号と storage を公開。
- `client/src/domain/persistence/mapSaveStatus.ts`: `MapSaveStatus` に `"conflict" | "externallyDeleted"` 追加および判定ロジック拡張。テストは `mapSaveStatus.test.ts`。
- `client/src/hooks/useStorageConflictMonitor.ts`（新規）: storage イベントを監視し `conflictState` を管理するフック。テストは `__tests__/useStorageConflictMonitor.test.ts`。
- `client/src/hooks/useMapStorageAutoSave.ts`: `saveStatus` への `"conflict"`, `"externallyDeleted"` 追加と楽観ロック対応。
- `client/src/hooks/useMapStoragePersistence.ts`: `conflictState`, `onWriteConflict` の中継と `hasPendingEdits` 導出。
- `client/src/hooks/useMapPersistence.ts`: `conflictState`, `onWriteConflict` の中継と `hasPendingEdits` の公開。
- `client/src/hooks/useMapLibrary.ts`: `saveCurrentAsNewMap`（flush バイパス仕様）の新設と、競合中 `switchMap` / `moveBranchToMap` / `confirmRestore` のガード・中断処理。
- `client/src/components/layout/MapConflictNotice.tsx`（新規）: 競合通知とアクションボタン群。
- `client/src/components/layout/MapConflictConfirmDialog.tsx`（新規）: 最新読込の破棄確認モーダル。
- `client/src/components/layout/MapSaveStatus.tsx`: `"conflict"`, `"externallyDeleted"` の警告バッジ表示。
- `client/src/app/page.tsx`: `library.saveCurrentAsNewMap` を `MapEditor` の props `onSaveCurrentAsNewMap` に配線。
- `client/src/components/map/MapEditor.tsx`, `client/src/components/layout/AppHeader.tsx`: 競合監視フック配線、10系統目通知枠統合、最新読込置換。
- `client/src/app/__tests__/pageMapConflict.test.tsx`（新規）: 実 `Home` 画面での複数タブ競合・別名保存・最新読込の結合テスト。

---

### Task 1: 競合判定・ドキュメント同値性・退避名生成の純粋ドメインロジック

**Files:**
- Create: `client/src/domain/mapLibrary/mapConflict.ts`
- Create: `client/src/domain/mapLibrary/mapConflictMessages.ts`
- Create: `client/src/domain/mapLibrary/__tests__/mapConflict.test.ts`

**Interfaces:**
- `export type ConflictState = "none" | "conflict" | "externalUpdate" | "externallyDeleted";`
- `export function classifyStorageChange(params: { key: string | null; newValue: string | null; currentMapId: string; hasPendingEdits: boolean; isCurrentMapInIndex: boolean }): ConflictState`
  - `key === mapBodyKey(currentMapId)` かつ `newValue !== null`:
    - `hasPendingEdits === true` ⇒ `"conflict"`
    - `hasPendingEdits === false` ⇒ `"externalUpdate"`
  - `key === mapBodyKey(currentMapId)` かつ `newValue === null`: `"externallyDeleted"`
  - `key === MAP_INDEX_STORAGE_KEY` かつ `isCurrentMapInIndex === false`: `"externallyDeleted"`
  - それ以外（他マップの変更・無関係なキーなど）: `"none"`
- `export function isDocumentContentEqual(docA: MapDocumentV3, docB: MapDocumentV3): boolean`
  - ノードの順序、各フィールド（ID、親ID、座標、ラベル、重要度、イラスト）を正規化比較する（知見 L-530）。
- `export function createConflictCopyName(baseName: string): string`
  - `baseName` の末尾に「（退避）」を付与。合計50コードポイントを超える場合は手前で切り詰める。
- `mapConflictMessages.ts`:
  - 競合通知・削除通知・外部更新通知およびボタンラベルの定数定義。
  - 競合中の操作中断・拒否通知メッセージ（`switchMap` 中断文言、`moveBranchToMap` / `confirmRestore` 拒否文言）の定数・関数を定義。

- [x] **Step 1: RED テストを追加。** `mapConflict.test.ts` で、`classifyStorageChange` の各パターン（未保存あり/なしでの本体更新、本体削除、一覧からの削除、他マップの変更、key null）、`isDocumentContentEqual` の同一/差分/余剰プロパティ無視判定、`createConflictCopyName` の50文字境界切り詰め、各種メッセージ定義をテストする。
- [x] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/domain/mapLibrary/__tests__/mapConflict.test.ts` で FAIL を確認。
- [x] **Step 3: 最小実装。** 上記シグネチャの純粋関数とメッセージ定数を実装。
- [x] **Step 4: GREEN 確認。** Step 2 と同じコマンドが PASS。

---

### Task 2: ストレージイベント購読サービス層とセッション楽観ロック

**Files:**
- Create: `client/src/services/persistence/storageEventHub.ts`
- Create: `client/src/services/persistence/__tests__/storageEventHub.test.ts`
- Modify: `client/src/types/mapStorageSession.ts`
- Modify: `client/src/hooks/mapLibrarySession.ts`
- Modify: `client/src/services/persistence/protectedStorageSession.ts`
- Modify: `client/src/hooks/__tests__/mapLibrarySession.test.ts`

**Interfaces:**
- `storageEventHub.ts`:
  - `export type StorageEventListener = (event: StorageEvent) => void;`
  - `export function subscribeStorageEvent(listener: StorageEventListener): () => void`
  - `window.addEventListener("storage", listener)` を登録し、解除関数を返す。ブラウザ環境外では安全な no-op を返す。
- `types/mapStorageSession.ts`:
  ```typescript
  export type MapBodyWriteResult =
    | { status: "saved" }
    | { status: "conflict" }
    | { status: "failed"; error: string }
    | { status: "inactive" };

  export type MapFlushResult =
    | { status: "saved" }
    | { status: "unchanged" }
    | { status: "conflict" }
    | { status: "failed"; error: string };

  export interface MapStorageSession {
    readonly mapId: string; // 既存プロパティを維持
    readonly sessionNumber: number; // 追記: L-037 / L-571 照合用
    readonly storage: MapLibraryStorage; // 追記: MapEditor 経由で monitor に渡す用
    readBody(): MapDocumentResult<string | null>;
    writeBody(json: string): MapBodyWriteResult;
    registerFlush(flush: () => MapFlushResult): () => void;
    registerBackupSnapshot(snapshot: () => MapBackupSnapshot): () => void;
    readBackupSnapshot(): MapBackupSnapshot | null;
  }
  ```
- `mapLibrarySession.ts`:
  - `createPersistentMapSession` の内部で `lastPersistedSnapshotRef` を保持（初回はセッション生成時のストレージ読み取り値、または渡された初期値）。
  - `sessionNumber` と `storage`（注入された `MapLibraryStorage`）をセッションオブジェクトに公開。
  - `writeBody` 直前に `storage.readMapBody(mapId)` を同期実行（知見 L-001, L-669）:
    - `read.ok === false` の場合は書き込まず `{ status: "failed", error: read.error }` を返す（知見 L-002）。
    - `read.ok === true` かつ `read.data !== lastPersistedSnapshotRef.current` の場合は書き込まず `{ status: "conflict" }` を返す。
    - 一致している場合は安全にストレージ本体とインデックスを書き込み、成功時に `lastPersistedSnapshotRef.current = bodyJson` を更新する。
  - `flushPendingSave` も `writeBody` が `conflict` を返した場合は `{ status: "conflict" }` を返す。
- `protectedStorageSession.ts`:
  - `createProtectedStorageSession` において、保護モード用の不活性な `sessionNumber: 0` および no-op のダミー `storage` を返し、型定義に適合させる。

- [x] **Step 1: RED テストを追加。** `storageEventHub.test.ts` でリスナー登録・解除、多重リスナーの動作、`afterEach` でのリスナー完全解除（知見 L-643, L-560）をテスト。`mapLibrarySession.test.ts` で、他タブによる `storage.writeMapBody` 後の自タブ `writeBody` が `{ status: "conflict" }` を返し本体・インデックスを書かないこと、`readMapBody` 失敗時は `failed` を返すこと、`flush` も `conflict` を返すこと、`sessionNumber` / `storage` が公開されることをテスト。
- [x] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/services/persistence/__tests__/storageEventHub.test.ts src/hooks/__tests__/mapLibrarySession.test.ts` で FAIL を確認。
- [x] **Step 3: 最小実装。** `storageEventHub.ts`、`mapLibrarySession.ts`、`protectedStorageSession.ts`、型定義を実装。
- [x] **Step 4: GREEN 確認。** Step 2 と同じコマンドおよび `npm run typecheck` が PASS。

---

### Task 3: フック層（保存状態判定・競合監視フック・競合アクション・自動保存連携）

**Files:**
- Modify: `client/src/domain/persistence/mapSaveStatus.ts`
- Modify: `client/src/domain/persistence/__tests__/mapSaveStatus.test.ts`
- Create: `client/src/hooks/useStorageConflictMonitor.ts`
- Create: `client/src/hooks/__tests__/useStorageConflictMonitor.test.ts`
- Modify: `client/src/hooks/useMapStorageAutoSave.ts`
- Modify: `client/src/hooks/useMapStoragePersistence.ts`
- Modify: `client/src/hooks/useMapPersistence.ts`
- Modify: `client/src/hooks/__tests__/useMapStorageAutoSave.test.tsx`
- Modify: `client/src/hooks/__tests__/useMapStoragePersistence.test.tsx`
- Modify: `client/src/hooks/__tests__/useMapPersistence.test.tsx`
- Modify: `client/src/hooks/useMapLibrary.ts`
- Modify: `client/src/hooks/__tests__/useMapLibrary.test.tsx`

**Interfaces:**
- `mapSaveStatus.ts`:
  - `MapSaveStatus` に `"conflict" | "externallyDeleted"` を追加。
  - `deriveMapSaveStatus` の引数に `conflictState?: ConflictState` を追加し、`"conflict"` のときは `"conflict"`、`"externallyDeleted"` のときは `"externallyDeleted"` を最優先で返す。
- `useStorageConflictMonitor.ts`:
  ```typescript
  export interface UseStorageConflictMonitorOptions {
    mapId: string;
    sessionNumber: number; // L-037 / L-571 世代照合用
    hasPendingEdits: boolean;
    storage: MapLibraryStorage;
    onExternalChange: (kind: Exclude<ConflictState, "none">) => void;
  }
  ```
  - `subscribeStorageEvent` を購読し、`sessionNumber` の一致を確認した上で `classifyStorageChange` を実行。結果が `"none"` 以外なら `onExternalChange` を呼ぶ（知見 L-037/L-571, L-469）。
- `useMapStorageAutoSave.ts`, `useMapStoragePersistence.ts`, `useMapPersistence.ts`:
  - `options` に `conflictState: ConflictState` と `onWriteConflict?: () => void` を受け渡す配線を追加。
  - `useMapStorageAutoSave`: `writeBody` が `conflict` を返した際、`onWriteConflict` を呼んで自動保存タイマーを破棄・停止する。`conflictState === "conflict"` または `"externallyDeleted"` の間は新規保存タイマーを発行せずブロックする。
  - `useMapPersistence`: 戻り値に `hasPendingEdits: boolean`（`confirmedSnapshot !== null ? currentSnapshot !== confirmedSnapshot : currentSnapshot !== initialPersistedSnapshot`）を含めて公開する。
- `useMapLibrary.ts` (知見 L-001, L-061 対応):
  - `saveCurrentAsNewMap(name: string, snapshotJson: string): MapLibraryOperationResult`:
    - 旧マップへの flush を完全にバイパスし（知見 L-061）、新しいマップIDで本体とインデックスを保存し、そのマップへ切り替える。
  - 既存操作のガード:
    - `switchMap`: `flushCurrentSession()` が `conflict` を返した場合は切り替えを安全に中断し、競合通知を残す。
    - `moveBranchToMap`: `flushCurrentSession()` が `conflict` を返した場合は枝移動を拒否し、エラー通知を表示する。
    - `confirmRestore`: `flushCurrentSession()` が `conflict` を返した場合は復元を拒否する。
    - `createMap`: flush が `conflict` の場合は、旧マップへの flush 失敗通知で中断せず、旧マップ flush を安全にバイパスして新規マップ作成を継続する。
  - `UseMapLibraryResult` に `saveCurrentAsNewMap: (name: string, snapshotJson: string) => MapLibraryOperationResult` を追加。

- [x] **Step 1: RED テストを追加。** `mapSaveStatus.test.ts` で `conflict` と `externallyDeleted` の優先判定をテスト。`useStorageConflictMonitor.test.ts` で未保存あり/なしでの外部更新・削除検知、別セッションのイベント無視、StrictMode 二重実行テスト。`useMapStorageAutoSave.test.tsx` で `writeBody` の `conflict` 受信による状態遷移・タイマー停止テスト。`useMapPersistence.test.tsx` で `hasPendingEdits` 伝播テスト。`useMapLibrary.test.tsx` で `saveCurrentAsNewMap` の flush バイパスと新マップ切替、競合中の `switchMap` / `moveBranchToMap` / `confirmRestore` の安全な中断・拒否、`createMap` のバイパス継続テスト。
- [x] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/domain/persistence/__tests__/mapSaveStatus.test.ts src/hooks/__tests__/useStorageConflictMonitor.test.ts src/hooks/__tests__/useMapStorageAutoSave.test.tsx src/hooks/__tests__/useMapPersistence.test.tsx src/hooks/__tests__/useMapLibrary.test.tsx` で FAIL を確認。
- [x] **Step 3: 最小実装。** 各フックのインターフェースとロジックを実装。
- [x] **Step 4: GREEN 確認。** Step 2 と同じコマンドおよび `npm run typecheck` が PASS。

---

### Task 4: UI コンポーネントと `MapEditor` / `AppHeader` 統合

**Files:**
- Create: `client/src/components/layout/MapConflictNotice.tsx`
- Create: `client/src/components/layout/__tests__/MapConflictNotice.test.tsx`
- Create: `client/src/components/layout/MapConflictConfirmDialog.tsx`
- Create: `client/src/components/layout/__tests__/MapConflictConfirmDialog.test.tsx`
- Modify: `client/src/components/layout/MapSaveStatus.tsx`
- Modify: `client/src/components/layout/__tests__/MapSaveStatus.test.tsx`
- Modify: `client/src/app/page.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`
- Modify: `client/src/components/layout/AppHeader.tsx`
- Modify: `client/src/components/map/__tests__/MapEditor.test.tsx`

**Interfaces:**
- `MapConflictNotice.tsx`:
  - `conflictState` に応じた警告文言とアクションボタン（`[別名で保存]` `[最新を読み込む]` `[JSON書き出し]`）を描画。
  - 常設の `role="alert"` / `aria-live="assertive"` を用いてアクセシブルに通知（知見 L-153）。
- `MapConflictConfirmDialog.tsx`:
  - 最新読込時の未保存破棄確認モーダル。初期フォーカスは「キャンセル」（知見 L-408）。キーリピート抑止。
- `MapSaveStatus.tsx`:
  - `"conflict"` ⇒ 赤色バッジ「競合が発生しました」、`"externallyDeleted"` ⇒ 赤色バッジ「削除されました」。
- `page.tsx`:
  - `MapEditor` に `onSaveCurrentAsNewMap={(name, json) => library.saveCurrentAsNewMap(name, json)}` を渡す。
- `MapEditor.tsx`:
  - `MapEditorProps` に `onSaveCurrentAsNewMap?: (name: string, snapshotJson: string) => MapLibraryOperationResult` を追加。
  - `storageSession.sessionNumber` と `storageSession.storage`、および `persistence.hasPendingEdits` を `useStorageConflictMonitor` に渡す。
  - `conflictState: ConflictState` を state として保持。外部更新検知時、または auto-save からの楽観ロック検知時に更新。
  - `externalUpdate` 状態でキャンバス編集が発生したら即座に `conflict` へ昇格。
  - 「最新を読み込む」確定時は `storage.readMapBody(mapId)` から最新データを取得し、`replaceMapAndReset` で置換して `conflictState = "none"` にリセット。
  - 「別名で保存」ボタン押下時は `createConflictCopyName(mapName)` で名前を生成し、`onSaveCurrentAsNewMap` を呼んでワンクリックで退避保存を実行。

- [x] **Step 1: RED テストを追加。** `MapConflictNotice.test.tsx` で文言・ボタン描画・クリックイベント発火・ARIA属性を確認。`MapConflictConfirmDialog.test.tsx` でフォーカストラップ・Escape・キャンセル・確定を確認。`MapSaveStatus.test.tsx` で新バッジ表示を確認。`MapEditor.test.tsx` で競合検知時の通知バー表示、別名保存の呼び出し、最新読込の反映を確認。
- [x] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/components/layout/__tests__/MapConflictNotice.test.tsx src/components/layout/__tests__/MapConflictConfirmDialog.test.tsx src/components/layout/__tests__/MapSaveStatus.test.tsx src/components/map/__tests__/MapEditor.test.tsx` で FAIL を確認。
- [x] **Step 3: 最小実装。** コンポーネントと `page.tsx`, `MapEditor.tsx`, `AppHeader.tsx` への配線を実装。
- [x] **Step 4: GREEN 確認。** Step 2 と同じコマンドおよび `npm run typecheck` が PASS。

---

### Task 5: 実 `Home` 画面での複数タブ競合結合テスト

**Files:**
- Create: `client/src/app/__tests__/pageMapConflict.test.tsx`

**Interfaces:**
- 実 `Home`（`page.tsx`）、`useMapLibrary`、`MapEditor`、`MapStage`、`localStorage` を用いた結合シナリオテスト:
  1. **別タブ更新＋未保存編集シナリオ**:
     - マップを開いてノードを編集（未保存状態）。
     - 別タブを模して `storage.setItem(mapBodyKey(id), newJson)` を発火。
     - 自動保存タイマーが停止し、保存状態バッジが「競合が発生しました」になり、競合通知バーが表示されること。
     - 元のマップのストレージが自タブで上書きされないこと。
  2. **別名で保存による救出シナリオ**:
     - 競合通知の「別名で保存」をクリック。
     - 新しいマップ（例: `<元マップ名>（退避）`）が作成され、自タブがその新マップへ安全に切り替わること。
     - 元マップのストレージ内容が別タブの更新のまま維持されていること。
  3. **未保存編集なし時の最新読込シナリオ**:
     - 未編集の状態で別タブ更新イベントを発火。
     - 「別タブでこのマップが更新されました [最新の内容を読み込む]」が表示されること。
     - ボタンクリックで確認ダイアログなしで最新ノードツリーへ即座に更新されること。
  4. **別タブ削除シナリオ**:
     - 別タブで現在マップが削除されたイベントを発火。
     - 保存状態バッジが「削除されました」になり、メモリ上のデータが保持されたまま別名保存・JSON書き出しで救出できること。
  5. **楽観ロック検証シナリオ**:
     - storage イベントが配信されない極端な状況下で、自タブの `writeBody` 直前に別タブが本体を書き換えていた場合、`writeBody` が `conflict` を検知して自動保存を停止し、競合通知を表示すること。

- [x] **Step 1: RED テストを追加。** `pageMapConflict.test.tsx` で上記5つのシナリオを記述。
- [x] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/app/__tests__/pageMapConflict.test.tsx` で FAIL を確認。
- [x] **Step 3: 最小実装・結合調整。** 結合テストがパスするように配線を調整。
- [x] **Step 4: GREEN 確認。** Step 2 のコマンドが PASS。

---

### Task 6: ドキュメント体系・ロードマップの更新と最終検証

**Files:**
- Modify: `ROADMAP.md`
- Modify: `README.md`
- Modify: `client/README.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/specifications/features.md`
- Modify: `docs/specifications/data-model.md`
- Modify: `docs/specifications/api.md`
- Modify: `docs/testing/browser-test-cases.md`

**Interfaces:**
- ROADMAP.md:
  - 候補008「複数タブの編集競合検出」を `[x]` に更新。
  - 「現在地」に複数タブ競合検出の完了を追記し、次の未完了項目を候補015「削除マップのゴミ箱」に更新。
  - 「最終更新」を本日の日付に更新。
- ドキュメント全般:
  - `features.md`: 競合状態の常設表示・通知バー仕様、別名保存・最新読込の仕様を追記。
  - `data-model.md`: `MapBodyWriteResult` / `MapFlushResult` への `conflict` 追加、楽観ロック照合仕様を追記。
  - `api.md`: 14章として複数タブ競合検出のクライアントAPI仕様を追記。
  - `overview.md`: 新規モジュール（`mapConflict.ts`, `storageEventHub.ts`, `useStorageConflictMonitor.ts` 等）およびファイル数カウントを更新。
  - `browser-test-cases.md`: Phase 16 候補008 の実ブラウザ確認項目（Z節: Z-01〜Z-06）を追加。

- [x] **Step 1: ドキュメント更新。** 実装内容と完全一致するように各ドキュメントを更新。
- [x] **Step 2: 全体検証。** `cd client && npm run verify`（Tailwindスキャン、ESLint、型チェック、Jest全テスト、本番ビルド）が全通過することを確認。
- [x] **Step 3: 差分確認。** `git diff --check` で余計な空白・エラーがないことを確認。

---

## 実行・レビュー手順

- 各タスク（Task 1〜Task 6）はサブエージェント駆動開発（`superpowers:subagent-driven-development`）で進める。
- 各タスク完了ごとに、実装サブエージェントとは別のサブエージェントにより「仕様適合」と「コード品質」の二段階レビューを実施する。
- 全タスク完了後、`client` ディレクトリで `npm run verify` を実行し、完了を報告する。
