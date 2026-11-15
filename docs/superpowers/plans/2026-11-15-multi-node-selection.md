# 複数ノード選択（候補009） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** キャンバスで複数ノードを選択できるようにし、既存操作は主選択経由で安全に動かし続ける。

**Architecture:** 選択集合・主選択・アンカーの純粋ロジックを domain に置き、`useNodes` が状態を保持して互換 API（`selectedNodeId` / `selectNode`）を維持する。ポインタ入力は `stageInteractions` が修飾キーとしきい値で分岐し、描画は `selectedIds` のメンバーシップでハイライト、矩形中はラバーバンドを重ねる。

**Tech Stack:** TypeScript, React, PixiJS, Jest (jsdom)

**Design:** `docs/superpowers/specs/2026-11-15-multi-node-selection-design.md`

## Global Constraints

- コミットしない（`/feature` 中。コミットは後続 `/commit-ja`）。
- TDD: 実装コードより先に対応テストを追加し RED を確認する。
- `client` 変更後は最終的に `npm run verify` を通す。
- 選択は永続化しない。Undo で選択集合は復元しない。
- 一括編集・複数枝コピー・アウトライン複数選択・複数同時ドラッグは作らない。
- 知見: L-408, L-149, L-061, L-522, L-168。
- 言語: ユーザー向け文言は日本語。識別子は英語。

### ファイル分担（予定）

| パス | 責務 |
| :--- | :--- |
| `client/src/domain/selection/nodeSelection.ts` | 純粋な選択状態遷移（単一・トグル・範囲・矩形確定・prune） |
| `client/src/domain/selection/__tests__/nodeSelection.test.ts` | 上記の単体テスト |
| `client/src/hooks/useNodes.ts`（および関連型） | 状態保持・互換 API・消失時 prune |
| `client/src/components/map/useHiddenNodeInteractionReset.ts` | 折りたたみ非表示時に `pruneMissing` へ接続 |
| `client/src/components/map/useMapStageInteractions.ts` | props/ref 配線（toggle/range/clear/marquee）と `marqueeRect` state 所有 |
| `client/src/components/map/pixi/stageInteractions.ts` | Cmd/Ctrl・Shift・Alt 矩形とパン／接続の分岐 |
| `client/src/components/map/pixi/nodeConnectionGesture.ts` | 接続本体（しきい値遅延なし。pending は stageInteractions） |
| `client/src/domain/platform/isApplePlatform.ts`（新規） | macOS 判定（テスト注入可能な seam） |
| `client/src/components/map/pixi/marqueeSelectGesture.ts`（新規） | Alt 矩形ジェスチャ（ヒット計算） |
| `client/src/components/map/pixi/renderMapNodes.ts` / scene | 複数ハイライト |
| `client/src/components/map/pixi/renderMarquee.ts`（新規・必須） | ラバーバンド描画 |
| `client/src/components/map/pixi/renderMapScene.ts` / `useRenderedMapScene` | marqueeRect を scene へ配線 |
| `client/src/components/map/MapStage.tsx` / `MapEditor.tsx` | props 配線（`selectedNodeIds` 等） |
| `docs/specifications/features.md` | 3.3 節更新 |
| `docs/testing/browser-test-cases.md` | 手動確認節 |
| `ROADMAP.md` | 候補009完了・現在地 |

---

### Task 1: 選択状態の純粋関数

**Files:**
- Create: `client/src/domain/selection/nodeSelection.ts`
- Create: `client/src/domain/selection/__tests__/nodeSelection.test.ts`

- [x] **Step 1: RED** — 次を満たすテストを書く: `selectOnly` / `clear` / `toggle`（追加・除去・主選択付け替え・アンカー） / `addRange`（配列順・アンカー欠落時は selectOnly） / `replaceWithMarquee`・`addMarquee`（**呼び出し側がノード配列順の `ids` を渡す契約**。primary+anchor はその列の末尾。0件は clear） / `pruneMissing`（同一マップ内消失）。domain はソートしない。
- [x] **Step 2: テスト実行** — `npx jest src/domain/selection/__tests__/nodeSelection.test.ts` で RED。
- [x] **Step 3: GREEN** — `NodeSelectionState` と遷移関数を実装。
- [x] **Step 4: テスト実行** — 同ファイルで GREEN。

