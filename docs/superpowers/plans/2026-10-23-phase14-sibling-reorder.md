# Phase 14: 兄弟ノードの順序変更 Implementation Plan

> **For agentic workers:** `superpowers:subagent-driven-development`でタスクを1つずつ実装し、別担当の仕様・品質レビュー後に次へ進む。インライン実装はユーザーの明示指示時のみ。各タスクのサブエージェントには、そのタスク本文、Global Constraints、依存する前タスクの Interfaces だけを渡す。

**Goal:** ROADMAP Phase 14 の「兄弟ノードの順序変更（候補001）」を実装し、選択中のノードを同じ親の見えている兄弟（ルート同士を含む）の中で1つ上・1つ下へ移す操作（ヘッダーの「上へ」「下へ」、`Alt`/`Option`+`↑`/`↓`）と、自動配置でのドラッグによる並べ替えを、1回の Undo / Redo で戻せる1操作として提供する。
**Architecture:** 並べ替えの規則は純関数（`domain/nodes/nodeSiblingOrder.ts`、手動配置の縦位置の入れ替えは `domain/nodes/nodeSiblingSwapPlacement.ts`、通知の文言は `domain/nodes/nodeSiblingOrderMessages.ts`）。`useNodes.reorderSibling` が `applyTreeChange` を1回だけ呼び、`useSiblingReorderAction` がボタンの有効・無効と通知（操作通知バーの8系統目）を持つ。ショートカットの判定とドロップ位置の判定は `components/map` の純関数、ドラッグは Pixi のジェスチャー `createSiblingReorderGesture`、挿入位置の線は `renderSiblingReorderIndicator` で描く。`MapEditor` がヘッダーのボタン・通知・`MapStage` の `layoutMode` / `onReorderSibling` を配線する。
**Tech Stack:** TypeScript、React 19、Next.js 16、Pixi.js、Jest、Testing Library。追加依存なし。
**Spec:** `docs/superpowers/specs/2026-10-23-phase14-sibling-reorder-design.md`

## Global Constraints

- 新規依存なし。`Node`、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式を変えない。順序のフィールド（`order` など）を足さず、兄弟とルートの順は `nodes` 配列の相対順で表す。並べ替えは移動する枝の根ノード1つの配列内の位置だけを変え、子孫の配列位置は変えない。
- 境界: 並べ替えの規則は純関数（`domain/nodes/nodeSiblingOrder.ts`、`domain/nodes/nodeSiblingSwapPlacement.ts`）、通知の文言は純関数（`domain/nodes/nodeSiblingOrderMessages.ts`）、ショートカットの判定とドロップ位置の判定は純関数（`components/map/siblingReorderShortcut.ts`、`components/map/siblingReorderDropSlot.ts`）、状態と1回の commit は React フック、表示と操作は部品。domain は hooks・components を import しない。
- 結果は判別共用体で返し、呼び出し元は成功したときだけ成功の通知・後続処理を行う。共用体の分岐は `switch` で網羅し、`default` で新しいメンバーを既定の分岐へ流さない（網羅は `const unreachable: never = value;` で型検査する）。
- 対象と挿入先は ID で指定し、配列の添字を層の間で受け渡さない。ショートカットとボタンの「1つ上・1つ下」は `applyTreeChange` のコールバックの中で最新のノード配列から解決する。ドラッグは落とした時点の座標と最新の ref で挿入位置を求め直す。
- 並べ替えは、表示で絞り込んだ部分配列ではなく、正本の全 `nodes` に対して行う。隠れた兄弟を消したり、隠れた兄弟同士の順を変えたりしない。
- 配列の操作は1回の走査で新しい配列を作る。`splice` と添字の計算（`indexOf` で求めた位置への挿入など）を使わない。大きな配列に `Math.min(...arr)`・`Math.max(...arr)`・`push(...arr)` を使わない（最小値・最大値はループで求める）。
- 座標の計算は `checkedAdd` / `checkedSubtract`（`client/src/domain/nodes/nodeLayoutArithmetic.ts`。結果が有限でない・0 でない値を足しても結果が変わらない桁落ちで `null` を返す）を使い、`null` なら `placement-failed` にする。途中まで動いた配列を返さない。
- 定数は既存のものを使う: `SIBLING_VERTICAL_GAP = 40`（`client/src/config/shapes.ts`）。ドラッグのしきい値は既存の 4px（`createStageInteractions` の `dragThreshold` の既定値）。挿入位置の線の色は `0x2563eb`。
- 新しい props・options・コールバックは必須にする（省略可能にして既定値を置かない）。実際の `Home` から `MapEditor`、ヘッダー、`MapStage` まで通す結合テストで配線を確かめる。
- 通知の文言は設計書の「通知」の表のとおり（数値に桁区切りを付けない）。
- 対象外（作らない）: 階層の上げ下げなど Phase 14 の他の項目、別の親の下への移動、手動配置でのドラッグによる並べ替え、コンテキストメニューへの項目の追加、複数選択の並べ替え、ドラッグ中の自動スクロール、ラベル順などの自動の並べ替え、手動配置で入れ替えた2つの組以外のノードとの重なりの回避。
- 実装は `.worktrees/codex/phase14-sibling-reorder` の `codex/phase14-sibling-reorder` ブランチで行う。タスク単位のサブエージェント実装、別担当の仕様・品質レビュー、TDD（先にテストを書いて RED を確かめる）、各タスクの最後に `cd client && npm run verify` を必須とする。途中のタスクでも verify が通る状態で終える。
- コミット・push・PR 作成は依頼時のみ。依頼された場合のメッセージは Conventional Commits（例: `feat(nodes): ...`、`feat(map): ...`、`test(map): ...`、`docs(nodes): ...`）にする。最後のタスクで `ROADMAP.md` を実態に合わせて更新する。
- 反映する知見（サブエージェントは知見ファイルを読まない前提。ここの1行が要約）:
  - **L-001**: 操作の成否を呼び出し元へ返し、呼び出し元は結果を見て、失敗・未実行のときに成功の通知や後続処理を行わない。
  - **L-035**: 配列の添字など位置ベースの識別子は、表示から操作までの間にずれて別の対象を指す。ID で指し、操作の時点の最新の配列から解決する。
  - **L-037**: 遅れて届く結果や通知を識別子だけで対象に結び付けない。`documentRevision`（世代）と組にし、Undo / Redo・マップの置き換えで古いものを捨てる。ジェスチャーも世代が変わったら中止する。
  - **L-057**: 条件付きで拒否した入力を黙って捨てない。理由と、先へ進む方法（例: 表示を「すべて」に切り替える）を通知する。
  - **L-058**: 見た目だけ無効なボタンは実際には押せてしまう。`disabled` 属性で無効にし、無効のときクリックしてもコールバックが呼ばれないことをテストする。
  - **L-060**: 省略可能な props と既定値のせいで、組み立て役の配線漏れをどのテストも検出しない。新しい props は必須にし、実際の `Home` から通す結合テストと配線の変異（渡さない・取り違える）で確かめる。
  - **L-061**: 新しい操作を導入したら、既存の停止条件（ダイアログを開いている間の根の `inert`、`editorShortcutsEnabled`、ラベル編集中など）の対象に、ボタン・ショートカット・ドラッグのすべての入口を入れる。
  - **L-150**: クリックで自分が閉じる・切り替わる UI では、ダブルクリックの続きのクリックが下の要素に届く。今回の「上へ」「下へ」は画面を切り替えないので、続きのクリックは同じボタンに届き2回の移動になる。端で無効になったボタンへの続きのクリックは何もしない。ヘッダーのボタンの `dblclick` はキャンバスに届かない。
  - **L-408**: Enter の押し続け（`event.repeat`）で操作が連続したり、フォーカスを移した先のボタンで逆の操作が起きたりする。両方のボタンで `event.key === "Enter" && event.repeat` の `keydown` を `preventDefault` する。
  - **L-457**: フラット配列で親子をブロックとして動かすと、移動先の子孫を取り込んでしまう。このデータは `parentId` で親子を表すので、ブロックとして動かさず根ノード1つだけを動かす。
  - **L-460**: 表示で絞り込んだ部分配列で並べ替えて保存すると、画面外の要素が消える。並べ替えは正本の全配列に対して行い、隠れた兄弟を全件残すことをテストで固定する。
  - **L-472**: 表示順と配列順が一致しない場面で、配列の隣接に依存した操作（ドラッグの並べ替え）を使うと壊れる。表示の上下が配列順と一致する自動配置だけドラッグで並べ替え、手動配置は縦位置を入れ替えて画面と並びを一致させる。
  - **L-474**: 日本語 IME の変換中のキー（`isComposing`、`keyCode === 229`）を無視する。
  - **L-522**: グローバルなショートカットは、ボタン・リンク・入力欄・`select`・`contenteditable` などの対話要素にフォーカスがあるときは働かせない（`isInteractiveTarget` と同じ判定）。
  - **L-540**: 順序のフィールドを足さず、配列の相対順を正本にする。並べ替えで配列全体を再採番しない。
  - **L-541**: `splice` と添字の計算で並べ替えると、範囲外の添字や向きの食い違いで壊れる。1回の走査で新しい配列を作り、anchor の検査（不在・自分自身・別の親・向きの食い違い）で拒否する。

## Review Focus

- 並べ替えの規則: 設計書の例 A1〜A9 がすべて `findSiblingReorderTarget` / `reorderSiblingNodes` のテストにあり、子孫と他のノードのオブジェクトが同一（`toBe`）で、隠れた兄弟が全件残る（Task 2。L-460、L-541）。
- 手動配置の式: 例1〜5 と折りたたみの例が1例1テスト、`gap0` が 0・負の境界、桁落ちで途中まで動いた配列を返さない（Task 1）。
- 1回の commit と失敗時の不変: 成功は1回の Undo で戻り、失敗ではノード・選択・履歴・Redo が変わらない。`step` は `applyTreeChange` の中の最新の配列で解決する（Task 4。L-001、L-035）。
- 入口の停止: ショートカットは `enabled`・ラベル編集中・対話要素・IME・ジェスチャー中・修飾キーの併用で止まり、止まったときは `preventDefault` しない（Task 7）。ダイアログを開いている間は止まる（Task 12。L-061）。
- ドラッグ: 自動配置だけ並べ替え、手動配置は移動、Shift は接続。`onBeginNodeMove` を呼ばない。`end` は落とした座標と最新の ref で求め直す。中止の各条件で並べ替えない（Task 8・9・12）。
- 配線: `layoutMode`・`onReorderSibling`・ボタンの props が必須で、上と下の取り違えを結合テストが検出する（Task 9・11・12。L-060）。

## ファイル構成

| ファイル | 責務 | 作成・変更タスク |
| :--- | :--- | :--- |
| `client/src/domain/nodes/nodeSiblingSwapPlacement.ts` | 手動配置の縦位置の入れ替え `swapSiblingBranchPositions` | 1 |
| `client/src/domain/nodes/nodeSiblingOrder.ts` | 型（`ReorderSiblingResult` を含む）、`findSiblingReorderTarget`、`getSiblingReorderAvailability`、`reorderSiblingNodes` | 2 |
| `client/src/domain/nodes/nodeSiblingOrderMessages.ts` | 通知の文言 `formatSiblingReorderNotice` | 3 |
| `client/src/hooks/useNodes.ts` | `reorderSibling`（1回の commit） | 4 |
| `client/src/hooks/useSiblingReorderAction.ts` | ボタンの有効・無効、選択中のノードの移動、`MapStage` からの要求、通知（8系統目） | 5 |
| `client/src/components/layout/NodeSiblingOrderControl.tsx` | ヘッダーの「上へ」「下へ」 | 6 |
| `client/src/components/map/interactiveTarget.ts` | `useNodeKeyboardShortcuts` の中の `isInteractiveTarget` を移す（挙動は変えない） | 7 |
| `client/src/components/map/useNodeKeyboardShortcuts.ts` | `isInteractiveTarget` を共通のモジュールから使う | 7 |
| `client/src/components/map/siblingReorderShortcut.ts` | ショートカットの判定 `resolveSiblingReorderShortcut` | 7 |
| `client/src/components/map/useSiblingReorderShortcut.ts` | `window` の `keydown` の登録 | 7 |
| `client/src/components/map/siblingReorderDropSlot.ts` | ドロップ位置・挿入先・線の位置の判定 `resolveSiblingReorderDrop`、型 `SiblingReorderIndicator`・`SiblingReorderPreview` | 8 |
| `client/src/components/map/pixi/siblingReorderGesture.ts` | 並べ替えのジェスチャー `createSiblingReorderGesture` | 8 |
| `client/src/components/map/useSiblingReorderDragEscape.ts` | ドラッグ中の Escape で中止 | 8 |
| `client/src/components/map/pixi/stageInteractions.ts` | 配置モードによる分岐、`isSiblingReorderActive` | 9 |
| `client/src/components/map/useStageInteractionValues.ts` | `layoutModeRef`・`onReorderSiblingRef` | 9 |
| `client/src/components/map/useMapStageInteractions.ts` | `siblingReorderPreview` の状態、`isSiblingReorderActive` | 9 |
| `client/src/components/map/MapStage.tsx` | 必須の props `layoutMode`・`onReorderSibling`、Escape（Task 9）、描画への受け渡し（Task 10）、ショートカット（Task 11） | 9, 10, 11 |
| `client/src/components/map/MapEditor.tsx` | `useSiblingReorderAction`、`MapStage` への配線、8系統目の通知（Task 9）、ヘッダーのボタン（Task 11） | 9, 11 |
| `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx` | 新しい必須の props を渡す | 9 |
| `client/src/components/map/pixi/renderSiblingReorderIndicator.ts` | 挿入位置の線の描画 | 10 |
| `client/src/components/map/pixi/renderMapNodes.ts` | `siblingReorderSourceNodeId` のノードを半透明にする | 10 |
| `client/src/components/map/pixi/renderMapScene.ts` | `siblingReorderIndicator` を最後に描く | 10 |
| `client/src/components/map/useRenderedMapScene.ts` | 新しい描画のオプションを場面へ渡し、変わったら描き直す | 10 |
| `client/src/components/layout/LayoutModeOperationHint.tsx` | 操作ヒントの文言 | 11 |
| `client/src/app/__tests__/pageSiblingOrder.test.tsx` | ボタン・ショートカット・手動配置・端・隠れた兄弟・ダイアログ・自動保存・配線の結合テスト | 12 |
| `client/src/app/__tests__/pageSiblingOrderDrag.test.tsx` | 自動配置のドラッグの結合テスト | 12 |
| `docs/specifications/features.md` ほか文書 | 仕様・構成・手動テストの更新 | 13 |
| `ROADMAP.md` | Phase 14 の「兄弟ノードの順序変更」の完了、現在地、最終更新 | 14 |

