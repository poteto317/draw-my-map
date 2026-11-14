# 削除マップのゴミ箱（候補015）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`。このリポジトリではタスクごとに実装サブエージェントを1つ起動し、別のサブエージェントが仕様適合とコード品質を順にレビューする。`superpowers:executing-plans` によるインライン実装は使わない。チェックボックスで進捗を追う。

**Goal:** マップを削除した際に一定期間（30日間）ゴミ箱へ保持し、復元・個別完全削除・ゴミ箱を空にする操作・期限切れ自動削除・容量不足/破損時の完全削除フォールバックを実現する。

**Architecture:** ゴミ箱はアクティブなマップ一覧（`draw-my-map.maps.v1`）・本体キー（`draw-my-map.maps.v1.doc.<id>`）およびバックアップ形式と干渉しない独立キー空間（`draw-my-map.trash.v1` / `draw-my-map.trash.v1.doc.<id>`）で管理する。`useMapLibrary` が削除時のロールバック付きゴミ箱移動・復元・完全削除と `trashState` 同期を担い、`useMapLibraryDialogState` と `MapLibraryDialog` が一覧↔ゴミ箱↔確認画面の 2 階層遷移とアクセシビリティ対応フォーカス制御を担う。

**Tech Stack:** Next.js 16、React 19、TypeScript、Jest 30、Testing Library。

**Spec:** `docs/superpowers/specs/2026-11-14-deleted-map-trash-design.md`。実装者・レビュアーはこの設計も読む。

## Global Constraints

- 作業場所は `.worktrees/feat-phase16-deleted-map-trash`。すべての返答・レビューは日本語。
- TDD 原則: 各タスクで実装より先にテストを追加して RED を確認し、実装後 GREEN と `cd .worktrees/feat-phase16-deleted-map-trash/client && npm run typecheck && npm run lint` を確認する。
- 既存の `MapIndexV1` スキーマ・`MAP_BODY_KEY_PREFIX` (`draw-my-map.maps.v1.doc.`)・一括バックアップ形式 v1 にはゴミ箱データを混ぜない。
- ゴミ箱の書き込み・削除が途中で失敗した場合は、`removeTrashBody` 先行で容量を確保してから `MAP_TRASH_INDEX_KEY` を戻す逆順ロールバックを行い、残存項目 0 件時は `MAP_TRASH_INDEX_KEY` を `removeItem` で削除する。
- `MAP_TRASH_INDEX_KEY` が破損している場合でも通常のマップ一覧や編集画面を保護モードへ落とさず、`deleteMap` での `canPermanentDelete: true` フォールバックとゴミ箱画面の「ゴミ箱を空にする」で回復できるようにする（L-002 / デッドロック防止）。
- 実装タスク内ではコミットしない。各タスク後に別エージェントの仕様適合・コード品質レビューを行い、指摘修正・再レビュー後に次へ進む。全タスク後に `client` で `npm run verify` を実行する。

## File Map

