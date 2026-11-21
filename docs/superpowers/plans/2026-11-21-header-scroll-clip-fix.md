# ヘッダー縦はみ出し修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヘッダー操作が `40dvh` を超えて折り返したとき、ヘッダー内縦スクロールで下段ボタンへ届くようにし、マップ領域が潰れないようにする。

**Architecture:** `AppHeader` の `<header>` に `max-h-[40dvh] flex flex-col gap-4` を付け、縦スクロールは下段ラッパ（`data-testid="header-operations-scroll"`、`min-h-0 flex-1 overflow-y-auto overscroll-y-contain`）に集約する。`<header>` 自体には `overflow-y-auto` を付けない（検索ドロップダウン等の `absolute` 子のクリップ防止）。上段は `data-testid="header-primary"` の `shrink-0 flex flex-wrap` 行。ページ全体スクロールやヘッダー再編成はしない。シェル／`main` の overflow 契約は現状維持。

**Tech Stack:** Next.js / React / Tailwind CSS / Jest / Testing Library

**Spec:** `docs/superpowers/specs/2026-11-21-header-scroll-clip-fix-design.md`

## Global Constraints

- ページ全体・シェルに `overflow-hidden` を新たに付けない。`main` の `overflow-hidden` は維持する。
- root `<header>` の class は正確に `max-h-[40dvh]`・`flex`・`flex-col`・`gap-4`（背景／padding／shadow は既存維持）。root `header` に `overflow-y-auto` を付けない。
- 下段ラッパの class は正確に `min-h-0`・`flex-1`・`overflow-y-auto`・`overscroll-y-contain`（表記固定）。`data-testid="header-operations-scroll"`。
- 下段の有無は操作系 props（`importanceControls` / `resolutionControls` / `operationControls` / `operationNotices`）の truthy 判定。すべて未指定または falsy のとき下段は描画しない。
- ヘッダー操作の削減・再配置・コマンドパレット移行・ヘルプ追記・横はみ出し修正は範囲外。
- ROADMAP の Phase 項目は完了にしない（バグ修正）。
- TDD: 実装より先に失敗するテストを追加し RED を確認する。
- 作業ディレクトリは git worktree（`.worktrees/<branch>`）。コミットはこのプラン実行中は行わない（後続 `/commit-ja`）。
- 知見: シェル overflow 契約（`page.test.tsx`）、overflow 内フォーカスは今回 `auto` のため hidden 特有の outline 対策は不要。

---

### Task 1: AppHeader の高さ上限と下段縦スクロール（TDD）

**Files:**
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`（既存ファイル。ケース追加のみ。既存テストは削除しない）
- Modify: `client/src/components/layout/AppHeader.tsx`
- Verify unchanged contract: `client/src/app/__tests__/page.test.tsx`（レイアウト describe。ヘッダークラス断言は追加しない）

**Interfaces:**
- Consumes: 既存 `AppHeader` props（変更なし）
- Produces: root `<header>` に `max-h-[40dvh] flex flex-col gap-4`（`overflow-y-auto` は付けない）。上段 `header-primary`（`shrink-0 flex flex-wrap`）。下段 `header-operations-scroll` に `min-h-0 flex-1 overflow-y-auto overscroll-y-contain`。操作系 props がすべて falsy のとき下段なし。

- [x] **Step 1: 失敗するテストを書く**

既存の `describe("AppHeader")` に `it` を追加する。同ファイルの既存 render と同じ必須 props を使い、次を断言する。

```tsx
expect(banner).toHaveClass("max-h-[40dvh]", "flex", "flex-col");
expect(banner).not.toHaveClass("overflow-y-auto");
expect(screen.getByTestId("header-operations-scroll")).toHaveClass(
  "min-h-0",
  "flex-1",
  "overflow-y-auto",
  "overscroll-y-contain",
);
```

検索 `absolute` ダミーで `search-controls` が `header-primary` 内にあり `header-operations-scroll` 外にあること、操作系 props がすべて falsy のとき `header-operations-scroll` が無いことを固定する。

- [x] **Step 2: RED を確認**

```bash
cd client && npx jest src/components/layout/__tests__/AppHeader.test.tsx --runInBand
```

期待: 失敗（クラス未付与）。

- [x] **Step 3: 最小実装**

`AppHeader.tsx` で上段／下段の二段構成と下段ラッパの overflow を実装する。他ファイルは触らない。

- [x] **Step 4: GREEN + 回帰**

```bash
cd client && npx jest src/components/layout/__tests__/AppHeader.test.tsx src/app/__tests__/page.test.tsx --runInBand
```

期待: 成功。`page.test.tsx` の「可変高headerを除いたviewport内の残領域をmapへ割り当てる」も成功したまま。

- [x] **Step 5: client で verify**

```bash
cd client && npm run verify
```

期待: 成功。

---

### Task 2: 設計・プランのリポジトリ配置確認（ドキュメントのみ）

**Files:**
- Keep: `docs/superpowers/specs/2026-11-21-header-scroll-clip-fix-design.md`
- Keep: `docs/superpowers/plans/2026-11-21-header-scroll-clip-fix.md`
- Do not modify: `ROADMAP.md`（完了チェックを付けない）

**Interfaces:**
- Consumes: Task 1 完了
- Produces: なし（コミットは後続フロー）

- [x] **Step 1:** ROADMAP を完了扱いにしていないことを確認する。
- [x] **Step 2:** 設計書の「決めたこと」と実装クラスが一致していることを目視確認する。

---

## 完了条件

- Task 1 のテストと `npm run verify` が成功
- ヘッダーのみ変更、シェル／main 契約維持
- サブエージェント駆動で実装し、各タスク後に仕様適合・コード品質の二段階レビュー