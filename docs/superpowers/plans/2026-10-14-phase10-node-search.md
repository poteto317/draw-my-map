# Phase 10: ノード検索と移動 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`。AGENTS.mdに従い、タスクごとに新しい実装者を起動し、別エージェントの仕様適合・品質レビュー完了後に次へ進む。インライン実装はユーザーの明示指示がある場合のみ。

**Goal:** ヘッダーの検索欄でノードのラベルを部分一致で検索し、結果の一覧から選んだノードを選択してキャンバスの中央へ移動できるようにする。解像度フィルターで隠れたノードも結果に出し、選ぶと表示モードを切り替えて表示する。

**Architecture:** 検索の純関数（正規化・索引・検索）→ Homeのフック（検索語と結果、選択時の存在確認・表示モードの切り替え・選択・移動の要求）→ MapStageの移動の要求の処理 → 検索欄と一覧の部品 → ページの結合、の順に構成する。表示位置はMapStageが持ち続け、Homeは`sequence`付きの移動の要求だけを渡す。

**Tech Stack:** 既存TypeScript / React 19 / Next.js 16 / PixiJS 8 / Jest / Testing Library / user-event。

**Spec:** `docs/superpowers/specs/2026-10-14-phase10-node-search-design.md`

## Global Constraints

- 新規依存なし。マップのV3保存形式（JSON・localStorage）と編集履歴を変えない。検索・結果の選択・表示モードの切り替え・表示位置の移動は、いずれも履歴に積まず、`documentRevision`も増やさない。
- 検索はメモリ上の現在の`nodes`だけを対象に、入力のたびに同期で行う。デバウンスや非同期処理は入れない（L-399）。
- 検索結果は配列の位置ではなくノードIDで扱い、選択を実行する時点で、そのIDのノードが現在のマップに実在するかを確かめ直す（L-035, L-037）。
- 検索欄への入力中に、既存のキーボード操作（Tab・Enter・Delete・Backspace・F・Ctrl/Cmd+Z・Ctrl+Y）と枝のコピー＆ペーストを発火させない。文字入力先の判定は既存の`isEditableTarget`と各フックの既存の判定に従い、独自の判定を足さない（L-061, L-191）。
- IME変換中（`isComposing`または`keyCode === 229`）のEnter・Escape・矢印キーは検索欄の操作として扱わない（L-157）。
- 新しく追加するコールバック・状態のpropsは必須にし、ページの結合テストで配線を確かめる（L-060）。
- 実装は`codex/phase10-node-search`ブランチ、`.worktrees/codex/phase10-node-search`で、タスク順にサブエージェント駆動と独立した仕様・品質レビューを行う。
- 各実装タスクでTDDと`cd client && npm run verify`を行う。最後にROADMAP.mdを更新し、Phase 11以降を完了にしない。

## Review Focus

1. 検索語とラベルの正規化が一致し（NFKC＋小文字化、検索語だけtrim）、空ラベル・空白だけの検索語・上限50件と総数の境界が仕様どおり（Task 1）。
2. 結果をIDで扱い、マップの置き換え・Undo・削除の後に古い結果や存在しないIDで状態を変えない（Task 2・4・5）。
3. 隠れたノードを選ぶと、表示モードの切り替えと選択が同じバッチで確定し、`useHiddenNodeInteractionReset`が選択を解除しない（Task 2・5）。
4. 検索欄の入力・IME変換・Enterのリピート・候補のクリックやダブルクリックが、キャンバスのショートカット・コピー＆ペースト・ダブルクリックでのノード追加へ流れない（Task 4・5）。
5. 移動の要求は`sequence`ごとに1回だけ処理され、Pixiの初期化前は保留し、マップ復元で失効する。`nodes`の変化は対象消失を検出し、処理済み要求は再実行しない（Task 3）。
6. jsdomで再現できないフォーカス・IME・Safariの挙動を、合成イベントのテストだけで成功と主張しない（Task 4・5）。

関連知見: L-001, L-035, L-037, L-048, L-057, L-060, L-061, L-148, L-150, L-154, L-155, L-156, L-157, L-160, L-183, L-191, L-248, L-285, L-317, L-378, L-399, L-408, L-421, L-431。実装開始前にdev-flow-kitの優先度Aチェックリストと関連本文を読む。

## File Structure