- `client/src/domain/mapLibrary/mapTrash.ts`（新規）: `MapTrashEntry`, `MapTrashIndexV1`, `MapTrashState`, 30日定数、decode/encode、期限判定、残り日数、ソート。
- `client/src/domain/mapLibrary/mapTrashMessages.ts`（新規）: ゴミ箱の復元・完全削除・空にする・容量不足/破損エラー文言。
- `client/src/domain/mapLibrary/mapLibraryMessages.ts`: 削除完了通知をゴミ箱移動文言へ更新。
- `client/src/services/persistence/mapLibraryStorage.ts`: `writeMapIndexWithQuota` の追加。
- `client/src/services/persistence/mapTrashStorage.ts`（新規）: ゴミ箱インデックス・本体の読み書き、`readMapTrashState`、`purgeExpiredTrash`、`forceClearCorruptTrash`。
- `client/src/services/persistence/mapLibraryStartupRunner.ts`: 通常モード起動後に `purgeExpiredTrash` を実行。
- `client/src/hooks/mapLibraryState.ts`: `MapLibraryView` に `trashEntries` / `trashStatus`、`PersistentLibraryState` に `trash`、`MapLibraryOperationResult` 失敗型に `canPermanentDelete?: boolean` を追加。
- `client/src/hooks/useMapLibrary.ts`: `deleteMap` のゴミ箱移動、`permanentlyDeleteMap`、`refreshTrash`、`restoreFromTrash`、`permanentlyDeleteFromTrash`、`emptyTrash` を実装。
- `client/src/types/mapLibraryDialog.ts`: `trash`, `trashPermanentDelete`, `trashEmptyConfirm`、`delete.allowPermanentDelete`、ゴミ箱用 `focusTarget` を追加。
- `client/src/components/layout/mapLibraryListButtons.ts`: `MapLibraryListButton` の型を一覧固有ターゲットに限定。
- `client/src/components/layout/MapLibraryConfirmActions.tsx`: `confirmVariant?: "default" | "danger"` を追加。
- `client/src/components/layout/MapLibraryDeleteConfirm.tsx`: ゴミ箱移動の説明文と容量不足/破損時の「ゴミ箱に入れずに完全に削除」ボタンを追加。
- `client/src/components/layout/MapLibraryTrashScreen.tsx`（新規）: ゴミ箱一覧画面。
- `client/src/components/layout/MapLibraryTrashPermanentDeleteConfirm.tsx`（新規）: 個別完全削除の確認画面。
- `client/src/components/layout/MapLibraryTrashEmptyConfirm.tsx`（新規）: ゴミ箱を空にする確認画面。
- `client/src/components/layout/MapLibraryListScreen.tsx`: 下部アクション行に「ゴミ箱」ボタンを追加。
- `client/src/components/layout/MapLibraryDialog.tsx`: ゴミ箱・確認画面の描画、`screenKey`、`aria-describedby`、`focusTarget` 適用。
- `client/src/hooks/useMapLibraryDialogState.ts`: 2階層戻り・ゴミ箱操作の画面遷移・フォーカス復元・通知維持。
- `client/src/app/page.tsx`: ゴミ箱状態・操作を `MapLibraryDialog` へ配線。
- `client/src/app/__tests__/pageMapTrash.test.tsx`（新規）: `Home` からのゴミ箱結合テスト。

---

### Task 1: ゴミ箱ドメインロジックとメッセージ定義

**Files:**
- Create: `client/src/domain/mapLibrary/mapTrash.ts`
- Create: `client/src/domain/mapLibrary/mapTrashMessages.ts`
- Create: `client/src/domain/mapLibrary/__tests__/mapTrash.test.ts`

**Interfaces:**
- `export const TRASH_RETENTION_DAYS = 30;`
- `export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;`
- `export type MapTrashEntry = { id: string; originalMapId: string; name: string; createdAt: string; updatedAt: string; deletedAt: string; expiresAt: string; hasBody: boolean; };`
- `export type MapTrashIndexV1 = { version: 1; items: MapTrashEntry[]; };`
- `export type MapTrashState = { status: "ok"; entries: readonly MapTrashEntry[] } | { status: "corrupt" };`
- `export type MapTrashDecodeResult = { kind: "ok"; index: MapTrashIndexV1; repaired: boolean } | { kind: "corrupt" };`
- `export function decodeMapTrashIndex(raw: string): MapTrashDecodeResult`
  - JSON 構文不正・`version !== 1`・`!Array.isArray(items)` で `{ kind: "corrupt" }`。
  - 各行は `isValidMapId(id)`、`isValidMapId(originalMapId)`、`typeof name === "string"`、`typeof hasBody === "boolean"` を要求し、重複 `id` はスキップして `repaired = true`。
  - `name` は `mapIndex.ts` と同様に `normalizeStoredMapName(name)` で正規化し、元文字列と異なれば `repaired = true`。
  - `createdAt`・`updatedAt`・`deletedAt`・`expiresAt` は `normalizeMapTimestamp` で正規化し、補正があれば `repaired = true`（`expiresAt` が不正、または `deletedAt + 30日` を超える場合でも、`deletedAt` が有効なら `deletedAt + 30日` で再計算する。`deletedAt` も不正で `expiresAt` が `UNKNOWN_MAP_TIMESTAMP` のままの項目は期限不明として扱い、自動では削除しない）。