テストは各ソースと同じ階層の `__tests__/` に置く（例: `client/src/domain/nodes/__tests__/nodeSiblingOrder.test.ts`、`client/src/components/map/pixi/__tests__/siblingReorderGesture.test.ts`）。

## 既存のテストへの影響と対処するタスク

| 影響 | 内容 | 対処するタスク |
| :--- | :--- | :--- |
| `isInteractiveTarget` の移動 | `useNodeKeyboardShortcuts.ts` の非公開関数を `interactiveTarget.ts` へ移す。`useNodeKeyboardShortcuts.test.tsx` は変更なしで通ること | 7 |
| `createStageInteractions` の必須の options | `stageInteractions.test.ts` のヘルパー（`createStageInteractions({...})` の1か所）に `layoutModeRef`・`onReorderSiblingRef`・`onSiblingReorderPreviewChangeRef` を足す。既存のテストは `layoutModeRef: { current: "manual" }` で今の挙動（移動）を保つ | 9 |
| `useMapStageInteractions`・`useStageInteractionValues` の必須の options | `useMapStageInteractions.test.tsx`（8か所）と `useStageInteractionValues.test.tsx`（2か所）の呼び出しに `layoutMode: "manual"` と `onReorderSibling: jest.fn()` を足す | 9 |
| `MapStage` の必須の props | `MapStage.test.tsx`（`defaultProps` と、`defaultProps` を使わずに `<MapStage` を描くハーネス）、`MapStageVisibility.test.tsx`・`MapStageContextMenu.test.tsx`・`MapStageHistory.test.tsx` の `defaultProps`、`AutoLayoutMapStageHarness.tsx` に `layoutMode`・`onReorderSibling` を足す。`npm run typecheck` で漏れを確かめる | 9 |
| 自動配置のドラッグの既存のテスト | `MapStage.test.tsx` の「自動モードのpointer dragではノード座標を変更しない」は、2つのルートの先頭を 80px 下へドラッグする。挿入位置が元の位置（2つ目のルートの中心より上）なので、並べ替えは起きず、変更なしで通ること | 9 |
| 描画の必須のオプション | `renderMapNodes.test.ts`（3か所）、`renderMapScene.test.ts`（5か所）、`useRenderedMapScene.test.tsx`（6か所）の呼び出しに `siblingReorderSourceNodeId: null`・`siblingReorderIndicator: null` を足す | 10 |
| `MapEditor` の通知の系統数 | `operationNotices` の「すべて `null` なら `null`」の条件に、並べ替えの通知を足さないと通知が表示されない | 9 |
| ヘッダーの `getByRole` | 新しいボタン「上へ」「下へ」（名前は「枝を上へ移動」「枝を下へ移動」）が、既存のテストの正規表現の名前（`name: /…/`）に一致しないこと | 11 |
| 操作ヒント | `LayoutModeOperationHint.test.tsx` の期待の文言を新しい文言に直す | 11 |
| 文書の「7系統」 | `features.md` の 11.4 の「7系統」の記述 | 13 |

## 進め方

開始前に `git status` と worktree を確認し、既存のユーザー変更を reset しない。各タスクは「テスト追加 → 対象テストの RED を確認 → 実装 → 対象テストの GREEN → `cd client && npm run verify`」の順で進め、別のサブエージェントで仕様・品質を確認する。テストのコマンドは `client` ディレクトリで実行する（`npm test -- --runInBand <ファイル名>`）。ファイルのパスはリポジトリ相対。テストの期待値は実装の定数を import せずリテラルで書く（例: `40`、`"枝の順序を変更できませんでした。"`）。テストを書いた後、主要な分岐を1つずつ外す変異（条件の反転、`<=` と `<`・`>=` と `>` の置き換え、呼び出しの削除）を当てて失敗することを確かめ、結果をタスクの報告に書く。

`MapStage` と `MapEditor` は Task 9・10・11 の3回に分けて変える。新しい props と options を必須にするため、下の層（`createStageInteractions` → `useMapStageInteractions` → `MapStage` → `MapEditor`）の必須の値を足すタスクで、上の層の呼び出し元も同時に直さないと typecheck が通らないためである。Task 9 はドラッグの経路（`layoutMode`・`onReorderSibling`・8系統目の通知）、Task 10 は描画、Task 11 はヘッダーのボタンとショートカットを配線する。

テストで使うノードは `createTestNode`（`client/src/testing/createTestNode.ts`。既定は `{ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "", importance: "medium" }`）で作る。

---

### Task 1: 手動配置の縦位置の入れ替え

**Files**
- Create: `client/src/domain/nodes/nodeSiblingSwapPlacement.ts`
- Create: `client/src/domain/nodes/__tests__/nodeSiblingSwapPlacement.test.ts`

**Interfaces**
- Consumes: 既存の `checkedAdd`・`checkedSubtract`（`@/domain/nodes/nodeLayoutArithmetic`）、`SIBLING_VERTICAL_GAP`（`@/config/shapes`）、`Node`（`@/types/node`）。
- Produces:
  ```ts
  export type SiblingSwapResult =
    | { ok: true; nodes: Node[] }
    | { ok: false; reason: "overlapping-branches" | "placement-failed" };

  // first・second は、並べ替えた後の兄弟の列で上に来る組と下に来る組の、根ノードの ID の配列（どちらも1件以上）。
  // nodes は並べ替えた後の配列。座標だけを変え、配列の順は変えない
  export function swapSiblingBranchPositions(
    nodes: readonly Node[],
    first: readonly number[],
    second: readonly number[],
  ): SiblingSwapResult;
  ```

**実装の要点**（設計書の「手動配置の縦位置の入れ替え」）
1. 枝の集合: `nodes` を1回走査して `parentId` → 子の ID の表を作り、組の各根から幅優先で子孫を集める（`collectSubtreeIds` を根ごとに呼ぶと、根が多いとき表を何度も作るので、表は1回だけ作る）。集合には隠れた子孫も含める。first の集合を作った後、second の集合を作る途中で first の集合に含まれる ID に出会ったら `overlapping-branches`。
2. 前提の検査: first・second が空、または根の ID が `nodes` に無い場合は `placement-failed`（呼び出し元が保証する前提。防御として1テストで固定する）。
3. 外接範囲: `nodes` を1回走査し、組ごとに `top` = 集合のノードの `y` の最小値、`bottom` = `checkedAdd(y, height)` の最大値（`null` なら `placement-failed`）、`height = checkedSubtract(bottom, top)`（`null` なら `placement-failed`）。スプレッドを使わずループで求める。
4. 上下: `first.top < second.top` なら X = first・Y = second、`second.top < first.top` なら X = second・Y = first、等しければ X = first・Y = second。
5. `gap0 = checkedSubtract(Y.top, X.bottom)`（`null` なら失敗）、`gap = gap0 >= 0 ? gap0 : SIBLING_VERTICAL_GAP`。
6. `newFirstTop = X.top`、`newSecondTop = checkedAdd(checkedAdd(X.top, first.height), gap)`、`dyFirst = checkedSubtract(newFirstTop, first.top)`、`dySecond = checkedSubtract(newSecondTop, second.top)`。どれかが `null` なら失敗。
7. 1回の走査で新しい配列を作る: first の集合のノードは `y = checkedAdd(y, dyFirst)`、second の集合のノードは `checkedAdd(y, dySecond)`、`dy === 0` の組のノードと他のノードは同じオブジェクト。`x` は変えない。`null` が1つでも出たら、作りかけの配列を捨てて `placement-failed`。

- [ ] `nodeSiblingSwapPlacement.test.ts` を書く。高さ 60・幅 100 のノード。各テストで、動くノードの `y` と、全ノードの `x` が変わらないことを確かめる。
  - 例1（上へ）: P（id 1, y 0）、T（id 2, y 100）、T の子（id 3, y 80）・（id 4, y 140）。`swapSiblingBranchPositions(nodes, [2], [1])` → T の y 20、子 0 と 60（T の枝 [0, 120]）、P の y 140。
  - 例2（隠れた兄弟を飛び越える・上へ）: A（id 1, y 0）、H（id 2, y 100）、T（id 3, y 200）。`(nodes, [3], [1, 2])` → T 0、A 100、H 200。
  - 例3（下へ）: T（id 1, y 0）、H（id 2, y 100）、N（id 3, y 200）。`(nodes, [2, 3], [1])` → H 0、N 100、T 200。
  - 例4（すでに新しい並びと同じ）: A（id 1, y 200）、T（id 2, y 0）。`(nodes, [2], [1])` → 座標が変わらず、結果の各要素が入力と同じオブジェクト（`toBe`）。
  - 例5（重なっている）: A（id 1, y 0）とその子（id 3, y 40）で A の枝 [0, 100]、T（id 2, y 50）。`(nodes, [2], [1])` → T 0、A 100、A の子 140。
  - 折りたたみの例: T（id 2, y 100）の子（id 3, y 300）は隠れていても枝に入る。P（id 1, y 0）。`(nodes, [2], [1])` → T の枝 [100, 360] が上端 0 へ（T 0、子 200）、P は `0 + 260 + 40 = 300`（`gap0 = 100 - 60 = 40`）。
  - `gap0` が 0: A（id 1, y 0）、T（id 2, y 60）。`(nodes, [2], [1])` → T 0、A 60（`>=` を `>` に変えると 100 になって落ちる）。
  - `gap0` が負: A（id 1, y 0）、T（id 2, y 30）。`(nodes, [2], [1])` → T 0、A 100。
  - 上端が等しい: A（id 1, y 0）、T（id 2, y 0）。`(nodes, [2], [1])` → first（T）が上で y 0、A が `0 + 60 + 40 = 100`。
  - 対象外のノード: 別の親の子（id 9, y 10）が `y` もオブジェクトも変わらない（`toBe`）。
  - 重なる枝: T（id 2）の子に P（id 1, `parentId: 2`）がある不正なデータで `(nodes, [2], [1])` → `{ ok: false, reason: "overlapping-branches" }`。
  - 桁落ち: P（id 1, y 0）、T（id 2, y 4）、T の子（id 3, y 1e17）。`(nodes, [2], [1])` → `{ ok: false, reason: "placement-failed" }`（1e17 の近くでは隣の浮動小数点数との間隔が 16 なので、T の枝の高さの計算か子の `dy = -4` の加算が桁落ちする）。
  - 巨大な座標: P（id 1, y 0）、T（id 2, y 100）、T の子（id 3, y `Number.MAX_VALUE`）→ `placement-failed`（`checkedAdd(MAX_VALUE, 60)` が `null`）。
  - 前提の違反: `(nodes, [], [1])` と、`nodes` に無い根 `(nodes, [99], [1])` → `placement-failed`。
  - 入力を変えない: 呼ぶ前後で入力の配列と各ノードが `toEqual` で同じ。
  - 大きな入力: second が兄弟10,000件（`[1..10000]`、y = i × 100）、first が10,000ノードの鎖の枝で、例外（`RangeError`）が出ず `ok: true`。時間は測らない。
- [ ] RED: `npm test -- --runInBand nodeSiblingSwapPlacement.test.ts`（モジュールが無いため失敗）。
- [ ] 実装する。
- [ ] GREEN: 同じコマンド。続けて `cd client && npm run verify`。
- 知見: L-541（ループで新しい配列を作る）、L-001（途中まで動いた配列を返さない）。
- 完了条件: 全ケースが通り、verify が成功する。既存のコードは変えていない。

### Task 2: 並べ替えの規則（nodeSiblingOrder）

**Files**
- Create: `client/src/domain/nodes/nodeSiblingOrder.ts`
- Create: `client/src/domain/nodes/__tests__/nodeSiblingOrder.test.ts`

**Interfaces**
- Consumes: Task 1 の `swapSiblingBranchPositions`、`SiblingSwapResult`。既存の `Node`、`NodeLayoutMode`（`@/types/nodeLayout`、`"manual" | "auto"`）。テストだけで既存の `buildNodeForestRelations`（`@/domain/nodes/nodeLayoutForestRelations`）と `layoutNodeForest`（`@/domain/nodes/nodeAutoLayout`）。
- Produces（設計書の「型」をそのまま使う）:
  ```ts
  export type SiblingReorderDirection = "up" | "down";
  // anchorId は T と同じ親を持つ「見えている」兄弟。
  // "before": T を anchor の直前へ移す（anchor は T より前）。"after": T を anchor の直後へ移す（anchor は T より後ろ）
  export type SiblingReorderTarget = { position: "before" | "after"; anchorId: number };
  export type SiblingReorderRequest =
    | { kind: "step"; direction: SiblingReorderDirection }
    | { kind: "drop"; target: SiblingReorderTarget };
  export type SiblingReorderTargetResult =
    | { ok: true; target: SiblingReorderTarget }
    | { ok: false; reason: "node-missing" | "node-hidden" }
    | { ok: false; reason: "at-edge"; hiddenBeyond: boolean; isRoot: boolean };
  export type SiblingReorderAvailability = { up: boolean; down: boolean };
  export type SiblingReorderFailureReason =
    | "node-missing" | "node-hidden" | "invalid-target" | "placement-failed";
  export type SiblingReorderResult =
    | { ok: true; nodes: Node[]; direction: SiblingReorderDirection; visibleIndex: number; visibleCount: number; isRoot: boolean }
    | { ok: false; reason: SiblingReorderFailureReason };
  // useNodes.reorderSibling の戻り値（hooks と messages の両方がここから import する）
  export type ReorderSiblingResult =
    | { ok: true; direction: SiblingReorderDirection; visibleIndex: number; visibleCount: number; isRoot: boolean }
    | { ok: false; reason: "at-edge"; direction: SiblingReorderDirection; hiddenBeyond: boolean; isRoot: boolean }
    | { ok: false; reason: SiblingReorderFailureReason };

  export function findSiblingReorderTarget(
    nodes: readonly Node[], nodeId: number, direction: SiblingReorderDirection, visibleNodeIds: ReadonlySet<number>,
  ): SiblingReorderTargetResult;
  export function getSiblingReorderAvailability(
    nodes: readonly Node[], nodeId: number | null, visibleNodeIds: ReadonlySet<number>,
  ): SiblingReorderAvailability;
  export function reorderSiblingNodes(
    nodes: readonly Node[], nodeId: number, target: SiblingReorderTarget,
    visibleNodeIds: ReadonlySet<number>, mode: NodeLayoutMode,
  ): SiblingReorderResult;
  ```

