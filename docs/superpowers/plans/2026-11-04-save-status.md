# 保存状態の表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`。このリポジトリではタスクごとに実装サブエージェントを1つ起動し、別のサブエージェントが仕様適合とコード品質を順にレビューする。`superpowers:executing-plans` によるインライン実装は使わない。チェックボックスで進捗を追う。

**Goal:** 現在のマップ本体について、実際の復元・書き込み結果に一致する保存状態をヘッダーに常設表示する。

**Architecture:** 復元の由来を保存フックへ伝え、現在のシリアライズ済み snapshot と確認済みの保存基準、強制要求、直近の失敗から純粋関数で表示状態を決める。同期保存と既存の通知を共通経路で更新し、`Home` の `storageMode` をヘッダーまで明示的に配線する。

**Tech Stack:** Next.js 16、React 19、TypeScript、Jest 30、Testing Library。

**Spec:** `docs/superpowers/specs/2026-11-04-save-status-design.md`。実装者・レビュアーはこの設計も読む。

## Global Constraints

- 作業場所は `.worktrees/codex/phase16-save-status`。全回答・レビューは日本語。先にテストを追加して RED、実装後 GREEN を確認する。
- 対象は現セッションのマップ**本体**だけ。マップ名・一覧の `updatedAt`・JSONダウンロード・他タブとの整合を保存成功の証拠にしない。`writeBody` の `saved` は一覧インデックス書込失敗時も本体成功である。
- 比較は `serializeMapDocument(createMapDocument(...))` の snapshot 文字列の完全一致。復元 V2/V3 は正規化文字列、V1 は旧文字列を基準として新形式への書き戻しを待つ。本体なし・復元失敗の仮の基準を成功とみなさない。
- 保存は既存の同期 `writeBody` と変更後300msの無上限デバウンス。架空の「保存中」、遅延、自動再試行、手動保存ボタンを追加しない。同一 snapshot の明示要求は保存完了まで待機状態。
- `failed` は確実な成功基準への復帰か次の `saved` まで表示を優先する。失敗だけでタイマー再試行しない。通常タイマーの成功でも既存の失敗通知を消し、別種の通知は消さない。
- `flushPendingSave` は最後に確定した snapshot を同期で書く。復元前・同一・`inactive` の `unchanged` は成功の証拠ではない。タイマー・flush・別マップ削除後の再試行を同じ結果処理へ通す。
- `storageMode="protected"` を優先し、旧セッションの `inactive` を成功や保護モードと誤認しない。マップ切替・削除・枝移動時の再マウントと A→B→A の世代を保つ。
- 選択、履歴、保存データ形式、保存 retry の契約、依存パッケージは変更しない。失敗の `role="alert"` は既存通知だけ、常設表示は単一 `role="status"`・`aria-live="polite"` と独立した説明を持つ。
- 実装タスク内ではコミットしない。後続 `commit-ja` が Conventional Commits 形式でまとめる。各タスク後に別エージェントの仕様適合・コード品質レビューを行い、指摘修正・再レビュー後に次へ進む。全タスク後に `client` で `npm run verify`。

## Review Focus

1. 読み取り例外・不正 JSON・本体なしが同じ仮 snapshot でも、`保存済み` を誤表示しない → Task 1 の復元由来テストと Task 2 の初期状態テスト。
2. 連続編集の途中で古いタイマーが発火せず、最新 snapshot のみ保存される → Task 2 の299ms再編集テスト。
3. 失敗後に編集しても `保存失敗` が隠れず、既知の成功基準への復帰時だけ回復する → Task 2 の失敗・復帰テスト。
4. 別マップ削除後の同期 flush 再試行と A→B→A の旧世代 `inactive` が、別セッションの成功状態を作らない → Task 2 の session テスト、Task 3 の実 `Home` 結合テスト。
5. ヘッダーの常設 status と既存の失敗 alert が二重の alert にならず、通知のないときも表示される → Task 3 のアクセシビリティテスト。

## File Map

