# Phase 29: 自動配置の拡張 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. 作業場所: メインのチェックアウトのブランチ `feat/phase29-auto-layout-extensions`（worktree 不使用）。**Do not commit** during `/feature`.

**Goal:** 放射状レイアウト（064）、枝ごとの配置方向（065）、位置固定付き自動配置（066）を MapDocument V3 の拡張として 1 PR で実装する。

**Architecture:** 文書級 `layoutStyle` / `branchLayouts` とノード属性 `layoutPinned` を追加。配置は既存 `layoutNodeForest` 系を拡張し、orthogonal は枝方向・ピン、radial は専用幾何。UI はヘッダー様式切替・コンテキスト枝方向・詳細パネル／コンテキストのピン。

**Tech Stack:** React, TypeScript, Pixi, Jest, localStorage

## Global Constraints

- 設計: `docs/superpowers/specs/2026-11-24-phase29-auto-layout-extensions-design.md`（feature-spec 反映済みの幾何・鏡映・ピン契約を正本）
- V3 のまま。任意キー欠落＝既定（orthogonal / 空 branchLayouts / 非ピン）
- `layoutPinned` は L-825 で `NODE_ATTRIBUTE_POLICY` 必須追加（split: original-only, merge: survivor-else-first, parentInsert: none）。`branchLayouts` はノード属性に載せない
- L-061: 設計 §6 入口表＋既存操作ガードを inventory とテストで固定。L-1061: locked はピン操作・ピンドラッグ拒否
- manual 時: layoutStyle / treeDirection / layoutSpacing は既存 TreeDirectionControl 同型で **disabled（値保持）**
- radial 中: treeDirection・branchLayouts UI disabled／配置計算に使わない。layoutSpacing は有効
- TDD。コミットしない。日本語 UI。`cd client && npm run verify`
- 知見: L-061, L-825, L-1061, L-203（L-1085 N/A）

---

### Task 0: L-061 inventory

**Files:** Create `docs/superpowers/specs/2026-11-24-phase29-auto-layout-extensions-inventory.md`

- 設計 §6 の新入口（様式・枝方向・ピン・ピンドラッグ）と既存操作（並べ替え・manual 移動・treeDirection・間隔・アウトライン／保護／競合／関連線・グループ選択）を機械列挙。
- 列挙手順: `useNodes` / layout hooks の公開面、Phase 25 inventory・コマンドパレット項目を「無効／無関係」で埋める（Phase 28 Task0 と同型）。
- L-1085 N/A を冒頭に明記。
- **テスト所有者（後続 Task が GREEN）**: Task 2 がピン入口＋ピンドラッグ、Task 3 が枝方向入口、Task 4 が様式入口について、**Task 0 列挙の代表経路**（アウトライン／保護／競合／関連線選択／グループ選択／locked）で disabled／拒否になることを RED/GREEN する。Task 0 自体は文書のみ。

- [x] inventory 作成

---

### Task 1: 型・codec・equal・policy・GC

**Files:**
- Create: `client/src/types/layoutStyle.ts`, `client/src/types/branchLayout.ts`（または既存 treeDirection 隣）
- Modify: `nodeMapState.ts`, `types/node.ts`（`layoutPinned?: true`）
- Modify: `nodeAttributePolicy.ts` + `__tests__/nodeAttributePolicy.test.ts`（Required\<Node\> 見本）
- Modify: `mapDocumentState.ts`, encoder/decoder, normalize
- Modify: `mapHistory.ts`, `mapConflict.ts` equal
- Modify: clipboard / branch move / extract / merge の `branchLayouts` prune・remap（relations/groups と同型ヘルパ）
- Modify: `nodeMerge.ts`（必要なら `nodeSplit.ts`）— `layoutPinned` を policy どおり実行時に適用（表だけでは不足）

**Interfaces:**
```ts
type LayoutStyle = "orthogonal" | "radial";
type BranchLayoutDirection = "lr" | "rl" | "tb" | "bt";
type BranchLayout = { nodeId: number; direction: BranchLayoutDirection };
// NodeMapState.layoutStyle?: LayoutStyle
// NodeMapState.branchLayouts?: readonly BranchLayout[]
// Node.layoutPinned?: true

normalizeLayoutStyle(raw): LayoutStyle | undefined; // 未知→欠落扱い
normalizeBranchLayouts(raw, nodeIdSet): readonly BranchLayout[] | undefined;
pruneBranchLayoutsAfterRemovedNodeIds(layouts, removedIds): ...;
remapClosedBranchLayouts(layouts, idMap): ...;
rewriteBranchLayoutsAfterNodeMerge(survivorId, absorbedIds, layouts): ...;
```

- [x] RED/GREEN: codec 往復・未知除去・空省略・equal が layoutStyle/branchLayouts/layoutPinned を見る
- [x] RED/GREEN: policy 表に layoutPinned、parentInsert none、変異で型／テスト漏れ検知
- [x] RED/GREEN: GC／統合／clipboard remap。layoutPinned は複製・clipboard で **値コピー**。merge/split が policy どおり

---

### Task 2: layoutPinned ＋ auto 尊重

**Files:**
- Modify: `nodeAutoLayout.ts` / geometry / spacing — ピン座標固定、近いピン祖先をアンカー、ピン関与ペアは `hasValidVerticalSpacing` スキップ、ピン回避矩形＝ピン根サブツリー span
- Modify: `resolveLayoutSpacing.ts` — `NodeMapLayoutContext` / `resolveLayoutNodeForestOptions` が新フィールドを渡す（下記 Interfaces）
- Modify: `useNodeLayoutState.ts` / `useNodes.ts` — ピン付与・解除で auto なら即リレイアウト（1 Undo）
- Modify: stage ドラッグ — auto+ピンは座標移動（manual 相当）、ドロップ後リレイアウト 1 Undo；非ピンは既存並べ替え
- UI: コンテキスト／詳細パネル「位置を固定」「固定を解除」（locked 拒否）