**実装の要点**
- 用語: 兄弟の列 = T と同じ `parentId` を持つノード（T を含む）を配列の順に並べたもの（ルートなら `parentId === null` のノード全体）。見える = `visibleNodeIds` に含まれる。
- `findSiblingReorderTarget` と `getSiblingReorderAvailability` は、非公開の走査関数1つ（`nodes` を1回だけ走査し、T、T より前で T に最も近い見えている兄弟、その前に隠れた兄弟があるか、T より後ろで T に最も近い見えている兄弟、その後ろに隠れた兄弟があるか、を求める）を共有する。T に出会う前は親が分からないので、親ごと（`Map<number | null, …>`）に「最後に見えた兄弟の ID」と「隠れた兄弟があったか」を控えながら走査する。T に出会った後は T の親の兄弟だけを見る。
  - T が無い → `node-missing`、T が見えていない → `node-hidden`。
  - `"up"`: 直前の見えている兄弟 P があれば `{ position: "before", anchorId: P.id }`。無ければ `at-edge`（`hiddenBeyond` = T より前に隠れた兄弟があるか）。
  - `"down"`: 直後の見えている兄弟 N があれば `{ position: "after", anchorId: N.id }`。無ければ `at-edge`（`hiddenBeyond` = T より後ろに隠れた兄弟があるか）。`isRoot = T.parentId === null`。
  - `getSiblingReorderAvailability`: `nodeId === null`・T が無い・T が見えていない → `{ up: false, down: false }`。それ以外は2つの向きが `ok` か。走査は1回（向きごとに走査し直さない）。座標の失敗は予測しない。
- `reorderSiblingNodes`:
  1. 検査（この順で、最初に当たったものを返す）: T が無い → `node-missing`。T が見えていない → `node-hidden`。anchor が無い・`anchor.id === T.id`・`anchor.parentId !== T.parentId`・anchor が見えていない → `invalid-target`。`"before"` で anchor が T より後ろ、`"after"` で anchor が T より前 → `invalid-target`（前後は走査の中で「どちらに先に出会ったか」で判定し、添字を求めない）。
  2. 配列: `nodes` を先頭から1回走査して新しい配列を作る。T は飛ばす。anchor に出会ったら、`"before"` なら T・anchor の順、`"after"` なら anchor・T の順に積む。他のノードは同じオブジェクトのまま積む。
  3. 座標:
     - `mode === "manual"`: 兄弟の列で、`"before"` なら `first = [T.id]`、`second` = anchor から T の直前までの全兄弟の ID（隠れた兄弟・ドラッグで越えた見えている兄弟を含む）。`"after"` なら `first` = T の直後から anchor までの全兄弟の ID、`second = [T.id]`。並べ替えた配列に `swapSiblingBranchPositions` を適用し、`overlapping-branches` → `invalid-target`、`placement-failed` → `placement-failed` に写す（`switch` で網羅）。
     - `mode === "auto"`: 並べ替えの前と後で最初のルート（`parentId === null` の最初のノード）が違うときだけ、並べ替えた配列の新しい先頭のルートを、`x` / `y` を旧先頭のルートの値（並べ替え前）にした新しいオブジェクトに置き換える。他の座標は変えない。
  4. 位置: 並べ替えた配列で、T の親の見えている兄弟を数え、T より前の数を `visibleIndex`、総数（T を含む）を `visibleCount` にする。`direction` は `"before"` → `"up"`、`"after"` → `"down"`。`isRoot = T.parentId === null`。

- [ ] `nodeSiblingOrder.test.ts` を書く。兄弟の列を作るヘルパー（親 R（id 1）の子として ID を並べ、`hidden` に入れた ID だけ `visibleNodeIds` から外す）を用意する。配列の検査は `result.nodes.map((node) => node.id)` で ID の並びを比べる。
  - `findSiblingReorderTarget`（例の表 A1〜A7。A = 2, B = 3, T = 4, C = 5, P = 6, H1 = 7, H2 = 8, N = 9, H = 10 などリテラルで）:
    - A1: `[A, B, T, C]` 上へ → `{ ok: true, target: { position: "before", anchorId: B } }`。
    - A2: 同じ列で下へ → `after C`。
    - A3: `[A, P, H1(隠), H2(隠), T, C]` 上へ → `before P`。
    - A4: `[A, T, H1(隠), N, C]` 下へ → `after N`。
    - A5: `[H(隠), T, B]` 上へ → `{ ok: false, reason: "at-edge", hiddenBeyond: true, isRoot: false }`。
    - A6: `[T, B]` 上へ → `at-edge`、`hiddenBeyond: false`。
    - A7: 一人っ子 `[T]` で上へ・下へのどちらも `at-edge`。
    - ルート: ルートの列（`parentId: null`）で同じ規則、`at-edge` の `isRoot: true`。
    - 別の親の子（見えている・隠れている）が T と兄弟の間に混ざっていても数えない（例: `[A, X(別の親), T]` 上へ → `before A`。`[X(別の親・隠), T]` 上へ → `hiddenBeyond: false`）。
    - T が無い → `node-missing`、T が隠れている → `node-hidden`。
  - `getSiblingReorderAvailability`: `nodeId: null`・不在・隠れている → `{ up: false, down: false }`。先頭 → `{ up: false, down: true }`、末尾 → `{ up: true, down: false }`、中間 → 両方 `true`、一人っ子 → 両方 `false`。走査が1回: 配列を `Proxy` で包み、数値の添字の `get` を数えて、`nodes.length` 以下であること（向きごとに走査し直すと2倍になって落ちる）。
  - `reorderSiblingNodes`（配列。`mode: "auto"` で座標を変えない入力を使う。先頭のルートは R で変わらない）:
    - A1〜A4: 上の挿入先で、兄弟の列が `A, T, B, C` / `A, B, C, T` / `A, T, P, H1, H2, C` / `A, H1, N, T, C` になる。
    - A8: `[A, B, H(隠), C, T]` で `before C` → `A, B, H, T, C`。A9: `[T, A, H(隠), B, C]` で `after B` → `A, H, B, T, C`。
    - 配列全体（子孫を含む）: `[R(root), A(R), T(R), Tc(T), B(R)]` で `after B` → `[R, A, Tc, B, T]`。Tc と R と A と B が入力と同じオブジェクト（`toBe`）、T も同じオブジェクト。入力の配列を変えない。
    - 親子関係: 並べ替えた後の配列で `buildNodeForestRelations(...)!.childrenByParent.get(R)` の ID の並びが期待どおりで、Tc の親が T のまま。
    - 隠れた兄弟が全件残り、隠れた兄弟同士の順が変わらない（A3 で H1 → H2 の順のまま。L-460）。
    - 検査: anchor が無い（`anchorId: 99`）・自分自身・別の親・隠れている → `invalid-target`。`before` で anchor が T より後ろ（`[A, T, B]` で `before B`）・`after` で anchor が T より前（`after A`）→ `invalid-target`。T の隣の兄弟を anchor にした向きの食い違い（`[A, T, B]` で `before B`）は、添字の ±1 の誤りで通ってしまう入力として必ず入れる（L-541）。T が無い → `node-missing`、T が隠れている → `node-hidden`。
    - 結果の情報: A1 → `direction: "up"`、`visibleIndex: 1`、`visibleCount: 4`、`isRoot: false`。A4 → `direction: "down"`、`visibleIndex: 2`、`visibleCount: 4`（隠れた H1 を数えない）。ルートの並べ替えで `isRoot: true`。
  - `reorderSiblingNodes`（手動配置）: 設計書の例2の配置（A y 0、H 隠れ y 100、T y 200 のルート）で `before A`・`mode: "manual"` → 配列が `T, A, H`、y が T 0・A 100・H 200。重なる枝の不正なデータ（ID の重複で、A の枝と T の枝が同じ ID を含む）: R（id 1, parentId null, x 0, y 0）、A（id 2, parentId 1, x 400, y 0）、T（id 3, parentId 1, x 400, y 100）、D（id 4, parentId 2, x 600, y 300）、D'（id 4, parentId 3, x 600, y 400）（すべて幅 100・高さ 60）で T を `before 2`・`mode: "manual"` → `{ ok: false, reason: "invalid-target" }`（`overlapping-branches` の写し替え）。桁落ち: R（id 1, parentId null, x 0, y 0）、A（id 2, parentId 1, x 400, y 0）、T（id 3, parentId 1, x 400, y 4）、Tc（id 4, parentId 3, x 600, y 1e17）（すべて幅 100・高さ 60）で T を `before 2`・`mode: "manual"` → `{ ok: false, reason: "placement-failed" }`。
  - `reorderSiblingNodes`（自動配置の先頭のルート）:
    - T が先頭になる: ルート R1（id 1, x 0, y 0）、R2（id 2, x 50, y 190）で R2 を `before R1` → 新しい配列の R2 が `x 0, y 0`、R1 の座標は変えない。
    - 先頭の T が下へ動き、隠れたルートが先頭になる: `[T(id 1, x 0, y 0), H(id 2 隠, x 7, y 9), N(id 3)]` で `after N` → 先頭の H が `x 0, y 0`。
    - 先頭が変わらない（2番目と3番目のルートの入れ替え）・ルートでない並べ替え: どのノードの座標も変わらない（同じオブジェクト）。
    - 手動配置ではこの引き継ぎをしない（R2 を `before R1`・`mode: "manual"` で、R2 の `x` は 50 のまま）。
    - 例6: R1（id 1, x 0, y 0、子なし）、R2（id 2, x 0, y 190）、R2 の子（id 3, x 220, y 140）・（id 4, x 220, y 240）で R2 を `before R1`・`mode: "auto"` → 結果を `layoutNodeForest` に通すと、R2 `(0, 0)`、子 `(220, -50)`・`(220, 50)`、R1 `(0, 190)`。
- [ ] RED: `npm test -- --runInBand nodeSiblingOrder.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-035、L-457、L-460、L-472、L-540、L-541。
- 完了条件: 全ケースが通る。`splice`・`indexOf` による位置の計算・スプレッドの最小値／最大値を使っていない。

### Task 3: 通知の文言

**Files**
- Create: `client/src/domain/nodes/nodeSiblingOrderMessages.ts`
- Create: `client/src/domain/nodes/__tests__/nodeSiblingOrderMessages.test.ts`

**Interfaces**
- Consumes: Task 2 の `ReorderSiblingResult`。既存の `OperationNotice`（`@/types/operationNotice`、`{ kind: "status" | "warning" | "error"; message: string }`）。
- Produces:
  ```ts
  export function formatSiblingReorderNotice(result: ReorderSiblingResult): OperationNotice;
  ```

**実装の要点**（設計書の「通知」の表）
- 「兄弟」は `isRoot` が `true` なら「ルート」にする（成功・端・端の案内のすべての文言で同じ）。M = `visibleIndex + 1`、N = `visibleCount`。数値に桁区切りを付けない。
- 成功（上へ）: `status`、`枝を上へ移動しました（見えている兄弟のN件中M番目）。`。下へ: `枝を下へ移動しました（…）。`
- `at-edge`（上へ）: `status`、`これ以上上へ移動できません（見えている兄弟の先頭です）。`。下へ: `これ以上下へ移動できません（見えている兄弟の末尾です）。`。`hiddenBeyond` なら続けて `隠れている兄弟と入れ替えるには、表示を『すべて』に切り替えてください。`
- `node-missing`・`node-hidden`・`invalid-target`・`placement-failed`: `error`、`枝の順序を変更できませんでした。`
- `ok` と `reason` と `direction` の分岐は `switch` で網羅する（`never` で型検査）。

- [ ] テストを書く（`it.each` で入力と期待値をリテラルで並べる）。
  - 成功: 上へ・兄弟・`visibleIndex: 0, visibleCount: 3` → `{ kind: "status", message: "枝を上へ移動しました（見えている兄弟の3件中1番目）。" }`。下へ・ルート・`2, 3` → `"枝を下へ移動しました（見えているルートの3件中3番目）。"`。`visibleCount: 10000` → `"…10000件中…"`（桁区切りなし）。
  - 端: 上へ・兄弟・`hiddenBeyond: false` → `"これ以上上へ移動できません（見えている兄弟の先頭です）。"`。下へ・兄弟・`hiddenBeyond: true` → `"これ以上下へ移動できません（見えている兄弟の末尾です）。隠れている兄弟と入れ替えるには、表示を『すべて』に切り替えてください。"`。上へ・ルート・`hiddenBeyond: true` → `"これ以上上へ移動できません（見えているルートの先頭です）。隠れているルートと入れ替えるには、表示を『すべて』に切り替えてください。"`。どれも `kind: "status"`。
  - 失敗の4つの理由 → それぞれ `{ kind: "error", message: "枝の順序を変更できませんでした。" }`。
- [ ] RED: `npm test -- --runInBand nodeSiblingOrderMessages.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-057。
- 完了条件: 表の全行がテストにあり、通る。

### Task 4: useNodes.reorderSibling（1回の commit）

