# Phase 6 Single-Responsibility Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 6差分の外部挙動を維持しながら、ドメイン計算、状態遷移、React副作用、PixiJS描画、操作参照同期を単一責任の単位へ分離する。

**Architecture:** 純粋計算をReact/PixiJSから先に切り離し、その公開契約へHookとrendererを接続する。`MapStage`は既存の専用Hookを組み合わせるComposition Rootへ戻し、ブラウザ環境依存とPixiJS adapterは境界モジュールへ閉じ込める。

**Tech Stack:** TypeScript、React 19、Next.js 16、PixiJS 8、Jest、Testing Library

**Spec:** `docs/superpowers/specs/2026-09-28-phase6-srp-refactoring-design.md`

## Global Constraints

- 比較基準は最新の`origin/main`（`f9c1a87`）。
- 自動・手動フィルター、祖先表示、非表示ノードの操作制限、160msフェード、reduced motionの挙動を変更しない。
- 永続化、自動レイアウト、PNG/SVG出力は完全な`Node[]`を使い続ける。
- `Home`と`MapStage`の公開props、利用者向け日本語UI文言を維持する。
- 新しい依存パッケージを追加しない。
- 各production変更の前に、その責務の新APIを要求する失敗テストを追加してREDを確認する。
- 自動コミットおよびステージングを行わない。計画中のすべてのcommit stepは明示的に省略する。
- `ROADMAP.md`はPRマージ後まで変更しない。
- 各Task完了時にfocused test、`npm run lint`、`npm run typecheck`、`git diff --check`を実行する。
- 全Task完了時に`npm run verify`を実行する。

---

### Task 1: 解像度段階判定と可視ノード探索を分離

**Files:**
- Create: `client/src/domain/nodes/nodeResolutionLevel.ts`
- Create: `client/src/domain/nodes/nodeVisibility.ts`
- Create: `client/src/domain/nodes/__tests__/nodeResolutionLevel.test.ts`
- Create: `client/src/domain/nodes/__tests__/nodeVisibility.test.ts`
- Delete: `client/src/domain/nodes/nodeResolutionFilter.ts`
- Delete: `client/src/domain/nodes/__tests__/nodeResolutionFilter.test.ts`
- Modify: `client/src/hooks/useMapResolutionFilter.ts`

**Interfaces:**
- Produces: `resolveAutomaticResolutionLevel(scale, previousLevel): ResolutionLevel`
- Produces: `resolveResolutionLevel(mode, scale, previousLevel): ResolutionLevel`
- Produces: `collectVisibleNodeIds(nodes, level): ReadonlySet<number>`

- [ ] **Step 1: 新しい段階判定モジュールのテストを書く**

`nodeResolutionLevel.test.ts`で初期境界、4つのヒステリシス境界、`high → all`、`all → high`、手動モードを既存テストから移す。

```ts
expect(resolveAutomaticResolutionLevel(1.05, "high")).toBe("all");
expect(resolveAutomaticResolutionLevel(0.549, "all")).toBe("high");
expect(resolveResolutionLevel("medium", 0.25, "all")).toBe("medium");
```

- [ ] **Step 2: 新しい可視ノードモジュールのテストを書く**

`nodeVisibility.test.ts`へ重要度混在、祖先、入力順、欠損親、自己参照、循環、10,000ノード線形走査を移す。

```ts
const parentReads = { count: 0 };
const visible = collectVisibleNodeIds(createMeasuredChain(10_000, parentReads), "all");
expect(visible.size).toBe(10_000);
expect(parentReads.count).toBeLessThanOrEqual(10_000);
```

- [ ] **Step 3: focused testを実行してREDを確認する**

Run:
`npm test -- --runInBand src/domain/nodes/__tests__/nodeResolutionLevel.test.ts src/domain/nodes/__tests__/nodeVisibility.test.ts`

Expected: 新しい2モジュールが存在しないためFAIL。

- [ ] **Step 4: productionコードを責務別に移す**

しきい値と段階関数だけを`nodeResolutionLevel.ts`へ、ID mapと処理済み集合による反復探索だけを`nodeVisibility.ts`へ移す。Hookのimportを新しい2モジュールへ更新し、旧モジュールを削除する。

- [ ] **Step 5: GREENと回帰を確認する**

Run:
`npm test -- --runInBand src/domain/nodes src/hooks/__tests__/useMapResolutionFilter.test.ts`

Expected: 全件PASS。10,000ノードの親参照回数が線形上限内。

---

### Task 2: フィルター状態機械をHookから分離

