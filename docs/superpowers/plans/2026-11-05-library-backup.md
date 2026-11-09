# 全マップの一括バックアップ・復元 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`。このリポジトリでは `superpowers:executing-plans` によるインライン実行を使わない。チェックボックスをタスク単位で更新する。

**Goal:** 編集中のマップを含むライブラリ全件を版付き JSON に書き出し、既存マップを保ったまま全件を新 ID で追加復元する。

**Architecture:** ファイル形式、書き出し、復元ジャーナルを独立した永続化サービスに置く。`useMapLibrary` がセッション、一覧、保存、保護モードの境界を管理し、ダイアログが確認と通知を管理する。起動時は両ジャーナルを一か所で判定してから通常の一覧を読む。

**Tech Stack:** Next.js 16、React 19、TypeScript 5、Jest/jsdom、ブラウザ `localStorage`。

**Spec:** `docs/superpowers/specs/2026-11-05-library-backup-design.md`。作業者は着手前に設計全文と該当既存コードを読む。

## Global Constraints

- 対象は Phase 16 の候補007。対象外: 既存ライブラリの全置換、既存 ID への上書き、重複マップの自動判定、他タブ競合の一般解決（候補008）、ゴミ箱（候補015）、クラウド同期。
- バックアップファイルはローカルに保存される平文 JSON で、暗号化と自動クラウド送信はしない。
- `draw-my-map.maps.v1` の一覧と `draw-my-map.maps.v1.doc.<id>` の本体を使う。一覧は最低1件、ID は `[A-Za-z0-9_-]{1,64}`、名前は最大50コードポイント。
- ファイル形式は `format: "draw-my-map-library-backup"`、`version: 1`、有効な `exportedAt`、包含される `currentMapId`、1件以上の `maps`、各行の有効かつ重複しない元 ID・名前・日時・V3 document。余分なキーは保存に持ち込まない。個別 V1/V2 を暗黙移行しない。
- 上限は **1ファイル 32 MiB（UTF-8 バイト数）、マップ 1000 件**。書き出しと読込の両方で検査し、読込は `File.text()` より先に `File.size` を調べる。超過時は個別 JSON の救出経路を示す。
- ファイル名は `draw-my-map-library-backup-YYYYMMDD-HHMMSS.json`。名前を混ぜない。ダウンロードの通知は「ダウンロードを開始した」までとする。
- 現在マップは最新の有効な editor `currentSnapshot` を採る。初回 `restoreOrigin: "failed"` は同一 mount の `writeBody: saved` 実績が出るまで拒否し、その後の保存待ち・保存失敗でも最新 snapshot を採る。`saveStatus`、`flush: unchanged`、仮 baseline で資格を推論しない。
- 別マップの `null` 本体は名前と件数を明示して確認後に空 V3 として含める。読取例外・不正本体は全体を中止する。孤立本体は含めず件数を明示する。
- 追加復元は既存 ID・本体・現在マップ・現在 session/editor を保ち、ファイル内の各マップへ新 ID を付ける。ノード ID と有効な名前・日時は維持する。
- 復元確定順は **専用ジャーナル → 新規本体全件 → 最終一覧1回 → ジャーナル削除**。削除が確定点。途中失敗時は一覧原文と書込済み新規キーを戻し、戻し失敗は `recoveryRequired` とする。
- `recoveryRequired` 時は書込直前の最新有効 document JSON を `createProtectedStorageSession` の `initialJson` に渡す。再マウントで選択・履歴・viewport はリセットしてよいが、nodes・layoutMode・illustration は保持する。
- 起動時は通常の一覧修復より先に専用・枝移動ジャーナルを判定する。両方ある、記録不正、他者変更、戻し失敗では自動上書きせず保護モード。保護起動の救出元は非修復で有効な保存中一覧の現在マップを優先し、一覧が不正・無い・読めないときだけ有効な journal の操作前一覧を使う。選んだ現在本体が有効な V1/V2/V3 なら原文を `initialJson` に渡し、本体が不正・無い・読めないときは別マップで代用せず `null` にする。ジャーナルが残る間は枝移動・追加復元を拒否する。
- UI は `MapLibraryDialog` の画面別 group、フォーカストラップ、`onClickCapture` に従う。確認の既定フォーカスはキャンセル。IME、キーリピート、ダブルクリック、非同期結果の世代変化を扱う。
- 追加依存を入れない。各タスクで TDD の RED→GREEN、対象テストと `npm run typecheck` を通す。実装タスク中はコミットしない。後続の `commit-ja` が Conventional Commits 形式でまとめる。
- 実装は**新しい子エージェントをタスク順に一つずつ**起動し、各タスク後に**別エージェント**で仕様適合→コード品質の二段階レビューを行う。指摘は実装者に戻し、再レビュー完了後に次へ進む。最終 `client/npm run verify` を通す。

