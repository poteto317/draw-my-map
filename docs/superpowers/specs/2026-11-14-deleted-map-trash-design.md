# 削除マップのゴミ箱（候補015）設計

作成日: 2026-11-14。対象: Phase 16 の候補015。状態: サブエージェントレビュー通過・承認済み（設計確定）。

## 1. 目的と境界

マップを誤って削除したときに、一定期間（30日間）ゴミ箱から復元できるようにする。また、ブラウザの保存領域（`localStorage`）の容量を空けたい場合や完全に消去したい場合に備え、ゴミ箱からの個別完全削除・ゴミ箱を空にする操作、および容量不足やゴミ箱破損でゴミ箱へ移動できない場合の明示的な完全削除フォールバックを提供する。

### 対象外（YAGNI の徹底）
- 削除したマップの自動バージョン履歴や差分比較（Phase 20「版管理と復旧」に委ねる）。
- ゴミ箱内マップのプレビュー編集や名前変更（復元後に一覧から開く・名前変更する）。
- バックアップファイル（`draw-my-map-library-backup`）へのゴミ箱データの同梱（既存のバックアップ形式 v1 は維持する）。
- 他端末・クラウド同期。

---

## 2. 既存実装の調査と制約

- `mapLibraryStorage.ts`:
  - `draw-my-map.maps.v1`（`MapIndexV1`）と `draw-my-map.maps.v1.doc.<id>`（マップ本体 JSON）を保存する。
  - `readMapLibrarySnapshot` は `draw-my-map.maps.v1.doc.` で始まるキーをすべて `bodyIds` として収集し、`planRebuild` の一覧再構築や `libraryBackupExport` の `countOrphanBodies` に使う。
  - **制約**: ゴミ箱の本体のキーに `draw-my-map.maps.v1.doc.` を使うと、起動時再構築やバックアップの孤立本体カウントに混入し、既存の削除後 `mapBodyKey(id) === null` 契約にも反する。したがって、ゴミ箱は独立したキー空間を使う必要がある。
- `mapIndex.ts`:
  - `decodeMapIndex` / `encodeMapIndex` は `libraryBackupExport.ts` と `libraryRestoreTransaction.ts` が生の一覧文字列一致（`encodeMapIndex(decoded.index) === encodeMapIndex(index)`）の検証に使うため、`MapIndexV1` にゴミ箱フィールドを追加しない。
- `useMapLibrary.ts`:
  - `deleteMap(id)` は現在、`writeMapIndex` 後に `removeMapBody` を呼び、開いていないマップの削除後は `flushCurrentSession()` を再試行する。開いているマップの削除時はセッション番号を進めて旧セッションの `writeBody` を `inactive` にし、次マップまたは新しい「無題のマップ」へ切り替える。
- `MapLibraryDialog.tsx` / `useMapLibraryDialogState.ts`:
  - 画面遷移・`group` 単位のフォーカス管理・`MapLibraryConfirmActions`（キャンセル先頭・初期フォーカス・`detail > 1` とキーリピート抑止）・`useReannouncedNotice` を持つ。

---

## 3. ストレージ設計とデータモデル

### 3.1 独立した localStorage キー
- ゴミ箱一覧キー: `MAP_TRASH_INDEX_KEY = "draw-my-map.trash.v1"`
- ゴミ箱本体キー接頭辞: `MAP_TRASH_BODY_KEY_PREFIX = "draw-my-map.trash.v1.doc."`
- `mapTrashBodyKey(trashId: string): string` = `${MAP_TRASH_BODY_KEY_PREFIX}${trashId}`