- `export function encodeMapTrashIndex(index: MapTrashIndexV1): string`
- `export function createMapTrashEntry(params: { id: string; entry: MapIndexEntry; deletedAt: Date; hasBody: boolean }): MapTrashEntry`
  - `expiresAt` は `new Date(deletedAt.getTime() + TRASH_RETENTION_MS).toISOString()`。
- `export function isTrashEntryExpired(entry: MapTrashEntry, now: Date): boolean`
  - `expiresAt` が無効日時・`UNKNOWN_MAP_TIMESTAMP` なら `false`、有効な日時が `Date.parse(entry.expiresAt) <= now.getTime()` なら `true`。
- `export function partitionExpiredTrashEntries(items: readonly MapTrashEntry[], now: Date): { active: MapTrashEntry[]; expired: MapTrashEntry[] }`
- `export function sortMapTrashEntriesForDisplay(items: readonly MapTrashEntry[]): MapTrashEntry[]`
  - `deletedAt` 降順 → `updatedAt` 降順 → `id` 昇順。
- `export function calculateTrashRemainingDays(entry: MapTrashEntry, now: Date): number`
  - `diffMs <= 0` なら `0`、それ以外は `Math.ceil(diffMs / (24 * 60 * 60 * 1000))`。
- `export function formatTrashRemainingDays(entry: MapTrashEntry, now: Date): string`
  - `0` なら `"期限切れ"`、それ以外は `"あと ${days} 日"`。
- `export function addTrashEntry(index: MapTrashIndexV1, entry: MapTrashEntry): MapTrashIndexV1`
- `export function removeTrashEntry(index: MapTrashIndexV1, trashId: string): MapTrashIndexV1`
- `mapTrashMessages.ts`:
  - ゴミ箱移動失敗・容量不足・破損時エラー・復元成功/失敗/部分警告・個別完全削除成功/警告・空にする成功/部分警告/破損初期化の通知関数を定義。