## Review Focus

1. 正常な空本体と消失本体が同じ `null` のとき、マップ名を挙げた確認なしに空として書き出さない（Task 4 のテスト）。
2. 初回復元失敗後、同一 mount の本体書込が一度成功したあと保存が再び失敗したとき、最新 editor snapshot を含める（Task 2、4 のテスト）。
3. 復元のジャーナル削除だけ失敗し、ロールバックの `removeItem` も失敗したとき、成功を出さず次回起動で安全に復旧する（Task 5、6 のテスト）。
4. ファイル読込中に A→B→A と戻ったとき、同じ ID でも古いプレビューを適用しない（Task 7、8 のテスト）。
5. 復元確認を Enter 長押し・ダブルクリック・IME で操作したとき、確定は一回以下、既定フォーカスはキャンセル、閉じた後は起点へ戻る（Task 8 のテスト）。

## ファイル責務と既存の接点

- `client/src/domain/mapLibrary/libraryBackupCodec.ts`: 外部ファイル形式だけを厳密検証・構築。`mapIndex.ts` の修復デコーダをファイル検証へ流用しない。
- `client/src/services/persistence/libraryBackupFile.ts`: File サイズ・読取と Blob・ファイル名・クリック後解放のみ。
- `client/src/services/persistence/libraryRestoreJournal.ts`: 専用記録の strict codec と `LIBRARY_RESTORE_JOURNAL_KEY` の唯一の定義。
- `client/src/services/persistence/libraryBackupExport.ts`: 一覧原文、全本体、孤立キー、snapshot、両 journal の読み取りと整合照合。`libraryRestoreTransaction.ts`: 事前検査、追加、ロールバック、起動時復旧。
- `client/src/hooks/mapLibrarySession.ts` と `useMapPersistence.ts` 系: editor の最新 document と初回復元結果、autoSave が同一 mount で受けた `writeBody: saved` 証拠の登録。`MapStorageSession` に必須メソッドを加え、`protectedStorageSession.ts` とテスト fixture も同時更新。
- `client/src/hooks/useMapLibrary.ts`: 現 session/index の正本、プレビュー世代、flush、一覧更新、保護モード移行。`useMapLibraryDialogState.ts` と `MapLibraryDialog.tsx` は画面遷移と非同期 UI。`page.tsx` は必須 props を配線。
- 既存テスト: `client/src/hooks/__tests__/useMapLibrary.test.tsx`、`useMapPersistence.test.tsx`、`useMapStoragePersistence.test.tsx`、`useMapStorageAutoSave.test.tsx`、`useMapLibraryDialogState.test.tsx`、`client/src/components/layout/__tests__/MapLibraryDialog.test.tsx`、`MapLibraryListScreen.test.tsx`、`client/src/app/__tests__/pageMapLibraryDialog.test.tsx`、`pageMapLibrary.test.tsx`、`pageSaveReload.test.tsx`。

---

### Task 1: バックアップ形式とファイル境界

**Files:** Create `client/src/domain/mapLibrary/libraryBackupCodec.ts`, `client/src/domain/mapLibrary/__tests__/libraryBackupCodec.test.ts`, `client/src/services/persistence/libraryBackupFile.ts`, `client/src/services/persistence/__tests__/libraryBackupFile.test.ts`。