| ファイル | 責務 |
| --- | --- |
| `client/src/domain/search/nodeLabelSearch.ts`（新規） | 正規化、索引の作成、検索（純関数） |
| `client/src/domain/nodes/nodeResolution.ts` | 重要度から、そのノードが見える最も狭い段階を求める |
| `client/src/config/resolutionLevelLabels.ts`（新規） | 段階の表示名の共有 |
| `client/src/components/layout/ResolutionFilterSelector.tsx` | 段階の表示名を共有の定数から使う |
| `client/src/types/nodeFocusRequest.ts`（新規） | 移動の要求の型 |
| `client/src/hooks/useNodeLabelSearch.ts`（新規） | 検索語の状態、索引と結果のメモ化、隠れているかの付与 |
| `client/src/hooks/useNodeSearchNavigation.ts`（新規） | 結果の選択（存在確認・表示モードの切り替え・選択・移動の要求・通知） |
| `client/src/components/map/useNodeFocusRequest.ts`（新規） | MapStageの中で移動の要求を処理する |
| `client/src/components/map/MapStage.tsx` | 必須props `focusRequest`の追加 |
| `client/src/components/layout/nodeSearchKeyAction.ts`（新規） | 検索欄のキー操作の判定（純関数） |
| `client/src/components/layout/NodeSearchBox.tsx`（新規） | 検索欄（combobox）と結果の一覧（listbox）、状態表示 |
| `client/src/components/layout/AppHeader.tsx`, `client/src/app/page.tsx` | 検索の枠の追加、配線、通知の表示 |

## 実装前

- [ ] `git status --short`とworktree一覧を確認し、`superpowers:using-git-worktrees`で`.worktrees/codex/phase10-node-search`（ブランチ`codex/phase10-node-search`、起点は最新の`main`）を準備する。本計画・設計書を実装worktreeへ持ち込み、元の未コミット変更は上書きしない。
- [ ] `cd client && npm run verify`で基準結果を記録する。
- [ ] 実装者にはタスク本文・Global Constraints・依存タスクのInterfacesを渡す。独立二段階レビューと修正の再レビューを通す。コミットは日本語Conventional Commitsで対象ファイルを指定する。明示依頼なしにpush・PR作成・マージを行わない。

### Task 1: 検索の純関数

**Files:**
- Create: `client/src/domain/search/nodeLabelSearch.ts`
- Create: `client/src/domain/search/__tests__/nodeLabelSearch.test.ts`

**Interfaces:**
- `MAX_NODE_SEARCH_RESULTS = 50`。
- `normalizeNodeSearchText(text: string): string`（`text.normalize("NFKC").toLowerCase()`。trimしない）。
- `normalizeNodeSearchQuery(query: string): string`（`normalizeNodeSearchText(query).trim()`）。
- `NodeSearchIndexEntry = NodeSearchMatch & { normalizedLabel: string }`、`NodeSearchIndex = readonly NodeSearchIndexEntry[]`。codecのような不透明な型にはせず、テストで索引エントリへのアクセスも計測可能にする。
- `createNodeSearchIndex(nodes: readonly Node[]): NodeSearchIndex`。
- `NodeSearchMatch = { nodeId: number; label: string; parentLabel: string | null }`（`label`と`parentLabel`は`getNodeDisplayLabel`を通した表示用。根と、親が配列に無い場合の`parentLabel`は`null`）。
- `NodeSearchResultSet = { matches: NodeSearchMatch[]; total: number }`。
- `searchNodeLabels(index: NodeSearchIndex, query: string, limit?: number): NodeSearchResultSet`（`limit`の既定は`MAX_NODE_SEARCH_RESULTS`。正規化した検索語が空なら`{ matches: [], total: 0 }`）。

- [ ] **Step 1: REDテスト（照合規則）。** 次を1つずつ確かめる。部分一致（先頭・途中・末尾）。大文字小文字の同一視（`"ABC"`と`"abc"`）。全角英数と半角英数の同一視（`"ＡＢＣ１"`と`"abc1"`）。半角カナと全角カナの同一視（`"ｶﾞｲﾄﾞ"`と`"ガイド"`）。ひらがなとカタカナは同一視しない（`"がいど"`は`"ガイド"`に一致しない）。検索語の前後の半角・全角空白を無視し、空白だけの検索語は結果なし。検索語の途中の空白は文字として照合する（`"a b"`は`"a b c"`に一致し、`"ab"`には一致しない）。改行を含むラベルに一致する。空ラベルのノードは、どの検索語（`"新しい"`を含む）にも一致しない。

```ts
const index = createNodeSearchIndex([
  createTestNode({ id: 1, label: "ＡＢＣ１" }),
  createTestNode({ id: 2, label: "" }),
]);
expect(searchNodeLabels(index, " abc1　")).toEqual({
  matches: [{ nodeId: 1, label: "ＡＢＣ１", parentLabel: null }],
  total: 1,
});
expect(searchNodeLabels(index, "新しい").total).toBe(0);
```