### 3.2 型定義（`client/src/domain/mapLibrary/mapTrash.ts`）
```typescript
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type MapTrashEntry = {
  id: string;            // ゴミ箱エントリ固有ID（MAP_ID_PATTERN）
  originalMapId: string; // 元のマップID（MAP_ID_PATTERN）
  name: string;          // 削除時の正規化済みマップ名（1〜50コードポイント）
  createdAt: string;     // 元の作成日時（ISO 8601）
  updatedAt: string;     // 元の更新日時（ISO 8601）
  deletedAt: string;     // ゴミ箱へ移動した日時（ISO 8601）
  expiresAt: string;     // 保持期限（deletedAt + 30日、ISO 8601）
  hasBody: boolean;      // ゴミ箱本体キーが存在するか（未編集・未保存の空マップや本体なしマップは false）
};

export type MapTrashIndexV1 = {
  version: 1;
  items: MapTrashEntry[];
};

export type MapTrashState =
  | { status: "ok"; entries: readonly MapTrashEntry[] } // 表示順
  | { status: "corrupt" };
```

### 3.3 保持期限・ソート・復元時のID解決・データ修復
- **ソート順**: `deletedAt` 降順 → `updatedAt` 降順 → `id` 昇順（直近削除が先頭）。
- **期限切れ判定**: `Date.parse(entry.expiresAt) <= now.getTime()` または日時が不正な場合は期限切れとみなす。
- **残り日数表示**:
  - `diffMs = Date.parse(entry.expiresAt) - now.getTime()`
  - `diffMs <= 0`: `"期限切れ"`
  - `diffMs > 0`: `Math.ceil(diffMs / 86_400_000)` 日 → `"あと N 日"`（30日〜1日）。
- **破損時・欠損時の扱い（L-002）**:
  - `decodeMapTrashIndex(raw)` は `version !== 1`・JSON 構文エラー・`items` が配列でない場合は `{ kind: "corrupt" }` を返す。各行の不正データ・重複 `id` はスキップして `repaired: true` とする。
  - `MAP_TRASH_INDEX_KEY` が壊れていても、通常のマップ一覧や現在開いているマップを保護モードへ落とさない。
  - ゴミ箱インデックスが `{ kind: "corrupt" }` の間は、黙ってゴミ箱データを上書きしない。`deleteMap` はゴミ箱移動を中止して `canPermanentDelete: true` 付きエラーを返し（ゴミ箱に入れずに完全削除できる）、ゴミ箱画面には「ゴミ箱の読み込みに失敗しました」と表示し「ゴミ箱を空にする」操作でゴミ箱キー群を強制初期化できるようにする（デッドロック防止）。
- **ゴミ箱 ID の採番**:
  - 移動時、元の `target.id` がゴミ箱インデックスおよび `mapTrashBodyKey(target.id)` に存在しなければ `target.id` をそのまま `trashId` に使う。衝突する場合のみ `pickUnusedMapId` 相当で新しい `trashId` を採番する。
- **復元時のマップ ID 解決**:
  - `originalMapId` が現在のアクティブ一覧にも `hasMapBody(storage, originalMapId)` にも無ければ `originalMapId` を再利用する。
  - 衝突している場合（再作成・バックアップ復元などで同 ID が使用済み）は `pickNewMapId(storage, current.index, generateId)` で新しい ID を発行する。

---

## 4. 操作フローとロールバック・競合制御

### 4.1 起動時および各操作前の期限切れ清掃（`purgeExpiredTrash`）
- `runMapLibraryStartup` で通常モード（`mode === "persistent"`）の起動が決まった後（ジャーナル復旧・インデックス確定の後）に `purgeExpiredTrash(storage, deps.now())` を実行する。
- `MAP_TRASH_INDEX_KEY` が存在しない場合、または期限切れ項目が 0 件かつ `repaired: false` の場合は `setItem` / `removeItem` を一切呼ばない（起動時書き込み数を増やさない）。
- 期限切れ項目がある場合、該当の `mapTrashBodyKey(id)` を削除し、残った項目があれば `MAP_TRASH_INDEX_KEY` を更新する。**残った項目が 0 件になった場合は `MAP_TRASH_INDEX_KEY` を `removeItem` で削除する**（4.5 節の個別削除・空にする処理と統一）。
- 清掃時の I/O エラーやゴミ箱インデックス破損（`corrupt`）は、起動全体を失敗させず安全に無視して継続する（破損時は `MAP_TRASH_INDEX_KEY` を上書き削除しない）。

