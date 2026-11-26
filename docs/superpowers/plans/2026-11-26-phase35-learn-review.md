# Phase 35（088/089）: 学習と復習 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/phase35-learn-review`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** 学習モードでラベル穴埋め（088）と、親子・メモから生成した復習カード（089）を 1 PR で届ける。開示済み ID とカードは文書級 `learn` に永続化する。

**Architecture:** `NodeMapState.learn?: MapLearnState`。学習モードの UI フラグはメモリのみ。開示・リセット・カード生成は文書級フィールドのため **`applyStateChange`（`useMapTourActions` 同型。専用 `useMapLearnActions` 可）** で各 1 Undo。描画は実ラベル幅を保ったプレースホルダ。プレゼン再生と相互排他。

**Tech Stack:** React, TypeScript, Jest, 既存 `indexNodeForest` / commandCatalog / presentation guards

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-26-phase35-learn-review-design.md`（決めたこと・§3〜9）
- V3 のまま。ノード任意属性を増やさない（L-825）。`learn` のみ
- L-061 inventory 必須（§7.1）。学習中は構造編集・ラベル編集・取込・AI・統合を塞ぐ。プレゼン中は学習開始不可（逆も同様）
- 穴埋めプレースホルダは **学習モード中かつ未開示** のみ。通常時は実ラベル
- カード生成は学習モード中のみ・決定的・最大 50・メモ/親子 501 文字超はスキップ。0 件なら文書・Undo 不変（L-001）
- 保護: 開始・開示・カード閲覧可。リセット・生成不可
- TDD。コミットしない。日本語 UI。最終 `cd client && npm run verify`
- 知見: L-001, L-003, L-048, L-060, L-061, L-166, L-203, L-453, L-825
- ROADMAP 088/089 完了。§3.2 引き継ぎは tour 同型

## 今回パック

`20261126-1718-draw-my-map`: L-001・L-003・L-048・L-060・L-061・L-166・L-453・L-825（＋計画で L-203）

## Review Focus

1. 学習モード外でプレースホルダが出ないこと
2. 実ラベル幅維持（レイアウトジャンプなし）
3. プレゼン相互排他と学習中の編集ロック（inventory 全入口）
4. カード 0 件生成が Undo を増やさないこと
5. 別名保存・新規で `learn` がコピーされないこと

---

### Task 0: L-061 inventory

**Files:** Create `docs/superpowers/specs/2026-11-26-phase35-learn-review-inventory.md`

- Phase 28–31 inventory（`phase31-presentation-guide-inventory.md` 等）を参照し同型。設計 §7.1 の正本ファイル名に従う
- §0: `learningActive`（メモリ）と **`presentationPlayback.screen`**（`usePresentationPlayback`）の相互排他、`editorShortcutsEnabled` 積への追加（学習中は編集系キー停止。Phase 31 の再生積と同型で追記）
- 新入口: learn-start/end/reset/generate-cards/open-cards、ツールバー、カードパネル
- 学習中に塞ぐ既存入口（構造編集・ラベル編集・取込・AI・統合・プレゼン開始）と設計 §6 を行単位で突合
- テスト所有者: モードガード＝Task2、カード UI＝Task3。代表経路（保護・競合・関連線・グループ・ラベル編集中・アウトライン）は Task2/3 で RED/GREEN

- [x] inventory 作成

---

### Task 1: 型・codec・equal

**Files:**
- Create: `client/src/types/mapLearn.ts`（`MapLearnState` / `MapReviewCard`、`normalizeLearn` / `projectLearn` / `areMapLearnsEqual`）
- Modify: `client/src/types/nodeMapState.ts`
- Modify: `mapDocumentDecoder.ts` / `mapDocumentEncoder.ts`、`client/src/domain/persistence/mapDocumentState.ts`（`nodeMapStateFromDocument` / `mapDocumentOptionsFromState` / **`mapDocumentOptionsForNewMap`**（`Omit<..., "learn">` を tour 同型で拡張）/ **`omitLearnFromMapDocument`**）。**`MapDocumentStateFields` / `MapDocumentOptions` の `Pick<>` に `learn` を追加**
- Modify: `createMapDocument`（`mapDocumentEncoder.ts`）、**`extractStoredBranch`**（`services/persistence/mapBranchExtract.ts`・枝切り出し新文書は `mapDocumentOptionsForNewMap` 経由で learn なし）
- Modify: **`hooks/useNodeLayoutState.ts`** — `getCurrentState` / return に `learn` を tour と同様に露出（L-453 の読み取り正本）
- Modify: `hooks/useMapLibrary.ts` — テンプレ書き出しは `omitLearnFromMapDocument`（`omitTourFromMapDocument` 同型）
- Modify: **`mapHistory.ts` の `areMapStatesEqual`** と **`mapConflict.ts` の `isDocumentContentEqual`** の双方
- Tests: `mapLearn.test.ts`、`mapDocumentCodec.test.ts`、`mapDocumentState.test.ts`（tour 投影テスト同型）

**Interfaces:**
```ts
// 設計 §3.1
// encode: cards 無しかつ revealedNodeIds が空 → projectLearn は {}（learn キー省略。tour の 0 steps 同型）
//         それ以外 → version + revealedNodeIds（空配列可）+ cards あり時のみ cards
//         cards 正規化後 0 件なら cards キーなし
// decode: version 不正→learn 削除; 不正カード除外; 100超→先頭100; 残0 cards→キーなし; revealed 欠落・[] は同等
// equal: revealed は数値昇順ソート後の集合比較; cards は保存順の配列比較（設計 §6）
```

- [ ] RED/GREEN: 往復・null 欠落同等・不正 learn 削除でもマップ開く
- [ ] RED/GREEN: revealed のみ／cards のみ／両方／完全空の projectLearn
- [ ] RED/GREEN: `areMapStatesEqual` と `isDocumentContentEqual` の双方が learn 差分を検出
- [ ] RED/GREEN: document↔state 投影で learn が落ちない
- [ ] RED/GREEN: 別名保存・新規・テンプレ・枝切り出しで learn なし（options + omit シリアライズ）

---

### Task 2: 学習モード（088）

**Files:**
- Create: `domain/map/mapLearnMode.ts`（開示追加・リセット・表示ラベル解決 `resolveLearnLabelDisplay`）
- Create: `domain/map/mapLearnGuards.ts`（L-061 共通ガード。モード・保護・プレゼン・選択。操作ごとにコピーしない）
- Create: `hooks/useMapLearnMode.ts`（learningActive、start/end、相互排他）
- Create: **`hooks/useMapLearnActions.ts`**（開示・リセット・カード置換。`useMapTourActions` と同型に **`applyStateChangeRaw`** を受け取る）— 任意だが推奨
- Modify: `useNodes`（reveal / resetProgress / cards 置換を公開。**L-001** `LearnMutationOutcome`（`TourMutationOutcome` 同型）+ **L-453** `getCurrentState` → 単一 `applyStateChange` で確定）
- Modify: `renderMapNodes` / **`OutlineEditor`**（ラベル表示行）/ `MapEditor` — `learningActive` + `revealedNodeIds` 必須 props（L-060）、`editorShortcutsEnabled` 積
- Modify: commandCatalog / toolbar / availability（inventory 全 learn コマンド）
- Tests: domain・hook・page 結合（プレースホルダ／開示 Undo／編集ロック／プレゼン排他／拒否 notice）

**Interfaces:**
```ts
resolveLearnLabelDisplay(node, { learningActive, revealedNodeIds }): { text: string; realLabelForWidth: string }
// 表示 text はプレースホルダ可。幅計測は常に realLabelForWidth（設計 §4.2）
revealNode(state, nodeId): MapLearnState | null // 既開示は null（変更なし）
resetLearnProgress(state): MapLearnState
// useNodes: LearnMutationOutcome { ok: boolean; reason? } — 拒否時は MapEditor の operationNotices + useReannouncedNotice（L-166）。成功時のみ Undo
```

- [ ] RED/GREEN: 学習中のみプレースホルダ、幅は実ラベル（Pixi・アウトライン）
- [ ] RED/GREEN: 学習モード外は実ラベル（`revealedNodeIds` があっても）
- [ ] RED/GREEN: 開示（クリック・**Enter**）1 Undo、リセット確認後 1 Undo、保護でリセット不可
- [ ] RED/GREEN: 学習中構造編集不可、プレゼン中開始不可・学習中プレゼン開始不可
- [ ] RED/GREEN: 拒否理由 notice（未選択・複数選択・プレゼン中・保護・学習外操作。`useReannouncedNotice` / `MapOperationNoticeList` 同型）と学習終了で古い notice 除去（L-166）
- [ ] RED/GREEN: 開示保存→再マウント→学習モード外は実ラベル→学習開始で開示済みだけ実ラベル
- [ ] RED/GREEN: Task0 代表経路（inventory 表の学習モード行）

---

### Task 3: 復習カード（089）

**Files:**
- Create: `domain/map/mapReviewCards.ts`（`generateReviewCards(nodes): readonly MapReviewCard[]`）
- Create: `components/layout/LearnReviewCardsPanel.tsx`
- Modify: useNodes / useMapLearnActions で cards 置換を **`applyStateChange` 1 Undo**（0 件は `ok: false`・文書不変・notice。§7.2）、useMapLearnMode でパネル開閉・表裏めくり（めくりは非 Undo）
- Modify: commandCatalog（`learn-open-cards`）、カードパネル二次ボタン
- Tests: 生成決定性・50 上限・501 スキップ・0 件は文書不変・パネルめくり

**Interfaces:**
```ts
generateReviewCards(nodes: readonly Node[]): readonly MapReviewCard[]
// 走査: 設計 §5.1 — indexNodeForest の roots 配列順 + childrenByParent の配列順で **pre-order**（traverseNodeForest の postOrder は使わない。子スタックの逆順は nodeLayoutForestTraversal と同じ）
// 1周目親子・2周目メモ。同一 sourceNodeIds 集合は1枚
```

- [ ] RED/GREEN: 生成規則（親子文言・メモ文言・深さ優先順・重複 source 除外）・50 上限・501 スキップ
- [ ] RED/GREEN: 同一森林で生成結果が決定的（ゴールデン fixture）
- [ ] RED/GREEN: 学習中のみ生成可、保護で不可、0 件は Undo 増えず notice
- [ ] RED/GREEN: パネル表裏（**Space**・ボタン）・前後（Undo なし）、保護モードで閲覧可
- [ ] RED/GREEN: Task0 カード代表経路

---

### Task 4: docs / ROADMAP / verify

**Files:** ROADMAP.md、features.md、data-model.md、overview.md / api.md（必要分）、`docs/testing/browser-test-cases.md`、inventory docs 節

- [ ] ROADMAP 088/089 [x]、Phase 35 状態・現在地・最終更新
- [ ] L-203 仕様同期（`nodeMapState.ts` 型コメント含む）
- [ ] browser-test-cases に学習モード・復習カードの手動観点を追記
- [ ] `cd client && npm run verify`、`git diff --check`

## 責務別コミット境界（commit-ja 用）

inventory/docs 設計 → learn 型・codec → 学習モード domain/UI → カード → ROADMAP

## プランレビュー後の記録

- feature-plan 第1周 Blocking: learn 空時 encode TBD・投影/omit 経路・L-001 notice テスト・Enter 開示・再読込表示契約・editorShortcuts 積・mapLearnGuards・カード 0 件 outcome・2 パス決定性・browser-test-cases — 反映。
- feature-plan 第2周（タスク整合・知見）: `applyNonStructuralChange`→`applyStateChange`（tour 同型）・`extractStoredBranch` 実名・`presentationPlayback.screen`・`OutlineEditor`・`useNodeLayoutState.learn`・テンプレ omit 経路・pre-order 走査注記 — 反映。
