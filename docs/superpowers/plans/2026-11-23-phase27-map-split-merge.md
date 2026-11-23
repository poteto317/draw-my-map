# Phase 27 前半: 枝の別マップ化・アーカイブ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/phase27-map-split-merge`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** 枝を別マップへ切り出して元に mapLink スタブを残す（058）。マップをアーカイブして既定一覧から外す（060）。

**Architecture:** 058 は `transferNodeBranch` 相当 TX＋元マップへのスタブ挿入。060 は `MapUserMeta.archivedAt`（ISO）と一覧第4タブ。

**Tech Stack:** React, TypeScript, Jest, localStorage

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-23-phase27-map-split-merge-design.md`
- 059・093 非実装。ルート切り出し不可
- L-1061: 枝内 ∪ 離脱元親を assert（**ルート直下なら親検査なし**）。L-061: 入口表どおり visible/disabled
- archivedAt は ISO string。all/favorites/recent からアーカイブ除外。現在マップもアーカイブ可（編集継続）
- アーカイブ書込失敗時は通知のみ・本体非タッチ。meta not ready / 保護で操作 disabled
- Undo: 切り出しは履歴に載せない（確認ダイアログで明示）
- L-825: 新任意属性なし。スタブは既存 `mapLinks` のみ。policy 変更なし。投影・equal・clipboard の既存 mapLinks 規則に乗ることをテストで固定
- TDD。コミットしない。日本語 UI。`cd client && npm run verify`
- 知見: L-061, L-1061, L-203, L-825

---

### Task 0: L-061 インベントリ

**Files:**
- Create: `docs/superpowers/specs/2026-11-23-phase27-extract-archive-inventory.md`
- Modify: 必要なら phase25 lock-inventory へ「枝切り出し」行

- [x] 設計表と同期（実装パス列はプレースホルダー可。**パス確定は Task 3**）

---

### Task 1: アーカイブ meta（060）

**Files:**
- Modify: `mapLibraryMeta.ts` / `mapLibraryMetaModel.ts` + codec — `archivedAt?: string`（ISO）、`MAP_USER_META_KEYS` に追加
- Modify: 既存更新系が往復を落とさないこと — `buildMapUserMeta`・`toggleMapFavorite`・`recordMapOpened`・`assignMapFolder`（および同等ヘルパ）
- Modify: 一覧フィルタ（all/favorites/recent 除外）＋タブ `archived`
- Modify: `MapLibraryListScreen` / `useMapLibrary` — 公開面 `archiveMap` / `unarchiveMap`（または既存命名に揃えた別名をプラン追記）、meta not ready / 保護で disabled
- Modify: 全マップ検索結果にアーカイブ印
- Backup: mapMeta に archivedAt が載ることを確認／必要なら追記

**Interfaces:**
```ts
archivedAt?: string; // 厳密 ISO。欠落＝非アーカイブ
function isMapArchived(meta: MapUserMeta | undefined): boolean;
function archiveMapMeta(meta, mapId, nowIso): MapUserMeta; // archivedAt = now
function unarchiveMapMeta(meta, mapId): MapUserMeta; // キー削除
// useMapLibrary: archiveMap(mapId) / unarchiveMap(mapId)
// 既存 favorite/open/folder 更新後も archivedAt が保持されること
```

- [x] RED/GREEN: フィルタ、タブ、検索印、不正型、解除
- [x] RED/GREEN: 現在マップをアーカイブしても編集継続
- [x] RED/GREEN: meta 書込失敗 → 通知・本体非タッチ（モック可能な範囲）
- [x] RED/GREEN: archive 後に favorite/open/folder 更新しても archivedAt 保持

---

### Task 2: 枝切り出しドメイン＋TX（058）

**Files:**
- Create: `extractBranchToMap.ts` + test（公開関数名は `extractBranchToNewMap`）
- Modify: `useMapLibrary` / persistence TX（create map → transfer → stub insert → open）
- **親 assert は extract 側で追加**（既存 `transferNodeBranch` は枝 ID のみのまま。本体を広げて `moveBranchToMap` へ波及させない）
- assert: 枝内 ∪ parent（ルート直下は親なし）。ルート拒否。競合／保護拒否。履歴に載せない
- **libraryMetaStatus は切り出しの拒否条件にしない**（設計: 058 は meta 不使用＝関与しない）

**Interfaces:**
```ts
extractBranchToNewMap(args): Result<{ newMapId, stubNodeId }> | err
// 新マップ名: `${元マップ名} — ${表示ラベル}`（空ラベル→「無題の枝」）
// stub: label（空→永続「新しいノード」）, importance: "medium",
//   mapLinks:[{targetMapId}] のみ任意属性, 既定寸法 100×60, 旧座標, 兄弟 index 維持
```

- [x] RED/GREEN: 成功経路（新マップ名規則・スタブ属性・mapLinks 1 件）
- [x] RED/GREEN: 親 locked、ルート拒否、空ラベル（マップ名「無題の枝」／スタブ「新しいノード」）
- [x] RED/GREEN: L-825 — スタブが投影・equal・clipboard の既存 mapLinks 規則に乗ること（既存ヘルパ／fixture 再利用）
- [x] RED/GREEN: 失敗ロールバック単体（可能な範囲）

---

### Task 3: 切り出し UI

**Files:**
- Modify: `NodeContextMenu` + MapEditor 配線 + 確認ダイアログ
- inventory 実装パス確定（Task 0 を更新）
- テスト: visible/disabled 条件（**meta ready はゲートにしない**。アウトライン／保護／競合／locked のみ）

- [x] RED/GREEN: メニュー表示条件、確認（**Undo 不可をダイアログ文言で明示**）、成功で新マップへ
- [x] RED/GREEN: libraryMetaStatus 非 ready でも切り出しメニューは meta 理由で disabled にしない

---

### Task 4: docs・ROADMAP・verify

**Files:**
- features / data-model / overview / api / 型コメント / inventory — grep 同期
- ROADMAP: 058・060 `[x]`、059・093 残、Phase27 進行中、現在地
- `npm run verify`

- [x] L-203 同期
- [x] verify 成功

---

## 実装後メモ

- カード #32: マージ後 Done。solution に「059・093 は ROADMAP 残」。

## プランレビュー後の記録

- feature-plan 第1周 Blocking: 新マップ名、L-825 テスト、Undo 明示、アーカイブ書込失敗／現在マップ編集 — 反映済み。
- feature-plan 第2周 Blocking: archivedAt 往復経路・切り出しは meta 非関与 — 反映済み。