**Interfaces:** Produces `LibraryBackupMap = MapIndexEntry & { document: MapDocumentV3 }`、`LibraryBackupV1 = { format: "draw-my-map-library-backup"; version: 1; exportedAt: string; currentMapId: string; maps: LibraryBackupMap[] }`、`decodeLibraryBackup(value: unknown): MapDocumentResult<LibraryBackupV1>`、`parseLibraryBackupJson(raw: string): MapDocumentResult<LibraryBackupV1>`、`createLibraryBackup(maps: readonly LibraryBackupMap[], currentMapId: string, exportedAt: string): MapDocumentResult<{ backup: LibraryBackupV1; json: string; byteSize: number }>`、`readLibraryBackupFile(file: File): Promise<MapDocumentResult<LibraryBackupV1>>`、`downloadLibraryBackup(json: string, now: Date): void`。定数 `MAX_LIBRARY_BACKUP_BYTES = 32 * 1024 * 1024`, `MAX_LIBRARY_BACKUP_MAPS = 1000` を codec から export。`MapDocumentResult` は既存型。

- [x] テストを先に追加。正規 V3、ノードの illustration を含む round-trip、余分なキーの除去、個別 JSON・将来版・途中 JSON・空配列・1001件・重複/不正 ID・非包含 current ID・名前の正規化が必要な値・不正日時・V1/V2/不正グラフ/数値/画像の1件でも全体拒否、32 MiB 境界を検査する。`File.size` 超過時に `text` が未呼出、`text` 例外、ダウンロード URL の `finally` 解放と click 例外も検査する。
- [x] `cd client && npm test -- --runInBand libraryBackupCodec libraryBackupFile` で RED を確認する。
- [x] 既存 `parseMapDocumentJsonWithVersion` に JSON 化した document を渡し、`sourceVersion === 3` のみ受ける。`normalizeStoredMapName(name) === name` と `normalizeMapTimestamp(x).repaired === false` を要求する。`Blob([json]).size` で UTF-8 上限を測る。`File.text()` 前に `size` を検査する。
- [x] 上記テスト GREEN、`cd client && npm run typecheck` を確認する。

### Task 2: editor snapshot と保存成功証拠の必須登録

**Files:** Modify `client/src/types/mapStorageSession.ts`, `client/src/hooks/mapLibrarySession.ts`, `client/src/services/persistence/protectedStorageSession.ts`, `client/src/hooks/useMapStorageAutoSave.ts`, `client/src/hooks/useMapStoragePersistence.ts`, `client/src/hooks/useMapPersistence.ts`, `client/src/testing/createTestStorageSession.ts`。Test `client/src/hooks/__tests__/mapLibrarySession.test.ts`, `useMapStorageAutoSave.test.tsx`, `useMapPersistence.test.tsx`, `useMapStoragePersistence.test.tsx`, `client/src/testing/__tests__/createTestStorageSession.test.ts`、`client/src/services/persistence/__tests__/protectedStorageSession.test.ts`。

**Interfaces:** Produces `MapBackupSnapshot = { json: string; hydrated: boolean; restoreOrigin: MapRestoreOrigin | null; hasSavedBodyThisMount: boolean }`。`MapStorageSession` に **必須** `registerBackupSnapshot: (snapshot: () => MapBackupSnapshot) => () => void` と `readBackupSnapshot: () => MapBackupSnapshot | null` を追加。`useMapStorageAutoSave` は mount 中に自身が呼んだ `writeBody` の `saved` を ref に記録し `hasSavedBodyThisMount: () => boolean` を返す。`useMapStoragePersistence` は既存 autoSave 結果に `hydrated: boolean`, `restoreOrigin: MapRestoreOrigin | null` を返し、`useMapPersistence` が layout effect で最新 `currentSnapshot` と上記証拠 getter を登録。`createPersistentMapSession` は同 session の登録だけを受け、旧 session・protected は `readBackupSnapshot() === null`。`useMapLibrary` の作成側で変更に必要な context を同タスクで更新。