- [ ] **Step 1: RED テストを追加。** `mapTrash.test.ts` で decode/encode（正常・不正外枠・`normalizeStoredMapName` 含む不正行修復・重複ID除去）、`createMapTrashEntry`（30日後 `expiresAt`）、`isTrashEntryExpired`（境界 `=== now` で期限切れ、`> now` で有効、不正日付・`UNKNOWN_MAP_TIMESTAMP` は期限切れ扱いしない）、`partitionExpiredTrashEntries`、`sortMapTrashEntriesForDisplay`、`calculateTrashRemainingDays` / `formatTrashRemainingDays`、`mapTrashMessages` をテストする。
- [ ] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/domain/mapLibrary/__tests__/mapTrash.test.ts` で FAIL を確認。
- [ ] **Step 3: 最小実装。** `mapTrash.ts` と `mapTrashMessages.ts` を実装。
- [ ] **Step 4: GREEN 確認。** `cd client && npm test -- --runInBand src/domain/mapLibrary/__tests__/mapTrash.test.ts && npm run typecheck && npm run lint` が PASS。

---

### Task 2: ゴミ箱ストレージ層と起動時期限切れ清掃

**Files:**
- Modify: `client/src/services/persistence/mapLibraryStorage.ts`
- Modify: `client/src/services/persistence/__tests__/mapLibraryStorage.test.ts`
- Create: `client/src/services/persistence/mapTrashStorage.ts`
- Create: `client/src/services/persistence/__tests__/mapTrashStorage.test.ts`
- Modify: `client/src/services/persistence/mapLibraryStartupRunner.ts`
- Modify: `client/src/services/persistence/__tests__/mapLibraryStartupRunner.test.ts`

**Interfaces:**
- `mapLibraryStorage.ts`:
  - 既存の `writeMapIndex` の契約（`StorageWriteResult`）は変えず、新たに `export function writeMapIndexWithQuota(storage: MapLibraryStorage, index: MapIndexV1): { ok: true } | { ok: false; quotaExceeded: boolean; error: string }` を追加する（`trySetItem` と `WRITE_ERROR` を再利用）。
- `mapTrashStorage.ts`:
  - `export const MAP_TRASH_INDEX_KEY = "draw-my-map.trash.v1";`
  - `export const MAP_TRASH_BODY_KEY_PREFIX = "draw-my-map.trash.v1.doc.";`
  - `export function mapTrashBodyKey(trashId: string): string`
  - `export type TrashIndexReadResult = { kind: "empty" } | { kind: "ok"; index: MapTrashIndexV1; raw: string; repaired: boolean } | { kind: "corrupt"; raw: string } | { kind: "unavailable" };`
  - `export function readMapTrashIndex(storage: MapLibraryStorage): TrashIndexReadResult`
  - `export function readMapTrashState(storage: MapLibraryStorage): MapTrashState`
    - `empty` → `{ status: "ok", entries: [] }`、`ok` → `{ status: "ok", entries: sortMapTrashEntriesForDisplay(index.items) }`、`corrupt` / `unavailable` → `{ status: "corrupt" }`。
  - `export function writeMapTrashIndex(storage: MapLibraryStorage, index: MapTrashIndexV1): { ok: true } | { ok: false; quotaExceeded: boolean }`
  - `export function removeMapTrashIndex(storage: MapLibraryStorage): boolean`
  - `export function readTrashBody(storage: MapLibraryStorage, trashId: string): MapDocumentResult<string | null>`
  - `export function writeTrashBody(storage: MapLibraryStorage, trashId: string, json: string): { ok: true } | { ok: false; quotaExceeded: boolean }`
  - `export function removeTrashBody(storage: MapLibraryStorage, trashId: string): boolean`
  - `export function pickTrashId(storage: MapLibraryStorage, trashIndex: MapTrashIndexV1, preferredId: string, generateId: () => string): string | null`
    - `preferredId` が `trashIndex` にも `mapTrashBodyKey(preferredId)` にも存在しなければ（`readTrashBody` 成功かつ `null`）`preferredId` を再利用。衝突時は `pickUnusedMapId` 相当で採番。
  - `export function purgeExpiredTrash(storage: MapLibraryStorage, now: Date): MapTrashState`
    - `MAP_TRASH_INDEX_KEY` 不在なら書き込みゼロで `{ status: "ok", entries: [] }`。
    - `corrupt` / `unavailable` なら上書き削除せず `{ status: "corrupt" }` を返す（起動は失敗させない）。
    - 期限切れ 0 件かつ `!repaired` なら書き込みゼロで `{ status: "ok", entries: sortMapTrashEntriesForDisplay(index.items) }`。
    - 期限切れがある場合（または `repaired: true` の場合）: 期限切れ項目の `hasBody: true` に対して `removeTrashBody(storage, entry.id)` を呼び、本体削除の成否に関わらず期限切れ項目はインデックスから除外する（本体削除失敗で期限切れ項目を永久残留させない）。残った `active` が 0 件なら `removeMapTrashIndex(storage)`、1 件以上なら `writeMapTrashIndex(storage, { version: 1, items: active })` を実行し、`{ status: "ok", entries: sortMapTrashEntriesForDisplay(active) }` を返す。
  - `export function forceClearCorruptTrash(storage: MapLibraryStorage): { ok: true } | { ok: false; removedAny: boolean }`
    - `MAP_TRASH_BODY_KEY_PREFIX` で始まる全キーを削除し、すべて消せた場合のみ `removeMapTrashIndex(storage)` を実行する。
- `mapLibraryStartupRunner.ts`:
  - `MapLibraryStartupResult` の型は変更せず（方針 B）、`runMapLibraryStartup` で `mode === "persistent"` の結果が確定した直後に `purgeExpiredTrash(storage, deps.now())` を呼び出す（保護モード結果には呼ばない）。Task 3 の `useMapLibrary` 起動 `useEffect` が `readMapTrashState(storage)` で初期ゴミ箱状態を取得する。

- [ ] **Step 1: RED テストを追加。** `mapLibraryStorage.test.ts`（`writeMapIndexWithQuota` の通常成功・`QuotaExceededError`・その他エラー）、`mapTrashStorage.test.ts`（読み書き・`readMapTrashState`・容量不足判定・期限切れ削除で未存在/非期限切れ時書き込みゼロ、0件化で `removeItem`、`repaired` かつ 0件で `removeItem`、破損時非上書き、`forceClearCorruptTrash`）、`mapLibraryStartupRunner.test.ts`（起動時期限切れ自動清掃、破損時保護非遷移、通常起動時余分な書き込みなし）を追加する。
- [ ] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/services/persistence/__tests__/mapLibraryStorage.test.ts src/services/persistence/__tests__/mapTrashStorage.test.ts src/services/persistence/__tests__/mapLibraryStartupRunner.test.ts` で FAIL を確認。
- [ ] **Step 3: 最小実装。** `mapLibraryStorage.ts`、`mapTrashStorage.ts`、`mapLibraryStartupRunner.ts` を実装・更新。
- [ ] **Step 4: GREEN 確認。** Step 2 と同じテスト＋ `npm run typecheck && npm run lint` が PASS。

