# 出典情報（候補054）実装プラン

> **状態:** サブエージェントレビュー 2 周通過・自動承認済み。
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development。このリポジトリでは AGENTS.md によりインライン実行は使わない。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ノードに構造化の出典（タイトル必須・ページ任意・URL 任意）を最大 10 件付け、右パネル「出典」節（リンクの下・イラストの上）で追加・削除できるようにする。V3 保存・Undo/Redo・複製・コピペ・枝移動・分割・統合と整合し、検索・キャンバス印は変えない。

**Architecture:** 正規化・鍵・追加/削除は `domain/nodes/nodeSource.ts`。URL は `normalizeNodeLinkUrl` / `toSafeLinkHref` を再利用。永続化は `mapDocumentNodeSources.ts`、統合は `union`、属性表に `sources` を足す。UI は `NodeSourcesSection`、配線は `useNodes` → `NodeDetailPanel` → `MapEditor`。

**Tech Stack:** Next.js（App Router）、React 19、TypeScript、Jest（jsdom）、Testing Library。

**設計書:** `docs/superpowers/specs/2026-11-18-node-sources-design.md`

**先例:** `docs/superpowers/plans/2026-11-17-node-tags.md` / `2026-11-17-node-links.md` と実装（`nodeTag.ts`・`nodeLink.ts`・`NodeTagsSection`・`NodeLinksSection`）。

## Global Constraints

- 作業ディレクトリ: `/Users/mash/Desktop/draw-my-map/.worktrees/feat-phase18-node-sources`。検証は `client` で `npm test -- <pattern>` / `npm run verify`。
- TDD: テスト先→RED確認→実装→GREEN。現状固定と RED を混ぜない（L-609）。
- **コミットしない**（`/commit-ja` まで）。`git add` もしない。
- `NODE_SOURCES_MAX_COUNT=10`、`NODE_SOURCE_TITLE_MAX_LENGTH=200`、`NODE_SOURCE_PAGE_MAX_LENGTH=80`、`NODE_SOURCE_INPUT_MAX_LENGTH=256`。
- `Node.sources?: readonly NodeSource[]`。`NodeSource={ title: string; page?: string; url?: string }`。無いときキーごと無し。V3 のみ。版上げなし。
- タイトル: trim → empty → 入力先行256 → 空白まとめ → 制御/不可視書式（tags と同集合。ZWJ/VS 許可）→ 長さ200。ページ: 空は無し。同様で上限80。URL: 空は無し、それ以外は `normalizeNodeLinkUrl`（L-018・L-032・L-836）。
- `normalizeNodeSource` の検査順: **タイトル → ページ → URL**。URL 経路の `empty` は「URL 無し」として成功（失敗にしない）。
- 失敗 reason（タイトル/ページ）: `empty-title` | `too-long-title` | `invalid-title` | `too-long-page` | `invalid-page`。URL 失敗は `NodeLinkUrlFailureReason`（`empty` 以外が追加失敗に伝播）。追加全体: 上記 + `node-missing` | `duplicate` | `too-many`。`addNodeSource` の検査順: **node-missing → 正規化 → duplicate → too-many**。
- 重複: `nodeSourceKey`（title は tags と同様の鍵手順 + page 正規化 or "" + url or ""）。`uniqueNodeSources` は**後を捨て先を残す**。
- 削除は **index**。最後の1件でキー除去。
- `areNodeSourcesEqual`: 要素の title/page/url を順比較。**`undefined` と空配列は同値**。
- 履歴: 追加/削除は即時1回。`mapHistory.areNodesEqual` は `sources` を `areNodeSourcesEqual` で比較。
- 統合: union。計画に `sources`・`sourceSourceCount`・`sourceDuplicateCount`。`isSameNodeMergePlan` でもこれらを比べる（L-036）。>10 は `sources-too-many`（tags-too-many の後）。文言「出典をまとめると件数の上限（10 件）を超えるため、統合できません。」。プレビュー: 出典が1件以上のとき「出典: N 件（重複 M 件を除く）」（M=0 なら括弧なし。本文は出さない）。
- 分割 original-only、親挿入 none、複製/コピペ写す。
- パネル順: メモ → タグ → リンク → **出典** → イラスト。フォームは links/tags と同じ（noValidate・IME/repeat・disabled しない・documentRevision で下書きだけ消す・削除後フォーカス・成功で3欄クリア）。ページ表示は常に `p. {page}`。**タイトルが空（ページ/URL だけの送信を含む）のときは何もしない（エラーも出さない）**。
- 範囲外: 検索・キャンバス印・著者/年/引用・書誌マスタ・一括編集。
- 知見: L-001, L-018, L-032, L-036, L-155, L-157, L-408, L-443, L-453, L-454, L-474, L-522, L-588, L-609, L-737, L-825, L-836。
- 部品とフックの接続は DOM イベントで固定（L-737）。
- 返答・コメント・ドキュメントは日本語。

---

### Task 1: ドメイン `nodeSource.ts` と `Node` 型

**Files:**
- Create: `client/src/domain/nodes/nodeSource.ts`
- Create: `client/src/domain/nodes/__tests__/nodeSource.test.ts`
- Modify: `client/src/types/node.ts`（`NodeSource` 型と `sources?`。コメントは Task 6 で整備可）