**Files**
- Modify: `client/src/hooks/useNodes.ts`
- Create: `client/src/hooks/__tests__/useNodesSiblingOrder.test.ts`

**Interfaces**
- Consumes: Task 2 の `findSiblingReorderTarget`、`reorderSiblingNodes`、`SiblingReorderRequest`、`SiblingReorderTarget`、`ReorderSiblingResult`。既存の `applyTreeChange`（`useNodeLayoutState` が返す。コールバック `(currentNodes, mode) => Node[] | null` を受け、`null` なら何も変えず `false`、自動配置なら候補を `layoutNodeForest` に通して失敗なら `false`、成功なら1回 commit して `true`）。
- Produces（`UseNodesReturn` に追加。`ReorderSiblingResult` は `useNodes.ts` から再 export しない）:
  ```ts
  // 見えている兄弟の中で並べ替える。applyTreeChange を1回だけ呼び、選択と documentRevision は変えない。失敗時は何も変えない
  reorderSibling: (
    nodeId: number,
    request: SiblingReorderRequest,
    visibleNodeIds: ReadonlySet<number>,
  ) => ReorderSiblingResult;
  ```

**実装の要点**（設計書の「useNodes の操作」）
- `applyTreeChange((currentNodes, mode) => { ... })` を1回だけ呼ぶ。コールバックの中で:
  - `request.kind` を `switch` で分ける。`"step"` なら `findSiblingReorderTarget(currentNodes, nodeId, request.direction, visibleNodeIds)`。失敗なら結果を控えて `null`（`at-edge` は `{ ok: false, reason: "at-edge", direction: request.direction, hiddenBeyond, isRoot }`、それ以外は `{ ok: false, reason }`）。`"drop"` なら `request.target`。
  - `reorderSiblingNodes(currentNodes, nodeId, target, visibleNodeIds, mode)`。失敗なら `{ ok: false, reason }` を控えて `null`、成功なら `{ ok: true, direction, visibleIndex, visibleCount, isRoot }` を控えて `nodes` を返す。
- `applyTreeChange` が `false` のとき、控えた失敗があればそれを、無い（または控えたのが成功）なら `{ ok: false, reason: "placement-failed" }` を返す（自動配置の `layoutNodeForest` の失敗）。`true` なら控えた成功を返す。
- 閉包で代入する変数は `let outcome: ReorderSiblingResult | null = null;` と型を明示する（既存の `insertForest` の `failureReason` と同じ書き方）。
- `setSelectedNodeId` と `setDocumentRevision` を呼ばない。

- [ ] `useNodesSiblingOrder.test.ts` を書く（`useNodesDuplication.test.ts` と同じく `renderHook(() => useNodes())` と `replaceMap`。自動配置の失敗は同ファイルと同じく `jest.mock("@/domain/nodes/nodeAutoLayout", …)` で `layoutNodeForest` を `jest.fn(actual.layoutNodeForest)` に包む）。全件が見えている場合は `new Set(nodes.map((node) => node.id))` を渡す。
  - 手動配置の `step`: ルート R（id 1）の子 A（id 2, x 400, y 0）・T（id 3, x 400, y 100）で T を `{ kind: "step", direction: "up" }` → `{ ok: true, direction: "up", visibleIndex: 0, visibleCount: 2, isRoot: false }`、`nodes` の ID の並びが `[1, 3, 2]`、T の y 0・A の y 100。
  - 手動配置の `drop`: 同じ形で `{ kind: "drop", target: { position: "before", anchorId: 2 } }` → 同じ結果。
  - 自動配置の `step` と `drop`: ルートの子3つを自動配置にしたマップで、末尾の子を上へ → 子の並びが入れ替わり、`layoutNodeForest` の結果どおりの座標（先頭の子が y の小さい側）になる。
  - 1回の commit: 成功の後 `undo()` 1回で並びと座標が元に戻り、`redo()` で並べ替えた直後と同じ並びと座標（`toEqual`）。`replaceMap` の直後から並べ替えを1回 → `undo()` は1回目 `true`・2回目 `false`。
  - 成功で `selectedNodeId`（事前に `selectNode(3)`）と `documentRevision` が変わらない。
  - 失敗で何も変わらない（L-001）: 先頭の子を上へ → `{ ok: false, reason: "at-edge", direction: "up", hiddenBeyond: false, isRoot: false }`。存在しない anchor の `drop` → `invalid-target`。手動配置の桁落ちの入力（R（id 1, parentId null, x 0, y 0）、A（id 2, parentId 1, x 400, y 0）、T（id 3, parentId 1, x 400, y 4）、Tc（id 4, parentId 3, x 600, y 1e17）、すべて幅 100・高さ 60。T を `{ kind: "step", direction: "up" }`）→ `placement-failed`。どれもノード・選択・`canUndo`・`canRedo` が変わらない。事前に何かを `undo()` して `canRedo === true` にしてから失敗させても `canRedo` が `true` のまま。
  - 自動配置の失敗: `layoutNodeForest` を並べ替えの候補のときだけ `null` を返すようにし（`mockImplementationOnce(() => null)`）、`{ ok: false, reason: "placement-failed" }`、ノードと `canRedo` が変わらない。
  - 最新の配列で解決する（L-035）: 手動配置で R の子 A・T（T が末尾）。同じ `act` の中で `const created = addSiblingNode(3)!;` の直後に `reorderSibling(3, { kind: "step", direction: "down" }, new Set([1, 2, 3, created]))` → `ok: true`（追加後の配列で、T が新しい兄弟の後ろへ移る）。描画時の古い `nodes` で判定すると `at-edge` になって落ちる。
- [ ] RED: `npm test -- --runInBand useNodesSiblingOrder.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-035、L-037（`documentRevision` を上げない理由: 折りたたみと通知を保つ）。
- 完了条件: 全ケースが通り、既存の `useNodes*.test.ts` が変更なしで通る。

### Task 5: useSiblingReorderAction（ボタンの状態と通知）

**Files**
- Create: `client/src/hooks/useSiblingReorderAction.ts`
- Create: `client/src/hooks/__tests__/useSiblingReorderAction.test.tsx`

**Interfaces**
- Consumes: Task 2 の `getSiblingReorderAvailability`、`SiblingReorderDirection`、`SiblingReorderRequest`、`ReorderSiblingResult`。Task 3 の `formatSiblingReorderNotice`。Task 4 の `reorderSibling` の型。既存の `useRevisionScopedNotice(documentRevision)`（`{ notice, publishNotice }` を返す。通知は次の `publishNotice` か `documentRevision` の変化まで残る）、`OperationNotice`。
- Produces:
  ```ts
  export type UseSiblingReorderActionOptions = {
    selectedNodeId: number | null;
    nodes: readonly Node[];                 // 正本（useNodes の nodes）
    visibleNodeIds: ReadonlySet<number>;    // displayState.visibleNodeIds
    documentRevision: number;
    reorderSibling: (
      nodeId: number,
      request: SiblingReorderRequest,
      visibleNodeIds: ReadonlySet<number>,
    ) => ReorderSiblingResult;
  };
  export type UseSiblingReorderActionReturn = {
    canMoveUp: boolean;
    canMoveDown: boolean;
    moveSelected: (direction: SiblingReorderDirection) => void; // 未選択なら何もしない
    reorder: (nodeId: number, request: SiblingReorderRequest) => void; // MapStage の onReorderSibling に渡す
    notice: OperationNotice | null;         // 操作通知バーの8系統目
  };
  export function useSiblingReorderAction(options: UseSiblingReorderActionOptions): UseSiblingReorderActionReturn;
  ```

**実装の要点**（設計書の「useSiblingReorderAction の入出力」）
- `availability = useMemo(() => getSiblingReorderAvailability(nodes, selectedNodeId, visibleNodeIds), [nodes, selectedNodeId, visibleNodeIds])`。`canMoveUp = selectedNodeId !== null && availability.up`、`canMoveDown` も同様。
- `reorder(nodeId, request)`: `const result = reorderSibling(nodeId, request, visibleNodeIds)`（受け取った `visibleNodeIds` をそのまま渡す）→ `publishNotice(formatSiblingReorderNotice(result))`。結果によらず必ず1回通知する。`useCallback` の依存は `reorderSibling`・`visibleNodeIds`・`publishNotice`。
- `moveSelected(direction)`: `selectedNodeId === null` なら何もしない（`reorderSibling` も通知も呼ばない）。それ以外は `reorder(selectedNodeId, { kind: "step", direction })`。

- [ ] テストを書く（`renderHook` と `rerender`。`reorderSibling` は型付きの `jest.fn<ReorderSiblingResult, [number, SiblingReorderRequest, ReadonlySet<number>]>()` で、本物と同じ結果型を返す。ノードは R（id 1）の子 2・3・4）。
  - `canMoveUp` / `canMoveDown`: 未選択 → 両方 `false`。3 を選択 → 両方 `true`。2 → `false / true`。4 → `true / false`。表示集合から 2 を外して 3 を選択 → `false / true`。`nodes` から 4 を外して 3 を選択 → `true / false`。
  - `moveSelected("up")`: `selectedNodeId: 3` で `reorderSibling` が `(3, { kind: "step", direction: "up" }, visibleNodeIds)` で1回呼ばれ、第3引数が渡した集合と同じオブジェクト（`toBe`）。未選択では呼ばれず、`notice` が `null` のまま。
  - `reorder(4, { kind: "drop", target: { position: "before", anchorId: 2 } })` が同じ引数で `reorderSibling` を呼ぶ。
  - 通知: 成功（`{ ok: true, direction: "up", visibleIndex: 0, visibleCount: 3, isRoot: false }`）→ `{ kind: "status", message: "枝を上へ移動しました（見えている兄弟の3件中1番目）。" }`。`at-edge` → 端の文言。`invalid-target` → `{ kind: "error", message: "枝の順序を変更できませんでした。" }`。
  - `documentRevision` を 0 から 1 にして `rerender` すると `notice` が `null`。
  - 同じ描画の中で別の `useRevisionScopedNotice` を使う部品（テスト用の小さな部品で `useNodeDuplicationAction` 相当の通知を出す）の通知を消さない: 2つのフックを1つの `renderHook` で呼び、並べ替えの通知を出しても、もう一方の `notice` が残る。
- [ ] RED: `npm test -- --runInBand useSiblingReorderAction.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-037、L-057。
- 完了条件: 全ケースが通る。フックはまだどこからも使われない（Task 9 で配線する）。

### Task 6: ヘッダーの「上へ」「下へ」ボタン

**Files**
- Create: `client/src/components/layout/NodeSiblingOrderControl.tsx`
- Create: `client/src/components/layout/__tests__/NodeSiblingOrderControl.test.tsx`

**Interfaces**
- Produces:
  ```ts
  export type NodeSiblingOrderControlProps = {
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
  };
  export function NodeSiblingOrderControl(props: NodeSiblingOrderControlProps): JSX.Element;
  ```

**実装の要点**（設計書の「ヘッダーのボタン」）
- `<div role="group" aria-label="兄弟の順序" className="flex shrink-0 gap-2">` の中に2つの `<button type="button">`。クラスは `NodeDuplicateControl` と同じ文字列 `"shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200"`。
- 上へ: 表示 `上へ`、`aria-label="枝を上へ移動"`、`aria-keyshortcuts="Alt+ArrowUp"`、`title="枝を上へ移動（Alt/Option+↑）"`、`disabled={!canMoveUp}`、`onClick={onMoveUp}`。下へ: `下へ`、`枝を下へ移動`、`Alt+ArrowDown`、`枝を下へ移動（Alt/Option+↓）`、`disabled={!canMoveDown}`、`onClick={onMoveDown}`。
- 両方のボタンの `onKeyDown`: `event.key === "Enter" && event.repeat` なら `preventDefault`。Space は止めない。
- フォーカス: `MapHistoryControls`（`client/src/components/layout/MapHistoryControls.tsx`）と同じ仕組み。2つのボタンの ref、直前にフォーカスしていたボタンの ref（`onFocus` で記録、`onBlur` ではボタンが無効でないときだけ消す）、`useLayoutEffect`（依存 `[canMoveUp, canMoveDown]`）で、記録したボタンが無効になり、`document.activeElement` がそのボタンか `document.body` か `null` で、もう一方が有効なら、もう一方へ `focus()`。
- `onClick` で `event.detail` を見ない（ダブルクリックは2回の移動。L-150）。`pointerdown` の既定の動作を止めない。押した後にアプリからフォーカスを移さない。

- [ ] テストを書く。
  - 名前と属性: `getByRole("group", { name: "兄弟の順序" })` の中に `getByRole("button", { name: "枝を上へ移動" })` があり、`textContent` が `"上へ"`、`aria-keyshortcuts` が `"Alt+ArrowUp"`、`title` が `"枝を上へ移動（Alt/Option+↑）"`、`type="button"`、`className` に `focus-visible:` を含む。下へも同様。
  - クリック: 有効なとき `userEvent.click` で `onMoveUp` / `onMoveDown` が1回。`userEvent.dblClick` で2回（L-150）。
  - 無効（L-058）: `canMoveUp: false` で「上へ」に `disabled` 属性が付き、`userEvent.click` で `onMoveUp` が呼ばれない。下へも同様。
  - Enter の押し続け（L-408）: 両方のボタンで `fireEvent.keyDown(button, { key: "Enter", repeat: true })` の戻り値が `false`、`{ key: "Enter", repeat: false }` と `{ key: " ", repeat: true }` は `true`。
  - フォーカス: 「上へ」に `focus()` して、`rerender` で `canMoveUp: false`（`canMoveDown: true`）にすると、`document.activeElement` が「下へ」。両方 `false` にすると移さない（「下へ」へ移っていない）。「下へ」から同様に「上へ」へ移る。フォーカスがほかの要素（テスト用の `<input>`）にあるときは移さない。
