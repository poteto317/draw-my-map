# 枝の切り取り・移動 レビュー指摘の修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` でタスクを1つずつ実装し、別担当のレビュー後に次へ進む。

**Goal:** Phase 14 候補016「枝の切り取り・移動」のローカルレビュー第5周の指摘9件を直す。動作の変更は空のラベルの表示（指摘6）だけで、残りは文書とテストの修正。

**Architecture:** テストの追加（Task 1・2）、表示の修正（Task 3）、文書の修正（Task 4・5）の順に進める。指摘の全文は `.claude/dev-flow/branch-move-review5-findings.md`（git 管理外）にある。

**Tech Stack:** TypeScript、React 19、Next.js 16、Pixi.js 8、Jest 30（jsdom）、Testing Library。追加依存なし。

## 照合の結果

マージ後のコード（`19c7b2b`）で全指摘を確かめた。9件とも前提は成り立つ。次の2件は範囲を補う。

- 指摘6: features.md 17.1 節に「（名前なし）」の文字列は無く、「同じ表示名（名前なしを含む）」の表現がある。ここを実装に合わせる。
- 指摘7: `branchMoveTransaction.ts` のほか `mapBranchTransfer.ts:23`（`readBranchMoveIndex`）も注入された storage を直接読むので、例外の記述に含める。`mapStorage.ts` は既存の旧キーの補助で `mapLibraryStorage.ts` からだけ使われ、今回の指摘の範囲外なので触らない。

## Global Constraints

- 作業場所は `.claude/worktrees/admiring-nash-be82d3`。ブランチを切り替えない。worktree を作らない。push しない。`git stash` を使わない。
- 指摘6以外で本体のコード（テスト以外の `client/src`）を変えない。既存のテストの期待値は、タスクに書いたもの以外変えない。
- 文書は既存の文体（ですます調の日本語、または各文書の語調）に合わせる。行番号は目安なので、内容で探す。
- テストの名前は日本語で、確かめている挙動を書く。テストは既存のファイルへ追記する。既存のファイルの密度と書き方に合わせる。
- **変異の確認。** 追加・強化したテストは、対象の本体を1か所壊すと落ちることを確かめる。手順: 本体を `cp` で一時ディレクトリへ控える → 1か所壊す → 関連テストを実行して落ちることを確かめる → 控えから `cp` で戻し `diff` で一致を確かめる。全件通ったらテストを直す。結果（変異の内容と落ちたテスト名）を報告に書く。
- 各タスクの終わりに、コードを変えたタスクは `client` で `npm run typecheck`、変更したファイルへの `npx eslint <files>`（エラー・警告とも0件）、関連する `npx jest <path>` を通す。
- 各タスクの終わりに Conventional Commits 形式の日本語のメッセージでコミットする。本文の末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける。
- 実装のコメントは既存の密度と語調に合わせる。

---

## Task 1: ドメインと永続化のテストを強める（指摘3・4、指摘9の M19・M35）

**Files:**
- `client/src/domain/nodes/__tests__/nodeBranchMove.test.ts`
- `client/src/services/persistence/__tests__/branchMoveTransaction.test.ts`
- `client/src/services/persistence/__tests__/mapBranchTransfer.test.ts`