- `client/src/domain/persistence/mapSaveStatus.ts`（新規）: 保存表示状態の型と純粋な状態判定。テストは同階層の `__tests__/mapSaveStatus.test.ts`。
- `client/src/hooks/useMapStorageRestoration.ts`: 初回復元の由来を追加。既存の `hydrated` と `initialPersistedSnapshot` を維持。
- `client/src/hooks/useMapStorageAutoSave.ts`: 成功基準、失敗、強制要求、タイマー・flush の書込結果を表示へ反映。
- `client/src/hooks/useMapStoragePersistence.ts`、`client/src/hooks/useMapPersistence.ts`: 復元由来・`storageMode`・表示状態の受け渡し（Task 2 で完了）。
- `client/src/components/layout/MapSaveStatus.tsx`（新規）と `AppHeader.tsx`: 常設の短いテキストと status 領域。
- `client/src/components/map/MapEditor.tsx`、`client/src/app/page.tsx`: 実 `Home` からの `storageMode` 配線（Task 2）。Task 3 で `saveStatus` を `AppHeader` へ渡す。
- 各既存テスト、`client/src/app/__tests__/pageMapLibrarySwitch.test.tsx`、ドキュメント体系、`ROADMAP.md`: 仕様と結合動作の検証・記録。

---

### Task 1: 復元由来と保存状態の純粋な判定

**Files:** Create `client/src/domain/persistence/mapSaveStatus.ts`, `client/src/domain/persistence/__tests__/mapSaveStatus.test.ts`; Modify `client/src/hooks/useMapStorageRestoration.ts`, `client/src/hooks/__tests__/useMapStorageRestoration.test.tsx`。

**Interfaces:**
- Produces `export type MapRestoreOrigin = "restored" | "empty" | "failed"`。`useMapStorageRestoration` の返り値は `{ hydrated: boolean; initialPersistedSnapshot: string | null; restoreOrigin: MapRestoreOrigin | null }`。初期値は `null`。`restored` のみ復元済み本体がある。
- Produces `export type MapSaveStatus = "checking" | "saved" | "beforeSave" | "restoreFailed" | "pending" | "failed" | "protected"` と `deriveMapSaveStatus(input: { hydrated: boolean; restoreOrigin: MapRestoreOrigin | null; currentSnapshot: string; initialPersistedSnapshot: string | null; confirmedSnapshot: string | null; forcedSnapshot: string | null; hasSaveFailure: boolean; storageMode: "persistent" | "protected" }): MapSaveStatus`。
- `confirmedSnapshot` は復元 `restored` の比較基準または最後に `saved` を返した文字列だけ。`empty`/`failed` の `initialPersistedSnapshot` は失敗前の編集有無と従来の保存差分判定に残すが `confirmedSnapshot` にしない。判定順は保護モード、復元前、強制要求のない確認済み基準への一致（`saved`）、`hasSaveFailure`（`failed`）、強制要求のない `empty`/`failed` 仮基準への一致（`beforeSave`/`restoreFailed`）、それ以外（`pending`）。書込失敗後は仮基準に戻っても `failed` を維持する。