- [x] RED: 復元中・未登録・旧 session を拒否し、初回 failed のまま `flush: unchanged` / 見かけの `saved` では資格が回復しないこと、`writeBody: saved` 後に証拠が立ち、その後 `pending` / `failed` でも最新 JSON が取れることを fixture と hook で検査する。保存済み JSON を readBody で代用しないことも検査。
- [x] `cd client && npm test -- --runInBand mapLibrarySession useMapStorageAutoSave useMapPersistence useMapStoragePersistence` の RED を確認。
- [x] 必須メソッド実装と全 caller/fixture の型修正を一緒に行う。現時点で `registerFlush:` を実装する実ファイルは `mapLibrarySession.ts`、`protectedStorageSession.ts`、`createTestStorageSession.ts` の3件。着手時に `rg -n 'MapStorageSession|registerFlush:' client/src` で追加の直接 literal・mock を再確認する。登録解除は自分の登録だけを外す。`readBackupSnapshot` は callback の最新値を毎回取得する。初回失敗履歴は restoration が固定し、保存資格は autoSave の実際の成功のみで回復する。
- [x] 対象テスト GREEN と `npm run typecheck`。

### Task 3: 専用ジャーナルの strict codec

**Files:** Create `client/src/services/persistence/libraryRestoreJournal.ts`, `client/src/services/persistence/__tests__/libraryRestoreJournal.test.ts`。

**Interfaces:** Produces `LIBRARY_RESTORE_JOURNAL_KEY = "draw-my-map.library-restore.v1"`、`LibraryRestoreJournal = { format: "draw-my-map-library-restore"; version: 1; indexBefore: string; indexAfter: string; bodies: { id: string; json: string }[] }`、`encodeLibraryRestoreJournal(journal: LibraryRestoreJournal): string`、`decodeLibraryRestoreJournal(raw: string): LibraryRestoreJournal | null`。`indexBefore` は厳密非修復 `MapIndexV1`、`indexAfter` は同じ current ID / 旧行を保ち `bodies` の ID の新行だけを加えた一覧。`bodies` の JSON は V3、有効 ID は全て相異なり旧一覧と非衝突。journal 内の有効な body JSON は書込値との byte 一致を確認する証拠なので、decode 後も文字列原文を保持する。未知キーの除去は journal 外枠と body 項目の object に限り、外部ファイルの値の正規化はファイル境界・書込計画で行う。

- [x] RED: 改竄した形式/版、重複 ID、旧 ID の再利用、既存行・current ID の変更、body の不正 JSON、空 body、`indexAfter` と body の対応ずれ、修復を要する一覧を拒否する。空白・改行・キー順が異なる有効な V3 body JSON も原文で round-trip する。
- [x] `cd client && npm test -- --runInBand libraryRestoreJournal` の RED を確認。
- [x] `unknown` から既知キーだけで再構築し、`decodeMapIndex` の `repaired === false` と V3 codec を利用。余分なキーを受けた場合も保存へ伝搬させない設計を明記したテストに合わせる。
- [x] 対象テスト GREEN と `npm run typecheck`。


### Task 4: 全件書き出しの準備とダウンロード

**Files:** Create `client/src/services/persistence/libraryBackupExport.ts`, `client/src/services/persistence/__tests__/libraryBackupExport.test.ts`。

**Interfaces:** Consumes Task 1 の `createLibraryBackup`, `downloadLibraryBackup`、Task 2 の `readBackupSnapshot`、Task 3 の `LIBRARY_RESTORE_JOURNAL_KEY`。Produces `LibraryBackupPreview = { json: string; currentSnapshotJson: string; fileNameDate: Date; missingBodyNames: string[]; orphanBodyCount: number; indexRaw: string; session: MapStorageSession }`、`prepareLibraryBackup(storage: MapLibraryStorage, index: MapIndexV1, session: MapStorageSession, now: Date): MapDocumentResult<LibraryBackupPreview>`、`isLibraryBackupPreviewCurrent(storage: MapLibraryStorage, index: MapIndexV1, session: MapStorageSession, preview: LibraryBackupPreview): boolean`。`MapDocumentResult` エラーは対象名と再試行先だけを出し、JSON 本文を含めない。呼出側は準備後に欠損確認を表示し、確定直前に同じ `session`・生一覧・最新 editor snapshot を再照合してから Task 1 の download を呼ぶ。

