# ズームアウト時の存在マーカー — 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. このリポジトリではインライン実行禁止（AGENTS.md）。コミットしない。

**Goal:** `auto` 解像度でズームアウトしても、構造上出すべきノード／親子枝が存在マーカー（点・細い線）として残り、真っ白にならないようにする。

**Architecture:** domain で `structuralVisible` と `presenceNodeIds` / `presenceEdgeChildIds` を純関数算出し、Pixi の別描画経路で `eventMode: "none"` のマーカーを描く。`visibleNodeIds` / `visibleKeys` には混ぜない。カリングはフル描画と同じ enabled 経路（presence に required マージ無し）。

**Tech Stack:** Pixi.js, React hooks, Jest。既存 LOD / display visibility / cull。

**設計:** `docs/superpowers/specs/2026-11-28-zoom-out-presence-markers-design.md`

## Global Constraints

- LOD しきい値・ヒステリシス・手動モード挙動は変更しない
- マーカーは `mode === "auto"` のみ。手動は空
- 操作不可（ヒットなし）。関連線・グループは非目標
- presence を `visibleNodeIds` / `visibleKeys` に混入禁止（設計 §5-5）
- L-002: 入力欠落≠候補ゼロ。L-467: presence は useMemo 純導出、render 中 setState 禁止
- 座標正本はフル描画と同じ表示座標（displayNodes）
- TDD。日本語。最終 `cd client && npm run verify`
- ROADMAP は新 Phase なし。「現在地」1 行 + features 解像度節追記

## File Map

| 領域 | 主なファイル |
|------|----------------|
| domain presence | Create `client/src/domain/nodes/mapPresenceVisibility.ts` (+ tests) |
| structural | Create or extend helpers next to `mapDisplayVisibility.ts` |
| edge/node cull helpers | Create small pure helpers for point/segment vs AABB if needed |
| pixi render | Create `renderMapPresenceMarkers.ts` (+ test)。Modify `renderMapScene.ts` で呼ぶ |
| scene hook | Modify `useRenderedMapScene.ts`（useMemo presence、cull、options 渡し） |
| MapStage / options | Modify `RenderMapSceneOptions` と MapStage 配線（resolutionMode 等） |
| docs | `docs/specifications/features.md` §5、`ROADMAP.md`、必要なら `docs/features.md` |

## Review Focus

1. auto+high で medium が presence に入り、手動 high では presence 空
2. collapse 子孫が presence に入らない
3. visibleKeys に presence キーが混ざらない／下流が操作対象にしない
4. 通常 edge がある親子に presence 線が二重にならない
5. カリング無効時は presence 全候補、enabled 時は線分×AABB
6. L-467（render 中 setState 無し）

---

### Task 0: domain — structural / presence 集合

**Files:**
- Create `client/src/domain/nodes/mapPresenceVisibility.ts`
- Test: `client/src/domain/nodes/__tests__/mapPresenceVisibility.test.ts`
- Optionally thin wrapper using existing collapse/focus/depth sets（`collectDisplayVisibleNodeIds` は解像度込みなので、structural 用に解像度無し版を同ファイルまたは `mapDisplayVisibility.ts` に追加）

**Interfaces:**
```ts
/** collapse ∧ focus ∧ depth（解像度なし） */
function collectStructuralVisibleNodeIds(
  candidateIds: Iterable<number>,
  sets: {
    collapseVisibleNodeIds?: ReadonlySet<number> | null;
    focusVisibleNodeIds?: ReadonlySet<number> | null;
    depthVisibleNodeIds: ReadonlySet<number>;
  },
): Set<number>;

/**
 * mode!=="auto" → 空（成功のゼロ）。
 * auto かつ完備 → structural − display。
 * 欠落時は呼ばない（呼び出し側が `arePresenceInputsComplete` でガード）。
 */
function collectPresenceNodeIds(
  structuralVisibleNodeIds: ReadonlySet<number>,
  displayVisibleNodeIds: ReadonlySet<number>,
  mode: "auto" | "high" | "medium" | "all",
): Set<number>;

/** collapse/focus/depth/display が揃い mode が解釈できるとき true。false ならマーカー層スキップ（空算出に倒さない） */
function arePresenceInputsComplete(input: {
  mode: "auto" | "high" | "medium" | "all" | null | undefined;
  collapseVisibleNodeIds: ReadonlySet<number> | null | undefined;
  focusVisibleNodeIds: ReadonlySet<number> | null | undefined;
  depthVisibleNodeIds: ReadonlySet<number> | null | undefined;
  displayVisibleNodeIds: ReadonlySet<number> | null | undefined;
}): boolean;
// 注: collapse/focus の「null = フィルタ無し」は完備とみなしてよい（現行 display と同じ）。undefined や depth/display 欠落は非完備。

/** 子 in presence、親 in structural、かつ子・親がともに display に無いもの（フル edge 相当の除外は display 集合照合）。戻りは child id 配列のみ */
function collectPresenceEdgeChildIds(
  nodes: readonly { id: number; parentId: number | null }[],
  presenceNodeIds: ReadonlySet<number>,
  structuralVisibleNodeIds: ReadonlySet<number>,
  displayVisibleNodeIds: ReadonlySet<number>,
): number[];
```