---

### Task 3: `useMapLibrary` のゴミ箱操作実装と既存フック契約更新

**Files:**
- Modify: `client/src/domain/mapLibrary/mapLibraryMessages.ts`
- Modify: `client/src/domain/mapLibrary/__tests__/mapLibraryMessages.test.ts`
- Modify: `client/src/hooks/mapLibraryState.ts`
- Modify: `client/src/hooks/__tests__/mapLibraryState.test.ts`
- Modify: `client/src/hooks/useMapLibrary.ts`
- Modify: `client/src/hooks/__tests__/useMapLibrary.test.tsx`

**Interfaces:**
- `mapLibraryState.ts`:
  - `MapLibraryView` の `status: "ready"` に `trashEntries: readonly MapTrashEntry[]; trashStatus: "ok" | "corrupt";` を追加（`protected` 時は `trashEntries: [], trashStatus: "ok"`）。
  - `PersistentLibraryState` に `trash: MapTrashState;` を追加。
  - `MapLibraryOperationResult` の失敗型を `{ ok: false; notice: OperationNotice; enteredProtectedMode?: true; canPermanentDelete?: boolean }` とする。
- `useMapLibrary.ts` (`UseMapLibraryResult` に追加):
  - `permanentlyDeleteMap: (id: string) => MapLibraryOperationResult;`
  - `refreshTrash: () => void;`
  - `restoreFromTrash: (trashId: string) => MapLibraryOperationResult;`
  - `permanentlyDeleteFromTrash: (trashId: string) => MapLibraryOperationResult;`
  - `emptyTrash: () => MapLibraryOperationResult;`
- 振る舞いの詳細（設計書 4.2〜4.5 節に厳密準拠）:
  - 起動時 `useEffect`: `runMapLibraryStartup` が `mode === "persistent"` を返したら `readMapTrashState(storage)` で `trash` を初期化する。
  - `deleteMap(id)`: 設計書 4.2 節どおり、ジャーナル確認 → `purgeExpiredTrash` → 本体取得（`readMapBody` と `readBackupSnapshot` の照合で未編集の空オープンマップは `hasBody: false`、編集済みオープンマップは `snap.json`、それ以外は `readMapBody`）→ ゴミ箱へ書込 → `writeMapIndexWithQuota(storage, activeIndexNext)`（失敗時は `removeTrashBody` 先行 → `trashIndexBeforeRaw` へ逆順ロールバック、`quotaExceeded` なら `canPermanentDelete: true`）→ `advanceSessionNumber()`（開いている場合）→ `removeMapBody` → 開いていないマップのみ `flushCurrentSession()` 再試行。
  - `permanentlyDeleteMap(id)`: 設計書 4.3 節どおり、ガード・最後の1件置換・`advanceSessionNumber()`・`removeMapBody`・`flushCurrentSession()` 再試行（ゴミ箱キーには触れない）。
  - `restoreFromTrash(trashId)`: 設計書 4.4 節どおり、ジャーナル確認 → 最新ゴミ箱読込・期限清掃 → `hasBody` 時は本体読込・`parseMapDocumentJsonWithVersion` 検証 → `readMatchingIndexRaw` でアクティブ一覧整合確認 → `originalMapId` 再利用または `pickNewMapId` → `writeMapBody` → `writeMapIndex`（失敗時 `removeMapBody` ロールバック）→ **`currentMapId` を変更せずに** `{ ...current.index, maps: [...current.index.maps, restoredEntry] }` で `commitIndex`（注意: `addMapEntry` は `currentMapId` を上書きするため使わない）→ ゴミ箱から除外（0件時は `removeMapTrashIndex`）→ `removeTrashBody`。
  - `permanentlyDeleteFromTrash(trashId)`: 設計書 4.5 節どおり。
  - `emptyTrash()`: 設計書 4.5 節どおり。UI 上 `trashStatus === "ok"` だったのにストレージ上で `MAP_TRASH_INDEX_KEY` が `"corrupt"` に変わっていた場合は黙って全削除せず `trashState` を `"corrupt"` へ同期してエラーを返す。`trashStatus === "corrupt"` で呼ばれた場合のみ `forceClearCorruptTrash(storage)` を実行する。
  - `refreshTrash()`: `persistent` 時に `purgeExpiredTrash(current.storage, depsRef.current.now())` を実行して `trash` 状態を最新化する。