- [x] RED: 300ms 保存待ちと保存失敗中の最新 editor document、初回 failed→同一 mount `saved`→後続 failed、current 本体 `null`、別マップ本体 `null` の名前と件数、孤立キー件数、非修復一覧との不一致、読取例外/不正本体、両ジャーナル、別 session/一覧変更、確認画面中の新しい編集、1000件/32 MiB を検査。欠損がある場合も **準備だけ**で download は起こさない。
- [x] `cd client && npm test -- --runInBand libraryBackupExport` の RED を確認。
- [x] `decodeMapIndex(indexRaw)` の `kind === "ok" && repaired === false` と `encodeMapIndex(decoded.index) === encodeMapIndex(index)` を要求。現在は登録 snapshot、他は `readMapBody`。`null` は空 V3、孤立キーは列挙のみ。各 document は codec で V3 検証。枝移動キーは既存 `BRANCH_MOVE_JOURNAL_KEY`、専用キーは Task 3 の `LIBRARY_RESTORE_JOURNAL_KEY` を import し、文字列を重複定義しない。開始/終了時に生一覧・session を再照合し、確認後の download 前には登録 snapshot の JSON も照合する。変化時は新しいプレビュー/確認へ戻す。ジャーナル `getItem` 例外も拒否する。
- [x] 対象テスト GREEN と `npm run typecheck`。

### Task 5: 復元の予約・書込・ロールバック

**Files:** Create `client/src/services/persistence/libraryRestoreTransaction.ts`, `client/src/services/persistence/__tests__/libraryRestoreTransaction.test.ts`。

**Interfaces:** Consumes Task 1 の `LibraryBackupV1`、Task 3 の journal。Produces `RestoreWritePlan = { indexBeforeRaw: string; indexAfter: MapIndexV1; journal: LibraryRestoreJournal }`、`planLibraryRestore(storage: MapLibraryStorage, index: MapIndexV1, indexBeforeRaw: string, backup: LibraryBackupV1, generateId: () => string): MapDocumentResult<RestoreWritePlan>`、`RestoreWriteResult = { status: "saved" } | { status: "failed" | "recoveryRequired"; error: string }`、`writeLibraryRestore(storage: MapLibraryStorage, plan: RestoreWritePlan): RestoreWriteResult`。`plan` は全 ID を予約して衝突・読取失敗を **書込前**に拒否する。`write` は同期関数。

- [x] RED: 同一ファイル再実行で異なる ID、既存・孤立・同一バッチ内 ID 衝突、発行不能・`getItem` 例外、一覧生値変更、両 journal 存在、既存本体キーを一切上書きしないことを検査。容量/書込失敗は journal・途中 body・一覧・journal 削除の各段で分け、`failed` は一覧原文と全新規本体を元通り、remove/set ロールバック失敗は `recoveryRequired` と journal 残存を検査。
- [x] `cd client && npm test -- --runInBand libraryRestoreTransaction` の RED を確認。
- [x] `pickUnusedMapId` の規則（最大10回、無効 ID 再試行）を使用し予約集合も確認。`write` 直前に `getItem` で全前提を再検査し、journal の自己 decode 後に書込む。書込済み新規キーのみ逆順削除し、一覧を書いた場合は原文へ戻す。各 I/O 失敗後も残りを試す。journal 削除失敗時もロールバックし、成功したときのみ `failed`。
- [x] 対象テスト GREEN と `npm run typecheck`。

### Task 6: 起動時復旧と枝移動との相互排他

**Files:** Modify `client/src/services/persistence/libraryRestoreTransaction.ts`, `client/src/services/persistence/mapLibraryStartupRunner.ts`, `client/src/services/persistence/branchMoveTransaction.ts`; Test `client/src/services/persistence/__tests__/libraryRestoreTransaction.test.ts`, `mapLibraryStartupRunner.test.ts`, `branchMoveTransaction.test.ts`。