**Files:**
- Create: `client/src/hooks/mapResolutionFilterState.ts`
- Create: `client/src/hooks/__tests__/mapResolutionFilterState.test.ts`
- Modify: `client/src/hooks/useMapResolutionFilter.ts`
- Modify: `client/src/hooks/__tests__/useMapResolutionFilter.test.ts`

**Interfaces:**
- Produces: `ResolutionFilterState`
- Produces: `ResolutionFilterAction`
- Produces: `createResolutionFilterState(): ResolutionFilterState`
- Produces: `reduceResolutionFilterState(state, action): ResolutionFilterState`
- Produces: `resolveEffectiveFilterScale(state, scale): number`

- [ ] **Step 1: 純粋状態遷移テストを書く**

```ts
const reset = reduceResolutionFilterState(manualHighState, {
  type: "reset",
  level: "all",
  pendingScale: 1,
});
expect(reset).toEqual({
  mode: "auto",
  previousAutoLevel: "all",
  pendingResetScale: 1,
});
expect(resolveEffectiveFilterScale(reset, 0.5)).toBe(1);
```

手動からautoへの履歴破棄、pending到達、明示mode操作によるpending解除、同値actionのidentity維持も検証する。

- [ ] **Step 2: REDを確認する**

Run: `npm test -- --runInBand src/hooks/__tests__/mapResolutionFilterState.test.ts`

Expected: 新モジュール未存在でFAIL。

- [ ] **Step 3: reducerと派生scaleを抽出する**

`useMapResolutionFilter.ts`から型、reducer、effective scale計算を新モジュールへ移す。Hookには`useReducer`、layout effects、`useMemo`、公開値の組み立てだけを残す。

- [ ] **Step 4: Hook統合テストを補強する**

Hookテストでは、純粋reducerの内部形状ではなく以下だけを検証する。

- 初期auto/all
- manual固定とauto復帰
- resetScale省略時の現在scale
- resetScale指定時の4モードからの復帰
- pending完了後の通常ヒステリシス
- importance変更によるID再計算

- [ ] **Step 5: GREENを確認する**

Run:
`npm test -- --runInBand src/hooks/__tests__/mapResolutionFilterState.test.ts src/hooks/__tests__/useMapResolutionFilter.test.ts src/app/__tests__/page.test.tsx`

Expected: 全件PASS。

---

### Task 3: visibility keyとブラウザ環境adapterを分離

**Files:**
- Create: `client/src/components/map/pixi/mapVisibilityKeys.ts`
- Create: `client/src/components/map/pixi/__tests__/mapVisibilityKeys.test.ts`
- Create: `client/src/components/map/browserMapVisibilityEnvironment.ts`
- Create: `client/src/components/map/__tests__/browserMapVisibilityEnvironment.test.ts`
- Modify: `client/src/components/map/useMapVisibilityTransition.ts`
- Modify: `client/src/components/map/__tests__/useMapVisibilityTransition.test.tsx`
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`
- Modify: `client/src/components/map/pixi/renderMapEdges.ts`

**Interfaces:**
- Produces: `nodeVisibilityKey(nodeId): string`
- Produces: `edgeVisibilityKey(childNodeId): string`
- Produces: `collectVisibleMapKeys(nodes, visibleNodeIds): ReadonlySet<string>`
- Produces: `createBrowserFrameScheduler(browser, clock): { now, requestFrame, cancelFrame }`
- Produces: `subscribeReducedMotion(browser, query, onChange): { matches, unsubscribe }`

- [ ] **Step 1: key contractの失敗テストを書く**

```ts
expect(nodeVisibilityKey(3)).toBe("node:3");
expect(edgeVisibilityKey(3)).toBe("edge:3");
expect([...collectVisibleMapKeys(nodes, new Set([1, 2]))])
  .toEqual(["node:1", "node:2", "edge:2"]);