- [ ] **Step 1: RED テストを追加・更新。** `mapLibraryMessages.test.ts`、`mapLibraryState.test.ts`、`useMapLibrary.test.tsx`（既存 `deleteMap` の操作列・メッセージ期待値をゴミ箱移動仕様へ更新〔注: `useMapLibrary.test.tsx` の `createRecordingStorage` は既定で `QuotaExceededError` を投げるため、`setFailIndexWrite(true)` の既存テスト期待値にも `canPermanentDelete: true` の有無を反映する〕し、ゴミ箱移動の逆順ロールバック・`QuotaExceededError` 時 `canPermanentDelete: true`・ゴミ箱破損時・未編集空マップ vs 編集済みオープンマップ・`permanentlyDeleteMap`・`restoreFromTrash`（本体あり/なし、ID 再利用/衝突、現在マップ維持、破損/欠損本体、アクティブ一覧不一致ガード）・`permanentlyDeleteFromTrash`・`emptyTrash`（部分失敗・孤立ゴミ箱本体・破損時強制消去・他タブ破損検知）を追加）をテストする。
- [ ] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/domain/mapLibrary/__tests__/mapLibraryMessages.test.ts src/hooks/__tests__/mapLibraryState.test.ts src/hooks/__tests__/useMapLibrary.test.tsx` で FAIL を確認。
- [ ] **Step 3: 最小実装。** `mapLibraryMessages.ts`、`mapLibraryState.ts`、`useMapLibrary.ts` を実装。
- [ ] **Step 4: GREEN 確認。** Step 2 のテスト＋ `npm run typecheck && npm run lint` が PASS。

---

### Task 4: 確認アクション・単体画面コンポーネント群

**Files:**
- Modify: `client/src/components/layout/MapLibraryConfirmActions.tsx`
- Modify: `client/src/components/layout/MapLibraryDeleteConfirm.tsx`
- Modify: `client/src/components/layout/__tests__/MapLibraryDeleteConfirm.test.tsx`
- Create: `client/src/components/layout/MapLibraryTrashScreen.tsx`
- Create: `client/src/components/layout/__tests__/MapLibraryTrashScreen.test.tsx`
- Create: `client/src/components/layout/MapLibraryTrashPermanentDeleteConfirm.tsx`
- Create: `client/src/components/layout/MapLibraryTrashEmptyConfirm.tsx`

**Interfaces:**
- `MapLibraryConfirmActions.tsx`: `confirmVariant?: "default" | "danger"`（既定 `"default"`）を追加。
- `MapLibraryDeleteConfirm.tsx`: 説明文を「マップ「{target.name}」をゴミ箱に移動します。ゴミ箱から 30 日間復元できます。」に更新し、オプショナル props `allowPermanentDelete?: boolean` と `onConfirmPermanentDelete?: () => void`（`detail > 1`・`Enter/Space repeat` 抑止付き「ゴミ箱に入れずに完全に削除」ボタン）を追加。
- `MapLibraryTrashScreen.tsx`: `headingId`, `entries`, `trashStatus`, `now`, `onRestore`, `onOpenPermanentDelete`, `onOpenEmptyTrash`, `onBackToList` を受け取り、空・通常（残り日数・復元/完全削除・空にする）・破損表示と `suppressBackupRestoreActionKey` を実装。
- `MapLibraryTrashPermanentDeleteConfirm.tsx` / `MapLibraryTrashEmptyConfirm.tsx`: `MapLibraryConfirmActions`（`confirmVariant="danger"`）を使って確認画面を構成。

- [ ] **Step 1: RED テストを追加・更新。** `MapLibraryDeleteConfirm.test.tsx` と `MapLibraryTrashScreen.test.tsx`（および `MapLibraryTrashPermanentDeleteConfirm` / `MapLibraryTrashEmptyConfirm` の描画・`detail > 1`・`repeat` 抑止検証）を追加・更新する。
- [ ] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/components/layout/__tests__/MapLibraryDeleteConfirm.test.tsx src/components/layout/__tests__/MapLibraryTrashScreen.test.tsx` で FAIL を確認。
- [ ] **Step 3: 最小実装。** 上記ファイル群を実装・更新（`mapLibraryDialog.ts`・`MapLibraryDialog.tsx`・`MapLibraryListScreen.tsx` の型契約は Task 5 でまとめて変更するため、この時点でも全テストの typecheck が通る）。
- [ ] **Step 4: GREEN 確認。** Step 2 のテスト＋ `npm run typecheck && npm run lint` が PASS。