**Interfaces:** Produces `recoverLibraryRestore(storage: MapLibraryStorage): { kind: "none" | "recovered" | "unavailable" } | { kind: "blocked"; initialJson: string | null; mapId: string; mapName: string; error: string }`。`runMapLibraryStartup` が **両 journal の存在を先に読んで**片方だけ復旧し、両方/読取不能/不正なら `MapLibraryStartupResult` の protected を返す。`writeBranchMove` は復元 journal が残る場合 `{ ok:false, recoveryRequired:true }` を返す。

- [x] RED: 正常な途中記録の再起動で元一覧・記録した新規キーのみ復旧、繰り返し実行可。壊れた journal、両 journal、一覧が before/after 以外、body が期待値以外、読取失敗、戻し失敗、枝移動の同時開始を全て保護/拒否し、他者値を上書きしないことを検査。Task 5 の journal 削除→remove 失敗ケースを再起動して復旧するテストを含める。
- [x] `cd client && npm test -- --runInBand libraryRestoreTransaction mapLibraryStartupRunner branchMoveTransaction` の RED を確認。
- [x] 既存 `recoverBranchMove` を単独で先走らせず、runner 一か所で二 journal を調べる。専用復旧では一覧が before/after、各新規本体が `null`/期待文字列だけの場合に限り戻す。blocked の initial JSON は検証できる現在本体があれば渡し、それ以外は `null`、警告にジャーナル名と JSON 救出先を示す。
- [x] blocked の現在本体は保存中一覧の有効な current ID/name を優先し、保存中一覧が使えない場合だけ有効な journal の旧一覧に fallback。既存本体の有効 V1/V2/V3 原文を救出する。選んだ現在本体の不正・読取不能では別マップへ代用しない。新規 journal body の V3 条件は維持する。
- [x] 対象テスト GREEN と `npm run typecheck`。

### Task 7: ライブラリ hook の操作境界

**Files:** Modify `client/src/hooks/useMapLibrary.ts`, `client/src/hooks/mapLibraryState.ts`; Test `client/src/hooks/__tests__/useMapLibrary.test.tsx`。

**Interfaces:** Consumes Tasks 1–6。`UseMapLibraryResult` に必須 `prepareBackup: () => MapDocumentResult<LibraryBackupPreview>`、`downloadBackup: (preview: LibraryBackupPreview) => MapLibraryOperationResult`、`previewRestore: (file: File) => Promise<MapDocumentResult<LibraryRestorePreview>>`、`confirmRestore: (preview: LibraryRestorePreview) => MapLibraryOperationResult` を追加。`LibraryRestorePreview = { backup: LibraryBackupV1; indexRaw: string; session: MapStorageSession }` を `mapLibraryState.ts` に定義。`MapLibraryOperationResult` の成功は `remounted:false`、失敗で `recoveryRequired` は既存 `enteredProtectedMode:true`。

- [x] RED: 書き出し欠損確認の前後で session/一覧変更を拒否、download click 例外では成功通知なし。`previewRestore` は read 前後の session 参照と生一覧を照合し A→B→A を拒否。確定は先に flush、`failed` なら拒否、`unchanged` でも復元完了・同 session・一覧一致を別途要求。初回復元失敗で保存成功実績の無い editor は書込前に拒否する。flush による日時変更なら再確認を要求。正常成功は current ID、session object、editor mount と既存本体を維持。`recoveryRequired` は書込直前の最新 `readBackupSnapshot().json` を `initialJson` に渡し、nodes/layout/illustration を次 mount で復元できる。
- [x] `cd client && npm test -- --runInBand useMapLibrary` の RED を確認。
- [x] 復元確定中の同期操作ロックを ref で設け、`create/switch/rename/delete/moveBranch/backup/restore` の全入口で拒否する。成功時だけ `commitIndex(next)`、session は作り直さない。保護移行では `advanceSessionNumber` と `createProtectedStorageSession` を使う。エラーは JSON 全文を表示/ログしない。
- [x] 対象テスト GREEN と `npm run typecheck`。

### Task 8: ダイアログ UI と Home 結合