**Interfaces (Produces `@/domain/nodes/nodeSource`):**
- 定数4つ、`NodeSource`（types）、`normalizeNodeSourceTitle` / `Page` / `Url` / `normalizeNodeSource`
- `nodeSourceKey`、`uniqueNodeSources`、`areNodeSourcesEqual`（`undefined`↔`[]` 同値）、`withNodeSources`
- `AddNodeSourceFailureReason`、`AddNodeSourceResult = { ok:true; nodes: Node[] } | { ok:false; reason }`（**ドメイン**）
- `AddNodeSourceOutcome = { ok:true } | { ok:false; reason }`（**フック用。nodes 無し**）
- `addNodeSource(nodes, id, input): AddNodeSourceResult`、`removeNodeSource(nodes, id, index): Node[] | null`
- `formatNodeSourceFailure(reason: Exclude<…, "empty-title">): string`

- [ ] **Step 1:** 失敗するテスト（定数、title/page/url 境界、入力先行、制御文字、URL 再利用の拒否、duplicate、too-many、remove キー除去、areEqual 同内容別参照と `undefined`↔`[]`、unique 先勝ち、検査順）
- [ ] **Step 2:** RED（`cd client && npx jest src/domain/nodes/__tests__/nodeSource.test.ts`）
- [ ] **Step 3:** `NodeSource` / `sources?` と `nodeSource.ts` を実装して GREEN（ドメイン戻りは Result）
- [ ] **Step 4:** 該当テスト GREEN + `npx tsc --noEmit`（client）

---

### Task 2: 永続化・競合・履歴

**Files:**
- Create: `client/src/domain/persistence/mapDocumentNodeSources.ts` + test
- Modify: `mapDocumentNode.ts`、`mapDocumentNodeProjection.ts`、`mapConflict.ts`、`mapHistory.ts`（sources を `areNodeSourcesEqual`）
- Modify: 既存 persistence / conflict / history テストの期待値（L-609）

**Interfaces:**
- `normalizeMapDocumentNodeSources(sources, index, version)` — 未知キー拒否、件数・length 先、正規化、unique 後捨て

- [ ] **Step 1:** 永続化・競合・履歴の失敗テスト
- [ ] **Step 2:** RED
- [ ] **Step 3:** 実装して GREEN（投影・normalize 合流・conflict・history）
- [ ] **Step 4:** 関連 jest + tsc

---

### Task 3: 統合・属性ポリシー・構造操作の固定

**Files:**
- Modify: `nodeMerge.ts`、`nodeMergeMessages.ts`、`nodeMergePreview.ts`、関連テスト
- Modify: `nodeAttributePolicy.ts` + `nodeAttributePolicy.test.ts`（SAMPLE/DIFFERENT に sources）
- Modify/確認: `nodeSplit`・`nodeSubtreeInsertion`・`nodeParentInsertion`・clipboard のテストで sources を固定

**Interfaces:** 計画に `sources`・`sourceSourceCount`・`sourceDuplicateCount`。`isSameNodeMergePlan` がこれらを要素ごと比較（L-036）。`sources-too-many` と文言。プレビュー行の規則は Global Constraints どおり。

- [ ] **Step 1:** merge too-many / union / `isSameNodeMergePlan` / preview（M=0 と M>0）/ policy / split・複製のテスト
- [ ] **Step 2:** RED
- [ ] **Step 3:** 実装 GREEN
- [ ] **Step 4:** 関連 jest + tsc

---

### Task 4: `useNodes` フック

**Files:**
- Modify: `client/src/hooks/useNodes.ts`（および分割されていれば layout state）
- Create/Modify: `useNodes` の sources テスト（連続追加・Undo・失敗で不変・L-453）

**Interfaces:**
- `addNodeSource(id, input): AddNodeSourceOutcome`
- `removeNodeSource(id, index): boolean`

- [ ] **Step 1:** フックの失敗テスト
- [ ] **Step 2:** RED
- [ ] **Step 3:** 実装 GREEN
- [ ] **Step 4:** jest + tsc

---

### Task 5: 右パネル UI と配線

**Files:**
- Create: `client/src/components/layout/NodeSourcesSection.tsx` + test（DOM イベントで接続。L-737）
- Modify: `NodeDetailPanel.tsx`（リンクとイラストの間）、`MapEditor` 配線
- Create/Modify: ページ統合テスト（links の `pageNodeLinks` を先例に）

- [ ] **Step 1:** 部品テスト（追加成功/失敗、空タイトルで無操作、IME/repeat、上限、削除後フォーカス、documentRevision、URL の rel/target、未選択で入力を描かない、`p. {page}`、DOM イベント接続 L-737）。ページ統合（追加して別ノードへ行って戻る、Undo、JSON 往復、javascript: 拒否、統合、複製、入力内キーがマップに漏れない、削除ボタン上 Ctrl+Z 後の Delete でノードが消えない）
- [ ] **Step 2:** RED
- [ ] **Step 3:** UI 実装 GREEN
- [ ] **Step 4:** 該当 jest + tsc

---

### Task 6: ドキュメント・ROADMAP・全体検証

**Files:**
- Modify: `features.md`、`data-model.md`、`api.md`、`overview.md`、`browser-test-cases.md`、`ROADMAP.md`、`README.md`、`client/README.md`、`docs/README.md`
- Modify: `types/node.ts` コメントの見直し箇所

- [ ] **Step 1:** 仕様・ROADMAP を設計どおり更新（候補054 完了、Phase 18 完了、次は Phase 19、最終更新日）
- [ ] **Step 2:** `cd client && npm run verify` を成功させる
- [ ] **Step 3:** ブラウザ手順書に出典節を追加（実機未実施でよい）

---

## 実行メモ

- worktree 未作成なら `git worktree add .worktrees/feat-phase18-node-sources -b feat/phase18-node-sources`（main 最新から）。
- 各タスク完了後、別サブエージェントで仕様適合レビューとコード品質レビューを行い、指摘を直してから次へ。
- 全タスク後に `npm run verify` 成功を確認してから feature 完了とする。