---

### Task 2: `useNodes` への選択集合の導入（互換維持）と非表示 prune

**Files:**
- Modify: `client/src/hooks/useNodes.ts`
- Modify: `client/src/hooks/__tests__/useNodes.test.ts`（必要なら関連 history テスト）
- Modify: `client/src/components/map/useHiddenNodeInteractionReset.ts`
- Modify: `client/src/components/map/__tests__/useHiddenNodeInteractionReset.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`（hidden reset の props 配線）
- Modify: `client/src/components/map/MapEditor.tsx`（`selectedNodeIds` / 選択 API を MapStage へ渡す配線の受け口）
- Modify: `client/src/app/__tests__/pageLibraryBackup.test.tsx`（既存の保護突入経路を拡張）— **保護モード remount 必須 RED**
- Verify: `client/src/app/page.tsx` の `key={\`\${mapId}:\${storageMode}\`}`。

**保護 remount RED の観測（確定）:** `pageLibraryBackup.test.tsx` の「復元失敗→保護モードへ再マウント」経路を使う。突入前にノードを選択し、突入後に (1) MapEditor が remount されること（`key` 変化 / mount 回数）、かつ (2) 選択が空であること（既存 page テストと同型の `<output data-testid="selected-node-id">` を mock または観測用に用意し、空文字を assert）。`commitLibrary` を page から直接呼ばない。フォールバックの明示 `clearSelection` は remount 不足時の **別ケース**。

**公開 API（確定）:**
- `selectedNodeIds: readonly number[]`（ノード配列順で安定化。設計 §3.2）
- `selectedNodeId: number | null`（≡ `primaryId`、互換）
- `selectNode(id: number | null)`
- `toggleNodeSelection(id: number)`
- `selectNodeRange(targetId: number, visibleNodeIds: readonly number[])` — `visibleNodeIds` は表示中ノードをノード配列順に並べた ID 列。呼び出し側（MapStage / MapEditor）が渡す。`deleteNodeOnly(id, visibleNodeIds)` と同様の契約。
- `setSelectionFromMarquee({ mode: 'replace' | 'add', ids: readonly number[] })` — `ids` は**ノード配列順**（呼び出し側がソート）。domain / hook は再ソートしない。末尾が primary+anchor。
- `clearSelection()`
- `pruneSelectionToVisible(visibleNodeIds: ReadonlySet<number>)` — 折りたたみ非表示など同一マップ内消失向け（内部で `pruneMissing`）

内部は `NodeSelectionState`（`selectedIds: ReadonlySet<number>`）。

- [x] **Step 1: RED** — `selectNode` が単一集合になること、`selectedNodeIds` が `readonly number[]` で返ること、上記公開 API が揃うこと、削除で集合から消えること、マップ文書の置き換え（`replaceMap`）で全解除されること、**保護モード突入時は page の `key={mapId:storageMode}` remount により選択が空になること**を必須で観測（明示 `clearSelection` は remount 不足時の別ケース）、複数選択中でも Delete 等／ヘッダー操作が `primaryId` のみに効くこと、**折りたたみ等で非表示になった ID は `pruneSelectionToVisible` / `useHiddenNodeInteractionReset` 経由で集合から除去され、非主選択のみ隠れても全解除せず残りの主選択を付け替えること**（現行の主選択隠れ → `onSelectNode(null)` 全解除から変更）。
- [x] **Step 2: RED 確認**。
- [x] **Step 3: GREEN** — 内部を `NodeSelectionState` に置き換え。`selectedNodeId` ≡ `primaryId`。既存の `setSelectedNodeId(...)` 呼び出しを遷移関数経由へ。マップ切替・JSON 読込は `replaceMap`。保護モードは **page key remount を維持**（足りないときだけ別途 MapEditor `clearSelection`）。`useHiddenNodeInteractionReset` は選択集合全体を見て `pruneSelectionToVisible`（または同等）を呼ぶ。**主選択が隠れたとき**は現行どおり `cancelActiveGesture`（編集中ノード隠れなら `cancelEditing` も）。**非主選択のみ隠れで主選択が残るとき**は gesture/editing をキャンセルしない。
- [x] **Step 4: 関連テスト GREEN** — `useNodes` / hidden reset / history / autoLayout など既存スイートが通ること。