**Files:** Modify `client/src/types/mapLibraryDialog.ts`, `client/src/hooks/useMapLibraryDialogState.ts`, `client/src/components/layout/MapLibraryDialog.tsx`, `client/src/components/layout/MapLibraryListScreen.tsx`, `client/src/app/page.tsx`; Create `client/src/components/layout/MapLibraryBackupConfirm.tsx`, `client/src/components/layout/MapLibraryRestoreConfirm.tsx`, `client/src/components/layout/MapLibraryConfirmActions.tsx`; Test `client/src/components/layout/__tests__/MapLibraryDialog.test.tsx`, `MapLibraryListScreen.test.tsx`, `MapLibraryBackupRestoreDialog.test.tsx`, `client/src/hooks/__tests__/useMapLibraryDialogState.test.tsx`, `useMapLibraryDialogBackup.test.tsx`, `client/src/app/__tests__/pageLibraryBackup.test.tsx`。Home 結合の回帰は新規 `pageLibraryBackup.test.tsx` に集約する。

**Interfaces:** Consumes Task 7 の必須4操作。`MapLibraryDialogScreen` に `{kind:"backupConfirm"; preview: LibraryBackupPreview}`、`{kind:"restoreReading"}`、`{kind:"restoreConfirm"; preview: LibraryRestorePreview}` を追加。`MapLibraryDialog` の必須 props に `onPrepareBackup: () => void`, `onDownloadBackup: () => void`, `onSelectRestoreFile: (file: File) => void`, `onConfirmRestore: () => void` を追加し、`page.tsx` で全て接続。`MapLibraryListScreen` に必須 `onPrepareBackup: () => void`, `onSelectRestoreFile: (file: File) => void` を加え、復元ボタンが非表示 file input を開き、選択時に callback へ渡す。保護モードでは操作拒否と現在マップの「JSON書き出し」案内。

- [x] RED: Home→dialog→hook→storage の実配線で書き出し・追加復元、`null` 本体の名前確認・キャンセル、既存保持/現 editor 非再マウント、同じファイルの再選択、連続読込ガード、閉じた後/別 session の古い Promise 無視、同じ失敗の再告知を検査。確認画面はキャンセル先頭・既定フォーカス、起点ボタンへ復帰、Enter/Space repeat、マウス `detail > 1`、IME `isComposing`/`keyCode===229`、Escape、ダイアログ閉鎖後クリックを検査。
- [x] `cd client && npm test -- --runInBand MapLibraryDialog MapLibraryListScreen useMapLibraryDialogState page` の RED を確認。
- [x] `useMapLibraryDialogState` の世代 ref は開閉/読込ごと進め、結果反映前に世代と画面を照合。`MapLibraryDialog` は既存 screen key/group、`useDialogFocusTrap`、`handleDialogClickCapture` を継続。`MapLibraryListScreen` の file input の `accept` は `.json,application/json`、選択後は input value を空に戻し、内容は Task 1 で検証。進行中は handler でも拒否し、保護モードのボタンは失敗理由を知らせる。
- [x] 対象テスト GREEN と `npm run typecheck`。

### Task 9: 仕様文書・実ブラウザ手順・ROADMAP・最終検証

**Files:** Modify `README.md`, `client/README.md`, `docs/README.md`, `docs/architecture/overview.md`, `docs/specifications/features.md`, `docs/specifications/data-model.md`, `docs/specifications/api.md`, `docs/testing/browser-test-cases.md`, `ROADMAP.md`。Test: `client` の全 verify。

**Interfaces:** Consumes Tasks 1–8 の**実装済みの型・操作・通知先**。Produces 利用者向け機能説明、`MapStorageSession` の型例・保存キー表・起動復旧・一括ファイル形式、hooks/services/UI の責務説明、クライアント API 契約、実ブラウザ手順（Chrome/Firefox/Safari のダウンロード・ファイル選択・容量不足、IME、キーボード、読み上げ。未実施は未実施と記録）と更新済み ROADMAP。