- [ ] **Step 2: REDテスト（結果の形と上限）。** 結果は`nodes`配列の順（親より子が前の配列も、その順のまま）。`label`は元のラベル（正規化前）、`parentLabel`は親の表示用のラベル（親のラベルが空なら「新しいノード」）、根は`null`。一致が50件ちょうどなら`matches`50件・`total`50、51件なら`matches`は先頭50件・`total`51。`limit`を渡すとその件数まで。入力の配列と各ノードを変更しない。
- [ ] **Step 3: REDテスト（線形性。L-431）。** 時間計測ではなく、10,000件の逆順に並んだ深い鎖（各ノードの親が配列の後ろにある）を、配列と各要素の両方でProxyに包んで`createNodeSearchIndex`へ渡し、配列要素と各ノードの`id`・`parentId`・`label`の読み取り回数がノード数の定数倍以内であることを確かめる（親を`find`で探すO(n²)を検出する）。`searchNodeLabels`には、作成後の索引配列と各エントリを別のProxyで包んで渡す。全件一致／不一致の両方で索引要素へのアクセスとnormalizedLabel読み取りが各々件数の定数倍以内であることを確認し、索引内の二重走査も検出する。元のnodesへの読み取りが増えないことも別に確認する。定数上限は配列要素アクセス10N、各フィールド読み取り10Nとし、N=1,000と10,000の双方で検証する（実装の正確な読み取り回数とは結合させない）。
- [ ] **Step 4: RED確認。** `cd client && npm test -- --runInBand nodeLabelSearch`。
- [ ] **Step 5: 実装。** 索引の作成でIDから表示用ラベルを引く`Map`を1回作り、各ノードの正規化したラベルと親の表示用ラベルを前計算する。検索は正規化した検索語で索引を1回走査し、`limit`件までを集めつつ総数を数える。
- [ ] **Step 6: GREENと全体検証。** Step 4と`npm run verify`。
- [ ] **Step 7: 二段階レビュー後コミット。** `feat(search): ノードのラベルの部分一致検索を追加する`

### Task 2: 検索と結果の選択のフック

**Files:**
- Modify: `client/src/domain/nodes/nodeResolution.ts`
- Extend: `client/src/domain/nodes/__tests__/nodeResolution.test.ts`（無ければ作成）
- Create: `client/src/config/resolutionLevelLabels.ts`
- Modify: `client/src/components/layout/ResolutionFilterSelector.tsx`
- Regression: `client/src/components/layout/__tests__/ResolutionFilterSelector.test.tsx`
- Create: `client/src/types/nodeFocusRequest.ts`
- Create: `client/src/hooks/useNodeLabelSearch.ts`
- Create: `client/src/hooks/useNodeSearchNavigation.ts`
- Create: `client/src/hooks/__tests__/useNodeLabelSearch.test.ts`
- Create: `client/src/hooks/__tests__/useNodeSearchNavigation.test.ts`

**Interfaces:**
- Consumes: Task 1の`createNodeSearchIndex`・`searchNodeLabels`・`NodeSearchMatch`。
- `resolveMinimumVisibleLevel(importance: NodeImportance): ResolutionLevel`（high → `"high"`、medium → `"medium"`、low → `"all"`。そのノード自身が見える最も狭い段階）。
- `RESOLUTION_LEVEL_LABELS: Readonly<Record<ResolutionLevel, string>>`（`{ high: "高のみ", medium: "中以上", all: "すべて" }`）。`ResolutionFilterSelector`の候補の表示名と「現在: …」はこの定数から作る（自動の「自動」は部品側に残す）。
- `NodeFocusRequest = { nodeId: number; sequence: number; documentRevision: number }`。
- `NodeSearchListItem = NodeSearchMatch & { hidden: boolean }`。
- `useNodeLabelSearch(options: { nodes: readonly Node[]; visibleNodeIds: ReadonlySet<number> }): { query: string; setQuery: (query: string) => void; hasQuery: boolean; matches: NodeSearchListItem[]; total: number }`（`hasQuery`は正規化した検索語が空でないか）。
- `NodeSearchNavigationResult = "navigated" | "revealed" | "missing"`。
- `useNodeSearchNavigation(options: { nodes: readonly Node[]; visibleNodeIds: ReadonlySet<number>; documentRevision: number; setResolutionMode: (mode: ResolutionFilterMode) => void; selectNode: (id: number | null) => void }): { navigateToNode: (nodeId: number) => NodeSearchNavigationResult; focusRequest: NodeFocusRequest | null; notice: OperationNotice | null }`。
- 通知の文言: 切り替え「表示を『${RESOLUTION_LEVEL_LABELS[level]}』に切り替えました。ズームに連動させるには『自動』を選んでください。」（`kind: "status"`）、存在しない「ノードが見つかりませんでした。」（`kind: "error"`）。

