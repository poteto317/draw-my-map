# 検索候補更新時のスクロール追従 修正計画

**Goal:** 選択IDが同じでも候補更新で表示位置が変わったら、選択候補を一覧内に表示する。
**Spec:** `docs/superpowers/specs/2026-10-14-phase10-node-search-design.md` の「選択中の候補はscrollIntoViewで見える位置へ動かす」。

## Global Constraints

- 既存worktree `codex/phase10-node-search`でサブエージェント実装、独立レビュー。
- 既存未コミット変更を保持。stage/commit/push禁止。
- 検索規則、選択IDの保持、Enter対象、開閉、IME、フォーカス、DOM/CSSを変えない。
- テストを先に追加し、修正前の実コードでRED、修正後GREENを確認。
- `client`で`npm run verify`成功まで確認。

## Task 1: 候補更新後の選択位置へスクロール

**Files:** `client/src/components/layout/NodeSearchBox.tsx`、`client/src/components/layout/__tests__/NodeSearchBox.test.tsx`。
**Interface:** 公開props変更なし。候補リスト変更時にも現在のactiveDescendantを表示する。閉じた一覧/候補なしではスクロール不要。

- [x] 同じ選択IDが候補追加・並べ替えで後方へ移るrerenderを作り、実コンポーネントがそのoptionにscrollIntoView({block:'nearest'})を再実行することをテストする。callbackの呼び先IDも維持を確認。
- [x] 一覧を閉じた後の候補更新、空一覧への更新でスクロールしないことも保護する。
- [x] 新規回帰テストが既存コードで失敗することを確認しログ保存。
- [x] 選択候補の表示位置を変えうる候補更新をeffectへ反映する最小修正。新しい状態やDOM構造は導入しない。
- [x] 関連テストとnpm run verifyを実行。ROADMAPの新しい完了項目は増えないため整合確認のみ。
- [x] 実装者とは別のサブエージェントで仕様・品質レビュー。全差分レビューを再開。