**Interfaces:**
```ts
// LayoutNodeForestOptions 拡張（後方互換既定）
type LayoutNodeForestOptions = {
  direction: TreeDirection;
  spacing: LayoutSpacing;
  layoutStyle?: LayoutStyle; // 欠落＝orthogonal（Task4 で本実装）
  branchLayouts?: readonly BranchLayout[];
};
// 既存橋を拡張（Task 3/4 前提。既存 resolve 経路で新フィールドが落ちないこと）
type NodeMapLayoutContext = Pick<
  NodeMapState,
  "treeDirection" | "layoutSpacing" | "layoutStyle" | "branchLayouts"
>;
resolveLayoutNodeForestOptions(state: NodeMapLayoutContext): LayoutNodeForestOptions;
// ピン関与ペアはスキップ（シグネチャは既存＋ノード参照で pinned 判定できる形に拡張可）
hasValidVerticalSpacing(forest, positions, siblingGap, nodes?: readonly Node[]): boolean;

setNodeLayoutPinned(nodeId: number, pinned: boolean): { ok: true } | { ok: false; reason: "locked" | ... };
```

- [x] RED/GREEN: ピンは動かず非ピンは動く；解除で再配置；locked 拒否
- [x] RED/GREEN: ピン根サブツリー **span** 回避（単体 box 回避では落ちる座標例を含む）
- [x] RED/GREEN: ピン関与の間隔不足でも null にしない／非ピン同士不足は null
- [x] RED/GREEN: auto ピンドラッグは当該ノードのみ移動（子孫非追従）＋ドロップ後 1 Undo；非ピンは並べ替えのまま
- [x] RED/GREEN: Task0 列挙の代表経路でピン入口／ピンドラッグが無効・拒否

---

### Task 3: branchLayouts（orthogonal・rl/bt）

**Files:**
- Modify: layout エンジン — 最近祖先の方向、中心鏡映→top-left、混在時の親パック用子枝 span（設計どおり）
- Modify: hooks — 設定／「文書の既定に戻す」、auto+orthogonal で即リレイアウト 1 Undo
- UI: コンテキスト「この枝の配置方向」（radial / locked / 非マップで disabled）

**Interfaces:**
```ts
effectiveBranchDirection(nodeId, branchLayouts, documentDirection): BranchLayoutDirection;
setBranchLayout(nodeId, direction | null): void; // null＝エントリ削除
```

- [x] RED/GREEN: lr/rl/tb/bt の座標（中心鏡映）、混在 span、radial では無視（値保持）
- [x] RED/GREEN: GC・Undo。auto+orthogonal で即時再配置。manual／radial では配列のみ更新（座標不変）
- [x] RED/GREEN: Task0 列挙の代表経路で枝方向入口が無効・拒否

---

### Task 4: radial（064）

**Files:**
- Create/Modify: radial 配置（設計の原点・セクタ・childGap/siblingGap・ピン固定・ピン中心角の予約）
- Modify: `layoutNodeForest` が `layoutStyle==="radial"` で分岐
- Modify: `useNodeLayoutState.ts` / `useNodes.ts` — `setLayoutStyle`（下記）。Task2 の `NodeMapLayoutContext` 拡張を前提
- UI: ヘッダー「直交／放射」（TreeDirectionControl 隣、manual disabled）
- treeDirection コントロールは radial 中 disabled

**Interfaces:**
```ts
setLayoutStyle(style: LayoutStyle): void;
// setTreeDirection 同型: auto なら即リレイアウト 1 Undo。manual は UI disabled（値変更操作なし）
```

**受入（多ルート・ピン — 設計正本をテストで固定）**:
- 非ピンルート配置角: **非ピンルート数**で 360° 等分、開始角 0＝+X、文書順
- 各ルートの子セクタ幅: **ルート総数（ピン含む）** で `360° / N`
- ピン留めルートは円周再配置しない
- 同階層のピン兄弟: 弦長計算でピンの **ノード box 中心角を予約角として除く**（span 角は使わない）

- [x] RED/GREEN: 単一ルート；多ルートで上の等分／セクタ幅；ピン留めルート固定；orthogonal↔radial Undo
- [x] RED/GREEN: ピン兄弟の中心角予約（予約なし実装では落ちる例）
- [x] RED/GREEN: manual で様式 UI disabled；radial 中 treeDirection disabled；spacing は効く
- [x] RED/GREEN: Task0 列挙の代表経路で様式入口が無効・拒否

---

### Task 5: docs・ROADMAP・verify

**Files:** `features.md` / `data-model.md` / `overview.md` / `api.md` / 型コメント、inventory パス確定、`ROADMAP.md`（064–066・Phase29・現在地）、`cd client && npm run verify`

- [x] L-203 同期（公開面: setNodeLayoutPinned / setBranchLayout / setLayoutStyle を api.md に含む）
- [x] verify 成功

## プランレビュー後の記録

- feature-plan 第1周 Blocking: L-061 テスト所有者・放射ピン角予約・多ルート RED 一意化・ピン span RED — 反映。
- feature-plan 第2周 Blocking: NodeMapLayoutContext／resolve 拡張を Task2 Interfaces に固定、Task4 に setLayoutStyle＋hooks — 反映。