- [ ] RED: `npm test -- --runInBand NodeSiblingOrderControl.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-058、L-150、L-408。
- 完了条件: 部品は状態を持たない（フォーカス用の ref だけ）。まだどこからも描画されない（Task 11 で配線する）。

### Task 7: ショートカット（Alt/Option+↑/↓）

**Files**
- Create: `client/src/components/map/interactiveTarget.ts`、`client/src/components/map/__tests__/interactiveTarget.test.ts`
- Modify: `client/src/components/map/useNodeKeyboardShortcuts.ts`（`isInteractiveTarget` を削除し、`interactiveTarget.ts` から import する）
- Create: `client/src/components/map/siblingReorderShortcut.ts`、`client/src/components/map/__tests__/siblingReorderShortcut.test.ts`
- Create: `client/src/components/map/useSiblingReorderShortcut.ts`、`client/src/components/map/__tests__/useSiblingReorderShortcut.test.tsx`

**Interfaces**
- Consumes: Task 2 の `SiblingReorderDirection`、`SiblingReorderRequest`。
- Produces:
  ```ts
  // interactiveTarget.ts。button, input, textarea, select, a[href], [contenteditable]（値によらず）の内側か
  export function isInteractiveTarget(target: EventTarget | null): boolean;

  // siblingReorderShortcut.ts
  export type SiblingReorderShortcutInput = {
    key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean;
    isComposing: boolean; keyCode: number; defaultPrevented: boolean; target: EventTarget | null;
    isEditing: boolean; selectedNodeId: number | null; hasActiveGesture: boolean;
  };
  export function resolveSiblingReorderShortcut(input: SiblingReorderShortcutInput): SiblingReorderDirection | null;

  // useSiblingReorderShortcut.ts
  export type UseSiblingReorderShortcutOptions = {
    selectedNodeId: number | null;
    isEditing: boolean;
    hasActiveGesture: () => boolean;   // keydown の時点で呼ぶ
    enabled: boolean;
    onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void;
  };
  export function useSiblingReorderShortcut(options: UseSiblingReorderShortcutOptions): void;
  ```

**実装の要点**（設計書の「ショートカット」）
- `isInteractiveTarget` は今の実装をそのまま移す: `target instanceof HTMLElement && Boolean(target.closest("button, input, textarea, select, a[href], [contenteditable]"))`。挙動を変えない。既存の `editableTarget.ts`（文字入力先だけ）・`textEntryTarget.ts`（`input, textarea` だけ）とは範囲が違うので統合しない。
- `resolveSiblingReorderShortcut`: 次をすべて満たすときだけ `"ArrowUp"` → `"up"`、`"ArrowDown"` → `"down"`。それ以外は `null`。`repeat` は見ない。
  1. `!defaultPrevented`。2. `!isComposing && keyCode !== 229`。3. `altKey && !ctrlKey && !metaKey && !shiftKey`。4. `!isEditing`。5. `!isInteractiveTarget(target)`。6. `selectedNodeId !== null`。7. `!hasActiveGesture`。
- `useSiblingReorderShortcut`: 既存の `useMapViewportShortcut`（`client/src/components/map/useMapViewportShortcut.ts`）と同じ形。最新の options を ref に控え（`useLayoutEffect` で更新）、`window` の `keydown` は `useEffect(…, [])` で1回だけ登録する。ハンドラ: `enabled` が偽なら何もしない → `selectedNodeId` が `null` なら何もしない → `resolveSiblingReorderShortcut({ …event の値, isEditing, selectedNodeId, hasActiveGesture: latest.hasActiveGesture() })` → `null` なら何もしない（`preventDefault` しない）→ `event.preventDefault()` してから `onReorderSibling(selectedNodeId, { kind: "step", direction })`。端で動かせないときも `preventDefault` する（判定は呼び出し先の結果を待たない）。

- [ ] `interactiveTarget.test.ts`: `button`・`input`・`textarea`・`select`・`a[href]`・`[contenteditable="false"]`（値によらず真）の要素と、その内側の `span` で `true`。`div`・`a`（`href` なし）・`document.body`・`window`・`null` で `false`。
- [ ] `siblingReorderShortcut.test.ts`: 基準の入力（`key: "ArrowUp", altKey: true`、他の修飾キー偽、`isComposing: false, keyCode: 38, defaultPrevented: false, target: document.body, isEditing: false, selectedNodeId: 1, hasActiveGesture: false`）で `"up"`、`ArrowDown`（`keyCode: 40`）で `"down"`。`it.each` で1つだけ条件を外した入力を並べ、それぞれ `null`: `altKey: false`、`ctrlKey: true`、`metaKey: true`、`shiftKey: true`、`isComposing: true`、`keyCode: 229`、`defaultPrevented: true`、`isEditing: true`、`selectedNodeId: null`、`hasActiveGesture: true`、`target` が `button`・`input`・`textarea`・`select`・`a[href]`・`[contenteditable]` の内側の要素、`key: "ArrowLeft"`・`"ArrowRight"`・`"Up"`。
- [ ] `useSiblingReorderShortcut.test.tsx`（`useNodeKeyboardShortcuts.test.tsx` と同じく `renderHook` と `fireEvent.keyDown(document.body, …)`）:
  - `selectedNodeId: 5`・`enabled: true` で `Alt+ArrowUp` → `onReorderSibling` が `(5, { kind: "step", direction: "up" })` で1回、`fireEvent.keyDown` の戻り値が `false`。`Alt+ArrowDown` → `"down"`。
  - `repeat: true` でも呼び、戻り値 `false`。
  - `enabled: false` で、選択中でも呼ばれず、戻り値 `true`。`rerender` で `enabled: true` に戻すと呼ばれる。
  - 登録をやり直さない: `jest.spyOn(window, "addEventListener")` で、`enabled`・`selectedNodeId`・`onReorderSibling`・`hasActiveGesture` を変えて `rerender` しても、`"keydown"` の登録が1回だけ。
  - `hasActiveGesture` を keydown の時点で呼ぶ: `let active = false; hasActiveGesture: () => active` で、描画の後に `active = true` にして `Alt+ArrowUp` → 呼ばれず戻り値 `true`。
  - 判定が `null` の場面（`isEditing: true`、`selectedNodeId: null`、`Alt+Shift+ArrowUp`、`isComposing: true`、`<input>` に送る）で呼ばれず、戻り値が `true`（`preventDefault` しない）。
  - `useNodeKeyboardShortcuts.test.tsx` を変更せずに実行して通ること。
- [ ] RED: `npm test -- --runInBand interactiveTarget.test.ts siblingReorderShortcut.test.ts useSiblingReorderShortcut.test.tsx`。
- [ ] 実装し、GREEN と `npm test -- --runInBand useNodeKeyboardShortcuts.test.tsx`、verify。
- 知見: L-061、L-474、L-522。
- 完了条件: 全ケースが通り、`useNodeKeyboardShortcuts.test.tsx` が変更なしで通る。フックはまだどこからも使われない（Task 11 で配線する）。

### Task 8: ドロップ位置の判定・並べ替えのジェスチャー・ドラッグ中の Escape

**Files**
- Create: `client/src/components/map/siblingReorderDropSlot.ts`、`client/src/components/map/__tests__/siblingReorderDropSlot.test.ts`
- Create: `client/src/components/map/pixi/siblingReorderGesture.ts`、`client/src/components/map/pixi/__tests__/siblingReorderGesture.test.ts`
- Create: `client/src/components/map/useSiblingReorderDragEscape.ts`、`client/src/components/map/__tests__/useSiblingReorderDragEscape.test.tsx`

**Interfaces**
- Consumes: Task 2 の `SiblingReorderTarget`、`SiblingReorderRequest`。既存の `PointerGesture`・`PointerSample`・`LatestValue`（`@/components/map/pixi/pointerGesture`。`PointerGesture = { move(sample); end(sample); cancel(); activeNodeIds?(): readonly number[] }`、`PointerSample = { pointerId; pointerType; screen: Point; world: Point }`）、`createDragActivation(start: Point, threshold)`（`@/components/map/pixi/dragActivation`。`update(point)` が、x・y の移動量がどちらもしきい値未満の間は `null`、超えた後は移動量を返す）、`hasFinitePointerCoordinates`（`@/components/map/pixi/pointerSample`）、`SIBLING_VERTICAL_GAP`、`NodeLayoutMode`。
- Produces:
  ```ts
  // siblingReorderDropSlot.ts
  export type SiblingReorderIndicator = { left: number; right: number; y: number };
  export type SiblingReorderPreview = { nodeId: number; indicator: SiblingReorderIndicator | null }; // 元の位置では indicator が null
  export type SiblingReorderDrop = {
    target: SiblingReorderTarget | null; // 元の位置では null
    slot: number;
    indicator: SiblingReorderIndicator | null;
  };
  export function resolveSiblingReorderDrop(
    displayNodes: readonly Node[], visibleNodeIds: ReadonlySet<number>, nodeId: number, pointerY: number,
  ): SiblingReorderDrop | null;

  // pixi/siblingReorderGesture.ts
  export type SiblingReorderGestureOptions = {
    nodeId: number;
    startSample: PointerSample;
    nodesRef: LatestValue<readonly Node[]>;              // 表示用の座標（displayNodes）
    visibleNodeIdsRef: LatestValue<ReadonlySet<number>>;
    layoutModeRef: LatestValue<NodeLayoutMode>;
    onReorderSiblingRef: LatestValue<(nodeId: number, request: SiblingReorderRequest) => void>;
    onSiblingReorderPreviewChangeRef: LatestValue<(preview: SiblingReorderPreview | null) => void>;
    dragThreshold: number;
  };
  export function createSiblingReorderGesture(options: SiblingReorderGestureOptions): PointerGesture | null;

  // useSiblingReorderDragEscape.ts
  export type UseSiblingReorderDragEscapeOptions = {
    isSiblingReorderActive: () => boolean;
    cancelActiveGesture: () => void;
  };
  export function useSiblingReorderDragEscape(options: UseSiblingReorderDragEscapeOptions): void;
  ```

**実装の要点**
- `resolveSiblingReorderDrop`（設計書の「挿入位置の決め方」）:
  - T が無い、T が見えていない、`pointerY` が有限でない → `null`。
  - O = T と同じ親を持つ見えている兄弟から T を除いたもの（配列の順）、`m` = O の件数。`centerY(O_i) = O_i.y + O_i.height / 2`。`slot` = `centerY(O_i) <= pointerY` を満たす O_i の数。`original` = 配列で T より前にある O の数。
  - `slot === original` → `{ target: null, slot, indicator: null }`。`slot < original` → `target = { position: "before", anchorId: O[slot].id }`。`slot > original` → `target = { position: "after", anchorId: O[slot - 1].id }`。
  - 線（`slot !== original`）: `left` = T と O の `x` の最小値 − 8、`right` = T と O の `x + width` の最大値 + 8（ループで求める）。`slot === 0` → `y = O[0].y − 20`、`slot === m` → `y = O[m−1].y + O[m−1].height + 20`、それ以外 → `y = (O[slot−1].y + O[slot−1].height + O[slot].y) / 2`。20 は `SIBLING_VERTICAL_GAP / 2`。
  - ポインタの横位置は見ない。O は1回の走査で集める（O の中の位置で `O[slot]` を引くのは、この関数の中だけの局所的な読み取りで、層の間で添字を渡さない）。
- `createSiblingReorderGesture`（設計書の `createSiblingReorderGesture`）:
  - 始めた時点で T が `nodesRef.current` に無い、または `startSample` の座標が有限でなければ `null`。
  - 状態: `activation = createDragActivation(startSample.screen, dragThreshold)`、`activated`（しきい値を超えたか）、`lastSlot: number | null`、`finished`。
  - `move(sample)`: `finished` か座標が有限でなければ無視。`layoutModeRef.current !== "auto"` なら `cancel()` と同じ。`activation.update(sample.screen)` が `null` なら何もしない。`resolveSiblingReorderDrop(nodesRef.current, visibleNodeIdsRef.current, nodeId, sample.world.y)` が `null` なら何もしない（前のプレビューを保つ）。最初に超えたとき、または `drop.slot !== lastSlot` のときだけ `onSiblingReorderPreviewChangeRef.current({ nodeId, indicator: drop.indicator })` を呼び、`activated = true`、`lastSlot = drop.slot`。
  - `end(sample)`: `finished` なら何もしない。`finished = true`。`activated` でなければ何もしない（クリック）。`layoutModeRef.current !== "auto"` か座標が有限でない → プレビューを `null` に戻して終わる。それ以外は `end` の `sample.world.y` と最新の `nodesRef`・`visibleNodeIdsRef` で `resolveSiblingReorderDrop` を求め直し（`move` で控えた値を使わない）、プレビューを `null` に戻してから、`drop?.target` があれば `onReorderSiblingRef.current(nodeId, { kind: "drop", target: drop.target })`。
  - `cancel()`: `finished` なら何もしない。`finished = true`。`activated` ならプレビューを `null` に戻す。並べ替えない。
  - `activeNodeIds: () => [nodeId]`。`onBeginNodeMove` に当たるものを持たない（履歴のグループを開かない）。
- `useSiblingReorderDragEscape`: 最新の options を ref に控え、`window` の `keydown` を1回だけ登録する。`event.key !== "Escape"`、`event.isComposing`、`event.keyCode === 229`、`!isSiblingReorderActive()` のどれかなら何もしない（`preventDefault` もしない）。それ以外は `event.preventDefault()` して `cancelActiveGesture()`。`enabled` を持たない（中止しか行わないので、ダイアログ中も働いてよい）。

- [ ] `siblingReorderDropSlot.test.ts`（設計書の例: 親 R（id 1, x 0）の子 A（2）・T（3）・B（4）・C（5）が x 220・幅 100・高さ 60・y 0, 100, 200, 300、全件見えている）:
  - `pointerY` 10 → `{ slot: 0, target: { position: "before", anchorId: 2 }, indicator: { left: 212, right: 328, y: -20 } }`。150 → `{ slot: 1, target: null, indicator: null }`。250 → `slot 2`、`after 4`、`y 280`。400 → `slot 3`、`after 5`、`y 380`。中心ちょうど 230 → `slot 2`（`<=` を `<` に変えると 1 になって落ちる）。
  - T が先頭（A の位置）・末尾・一人っ子（O が空 → 常に `slot 0 === original 0` で `target: null`）。
  - 隠れた兄弟が O に入らない: B を隠すと、`pointerY 250` で O = [A, C]（中心 30, 330）→ `slot 1 === original 1` で `target: null`。
  - 別の親の子（x 600 の別の木、y 180）が O に入らず、線の `right` にも影響しない。
  - 表示用の座標で判定する: 同じ ID で y だけ違う2つの配列（正本の座標と、折りたたみの表示用の座標）を作り、表示用の配列を渡したときの結果が表示用の y で決まる（正本の配列を渡すと `slot` が変わる入力にする）。
  - `pointerY` が `NaN`・`Infinity`、T が無い、T が隠れている → `null`。
- [ ] `siblingReorderGesture.test.ts`（`nodeMoveGesture.test.ts` と同じく ref を `{ current: … }` で作り、`PointerSample` をリテラルで作る。ノードは上と同じ配置、T = 3、`dragThreshold: 4`）:
  - 4px 未満（screen の移動が x・y ともに 3）ではプレビューも並べ替えも起きない。`end` しても `onReorderSibling` を呼ばない。
  - 超えた最初の `move`（world.y 150、元の位置）でプレビューが `{ nodeId: 3, indicator: null }` で1回。同じ slot の `move` を続けても呼ばれない。world.y 250 へ動かすと `{ nodeId: 3, indicator: { left: 212, right: 328, y: 280 } }` で1回。
  - `end`（world.y 250）でプレビューが `null` に戻ってから `onReorderSibling(3, { kind: "drop", target: { position: "after", anchorId: 4 } })`（呼び出し順を `mock.invocationCallOrder` で確かめる）。
  - `end` が求め直す（L-035）: world.y 250 まで `move` した後、`nodesRef.current` を C（id 5）の y だけを 150 にした配列に差し替えてから `end`（world.y 250）→ O の中心が 30・230・180 になり、`slot 3` で `onReorderSibling(3, { kind: "drop", target: { position: "after", anchorId: 5 } })`（差し替える前の値で判定すると `after 4` になって落ちる）。
  - 元の位置で離す（world.y 150）→ プレビューは `null` に戻るが `onReorderSibling` を呼ばない。
  - `cancel` の後の `end` で呼ばない。`end` を2回・`cancel` を2回・`end` の後の `cancel` で、プレビューを `null` に戻すのは1回、`onReorderSibling` も1回以下。
  - 配置モードが途中で手動になる: 超えた後に `layoutModeRef.current = "manual"` にして `move` → プレビューが `null` に戻り、以後の `end` で呼ばない。`end` の時点で手動になっても呼ばない。
  - 有限でない座標の `move` は無視、有限でない `end` は中止と同じ。
  - 始めた時点で T が無い・`startSample` が有限でない → `null`。`activeNodeIds()` が `[3]`。
- [ ] `useSiblingReorderDragEscape.test.tsx`: `isSiblingReorderActive: () => true` で `fireEvent.keyDown(window, { key: "Escape" })` → `cancelActiveGesture` が1回、戻り値 `false`。`() => false`・`key: "Enter"`・`isComposing: true`・`keyCode: 229` では呼ばれず、戻り値 `true`。`isSiblingReorderActive` を keydown の時点で呼ぶ（描画後に値を変えた関数で確かめる）。
- [ ] RED: `npm test -- --runInBand siblingReorderDropSlot.test.ts siblingReorderGesture.test.ts useSiblingReorderDragEscape.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-035、L-472、L-474。
- 完了条件: 全ケースが通る。3つのモジュールはまだどこからも使われない（Task 9 で配線する）。