- [ ] **Step 1: REDテスト（段階と表示名）。** 3つの重要度それぞれで、`isNodeVisibleAtLevel(importance, resolveMinimumVisibleLevel(importance))`が真で、1段狭い段階では偽（highを除く）。`ResolutionFilterSelector`の既存テストがそのまま通る（表示名の変更なし）。
- [ ] **Step 2: REDテスト（`useNodeLabelSearch`）。** `renderHook`で、`setQuery`後に一致がノードIDと`hidden`付きで返る（`visibleNodeIds`に無いノードは`hidden: true`）。`nodes`を差し替える（ラベル変更・削除・マップ置き換え相当）と、同じ検索語のまま結果が新しい`nodes`から求め直される。`visibleNodeIds`の変化で`hidden`だけが変わる。空白だけの検索語で`hasQuery: false`・結果なし。`nodes`が同じ参照のまま検索語だけを変えたときに索引を作り直さない（`createNodeSearchIndex`をspyして呼び出し回数を確かめる）。
- [ ] **Step 3: REDテスト（`useNodeSearchNavigation`）。** 見えているノード: `"navigated"`を返し、`selectNode(id)`を呼び、`setResolutionMode`を呼ばず、`focusRequest`が`{ nodeId: id, sequence: 1, documentRevision }`、通知を変えない。同じノードをもう一度選ぶと`sequence: 2`（同じIDでも新しい要求）。隠れた中重要度のノード: `"revealed"`、`setResolutionMode("medium")`、選択と移動の要求、切り替えの通知（段階名「中以上」）。隠れた低重要度のノード: `setResolutionMode("all")`と通知の段階名「すべて」。存在しないID: `"missing"`、`selectNode`・`setResolutionMode`を呼ばず、`focusRequest`を変えず、エラーの通知。`documentRevision`が変わると通知が消え（`useRevisionScopedNotice`）、公開focusRequestもnullになる。同じIDを持つ新しい文書へ置換した後の新しい選択では、増加したsequenceと新documentRevisionで要求する。
- [ ] **Step 4: RED確認。** `cd client && npm test -- --runInBand nodeResolution ResolutionFilterSelector useNodeLabelSearch useNodeSearchNavigation`。
- [ ] **Step 5: 実装。** `useNodeLabelSearch`は`useMemo`で索引（依存は`nodes`）と結果（依存は索引と検索語）、`hidden`の付与（依存は結果と`visibleNodeIds`）を分ける。`useNodeSearchNavigation`は、その時点の`nodes`からIDで探し（配列の位置を使わない）、隠れていれば`setResolutionMode`、続けて`selectNode`、`focusRequest`の更新を同じ呼び出しの中で行う。`sequence`は関数型の`setState`で1ずつ増やす。要求にdocumentRevisionを格納し、現在の世代と異なる保存済み要求は描画時にnullとして公開する。要求の非公開化でsequenceを巻き戻さない。通知は`useRevisionScopedNotice`で持つ。
- [ ] **Step 6: GREENと全体検証。** Step 4と`npm run verify`。
- [ ] **Step 7: 二段階レビュー後コミット。** `feat(search): 検索結果の選択で表示の切り替えと移動を要求する`

### Task 3: MapStageでの移動の要求の処理

**Files:**
- Create: `client/src/components/map/useNodeFocusRequest.ts`
- Create: `client/src/components/map/__tests__/useNodeFocusRequest.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`
- Extend: `client/src/components/map/__tests__/MapStage.test.tsx`
- Adjust（必須props追加）: `client/src/app/page.tsx`（この時点では`focusRequest={null}`を渡す。配線はTask 5）、`client/src/components/map/__tests__/MapStageVisibility.test.tsx`、`MapStageHistory.test.tsx`、`MapStageContextMenu.test.tsx`、`client/src/components/map/testing/AutoLayoutMapStageHarness.tsx`（ほか`rg "<MapStage"`で列挙したもの）