### 4.2 マップ削除 → ゴミ箱へ移動（`deleteMap`）
1. `restoreLockRef.current` または `libraryRef.current?.mode !== "persistent"` の場合は拒否。
2. `BRANCH_MOVE_JOURNAL_KEY` / `LIBRARY_RESTORE_JOURNAL_KEY` がある場合は拒否（進行中トランザクション保護）。
3. まず `purgeExpiredTrash` を実行し、期限切れゴミ箱データの空き容量を回収する（ゴミ箱インデックスが読めない・`corrupt` の場合は手順 5 で扱う）。
4. 削除対象の本体文字列 `bodyJson: string | null` を取得する:
   - `readMapBody(storage, target.id)` を読む。
   - 開いているマップ（`target.id === current.index.currentMapId`）の場合は、さらに `snap = current.session.readBackupSnapshot()` を確認する。
     - `isEligibleMapBackupSnapshot(snap)` かつ `parseMapDocumentJson(snap.json)` が成功する場合:
       - `readMapBody` の結果が `ok && value === null` かつ `snap.restoreOrigin === "empty"` かつ `!snap.hasSavedBodyThisMount` かつ `snap.json` が空ドキュメント（`nodes.length === 0 && layoutMode === "manual"`）と等価であれば、未編集・未保存の空マップとして `bodyJson = null`（`hasBody: false`）を維持する。
       - それ以外（編集あり、または既に保存済み）の場合は未保存編集を含めるため `bodyJson = snap.json` を採用する。
     - 上記の適格スナップショットが無い場合（復元中・復元失敗・単体テスト環境など）は `readMapBody` の結果を使う（`!body.ok` ならゴミ箱移動を中止し `canPermanentDelete: true` 付きエラーを返す）。
   - 開いていないマップの場合は `readMapBody` の結果を使い、`!body.ok` なら中止し `canPermanentDelete: true` 付きエラーを返す。
5. 最新のゴミ箱インデックスを検証する:
   - 読み取り失敗または `corrupt` の場合は上書きせず中止し、`canPermanentDelete: true` 付きのエラーを返す。
   - `trashId` と `MapTrashEntry`（`hasBody: bodyJson !== null`）を作成し、現在のゴミ箱一覧に追加した `trashIndexNext` と、変更前の `trashIndexBeforeRaw: string | null` を控える。
6. **ゴミ箱への書き込み（失敗時は即ロールバック）**:
   - `bodyJson !== null` なら `writeTrashBody(storage, trashId, bodyJson)`。
   - `writeMapTrashIndex(storage, trashIndexNext)`。
   - いずれかが失敗した場合: 書き込んだ `trashBody` があれば `removeTrashBody` で削除して戻す。失敗理由が `QuotaExceededError` の場合は `{ ok: false, notice, canPermanentDelete: true }` を返し、それ以外は `{ ok: false, notice }` を返す。
7. **アクティブ一覧の更新（失敗時は逆順ロールバック）**:
   - アクティブ一覧を更新して `writeMapIndex(storage, activeIndexNext)`（最後の1つの場合は先に `pickNewMapId` を実行し、ID 取得不可なら手順 6 より前に `mapIdUnavailableNotice()` で中止する）。
   - `writeMapIndex` が失敗した場合:
     1. まず書き込んだ `trashBody` があれば `removeTrashBody(storage, trashId)` で消す（容量確保を先行）。
     2. 次に `MAP_TRASH_INDEX_KEY` を `trashIndexBeforeRaw`（以前は不在なら `removeItem`）へ戻す。戻し I/O の失敗時はベストエフォートで残りの戻しも試みる。
     3. 失敗理由が `QuotaExceededError` の場合は `{ ok: false, notice: indexWriteFailedNotice("マップを削除"), canPermanentDelete: true }`、それ以外は `failedOperation(indexWriteFailedNotice("マップを削除"))` を返す。