### Task 9: ステージの操作への組み込みとドラッグの配線

**Files**
- Modify: `client/src/components/map/pixi/stageInteractions.ts`、`client/src/components/map/pixi/__tests__/stageInteractions.test.ts`
- Modify: `client/src/components/map/useStageInteractionValues.ts`、`client/src/components/map/__tests__/useStageInteractionValues.test.tsx`
- Modify: `client/src/components/map/useMapStageInteractions.ts`、`client/src/components/map/__tests__/useMapStageInteractions.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`、`client/src/components/map/__tests__/MapStage.test.tsx`、`MapStageVisibility.test.tsx`、`MapStageContextMenu.test.tsx`、`MapStageHistory.test.tsx`
- Modify: `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`

**Interfaces**
- Consumes: Task 2 の `SiblingReorderRequest`。Task 4 の `reorderSibling`。Task 5 の `useSiblingReorderAction`。Task 8 の `createSiblingReorderGesture`、`SiblingReorderPreview`、`useSiblingReorderDragEscape`。既存の `NodeLayoutMode`。
- Produces:
  ```ts
  // createStageInteractions の options に追加（必須）
  layoutModeRef: LatestValue<NodeLayoutMode>;
  onReorderSiblingRef: LatestValue<(nodeId: number, request: SiblingReorderRequest) => void>;
  onSiblingReorderPreviewChangeRef: LatestValue<(preview: SiblingReorderPreview | null) => void>;
  // createStageInteractions の戻り値に追加
  isSiblingReorderActive: () => boolean;

  // useStageInteractionValues の options に追加（必須）と戻り値に追加
  layoutMode: NodeLayoutMode;            // → layoutModeRef
  onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void; // → onReorderSiblingRef

  // useMapStageInteractions の options に追加（必須）
  layoutMode: NodeLayoutMode;
  onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void;
  // useMapStageInteractions の戻り値に追加
  siblingReorderPreview: SiblingReorderPreview | null;
  isSiblingReorderActive: () => boolean;

  // MapStageProps に追加（必須）
  layoutMode: NodeLayoutMode;
  // ショートカットとドラッグの並べ替えの要求。結果の通知は呼び出し元が出す
  onReorderSibling: (nodeId: number, request: SiblingReorderRequest) => void;

  // MapEditor の中（Task 11 が使う）
  const siblingReorder = useSiblingReorderAction({
    selectedNodeId, nodes, visibleNodeIds: displayState.visibleNodeIds, documentRevision, reorderSibling,
  });
  ```

**実装の要点**
- `stageInteractions.ts`:
  - `handleNodePointerDown` の分岐を、Shift → `createNodeConnectionGesture`（今のまま）、`layoutModeRef.current === "auto"` → `createSiblingReorderGesture({ nodeId, startSample: sample, nodesRef, visibleNodeIdsRef: 並べ替え用の ref, layoutModeRef, onReorderSiblingRef, onSiblingReorderPreviewChangeRef, dragThreshold })`、それ以外 → `createNodeMoveGesture`（今のまま）にする。それ以前の検査は変えない。
  - `visibleNodeIdsRef` は今は省略可能なので、並べ替えには `visibleNodeIdsRef ?? { get current() { return new Set(nodesRef.current.map((node) => node.id)); } }` を渡す（省略時は全件が見えている扱い。既存の `resolveEffectiveVisibleNodeIds` と同じ意味）。
  - 作った並べ替えのジェスチャーを変数に控え、`isSiblingReorderActive = () => { const lease = pointerGestures.current(); return lease !== null && lease.gesture === siblingReorderGesture; }`。戻り値に足す。
- `useStageInteractionValues.ts`: `layoutModeRef` と `onReorderSiblingRef` を足し、既存の `useLayoutEffect` で同期する（依存配列にも足す）。
- `useMapStageInteractions.ts`: `const [siblingReorderPreview, setSiblingReorderPreview] = useState<SiblingReorderPreview | null>(null);`、`onSiblingReorderPreviewChangeRef = useRef(setSiblingReorderPreview)`（`onConnectionTargetChangeRef` と同じ）。`createStageInteractions` へ3つの ref を渡し、`siblingReorderPreview` と `isSiblingReorderActive: interactions.isSiblingReorderActive` を返す。
- `MapStage.tsx`: 2つの必須の props を受け取り、`useMapStageInteractions` に渡す。`useSiblingReorderDragEscape({ isSiblingReorderActive, cancelActiveGesture })` を呼ぶ。`siblingReorderPreview` はこのタスクでは分割代入しない（Task 10 で描画へ渡す）。
- `MapEditor.tsx`: `useNodes()` から `reorderSibling` を取り出し、`const siblingReorder = useSiblingReorderAction({ selectedNodeId, nodes, visibleNodeIds: displayState.visibleNodeIds, documentRevision, reorderSibling })`。`MapStage` に `layoutMode={layoutMode}` と `onReorderSibling={siblingReorder.reorder}` を渡す。操作通知バーの「すべて `null` なら `null`」の条件に `siblingReorder.notice === null` を足し、`outlineImport.notice` の後に `{siblingReorder.notice !== null && <MapOperationNotice notice={siblingReorder.notice} />}`（8系統目）。
- `AutoLayoutMapStageHarness.tsx`: `useNodes()` から `layoutMode` と `reorderSibling` を取り出し、`layoutMode={layoutMode}`、`onReorderSibling={(nodeId, request) => { reorderSibling(nodeId, request, new Set(nodes.map((node) => node.id))); }}` を渡す。
- 既存のテストの呼び出しに、新しい必須の値を足す（「既存のテストへの影響と対処するタスク」の表）。`MapStage` のテストの `defaultProps` には `layoutMode: "manual" as const`、`onReorderSibling: jest.fn()`。

- [ ] `stageInteractions.test.ts` にテストを足す（既存のヘルパーに `layoutModeRef`（既定 `"manual"`）・`onReorderSiblingRef`・`onSiblingReorderPreviewChangeRef` を足し、overrides で変えられるようにする）:
  - 自動配置・Shift なし: ノードの `pointerdown` → stage の `pointermove`（5px 以上）→ `pointerup` で `onReorderSiblingRef.current` が `{ kind: "drop", … }` で呼ばれ、`onMoveNodeRef` と `onBeginNodeMoveRef` が呼ばれない。
  - 手動配置・Shift なし: 今までどおり移動（`onBeginNodeMoveRef` と `onMoveNodeRef` が呼ばれ、`onReorderSiblingRef` は呼ばれない）。
  - Shift あり: 両モードで接続（`onConnectNodesRef`）。
  - `pointerupoutside`・`pointercancel`・2本目の指（`pointerType: "touch"` の2つ目の `pointerdown`）で中止: プレビューが `null` に戻り、並べ替えない。
  - `isSiblingReorderActive`: 自動配置の並べ替えの途中だけ `true`。手動配置の移動・パン・接続の途中、終わった後、中止の後は `false`。
- [ ] `useMapStageInteractions.test.tsx` にテストを足す: 自動配置（`layoutMode: "auto"`）で、ノードの `pointerdown` → しきい値を超える `pointermove` で `result.current.siblingReorderPreview` が `{ nodeId, indicator: … }`、`pointerup` で `null`、`onReorderSibling` が呼ばれる。`rerender` で `layoutMode` を変えると、次のジェスチャーから分岐が変わる（ref の同期）。
- [ ] `MapStage.test.tsx` にテストを足す（`AutoLayoutMapStageHarness` を使う。ハーネスは2つのルート（id 1 が先頭）を自動配置にし、`node-state` に `nodes` を JSON で出す）:
  - 2つ目のルートを先頭のルートより上へドラッグ（`node-state` から2つのルートの座標を読み、直近の描画で登録された2つ目のルートのハンドラ `mockNodePointerHandlers.at(-1)` の `pointerdown` を2つ目のルートの中心で呼ぶ → 先頭のルートの中心より 10px 上へ `mockStageHandlers.pointermove` → 同じ位置で `pointerup`）すると、`node-state` の ID の並びが `[2, 1]` になり、先頭になった id 2 の `x` / `y` が、並べ替え前の id 1 の `x` / `y` と同じ。
  - ドラッグの途中で `fireEvent.keyDown(window, { key: "Escape" })` → 戻り値 `false`、`pointerup` しても並びが変わらない。ドラッグしていないときの Escape は戻り値 `true`。
  - 既存の「自動モードのpointer dragではノード座標を変更しない」が変更なしで通る。
- [ ] 影響の確認: `npm run typecheck` で `<MapStage`・`useMapStageInteractions(`・`useStageInteractionValues(`・`createStageInteractions(` の呼び出しの漏れが無いこと。`npm test -- --runInBand MapStage page MapEditor` が通ること。
- [ ] RED: `npm test -- --runInBand stageInteractions.test.ts useMapStageInteractions.test.tsx MapStage.test.tsx`（新しいテストが失敗し、既存のテストは必須の値を足した後も通る）。
- [ ] 実装し、GREEN と verify。
- 知見: L-035、L-037（`documentRevision` の変化で既存の `useDocumentRestoreInteractionReset` がジェスチャーを中止する）、L-060、L-061、L-472。
- 完了条件: 自動配置のドラッグで並べ替わり、手動配置のドラッグと Shift の接続は今のまま。`MapEditor` から `MapStage` へ `layoutMode` と `onReorderSibling` が渡り、並べ替えの通知が操作通知バーに出る。既存のテストは必須の値を足す以外の変更なしで通る。

### Task 10: 挿入位置の線とドラッグ中のノードの描画

