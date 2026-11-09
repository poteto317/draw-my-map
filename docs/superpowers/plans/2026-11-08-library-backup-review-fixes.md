# 一括バックアップの画面をまたぐキー操作の修正

> 実装は superpowers:subagent-driven-development を使い1タスクずつ進め、別担当が仕様適合・品質を確認する。コミットは後続 commit-ja まで行わない。

**Goal:** バックアップ/復元の起点とキャンセルでもキーリピートとIME確定を抑止し、フォーカス移動後の意図しない再操作を防ぐ。
**Architecture:** 新操作ボタンに共通の純粋なkeydownガードを適用し、確認画面/読込中/一覧の入力規則を揃える。保存処理や既存入力フォームは変更しない。
**Tech Stack:** React / TypeScript / Jest。
**Spec:** docs/superpowers/specs/2026-11-05-library-backup-design.md

## Global Constraints

- Enter/Space の repeat、isComposing、keyCode 229 は preventDefault する。次の正常clickを捨てる永続フラグは使わない。
- 通常の単発Enter/Space、マウス/支援技術clickは動作する。既存名前入力フォームの通常Enter、Escape、フォーカストラップ、マウスdetail>1 captureは維持。
- ファイル形式・上限・保存/復旧・現在editor保持・通知は変えない。追加依存を入れない。
- ブラウザ操作を行わず、手動確認は未実施とする。TDD RED→GREEN、対象テスト・typecheck・lint・全verify成功。実装者はコミット/push/子エージェント起動をしない。

### Task 1: 起点とキャンセルのキー抑止を揃える

**Files:** Modify client/src/components/layout/MapLibraryConfirmActions.tsx、MapLibraryListScreen.tsx、MapLibraryDialog.tsx と対応 __tests__。必要なら同階層に小さな共通keydownガードを作成。実dialog stateとの結合テストを対応するテストへ追加。docs/testing/browser-test-cases.md Y-07を補足。
**Interfaces:** ボタンのkeydownでEnter/Spaceのrepeat/IMEを防ぐ共通関数。新規バックアップ/復元の2起点、確認のキャンセル/確定、読込中キャンセルへ適用。

- [ ] 元指摘 .claude/dev-flow/local-review-round1.md R1 を読み、全対象ボタンのkeydown defaultPrevented回帰を追加してRED確認。
- [ ] 通常入口→確認cancel既定focus→残りrepeat抑止、通常cancel/成功→起点focus→repeat抑止を実dialog stateとの結合で固定。キャンセルされたkeydownから人工clickを生成せず、抑止後の正常click/単発キーが動作することも検査。
- [ ] 最小修正で共通ガードを適用。対象テスト、typecheck、lint、client/npm run verify、git diff --checkを成功させる。
- [ ] Y-07の入口からの長押し/成功後/Spaceを明記し未実施表記を維持。ROADMAPの007完了/次008/015未完了/最終更新を実装と照合し必要な場合だけ更新。