- [x] 文書変更の RED 相当として、`rg -n 'MapStorageSession|registerFlush|draw-my-map.branch-move.v1|JSON インポート|JSON書き出し|useMapLibrary|MapLibraryDialogScreen|9系統|通知.*系統|現在地|最終更新' README.md client/README.md docs/README.md docs/architecture/overview.md docs/specifications/features.md docs/specifications/data-model.md docs/specifications/api.md ROADMAP.md` で既存の記述を列挙し、候補007の手順が `docs/testing/browser-test-cases.md` に無いことを確認する。文書に合わせて実装を変えず、実装と設計を正本として差を特定する。
- [x] `docs/specifications/data-model.md` の 5.1 キー表へ専用復元ジャーナル、5.5 `MapStorageSession` の型例へ Task 2 の必須2メソッドと証拠、5.8 の個別 JSON との区別、5.11 の枝移動との排他、続く新節へ一括ファイル形式・上限・書込順・ロールバック/起動時復旧・保護モードを記載する。`docs/specifications/api.md` の12章末に Task 2 の追加返値・登録と Task 7 の4操作、または新13章でそのシグネチャ・結果・通知先を実装どおり記載する。
- [x] `docs/architecture/overview.md` の `useMapLibrary`/`mapLibrarySession`/`useMapLibraryDialogState`/`useMapPersistence`/`MapStorageSession`/services/UI の列挙と画面遷移を更新し、Task 1–8 の各ファイル責務、journal の起動前判定、通常復元の現 editor 維持と保護移行時の再マウントを反映する。`docs/specifications/features.md` の12章の一覧操作と新しい一括バックアップ・追加復元節に確認・欠損・上限・失敗・フォーカス・対象外を記載する。
- [x] `README.md` の単一マップ JSON と一括 JSON の区別、`client/README.md` の操作/保存責務、`docs/README.md` の各文書案内と新ブラウザケースへの導線を更新する。**通知枠の数は最終コードで `client/src/components/map/MapEditor.tsx` の `operationNotices` 配列と `client/src/components/layout/MapLibraryNoticeRegion.tsx`、`client/src/components/layout/MapSaveStatus.tsx` を照合してから記す。** 現状の editor 操作通知は9系統で、新しいバックアップ通知はダイアログ内/シェルの既存 `MapLibraryNoticeRegion` を使う計画なので、常設 `MapSaveStatus` を新しい操作通知枠として数えない。実装で変わった数だけ文書を更新する。
- [x] `docs/testing/browser-test-cases.md` に正常/異常/再起動/保護の手順と結果欄を追加し、事前準備の削除対象に専用ジャーナル `draw-my-map.library-restore.v1` を加える。`ROADMAP.md` の候補007だけ完了、現在地を「007完了・Phase 16進行中・次008」にする。`最終更新` は**実施日のクライアント日付**（現時点では `2026-11-06`）とし、実施時に `date '+%Y-%m-%d'` を `TZ=Asia/Tokyo` で確認する。008/015を完了扱いにしない。設計書・計画書の `2026-11-05` は作成履歴として維持する。
- [x] `cd client && npm run verify` を実行し全成功を確認。実ブラウザ未実施なら Jest/jsdom 成功を実機確認済みと表現しない。

## 教訓・実行の引継ぎ

`$DEV_FLOW_KIT/lessons/review-lessons.md` の優先度 A チェックリストと関連する A/B 本文を確認。反映 ID: L-001, L-002, L-003, L-010, L-037, L-038, L-056, L-060, L-061, L-063, L-203, L-408, L-470, L-474, L-476, L-537, L-571, L-609, L-669。特に L-609 により必須メソッド追加と全 caller/fixture を Task 2 同時更新、L-060 により Task 8 で Home 結合を検査する。

各タスクは **新規実装子エージェント1名**、その完了後に **別のレビュー子エージェント**が仕様適合→コード品質を確認する。レビュー指摘を同じ実装者へ戻し、再レビューまで次タスクを始めない。子エージェントには該当タスク全文、Global Constraints、依存タスクの Interfaces、設計書パスを渡す。実装中のコミットは禁止。最終レビューと `npm run verify` 後、後続 dev-flow-kit の `commit-ja` へ渡す。