**Interfaces:**
- Consumes: Task 2の`NodeFocusRequest`。
- `useNodeFocusRequest(options: { request: NodeFocusRequest | null; documentRevision: number; nodes: readonly Node[]; screen: ScreenSize | null; hasActiveGesture: () => boolean; cancelActiveGesture: () => void; onFocusNode: (node: Node, screen: ScreenSize) => void }): void`。
- MapStageへ必須props `focusRequest: NodeFocusRequest | null`を追加し、既存の`documentRevision`と内部の`screen`（`runtime ? runtime.app.screen : null`）・`hasActiveGesture`・`cancelActiveGesture`・`focusNode`を渡す。

- [ ] **Step 1: REDテスト（フック）。** `renderHook`で、新しい`sequence`の要求ごとに`onFocusNode`をそのノードと画面サイズで1回呼ぶ。同じ要求のまま再描画しても、`nodes`だけが変わっても再び呼ばない。同じ`nodeId`で`sequence`が増えれば再び呼ぶ。`screen`が`null`の間は呼ばず、`screen`が得られた再描画で1回呼ぶ（保留）。ノードが無いIDは呼ばず、その後`nodes`にそのIDが現れても呼ばない（処理済み）。ジェスチャー中（`hasActiveGesture()`が真）は`cancelActiveGesture`を先に呼んでから`onFocusNode`を呼ぶ。`request`が`null`なら何もしない。同じdocumentRevisionの最新`nodes`の座標を使う。screen=null中に対象を削除→同IDを追加→screen準備の順でも移動しない。screen=null中にdocumentRevisionが進み、同IDのノードがある状態でscreenが準備されても旧要求で移動せずcancelActiveGestureも呼ばない。新世代の新要求は通常どおり実行する。
- [ ] **Step 2: REDテスト（MapStage）。** `focusRequest`を`null`から`{ nodeId, sequence: 1, documentRevision }`へ変えて再描画すると、ワールドのコンテナの位置がそのノードの中心を画面（800×600）の中央へ置く値になる（既存のFキーのテストと同じ確かめ方）。拡大率は変わらない。同じ要求で再描画しても位置を戻さない（利用者のパン後に同じ要求で再描画しても動かない）。
- [ ] **Step 3: RED確認。** `cd client && npm test -- --runInBand useNodeFocusRequest MapStage`。
- [ ] **Step 4: 実装。** 処理済みの`sequence`を`ref`で持つ。最新の`nodes`・コールバックは既存の`useMapViewportShortcut`と同じく`useLayoutEffect`で`ref`へ写し、要求の処理は`[request, screen, nodes, documentRevision]`を依存にした`useEffect`で行う。最初に世代照合、次に処理済み判定、対象の存在確認、screen確認の順で判定する。世代不一致または対象不在は要求を処理済みにし、screen=nullで対象が存在するときだけ保留する。nodes依存で再実行しても処理済みガードが移動の重複を防ぐ。MapStageの全利用箇所に`focusRequest`を渡す（テストでは`null`）。
- [ ] **Step 5: GREENと全体検証。** Step 3と`npm run verify`。
- [ ] **Step 6: 二段階レビュー後コミット。** `feat(map): 外部からのノードへの移動の要求を処理する`

### Task 4: 検索欄と結果の一覧の部品

**Files:**
- Create: `client/src/components/layout/nodeSearchKeyAction.ts`
- Create: `client/src/components/layout/__tests__/nodeSearchKeyAction.test.ts`
- Create: `client/src/components/layout/NodeSearchBox.tsx`
- Create: `client/src/components/layout/__tests__/NodeSearchBox.test.tsx`

**Interfaces:**
- Consumes: Task 2の`NodeSearchListItem`。
- `NodeSearchKeyAction = "open" | "next" | "previous" | "select" | "close" | "clear" | "prevent"`。
- `resolveNodeSearchKeyAction(input: { key: string; isComposing: boolean; keyCode: number; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; isOpen: boolean; hasQuery: boolean; hasResults: boolean }): NodeSearchKeyAction | null`。
- `NodeSearchBox(props: { query: string; onQueryChange: (query: string) => void; hasQuery: boolean; matches: readonly NodeSearchListItem[]; total: number; onSelectResult: (nodeId: number) => void })`。

キーの規則（純関数）: IME変換中（`isComposing`または`keyCode === 229`）はすべて`null`。Ctrl・Cmd・Altを伴うキーは`null`。ArrowDown: 閉じていて`hasQuery`なら`"open"`、開いていて`hasResults`なら`"next"`。ArrowUp: 開いていて`hasResults`なら`"previous"`。Enter: リピートなら`null`、開いていて`hasResults`なら`"select"`、それ以外のEnter（0件または一覧閉じ）は`"prevent"`（選択せず既定動作のみ抑止）。Escape: 開いていれば`"close"`、閉じていて`hasQuery`なら`"clear"`。それ以外は`null`。

