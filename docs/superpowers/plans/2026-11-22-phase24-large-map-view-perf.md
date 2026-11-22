# Phase 24: 大規模マップの閲覧と性能 Implementation Plan

> **For agentic workers:** Use subagent-driven-development. No worktree. Branch `feat/phase24-large-map-view-perf` on main checkout `/Users/mash/Desktop/draw-my-map`. **Do not commit** during `/feature`.

**Goal:** 深さ制限・一時強調・ノードピン・ミニマップ・ビューポートカリングを実装し Phase 24 を完了する。

**Architecture:** `collectDisplayVisibleNodeIds` に深さ条件を追加。強調は描画 alpha。ピンは単一キー永続。カリングは描画リスト絞り込み。ミニマップは独立 2D canvas。

**Tech Stack:** React, Pixi, Jest, localStorage

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-22-phase24-large-map-view-perf-design.md`
- Node id: `number`。`visibleNodeIds`: `ReadonlySet<number>`
- TDD。コミット禁止。日本語 UI。
- 知見: L-001, L-002, L-060, L-461, L-921

---

### Task 1: 深さ可視（041）

**Files:**
- Modify: `client/src/domain/nodes/mapDisplayVisibility.ts`（深さ集合を積に追加）
- Create: `client/src/domain/nodes/depthVisibility.ts` + tests
- Create: `client/src/components/layout/DepthLimitControl.tsx` + test
- Modify: `useMapDisplayState` / `MapEditor` 配線

**Interfaces:**
- `collectDepthVisibleNodeIds(nodes, maxDepth: number | null): ReadonlySet<number>` — null = 無制限（全 ID）
- `collectDisplayVisibleNodeIds` に **必須** の `depthVisibleNodeIds: ReadonlySet<number>` を追加（呼び出し側は常に渡す）
- 辺は両端とも論理可視のみ（既存経路を確認・テスト）

- [ ] RED/GREEN: 深さ積集合、辺規則、検索着地で N 引き上げ、表示0件時の無制限導線、MapEditor 配線で visible 変化
- [ ] コミットしない

---

### Task 2: 一時強調（042）

**Files:**
- Create: `client/src/domain/nodes/highlightSets.ts` + tests
- Create: `HighlightModeControl.tsx` + test
- Modify: `renderMapNodes` / `renderMapEdges` / MapStage props で dim alpha
- Modify: MapEditor

**Interfaces:**
- `type HighlightMode = "off" | "search" | "selection"`
- `collectHighlightNodeIds(mode, searchHitIds, selectedIds, nodes, visibleNodeIds: ReadonlySet<number>): ReadonlySet<number>` — search は hit ∩ visible
- 非強調かつ論理可視 → alpha 定数

- [ ] RED/GREEN: 集合計算（search∩visible、selection 0=空）、alpha 経路の配線テスト
- [ ] コミットしない

---

### Task 3: ノードピン（043）

**Files:**
- Create: `client/src/domain/pins/*`, `client/src/services/persistence/nodePinsStorage.ts` + tests
- Create: `client/src/hooks/useNodePins.ts`, `client/src/components/layout/NodePinControls.tsx` + tests
- Modify: renderMapNodes（ピン印）、MapEditor；ノード削除経路でピン掃除

**Interfaces:**
- 設計の read/write 契約どおり（ok/corrupt/read-error、quota、毎回新規空配列）
- `registerPin` / `deletePin` / `jumpToPin` → Result
- 読込時に不在 nodeId 除去 + repaired；ノード削除後も掃除

- [ ] RED/GREEN: codec、上限50、除去、corrupt≠空成功、quota notice、単一選択登録、ジャンプ失敗でフォーカスしない、削除後掃除
- [ ] コミットしない

---

### Task 4: ビューポートカリング（045）

**Files:**
- Create: `domain/nodes/cullNodesInViewport.ts` + tests
- Modify: `useRenderedMapScene` / MapStage で描画リスト絞り込み

**Interfaces:**
- `cullNodesInViewport(nodes, worldRect, padding): ReadonlyArray<Node>` — 戻りは描画用ノード配列。呼び出し側で ID 集合を作り `visibleKeys`／辺フィルタに渡す
- 辺: 両端 ID がカリング後集合に含まれるもののみ（renderMapEdges または同等でテスト）

- [ ] RED/GREEN: 矩形外除外、辺規則、パン／ズーム後に集合が更新される配線
- [ ] コミットしない

---

### Task 5: ミニマップ（044）

**Files:**
- Create: `Minimap.tsx` + test / domain helpers for world↔minimap
- Modify: MapEditor 配置、viewport パン API 接続

**Interfaces:**
- 全ノード layout 描画（不可視は薄色）、点数上限で間引き
- ビューポート矩形追従、クリックでパン

- [ ] RED/GREEN: 座標変換、矩形追従、不可視は薄色、点数上限間引き、クリック／ドラッグパン
- [ ] コミットしない

---

### Task 6: 仕様・ROADMAP・verify

- Modify: `features.md`, `ROADMAP.md`（Phase 24 完了、現在地）
- Run: `cd client && npm run verify`
- コミットしない