- [x] **Step 1: RED テストを追加。** `mapSaveStatus.test.ts` で表駆動テストにより、復元前、保護モード、`restored` の同一/差分、V1旧文字列との差分、`empty`/`failed` の仮基準、強制同一 snapshot、失敗の粘着、確認済み基準への復帰、失敗後の仮基準復帰も `failed` であることを断言する。復元フックのテストは初期値、V1、V2/V3、null、読み取り失敗、不正 JSON の `restoreOrigin` と従来の基準・警告を断言する。
- [x] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/domain/persistence/__tests__/mapSaveStatus.test.ts src/hooks/__tests__/useMapStorageRestoration.test.tsx`。新しい型/関数/フィールド欠落による FAIL を確認。
- [x] **Step 3: 最小実装。** 上記シグネチャで純粋関数と復元由来を実装。V1の `stored.value` と V2/V3の `serializeMapDocument(document)`、`empty`/`failed` の現 snapshot 基準、警告を維持する。
- [x] **Step 4: GREEN 確認。** Step 2 と同じコマンドが PASS。

### Task 2: 自動保存・同期 flush の結果を表示へ反映

**Files:** Modify `client/src/hooks/useMapStorageAutoSave.ts`, `client/src/hooks/useMapStoragePersistence.ts`, `client/src/hooks/useMapPersistence.ts`, `client/src/components/map/MapEditor.tsx`, `client/src/app/page.tsx`, `client/src/hooks/__tests__/useMapStorageAutoSave.test.tsx`, `client/src/hooks/__tests__/useMapStoragePersistence.test.tsx`, `client/src/hooks/__tests__/useMapPersistence.test.tsx`, `client/src/components/map/__tests__/MapEditor.test.tsx`, `client/src/components/map/__tests__/MapEditorOutline.test.tsx`。

**Interfaces:**
- Consumes Task 1 の `MapRestoreOrigin`, `MapSaveStatus`, `deriveMapSaveStatus` と復元フック返り値。
- `useMapStorageAutoSave` の options に `restoreOrigin: MapRestoreOrigin | null` と `storageMode: "persistent" | "protected"` を追加し、返り値へ `saveStatus: MapSaveStatus` を追加。既存の `requestSnapshotSave(snapshot: string): void` と `flushPendingSave(): MapFlushResult` は維持。
- `useMapStoragePersistence` の options に同じ `storageMode` を追加し、Task 1 の復元結果とともに auto-save へ渡す。返り値は auto-save の返り値。
- `useMapPersistence` options に必須 `storageMode: "persistent" | "protected"`、返り値に `saveStatus: MapSaveStatus` を追加。`MapEditorProps` にも必須 `storageMode` を追加し、`Home` の `view.storageMode` から `useMapPersistence` まで渡す。この Task では表示には渡さない。既存の直接 `MapEditor` 描画テストには `storageMode="persistent"` を明示する。
- `writeBody` の `saved` だけが確認済み基準を更新する。タイマーと flush の両方で成功後に `clearSaveFailureNotice` を呼ぶ。`failed` は基準を進めず通知、`inactive` は基準・失敗通知を動かさない。確認済み基準への復帰では失敗を解除し、別 snapshot 向けの古い強制要求も失効させ、既存の保存失敗通知だけを消す。現在 snapshot 自体への強制要求は実際の保存まで維持する。仮基準への復帰では失敗を維持する。ref は flush の同期性と関数同一性を維持し、状態更新は React の確定後に行う。

- [x] **Step 1: RED テストを追加。** 既存 `createTestStorageSession` と fake timers で、復元前 `checking` と無書込、`empty`/`failed` 初期表示、V1移行待ち、300ms待ち、299msで再編集した最新 snapshot、同一 snapshot の強制保存と flush、タイマー/flush の `saved`/`failed`/`inactive`、失敗後の編集・既知基準への復帰・仮基準への復帰でも `failed` 維持、タイマー成功による失敗通知消去、flush 後の二重書込なし、アンマウント、登録された flush の再試行を断言。`useMapStoragePersistence` では登録 flush、復元由来、protected の伝達、`useMapPersistence` では `saveStatus` の返値を断言。既存の auto-save フックテストへ `restoreOrigin: "restored"` と `storageMode: "persistent"`、上位フックテストへ `storageMode: "persistent"` を追加する。
- [x] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/hooks/__tests__/useMapStorageAutoSave.test.tsx src/hooks/__tests__/useMapStoragePersistence.test.tsx src/hooks/__tests__/useMapPersistence.test.tsx src/components/map/__tests__/MapEditor.test.tsx src/components/map/__tests__/MapEditorOutline.test.tsx`。新しい status または options の期待で FAIL。
- [x] **Step 3: 最小実装。** `deriveMapSaveStatus` へ現在 snapshot、初期基準、confirmed baseline を渡す。復元直後の render では `restoreOrigin === "restored"` の `initialPersistedSnapshot` を確認済み基準として使い、初回 layout effect の ref 初期化を待って誤表示しない。タイマー・flush は同じ結果処理を通すが、タイマーの closure は書込対象の snapshot、flush はコミット後の `currentSnapshotRef.current` を使う。成功時、書いた内容と現在内容が異なれば `pending` を保つ。失敗後に既知基準へ戻った時だけ失敗通知を解除し、仮基準への復帰では `failed` を維持する。失敗しただけで新規タイマーを張らない。旧 `inactive` は `unchanged` のまま、成功扱いしない。さらに必須 `storageMode` を `Home` → `MapEditor` → `useMapPersistence` → `useMapStoragePersistence` へ通し、`saveStatus` を `useMapPersistence` の返り値まで通す。
- [x] **Step 4: GREEN 確認。** Step 2 と同じコマンド、および `cd client && npm run typecheck` が PASS。既存の `flushPendingSave` 関数同一性テストも PASS。

### Task 3: ヘッダー表示と実 `Home` 結合確認

**Files:** Create `client/src/components/layout/MapSaveStatus.tsx`, `client/src/components/layout/__tests__/MapSaveStatus.test.tsx`; Modify `client/src/components/layout/AppHeader.tsx`, `client/src/components/layout/__tests__/AppHeader.test.tsx`, `client/src/components/map/MapEditor.tsx`, `client/src/app/__tests__/pageMapLibrarySwitch.test.tsx`、`client/src/app/__tests__/pageMapLibrary.test.tsx`（既存テスト拡張）。