- [ ] **Step 1: REDテスト（キーの規則）。** 上の規則の各分岐と、IME変換中（`isComposing: true`と`keyCode: 229`の両方）のEnter・Escape・矢印、`repeat: true`のEnter、修飾キー付きのEnterが`null`になること。開いていて0件のEnter、および閉じた状態のEnterが`"prevent"`になること。
- [ ] **Step 2: REDテスト（ARIAと表示）。** 検索語を状態で持つテスト用の親で包んで描画する。入力欄は`role="combobox"`・名前「ノードを検索」・`aria-autocomplete="list"`・`aria-controls`が一覧のid・`type="text"`。入力すると`onQueryChange`が呼ばれ、一覧（`role="listbox"`・`aria-label="ノード検索結果"`）が開き`aria-expanded="true"`。`getByRole("listbox", { name: "ノード検索結果" })`で一覧自体の名前も検証する。各候補は`role="option"`で、1行目にラベル（`title`に全文）、2行目に「親: …」または「ルート」、`hidden`なら「非表示」の印。候補のアクセシブルネームは全パターン（「ラベル（親: 親ラベル）」「ラベル（親: 親ラベル、非表示）」「ラベル（ルート）」「ラベル（ルート、非表示）」）をテストする。状態表示（`role="status"`、一覧の外）: 0件で「一致するノードはありません。」、`total > matches.length`で「全120件中50件を表示しています。キーワードを絞り込んでください。」、それ以外は「5件」。検索語が空なら一覧と状態表示を出さず`aria-expanded="false"`。検索語が空のとき、一覧が閉じたとき、および0件のときは入力欄に`aria-activedescendant`が設定されないこと。
- [ ] **Step 3: REDテスト（キーボード）。** 開いた直後は先頭の候補が選択中（`aria-selected="true"`、入力欄の`aria-activedescendant`がそのid）。ArrowDown・ArrowUpで次・前へ移り、端では反対の端へ回る。Enterで選択中の候補のIDで`onSelectResult`を1回呼び、一覧は開いたまま、フォーカスは入力欄のまま。`repeat: true`のEnterでは呼ばない。0件時のEnterや一覧閉じ時のEnterで`onSelectResult`を呼ばず`preventDefault`されること。IME変換中のEnter（`isComposing: true`、`keyCode: 229`）では呼ばず、IME変換中のEscapeでは閉じない。Escapeで閉じ、もう一度のEscapeで`onQueryChange("")`。閉じた状態のArrowDownで開く。処理したキーは`preventDefault`される（`fireEvent.keyDown`の戻り値が`false`）。選択中の候補で`scrollIntoView({ block: "nearest" })`を呼ぶ（`Element.prototype.scrollIntoView`をテストで定義してspyする。定義しない環境でも例外にならない）。
- [ ] **Step 4: REDテスト（IDで持つ選択中の候補。L-035）。** 2番目の候補を選択中にしてから、`matches`の順序を入れ替えて再描画しても、同じノードIDの候補が選択中のまま。選択中のノードが`matches`から消えたら先頭の候補が選択中になる。Enterで呼ぶIDは描画中の候補のID（配列の位置ではない）。
- [ ] **Step 5: REDテスト（マウスとフォーカス）。** 候補の`mousedown`は既定動作が止められる（`fireEvent.mouseDown`の戻り値が`false`。L-148）。`user.click`で候補を押すと、その候補が選択中になり`onSelectResult`が呼ばれ、一覧は開いたまま、フォーカスは入力欄に残る。候補のダブルクリックでは`onSelectResult`が2回呼ばれ、一覧は開いたまま（2回目が背面へ届かない。L-150）。Tabでフォーカスが外れると一覧が閉じる（L-248）。検索語がある状態で入力欄へフォーカスし直すと一覧が開く。
- [ ] **Step 6: RED確認。** `cd client && npm test -- --runInBand nodeSearchKeyAction NodeSearchBox`。
- [ ] **Step 7: 実装。** 開閉と選択中の候補のIDだけを部品の状態として持ち、表示上の選択中の候補は描画時に求める（effectで直さない）。`onKeyDown`は、イベントから事実を集める → `resolveNodeSearchKeyAction` → 副作用（`preventDefault`を含む）の3段にする（L-317）。候補のidは`useId`の接頭辞とノードIDから作る。一覧は`absolute`でキャンバスに重ね、`max-h`とスクロールを付ける。既存の部品と同じ配色・`focus-visible`の書き方、ダークモードに合わせる。
- [ ] **Step 8: GREENと全体検証。** Step 6と`npm run verify`。
- [ ] **Step 9: 二段階レビュー後コミット。** `feat(search): 検索欄と結果の一覧の部品を追加する`

