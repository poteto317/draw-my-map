# ホイールパン化とズーム操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修飾キーなしホイールをパンにし、ズームは Ctrl/Cmd+ホイール・ピンチ・右下 +/- に移す。

**Architecture:** 純粋関数 `wheelPan.ts` を追加し、`useMapWheelZoom` を修飾キー分岐で pan/zoom に拡張。`MapViewportZoomControls` をマップ右下に配置。ヒントと `features.md` を追随。閲覧履歴には積まない。

**Tech Stack:** React / TypeScript / Jest / Tailwind / Pixi（既存 viewport）

**Spec:** `docs/superpowers/specs/2026-11-22-wheel-pan-zoom-controls-design.md`

## Global Constraints

- パン符号: `dx = -normalize(deltaX)`, `dy = -normalize(deltaY)` → `panViewport`（スクリーン差分を offset に加算）。
- `PAGE` の正規化係数は縦横とも `pageHeight`。
- 修飾キーなしはズームしない。`ctrlKey`/`metaKey` 時のみ既存ズーム。
- トラックパッドピンチは多くが `wheel`+`ctrlKey` → ズーム経路が兼ねる。タッチピンチは変更しない。
- pan/zoom 要求が非 null のときだけ `preventDefault` と `onBeforeZoom`（ジェスチャー取消）。不成立時はどちらも呼ばない。
- +/- : ×1.25 / ÷1.25、中央アンカー、端で disabled、**閲覧履歴に積まない**。マップ領域の相対コンテナ上 `absolute bottom-3 right-3`。ヘッダー／overflow 領域禁止（L-799）。アウトライン表示では出さない。
- `useMapWheelZoom` はリネームしない。
- ROADMAP 完了化・clipboard stash は範囲外。コミット禁止（後続 `/commit-ja`）。
- TDD。最終タスクで `npm run verify`。

---

### Task 1: wheel pan 純粋関数 + 正規化共有

**Files:**
- Create: `client/src/components/map/wheelPan.ts`
- Modify: `client/src/components/map/wheelZoom.ts`（`normalizeWheelDelta` を共有エクスポート。既存名は薄いラッパで維持可）
- Create: `client/src/components/map/__tests__/wheelPan.test.ts`
- Modify: `client/src/components/map/__tests__/wheelZoom.test.ts`

**Interfaces:**
- `normalizeWheelDelta(delta, deltaMode, pageHeight): number`
- `calculateWheelPanRequest({ deltaX, deltaY, deltaMode, pageHeight }): { dx, dy } | null`

- [x] **Step 1:** 失敗テスト — 符号、LINE/PAGE（**`deltaX`+PAGE も pageHeight**）、(0,0)→null、非有限→null
- [x] **Step 2:** RED
- [x] **Step 3:** 実装
- [x] **Step 4:** GREEN（wheelPan + wheelZoom）

---

### Task 2: useMapWheelZoom を pan/zoom 分岐に拡張

**Files:**
- Modify: `client/src/components/map/useMapWheelZoom.ts`
- Modify: `client/src/components/map/__tests__/useMapWheelZoom.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`（`onPanBy` → `panViewport`）
- Modify: 「ホイール＝ズーム」前提の MapStage / page テスト

**Interfaces:**
- Options 追加: `onPanBy: (dx: number, dy: number) => void`
- pan / zoom **いずれの要求成立時も**先に `onBeforeZoom()` を呼ぶ（任意ではない）
- 要求 null のとき `preventDefault` / `onBeforeZoom` / `onPanBy` / `onZoomAt` いずれも呼ばない

- [x] **Step 1:** テスト — 修飾キーなし pan、Ctrl/Cmd zoom、成立時 preventDefault+onBeforeZoom、不成立時の否定、pan 経路でも onBeforeZoom
- [x] **Step 2:** RED → 実装 + MapStage 配線 → GREEN

---

### Task 3: MapViewportZoomControls + MapEditor 配線

**Files:**
- Create: `client/src/components/map/MapViewportZoomControls.tsx`
- Create: `client/src/components/map/__tests__/MapViewportZoomControls.test.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`
- Modify: `client/src/components/map/__tests__/MapEditor.test.tsx`（履歴に +/- を積まない／outline で非表示／倍率）

**Interfaces:**
- Props: `{ scale: number; onZoomIn: () => void; onZoomOut: () => void }`
- a11y: group `aria-label="ズーム"`、ボタン `aria-label`「拡大」「縮小」
- 配置: マップ領域相対、`absolute bottom-3 right-3`（ヘッダー禁止）
- 親: `clampViewportScale(scale * 1.25 | scale / 1.25)`、キャンバス中央アンカー、`zoomViewportAt`、閲覧履歴に積まない

- [x] **Step 1:** コンポーネントテスト — aria、クリックで callbacks、端 disabled（scale 境界を props で渡す）
- [x] **Step 2:** RED → 実装 → GREEN
- [x] **Step 3:** MapEditor 配線 + テスト（×1.25 中央ズーム、履歴に積まない、outline で非表示、クラス配置）
- [x] **Step 4:** GREEN

---

### Task 4: ヒント文言 + features.md + verify（完了）

**Files:**
- Modify: `client/src/components/layout/LayoutModeOperationHint.tsx`
- Modify: ヒントを読むテスト
- Modify: `docs/specifications/features.md`（Phase3 概要、§2.2/2.3、§11.2、§14.3、**ヒント文言のコピーがあればそれも**）

- [x] **Step 1:** ヒント置換 + テスト
- [x] **Step 2:** features.md 更新
- [x] **Step 3:** `cd client && npm run verify`

---

## 完了条件

- 全 Task 完了、`npm run verify` 成功、設計の成功条件を満たす