---

### Task 3: ポインタ入力（トグル・範囲・接続分離・macOS Ctrl・背景解除）

**Files:**
- Create: `client/src/domain/platform/isApplePlatform.ts`（および `__tests__/isApplePlatform.test.ts`）
- Modify: `client/src/components/map/pixi/stageInteractions.ts`
- Modify: `client/src/components/map/pixi/nodeConnectionGesture.ts`（変更最小。しきい値遅延は持たない。接続本体は活性化後に stageInteractions から開始）
- Modify: `client/src/components/map/useMapStageInteractions.ts`（toggle/range/clear を ref 経由で stageInteractions へ）
- Modify: `client/src/components/map/MapStage.tsx`（コールバック props）
- Modify: `client/src/components/map/MapEditor.tsx`（`toggleNodeSelection` / `selectNodeRange` / `clearSelection` 等を MapStage へ配線）
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx` および/または `pixi/__tests__/stageInteractions.test.ts` / `nodeConnectionGesture.test.ts` / `useMapStageInteractions.test.tsx`

**macOS 判定（確定）:** `isApplePlatform(platform = navigator.platform)` を domain に置く。本番は `navigator.platform`、テストは引数注入で mac / 非 mac を切替。トグル修飾: Apple なら `metaKey`、非 Apple なら `ctrlKey`。Apple で `ctrlKey` のみではトグルしない（L-149）。

**背景 pointerdown / pointerup（確定・設計 §4.4 に合わせる）:** 現行の背景 pointerdown 即 `onSelectNode(null)` をやめる。`Alt` 開始時・パン開始時は clear しない（加算 `Alt+Cmd/Ctrl` と両立）。

**背景の pending + activated（確定・Shift と同型）:** 空き背景 pointerdown では clear せず、パンまたは marquee の **pending** だけ開始する。所有は `stageInteractions`。`createCanvasPanGesture` / marquee に **activated を公開**する（`dragActivation` が一度でも超えたら true。既存 gesture が非公開なら薄いラッパか戻り値で公開）。

終端（`pointerup` / `pointerupoutside` / `pointercancel`、および gesture の `end`/`cancel` 経由）は同じ規則:
- **未 activated** の全終端 → 修飾キーに関わらず全解除（設計 §4.4 のしきい値未満＝全解除）。
- **activated 済み** の全終端 → clear しない（パン確定 or marquee 確定。誤 clear 防止）。
判定は「この背景ジェスチャが activated したか」のみ。終端種別に依存しない。

**Shift 接続 vs 範囲（確定）:** しきい値分岐と選択コールバックは **`stageInteractions` 側**に置く（`nodeConnectionGesture` に selection API は持たせない）。

契約:
1. `Shift`+node の pointerdown: 選択は変更しない。`createDragActivation`(4px) 付きの **pending** ジェスチャだけ開始。
2. しきい値超の初回 move（`onActivated`）: その時点で `onSelectNode(nodeId)`（単一置換）し、続けて接続本体（`createNodeConnectionGesture` 相当）を開始。
3. しきい値未満で pointerup: `onSelectNodeRange(targetId, visibleNodeIdsOrdered)`。
4. 非 Shift の pointerdown 選択は現行どおり可。

- [x] **Step 1: RED** — プレーンクリック＝単一、`metaKey`（Cmd）トグル、非 Apple の `ctrlKey` トグル、Apple で `ctrlKey` のみではトグルしない（`isApplePlatform` seam）、`Shift`+pointerdown では選択不変、`Shift`+クリック（未 activated）＝範囲、`Shift`+ドラッグ（activated）＝接続＋単一置換、**背景未 activated の全終端（up/upoutside/cancel）は修飾キー問わず全解除**、**背景 activated（パン／marquee）後の全終端では clear しない**、**背景 pointerdown / Alt 開始では clear しない**、`useMapStageInteractions` 経由でコールバックが届くこと。
- [x] **Step 2: RED 確認**。
- [x] **Step 3: GREEN** — 上記分岐を実装。範囲呼び出しは表示中ノードの配列順 ID 列を渡す。
- [x] **Step 4: GREEN 確認**。L-149 回帰（contextmenu + ctrlKey）が既存どおり通ることを確認。

---

### Task 4: Alt 矩形選択ジェスチャとラバーバンド

**Files:**
- Create: `client/src/components/map/pixi/marqueeSelectGesture.ts`
- Create: `client/src/components/map/pixi/__tests__/marqueeSelectGesture.test.ts`
- Create: `client/src/components/map/pixi/renderMarquee.ts`
- Create: `client/src/components/map/pixi/__tests__/renderMarquee.test.ts`
- Modify: `stageInteractions.ts`（Alt 空き背景でジェスチャ開始。開始時は clear しない）
- Modify: `useMapStageInteractions.ts`（`marqueeRect` の `useState` 所有。`onMarqueeRectChangeRef` → setter。`setSelectionFromMarquee` の props→ref。`connectionTargetNodeId` と同型）
- Modify: `MapStage.tsx`（hook から受け取った `marqueeRect` を scene へ渡す）
- Modify: `MapEditor.tsx`（`setSelectionFromMarquee` を MapStage へ配線）
- Modify: `renderMapScene.ts` / `useRenderedMapScene`（`marqueeRect` prop を受け取り `renderMarquee` を呼ぶ）
- Modify: MapStage テスト（ジェスチャ確定の配線）

**`marqueeRect` 再描画経路（確定・1本）:** 所有は **`useMapStageInteractions` の `useState`**（`connectionTargetNodeId` と同型）。`stageInteractions` → `onMarqueeRectChangeRef` → hook state → MapStage が scene prop に渡す → `renderMarquee`。確定時は `setSelectionFromMarquee` を呼び、矩形 state を `null` に戻す。

- [x] **Step 1a: RED（ジェスチャ）** — `marqueeSelectGesture.test.ts` で Alt+空き背景ドラッグが**表示中ノード**（`visibleNodeIds` フィルタ必須）のうち**外接矩形と交差**する ID を**ノード配列順**で返すこと（非表示・中心だけのノードは含めない）、Alt のみ置換、Alt+Cmd/Ctrl 加算、0件クリア、Alt なしはパンのまま。開始時に既存選択を clear しないこと。
- [x] **Step 1b: RED（描画）** — `renderMarquee.test.ts` で `marqueeRect` があるときラバーバンドが描画され、`null` のとき描画しないこと。
- [x] **Step 2: RED 確認**。
- [x] **Step 3: GREEN** — ジェスチャ、`onMarqueeRectChange`→`useMapStageInteractions` state→MapStage→scene の経路、`renderMarquee`、`MapEditor` 配線。確定時にノード配列順の `ids` で `setSelectionFromMarquee`。
- [x] **Step 4: GREEN 確認**。

---

### Task 5: 複数ハイライト描画

**Files:**
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`
- Modify: `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`
- Modify: `MapStage.tsx` / `MapEditor.tsx` / `useRenderedMapScene` 等の props（`selectedNodeIds` を描画まで通す）