- [ ] 指摘3: 「非連続の枝を任意の親の最後へ移し…」のテストに、根の座標の検証を足す。親の右、既存の子の下という indent 配置の結果を、`nodeIndentPlacement.ts` の `calculateIndentTranslation` の規則から手で導いた数値リテラルで書き、子の絶対座標も確かめる。テスト内で `calculateIndentTranslation` を呼んで期待値を作らない。
- [ ] 指摘3: 「ルートへ移す枝を…」のテストに、`root.x` が移動前の 300 のままである検証を足す。
- [ ] 指摘4: `it.each([SOURCE, TARGET, INDEX, JOURNAL])` を分ける。JOURNAL のケースは `{ ok: false, error: RECOVERY_ERROR, recoveryRequired: true }` を、SOURCE・TARGET・INDEX のケースは `recoveryRequired: false` を含む結果を `toEqual` で確かめる。どちらも `operations` が空であることは保つ。
- [ ] 指摘9 M19: `writeBranchMove` の書く前のジャーナルの自己検査（`decodeBranchMoveJournal(raw) === null`）のテストを足す。保存領域と入力の `indexBefore` を同じ壊れた文字列にして原本の照合を通し、書き込みの操作が0件で、`recoveryRequired: false` の失敗を返すことを確かめる。
- [ ] 指摘9 M35: `mapBranchTransfer.test.ts` の「未作成本体を空として扱い…」のテストに、移動先の `layoutMode` が `"manual"` である検証を足す。
- [ ] 変異の確認: (a) 平行移動を無くす（dx=0, dy=0）、(b) ルートへの移動で x をずらす、(c) 既存ジャーナルの `recoveryRequired` を false にする、(d) 自己検査を外す、(e) 未作成の移動先の layoutMode を auto にする。
- [ ] コミット: `test(map): 枝の移動の座標と復旧の要否の検証を強める`

## Task 2: セッションの再確認とメニューの押下の無視のテストを足す（指摘9の M3・M24）

**Files:**
- `client/src/hooks/__tests__/useMapLibraryBranchMove.test.tsx`
- `client/src/components/map/__tests__/MapStageContextMenu.test.tsx`（既存の配線で確かめられないなら `MapStage.test.tsx`）

- [ ] 指摘9 M3: flush の中で A→B→A と切り替わる場合に、移動が拒否され、本体が変わらないことのテストを足す。`old.registerFlush` の中で `switchMap` を呼ぶと切り替えの flush で再入するので、一度だけ実行する印を使う。既存の「%sの呼び出しを保存せず拒否する」の ABA は flush の前に切り替えているので別のケースである。
- [ ] 指摘9 M24: コンテキストメニューの項目を押した直後（500ms 以内）のキャンバスの押下が無視され、500ms を過ぎた押下は無視されないことのテストを足す。`MapStage.tsx` の `shouldIgnorePointerDown: isOverlayFollowUpClick` の配線と、`mousedown` の既定の動作の抑止を確かめる。時刻は既存のテストの書き方に合わせて差し替える。
- [ ] 変異の確認: (a) flush 後の `isActiveBranchMoveSource(current, sourceSession)` を mode の判定だけにする、(b) `isOverlayFollowUpClick` の押下の経路からメニューの時間窓を外す（`menuActivatedAtRef` の判定を外す）。
- [ ] コミット: `test(map): flush 中の切り替えとメニュー直後の押下のテストを足す`

## Task 3: 親の候補の空のラベルをキャンバスに揃える（指摘6）

**Files:**
- `client/src/components/layout/branchMoveParentOption.ts`
- `client/src/components/layout/__tests__/branchMoveParentOption.test.ts`
- `docs/specifications/features.md`（17.1 節）

- [ ] RED: テストの期待値「（名前なし）（親: A）」「（名前なし）（ルート）」を「新しいノード（親: A）」「新しいノード（ルート）」へ変え、失敗を確かめる。
- [ ] `displayName` を `getNodeDisplayLabel`（`@/domain/nodes/nodeDisplayLabel`）に置き換える。`displayName` の関数は残さず直接使う。`BranchMoveParentNode` からラベルを取り出す形は既存の書き方に合わせる。
- [ ] 親のラベルが空の同名の候補と、ラベルが実際に「新しいノード」の候補が同名として見分けられることのテストを足す。
- [ ] features.md 17.1 節の「同じ表示名（名前なしを含む）」を、空のラベルはキャンバスと同じ「新しいノード」で表示する内容へ書き換える。
- [ ] コミット: `fix(map): 枝の移動の親の候補の空のラベルをキャンバスの表示に揃える`

## Task 4: 押下の無視の矛盾と設計書を直す（指摘1・2）

**Files:**
- `docs/specifications/features.md`（12.7 節付近の1068行、13章の1241行）
- `docs/testing/browser-test-cases.md`（O-14 の1231行、P-11 の1320行）
- `docs/superpowers/specs/2026-10-31-branch-move-design.md`