8. **旧アクティブ本体の削除とセッション遷移**:
   - 共通のアクティブ削除完了処理を実行する:
     - 開いているマップの場合: 先に `advanceSessionNumber()` して旧セッションからの書き戻しを防ぎ、`removeMapBody(storage, target.id)` を呼び、`commitSession(current, activeIndexNext, sessionNumber)` とゴミ箱状態更新を行う。
     - 開いていないマップの場合: `commitIndex(activeIndexNext)` とゴミ箱状態更新を行い、`removeMapBody(storage, target.id)` を呼ぶ。
   - `removeMapBody` だけが失敗した場合は一覧とゴミ箱は更新済みとし、`warning` 通知（`bodyRemovalFailedNotice` 等）を返す（既存契約と一致）。
9. **非現在マップ削除後の自動保存再試行**:
   - 開いていないマップを削除したときは `flushCurrentSession()` を再試行し、`failed` なら `saveRetryNotice: autoSaveFailedNotice()` を返す。

### 4.3 容量不足・ゴミ箱破損時のフォールバック完全削除（`permanentlyDeleteMap`）
- `deleteMap` が `canPermanentDelete: true` で失敗した場合に、削除確認画面から実行する明示的な完全削除経路。
- **前提ガード**: `restoreLockRef.current` / `!persistent` / 進行中ジャーナル存在時は拒否し、対象が存在しない場合は `indexWriteFailedNotice("マップを削除")` を返す。
- **分岐と保存再試行**: 4.2 節と同一のアクティブ一覧更新（開いていないマップ／開いている他マップあり／最後の1件を新しい「無題のマップ」に置換）と `advanceSessionNumber()`・`removeMapBody`・非現在マップ削除後の `flushCurrentSession()` 再試行を行う。ゴミ箱キーには一切書き込まない。

### 4.4 ゴミ箱からの復元（`restoreFromTrash(trashId)`）
1. `restoreLockRef.current` / `!persistent` / 進行中ジャーナル存在時は拒否。
2. 最新の `MAP_TRASH_INDEX_KEY` を読み込み、`purgeExpiredTrash` を実行したうえで `trashId` のエントリを探す。
   - ゴミ箱インデックスが読めない・`corrupt` の場合はエラーを返し、UI の `trashState` を同期する。
   - 対象が見つからない場合（他タブで既に削除/復元された、または期限切れで消えた場合）は `trashState` を最新化し、「対象のマップはゴミ箱に見つかりませんでした。」を返す。
3. `entry.hasBody` が `true` の場合:
   - `readTrashBody(storage, entry.id)` を読み、読み取り失敗や `null`（本体消失）なら復元を中止してエラーを返す（L-002）。
   - `parseMapDocumentJsonWithVersion(bodyJson)` でマップデータの妥当性を検証する。不正なら復元を中止する。
4. **アクティブ一覧の整合確認**:
   - `readMatchingIndexRaw(current)`（`decodeMapIndex(raw).kind === "ok" && !decoded.repaired && encodeMapIndex(decoded.index) === encodeMapIndex(current.index)`）でストレージ上の最新一覧と一致することを確認する（既存の `confirmRestore`・`prepareBackup` と同一基準）。
   - 不一致の場合は他タブ更新や修復未反映とみなし、安全に中止して「マップ一覧が変更または更新されたため復元できませんでした。ページを再読み込みしてからやり直してください。」を返す。
