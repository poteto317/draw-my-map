# ラベル編集の入力欄にアクセシブルな名前を付ける 実装計画

> **実行方法:** `superpowers:subagent-driven-development` で、タスクごとに実装役とレビュー役のサブエージェントを分けて進める。

**Goal:** ノードのラベル編集の入力欄（`NodeLabelEditor` の `<input>`）に、スクリーンリーダーが読むアクセシブルな名前を付ける。

**背景:** 今の入力欄には `aria-label`・`<label>`・`placeholder` が無く、スクリーンリーダーでは名前の無い「テキストフィールド」としか読まれない。入力欄は、ダブルクリック（編集）、`Tab`（子の追加）、`Enter`（兄弟の追加）で開く。

**決めたこと:**
- 名前は `aria-label="ノードのラベル"` の1つに固定する。開いた操作（編集・子の追加・兄弟の追加）によって名前を変えない。理由: 入力欄の役割はどの操作でも「選択中のノードのラベルを入力する」で同じであり、操作ごとの文脈は入力欄の役割ではないため。
- 見た目（`placeholder` など）は変えない。キャンバス上の表示を変えないため。
- `data-testid="node-label-input"` は残す。既存のテスト（17ファイル）が使っているため。

## Global Constraints

- 変えるのは `client/src/components/map/NodeLabelEditor.tsx` の `<input>` に `aria-label` を足すことだけ。確定・取り消し・`autoFocus`・`blur` の挙動は変えない。
- TDD: テストを先に書き、RED を確かめてから実装する。
- 既存のテストの期待値は変えない。
- 各タスクの終わりにコミットする（Conventional Commits 形式、日本語。本文の末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`）。push・PR は作らない。
- 最後に `cd client && npm run verify` を通す。

## Task 1: 入力欄に名前を付ける

**Files:**
- Modify: `client/src/components/map/NodeLabelEditor.tsx`
- Test: `client/src/components/map/__tests__/NodeLabelEditor.test.tsx`（既存。無ければ同じ場所に作る）
- Test: ページの結合テスト1件（既存の `client/src/app/__tests__/` のうち、ダブルクリックや `Tab` でノードを追加して入力欄を開くテストがあるファイルに足す）

- [ ] `NodeLabelEditor.test.tsx` に、`screen.getByRole("textbox", { name: "ノードのラベル" })` で入力欄が取れ、それが `data-testid="node-label-input"` の要素と同じであることを確かめるテストを足す。
- [ ] ページの結合テストに、ノードを追加して開いた入力欄が `getByRole("textbox", { name: "ノードのラベル" })` で取れ、`document.activeElement` と同じであることを確かめるテストを1件足す。
- [ ] RED を確かめる（名前が無いので取れない）。
- [ ] `<input>` に `aria-label="ノードのラベル"` を足す。
- [ ] 関連テストと `cd client && npm run typecheck && npm run lint` を通し、コミットする。

## Task 2: 文書を更新する

**Files:**
- Modify: `docs/specifications/features.md`（3.4 節「エディタ UI とレイアウト追従」、885 行目付近の「各 UI コンポーネントのアクセシビリティ（ARIA 属性）と表示仕様」）
- Modify: `docs/testing/browser-test-cases.md`（ラベル編集を扱う既存の節があればそこに、無ければ適切な節に、VoiceOver で入力欄が「ノードのラベル」と読まれることを確かめるケースを1件足す。結果の集計の件数も直す）
- Modify: `docs/architecture/overview.md`（`NodeLabelEditor.tsx` の説明に名前を足す）

- [ ] 3つの文書を、実装に合わせて更新する。
- [ ] `git diff --check` を通す。
- [ ] `cd client && npm run verify` を通し、コミットする。
- [ ] `ROADMAP.md` に該当する項目が無いことを確かめる（変更しない）。