- [ ] 指摘1: 4か所の「2回目の押下はキャンバスへ届き、選択が変わる」という内容を、500ms 以内の押下は無視され選択は変わらない内容へ書き換える。OS のダブルクリックの間隔が 500ms より長いときの注意だけ残す。P-11 の備考の「(4) で選択された『A』の選択も外れることがある」も直す。ボタンの種類による例外（右ボタンのメニューは開く）は 620行と同じ扱いにする。同じ矛盾が他の節に無いことを `grep` で確かめ、見つけたら直す。
- [ ] 指摘2: 設計書へ次を反映する。
  - 19行付近: 補正が要るインデックス（補正待ち）でも移動でき、`indexBefore` に原文を残し、成功時は補正済みを書く。
  - 20行: 残ったノードは移動元の layoutMode で配置する（移動先の枝は移動先の layoutMode）。
  - 24行付近: ジャーナルの読み取り（`getItem`）の例外は `unavailable` にし、warning の通知と生成 id の保護モードで開く。
  - 30行付近: 閉じた直後の `pointerdown` と `mousedown` の既定の動作も無視する。
  - 30行付近: 保護モードへ移った後のフォーカスは features.md 17.5 節に揃える（「マップ一覧」が無効なら「JSON書き出し」）。
  - 実際の規則は data-model.md 5.11 節、features.md 17.3〜17.5 節、`branchMoveTransaction.ts` の `recoverBranchMove` で確かめ、書き写す前に一致を確認する。
- [ ] コミット: `docs: 押下の無視の既知の挙動と枝の移動の設計書を実装に合わせる`

## Task 5: 概要・規則・ロードマップの文書を直す（指摘5・7・8）

**Files:**
- `docs/architecture/overview.md`
- `docs/development/developer-guide.md`
- `client/README.md`
- `docs/specifications/features.md`（1.2 節）
- `ROADMAP.md`

- [ ] 指摘5: overview.md の `services/persistence/` を 10 ファイル、`domain/nodes/` を 40 ファイルへ直す。節の合計（21・77）と合うことを確かめる。
- [ ] 指摘5: `key={mapId}` の記述（157行・603行・658行付近）を `page.tsx` の `` key={`${id}:${storageMode}`} `` の内容へ直す。保護モードへの移行でも作り直すことが分かるように書く。
- [ ] 指摘5: `editorShortcutsEnabled` の式の記述（157行・643行・687行付近）を、`branchMove.screen === "closed"` を含む現在の条件へ直す。157行に `useBranchMoveDialog` の配線を足す。
- [ ] 指摘5: `useMapLibrary.ts`（`moveBranchToMap`）、`mapLibraryState.ts`、`mapLibraryStartupRunner.ts`、`useReannouncedNotice.ts` の利用者一覧、`AppHeader.tsx` の項目へ今回の追加を足す。足す内容はコードで確かめる。
- [ ] 指摘5: 158行付近と603行付近の説明へ、`dblclick` に加えて押下を無視すること（`shouldIgnorePointerDown`、`mousedown` の既定の動作）を足す。
- [ ] 指摘7: 次の箇所へ、ジャーナルの書き込みと復旧は途中で継続する手順があるので `branchMoveTransaction.ts` も、移動の前の補正待ちのインデックスの読み取りは `mapBranchTransfer.ts` の `readBranchMoveIndex` も、注入された storage を直接呼ぶ、という例外を書く: developer-guide.md 90行・181〜183行、overview.md 222行・653行、client/README.md 32行・89行。
- [ ] 指摘8: features.md 1.2 節のヘッダーの図の `[枝を複製]` の右へ `[枝を移動]` を足す。
- [ ] 指摘8: ROADMAP.md 13行の文書の範囲を「枝の切り取り・移動まで」へ直す。「現在地」「最終更新」に変更が要らないことを確かめる。候補017は未完了のまま。
- [ ] `client` で `npm run verify` を通す。
- [ ] コミット: `docs: 枝の移動の追加を概要・開発者ガイド・ロードマップへ反映する`
