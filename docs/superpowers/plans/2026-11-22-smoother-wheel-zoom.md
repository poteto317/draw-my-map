# 拡大縮小感度の引き上げ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.  
> このリポジトリでは **サブエージェント駆動** を使う（`AGENTS.md`）。インライン実行はユーザー明示時のみ。各タスク完了後に仕様適合・コード品質の二段階レビュー。**コミットはしない**（後の `/commit-ja`）。

**Goal:** Ctrl/Cmd+ホイール（および `ctrlKey` 付きトラックパッドピンチ）のズーム感度を `0.001` から `0.0025` に上げ、操作量に見合う倍率変化にする。

**Architecture:** `wheelZoom.ts` の private 定数だけを変更する。計算式・パン経路・+/-・タッチピンチ・ズーム範囲は不変。感度に依存するテスト期待値と `features.md` の数値を同期する。

**Tech Stack:** TypeScript, Jest, Next.js client（既存）

**Spec:** `docs/superpowers/specs/2026-11-22-smoother-wheel-zoom-design.md`（カード #48）

## Global Constraints

- `WHEEL_ZOOM_SENSITIVITY = 0.0025`（ユーザー選択 3C）。式は `currentScale * exp(-delta * sensitivity)` のまま。
- 補間アニメなし。+/-（×1.25）・タッチピンチ・ズーム範囲 0.25〜4・修飾キーなしホイールパンは変更しない。
- 感度依存テストの `Math.exp(0.1)`（`deltaY: ±100` かつ旧感度）は `Math.exp(0.25)` へ。
- 歴史ドキュメント（Phase 3 設計・プラン）の遡及修正は不要。`docs/specifications/features.md` は必須。
- TDD: 実装より先に期待値を新感度に合わせて RED を確認してから定数を変える、または定数変更で RED → 期待値更新で GREEN のどちらか。どちらでも最終は GREEN + `npm run verify`。
- 作業は `.worktrees/<branch>` の worktree で行う。コミットしない。
- 知見: 感度依存の固定期待値を実装と同期する（漏れると退行検知不能）。

---

### Task 1: 感度定数と単体テスト

**Files:**
- Modify: `client/src/components/map/wheelZoom.ts`（`WHEEL_ZOOM_SENSITIVITY`）
- Modify: `client/src/components/map/__tests__/wheelZoom.test.ts`
- Modify（感度依存があるものすべて）:
  - `client/src/components/map/__tests__/useMapWheelZoom.test.tsx`
  - `client/src/components/map/__tests__/MapStage.test.tsx`
  - `client/src/components/map/__tests__/MapStageVisibility.test.tsx`
  - `client/src/components/map/__tests__/MapStageHistory.test.tsx`
  - `client/src/app/__tests__/pageHistory.test.tsx`
  - `client/src/app/__tests__/pageMapLibrarySwitch.test.tsx`
  - `client/src/components/map/__tests__/MapEditor.test.tsx`（自動解像度のヒステリシス試験。感度変更で同じ倍率になるよう `wheel` の delta を 0.4 倍）
  - （実装前に `rg 'Math\\.exp\\(0\\.1\\)' client` で再確認し、ホイールズーム由来のものだけ更新）

**Interfaces:**
- Consumes: 既存 `calculateWheelZoomRequest` / `useMapWheelZoom` / `zoomViewportAt`
- Produces: 同一 API。内部感度のみ `0.0025`。`deltaY: -100` pixel → `requestedScale = current * Math.exp(0.25)`

- [x] **Step 1:** `rg 'Math\\.exp\\(0\\.1\\)|WHEEL_ZOOM_SENSITIVITY = 0\\.001' client docs/specifications` で更新対象を確定する
- [x] **Step 2:** `wheelZoom.test.ts` の期待を `2 * Math.exp(0.25)` に変え、定数はまだ `0.001` のまま `npx jest wheelZoom.test.ts` で RED を確認する
- [x] **Step 3:** `wheelZoom.ts` の `WHEEL_ZOOM_SENSITIVITY` を `0.0025` にし、同テストを GREEN にする
- [x] **Step 4:** 残りの感度依存テストの `Math.exp(0.1)` を `Math.exp(0.25)` に更新し、該当テストを GREEN にする
- [x] **Step 5:** コミットしない

---

### Task 2: 仕様書と全体検証・ROADMAP

**Files:**
- Modify: `docs/specifications/features.md`（`WHEEL_ZOOM_SENSITIVITY` と式の `0.001` → `0.0025`）
- Modify（該当があれば）: `ROADMAP.md` の「現在地」に操作感度調整の短い追記のみ（Phase 完了チェックは付けない）

**Interfaces:**
- Consumes: Task 1 の定数 `0.0025`
- Produces: 仕様と実装の数値一致、`npm run verify` 成功

- [x] **Step 1:** `features.md` の感度定数・数式・関連文言の `0.001` を `0.0025` に更新する
- [x] **Step 2:** `cd client && npm run verify` を実行し成功を確認する
- [x] **Step 3:** ROADMAP は Phase 項目を完了にせず、必要なら現在地に「ホイールズーム感度を 0.0025 に引き上げ（#48）」程度を追記する
- [x] **Step 4:** コミットしない

---

## 完了条件

- [x] 設計書の必須要件を満たす
- [x] `npm run verify` 成功
- [x] 未コミットのまま worktree に変更が残っている（`/commit-ja` 待ち）
