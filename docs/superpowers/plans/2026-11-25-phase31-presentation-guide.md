# Phase 31（072/073）: プレゼンテーションと案内 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/phase31-presentation-guide`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** マップ文書のツアー（`MapViewSnapshot` ステップ列＋任意キャプション）を編集・再生できるようにし、072 プレゼンモードと 073 案内付き閲覧を 1 PR で届ける。

**Architecture:** 文書級 `tour?: MapTour`。編集は Undo 付き文書変更。再生はメモリ状態＋ Phase 21 snapshot 適用（`recordNavigation: false`）。`editorShortcutsEnabled` に再生／編集ダイアログを積む。

**Tech Stack:** React, TypeScript, Jest, 既存 MapViewSnapshot / useMapViewNavigation

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-25-phase31-presentation-guide-design.md`
- V3 のまま。ノード任意属性を増やさない（L-825）。`NodeMapState.tour` のみ
- L-061 inventory 必須（Phase 28–30 同型の入口表。`useNodes` 公開面・コマンドパレット・保護／競合／関連線／グループ／ラベル編集／アウトラインをクロス）。再生中は編集・取込・閲覧履歴・ブックマーク・**アウトライン行編集**・**ツアー編集**を塞ぐ
- **再生中の inert 方針**: ダイアログ系（`tourEditor`）は従来どおり根 `inert`。**再生中（`presentation.screen === "playing"`）は根に `inert` を付けない**（パン・ズーム・再生バー操作を可とする）。編集ショートカットだけを止める（`editorShortcutsEnabled` 相当の編集キーを再生中 false、または再生専用の編集ブロック）。再生バーはマップ UI 上で操作可能
- 再生の snapshot 適用は閲覧履歴に載せない。`applyView(snapshot)` の **第2引数 `beforeChange` に `recordNavigation` を渡さない**（ブックマーク適用との対比をテストで固定）。ツアー編集のみ Undo（再生ページ送りは Undo 対象外）
- 保護中: ツアー編集不可・再生可
- TDD。コミットしない。日本語 UI。`cd client && npm run verify`
- 知見: L-061, L-203, L-825
- ROADMAP 072/073 を完了。§3.2 マトリクスどおり引き継ぎ

---

### Task 0: L-061 inventory

**Files:** Create `docs/superpowers/specs/2026-11-25-phase31-presentation-guide-inventory.md`

- Phase 28–30 inventory を参照し、同型の入口表を作る（`COMMAND_CATALOG` / `useNodes` 公開・保護／競合／関連線／グループ／ラベル編集／アウトライン）
- 設計 §5.1 / §6 の新入口＋再生中に塞ぐ既存入口（アウトライン行編集・ツアー編集入口含む）を機械列挙
- `presentation.screen` / `tourEditor.screen`、再生中は根 inert なし・編集ショートカットのみ停止、を明記
- テスト所有者: 編集＝Task3、再生＝Task4（**再生中のツアー編集不可**は Task4 で RED/GREEN）

- [x] inventory 作成

---

### Task 1: 型・codec・投影・equal

**Files:**
- Create: `client/src/types/mapTour.ts`
- Modify: `client/src/types/nodeMapState.ts`（`tour?: MapTour`）
- Modify: `mapDocumentDecoder` / encoder、**`mapDocumentState.ts`**（`nodeMapStateFromDocument` / `mapDocumentOptionsFromState`）、**`createMapDocument`** の options
- Modify: **`mapHistory.ts` の `areMapStatesEqual`** と **`mapConflict.ts` の `isDocumentContentEqual`** の双方に `tour` 比較
- Tests: 下記 RED/GREEN

**Interfaces:**
```ts
// 設計 §3.1 MapTour / MapTourStep
// encode: steps.length===0 なら tour キーなし
// decode: version/title 不正→tour削除; 不正ステップ除外; caption不正→caption無しで残す;
//         51件超は先頭50; 残0→tour削除
```

- [x] RED/GREEN: 往復・0 steps 欠落
- [x] RED/GREEN: 不正 tour 全体削除／不正ステップ個別除外／caption 不正でもステップ残存／51→50
- [x] RED/GREEN: 不正 JSON でもマップは開く
- [x] RED/GREEN: `areMapStatesEqual` と `isDocumentContentEqual` の双方が tour 差分を検出
- [x] RED/GREEN: 投影（document↔state）で tour が落ちない

---

### Task 2: ツアー編集 domain / hooks

**Files:**
- Create: domain helpers（タイトル正規化、ステップ CRUD・並べ替え・snapshot 上書き、caption）
- Modify: `useNodes`（または専用 hook）で tour 更新を 1 Undo の文書変更に載せる
- §3.2「含めない」: **別名保存**・**新規作成**・**テンプレから新規**・**枝切り出し別マップ**で tour を落とす（シリアライズ／options で明示）

- [x] RED/GREEN: 追加／並べ替え／削除／上書き／caption・Undo 1 回
- [x] RED/GREEN: 別名保存・**新規マップ作成**・テンプレ新規・枝切り出し後の新文書に tour が無い

---

### Task 3: ツアー編集 UI

**Files:**
- Create: `TourEditorControl` / Dialog
- Modify: `MapEditor` — `tourEditor.screen` を積に追加、保護中は編集 disabled
- Task0 編集入口の代表テスト

- [x] RED/GREEN: 編集 UI・保護中 disabled・ダイアログ中 inert／積
- [x] RED/GREEN: Task0 編集代表経路

---

### Task 4: 再生モード

**Files:**
- Create: `usePresentationPlayback`（開始前 snapshot 保持、index、前後、終了、Escape）
- Modify: `applyView(snapshot)` のみ（第2引数なし／履歴登録しない）。ブックマーク適用との差分をテストで固定
- Create: 再生バー UI（1/N・戻る・次へ・終了・caption）。**根 inert の外または再生中は inert なし**で操作可
- Modify: `MapEditor` — `presentation.screen`、再生中は根 inert なし・編集ショートカット停止、左右矢印
- 再生中 disabled: 閲覧戻る／進む・ブックマーク・**アウトライン行編集**・構造編集・取込・**ツアー編集入口**
- steps 0 件では再生開始 disabled。先頭／末尾で前後ボタン disabled

- [x] RED/GREEN: 開始で先頭適用・前後・Escape/終了で開始前復元・閲覧履歴に積まない（`applyView` 第2引数なし）
- [x] RED/GREEN: 再生ページ送り後の Undo は表示を巻き戻さない（編集 Undo のみ）
- [x] RED/GREEN: caption 表示／空は非表示
- [x] RED/GREEN: steps0・端ボタン・保護中再生可・再生中パン可（inert なし）
- [x] RED/GREEN: 再生中編集・取込・ブックマーク・閲覧履歴・アウトライン編集・**ツアー編集**が無効
- [x] RED/GREEN: Task0 再生代表経路
- [x] RED/GREEN: ステップ追加→保存→再読込→再生で順序・キャプション一致（統合）

---

### Task 5: docs・ROADMAP・verify

**Files:** features / data-model / overview / api、`nodeMapState.ts` 型コメント、inventory docs 節、`ROADMAP.md`（072/073 `[x]`、現在地・最終更新）、`npm run verify`

- [x] L-203 同期
- [x] verify 成功

## プランレビュー後の記録

- feature-plan 第1周 Blocking: 投影層・equal双方・§3.2含めない経路・アウトライン・§7統合・再生Undo非対象・decode詳細・再生UX端点 — 反映。
- feature-plan 第2周 Blocking: 再生中 inert 方針・inventory 深度・再生×ツアー編集テスト割当・新規作成テスト・applyView 契約 — 反映。