```

- [ ] **Step 2: browser adapterの失敗テストを書く**

request/cancelの両方がある場合だけRAF pairを使い、片側欠損時はtimeout pairを使う。購読は初期`matches`を返し、changeを通知し、`unsubscribe`で同じlistenerを解除する。

- [ ] **Step 3: REDを確認する**

Run:
`npm test -- --runInBand src/components/map/pixi/__tests__/mapVisibilityKeys.test.ts src/components/map/__tests__/browserMapVisibilityEnvironment.test.ts`

Expected: 新モジュール未存在でFAIL。

- [ ] **Step 4: 純粋key計算とbrowser adapterを実装する**

`useMapVisibilityTransition.ts`から`collectVisibleKeys`とwindow capability分岐を除去する。Hookはadapterを利用し、animator lifecycle、media購読、scene差し替え、visible key通知だけを調停する。

- [ ] **Step 5: rendererのliteral keyを共通関数へ置換する**

`renderMapNodes.ts`と`renderMapEdges.ts`は`nodeVisibilityKey`、`edgeVisibilityKey`を使う。文字列形式をrenderer内で再定義しない。

- [ ] **Step 6: GREENを確認する**

Run:
`npm test -- --runInBand src/components/map/__tests__/browserMapVisibilityEnvironment.test.ts src/components/map/__tests__/useMapVisibilityTransition.test.tsx src/components/map/pixi`

Expected: 全件PASS。query差し替えでanimator生成回数は1回のまま。

---

### Task 4: PixiJS visibility target adapterを分離

**Files:**
- Create: `client/src/components/map/pixi/pixiVisibilityTarget.ts`
- Create: `client/src/components/map/pixi/__tests__/pixiVisibilityTarget.test.ts`
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`
- Modify: `client/src/components/map/pixi/renderMapEdges.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapEdges.test.ts`

**Interfaces:**
- Produces: `createNodeVisibilityTarget(key, container): MapVisibilityTarget`
- Produces: `createEdgeVisibilityTarget(key, edge): MapVisibilityTarget`

- [ ] **Step 1: adapterの失敗テストを書く**

node adapterはopacity、rendered、interactive、cursorを変更する。edge adapterはopacityとrenderedを変更するが、interactive要求に関係なく`eventMode="none"`を維持する。

```ts
nodeTarget.setInteractive(false);
expect(container).toMatchObject({ eventMode: "none", cursor: "default" });
edgeTarget.setInteractive(true);
expect(edge.eventMode).toBe("none");
```

- [ ] **Step 2: REDを確認する**

Run: `npm test -- --runInBand src/components/map/pixi/__tests__/pixiVisibilityTarget.test.ts`

Expected: 新モジュール未存在でFAIL。

- [ ] **Step 3: adapterを実装しrendererを描画へ集中させる**

renderer内のsetter object literalをfactory呼び出しへ置換する。初期`alpha`、`visible`、`eventMode`はrendererが決定し、遷移中の更新方法はadapterが担当する。

- [ ] **Step 4: GREENを確認する**

Run:
`npm test -- --runInBand src/components/map/pixi/__tests__/pixiVisibilityTarget.test.ts src/components/map/pixi/__tests__/renderMapNodes.test.ts src/components/map/pixi/__tests__/renderMapEdges.test.ts src/components/map/pixi/__tests__/renderMapScene.test.ts`

Expected: 全件PASS。

---

### Task 5: MapStageの副作用を専用Hookへ分離