5. 復元先 ID（`originalMapId` が一覧にも `hasMapBody` にも無ければ再利用、衝突時は `pickNewMapId(storage, current.index, generateId)`）を決め、`MapIndexEntry`（元の `name`, `createdAt`, `updatedAt` を保持）を作成する。
6. **書き込み順とロールバック**:
   - `entry.hasBody` なら `writeMapBody(storage, restoredId, bodyJson)`。失敗なら即中止。
   - `writeMapIndex(storage, activeIndexNext)`。失敗なら書いた `mapBodyKey(restoredId)` を `removeMapBody` で削除してロールバックし中止（ロールバック失敗時はエラー文言に含める）。
   - `commitIndex(activeIndexNext)` でアクティブ一覧に反映する（現在のマップと編集セッションはそのまま維持する）。
   - ゴミ箱一覧から `entry.id` を除いた結果が 0 件なら `removeItem(MAP_TRASH_INDEX_KEY)`、1 件以上なら `writeMapTrashIndex` を実行し、`entry.hasBody` なら `removeTrashBody(storage, entry.id)` を実行する（ゴミ箱側の後始末だけ失敗した場合は、復元済みであることを保ちつつ `warning` 通知を返す）。
7. `trashState` を最新化し、成功通知「マップ「{name}」をマップ一覧に復元しました。」を返す。

### 4.5 ゴミ箱からの個別完全削除・ゴミ箱を空にする
- **個別完全削除（`permanentlyDeleteFromTrash(trashId)`）**:
  - `restoreLockRef.current` / `!persistent` / 進行中ジャーナル存在時は拒否。
  - 最新ゴミ箱一覧を読み `purgeExpiredTrash` 後に `trashId` を探す（`corrupt` や不在時は `trashState` を同期してエラーを返す）。
  - 先に `MAP_TRASH_INDEX_KEY` を更新（残 0 件なら `removeItem`）し、続けて `entry.hasBody` なら `removeTrashBody(storage, trashId)` を呼ぶ。
  - インデックス更新失敗時は中止し本体を消さない。本体削除のみ失敗時は `warning` 通知を返し、`trashState` を最新化する。
- **ゴミ箱を空にする（`emptyTrash()`）**:
  - `restoreLockRef.current` / `!persistent` / 進行中ジャーナル存在時は拒否。
  - 通常時（`trashStatus === "ok"`）:
    - 最新ゴミ箱一覧を読む。`hasBody: false` の項目は本体削除不要として成功扱いで一覧から外し、`hasBody: true` の項目は `removeTrashBody(storage, entry.id)` を呼んで成功した項目だけ一覧から外す。またゴミ箱内の孤立した `MAP_TRASH_BODY_KEY_PREFIX` キーも併せて削除を試みる。
    - すべて外れて 0 件になったら `removeItem(MAP_TRASH_INDEX_KEY)` を実行する。一部失敗が残った場合は残った項目だけを `MAP_TRASH_INDEX_KEY` へ書き戻す。
    - `MAP_TRASH_INDEX_KEY` の削除または書き戻し自体が失敗した場合は `warning`（一部でも本体を消した場合）または `error` 通知を返し、`trashState` をストレージから再同期する。
  - 破損時（`trashStatus === "corrupt"`）:
    - `MAP_TRASH_BODY_KEY_PREFIX` で始まるすべてのキーを削除し、全キーの削除に成功した場合のみ `removeItem(MAP_TRASH_INDEX_KEY)` で初期化する。失敗が残れば `error` 通知を返し、`trashState` を再同期する。
- **表示との同期（他タブ協調）**:
  - `useMapLibrary` は起動時（`purgeExpiredTrash` 後）から `view` に `trashEntries` と `trashStatus` を含める。
  - 一覧画面を開くとき（`openList`）およびゴミ箱画面を開くとき（`openTrash`）に `refreshTrash()` を呼び、期限切れ清掃とストレージ再読込を行って最新化する。

---

## 5. UI・アクセシビリティ設計

### 5.1 `MapLibraryListScreen.tsx`
- 下部アクション行に **「ゴミ箱」** ボタン（`trashStatus === "ok"` で 1 件以上のときは `ゴミ箱（N）`、`trashStatus === "corrupt"` のときは `ゴミ箱（要確認）`、`data-map-library-action="trash"`）を追加する。
- `suppressBackupRestoreActionKey` を付与し、保護モード時は `rejectProtected()` で拒否する。

