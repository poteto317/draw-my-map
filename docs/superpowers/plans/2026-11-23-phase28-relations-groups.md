# Phase 28: 関連線・意味付け・グループ枠 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/phase28-relations-groups`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** 同マップ内の親子以外の関連線（061）、意味・方向（062）、ノード集合のグループ枠（063）を MapDocument V3 の文書級データとして実装する。

**Architecture:** `NodeMapState.relations` / `groups`。描画は親子線と分離。選択状態を拡張し既存ノード操作をガード。

**Tech Stack:** React, TypeScript, Pixi, Jest, localStorage

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-23-phase28-relations-groups-design.md`
- ノード任意属性は増やさない（L-825）。ID は nodes∪relations∪groups 共有空間で採番
- 重複規則は追加・更新とも適用。統合後のキー衝突は id 昇順で 1 本残す
- 不正要素はエントリ除去で文書成功（全体 corrupt にしない）
- L-061: 入口表＋既存操作ガードをテストで固定。L-1061: 関与 locked
- TDD。コミットしない。日本語 UI。`cd client && npm run verify`
- 知見: L-061, L-825, L-1061, L-203, L-1085

---

### Task 0: L-061 inventory

**Files:** Create `docs/superpowers/specs/2026-11-23-phase28-relations-groups-inventory.md`

- 設計 §6 新入口＋§10 既存操作ガードを **機械列挙**（`useNodes` 公開面・Phase25 inventory の各行・コマンドパレット項目を「無効／無関係」で埋める）。パスは Task 5 で確定。
- L-1085: 本 Phase に合成名は無し（グループ表示フォールバック「グループ」は永続しない）。知見 ID は適用外と inventory 冒頭に明記。

- [x] inventory 作成（列挙完了）

---

### Task 1: 型・codec・equal・GC・採番

**Files:**
- Create: relation/group 型、`domain/map/relationGroupModel.ts`
- Modify: `nodeMapState.ts`、mapDocument projection/normalize
- Modify: **既存** `NodeIdAllocator.nextAvailableIds(nodes, count)` を拡張するか、呼び出し側で `collectUsedEntityIds(state)` を渡し **別名** `nextAvailableEntityIds(state, count)` を新設（既存シグネチャを壊して同名で usedIds 化するのは禁止。`useNodes` を新ヘルパへ切替）
- Modify: `mapHistory` / `mapConflict` equal
- Clipboard 閉じた写し

**Interfaces:**
```ts
collectUsedEntityIds(state: Pick<NodeMapState,"nodes"|"relations"|"groups">): number[];
nextAvailableEntityIds(state, count): number[]; // useNodes の採番をこれに切替
normalizeRelations(raw, nodeIdSet): readonly MapRelation[] | undefined;
normalizeGroups(raw, nodeIdSet): readonly MapGroup[] | undefined; // label>100CP・nodeIds<2 等は除去
relationConflictKey(r): string;
canCommitRelation(relations, draft /* 追加or更新後の1本 */, ignoreId?: number): boolean;
pruneAfterRemovedNodeIds(relations, groups, removedIds): { relations; groups }; // 外部取込欠落も同じ
rewriteAfterNodeMerge(survivorId, absorbedIds, relations, groups): ...;
remapClosedForNodeIdMap(relations, groups, idMap): ...; // clipboard・枝移動・切り出し
type MapCanvasSelection =
  | { type: "nodes"; ids: readonly number[] }
  | { type: "relation"; id: number }
  | { type: "group"; id: number };
```

- [x] RED/GREEN: normalizeRelations/Groups 除去、重複・更新拒否、entity 採番が nodes∪relations∪groups を避ける
- [x] RED/GREEN: GC（削除／外部欠落）、統合リライト＋衝突、clipboard・枝移動／切り出し remap
- [x] RED/GREEN: relations/groups のみ違うと equal が偽

---

### Task 2: 関連線 UI＋描画＋選択ガード

**Files:**
- add/remove、`renderMapRelations`、可視（両端∈ visibleNodeIds）
- **選択は `MapCanvasSelection`（Task1 Interfaces）**。relation 選択時 nodes クリア
- Delete、§10＋Task0 列挙どおりノード操作ガード
- 相手ピッカー Dialog、コンテキスト追加／結ぶ

- [x] RED/GREEN: 追加・重複・locked・アウトライン／保護／競合
- [x] RED/GREEN: Task0 列挙の代表経路が relation 選択中に無効、ピッカー inert
- [x] RED/GREEN: 描画・ヒット・Delete

---

### Task 3: 意味付け UI（062）

**Files:** 右パネル、`canCommitRelation` で更新拒否、history

- [x] RED/GREEN: kind/directed、更新時重複拒否、Undo、codec 往復

---

### Task 4: グループ枠（063）

**Files:** mapGroups、renderMapGroups、グループ化／枝グループ化、**`MapCanvasSelection` type group**、削除・ラベル、ヒット優先ノード>関連線>グループ

- [x] RED/GREEN: 作成、AABB、メンバー GC、locked、複数グループ所属
- [x] RED/GREEN: group 選択中にノード操作が無効（Task0 列挙の代表）

---

### Task 5: docs・ROADMAP・verify

**Files:** features / data-model / overview / api / 型コメント / inventory パス、ROADMAP 061–063・Phase28 完了・現在地、`npm run verify`

- [x] L-203 同期
- [x] verify 成功

## プランレビュー後の記録

- feature-plan 第1周 Blocking: 採番・統合衝突・更新重複・不正データ・切り出しGC・L-061検証・equal — 反映。
- feature-plan 第2周 Blocking: nextAvailableIds シグネチャ・normalizeGroups・L-061列挙・選択型共有 — 反映。