- [x] **Step 1: RED** — 複数 ID が選択スタイルになること、非選択は通常スタイル。
- [x] **Step 2: RED 確認**。
- [x] **Step 3: GREEN** — `selectedNodeId` 比較を `selectedIds.has`（または配列）へ。
- [x] **Step 4: GREEN 確認**。

---

### Task 6: Escape 全解除（必須）

**Files:**
- Modify: `client/src/components/map/useNodeKeyboardShortcuts.ts`（置き場をここに固定）
- Modify: `client/src/components/map/__tests__/useNodeKeyboardShortcuts.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`（`onClearSelection`・`isSiblingReorderActive`・`isContextMenuOpen` の配線。`useNodeKeyboardShortcuts` / `useSiblingReorderDragEscape` / context menu はいずれも MapStage）
- Modify: `client/src/components/map/MapEditor.tsx`（`clearSelection` を MapStage の `onClearSelection` へ渡す）

**API 追加（確定）:** `onClearSelection: () => void` に加え:
- `isSiblingReorderActive: () => boolean`
- `isContextMenuOpen: () => boolean`
- **同一 keydown 競合対策（必須）:** `useSiblingReorderDragEscape` は先に登録され `cancelActiveGesture` 後に `isSiblingReorderActive()` が false になる（MapStage L220 vs L272）。ガード true だけでは不足。Escape 選択解除は **`event.defaultPrevented === true` ならスキップ**する（並べ替え Escape が `preventDefault` 済みの同一イベントで誤クリアしない）。メニュー閉じは `preventDefault` しないため、`isContextMenuOpen()` ガードは維持。