**Interfaces:**
- Consumes Task 2 の `useMapPersistence(...): { exportJson; importJsonFile; notice; saveStatus }` と `Home` → `MapEditor` の必須 `storageMode` 配線。
- `MapSaveStatus({ status }: { status: MapSaveStatus })` は順に `保存状態を確認中`, `保存済み`, `保存前`, `復元できませんでした`, `保存待ち`, `保存失敗`, `ブラウザへ保存できません` を表示する。要素は単一 `role="status" aria-live="polite"` と `aria-label="保存状態: <表示文言>"` を持ち、`role="alert"` は持たない。`AppHeader` の `saveStatus: MapSaveStatus` を必須とし、`mapControls` の直後、通知の全幅行より前に描画。

- [x] **Step 1: RED テストを追加。** 全7文言と status/aria、通知が null でもヘッダー通常行で表示、失敗通知 `alert` との二重 alert 回避を確認。`MapEditor` から `AppHeader` への伝達を確認。実 `Home` 結合テストでは本体のある A→B→A 切替で表示が各復元結果に戻ること、新規 empty が `保存前`、実 `view.storageMode="protected"` の画面で `ブラウザへ保存できません` を確認。既存 test helper による本物の `Home`/`MapEditor`/ヘッダー経由にする。
- [x] **Step 2: RED 確認。** `cd client && npm test -- --runInBand src/components/layout/__tests__/MapSaveStatus.test.tsx src/components/layout/__tests__/AppHeader.test.tsx src/app/__tests__/pageMapLibrarySwitch.test.tsx src/app/__tests__/pageMapLibrary.test.tsx`。新しい表示の期待で FAIL。
- [x] **Step 3: 最小実装。** Task 2 の `persistence.saveStatus` を `MapEditor` から `AppHeader` へ渡し、状態要素を追加。`operationNotices` の全幅行には入れず、JSON救出文は既存通知に残す。既存の `AppHeader` 直接描画テスト全件で必須 `saveStatus` props の型エラーを解消する。
- [x] **Step 4: GREEN 確認。** Step 2 のコマンドに加え `cd client && npm run typecheck` が PASS。

### Task 4: ドキュメント、ロードマップ、最終検証

**Files:** Modify `README.md`, `client/README.md`, `docs/README.md`, `docs/architecture/overview.md`, `docs/specifications/features.md`, `docs/specifications/data-model.md`, `docs/specifications/api.md`, `docs/testing/browser-test-cases.md`, `ROADMAP.md` のうち保存状態の説明に関係する箇所。該当箇所がなければそのファイルに無関係な文を増やさない。

**Interfaces:** Consumes Tasks 1–3 の実装済み UI 文言・状態遷移。Produces 実装と一致した仕様記述、手動確認ケース、更新済み ROADMAP。コード API は増やさない。

- [x] **Step 1: 現行文書の該当記述を確認。** `rg -n '自動保存|保存状態|保存失敗|Phase 16|候補006|最終更新|現在地' README.md client/README.md docs ROADMAP.md`。保存対象がマップ本体である点と既存の保存通知との差を記録する。
- [x] **Step 2: 文書を更新。** 実際に実装した7状態、300ms待ち、同期 I/O、失敗時の JSON 救出、保護モード、同一 snapshot 強制要求、V1移行、`inactive` の制約を関係する文書に反映。`docs/testing/browser-test-cases.md` に実ブラウザで確認できる初期・編集・保存失敗・復帰・切替・狭幅・読み上げのケースを追加する。実施できたものだけ結果を記す。既知の観測拒否を迂回せず、未確認は未確認と明記する。
- [x] **Step 3: ROADMAP を更新。** 候補006だけ `[x]`、Phase 16 は進行中、次の未完了は候補007。現在地に完了した保存状態表示と進行中 Phase 16 を追記し、「最終更新」を `2026-11-04` にする。未実装の007/008/015は `[ ]` のまま。
- [x] **Step 4: 検証。** `cd client && npm run verify` が全段階 PASS。`git diff --check` も PASS。テスト成功とブラウザでの実施・未実施を区別して報告する。

## 実行・レビュー手順

各 Task の本文、Global Constraints、必要な先行 Task の Interfaces だけを新しい実装サブエージェントへ渡す。Task 完了ごとに実装者とは別のサブエージェントで仕様適合レビュー、続けてコード品質レビューを行い、指摘は同じ実装者へ戻して修正・再レビューする。複数 Task を同時に走らせない。実装タスクではコミットしない。Task 4 と最終レビューを通過した後、dev-flow-kit の後続 `refactor-srp`、`review-loop`、`commit-ja` へ進む。