---

### Task 5: ダイアログ型・一覧画面・`MapLibraryDialog`・`useMapLibraryDialogState`・`page.tsx` 統合と結合テスト

**Files:**
- Modify: `client/src/types/mapLibraryDialog.ts`
- Modify: `client/src/components/layout/mapLibraryListButtons.ts`
- Modify: `client/src/components/layout/MapLibraryListScreen.tsx`
- Modify: `client/src/components/layout/__tests__/MapLibraryListScreen.test.tsx`
- Modify: `client/src/components/layout/MapLibraryDialog.tsx`
- Modify: `client/src/components/layout/__tests__/MapLibraryDialog.test.tsx`
- Modify: `client/src/components/layout/__tests__/MapLibraryBackupRestoreDialog.test.tsx`
- Modify: `client/src/hooks/useMapLibraryDialogState.ts`
- Modify: `client/src/hooks/__tests__/useMapLibraryDialogState.test.tsx`
- Modify: `client/src/hooks/__tests__/useMapLibraryDialogBackup.test.tsx`
- Modify: `client/src/app/page.tsx`
- Modify: `client/src/app/__tests__/pageMapLibraryDialog.test.tsx`
- Create: `client/src/app/__tests__/pageMapTrash.test.tsx`

**Interfaces:**
- `mapLibraryDialog.ts`:
  - `MapLibraryDialogScreen` に追加・拡張:
    - `| { kind: "delete"; mapId: string; allowPermanentDelete?: boolean }`
    - `| { kind: "trash" }`
    - `| { kind: "trashPermanentDelete"; trashId: string }`
    - `| { kind: "trashEmptyConfirm" }`
  - `MapLibraryDialogFocusTarget` に追加:
    - `| { kind: "trashButton" }`
    - `| { kind: "emptyTrashButton" }`
    - `| { kind: "backToListButton" }`
    - `| { kind: "trashRow"; trashId: string; action: "restore" | "permanentDelete" }`
- `mapLibraryListButtons.ts`:
  - `MapLibraryListButton` を一覧の行・作成ボタン固有の型 `{ kind: "listCreateButton" } | { kind: "row"; mapId: string; action: MapLibraryRowAction }` に限定し、ゴミ箱やバックアップ等の新しいフォーカス先が誤って `data-map-action="create"` へ落ちないようにする。
- `MapLibraryListScreen.tsx`: `trashCount: number`, `trashStatus: "ok" | "corrupt"`, `onOpenTrash: () => void` を追加し、下部アクション行に「ゴミ箱」（1件以上時は `ゴミ箱（N）`、破損時は `ゴミ箱（要確認）`、`data-map-library-action="trash"`、`suppressBackupRestoreActionKey` 付与、保護モード時は `rejectProtected()`）を追加。
- `MapLibraryDialog.tsx`:
  - ゴミ箱用 props（`trashEntries`, `trashStatus`, `onOpenTrash`, `onConfirmPermanentDeleteActive`, `onRestoreTrash`, `onOpenTrashPermanentDelete`, `onConfirmTrashPermanentDelete`, `onOpenEmptyTrash`, `onConfirmEmptyTrash`, `now?`）を追加。
  - `focusTarget` 検索で `trashButton`（`[data-map-library-action="trash"]`）・`emptyTrashButton`（`[data-map-library-action="emptyTrash"]`）・`backToListButton`（`[data-map-library-action="backToList"]`）・`trashRow`（`[data-trash-id="..."][data-trash-action="..."]`、不在時は `[data-map-library-action="backToList"]`）を解決。
  - `screenDefault` で `trash`（先頭 `[data-trash-action="restore"]` または `[data-map-library-action="backToList"]`）、`trashPermanentDelete` / `trashEmptyConfirm`（`cancelButtonRef.current`）へフォーカス。
  - `screenKey` に `trashPermanentDelete:${screen.trashId}`、`aria-describedby` に `trashPermanentDelete`・`trashEmptyConfirm`、`isTargetMissing` に `trashPermanentDelete` を追加。