**優先（確定）:**
1. インライン編集中／`isEditing`
2. `enabled === false` / `isInteractiveTarget`
3. `event.defaultPrevented` → 触らない（並べ替え Escape など）
4. `isContextMenuOpen()` → 触らない（メニュー閉じ後も選択残す）
5. `isSiblingReorderActive()` → 触らない（防御的。同一イベントでは 3 が主）
6. それ以外 → `onClearSelection()`

- [x] **Step 1: RED** — 非編集・有効・ガード false・`defaultPrevented` false で Escape → 全解除。編集中・interactive・enabled false では動かない。`isContextMenuOpen===true` で `onClearSelection` 非呼び出し。**並べ替え中 Escape を模擬し `preventDefault` 済みの同一 keydown では `onClearSelection` 非呼び出し**（`isSiblingReorderActive` が既に false でも可）。
- [x] **Step 2–4: RED → GREEN → 確認。

---

### Task 7: 仕様・ブラウザテスト・ROADMAP

**Files:**
- Modify: `docs/specifications/features.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `ROADMAP.md`

- [x] **Step 1:** features.md の **目次・概要の Phase 17 記載**と **3.3** を複数選択仕様に更新（操作・主選択・Alt 矩形・パンとの関係）。あわせて **§3.7**（および「直ちに接続開始」と書く関連表）を、接続は **4px しきい値超で開始**・未満は範囲選択、に合わせて更新（Task 3 の遅延化と矛盾させない）。**§5.5** とそれを参照する **§10.1**（および「非表示→`onSelectNode(null)` 全解除」と書く箇所）を、Task 2 の `pruneSelectionToVisible` に合わせる（非主選択のみ隠れは集合から除去して主選択を付け替え／残す。主選択隠れ時のみ既存どおり gesture cancel 等）。全解除だけに読める文言を残さない。
- [x] **Step 2:** browser-test-cases に節を追加（Cmd/Ctrl、Shift、Alt 矩形、接続との分離、主選択操作、背景クリック解除、Escape）。
- [x] **Step 3:** ROADMAP で候補009を `[x]`、現在地と最終更新日を更新。候補010は未完了のまま。

---

### Task 8: 全体検証

- [x] **Step 1:** `cd client && npm run verify` を実行し、すべて成功することを確認する。
- [x] **Step 2:** 失敗があれば修正して再実行（コミットはしない）。