### 5.2 `MapLibraryDeleteConfirm.tsx`
- 説明文を以下に改める:
  - 「マップ「{target.name}」をゴミ箱に移動します。ゴミ箱から 30 日間復元できます。」
  - （既存どおり `isLast` や `isCurrent && nextMapName` の案内も続ける）
- 確認ボタンは既存の「このマップを削除」（`dangerButtonClassName`、`detail > 1`・`Enter/Space repeat` 抑止）を維持する。
- `OpenMapLibraryDialogScreen` の delete 状態に `allowPermanentDelete?: boolean` を持たせ、`deleteMap` が `canPermanentDelete: true` を返したときだけ「ゴミ箱に入れずに完全に削除」ボタン（`dangerButtonClassName`、`detail > 1`・`repeat` 抑止）を表示する。画面を閉じる・キャンセル・別画面へ移ると `allowPermanentDelete` は破棄される。

### 5.3 `MapLibraryTrashScreen.tsx`（画面 `{ kind: "trash" }`）
- 見出し: `ゴミ箱`
- 説明: `削除したマップは 30 日間保存されます。期限を過ぎると自動的に削除されます。`
- `trashStatus === "corrupt"` の場合: 破損のエラーメッセージと「ゴミ箱を空にする」「一覧に戻る」を表示する。
- 空状態: `ゴミ箱は空です。`
- 項目リスト（`ul` `aria-label="ゴミ箱のマップ"`）:
  - 各行にマップ名、`削除: YYYY/MM/DD HH:mm`、残り日数（`あと N 日`）を表示。
  - 各行にボタン（`suppressBackupRestoreActionKey` 付与）:
    - `復元`（`aria-label="復元: <マップ名>"`、`data-trash-id={entry.id}`、`data-trash-action="restore"`）
    - `完全に削除`（`aria-label="完全に削除: <マップ名>"`、`data-trash-id={entry.id}`、`data-trash-action="permanentDelete"`）
- 項目が 1 件以上のとき「ゴミ箱を空にする」ボタン（`data-map-library-action="emptyTrash"`、`suppressBackupRestoreActionKey` 付与）を表示。
- 「一覧に戻る」ボタン（`data-map-library-action="backToList"`、`suppressBackupRestoreActionKey` 付与）で一覧画面へ戻り、`trashButton` へフォーカスを戻す。

### 5.4 確認画面（`MapLibraryConfirmActions` の拡張と再利用）
- `MapLibraryConfirmActions.tsx` に `confirmVariant?: "default" | "danger"` を追加し、`"danger"` のときは `dangerButtonClassName` を適用する（既存のバックアップ・復元確認は `"default"` のまま維持）。
- `{ kind: "trashPermanentDelete"; trashId: string }`（`MapLibraryTrashPermanentDeleteConfirm.tsx`）:
  - 見出し: `完全に削除`
  - 説明（`aria-describedby`）: `ゴミ箱からマップ「{target.name}」を完全に削除します。この操作は元に戻せません。`
  - ボタン: キャンセル（先頭・初期フォーカス）、`完全に削除`（`confirmVariant="danger"`）
- `{ kind: "trashEmptyConfirm" }`（`MapLibraryTrashEmptyConfirm.tsx`）:
  - 見出し: `ゴミ箱を空にする`
  - 説明（`aria-describedby`）: `trashStatus === "corrupt"` なら「壊れたゴミ箱の保存データをすべて削除して初期化します。この操作は元に戻せません。」、通常なら「ゴミ箱内の {count} 件のマップをすべて完全に削除します。この操作は元に戻せません。」
  - ボタン: キャンセル（先頭・初期フォーカス）、`ゴミ箱を空にする`（`confirmVariant="danger"`）