- [x] **Step 1:** RED — 次を別テスト名で固定する  
  - auto + structural に medium、**display 空** → presence に medium  
  - auto + **display に祖先のみ**（high 祖先）＋ medium 子孫が structural → medium が presence、祖先は presence に入らない  
  - auto 完備かつ `structural − display = ∅` → **成功の空**（算出不能スキップとは別名）  
  - 手動 high → 空  
  - collapse 除外／フル edge があるとき presence edge 無し  
  - `arePresenceInputsComplete===false` のとき呼び出し側は `collectPresenceNodeIds` を呼ばずマーカー層スキップ（欠落≠ゼロ）
- [x] **Step 2:** 実装して GREEN
- [x] **Step 3:** コミットしない

**Interfaces メモ（後続）:** presence 算出は MapStage／display state が持つ collapse/focus/depth/resolution/display 集合を入力にする。Task2 は完備判定→算出の順を守る。

---

### Task 1: Pixi — `renderMapPresenceMarkers`

**Files:**
- Create `client/src/components/map/pixi/renderMapPresenceMarkers.ts`
- Test: `client/src/components/map/pixi/__tests__/renderMapPresenceMarkers.test.ts`（既存 pixi テストのモック流儀に合わせる）
- Modify `renderMapScene.ts` / `RenderMapSceneOptions` に `presenceNodeIds` / `presenceEdgeChildIds`（child id 配列のみ）と表示座標 nodes を追加（非完備時はオプション省略＝描かない）

**Interfaces:**
```ts
type RenderPresenceMarkersOptions = {
  nodes: readonly Node[]; // 表示座標
  presenceNodeIds: ReadonlySet<number>;
  presenceEdgeChildIds: readonly number[];
  scale: number; // スクリーン上サイズ維持用
};
/** 戻り: Container。全 children eventMode none。ラベル無し */
function renderMapPresenceMarkers(
  constructors: PixiConstructors,
  options: RenderPresenceMarkersOptions,
): Container;
```

- [x] **Step 1:** RED — presence ノード数ぶん Graphics、edge 本数、全て `eventMode==="none"`（または interactive 無効）。**ズームアウト相当の小さい scale でも円半径が下限未満に潰れない**（ワールド半径 = `max(MIN, CONST/scale)` 等を定数で固定）。**折りたたみ投影後の display 座標**を使い生 `nodes` 座標と食い違うケースでマーカー位置が display 側になることを観測
- [x] **Step 2:** GREEN。`renderMapScene` から worldContainer に追加（通常ノードより手前＝マーカーが隠れない側を選び、presence コンテナ存在を固定）
- [x] **Step 3:** コミットしない

---

### Task 2: scene 配線 — useMemo presence + cull + mode

**Files:**
- Modify `client/src/components/map/useRenderedMapScene.ts`
- Modify `MapStage.tsx`（および `RenderMapSceneOptions` の上流）で `resolutionMode` と structural 用集合を渡す
- 必要なら `useMapDisplayState` 近傍で structural を公開
- Test: hook／MapStage 系の既存テストを拡張、または `useRenderedMapScene` / display の単体。最低:  
  - `visibleKeys` が presence キーを含まない  
  - auto+ズームアウト相当で presence 非空、手動で空  
  - ヒット／選択に使う集合が presence 非含有（既存 `collectVisibleMapKeys(display)` のままであることを assert）

**Interfaces:**
- Consumes: Task 0 関数群、`useViewportCulledRenderNodes`（presence ノード用。**`requiredNodeIds` は常に空 Set**＝選択維持マージ非適用）
- 枝カリング: 線分と viewport world rect（パッド）の交差。純関数を domain または mapViewport 近くに置き単体テスト
- Produces: `renderMapScene` へ presence 付き options。`useMemo` で算出（L-467）

- [x] **Step 1:** RED — 次を固定  
  - `visibleKeys` / `visibleNodeIds` に presence 非混入、手動で presence 空、ヒット／選択集合に非含有  
  - **viewport 外**の presence ノードが cull される（enabled 時）  
  - **enabled 時**枝は線分×AABB（一端のみ画面内でも残る／完全外は落ちる）  
  - **screenSize 不正または culling disabled** → presence 全候補残し  
  - **選択中 ID が presence のみ**でも required マージで presence 描画集合が膨らまない（`requiredNodeIds=∅`）  
  - L-467: presence 導出が `useMemo`（または純関数呼び出し）であり、当該 hook の render 本体で `setState` しないこと（ソース契約または既存パターンに合わせたテスト）  
  - L-002: `arePresenceInputsComplete===false` のとき presence オプションを渡さず（空 Set で「成功のゼロ」に見せない）
- [x] **Step 2:** GREEN
- [x] **Step 3:** コミットしない

---

### Task 3: 結合・ドキュメント・ROADMAP

**Files:**
- 結合: `MapStageVisibility.test.tsx` または page/MapEditor の解像度系テストに「auto ズームアウトで presence コンテナ／マーカー相当が残る」を 1 本（実装に合わせた観測可能な契約）
- Modify `docs/specifications/features.md` §5（存在マーカー）
- Modify `ROADMAP.md` 現在地 1 行（#50）
- `docs/features.md` があれば短文追記
- `cd client && npm run verify`

- [x] **Step 1:** RED/拡張テスト → GREEN
- [x] **Step 2:** docs + ROADMAP
- [x] **Step 3:** `npm run verify` 成功。コミットしない

---

## 完了条件

- [x] Task 0–3 完了、`npm run verify` 成功
- [x] 設計の受け入れ 1–6 をテストまたは docs でカバー
- [x] `visibleNodeIds` / `visibleKeys` に presence 非混入