**Files:**
- Create: `client/src/components/map/useViewportScaleNotification.ts`
- Create: `client/src/components/map/__tests__/useViewportScaleNotification.test.tsx`
- Create: `client/src/components/map/useHiddenNodeInteractionReset.ts`
- Create: `client/src/components/map/__tests__/useHiddenNodeInteractionReset.test.tsx`
- Create: `client/src/components/map/useRenderedMapScene.ts`
- Create: `client/src/components/map/__tests__/useRenderedMapScene.test.tsx`
- Create: `client/src/components/map/__tests__/MapStageVisibility.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- `useViewportScaleNotification(scale, callback): void`
- `useHiddenNodeInteractionReset({ selectedNodeId, editingNodeId, visibleNodeIds, onSelectNode, cancelEditing, cancelActiveGesture }): void`
- `useRenderedMapScene({ runtime, options, viewport, viewportRef }): RenderedMapScene | null`

- [ ] **Step 1: scale通知Hookの失敗テストを書く**

初回scaleを通知し、callback参照だけの変更では再通知せず、次のscale変更は最新callbackへ通知する。

- [ ] **Step 2: hidden reset Hookの失敗テストを書く**

選択または編集中IDが非表示になる場合だけ、paint前に選択解除、編集取消、gesture取消を1回ずつ実行する。可視集合の同値別Setでは解除しない。

- [ ] **Step 3: scene Hookの失敗テストを書く**

runtime到着でsceneを生成し、render input変更で差し替え、viewportだけの変更ではsceneを再生成せずworld transformだけを適用し、cleanupで現在sceneだけを解除する。

- [ ] **Step 4: REDを確認する**

Run:
`npm test -- --runInBand src/components/map/__tests__/useViewportScaleNotification.test.tsx src/components/map/__tests__/useHiddenNodeInteractionReset.test.tsx src/components/map/__tests__/useRenderedMapScene.test.tsx`

Expected: 3つの新Hookが存在しないためFAIL。

- [ ] **Step 5: Hookを実装しMapStageを配線へ縮小する**

`MapStage.tsx`からscale refs/effect、hidden判定layout effect、scene refs/state/render effect/viewport effectを除去する。double-clickの可視ノード限定、keyboard/wheel/viewport/interaction Hookの配線、editor DOMだけを残す。

- [ ] **Step 6: visibility統合テストを専用ファイルへ移す**

`MapStage.test.tsx`から次のPhase 6テストを`MapStageVisibility.test.tsx`へ移す。

- node/edgeの0ms・80ms・160ms
- 途中反転
- scene rebuild
- reduced motion
- hidden時の選択・編集・gesture・double-click解除
- viewport scale通知

共通Pixi mockが必要な場合は`client/src/components/map/__tests__/mapStageTestRuntime.ts`へ抽出し、テストファイル間で共有する。

- [ ] **Step 7: GREENを確認する**

Run: `npm test -- --runInBand src/components/map/__tests__/useViewportScaleNotification.test.tsx src/components/map/__tests__/useHiddenNodeInteractionReset.test.tsx src/components/map/__tests__/useRenderedMapScene.test.tsx src/components/map/__tests__/MapStageVisibility.test.tsx src/components/map/__tests__/MapStage.test.tsx`

Expected: 全件PASS。移動対象のassert内容が維持される。

---

### Task 6: stage interactionのlatest ref同期を分離

**Files:**
- Create: `client/src/components/map/useStageInteractionValues.ts`
- Create: `client/src/components/map/__tests__/useStageInteractionValues.test.tsx`
- Modify: `client/src/components/map/useMapStageInteractions.ts`
- Modify: `client/src/components/map/__tests__/useMapStageInteractions.test.tsx`

**Interfaces:**
- `useStageInteractionValues(options)` returns stable latest-value refs for nodes, visible IDs, viewport, and callbacks.
- Produces: `resolveEffectiveVisibleNodeIds(nodes, visibleNodeIds): ReadonlySet<number>` as a pure helper in the same focused module.

- [ ] **Step 1: latest ref Hookの失敗テストを書く**

初回refsが入力値を指し、rerender後はref identityを維持したまま`.current`だけが最新値になることを検証する。`visibleNodeIds`省略時は全node IDを返す。

- [ ] **Step 2: REDを確認する**

Run: `npm test -- --runInBand src/components/map/__tests__/useStageInteractionValues.test.tsx`

Expected: 新Hook未存在でFAIL。

- [ ] **Step 3: refs同期を抽出する**

`useMapStageInteractions.ts`から6つのcallback/data refと同期layout effectを新Hookへ移す。controller生成、runtime bind、active nodeが非表示になった場合のcancelだけを残す。

- [ ] **Step 4: gesture継続・取消テストを確認する**

同値別Setでは連続moveが継続し、sourceまたはconnection targetが非表示になる場合だけcancelし、highlightをclearして接続しないことを既存統合テストで確認する。

- [ ] **Step 5: GREENを確認する**

Run:
`npm test -- --runInBand src/components/map/__tests__/useStageInteractionValues.test.tsx src/components/map/__tests__/useMapStageInteractions.test.tsx src/components/map/pixi/__tests__/stageInteractions.test.ts`

Expected: 全件PASS。

---

### Task 7: 全差分の回帰確認

**Files:**
- Verify only: all files changed from `origin/main`

- [ ] **Step 1: 責務監査を再実行する**

各productionファイルについて、変更理由を1つの文で説明できることを確認する。複数の独立理由が残る場合は、直前Taskの責務モジュールへ戻す。

- [ ] **Step 2: 全テストとbuildを実行する**

Run: `npm run verify`

Expected: Tailwind scan、ESLint、TypeScript、全Jest suite、Next.js production buildがPASS。

- [ ] **Step 3: 差分品質とGit状態を確認する**

Run:

```bash
git diff --check
git diff --stat origin/main
git status --short --branch
```

Expected: whitespace errorなし。コミット・ステージングなし。Phase 6実装と本リファクタリング設計・計画だけが差分に含まれる。

- [ ] **Step 4: 最終レビューを実施する**

`origin/main`からの全差分を対象に、仕様回帰、単一責任、依存方向、テスト検出力を確認する。指摘があれば失敗テストを追加して修正し、指摘0件まで再レビューする。