### Task 5: ページの結合と実ブラウザの確認手順

**Files:**
- Modify: `client/src/components/layout/AppHeader.tsx`
- Extend: `client/src/components/layout/__tests__/AppHeader.test.tsx`（無ければ作成）
- Modify: `client/src/app/page.tsx`
- Create: `client/src/app/__tests__/pageSearch.test.tsx`
- Modify: `docs/testing/browser-test-cases.md`（Phase 10の確認手順の追加と、未確認の記録。確認結果の反映はTask 6）

**Interfaces:**
- Consumes: Task 2の`useNodeLabelSearch`・`useNodeSearchNavigation`、Task 3のMapStageの`focusRequest`、Task 4の`NodeSearchBox`。
- `AppHeader`へ`searchControls: ReactNode`を追加し、タイトルの直後に描画する（Global Constraintsに従って必須。既存テストの呼び出しにはsearchControls={null}を明示し、ページ配線は結合テストで確かめる）。

- [ ] **Step 1: ページ結合REDテスト。** モックは`app/__tests__/pageDuplication.test.tsx`と同じ`jest.mock`の一式に限る（`pixi.js`は`mapStageTestRuntime.createMockPixiModule`で差し替え、ほかに`illustrationGeneration`、`mapJsonDownload`、`mapTextMeasurement`、`mapImageDownload`、`mapPngRasterizer`）。Home・`useNodes`・`MapStage`・検索のフック・`NodeSearchBox`はモックしない。マップはlocalStorageへV3のJSONを置いて読み込ませる（`pageDuplication.test.tsx`の`v3Json`と同じ方法）。次を確かめる。
  - ヘッダーに検索欄があり、ラベルの一部を入力すると一覧に一致したノードが出る。
  - 見えているノードを選ぶと、そのノードが選択され（重要度の切り替えの表示など、画面から観察できる方法で確かめる）、ワールドのコンテナの位置がそのノードの中心を画面の中央へ置く値になる。表示モードは変わらず、通知も出ない。
  - 「表示 高のみ」を押した状態で低重要度のノードを検索すると、候補に「非表示」の印が付き、選ぶと「表示 すべて」が押された状態になり、切り替えの通知（`role="status"`、`operation-notices`の中）が出て、そのノードが選択されたまま（隠れたノードの選択の解除が起きない）、表示位置がそのノードへ移る。
  - 検索欄で`f`・`Delete`・`Backspace`・`Tab`・Enter（一覧が閉じた状態）・Ctrl+Z・Ctrl+Yを押しても、選択中のノードの削除・追加・Undo・表示位置の移動が起きない（エクスポートしたJSONと表示位置で確かめる）。検索欄でのcopy/pasteイベントがマップを変えない。
  - 候補のダブルクリックでノードが追加されない（エクスポートしたJSONのノード数が変わらない）。
  - Undo／JSON読み込みでノードが変わると、同じ検索語のまま一覧が新しいマップから求め直され、切り替えの通知が消える。Pixi初期化を遅延させ、検索移動要求→同IDを含むJSON読み込み→初期化完了の順でも旧位置へ移動せず、importの初期viewportを保つ結合ケースを追加する。
  - 選択・表示の切り替えはUndoの対象にならない（選んだ後の「元に戻す」が無効のまま、または直前の編集を戻す）。
  - 配線を外すと（`focusRequest`を`null`のままにする、`onSelectResult`をつながない等）FAILする構成にする。