- `useMapLibraryDialogState.ts`:
  - `MapLibraryOperations` に `permanentlyDeleteMap`, `refreshTrash`, `restoreFromTrash`, `permanentlyDeleteFromTrash`, `emptyTrash` を追加し、`options` に `trashEntries: readonly MapTrashEntry[]` を追加。
  - `UseMapLibraryDialogStateResult` に `openTrash`, `confirmPermanentDeleteActive`, `restoreTrash`, `openTrashPermanentDelete`, `confirmTrashPermanentDelete`, `openEmptyTrash`, `confirmEmptyTrash` を追加。
  - `openList` / `openTrash` で `refreshTrash()` を呼ぶ。
  - `confirmDelete` で `!result.ok && result.canPermanentDelete` のとき `screen` を `{ kind: "delete", mapId, allowPermanentDelete: true }` へ更新して `alert` を出す。
  - `back()` / `backFrom()` を 2 階層戻し対応（`trashPermanentDelete` / `trashEmptyConfirm` → `trash`、`trash` → `list`）にし、確定操作時の遷移では `transition` と同一 `setState` で `trash` + `alert` + 安全な `focusTarget` を設定して `isTargetMissing` による通知消去を防ぐ。
- `page.tsx`: `library`・`dialog` のゴミ箱 props を `MapLibraryDialog` へ配線。

- [ ] **Step 1: RED テストを追加・更新。** `MapLibraryListScreen.test.tsx`、`MapLibraryDialog.test.tsx`、`MapLibraryBackupRestoreDialog.test.tsx`、`useMapLibraryDialogState.test.tsx`、`useMapLibraryDialogBackup.test.tsx`、`pageMapLibraryDialog.test.tsx`、`pageMapTrash.test.tsx` を作成・更新する。
- [ ] **Step 2: RED 確認。** 対象テストが FAIL することを確認。
- [ ] **Step 3: 最小実装。** `MapLibraryListScreen.tsx`、`MapLibraryDialog.tsx`、`useMapLibraryDialogState.ts`、`page.tsx` を実装・更新。
- [ ] **Step 4: GREEN 確認。** 上記全テスト＋ `npm run typecheck && npm run lint` が PASS。

---

### Task 6: 仕様ドキュメント・ブラウザテストケース・`ROADMAP.md` 更新と全体検証

**Files:**
- Modify: `docs/specifications/features.md`
- Modify: `docs/specifications/data-model.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1:** `docs/specifications/features.md` と `docs/specifications/data-model.md` に「削除マップのゴミ箱（候補015）」の仕様（`draw-my-map.trash.v1` / `draw-my-map.trash.v1.doc.<id>`、30日保持、復元、完全削除、空にする、容量不足/破損フォールバック、期限切れ自動削除）を追記する。
- [ ] **Step 2:** `docs/testing/browser-test-cases.md` に AA 節（削除マップのゴミ箱の実ブラウザ確認ケース）と結果集計行（未実施）を追加する。
- [ ] **Step 3:** `ROADMAP.md` の候補015のチェックボックスを `[x]` にし、「現在地」（Phase 16 完了・次の未完了フェーズは Phase 17）と「最終更新: 2026-11-14」を更新する。
- [ ] **Step 4:** `.worktrees/feat-phase16-deleted-map-trash/client` で `npm run verify`（`tailwind:scan`, `lint`, `typecheck`, `test`, `build`）を実行し、全項目成功を確認する。