### 5.5 フォーカス管理・2階層戻し（`useMapLibraryDialogState.ts` / `MapLibraryDialog.tsx`）
- `MapLibraryDialog.tsx`:
  - `screenKey` に `trashPermanentDelete:${screen.trashId}` を含め、`aria-describedby` に `trashPermanentDelete` と `trashEmptyConfirm` を含める。
  - `trashPermanentDelete` の対象が画面表示前に不在になった場合だけ `onCancelRef` で `trash` へ戻す（確認実行時は `useMapLibraryDialogState` が同一 `setState` で `screen` を `trash` へ戻しつつ `alert` を設定するため、`isTargetMissing` による通知消去は起きない）。
- `useMapLibraryDialogState.ts`:
  - `back()` / `backFrom()` を 2 階層対応にする:
    - `trash` → `list`（フォーカス `{ kind: "trashButton" }`）
    - `trashPermanentDelete` → `trash`（フォーカス `{ kind: "trashRow", trashId: screen.trashId, action: "permanentDelete" }`、対象不在時は `backToListButton` へフォールバック）
    - `trashEmptyConfirm` → `trash`（フォーカス `{ kind: "emptyTrashButton" }`）
  - `trash` 画面の `screenDefault` フォーカス: 項目があれば先頭行の「復元」ボタン、無ければ「一覧に戻る」ボタン。
  - ゴミ箱の「復元」・個別完全削除の確定時: 操作前のゴミ箱表示順から次の行の「復元」ボタン（無ければ前の行、空になったら `{ kind: "backToListButton" }`）を導出し、他タブ変更・期限切れ等で対象が不在で失敗した場合もその安全な `focusTarget` へ移しつつ `alert` を維持する。
  - 「ゴミ箱を空にする」の確定時: `trash` 画面へ戻り、成功時は `{ kind: "backToListButton" }`、失敗時（項目残存）は先頭行または `{ kind: "emptyTrashButton" }` へフォーカスする。

---

## 6. テストとドキュメント更新計画

- **新規ユニット・結合テスト（TDD）**:
  - `mapTrash.test.ts`（domain: decode/encode、破損修復、期限判定、残り日数、ソート、ID 解決）
  - `mapTrashStorage.test.ts`（service: ゴミ箱の読み書き、期限切れ清掃、起動時ゼロ書き込み、破損時保護）
  - `mapLibraryStartupRunner.test.ts`（起動時の期限切れ自動削除・破損時保護非遷移の追加ケース）
  - `useMapLibrary.test.tsx`（ゴミ箱移動・容量不足/破損フォールバック完全削除・復元・ID 衝突・破損/欠損時エラー・個別完全削除・空にする・他タブ一覧変化時のガード）
  - `useMapLibraryDialogState.test.tsx`（ゴミ箱・確認画面の 2 階層遷移・フォーカス復元・通知維持）
  - `MapLibraryTrashScreen.test.tsx` / `MapLibraryDialog.test.tsx` / `MapLibraryDeleteConfirm.test.tsx`（アクセシビリティ・`detail > 1`・`repeat`・フォーカス・フォールバックボタン）
  - `pageMapTrash.test.tsx`（`Home` → ダイアログ → 削除 → ゴミ箱表示 → 復元 → 切り替え確認、完全削除、空にする、再起動後の期限切れ自動消去）
- **既存テストの契約更新対象**（削除文言・ゴミ箱移動動作・props 拡張に伴う更新）:
  - `MapLibraryDeleteConfirm.test.tsx`、`MapLibraryDialog.test.tsx`（削除確認の説明文・新しい props）
  - `MapLibraryListScreen.test.tsx`、`MapLibraryBackupRestoreDialog.test.tsx`（`MapLibraryListScreen` / `MapLibraryDialog` の新しい props）
  - `useMapLibrary.test.tsx`（`deleteMap` のストレージ操作履歴・通知の更新）
  - `pageMapLibraryDialog.test.tsx`、`mapLibraryMessages.test.ts`（ゴミ箱移動通知文言の更新）
- **ドキュメント更新**:
  - `docs/specifications/features.md`、`docs/specifications/data-model.md`、`docs/testing/browser-test-cases.md`（AA 節の追加）
  - `ROADMAP.md`（候補015 完了チェック、現在地、最終更新日の更新）