**Files**
- Create: `client/src/components/map/pixi/renderSiblingReorderIndicator.ts`、`client/src/components/map/pixi/__tests__/renderSiblingReorderIndicator.test.ts`
- Modify: `client/src/components/map/pixi/renderMapNodes.ts`、`client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`
- Modify: `client/src/components/map/pixi/renderMapScene.ts`、`client/src/components/map/pixi/__tests__/renderMapScene.test.ts`
- Modify: `client/src/components/map/useRenderedMapScene.ts`、`client/src/components/map/__tests__/useRenderedMapScene.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`、`client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces**
- Consumes: Task 8 の `SiblingReorderIndicator`、`SiblingReorderPreview`。Task 9 の `useMapStageInteractions` の戻り値 `siblingReorderPreview`。既存の `PixiConstructors`（`@/components/map/pixi/pixiTypes`）。
- Produces:
  ```ts
  // renderSiblingReorderIndicator.ts。indicator が null なら何も足さない
  export function renderSiblingReorderIndicator(
    worldContainer: Container, constructors: PixiConstructors, indicator: SiblingReorderIndicator | null,
  ): void;
  // RenderMapNodesOptions に追加（必須）
  siblingReorderSourceNodeId: number | null;
  // RenderMapSceneOptions に追加（必須）
  siblingReorderIndicator: SiblingReorderIndicator | null;
  ```
  - `useRenderedMapScene` の options は `RenderMapSceneOptions` から作られているので、2つとも必須になる。

**実装の要点**（設計書の「見た目」）
- `renderSiblingReorderIndicator`: `indicator` が `null` なら何もしない。それ以外は `const graphics = new constructors.Graphics(); graphics.rect(left, y - 3, right - left, 6).fill({ color: 0x2563eb }); graphics.eventMode = "none"; worldContainer.addChild(graphics);`。
- `renderMapNodes`: `node.id === options.siblingReorderSourceNodeId` のノードは、枠と背景の `Graphics`・イラストの `Sprite`・ラベルの `Text` の `alpha` を 0.5 にする。`Container` の `alpha`（表示のフェードが使う）は変えない。選択の枠の色はそのまま。子孫と接続線は変えない。
- `renderMapScene`: `renderMapNodes` の後に `renderSiblingReorderIndicator(worldContainer, constructors, options.siblingReorderIndicator)`（ノードと接続線の上に重なる）。可視性のターゲットには入れない。
- `useRenderedMapScene`: 2つのオプションを取り出して `renderMapScene` へ渡し、effect の依存配列に足す（変わったら場面を描き直す。プレビューは挿入位置が変わったときだけ変わるので、ポインタの移動ごとには描き直さない）。
- `MapStage.tsx`: `useMapStageInteractions` の `siblingReorderPreview` を取り出し、`useRenderedMapScene` の options に `siblingReorderSourceNodeId: siblingReorderPreview?.nodeId ?? null`、`siblingReorderIndicator: siblingReorderPreview?.indicator ?? null` を渡す。
- 既存のテストの呼び出しに `siblingReorderSourceNodeId: null`・`siblingReorderIndicator: null` を足す。

- [ ] `renderSiblingReorderIndicator.test.ts`（`pixiTestHarness` か、`rect`・`fill` を `mockReturnThis` にした Graphics のモック）: `{ left: 212, right: 328, y: 280 }` で `rect(212, 277, 116, 6)`、`fill({ color: 0x2563eb })`、`eventMode === "none"`、`worldContainer.addChild` が1回。`null` で `Graphics` を作らず `addChild` も呼ばない。
- [ ] `renderMapNodes.test.ts`: `siblingReorderSourceNodeId: 2` で、ノード2の枠の `Graphics`・`Sprite`（イラスト付きのノード）・`Text` の `alpha` が 0.5、ノード2の `Container` の `alpha` は 1 のまま、ノード1の子要素の `alpha` は変えない（未設定か 1）。`null` ではどのノードも変えない。
- [ ] `renderMapScene.test.ts`: `siblingReorderIndicator` を渡すと、線の `Graphics` がノードの `Container` より後に `worldContainer.addChild` される（`addChild` の最後の呼び出しの引数が線）。`null` では線を足さない。可視性のターゲットの数が変わらない。
- [ ] `useRenderedMapScene.test.tsx`: `siblingReorderIndicator` を変えて `rerender` すると `renderMapScene` が再び呼ばれ、新しい値が渡る。同じ値のまま `rerender` しても呼ばれない。
- [ ] `MapStage.test.tsx`（`AutoLayoutMapStageHarness`）: 2つ目のルートを先頭のルートより上へドラッグしている途中、最後に作られた `Graphics` のモックの `fill` が `{ color: 0x2563eb }` で呼ばれ、`rect` の高さの引数が 6。`pointerup` の後の描画では、その色の `fill` を持つ `Graphics` が新しく作られない。
- [ ] RED: `npm test -- --runInBand renderSiblingReorderIndicator.test.ts renderMapNodes.test.ts renderMapScene.test.ts useRenderedMapScene.test.tsx MapStage.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-060（描画のオプションも必須にする）。
- 完了条件: ドラッグ中だけ線と半透明のノードが描かれ、中止・落下で消える。既存のテストは必須の値を足す以外の変更なしで通る。

### Task 11: ヘッダーのボタン・ショートカット・操作ヒントの配線

**Files**
- Modify: `client/src/components/map/MapEditor.tsx`、`client/src/components/map/__tests__/MapEditor.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`、`client/src/components/map/__tests__/MapStage.test.tsx`
- Modify: `client/src/components/layout/LayoutModeOperationHint.tsx`、`client/src/components/layout/__tests__/LayoutModeOperationHint.test.tsx`

**Interfaces**
- Consumes: Task 6 の `NodeSiblingOrderControl`。Task 7 の `useSiblingReorderShortcut`。Task 9 の `siblingReorder`（`MapEditor` の中の `useSiblingReorderAction` の戻り値）と `MapStage` の props `onReorderSibling`。既存の `MapStage` の `shortcutsEnabled`（`MapEditor` の `editorShortcutsEnabled`）、`hasActiveGesture`、`editing.editingNodeId`。
- Produces: 新しい公開 API は無い（`MapEditor`・`MapStage` の props は Task 9 から変えない）。

**実装の要点**
- `MapEditor.tsx`: `operationControls` の中で、`NodeDuplicateControl` の直後、`CLIPBOARD_OPERATION_HINT` の `<span>` の前に `<NodeSiblingOrderControl canMoveUp={siblingReorder.canMoveUp} canMoveDown={siblingReorder.canMoveDown} onMoveUp={…} onMoveDown={…} />`。`onMoveUp` / `onMoveDown` は `siblingReorder.moveSelected("up")` / `("down")` を呼ぶ関数（`useCallback` で作る）。
- `MapStage.tsx`: `useSiblingReorderShortcut({ selectedNodeId, isEditing: editing.editingNodeId !== null, hasActiveGesture, enabled: shortcutsEnabled, onReorderSibling })`。
- `LayoutModeOperationHint.tsx` の文言（設計書の「操作ヒント」）:
  - manual: `空白ダブルクリックで追加・ノードダブルクリックで編集・ノードドラッグで移動・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更`
  - auto: `空白ダブルクリックで追加・ノードダブルクリックで編集・追加・削除・接続時に自動整列・ノードドラッグで兄弟の順序を変更・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更`

- [ ] `MapEditor.test.tsx` にテストを足す（既存のテストと同じ描画のヘルパー）:
  - ボタンの並び: `getByRole("group", { name: "兄弟の順序" })` が「枝を複製」の後、クリップボードの案内（「枝をコピー: Ctrl/Cmd+C」で始まる文字）の前（`compareDocumentPosition`）。
  - 未選択で「枝を上へ移動」「枝を下へ移動」が両方 `disabled`。
  - 3つのルート（`createTestStorageSession({ initialJson })` に、手動配置でルート id 1・2・3（x 250、y 100・200・300）の V3 JSON を渡す）の先頭を選択すると「上へ」が無効・「下へ」が有効、末尾を選択すると逆（上と下の取り違えを検出する）。
  - 「下へ」を押すと操作通知バー（`getByTestId("operation-notices")`）に「枝を下へ移動しました（見えているルートの3件中2番目）。」。
- [ ] `MapStage.test.tsx` にテストを足す（`defaultProps` と `onReorderSibling: jest.fn()`）:
  - `selectedNodeId: 1` で `fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true })` → `onReorderSibling` が `(1, { kind: "step", direction: "up" })` で1回、戻り値 `false`。
  - `shortcutsEnabled: false`、ラベル編集中（ノードのダブルクリックで開いた入力欄に送る）、`Alt+Shift+ArrowUp` で呼ばれない。
- [ ] `LayoutModeOperationHint.test.tsx` の期待の文言を上の文言に直す（両モード。完全一致で比べる）。
- [ ] 影響の確認: `grep -rn 'name: /' client/src/app/__tests__ client/src/components/map/__tests__ client/src/components/layout/__tests__` を実行し、「枝」「移動」「上」「下」を含む正規表現の名前があれば、新しいボタンに一致しないか確かめ、一致するなら文字列の完全一致に直す。
- [ ] RED: `npm test -- --runInBand MapEditor.test.tsx MapStage.test.tsx LayoutModeOperationHint.test.tsx`。
- [ ] 実装し、GREEN と `npm test -- --runInBand page`、verify。
- 知見: L-058、L-060、L-061（ショートカットにも `editorShortcutsEnabled` を渡す）。
- 完了条件: ヘッダーのボタン・ショートカット・ドラッグのすべてが実際の `MapEditor` からつながり、既存のテストは文言の更新以外の変更なしで通る。

### Task 12: ページの結合テスト

**Files**
- Create: `client/src/app/__tests__/pageSiblingOrder.test.tsx`
- Create: `client/src/app/__tests__/pageSiblingOrderDrag.test.tsx`
- 読む: `docs/superpowers/specs/2026-10-23-phase14-sibling-reorder-design.md` の該当節（「受け入れ基準」「テスト方針」の「ページの結合テスト」「既存の操作との関係」「エラーと境界条件」）
- Modify（テストで見つかった不具合がある場合だけ）: Task 1〜11 で作成・変更したファイル

**Interfaces**
- Consumes: Task 11 までの `Home`（`@/app/page`）。既存の `seedMapLibrary`・`readActiveMapJson`（`client/src/testing/mapLibraryTestStorage.ts`）、`renderReady`・`mockStageBounds`・`mockNodePointerHandlers`・`mockStageHandlers`・`pointer`・`resetMapStageTestRuntime`（`client/src/components/map/testing/mapStageTestRuntime.tsx`）と、`pageDuplication.test.tsx` と同じ Pixi・イラスト生成・ダウンロード・画像化のモック。新しい公開 API は作らない。
- テストの前提: 初期のビューポートは `{ offsetX: 0, offsetY: 0, scale: 1 }` なので、ポインタの `globalX` / `globalY` がそのままワールド座標になる。ノードの選択は `pageDuplication.test.tsx` の `selectNode(index, nodeCount, x, y)`（直近の描画で登録されたノードの `pointerdown` と、同じ位置の `pointerup`）と同じヘルパーで行う。保存された JSON は `readActiveMapJson(window.localStorage)` を `waitFor` で待って読む（300ms の自動保存）。

- [ ] `pageSiblingOrder.test.tsx`（手動配置。`v3Json` は `pageDuplication.test.tsx` と同じヘルパー）:
  - 基本（ボタン）: ルート id 1（y 100）・id 2（y 200）・id 3（y 300）（x 250、幅 100、高さ 60）のマップで id 2 を選択し「枝を上へ移動」→ 保存された JSON の ID の並びが `[2, 1, 3]`、y が id 2 100・id 1 200・id 3 300、x が 250 のまま。操作通知バーに「枝を上へ移動しました（見えているルートの3件中1番目）。」。選択は id 2 のまま（「上へ」が無効・「下へ」が有効）。
  - Undo / Redo: 続けて「元に戻す」1回で `[1, 2, 3]` と元の y、通知が消える。「やり直す」で `[2, 1, 3]` と並べ替えた直後の y。
  - ショートカット: 同じマップで id 2 を選択し `fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true })` → ボタンと同じ結果。`ArrowDown` で `[1, 3, 2]`。
  - 止まる場面: ラベル編集中（id 2 のダブルクリックで開いた入力欄に `Alt+ArrowUp`）、検索入力欄（`getByRole("combobox", { name: "ノードを検索" })` に送る）、`Alt+Shift+ArrowUp` で、保存された JSON の並びが変わらない。
  - 端: id 1 を選択すると「枝を上へ移動」が `disabled`。`Alt+ArrowUp` で通知「これ以上上へ移動できません（見えているルートの先頭です）。」、並びは変わらない。
  - 隠れた兄弟: 親 R（id 1, 重要度 high, x 250, y 200）の子 A（id 2, high, x 400, y 100）・L（id 3, low, y 200）・C（id 4, high, y 300）。C を選択し「表示 高のみ」を押してから「枝を上へ移動」→ 並び `[1, 4, 2, 3]`、y が C 100・A 200・L 300（L は飛び越えた組として一緒に動く）、通知「枝を上へ移動しました（見えている兄弟の2件中1番目）。」。続けて `Alt+ArrowDown` → `[1, 2, 4, 3]`。もう一度 `Alt+ArrowDown` → 通知「これ以上下へ移動できません（見えている兄弟の末尾です）。隠れている兄弟と入れ替えるには、表示を『すべて』に切り替えてください。」、並びは変わらない。L が全件残る（L-460）。
  - ダイアログ（L-061）: 「箇条書きから追加」でダイアログを開く（フォーカスはダイアログの中に入る）。既存の `pageOutlineImportKeyboard.test.tsx` と同じく `(document.activeElement as HTMLElement).blur()` を呼び、`document.activeElement === document.body` を確かめてから `Alt+ArrowUp` を `document.body` に送っても並びが変わらない。
  - 自動保存: 並べ替えた後、保存された本体の `nodes` の順が並べ替えた順（上の各テストで確かめている）。JSON 書き出し（「JSON書き出し」のダウンロードのモック）の `nodes` の順も同じ。
  - 配線の変異で落ちること（L-060）: 先頭（上へ無効・下へ有効）と末尾（上へ有効・下へ無効）の両方で、2つのボタンの `disabled` を確かめるテストを入れる（`canMoveUp` と `canMoveDown` の取り違えで落ちる）。