- [ ] **Step 2: RED確認。** `cd client && npm test -- --runInBand pageSearch AppHeader`。
- [ ] **Step 3: 実装。** `page.tsx`で`useNodeLabelSearch({ nodes, visibleNodeIds: resolutionFilter.visibleNodeIds })`と`useNodeSearchNavigation({ nodes, visibleNodeIds: resolutionFilter.visibleNodeIds, documentRevision, setResolutionMode: resolutionFilter.setMode, selectNode })`を呼び、`NodeSearchBox`を`searchControls`へ、`focusRequest`をMapStageへ、通知を既存の`operationNotices`の条件と表示へ別の枠として追加する。
- [ ] **Step 4: GREENと全体検証。** Step 2と`npm run verify`。
- [ ] **Step 5: ブラウザで確認できる範囲を確認し、手動確認の手順を追加する。** devサーバーでツールから確認できる範囲（検索欄の配置と折り返し、一覧の表示とスクロール、ダークモード、候補のクリックでの移動、隠れたノードの表示の切り替えと通知）を確認して記録する。日本語入力の確定のEnterで候補が選ばれないこと、IME変換中のEscapeで一覧が閉じないこと、Safariでの候補のクリック、タッチでの候補のタップ、候補のダブルクリックでノードが増えないこと、一覧がキャンバスに重なった状態でのキャンバス操作を、`docs/testing/browser-test-cases.md`にPhase 10の節として追加し、実キーボード・実IMEでの確認は利用者による手動確認として未確認と記録する。合成イベントだけでIMEやSafariでの成功を主張しない（L-183）。
- [ ] **Step 6: 二段階レビュー後コミット。** `feat(search): 検索欄をヘッダーに接続し、結果からノードへ移動する`

### Task 6: 文書・ROADMAPと最終検証

**Files:**
- Modify: `ROADMAP.md`
- Modify: `README.md`
- Modify: `client/README.md`
- Modify: `docs/README.md`
- Modify: `docs/specifications/features.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/browser-test-cases.md`

**Interfaces:** Consumes: Task 1〜5の検証済み機能。API追加なし。保存形式の変更なし（`docs/specifications/data-model.md`は変更しないことを確認する）。

- [ ] **Step 1: Specと実装を照合。** 正規化・空ラベル・上限と総数・IDでの扱い・隠れたノードの表示の切り替え・移動・キー操作・IME・一覧の開閉・通知・履歴に積まないことを、テスト結果へ対応させる。文書だけのタスクにREDは追加しない。Task 5で追加した手動確認の手順に、利用者による確認結果があれば反映する。無ければ未確認のまま残す。
- [ ] **Step 2: 操作説明を記載。** 検索欄の場所、照合の規則（NFKC・大文字小文字・ひらがなとカタカナは区別）、現在のnodes配列順で50件までと総数、キー操作（↑↓・Enter・Escape）、選んだ後も一覧が開いたままであること、隠れたノードを選ぶと表示モードが切り替わること、Ctrl/Cmd+Fは奪わないこと、実ブラウザでの確認結果と未確認の環境を追記する。
- [ ] **Step 3: ROADMAP更新。** Phase 10の4項目を完了にし、見出しを「（✅ 完了）」にする。「現在地」にPhase 10の完了を追記し、次に取り組む項目をPhase 11「親ノードから子孫をまとめて折りたたみ・展開する」とし、「Phase 10〜13は未着手」を「Phase 11〜13は未着手」に直す。最終更新は実装完了日。実IMEや実ブラウザでの確認が未実施なら、該当する項目の下に「実ブラウザでの日本語入力の確認は未実施（docs/testing/browser-test-cases.md）」のように書き添え、完了報告の未決事項にも明記する（実装は完了しているため完了にする）。
- [ ] **Step 4: 別エージェントで全体レビュー、指摘解消後の再レビュー。** `cd client && npm run verify`とルートの`git diff --check`を成功させる。
- [ ] **Step 5: 文書コミットと保持。** `docs(search): ノード検索の仕様とロードマップを更新する`。worktreeとブランチを保持し、ブランチ名・worktree・未決事項を報告する。

## 自己レビュー

Specの照合規則・上限・線形性をTask 1、段階の算出・表示名の共有・結果の選択（存在確認・切り替え・選択・移動の要求・通知）をTask 2、MapStageでの移動（`sequence`・保留・ジェスチャー）をTask 3、検索欄と一覧（ARIA・キー操作・IME・IDで持つ選択中の候補・マウスとフォーカス・状態表示）をTask 4、ページの結合（既存ショートカットとの非干渉・ダブルクリック・履歴に積まないこと）と実ブラウザの手順をTask 5、文書とROADMAPをTask 6へ割り当てた。検索は同期だが、初期化待ちを持つ移動要求は`sequence`と`documentRevision`で識別・失効させる。Review Focusの6点をタスクの検証へ反映した。

## レビュー修正（2026-10-14）

- Task 2・3・5: 初期化待ちの移動要求が別文書の同IDに適用されないよう、documentRevisionの契約と失効テストを追加。
- Task 1: 検索の線形性を索引自体のアクセス数で検証するよう修正。
- Task 5: searchControlsの必須／省略可能の矛盾を解消。結果順の説明もnodes配列順に統一。
- Task 4: listboxのアクセシブルネームと、その検証を追加。