- [ ] `pageSiblingOrderDrag.test.tsx`（自動配置。`layoutMode: "auto"` の V3 JSON で、R（id 1, x 250, y 170）の子 A（id 2, x 470, y 70）・B（id 3, x 470, y 170）・C（id 4, x 470, y 270）。この座標は `layoutNodeForest` の結果と一致する）:
  - ハンドラの選び方: 直近の描画で登録されたハンドラは配列の順（R, A, B, C）なので、A は `mockNodePointerHandlers.at(1 - 4)`、C は `at(3 - 4)`。並べ替えた後は配列の順が変わるので、保存された JSON の順から選び直す。
  - 並べ替え: A のノードの `pointerdown`（`pointer(520, 100)`）→ `mockStageHandlers.pointermove(pointer(520, 250))` → `pointerup(pointer(520, 250))` で、保存された JSON の子の並びが `[3, 2, 4]`、座標が B (470, 70)・A (470, 170)・C (470, 270)。通知「枝を下へ移動しました（見えている兄弟の3件中2番目）。」。「元に戻す」1回で `[2, 3, 4]`。
  - 末尾へ: 同じ形で `pointermove`・`pointerup` を y 350 にすると `[3, 4, 2]`。
  - 何も変わらない: 元の位置で離す（y 150）、`pointerupoutside`、ドラッグ中の `fireEvent.keyDown(window, { key: "Escape" })` の後の `pointerup` のどれでも、並びが `[2, 3, 4]` のまま。元の位置で離す前に、何かの操作を「元に戻す」して「やり直す」を有効にしておき、離した後も「やり直す」が有効のまま（履歴が増えない）。
  - 手動配置では移動: 同じマップを手動配置に切り替えて（`getByRole("group", { name: "レイアウトモード" })` の中の「手動配置」のボタン）同じドラッグをすると、A の y が変わり、並びは `[2, 3, 4]` のまま（既存の動作）。
  - Shift+ドラッグは接続のまま: 自動配置で `pointer(520, 100, { shiftKey: true })` から C の上で離すと、A の親が C になる。
- [ ] RED の確認: 新しいテストは Task 11 の実装で通る場合がある。その場合は、主要な配線を1つずつ一時的に壊して、対応するテストが失敗することを確かめてから元に戻す。壊す箇所: `MapEditor` が `MapStage` に `onReorderSibling` を渡さない（空の関数を渡す）、`layoutMode` に常に `"manual"` を渡す、ヘッダーへ `canMoveUp` と `canMoveDown` を取り違えて渡す、`MapStage` のショートカットに `enabled: true` を渡す（`shortcutsEnabled` にしない）、`operationNotices` の条件から並べ替えの通知を外す、`reorderSibling` で `applyTreeChange` を2回呼ぶ（1回の commit でなくなる）。結果を報告に書く。
- [ ] 失敗したテストがあれば最小の修正を入れ、`npm test -- --runInBand pageSiblingOrder.test.tsx pageSiblingOrderDrag.test.tsx` を GREEN にし、verify。
- 知見: L-057、L-060、L-061、L-460、L-472。
- 完了条件: 設計書の受け入れ基準 1〜9 が結合テストか前のタスクの単体テストで固定され、変異の確認の結果を報告に書く。

### Task 13: 文書の更新

**Files**
- Modify: `docs/specifications/features.md`、`docs/specifications/data-model.md`、`docs/architecture/overview.md`
- Modify: `README.md`、`client/README.md`、`docs/README.md`
- Modify: `docs/testing/browser-test-cases.md`
- 読む: `docs/superpowers/specs/2026-10-23-phase14-sibling-reorder-design.md` の該当節（「既存の文書の更新」「手動テスト」（Q-01〜Q-13 の表）「並べ替えの規則」「手動配置の縦位置の入れ替え」「自動配置で先頭のルートが変わるとき」「通知」「既存の操作との関係」「対象外」）

- [ ] 各文書を「7系統」「7 系統」「並び」「配列の順」「ドラッグ」「自動配置」「Phase 13」「Phase 14」で grep し、注記が要る箇所をすべて洗い出してから直す。
- [ ] `features.md`（設計書の「既存の文書の更新」のとおり）:
  - 目次と新しい「14. 兄弟ノードの順序変更」の章: 操作（ボタン・ショートカット・ドラッグ）、並べ替えの規則と隠れた兄弟（例 A1〜A9 の要点）、手動配置の縦位置の入れ替え（式と例1〜5）、自動配置と先頭のルート（例6）、履歴・選択・通知（文言の表）、キーボードとフォーカス、既存の操作との関係、対象外。
  - 1.1 に Phase 14 の行（「ツリー構造の編集（兄弟ノードの順序変更）」。ほかの4項目は未実装と書く）。1.2 のヘッダーの説明に「上へ」「下へ」。
  - 3.6 に、自動配置ではドラッグが並べ替えになることを1行で参照する。
  - 4.1 の自動配置の「手動ドラッグ移動は無効化され」を「ドラッグは位置の移動ではなく兄弟の順序の変更になる（14 章）」に直す。4.2 の「ルートと兄弟の順序」に、14 章で順序を変えられること、先頭のルートが変わるときの座標の引き継ぎを足す。
  - 8.1 の表に「兄弟の順序変更 | 配列の順と、手動配置での2つの組の平行移動、自動配置での再配置をまとめて1操作（ドラッグは落としたときの1回）」。8.2 の「元に戻した直後の状態」で消える通知に、兄弟の順序変更の通知を足す。
  - 10.4 に「並べ替え: 閉じた枝も並べ替えられ、手動配置では隠れた子孫も一緒に動く。折りたたみは保つ」。
  - 11.1 の表に `Alt`（`Option`）+ `↑` / `↓` と、ドラッグ中の `Escape` の行。ショートカットが止まる場面の NOTE に `Alt+↑/↓`。11.2 の表のノードのドラッグを「手動配置: 位置移動 ／ 自動配置: 兄弟の順序の変更（挿入位置に青い線 `#2563eb`）」に、11.3 の1本指ドラッグも同様に直す。
  - 11.4 の表に「兄弟の順序」のボタンの行。操作通知バーの「7系統」を「8系統」に直し、系統の列挙、見出し「7系統独立表示」、本文の「7 系統」、`kind` の表の主な用途（`status` に兄弟の順序変更の成功と端の通知、`error` に失敗）を更新する。「マップ全体置換時の同期リセット」の `documentRevision` 側の列挙に「兄弟の順序変更の通知の消去（10 番）」を足し、番号付きの一覧に10番を足す。「レイアウトモード別操作ヒント」の文言を Task 11 の文言に直す。
  - 13.8 の「操作通知バー（7系統目）」はそのまま（取り込みが7系統目であることは変わらない）。
- [ ] `data-model.md`: 2.1 の `Node` の説明に「兄弟とルートの順は `nodes` 配列の相対順。並べ替えは根ノード1つの配列内の位置を変え、子孫の位置は変えない。順序のフィールドは持たない」。新しい節「2.7 兄弟ノードの順序変更の型」に `SiblingReorderDirection`・`SiblingReorderTarget`・`SiblingReorderRequest`・`SiblingReorderResult`・`ReorderSiblingResult`（定義元はすべて `client/src/domain/nodes/nodeSiblingOrder.ts`）。保存形式（3章）は変えないことを確かめる。
- [ ] `overview.md`: レイヤーの説明に新しいファイル（ファイル構成の表の Create のもの）を足し、各ディレクトリのファイル数を `ls` で数えた実数に合わせる。3.6 の状態図に「自動配置: NodeDragPending → Reordering（4px 超）→ Idle（離す: 並べ替え ／ Escape・外で離す: 中止）」を足し、Shift による分岐の説明に配置モードによる分岐を足す。4.1 の「箇条書きからの追加の流れ」の後に「兄弟の順序変更の流れ」（ボタン・ショートカット・ドラッグ → `useSiblingReorderAction` → `useNodes.reorderSibling` の1回の commit、通知の8系統目）。
- [ ] `README.md`・`client/README.md`・`docs/README.md`: 機能の一覧、Phase の範囲（「Phase 0〜13」など）、編集履歴の対象、`domain/nodes/` の説明、操作通知バーの「7系統目」の記述があれば、兄弟の順序変更を足して直す。
- [ ] `browser-test-cases.md`: 冒頭の対象に Phase 14 を足す。新しい節「Phase 14: 兄弟ノードの順序変更」（記号 `Q`）を足し、設計書の「手動テスト」の表の Q-01〜Q-13 を、前提・手順・期待の形で書く。共通の決まり: `npm run build` の後に `npm run start -- -p 3114` の本番ビルド（普段と別のオリジン）で行い、保存データを消すときはキーを名前で1つずつ消し「Clear All」を使わない、各ケースは「新しいマップ」でケースの ID を名前にしたマップで行う、特に書かない限り表示は「すべて」、結果は実ブラウザで確かめたものだけを記録し Jest の結果を実機の確認として扱わない。結果の集計の表に Q 節の行を足す。
- [ ] 文書に書いた型名・関数名・文言・定数が実装と一致することを `grep` で確かめる（`reorderSiblingNodes`、`swapSiblingBranchPositions`、`useSiblingReorderAction`、成功・端・失敗の通知の文言、「8系統」）。`git diff --check` と verify。
- 知見: L-061（既存の操作との関係を文書にも表で残す）。
- 完了条件: 設計書の受け入れ基準 10 に挙がった文書が実装と一致する。`grep -n "7系統\|7 系統" docs/specifications/features.md` の結果が、13.8 の「7系統目」だけ。実ブラウザで確認していない項目を確認済みと書いていない。

### Task 14: ROADMAP の更新と最終検証

**Files**
- Modify: `ROADMAP.md`

- [ ] Phase 14 の見出しを「## Phase 14: ツリー構造の編集（進行中）」にし、「兄弟ノードの順序変更（候補001）」だけを `[x]` にする。ほかの4項目（階層の上げ下げ、途中への親ノード挿入、枝の切り取り・移動、ノードだけ削除）は `[ ]` のまま。
- [ ] 「現在地」:
  - Phase 14 の進行の要約を1項目足す（ヘッダーの「上へ」「下へ」と `Alt`/`Option`+`↑`/`↓` で、見えている兄弟（ルート同士を含む）の中で1つ上・1つ下へ移せる。隠れた兄弟は飛び越え、手動配置では縦位置も入れ替えて画面と並びを一致させ、自動配置ではドラッグで兄弟の間へ移せる。1回の並べ替えを1操作として Undo / Redo できる。Jest（jsdom）の自動テストと `npm run verify`（lint・typecheck・test・build）で確認済みで、実ブラウザでの確認（docs/testing/browser-test-cases.md の Q 節）は未確認であること）。
  - 「次に取り組む項目は、Phase 14「兄弟ノードの順序変更」（候補001）。」を「次に取り組む項目は、Phase 14「階層の上げ下げ」（候補002）。」に直す。
  - 「Phase 14〜39は未着手。…」を「Phase 14は進行中（兄弟ノードの順序変更が完了）。Phase 15〜39は未着手。追加候補100案を、優先順位と依存関係を踏まえた26フェーズへ整理済み。」に直す。
  - 文書体系の行の「Phase 0からPhase 13の箇条書きからのマップ作成まで」を「Phase 0からPhase 14の兄弟ノードの順序変更まで」に直す。
- [ ] Phase 14 の節以外の追加候補の節（「## Phase 14以降の計画（全100案・26フェーズ）」と Phase 15〜39 の各節）は変更しない。`git diff ROADMAP.md` で、その範囲に差分が無いことを確かめる。
- [ ] 「最終更新」を実装を完了した日付にする。
- [ ] `cd client && npm run verify` と `git diff --check` を実行し、テストのスイート数・テスト数と、lint・typecheck・build の成功を報告に書く。
- [ ] 全体の仕様・品質レビューを別のサブエージェントで行い、指摘を解消する（解消のたびに `cd client && npm run verify`）。
- [ ] ブランチと worktree を保持する。コミット・push・PR は明示の依頼が無ければ行わない。完了報告では、ブランチ名・worktree のパス・未決事項（実ブラウザの未確認のケースなど）を伝える。
- 完了条件: ROADMAP の「兄弟ノードの順序変更」だけが新たに完了になり、現在地・次の項目（Phase 14「階層の上げ下げ」（候補002））・最終更新が実態と一致する。ほかの節に差分が無い。全タスクの完了後の `npm run verify` が成功している。

---

## 設計書との対応

| 設計書の節 | タスク |
| :--- | :--- |
| 子孫の配列位置を動かさなくてよい根拠 | 2（配列全体の例、親子関係の検査） |
| 並べ替えの規則（用語・型・`findSiblingReorderTarget`・`getSiblingReorderAvailability`・`reorderSiblingNodes`・例 A1〜A9） | 2 |
| 手動配置の縦位置の入れ替え（外接範囲・式・例1〜5・折りたたみ） | 1, 2 |
| 自動配置で先頭のルートが変わるとき（例6） | 2 |
| useNodes の操作 | 4 |
| useSiblingReorderAction の入出力 | 5, 9, 11 |
| 履歴 | 4, 8, 12 |
| UI: ヘッダーのボタン | 6, 11 |
| UI: 操作ヒント | 11 |
| UI: ショートカット | 7, 11 |
| UI: ドラッグ（開始の条件と分岐、ジェスチャー、挿入位置、中止の条件、落としたときの処理、タッチ） | 8, 9, 12 |
| UI: ドラッグの見た目 | 10 |
| 通知 | 3, 5, 9 |
| 既存の操作との関係 | 9, 11, 12, 13 |
| エラーと境界条件 | 1, 2, 4, 7, 12 |
| 受け入れ基準 | 1 → 2・4・12、2 → 1・2・12、3 → 2・4・12、4 → 8・9・10・12、5 → 3・6・12、6 → 4・12、7 → 5・9・12、8 → 6・7・11・12、9 → 4・12、10 → 13・14 |
| 既存の文書の更新・手動テスト | 13, 14 |

## 知見の割り当て

| 知見 | タスク |
| :--- | :--- |
| L-001 | 1, 3, 4, 5 |
| L-035 | 2, 4, 8, 9 |
| L-037 | 4, 5, 9 |
| L-057 | 3, 5, 12 |
| L-058 | 6, 11 |
| L-060 | 9, 10, 11, 12 |
| L-061 | 7, 9, 11, 12, 13 |
| L-150 | 6 |
| L-408 | 6 |
| L-457 | 2 |
| L-460 | 2, 12 |
| L-472 | 2, 8, 9, 12 |
| L-474 | 7, 8 |
| L-522 | 7 |
| L-540 | 2 |
| L-541 | 1, 2 |
