# Phase 14: 階層の上げ下げ Implementation Plan

> **For agentic workers:** `superpowers:subagent-driven-development`でタスクを1つずつ実装し、別担当の仕様・品質レビュー後に次へ進む。インライン実装はユーザーの明示指示時のみ。各タスクのサブエージェントには、そのタスク本文、Global Constraints、依存する前タスクの Interfaces だけを渡す。

**Goal:** ROADMAP Phase 14 の「階層の上げ下げ（候補002）」を実装し、選択中のノードの枝を、見えている直前の兄弟の子にする操作（階層を下げる）と、親の兄弟（元の親の直後）にする操作（階層を上げる）を、ヘッダーの「階層を上げる」「階層を下げる」と `Alt`/`Option`+`←`/`→` から、1回の Undo / Redo で戻せる1操作として提供する。
**Architecture:** 上げ下げの規則は純関数（`domain/nodes/nodeIndent.ts`。兄弟の走査は並べ替えから移す `domain/nodes/nodeSiblingNeighbors.ts`）、手動配置の平行移動は `domain/nodes/nodeIndentPlacement.ts`、通知の文言は `domain/nodes/nodeIndentMessages.ts`。`useNodes.changeNodeIndent` が `applyTreeChange` を1回だけ呼び、`useNodeIndentAction` がボタンの有効・無効、下げたときの新しい親の展開、通知の発行を持つ。通知は `MapEditor` が持つ「枝の構造の変更の通知」の枠（`useRevisionScopedNotice` 1つ）を並べ替えと共有する。ショートカットの共通条件は `components/map/treeEditShortcutGuard.ts`、上げ下げの判定は `components/map/nodeIndentShortcut.ts`、登録は `useNodeIndentShortcut`。ボタンのフォーカスの引き継ぎは `usePairedButtonFocusHandover` で並べ替えのボタンと共有する。
**Tech Stack:** TypeScript、React 19、Next.js 16、Pixi.js、Jest、Testing Library。追加依存なし。
**Spec:** `docs/superpowers/specs/2026-10-26-phase14-indent-outdent-design.md`

## Global Constraints

- 新規依存なし。`Node`、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式を変えない。順序のフィールドを足さず、兄弟とルートの順は `nodes` 配列の相対順で表す。上げ下げは T（選択中のノード）の `parentId` と、T の根ノード1つの配列内の位置だけを変える（下げて新しい親に子が無いときは位置も変えない）。子孫の `parentId` と配列位置は変えない。
- 境界: 上げ下げの規則は純関数（`domain/nodes/nodeIndent.ts`）、兄弟の走査は純関数（`domain/nodes/nodeSiblingNeighbors.ts`）、手動配置の座標は純関数（`domain/nodes/nodeIndentPlacement.ts`）、通知の文言は純関数（`domain/nodes/nodeIndentMessages.ts`）、ショートカットの判定は純関数（`components/map/nodeIndentShortcut.ts`、共通の条件は `components/map/treeEditShortcutGuard.ts`）、状態と1回の commit は React フック、表示と操作は部品。domain は hooks・components を import しない。
- 結果は判別共用体で返し、呼び出し元は成功したときだけ後続処理（新しい親の展開）を行う。共用体の分岐は `switch` で網羅し、`default` で新しいメンバーを既定の分岐へ流さない（網羅は `const unreachable: never = value;` で型検査する）。
- 対象は ID で指定し、配列の添字を層の間で受け渡さない。新しい親は `applyTreeChange` のコールバックの中で最新のノード配列から解決する。
- 上げ下げは、表示で絞り込んだ部分配列ではなく、正本の全 `nodes` に対して行う。隠れた兄弟・隠れた子孫を消したり、順序を変えたりしない。「直前の兄弟」は配列の相対順と表示集合 V（`visibleNodeIds`）で決め、画面の上下（`y`）では決めない。
- 配列の操作は1回の走査で新しい配列を作る。`splice` と添字の計算（`indexOf` で求めた位置への挿入など）を使わない。大きな配列に `Math.min(...arr)`・`Math.max(...arr)`・`push(...arr)` を使わない（最小値・最大値はループで求める）。
- 座標の計算は `checkedAdd` / `checkedSubtract`（`client/src/domain/nodes/nodeLayoutArithmetic.ts`。結果が有限でない・0 でない値を足しても結果が変わらない桁落ちで `null`）と `hasSufficientGap(start, end, requiredGap)`（同じファイル。実際の間隔が丸めの許容を除いて `requiredGap` 以上か）を使い、失敗なら `placement-failed` にする。途中まで動いた配列を返さない。目的の座標が今の座標と等しければ差を計算せず 0 にする。
- 定数は既存のものを使う: `CHILD_HORIZONTAL_GAP = 120`、`SIBLING_VERTICAL_GAP = 40`（`client/src/config/shapes.ts`）。新しい定数は `NODE_INDENT_NOTICE_LABEL_MAX_CODE_POINTS = 20`（`nodeIndentMessages.ts`）と `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE = "data-tree-edit-shortcut-button"`（`treeEditShortcutGuard.ts`）だけ。
- 新しい props・options・コールバックは必須にする（省略可能にして既定値を置かない）。下の層に必須の値を足すタスクでは、上の層の呼び出し元（テストの `defaultProps`・ハーネスを含む）も同じタスクで直し、各タスクの終わりで `npm run typecheck` が通る状態にする。実際の `Home` から `MapEditor`、ヘッダー、`MapStage` まで通す結合テストで配線を確かめる。
- 通知の文言は Task 7 の表のとおり（数値に桁区切りを付けない）。通知の枠は並べ替えと共有し、操作通知バーの系統は8のまま。
- 対象外（作らない）: Phase 14 の他の項目（途中への親ノード挿入、枝の切り取り・移動、ノードだけの削除）、ドラッグでの階層の変更、上げたときに後ろの兄弟を一緒に動かすこと、隠れた兄弟の子にすること、コンテキストメニューの項目、複数ノードの一括の上げ下げ、手動配置での重なりの回避と画面の上下の並べ直し、`Tab`・`Enter` の挙動の変更、入力欄の中の `Alt`+`←`/`→`（ブラウザに任せる）、ダイアログを開いている間（`enabled` が偽）の「戻る」「進む」の抑止（既知の制限）、`MapHistoryControls` のフォーカスの引き継ぎの共通化。
- 実装は `.worktrees/codex/phase14-indent-outdent` の `codex/phase14-indent-outdent` ブランチで行う。タスク単位のサブエージェント実装、別担当の仕様・品質レビュー、TDD（先にテストを書いて RED を確かめる）、各タスクの最後に `cd client && npm run verify` を必須とする。途中のタスクでも verify が通る状態で終える。
- コミット・push・PR 作成は依頼時のみ。依頼された場合のメッセージは Conventional Commits（例: `refactor(nodes): ...`、`feat(nodes): ...`、`feat(map): ...`、`test(map): ...`、`docs(nodes): ...`）にする。最後のタスクで `ROADMAP.md` を実態に合わせて更新する。
- 反映する知見（サブエージェントは知見ファイルを読まない前提。ここの1行が要約）:
  - **L-001**: 操作の成否を呼び出し元へ返し、呼び出し元は結果を見て、失敗・未実行のときに成功の後続処理（親の展開）を行わない。
  - **L-035**: 配列の添字など位置ベースの識別子は、表示から操作までの間にずれて別の対象を指す。ID で指し、操作の時点の最新の配列から解決する。
  - **L-037**: 通知などの結果を識別子だけで対象に結び付けない。`documentRevision`（世代）と組にし、Undo / Redo・マップの置き換えで古いものを捨てる（`useRevisionScopedNotice`）。
  - **L-057**: 条件付きで拒否した入力を黙って捨てない。理由と、先へ進む方法（表示を「すべて」に切り替える）を通知する。
  - **L-058**: 見た目だけ無効なボタンは実際には押せてしまう。`disabled` 属性で無効にし、無効のときクリックしてもコールバックが呼ばれないことをテストする。
  - **L-060**: 省略可能な props と既定値のせいで、組み立て役の配線漏れをどのテストも検出しない。新しい props は必須にし、実際の `Home` から通す結合テストと配線の変異（渡さない・取り違える）で確かめる。
  - **L-061**: 新しい操作を導入したら、既存の停止条件（ダイアログを開いている間の根の `inert`、`editorShortcutsEnabled`、ラベル編集中など）の対象に、ボタン・ショートカットのすべての入口を入れ、既存の操作との関係を表で確かめる。
  - **L-150**: クリックで画面を切り替えない UI では、ダブルクリックの続きのクリックは同じボタンに届き2回の操作になる。`event.detail` で弾かず、端で無効になったボタンへの続きのクリックは何もしない。
  - **L-246**: フォーカスを移す予約（直前にフォーカスしていたボタンの記録）は、移せる先が無い分岐でも捨てる。残すと後でボタンが有効になったときにフォーカスを奪う。
  - **L-408**: Enter の押し続け（`event.repeat`）で操作が連続したり、フォーカスを移した先のボタンで逆の操作が起きたりする。組の両方のボタンで `event.key === "Enter" && event.repeat` の `keydown` を `preventDefault` する。
  - **L-457**: フラット配列で親子をブロックとして動かすと、移動先の子孫を取り込んでしまう。親子は `parentId` で表すので、ブロックとして動かさず根ノード1つだけを動かす。
  - **L-460**: 表示で絞り込んだ部分配列で操作して保存すると、画面外の要素が消える。正本の全配列に対して行い、隠れた兄弟が全件残り順が変わらないことをテストで固定する。
  - **L-472**: 表示順と配列順が一致しない場面で、配列の隣接に依存した操作は壊れる。「直前の兄弟」は配列の相対順と表示集合で決め、手動配置では画面の上下と一致しないことがあると文書に明記する。
  - **L-474**: 日本語 IME の変換中のキー（`isComposing`、`keyCode === 229`）を無視する（ショートカットと「戻る」「進む」の抑止の両方）。
  - **L-522**: グローバルなショートカットは、ボタン・リンク・入力欄・`select`・`contenteditable` などの対話要素にフォーカスがあるときは働かせない（`isInteractiveTarget`）。ショートカットを案内するボタン自身だけを目印の属性で対象に戻す（目印付きの要素の中の別のボタンは止める）。
  - **L-524**: 有限な座標同士の演算でも、溢れ・桁落ち・丸めによる間隔不足が起きる。`checkedAdd` / `checkedSubtract` と `hasSufficientGap` で検査し、目的の座標が今と等しければ差を計算しない（丸めで 0 にならない差が桁落ちと判定されるのを防ぐ）。根は式の値をそのまま入れる。
  - **L-540**: 順序のフィールドを足さず、配列の相対順を正本にする。配列全体を再採番しない。
  - **L-541**: `splice` と添字の計算で並べ替えると、範囲外の添字や向きの食い違いで壊れる。1回の走査で新しい配列を作り、「直後」「直前」を取り違える変異で落ちるテストにする。
  - **L-612**: 表示や有効・無効を、使う値の一部の変化だけで判定すると古い結果が残る。ボタンの有効・無効は `nodes`・選択・表示集合のすべてを依存にして求める。
  - **L-613**: 手動テストの期待を見た目（スクリーンショットとの比較・フォーカスの枠）で書くと、通知の行によるずれなどで正しい挙動を不合格にする。位置は相対的な関係、フォーカスは `document.activeElement.getAttribute("aria-label")` で確かめる。
  - **L-614**: しきい値の境界を「超える」「以上」などの言い換えで食い違わせない。ラベルの切り詰めは「21コードポイント以上なら先頭20コードポイントに『…』、20ちょうどは付けない」と境界の値で書いてテストする。

## Review Focus

- リファクタリングの4タスク（Task 1〜4）が挙動を変えていない: 既存のテストが、定数名の置き換え（Task 2）と通知の受け渡しの変更（Task 4）以外の変更なしで通る。
- 上げ下げの規則: 設計書の例 I1〜I8・O1〜O5 が1例1テストで `changeNodeIndent` のテストにあり、子孫と他のノードのオブジェクトが同一（`toBe`）で、隠れた兄弟が全件残る。「直後」「直前」の取り違えの変異で落ちる（Task 6。L-460、L-541）。
- 手動配置の式: 例 M1〜M8 と `calculateChildPlacement` との一致（乱数 1,000 通り）、目的の座標が今と等しいときに差を計算しない（Task 5。L-524）。
- 1回の commit と失敗時の不変: 成功は1回の Undo で戻り、失敗ではノード・選択・履歴・Redo が変わらない。新しい親は `applyTreeChange` の中の最新の配列で解決する（Task 8。L-001、L-035）。
- 下げたときの展開は成功したときだけ（Task 9・14。L-001）。
- 入口の停止と「戻る」「進む」の抑止（Task 11・12・14。L-061、L-474、L-522）。
- 配線: `onChangeNodeIndent`・ボタンの props・`publishNotice`・`expandNodes` が必須で、取り違えを結合テストが検出する（Task 12・13・14。L-060）。

## ファイル構成

| ファイル | 責務 | 作成・変更タスク |
| :--- | :--- | :--- |
| `client/src/domain/nodes/nodeSiblingNeighbors.ts` | `scanSiblingNeighbors` と型 `SiblingNeighbors`・`SiblingNeighborsScan`（`nodeSiblingOrder.ts` から移す） | 1 |
| `client/src/domain/nodes/nodeSiblingOrder.ts` | `scanSiblingNeighbors` を import に変える | 1 |
| `client/src/components/map/treeEditShortcutGuard.ts` | 目印の属性、入力の型、共通の条件 | 2 |
| `client/src/components/map/siblingReorderShortcut.ts` | 共通の条件を使う形にする | 2 |
| `client/src/components/layout/NodeSiblingOrderControl.tsx` | 目印の属性の置き換え（Task 2）、フォーカスの引き継ぎをフックへ（Task 3） | 2, 3 |
| `client/src/components/layout/usePairedButtonFocusHandover.ts` | 2つのボタンのフォーカスの引き継ぎ | 3 |
| `client/src/hooks/useSiblingReorderAction.ts` | 通知を持たず `publishNotice` を受け取る | 4 |
| `client/src/components/map/MapEditor.tsx` | 枝の構造の変更の通知の枠（Task 4）、`useNodeIndentAction` と `MapStage` への配線（Task 12）、ヘッダーのボタン（Task 13） | 4, 12, 13 |
| `client/src/domain/nodes/nodeIndentPlacement.ts` | `calculateIndentTranslation`・`calculateOutdentTranslation`・`translateBranch` | 5 |
| `client/src/domain/nodes/nodeIndent.ts` | 型、`getNodeIndentAvailability`、`changeNodeIndent` | 6 |
| `client/src/domain/nodes/nodeIndentMessages.ts` | `formatNodeIndentNotice` | 7 |
| `client/src/hooks/useNodes.ts` | `changeNodeIndent`（1回の commit） | 8 |
| `client/src/hooks/useNodeIndentAction.ts` | ボタンの状態、上げ下げの要求、親の展開、通知の発行 | 9 |
| `client/src/components/layout/NodeIndentControl.tsx` | ヘッダーの「階層を上げる」「階層を下げる」 | 10 |
| `client/src/components/map/nodeIndentShortcut.ts` | `resolveNodeIndentShortcut`・`shouldSuppressAltArrowNavigation` | 11 |
| `client/src/components/map/useNodeIndentShortcut.ts` | `window` の `keydown` の登録 | 11 |
| `client/src/components/map/MapStage.tsx` | 必須の props `onChangeNodeIndent` とショートカット | 12 |
| `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx` | 新しい必須の props を渡す | 12 |
| `client/src/components/layout/LayoutModeOperationHint.tsx` | 操作ヒントの文言 | 13 |
| `client/src/app/__tests__/pageNodeIndent.test.tsx` | `Home` からの結合テスト | 14 |
| `docs/specifications/features.md`、`docs/specifications/data-model.md` | 仕様 | 15 |
| `docs/architecture/overview.md`、`README.md`、`client/README.md`、`docs/README.md`、`docs/testing/browser-test-cases.md` | 構成・案内・手動テスト | 16 |
| `ROADMAP.md` | Phase 14 の「階層の上げ下げ」の完了、現在地、最終更新 | 17 |

テストは各ソースと同じ階層の `__tests__/` に置く（例: `client/src/domain/nodes/__tests__/nodeIndent.test.ts`）。

## 既存のテストへの影響と対処するタスク

| 影響 | 内容 | 対処するタスク |
| :--- | :--- | :--- |
| `scanSiblingNeighbors` の移動 | `nodeSiblingOrder.test.ts` は変更なしで通ること | 1 |
| 目印の属性の名前 | `siblingReorderShortcut.test.ts` と `NodeSiblingOrderControl.test.tsx` の `SIBLING_REORDER_BUTTON_ATTRIBUTE` の import を `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE`（`@/components/map/treeEditShortcutGuard`）に置き換える。それ以外は変更なしで通ること | 2 |
| フォーカスの引き継ぎの移動 | `NodeSiblingOrderControl.test.tsx` は Task 2 の置き換え以外の変更なしで通ること | 3 |
| `useSiblingReorderAction` の通知 | `useSiblingReorderAction.test.tsx` の `documentRevision` と `result.current.notice` の確認を、渡した `publishNotice` の呼び出しの確認に置き換える。`pageSiblingOrder.test.tsx`・`pageSiblingOrderDrag.test.tsx`・`MapEditor.test.tsx` は変更なしで通ること | 4 |
| `MapStage` の必須の props | `MapStage.test.tsx`（`defaultProps` と、`defaultProps` を使わずに `<MapStage` を描く3か所）、`MapStageVisibility.test.tsx`・`MapStageContextMenu.test.tsx` の `defaultProps`、`MapStageHistory.test.tsx` の `<MapStage`、`AutoLayoutMapStageHarness.tsx` に `onChangeNodeIndent` を足す | 12 |
| ヘッダーの `getByRole` | 新しいボタン（名前「枝の階層を上げる」「枝の階層を下げる」）が、既存のテストの正規表現の名前に一致しないこと | 13 |
| 操作ヒント | `LayoutModeOperationHint.test.tsx` の期待の文言を新しい文言に直す | 13 |
| 文書の目印の属性名・8系統目の名前 | `features.md` の 11.4・14.1・14.6・14.7 など | 15, 16 |

## 進め方

開始前に `git status` と worktree を確認し、既存のユーザー変更を reset しない。各タスクは「テスト追加 → 対象テストの RED を確認 → 実装 → 対象テストの GREEN → `cd client && npm run verify`」の順で進め、別のサブエージェントで仕様・品質を確認する。リファクタリングのタスク（Task 1〜4）は、新しいテスト（移した関数の直接のテスト）を先に書いて RED（モジュールが無い）を確かめ、移した後に既存のテストが通ることを確かめる。テストのコマンドは `client` ディレクトリで実行する（`npm test -- --runInBand <ファイル名>`）。ファイルのパスはリポジトリ相対。テストの期待値は実装の定数を import せずリテラルで書く（例: `40`、`"枝の階層を変更できませんでした。"`。ただし目印の属性はテストでも定数を import する）。テストを書いた後、主要な分岐を1つずつ外す変異（条件の反転、`<=` と `<` の置き換え、「直後」と「直前」の入れ替え、呼び出しの削除）を当てて失敗することを確かめ、結果をタスクの報告に書く。

テストで使うノードは `createTestNode`（`client/src/testing/createTestNode.ts`。既定は `{ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "", importance: "medium" }`）で作る。

例で使う ID とラベル（Task 5・6・8 で共通）: R = 1（ラベル「R」）、A = 2（「A」）、B = 3（「B」）、T = 4（「T」）、A1 = 5（「A1」）、Tc = 6（「Tc」）、H = 7（「H」、隠れた兄弟）、R2 = 8（「R2」）、A3 = 9（「A3」）、X = 10（「X」）。

---

### Task 1: `scanSiblingNeighbors` の移動（リファクタリング）

**Files**
- Create: `client/src/domain/nodes/nodeSiblingNeighbors.ts`
- Create: `client/src/domain/nodes/__tests__/nodeSiblingNeighbors.test.ts`
- Modify: `client/src/domain/nodes/nodeSiblingOrder.ts`（`SiblingNeighbors`・`SiblingNeighborsScan`・`SiblingsBefore`・`scanSiblingNeighbors` を削除し、`nodeSiblingNeighbors.ts` から import する）

**Interfaces**
- Consumes: 既存の `Node`（`@/types/node`）。
- Produces:
  ```ts
  // T の前後で、T に最も近い見えている兄弟と、その向きに隠れた兄弟があるか
  export type SiblingNeighbors = {
    node: Node;
    previousVisibleId: number | null;
    hiddenBefore: boolean;
    nextVisibleId: number | null;
    hiddenAfter: boolean;
  };
  export type SiblingNeighborsScan =
    | { kind: "found"; neighbors: SiblingNeighbors }
    | { kind: "node-missing" }
    | { kind: "node-hidden" };
  // nodes を1回だけ走査する。兄弟 = T と同じ parentId を持つノード（ルートなら parentId === null 同士）
  export function scanSiblingNeighbors(
    nodes: readonly Node[], nodeId: number, visibleNodeIds: ReadonlySet<number>,
  ): SiblingNeighborsScan;
  ```

**実装の要点**
- `nodeSiblingOrder.ts` の今の `scanSiblingNeighbors` の本体（親ごとの `Map<number | null, SiblingsBefore>` に「最後に見えた兄弟の ID」と「隠れた兄弟があったか」を控え、T に出会った後は T の親の兄弟だけを見て、最初の見えている兄弟で `break`）と、コメントをそのまま移す。中身と戻り値を変えない。`SiblingsBefore` は非公開のまま移す。
- `nodeSiblingOrder.ts` は `import { scanSiblingNeighbors, type SiblingNeighbors } from "@/domain/nodes/nodeSiblingNeighbors";` に変える。ほかの行は変えない。

- [ ] `nodeSiblingNeighbors.test.ts` を書く（親 R（id 1）の子を並べるヘルパーを用意する）:
  - `[A(2), B(3), T(4), C(5)]`、全件見えている、`nodeId: 4` → `{ kind: "found", neighbors: { node: <T と同じオブジェクト>, previousVisibleId: 3, hiddenBefore: false, nextVisibleId: 5, hiddenAfter: false } }`（`node` は `toBe` で確かめる）。
  - `[A(2), H(7・隠), T(4), H2(11・隠), C(5)]` → `previousVisibleId: 2, hiddenBefore: true, nextVisibleId: 5, hiddenAfter: true`。
  - 先頭の兄弟 `[T(4), A(2)]` → `previousVisibleId: null, hiddenBefore: false`。前に隠れた兄弟だけ `[H(7・隠), T(4)]` → `previousVisibleId: null, hiddenBefore: true`。
  - 別の親の子（id 10, parentId 99）が T の前に混ざっていても数えない: `[X(10, 親 99), T(4)]` → `previousVisibleId: null, hiddenBefore: false`。
  - ルート同士: `[R(1), R2(8)]`、`nodeId: 8` → `previousVisibleId: 1`。
  - T が無い → `{ kind: "node-missing" }`、T が隠れている → `{ kind: "node-hidden" }`。
- [ ] RED: `npm test -- --runInBand nodeSiblingNeighbors.test.ts`（モジュールが無いため失敗）。
- [ ] 移す。GREEN: `npm test -- --runInBand nodeSiblingNeighbors.test.ts nodeSiblingOrder.test.ts`。`nodeSiblingOrder.test.ts` は変更しない。続けて `cd client && npm run verify`。
- 知見: L-460、L-472。
- 完了条件: 新しいテストと既存の `nodeSiblingOrder.test.ts` が通る。`nodeSiblingOrder.ts` に走査の本体が残っていない（`grep -n "beforeByParent" client/src/domain/nodes/nodeSiblingOrder.ts` が空）。

### Task 2: ショートカットの共通条件とボタンの目印の統一（リファクタリング）

**Files**
- Create: `client/src/components/map/treeEditShortcutGuard.ts`
- Create: `client/src/components/map/__tests__/treeEditShortcutGuard.test.ts`
- Modify: `client/src/components/map/siblingReorderShortcut.ts`
- Modify: `client/src/components/map/__tests__/siblingReorderShortcut.test.ts`（定数の import の置き換えだけ）
- Modify: `client/src/components/layout/NodeSiblingOrderControl.tsx`（目印の属性の置き換えだけ）
- Modify: `client/src/components/layout/__tests__/NodeSiblingOrderControl.test.tsx`（定数の import の置き換えだけ）

**Interfaces**
- Consumes: 既存の `isInteractiveTarget`（`@/components/map/interactiveTarget`。`button, input, textarea, select, a[href], [contenteditable]` の内側か）。
- Produces:
  ```ts
  // treeEditShortcutGuard.ts
  // 兄弟の順序と階層のボタンに付ける目印。フォーカスがあっても Alt+↑/↓/←/→ を止めない
  export const TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE = "data-tree-edit-shortcut-button";
  export type TreeEditShortcutInput = {
    key: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    isComposing: boolean;
    keyCode: number;
    defaultPrevented: boolean;
    target: EventTarget | null;
    isEditing: boolean;
    selectedNodeId: number | null;
    hasActiveGesture: boolean;
  };
  // 条件 1〜4（既定動作が止められていない・IME でない・Alt だけ・ラベル編集中でない）。「戻る」「進む」の抑止と共有する
  export type TreeEditKeyGuardInput = Pick<
    TreeEditShortcutInput,
    "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing" | "keyCode" | "defaultPrevented" | "isEditing"
  >;
  export function passesTreeEditKeyGuard(input: TreeEditKeyGuardInput): boolean;
  // 条件 1〜7（キー以外のすべて）
  export function passesTreeEditShortcutGuard(input: TreeEditShortcutInput): boolean;

  // siblingReorderShortcut.ts（SIBLING_REORDER_BUTTON_ATTRIBUTE と isSiblingReorderButtonTarget は削除する）
  export type SiblingReorderShortcutInput = TreeEditShortcutInput;
  export function resolveSiblingReorderShortcut(input: SiblingReorderShortcutInput): SiblingReorderDirection | null;
  ```

**実装の要点**
- `passesTreeEditKeyGuard`: 次をすべて満たすとき `true`。1. `!defaultPrevented`。2. `!isComposing && keyCode !== 229`（定数 `IME_PROCESSING_KEY_CODE = 229` をこのファイルへ移す）。3. `altKey && !ctrlKey && !metaKey && !shiftKey`（AltGr は対象外）。4. `!isEditing`。
- `passesTreeEditShortcutGuard`: `passesTreeEditKeyGuard(input)` に加えて、5. `isInteractiveTarget(target)` が偽、または `target` から最も近い `button` が目印を持つ（`target instanceof HTMLElement && target.closest("button")?.hasAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE) === true`。目印付きの要素の中にある別のボタンは止める）。6. `selectedNodeId !== null`。7. `!hasActiveGesture`。今の `resolveSiblingReorderShortcut` の条件をそのまま移す（挙動を変えない）。
- `resolveSiblingReorderShortcut`: `if (!passesTreeEditShortcutGuard(input)) return null;` の後、`"ArrowUp"` → `"up"`、`"ArrowDown"` → `"down"`、それ以外 `null`。
- `NodeSiblingOrderControl.tsx`: `SIBLING_REORDER_BUTTON_ATTRIBUTE` の import を `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE`（`@/components/map/treeEditShortcutGuard`）に置き換え、`shortcutTargetProps` のキーを変える。コメントの「Alt+↑/↓」を「Alt+↑/↓/←/→」に直す。ほかは変えない（フォーカスの引き継ぎは Task 3）。

- [ ] `treeEditShortcutGuard.test.ts` を書く。基準の入力（`key: "ArrowUp", altKey: true`、他の修飾キー偽、`isComposing: false, keyCode: 38, defaultPrevented: false, target: document.body, isEditing: false, selectedNodeId: 1, hasActiveGesture: false`）で `passesTreeEditShortcutGuard` が `true`。
  - `it.each` で1つだけ条件を外した入力を並べ、それぞれ `false`: `defaultPrevented: true`、`isComposing: true`、`keyCode: 229`、`altKey: false`、`ctrlKey: true`、`metaKey: true`、`shiftKey: true`、`isEditing: true`、`target` が目印の無い `button`・`input`・`textarea`・`select`・`a[href]`・`[contenteditable]` の内側の `span`、`selectedNodeId: null`、`hasActiveGesture: true`。
  - 目印付きの `button`（`setAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE, "")`）とその内側の `span` で `true`。目印付きの `div` の中の目印の無い `button` で `false`。
  - キーは見ない: `key: "ArrowLeft"`・`"x"` でも `true`。
  - `passesTreeEditKeyGuard`: 基準で `true`。`defaultPrevented`・`isComposing`・`keyCode: 229`・`altKey: false`・`ctrlKey`・`metaKey`・`shiftKey`・`isEditing` をそれぞれ1つ外すと `false`。
- [ ] `siblingReorderShortcut.test.ts` と `NodeSiblingOrderControl.test.tsx` の `SIBLING_REORDER_BUTTON_ATTRIBUTE` を `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE` に置き換える（import 元を `@/components/map/treeEditShortcutGuard` にする）。テストの本体は変えない。
- [ ] RED: `npm test -- --runInBand treeEditShortcutGuard.test.ts siblingReorderShortcut.test.ts NodeSiblingOrderControl.test.tsx`（新しいモジュールが無いため失敗）。
- [ ] 実装する。GREEN: 同じコマンドと `npm test -- --runInBand useSiblingReorderShortcut.test.tsx MapStage.test.tsx pageSiblingOrder.test.tsx`。`grep -rn "SIBLING_REORDER_BUTTON_ATTRIBUTE\|data-sibling-reorder-button" client/src` が空。続けて verify。
- 知見: L-474、L-522。
- 完了条件: 既存のテストが定数名の置き換えだけで通る。

### Task 3: フォーカスの引き継ぎの共通化（リファクタリング）

**Files**
- Create: `client/src/components/layout/usePairedButtonFocusHandover.ts`
- Create: `client/src/components/layout/__tests__/usePairedButtonFocusHandover.test.tsx`
- Modify: `client/src/components/layout/NodeSiblingOrderControl.tsx`

**Interfaces**
- Consumes: Task 2 の `NodeSiblingOrderControl`（目印の属性を置き換えた版）。
- Produces:
  ```ts
  // 2つのボタンの片方が無効になったとき、フォーカスがそのボタンか body にあれば、もう一方が有効ならそちらへ移す
  export function usePairedButtonFocusHandover(
    firstEnabled: boolean,
    secondEnabled: boolean,
  ): {
    firstRef: RefObject<HTMLButtonElement | null>;
    secondRef: RefObject<HTMLButtonElement | null>;
    handleFocus: (event: FocusEvent<HTMLButtonElement>) => void;
    handleBlur: (event: FocusEvent<HTMLButtonElement>) => void;
  };
  ```

**実装の要点**
- `NodeSiblingOrderControl` の `upButtonRef`（→ `firstRef`）・`downButtonRef`（→ `secondRef`）・`focusedButtonRef`・`useLayoutEffect`・`handleFocus`・`handleBlur` と、そのコメントをそのまま移す。`useLayoutEffect` の依存は `[firstEnabled, secondEnabled]`。挙動:
  1. 記録したボタン（`focusedButtonRef.current`）が無効でなければ何もしない。
  2. `document.activeElement` が記録したボタンでも `document.body` でも `null` でもなければ何もしない。
  3. もう一方のボタンが無い・無効なら、記録を `null` にして終わる（L-246）。
  4. それ以外はもう一方へ `focus()`。
  - `handleFocus` は `event.currentTarget` を記録、`handleBlur` は `event.currentTarget.disabled` が偽のときだけ記録を消す。
- `NodeSiblingOrderControl` は `const { firstRef, secondRef, handleFocus, handleBlur } = usePairedButtonFocusHandover(canMoveUp, canMoveDown);` にし、「上へ」に `ref={firstRef}`、「下へ」に `ref={secondRef}` を付ける。`handleKeyDown`（Enter の押し続けの抑止）は部品に残す。

- [ ] `usePairedButtonFocusHandover.test.tsx` を書く。テストの中に小さな部品（`function Pair({ first, second }: { first: boolean; second: boolean })` が2つの `<button>`（名前「一」「二」）にフックの ref と `onFocus`・`onBlur` を付け、`disabled={!first}` / `disabled={!second}`）を置き、`render` と `rerender` で確かめる。テスト用の `<input aria-label="外">` も描く。
  - 「一」に `focus()` して `rerender` で `first: false, second: true` → `document.activeElement` が「二」。
  - 「二」に `focus()` して `second: false` → 「一」へ移る。
  - 「一」に `focus()` して `first: false, second: false` → 「二」へ移らない（`document.activeElement` が「二」でない）。続けて `rerender` で `second: true` にしても、「二」へ移らない（記録を捨てている。L-246）。
  - 「外」に `focus()` したまま `first: false` → `document.activeElement` が「外」のまま。
  - 「一」に `focus()` → 「外」に `focus()`（`blur` で記録が消える）→ `first: false` → 「外」のまま。
- [ ] RED: `npm test -- --runInBand usePairedButtonFocusHandover.test.tsx`。
- [ ] 実装し、`NodeSiblingOrderControl` をフックに置き換える。GREEN: `npm test -- --runInBand usePairedButtonFocusHandover.test.tsx NodeSiblingOrderControl.test.tsx`（`NodeSiblingOrderControl.test.tsx` は Task 2 から変えない）。verify。
- 知見: L-246、L-408。
- 完了条件: `NodeSiblingOrderControl.tsx` に `useLayoutEffect` と `focusedButtonRef` が残っていない。既存のテストが変更なしで通る。

### Task 4: 通知の枠の共有（リファクタリング）

**Files**
- Modify: `client/src/hooks/useSiblingReorderAction.ts`
- Modify: `client/src/hooks/__tests__/useSiblingReorderAction.test.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`

**Interfaces**
- Consumes: 既存の `useRevisionScopedNotice(documentRevision)`（`@/hooks/useRevisionScopedNotice`。`{ notice, publishNotice }` を返す。通知は次の `publishNotice` か `documentRevision` の変化まで残る）、`OperationNotice`（`@/types/operationNotice`、`{ kind: "status" | "warning" | "error"; message: string }`）。
- Produces:
  ```ts
  // useSiblingReorderAction.ts（documentRevision を publishNotice に置き換え、戻り値から notice を除く）
  export type UseSiblingReorderActionOptions = {
    selectedNodeId: number | null;
    nodes: readonly Node[];
    visibleNodeIds: ReadonlySet<number>;
    reorderSibling: (
      nodeId: number,
      request: SiblingReorderRequest,
      visibleNodeIds: ReadonlySet<number>,
    ) => ReorderSiblingResult;
    publishNotice: (notice: OperationNotice) => void; // 枝の構造の変更の通知の枠
  };
  export type UseSiblingReorderActionReturn = {
    canMoveUp: boolean;
    canMoveDown: boolean;
    moveSelected: (direction: SiblingReorderDirection) => void;
    reorder: (nodeId: number, request: SiblingReorderRequest) => void;
  };

  // MapEditor の中（Task 12 が使う）
  const {
    notice: treeEditNotice,
    publishNotice: publishTreeEditNotice,
  } = useRevisionScopedNotice(documentRevision);
  ```

**実装の要点**
- `useSiblingReorderAction`: `useRevisionScopedNotice` の import と呼び出しを消し、options の `publishNotice` を使う。`reorder` の `useCallback` の依存は `reorderSibling`・`visibleNodeIds`・`publishNotice` のまま。コメントを「結果ごとに通知を1回発行する。通知の枠は呼び出し元が持つ」に直す。
- `MapEditor.tsx`:
  - `useRevisionScopedNotice(documentRevision)` を1つ足し、`treeEditNotice` / `publishTreeEditNotice` を取り出す（クリップボードの通知の分割代入と同じ書き方）。コメント「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ）。8系統目」。
  - `useSiblingReorderAction({ selectedNodeId, nodes, visibleNodeIds: displayState.visibleNodeIds, reorderSibling, publishNotice: publishTreeEditNotice })`（`documentRevision` を渡さない）。
  - 操作通知バーの表示条件の `&& siblingReorder.notice === null` を `&& treeEditNotice === null` に置き換える。8番目の `{siblingReorder.notice !== null && (<MapOperationNotice notice={siblingReorder.notice} />)}` を `{treeEditNotice !== null && (<MapOperationNotice notice={treeEditNotice} />)}` に置き換える（条件だけ置き換え忘れると、上げ下げの通知だけのときにバーが出ない）。

- [ ] `useSiblingReorderAction.test.tsx` を直す（先に直して RED を確かめる）:
  - ヘルパーの `HookProps` から `documentRevision` を消し、`publishNotice?: jest.Mock<void, [OperationNotice]>` を足す。`renderAction` は省略時に `jest.fn()` を渡し、戻り値で使った mock を返す。
  - 通知の確認（成功・`at-edge`・`invalid-target`）を、`publishNotice` が1回だけ、期待の `{ kind, message }`（今の期待値と同じリテラル）で呼ばれることに置き換える。未選択の `moveSelected` では `publishNotice` が呼ばれないこと。
  - 「documentRevision が変わると通知を消す」と、`useNodeDuplicationAction` と組み合わせた「別の通知を消さない」のテストは削除する（このフックは通知を持たなくなる。`documentRevision` で消えることは `useRevisionScopedNotice` の既存のテストと `pageSiblingOrder.test.tsx` の「元に戻す」で通知が消えるテストが確かめる。報告にこの理由を書く）。
  - `canMoveUp` / `canMoveDown` と `reorderSibling` の引数のテストは変えない。
- [ ] RED: `npm test -- --runInBand useSiblingReorderAction.test.tsx`（`publishNotice` が呼ばれないため失敗）。
- [ ] 実装する。GREEN: `npm test -- --runInBand useSiblingReorderAction.test.tsx MapEditor.test.tsx pageSiblingOrder.test.tsx pageSiblingOrderDrag.test.tsx`（`MapEditor.test.tsx` と page のテストは変更しない）。verify。
- [ ] 変異: `MapEditor` の表示条件から `&& treeEditNotice === null` の行を消す（ほかの通知がすべて `null` のときにバーが `null` になる）と、`pageSiblingOrder.test.tsx` の通知の確認が落ちることを確かめて元に戻す。`useSiblingReorderAction` に `publishNotice` として空の関数を渡す変異でも落ちることを確かめる。
- 知見: L-037、L-060。
- 完了条件: `useSiblingReorderAction.ts` が `useRevisionScopedNotice` を import しない。`MapEditor.tsx` に `siblingReorder.notice` が残っていない（`grep -n "siblingReorder.notice" client/src/components/map/MapEditor.tsx` が空）。

### Task 5: 手動配置の平行移動（nodeIndentPlacement）

**Files**
- Create: `client/src/domain/nodes/nodeIndentPlacement.ts`
- Create: `client/src/domain/nodes/__tests__/nodeIndentPlacement.test.ts`
- 読む: 設計書の「手動配置の座標」節（式・丸め誤差への配慮・例 M1〜M8）

**Interfaces**
- Consumes: 既存の `checkedAdd`・`checkedSubtract`・`hasSufficientGap`（`@/domain/nodes/nodeLayoutArithmetic`）、`collectSubtreeIds(nodes, rootId): Set<number>`（`@/domain/nodes/nodeTree`。根は配列に無くても含める。循環しても停止する）、`CHILD_HORIZONTAL_GAP`・`SIBLING_VERTICAL_GAP`（`@/config/shapes`）、`Node`。テストだけで `calculateChildPlacement(nodes, parentId): { x; y } | null`（`@/domain/nodes/nodeManualPlacement`）。
- Produces:
  ```ts
  // 根 T を (rootX, rootY) へ、子孫を (dx, dy) だけ動かす
  export type BranchTranslation = { rootX: number; rootY: number; dx: number; dy: number };
  // nodes は上げ下げの前の配列（T はまだ newParentId の子ではない）
  export function calculateIndentTranslation(
    nodes: readonly Node[], nodeId: number, newParentId: number,
  ): BranchTranslation | null;
  // parentId は T の今の親
  export function calculateOutdentTranslation(
    nodes: readonly Node[], nodeId: number, parentId: number,
  ): BranchTranslation | null;
  export function translateBranch(
    nodes: readonly Node[], rootId: number, translation: BranchTranslation,
  ): Node[] | null;
  ```

**実装の要点**
- `calculateIndentTranslation`:
  1. P（`newParentId`）と T を1回の走査で探す。無ければ `null`。
  2. `right = checkedAdd(P.x, P.width)`、`rootX = right === null ? null : checkedAdd(right, CHILD_HORIZONTAL_GAP)`。どちらかが `null`、または `!hasSufficientGap(right, rootX, CHILD_HORIZONTAL_GAP)` なら `null`。
  3. P の子（`parentId === P.id`。隠れた子を含む。孫は含めない）の `checkedAdd(y, height)` の最大値 `bottom` をループで求める（1つでも `null` なら `null`）。子があれば `rootY = checkedAdd(bottom, SIBLING_VERTICAL_GAP)`、`null` か `!hasSufficientGap(bottom, rootY, SIBLING_VERTICAL_GAP)` なら `null`。子が無ければ `rootY = P.y`（`Number.isFinite` でなければ `null`）。
  4. `dx = rootX === T.x ? 0 : checkedSubtract(rootX, T.x)`、`dy = rootY === T.y ? 0 : checkedSubtract(rootY, T.y)`。`null` なら `null`。
- `calculateOutdentTranslation`:
  1. P（`parentId`）と T を探す。無ければ `null`。
  2. `subtree = collectSubtreeIds(nodes, T.id)`。`subtree.has(P.id)` なら `null`（循環）。`parentBranch = collectSubtreeIds(nodes, P.id)` から `subtree` の ID を除いたもの（P を含む。T の後ろの兄弟とその子孫も含む）。
  3. 1回の走査で、`parentBranch` のノードの `checkedAdd(y, height)` の最大値 `parentBottom`、`subtree` のノードの `y` の最小値 `branchTop` を求める。途中の `null`・非有限があれば `null`。
  4. `newTop = checkedAdd(parentBottom, SIBLING_VERTICAL_GAP)`。`null` か `!hasSufficientGap(parentBottom, newTop, SIBLING_VERTICAL_GAP)` なら `null`。
  5. `rootX = P.x`（非有限なら `null`）。`dx = rootX === T.x ? 0 : checkedSubtract(rootX, T.x)`。`dy = newTop === branchTop ? 0 : checkedSubtract(newTop, branchTop)`。`null` なら `null`。
  6. `rootY = dy === 0 ? T.y : checkedAdd(T.y, dy)`。`null` なら `null`。
- `translateBranch`:
  1. 根が配列に無ければ `null`。`ids = collectSubtreeIds(nodes, rootId)`。
  2. 根の座標が `(rootX, rootY)` と等しく `dx === 0 && dy === 0` なら、各ノードを同じオブジェクトのまま入れた新しい配列を返す。
  3. 1回の走査で新しい配列を作る。根は `{ ...node, x: rootX, y: rootY }`（式の値をそのまま入れる）。根以外の `ids` のノードは、`dx !== 0` なら `x = checkedAdd(x, dx)`、`dy !== 0` なら `y = checkedAdd(y, dy)`。`null` が1つでも出たら `null` を返す。座標が変わらないノードとほかのノードは同じオブジェクト。
- 最小値・最大値はループで求める（スプレッドを使わない）。

- [ ] `nodeIndentPlacement.test.ts` を書く（ノードはすべて幅 100・高さ 60。ID は「進め方」の表）:
  - `calculateIndentTranslation`:
    - M1（子あり）: R(1, null, 0, 0)、A(2, 1, 220, 0)、A1(5, 2, 440, 0)、T(4, 1, 220, 100)、Tc(6, 4, 440, 100)。`(nodes, 4, 2)` → `{ rootX: 440, rootY: 100, dx: 220, dy: 0 }`。
    - M2（子なし）: R(1, null, 0, 0)、A(2, 1, 220, 0)、T(4, 1, 220, 100)、Tc(6, 4, 440, 100)。`(nodes, 4, 2)` → `{ rootX: 440, rootY: 0, dx: 220, dy: -100 }`。
    - M3: M1 と同じ入力で、隠れているかどうかに関わらず A1 を「既存の子」に数える（この関数は表示集合を受け取らないので、M1 と同じ結果になることを確かめる1テスト）。
    - 孫を数えない: M1 に A1 の子（id 11, parentId 5, x 660, y 500）を足しても `rootY` が 100。
    - `calculateChildPlacement` との一致: 種を固定した線形合同法（`seed = (seed * 1103515245 + 12345) % 2147483648`）で 1,000 通りの入力を作る。P（id 1, x・y は 0〜999 の整数、幅 50〜200・高さ 30〜120）、P の子 0〜5 件（id 10〜、x・y・寸法は同じ範囲）、T（id 2, parentId null, x・y は同じ範囲）。各入力で `calculateIndentTranslation(nodes, 2, 1)` の `(rootX, rootY)` が `calculateChildPlacement(nodes, 1)` の `(x, y)` と等しい（`toEqual`）。
  - `calculateOutdentTranslation`:
    - M4: R(1, null, 0, 0)、A(2, 1, 220, 0)、B(3, 1, 220, 200)、A1(5, 2, 440, 0)、T(4, 2, 440, 100)、A3(9, 2, 440, 200)、Tc(6, 4, 660, 100)。`(nodes, 4, 2)` → `{ rootX: 220, rootY: 300, dx: -220, dy: 200 }`。
    - M5: R(1, null, 0, 0)、T(4, 1, 220, 0)、Tc(6, 4, 440, 0)。`(nodes, 4, 1)` → `{ rootX: 0, rootY: 100, dx: -220, dy: 100 }`。
    - M6（子が根より上）: R(1, null, 0, 0)、P = A(2, 1, 220, 0)、T(4, 2, 440, 100)、Tc1(6, 4, 660, 50)、Tc2(7, 4, 660, 150)。`(nodes, 4, 2)` → `{ rootX: 220, rootY: 150, dx: -220, dy: 50 }`（根で合わせて `rootY: 100` にする変異で落ちる）。
    - T の枝を数えない: M5 で Tc の y を 900 にしても `newTop` は R の下端 60 + 40 = 100、`branchTop` は 0 なので `dy: 100`（T の枝を `parentBottom` に入れる変異で `dy` が変わって落ちる）。
    - 後ろの兄弟の子孫を数える: M4 で A3 の子（id 12, parentId 9, x 660, y 400）を足すと `parentBottom` が 460、`newTop` が 500（460 + 40）、`branchTop` が 100 なので、結果は `{ rootX: 220, rootY: 500, dx: -220, dy: 400 }`。
    - 循環: P が T の子孫（R(1)、P(2, parentId 4)、T(4, parentId 2)）で `(nodes, 4, 2)` → `null`。
  - `translateBranch`:
    - M1 の結果を適用: T → (440, 100)、Tc → (660, 100)、R・A・A1 は入力と同じオブジェクト（`toBe`）。入力の配列と各ノードが変わらない（呼ぶ前の `structuredClone` と `toEqual`）。
    - 変化なし: R(1, null, 0, 0)、A(2, 1, 220, 0)、T(4, 1, 440, 0)、Tc(6, 4, 660, 0)。`calculateIndentTranslation(nodes, 4, 2)` が `{ rootX: 440, rootY: 0, dx: 0, dy: 0 }` で、`translateBranch` の結果の全要素が入力と同じオブジェクト。
    - 丸め（L-524）: A(2, 1, x 0.1, y 0, width 0.2)、T(4, 1, x `0.1 + 0.2 + 120`, y 0)、Tc(6, 4, x 1e17, y 0)、R(1, null, 0, 0)。`calculateIndentTranslation(nodes, 4, 2)` が `{ rootX: 0.1 + 0.2 + 120, rootY: 0, dx: 0, dy: 0 }`、`translateBranch` が `null` でなく、全要素が入力と同じオブジェクト（式で求めた位置にすでにあるノードで、遠く離れた子孫があっても `placement-failed` にならないことを固定する）。
  - 失敗:
    - M7: M1 で A1 の y を `1e17` → `calculateIndentTranslation` が `null`（`hasSufficientGap` を外す変異で落ちる）。
    - M8: M2 で A の x を `Number.MAX_VALUE` → `null`。M2 で Tc の x を `Number.MAX_VALUE` にして `calculateIndentTranslation` の結果（`dx: 220`）で `translateBranch` → `null`（途中まで動いた配列を返さない）。
    - `NaN`: P の y が `NaN`（子なし）→ `null`。T の x が `NaN` → `null`。上げるとき P の x が `NaN` → `null`。
    - P・T が無い → `null`（3つの関数のそれぞれ）。
  - 大きな入力: P の子 10,000 件で `calculateIndentTranslation` が例外を出さず値を返す。10,000 ノードの鎖の枝（T → 子 → 孫 …）で `calculateOutdentTranslation` と `translateBranch` が例外（`RangeError`）を出さない。時間は測らない。
- [ ] RED: `npm test -- --runInBand nodeIndentPlacement.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-524、L-541（ループで新しい配列）、L-001（途中まで動いた配列を返さない）。
- 完了条件: 全ケースが通る。`Math.min(...`・`Math.max(...`・`splice` を使っていない。

### Task 6: 上げ下げの規則（nodeIndent）

**Files**
- Create: `client/src/domain/nodes/nodeIndent.ts`
- Create: `client/src/domain/nodes/__tests__/nodeIndent.test.ts`
- 読む: 設計書の「上げ下げの規則」「子孫の配列位置を動かさなくてよい根拠」「自動配置と先頭のルート」節

**Interfaces**
- Consumes: Task 1 の `scanSiblingNeighbors`。Task 5 の `calculateIndentTranslation`・`calculateOutdentTranslation`・`translateBranch`。既存の `canConnectNodes(nodes, parentId, childId): boolean`（`@/domain/nodes/nodeTree`。`childId` が `parentId` の祖先、同じ ID、どちらかが無い、循環のとき `false`）、`Node`、`NodeLayoutMode`（`@/types/nodeLayout`、`"manual" | "auto"`）。テストだけで `buildNodeForestRelations`（`@/domain/nodes/nodeLayoutForestRelations`）と `layoutNodeForest`（`@/domain/nodes/nodeAutoLayout`）。
- Produces:
  ```ts
  export type NodeIndentDirection = "indent" | "outdent"; // indent = 階層を下げる、outdent = 階層を上げる
  export type NodeIndentAvailability = { indent: boolean; outdent: boolean };
  export type NodeIndentFailureReason =
    | "node-missing" | "node-hidden" | "invalid-structure" | "placement-failed";
  type NodeIndentSuccess = {
    ok: true;
    direction: NodeIndentDirection;
    newParentId: number | null;     // 上げてルートになったら null
    newParentLabel: string | null;  // 新しい親の label（生の値。空文字もそのまま）。ルートなら null
    depth: number;                  // 移した後の T の深さ。ルートが 1
  };
  type NodeIndentAtEdge =
    | { ok: false; reason: "at-edge"; direction: "indent"; hiddenBeyond: boolean; isRoot: boolean }
    | { ok: false; reason: "at-edge"; direction: "outdent" };
  export type NodeIndentResult =
    | (NodeIndentSuccess & { nodes: Node[] })
    | NodeIndentAtEdge
    | { ok: false; reason: NodeIndentFailureReason };
  // useNodes.changeNodeIndent の戻り値（hooks と messages の両方がここから import する）
  export type ChangeNodeIndentResult =
    | NodeIndentSuccess
    | NodeIndentAtEdge
    | { ok: false; reason: NodeIndentFailureReason };

  export function getNodeIndentAvailability(
    nodes: readonly Node[], nodeId: number | null, visibleNodeIds: ReadonlySet<number>,
  ): NodeIndentAvailability;
  export function changeNodeIndent(
    nodes: readonly Node[], nodeId: number, direction: NodeIndentDirection,
    visibleNodeIds: ReadonlySet<number>, mode: NodeLayoutMode,
  ): NodeIndentResult;
  ```

**実装の要点**
- `getNodeIndentAvailability`: `nodeId === null` → `{ indent: false, outdent: false }`。`scanSiblingNeighbors` を1回だけ呼ぶ。`node-missing`・`node-hidden` → 両方 `false`。`found` → `{ indent: previousVisibleId !== null, outdent: node.parentId !== null }`。座標の失敗や不正なデータは予測しない。
- `changeNodeIndent`（`direction` を `switch` で分ける）:
  - 下げる（`"indent"`）:
    1. `scanSiblingNeighbors` が `node-missing` / `node-hidden` → その理由。`previousVisibleId === null` → `{ ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: hiddenBefore, isRoot: T.parentId === null }`。P = `previousVisibleId` のノード。`!canConnectNodes(nodes, P.id, T.id)` → `invalid-structure`。
    2. 1回目の走査で、`parentId === P.id` のうち配列で最後のもの L を求める。2回目の走査で新しい配列を作る: `T' = { ...T, parentId: P.id }`。L があるとき、T は飛ばし、L を積んだ直後に T' を積む。L が無いとき、T の位置に T' を積む。それ以外は同じオブジェクト。
    3. `mode === "manual"`: `calculateIndentTranslation(nodes, T.id, P.id)`（元の配列で計算）→ `translateBranch(新しい配列, T.id, translation)`。どちらかが `null` → `placement-failed`。`"auto"`: 座標を変えない。
    4. `depth` = 新しい配列で T から `parentId` を辿った祖先の数 + 1（`Map` で ID → ノードを引き、`visited` の集合で循環を検出したら `invalid-structure`）。`newParentId = P.id`、`newParentLabel = P.label`。
  - 上げる（`"outdent"`）:
    1. T が無い → `node-missing`。`!visibleNodeIds.has(T.id)` → `node-hidden`。`T.parentId === null` → `{ ok: false, reason: "at-edge", direction: "outdent" }`。P（`T.parentId` のノード）が無い → `invalid-structure`。
    2. 1回の走査で新しい配列を作る: `T' = { ...T, parentId: P.parentId }`。T は飛ばし、P を積んだ直後に T' を積む。T が P より前にあっても同じ。それ以外は同じオブジェクト。
    3. `mode === "manual"`: `calculateOutdentTranslation(nodes, T.id, P.id)` → `translateBranch`。`null` → `placement-failed`。`"auto"`: 座標を変えない。
    4. `newParentId = P.parentId`、`newParentLabel` = 祖父母の `label`（P がルートなら `null`。祖父母が配列に無ければ `invalid-structure`）、`depth` は下げると同じ方法。
- 先頭のルートの座標の引き継ぎ（並べ替えの `applyAutoFirstRoot` に当たるもの）は書かない（上げ下げでは先頭のルートが変わらない）。

- [ ] `nodeIndent.test.ts` を書く（ID とラベルは「進め方」の表。座標を見ないテストは `mode: "auto"`。配列の検査は `result.nodes.map((n) => [n.id, n.parentId])`）:
  - `getNodeIndentAvailability`: `nodeId: null` → 両方 `false`。不在・隠れている → 両方 `false`。ルート R（`[R]`）→ `{ indent: false, outdent: false }`。2つ目のルート（`[R, R2]`、`nodeId: 8`）→ `{ indent: true, outdent: false }`。先頭の兄弟（`[R, T(R), A(R)]`、`nodeId: 4`）→ `{ indent: false, outdent: true }`。中間（`[R, A, T, B]` の T）→ 両方 `true`。一人っ子（`[R, T(R)]`）→ `{ indent: false, outdent: true }`。前に隠れた兄弟だけ（`[R, H(R・隠), T(R)]`）→ `{ indent: false, outdent: true }`。走査が1回: 配列を `Proxy` で包み、数値の添字の `get` の回数が `nodes.length` 以下。
  - `changeNodeIndent`（配列。1例1テスト）:
    - I1: `[R, A(R), B(R), T(R)]` で T を下げる → `[[1,null],[2,1],[3,1],[4,3]]`、`newParentId: 3`、`newParentLabel: "B"`、`depth: 3`。
    - I2: `[R, A(R), A1(A), T(R), Tc(T)]` → `[1, 2, 5, 4, 6]`、T の親 2。
    - I3: `[R, A(R), T(R), A1(A)]` → `[1, 2, 5, 4]`、T の親 2。「L の直前」に入れる変異（`[1, 2, 4, 5]`）と「T の元の位置」に残す変異（`[1, 2, 4, 5]`）で落ちる。
    - I4: `[R, A(R), H(R・隠), T(R)]` → `[1, 2, 7, 4]`、T の親 2、H の親 1 のまま。
    - I5: `[R, H(R・隠), T(R)]` → `{ ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: true, isRoot: false }`。
    - I6: `[R, T(R), A(R)]` → `at-edge`、`hiddenBeyond: false`、`isRoot: false`。
    - I7: `[R(null), R2(null)]` で R2 を下げる → `[[1,null],[8,1]]`、`newParentLabel: "R"`、`depth: 2`。先頭の兄弟のルート `[R, R2]` で R を下げる → `at-edge`、`isRoot: true`。
    - I8: `[R, A(R), R2(null)]` で R2 を下げる → `[1, 2, 8]`、R2 の親 1。
    - O1: `[R, A(R), A1(A), T(A), A3(A), B(R)]` で T を上げる → `[1, 2, 4, 5, 9, 3]`、T の親 1、`newParentLabel: "R"`、`depth: 2`。A1・A3 の親は 2 のまま。「P の直前」に入れる変異（`[1, 4, 2, …]`）と「兄弟の末尾」に入れる変異（`[…, 3, 4]`）で落ちる。
    - O2: `[R, A1(A), A(R), B(R)]` で A1 を上げる → `[1, 2, 5, 3]`、A1 の親 1。
    - O3: `[R, T(R), Tc(T), R2(null)]` で T を上げる → `[1, 4, 6, 8]`、T の親 `null`、`newParentId: null`、`newParentLabel: null`、`depth: 1`。
    - O4: `[R, A(R), T(A), H(R・隠), B(R)]` → `[1, 2, 4, 7, 3]`。
    - O5: `[R]` で R を上げる → `{ ok: false, reason: "at-edge", direction: "outdent" }`。
    - 同一性: I2 と O1 で、T 以外の全ノードが入力と同じオブジェクト（`toBe`）、Tc の配列位置と親が変わらない。入力の配列が変わらない。
    - 親子関係: I3 の結果を `buildNodeForestRelations(result.nodes)!.childrenByParent.get(2)` に通して ID の並びが `[5, 4]`（T が A の子の末尾）。O1 の結果で `childrenByParent.get(1)` が `[2, 4, 3]`（T が A の直後）、`get(2)` が `[5, 9]`。
    - 隠れた兄弟（L-460）: I4・O4 で H が1件だけ残り、親と相対順が変わらない。
    - 結果の値: 空ラベルの新しい親（I1 で B のラベルを `""`）→ `newParentLabel: ""`。
    - 失敗: T が無い → `node-missing`（両方向）。T が隠れている → `node-hidden`（両方向）。循環（`[X(10, parentId 4), A(2, parentId 10), T(4, parentId 10)]`、全件見えている、T を下げる。P = A は T の子孫）→ `invalid-structure`。親が配列に無い T（`[T(4, parentId 99)]`）を上げる → `invalid-structure`。
  - `changeNodeIndent`（手動配置。Task 5 の M の入力をそのまま使う）: M1（T を下げる）で T (440, 100)・Tc (660, 100)。M2 で T (440, 0)・Tc (660, 0)。M3（M1 で A1 を表示集合から外す）で M1 と同じ座標。M4（入力の順を `[R(1), A(2), B(3), A1(5), T(4), A3(9), Tc(6)]` にして T を上げる）で T (220, 300)・Tc (440, 300)、ID の並びが `[1, 2, 4, 3, 5, 9, 6]`（T を A の直後へ移す）。M5 で T (0, 100)・Tc (220, 100)、T の親 `null`。M6 で T (220, 150)・Tc1 (440, 100)・Tc2 (440, 200)。M7・M8 で `{ ok: false, reason: "placement-failed" }`。
  - `changeNodeIndent`（自動配置と先頭のルート）: I7・I8・O3・O2 の形（O2 は R の前に T がある `[A1(A), R, A(R)]` で A1 を上げる。先頭のルートは R）で、結果の最初の `parentId === null` のノードが入力の最初のルートと同じオブジェクト（`toBe`）。続けて `layoutNodeForest(result.nodes)` に通しても、最初のルートの `x` / `y` が入力と同じ。座標を変えない（全ノードの `x`・`y` が入力と同じ）。
- [ ] RED: `npm test -- --runInBand nodeIndent.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-035、L-457、L-460、L-472、L-540、L-541。
- 完了条件: 全ケースが通る。`splice`・`indexOf` による位置の計算を使っていない。

### Task 7: 通知の文言（nodeIndentMessages）

**Files**
- Create: `client/src/domain/nodes/nodeIndentMessages.ts`
- Create: `client/src/domain/nodes/__tests__/nodeIndentMessages.test.ts`

**Interfaces**
- Consumes: Task 6 の `ChangeNodeIndentResult`。既存の `getNodeDisplayLabel(label)`（`@/domain/nodes/nodeDisplayLabel`。空文字なら「新しいノード」）、`OperationNotice`。
- Produces:
  ```ts
  export const NODE_INDENT_NOTICE_LABEL_MAX_CODE_POINTS = 20;
  export function formatNodeIndentNotice(result: ChangeNodeIndentResult): OperationNotice;
  ```

**実装の要点**
- `{親}` = `getNodeDisplayLabel(newParentLabel)` をコードポイント（`Array.from`）で数え、21以上なら先頭20コードポイント + `…`、20以下ならそのまま。`{D}` = `depth`（桁区切りなし）。
- 表（`ok`・`reason`・`direction` は `switch` で網羅し `never` で型検査する）:

| 結果 | `kind` | 文言 |
| :--- | :--- | :--- |
| 成功（下げる） | `status` | `枝の階層を下げました（「{親}」の子、第{D}階層）。` |
| 成功（上げる・`newParentLabel !== null`） | `status` | `枝の階層を上げました（「{親}」の子、第{D}階層）。` |
| 成功（上げる・`newParentLabel === null`） | `status` | `枝の階層を上げました（ルート、第1階層）。` |
| `at-edge`（下げる） | `status` | `これ以上階層を下げられません（見えている直前の{兄弟}がありません）。` |
| `at-edge`（下げる）で `hiddenBeyond` | `status` | 上の文言の直後に `隠れている{兄弟}の子にするには、表示を『すべて』に切り替えてください。` |
| `at-edge`（上げる） | `status` | `これ以上階層を上げられません（ルートです）。` |
| `node-missing`・`node-hidden`・`invalid-structure`・`placement-failed` | `error` | `枝の階層を変更できませんでした。` |

  `{兄弟}` は `isRoot` なら `ルート`、そうでなければ `兄弟`。成功した下げの `newParentLabel` は実際には `null` にならないが、型の上では `null` があり得るので、そのときは空文字と同じく `「新しいノード」` にする（`getNodeDisplayLabel(newParentLabel ?? "")`。テストで固定する）。

- [ ] テストを書く（`it.each` でリテラルを並べる）:
  - 成功（下げる・`newParentLabel: "A"`・`depth: 3`）→ `{ kind: "status", message: "枝の階層を下げました（「A」の子、第3階層）。" }`。上げる・`"R"`・`2` → `"枝の階層を上げました（「R」の子、第2階層）。"`。上げる・`null`・`1` → `"枝の階層を上げました（ルート、第1階層）。"`。`depth: 10000` → `"第10000階層"`（桁区切りなし）。
  - ラベル: `""` → `「新しいノード」`。`"あ".repeat(20)` → そのまま。`"あ".repeat(21)` → `"あ".repeat(20) + "…"`。`"😀".repeat(20)` → そのまま、`"😀".repeat(21)` → `"😀".repeat(20) + "…"`（サロゲートペアを1コードポイントとして数える。`.length` で数える変異で落ちる）。下げる・`newParentLabel: null` → `「新しいノード」`。
  - 端: 下げる・`hiddenBeyond: false, isRoot: false` → `"これ以上階層を下げられません（見えている直前の兄弟がありません）。"`。`hiddenBeyond: true, isRoot: false` → `"これ以上階層を下げられません（見えている直前の兄弟がありません）。隠れている兄弟の子にするには、表示を『すべて』に切り替えてください。"`。`hiddenBeyond: true, isRoot: true` → `"これ以上階層を下げられません（見えている直前のルートがありません）。隠れているルートの子にするには、表示を『すべて』に切り替えてください。"`。上げる → `"これ以上階層を上げられません（ルートです）。"`。どれも `kind: "status"`。
  - 失敗の4つの理由 → それぞれ `{ kind: "error", message: "枝の階層を変更できませんでした。" }`。
- [ ] RED: `npm test -- --runInBand nodeIndentMessages.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-057、L-614。
- 完了条件: 表の全行とラベルの境界がテストにあり、通る。

### Task 8: useNodes.changeNodeIndent（1回の commit）

**Files**
- Modify: `client/src/hooks/useNodes.ts`
- Create: `client/src/hooks/__tests__/useNodesIndent.test.ts`

**Interfaces**
- Consumes: Task 6 の `changeNodeIndent`（domain）、`NodeIndentDirection`、`ChangeNodeIndentResult`。既存の `applyTreeChange`（`useNodeLayoutState` が返す。コールバック `(currentNodes, mode) => Node[] | null` を受け、`null` なら何も変えず `false`、自動配置なら候補を `layoutNodeForest` に通して失敗なら `false`、成功なら1回 commit して `true`）。
- Produces（`UseNodesReturn` に追加。型は `useNodes.ts` から再 export しない）:
  ```ts
  // 見えている直前の兄弟の子にする／親の兄弟にする。applyTreeChange を1回だけ呼び、選択と documentRevision は変えない。失敗時は何も変えない
  changeNodeIndent: (
    nodeId: number,
    direction: NodeIndentDirection,
    visibleNodeIds: ReadonlySet<number>,
  ) => ChangeNodeIndentResult;
  ```

**実装の要点**
- 既存の `reorderSibling` と同じ形。domain の関数は `import { changeNodeIndent as computeNodeIndent, type ChangeNodeIndentResult, type NodeIndentDirection } from "@/domain/nodes/nodeIndent";` で別名を付ける。
  ```ts
  const changeNodeIndent = useCallback((
    nodeId: number,
    direction: NodeIndentDirection,
    visibleNodeIds: ReadonlySet<number>,
  ): ChangeNodeIndentResult => {
    let outcome: ChangeNodeIndentResult | null = null;
    const applied = applyTreeChange((currentNodes, mode) => {
      const changed = computeNodeIndent(currentNodes, nodeId, direction, visibleNodeIds, mode);
      if (!changed.ok) {
        outcome = changed;
        return null;
      }
      const { nodes: changedNodes, ...summary } = changed;
      outcome = summary;
      return changedNodes;
    });
    // 候補を作れた後に失敗するのは、全体の自動配置だけ
    const settled = outcome as ChangeNodeIndentResult | null;
    if (applied && settled?.ok) return settled;
    if (settled === null || settled.ok) return { ok: false, reason: "placement-failed" };
    return settled;
  }, [applyTreeChange]);
  ```
- `setSelectedNodeId` と `setDocumentRevision` を呼ばない。親の展開はしない（Task 9）。戻り値のオブジェクトに `changeNodeIndent` を足す。

- [ ] `useNodesIndent.test.ts` を書く（`useNodesSiblingOrder.test.ts` と同じ構成: `renderHook(() => useNodes())` と `replaceMap`、`jest.mock("@/domain/nodes/nodeAutoLayout", …)` で `layoutNodeForest` を `jest.fn(actual.layoutNodeForest)` に包む。ノードは幅 100・高さ 60、ラベルは「進め方」の表）:
  - 手動配置の下げる: R(1, null, 0, 0)、A(2, 1, 220, 0)、T(4, 1, 220, 100)、Tc(6, 4, 440, 100)。`changeNodeIndent(4, "indent", 全件)` → `{ ok: true, direction: "indent", newParentId: 2, newParentLabel: "A", depth: 3 }`、T の親 2、T (440, 0)、Tc (660, 0)。
  - 手動配置の上げる: 続けて `changeNodeIndent(4, "outdent", 全件)` → `{ ok: true, direction: "outdent", newParentId: 1, newParentLabel: "R", depth: 2 }`、T の親 1、T の x 220、T の枝の上端が A の下端 60 + 40 = 100。
  - 自動配置: R の子 A・T を `layoutNodeForest` で並べたマップで T を下げる → T の親 2、結果の座標が `layoutNodeForest` の結果と一致し、R の座標が変わらない。
  - 自動配置で上げる: 同じマップで A の子 X を上げる → X の親が R、配列で A の直後に入り、結果の座標が `layoutNodeForest` の結果と一致し、R の座標が変わらない。
  - 1回の commit: 成功の後 `undo()` 1回で木と座標が元に戻り、`redo()` で下げた直後と同じ（`toEqual`）。`replaceMap` の直後から1回下げる → `undo()` が1回目 `true`・2回目 `false`。
  - 成功で `selectedNodeId`（事前に `selectNode(4)`）と `documentRevision` が変わらない。
  - 失敗で何も変わらない（L-001）: 先頭の兄弟を下げる → `{ ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: false, isRoot: false }`。ルートを上げる → `{ ok: false, reason: "at-edge", direction: "outdent" }`。親が配列に無いノードを上げる（`replaceMap` に `[R(1), T(4, parentId 99)]`）→ `invalid-structure`。手動配置の M7 の入力（R(1, null, 0, 0)、A(2, 1, 220, 0)、A1(5, 2, 440, 1e17)、T(4, 1, 220, 100)）で T を下げる → `placement-failed`。どれもノード・選択・`canUndo`・`canRedo` が変わらない。事前に何かを `undo()` して `canRedo === true` にしてから失敗させても `canRedo` が `true` のまま。
  - 自動配置の失敗: `jest.mocked(layoutNodeForest).mockImplementationOnce(() => null)` の後に下げる → `{ ok: false, reason: "placement-failed" }`、ノードと `canRedo` が変わらない。
  - 最新の配列で解決する（L-035）: 手動配置で R(1, null, 0, 0、ラベル「R」)の子 A(2, 1, 220, 0、ラベル「A」)だけのマップ。同じ `act` の中で `const created = result.current.addSiblingNode(2)!;`（A の直後に R の子が増える）の直後に `result.current.changeNodeIndent(created, "indent", new Set([1, 2, created]))` を呼ぶ（追加したノードを含む表示集合を明示的に渡す）→ `{ ok: true, direction: "indent", newParentId: 2, newParentLabel: "A", depth: 3 }`。`act` の後、`created` の `parentId` が 2。描画時の古い `nodes` で判定する変異では `created` が無く `node-missing` になって落ちる。
- [ ] RED: `npm test -- --runInBand useNodesIndent.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-035、L-037（`documentRevision` を上げない理由: 折りたたみと通知を保つ）。
- 完了条件: 全ケースが通り、既存の `useNodes*.test.ts` が変更なしで通る。

### Task 9: useNodeIndentAction（ボタンの状態・展開・通知）

**Files**
- Create: `client/src/hooks/useNodeIndentAction.ts`
- Create: `client/src/hooks/__tests__/useNodeIndentAction.test.tsx`
- 読む: 設計書の「useNodeIndentAction の入出力」「下げるときの折りたたみの展開」節

**Interfaces**
- Consumes: Task 6 の `getNodeIndentAvailability`、`NodeIndentDirection`、`ChangeNodeIndentResult`。Task 7 の `formatNodeIndentNotice`。Task 8 の `changeNodeIndent` の型。既存の `OperationNotice`、`Node`。
- Produces:
  ```ts
  export type UseNodeIndentActionOptions = {
    selectedNodeId: number | null;
    nodes: readonly Node[];                 // 正本（useNodes の nodes）
    visibleNodeIds: ReadonlySet<number>;    // displayState.visibleNodeIds
    changeNodeIndent: (
      nodeId: number,
      direction: NodeIndentDirection,
      visibleNodeIds: ReadonlySet<number>,
    ) => ChangeNodeIndentResult;
    expandNodes: (nodeIds: readonly number[]) => void; // branchCollapse.expandNodes
    publishNotice: (notice: OperationNotice) => void;  // 枝の構造の変更の通知の枠
  };
  export type UseNodeIndentActionReturn = {
    canIndent: boolean;
    canOutdent: boolean;
    changeSelected: (direction: NodeIndentDirection) => void; // ヘッダーのボタン用。未選択なら何もしない
    change: (nodeId: number, direction: NodeIndentDirection) => void; // MapStage の onChangeNodeIndent に渡す
  };
  export function useNodeIndentAction(options: UseNodeIndentActionOptions): UseNodeIndentActionReturn;
  ```

**実装の要点**
- `availability = useMemo(() => getNodeIndentAvailability(nodes, selectedNodeId, visibleNodeIds), [nodes, selectedNodeId, visibleNodeIds])`（3つすべてを依存に入れる。L-612）。`canIndent = selectedNodeId !== null && availability.indent`、`canOutdent` も同様。
- `change(nodeId, direction)`（`useCallback`、依存 `changeNodeIndent`・`visibleNodeIds`・`expandNodes`・`publishNotice`）:
  1. `const result = changeNodeIndent(nodeId, direction, visibleNodeIds);`（受け取った集合をそのまま渡す）。
  2. `if (result.ok && result.direction === "indent" && result.newParentId !== null) expandNodes([result.newParentId]);`
  3. `publishNotice(formatNodeIndentNotice(result));`（結果によらず1回）。
- `changeSelected(direction)`: `selectedNodeId === null` なら何もしない（`changeNodeIndent`・`expandNodes`・`publishNotice` を呼ばない）。それ以外は `change(selectedNodeId, direction)`。

- [ ] テストを書く（`renderHook` と `rerender`。`changeNodeIndent` は型付きの `jest.fn<ChangeNodeIndentResult, [number, NodeIndentDirection, ReadonlySet<number>]>()`、`expandNodes`・`publishNotice` は `jest.fn()`。ノードは R(1) の子 A(2)・T(4)・B(3) の順）:
  - `canIndent` / `canOutdent`: 未選択 → 両方 `false`。T を選択 → 両方 `true`。A → `{ canIndent: false, canOutdent: true }`。R → `{ canIndent: false, canOutdent: false }`。表示集合から A を外して T を選択 → `canIndent: false`。`nodes` を `[R, T, A, B]` の順に変えて `rerender`（選択は T のまま）→ `canIndent: false`（`nodes` を依存から外す変異で落ちる）。表示集合だけを変えて `rerender` したときも同様に変わる。
  - `changeSelected("indent")`: `selectedNodeId: 4` で `changeNodeIndent` が `(4, "indent", visibleNodeIds)` で1回、第3引数が渡した集合と同じオブジェクト（`toBe`）。未選択では `changeNodeIndent`・`expandNodes`・`publishNotice` のどれも呼ばれない。
  - `change(3, "outdent")` が `(3, "outdent", visibleNodeIds)` で呼ぶ。
  - 展開（L-001）: 成功した下げ（`{ ok: true, direction: "indent", newParentId: 2, newParentLabel: "A", depth: 3 }`）で `expandNodes` が `[2]` で1回。成功した上げ（`newParentId: 1`）・`at-edge`（下げる）・`placement-failed`・`invalid-structure` では呼ばれない。
  - 通知: 上の各結果で `publishNotice` が1回、`{ kind: "status", message: "枝の階層を下げました（「A」の子、第3階層）。" }`、`{ kind: "status", message: "枝の階層を上げました（「R」の子、第2階層）。" }`、`{ kind: "status", message: "これ以上階層を下げられません（見えている直前の兄弟がありません）。" }`、`{ kind: "error", message: "枝の階層を変更できませんでした。" }`。
  - 呼ぶ順: 成功した下げで `changeNodeIndent` → `expandNodes` → `publishNotice` の順（`mock.invocationCallOrder`）。
- [ ] RED: `npm test -- --runInBand useNodeIndentAction.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-037、L-057、L-612。
- 完了条件: 全ケースが通る。フックはまだどこからも使われない（Task 12 で配線する）。

### Task 10: ヘッダーの「階層を上げる」「階層を下げる」ボタン

**Files**
- Create: `client/src/components/layout/NodeIndentControl.tsx`
- Create: `client/src/components/layout/__tests__/NodeIndentControl.test.tsx`

**Interfaces**
- Consumes: Task 2 の `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE`。Task 3 の `usePairedButtonFocusHandover`。
- Produces:
  ```ts
  export type NodeIndentControlProps = {
    canOutdent: boolean;
    canIndent: boolean;
    onOutdent: () => void;
    onIndent: () => void;
  };
  export function NodeIndentControl(props: NodeIndentControlProps): JSX.Element;
  ```

**実装の要点**
- `NodeSiblingOrderControl.tsx` と同じ構成。`<div role="group" aria-label="階層" className="flex shrink-0 gap-2">` の中に、左から「階層を上げる」「階層を下げる」の2つの `<button type="button">`。クラスは `NodeSiblingOrderControl` と同じ `buttonClassName` の文字列。
- 階層を上げる: 表示 `階層を上げる`、`aria-label="枝の階層を上げる"`、`aria-keyshortcuts="Alt+ArrowLeft"`、`title="枝の階層を上げる（Alt/Option+←）"`、`disabled={!canOutdent}`、`onClick={onOutdent}`。階層を下げる: `階層を下げる`、`枝の階層を下げる`、`Alt+ArrowRight`、`枝の階層を下げる（Alt/Option+→）`、`disabled={!canIndent}`、`onClick={onIndent}`。
- 両方のボタンに `{ [TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE]: "" }` を付ける（group には付けない）。ボタン自身は `Alt`+矢印キーを処理しない。
- `onKeyDown`: `event.key === "Enter" && event.repeat` なら `preventDefault`（両方）。Space は止めない。
- フォーカス: `const { firstRef, secondRef, handleFocus, handleBlur } = usePairedButtonFocusHandover(canOutdent, canIndent);`。上げるに `firstRef`、下げるに `secondRef`、両方に `onFocus` / `onBlur`。
- `onClick` で `event.detail` を見ない（L-150）。`pointerdown` の既定の動作を止めない。

- [ ] テストを書く（`NodeSiblingOrderControl.test.tsx` と同じ構成）:
  - 名前と属性: `getByRole("group", { name: "階層" })` の中に `getByRole("button", { name: "枝の階層を上げる" })` と「枝の階層を下げる」があり、`textContent` が `"階層を上げる"` / `"階層を下げる"`、`aria-keyshortcuts` が `"Alt+ArrowLeft"` / `"Alt+ArrowRight"`、`title` が `"枝の階層を上げる（Alt/Option+←）"` / `"枝の階層を下げる（Alt/Option+→）"`、`type="button"`。並び: group の中の `getAllByRole("button")` の名前が `["枝の階層を上げる", "枝の階層を下げる"]`。
  - クリック: 有効なとき `userEvent.click` で `onOutdent` / `onIndent` が1回。`userEvent.dblClick` で2回（L-150）。
  - 無効（L-058）: `canOutdent: false` で「枝の階層を上げる」に `disabled` 属性が付き、クリックで `onOutdent` が呼ばれない。`canIndent: false` も同様。片方だけ無効にできる。
  - Enter の押し続け（L-408）: 両方のボタンで `fireEvent.keyDown(button, { key: "Enter", repeat: true })` の戻り値が `false`、`{ key: "Enter", repeat: false }` と `{ key: " ", repeat: true }` は `true`。
  - 目印: 両方のボタンに `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE` が付き、group には付かない。ボタンへの `fireEvent.keyDown(button, { key: "ArrowLeft", altKey: true })` と `ArrowRight` で `onOutdent` / `onIndent` が呼ばれず、戻り値が `true`。
  - `pointerdown` の既定動作を止めない（`fireEvent.pointerDown` の戻り値が `true`）。
  - フォーカス（L-246）: 「枝の階層を上げる」に `focus()` して `rerender` で `canOutdent: false`（`canIndent: true`）→ `document.activeElement` が「枝の階層を下げる」。「下げる」から同様に「上げる」へ。両方 `false` にすると移さず、その後 `canIndent: true` に戻してもフォーカスを奪わない。
- [ ] RED: `npm test -- --runInBand NodeIndentControl.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-058、L-150、L-246、L-408。
- 完了条件: 部品はまだどこからも描画されない（Task 13 で配線する）。

### Task 11: ショートカット（Alt/Option+←/→）と「戻る」「進む」の抑止

**Files**
- Create: `client/src/components/map/nodeIndentShortcut.ts`、`client/src/components/map/__tests__/nodeIndentShortcut.test.ts`
- Create: `client/src/components/map/useNodeIndentShortcut.ts`、`client/src/components/map/__tests__/useNodeIndentShortcut.test.tsx`

**Interfaces**
- Consumes: Task 2 の `TreeEditShortcutInput`、`passesTreeEditShortcutGuard`、`passesTreeEditKeyGuard`、`TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE`。Task 6 の `NodeIndentDirection`。既存の `isEditableTarget`（`@/components/map/editableTarget`。`input, textarea, select` の内側か、有効な `contenteditable` の内側か）。
- Produces:
  ```ts
  // nodeIndentShortcut.ts
  export function resolveNodeIndentShortcut(input: TreeEditShortcutInput): NodeIndentDirection | null;
  export type AltArrowNavigationInput = Pick<
    TreeEditShortcutInput,
    "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing" | "keyCode" | "defaultPrevented" | "target" | "isEditing"
  >;
  // Windows・Linux のブラウザの「戻る」「進む」（Alt+←/→）を止めるか
  export function shouldSuppressAltArrowNavigation(input: AltArrowNavigationInput): boolean;

  // useNodeIndentShortcut.ts
  export type UseNodeIndentShortcutOptions = {
    selectedNodeId: number | null;
    isEditing: boolean;
    hasActiveGesture: () => boolean;   // keydown の時点で呼ぶ
    enabled: boolean;
    onChangeNodeIndent: (nodeId: number, direction: NodeIndentDirection) => void;
  };
  export function useNodeIndentShortcut(options: UseNodeIndentShortcutOptions): void;
  ```

**実装の要点**
- `resolveNodeIndentShortcut`: `passesTreeEditShortcutGuard(input)` が偽なら `null`。`"ArrowRight"` → `"indent"`、`"ArrowLeft"` → `"outdent"`、それ以外 `null`。`repeat` は見ない。
- `shouldSuppressAltArrowNavigation`: `key` が `"ArrowLeft"` か `"ArrowRight"`、かつ `passesTreeEditKeyGuard(input)`（条件 1〜4）、かつ `!isEditableTarget(target)` のとき `true`。選択・ジェスチャー・目印の無いボタンかどうかは見ない。
- `useNodeIndentShortcut`: `useSiblingReorderShortcut`（`client/src/components/map/useSiblingReorderShortcut.ts`）と同じ形（最新の options を `useLayoutEffect` で ref に控え、`window` の `keydown` を `useEffect(…, [])` で1回だけ登録）。ハンドラ:
  1. `latest.enabled` が偽なら何もしない（`preventDefault` もしない。ダイアログ中の「戻る」「進む」も止めない。既知の制限）。
  2. 入力を作る（`key`・修飾キー・`isComposing`・`keyCode`・`defaultPrevented`・`target` は event から、`isEditing`・`selectedNodeId`・`hasActiveGesture: latest.hasActiveGesture()` は ref から）。
  3. `direction = resolveNodeIndentShortcut(input)`。`direction !== null && latest.selectedNodeId !== null` なら `event.preventDefault()` してから `latest.onChangeNodeIndent(latest.selectedNodeId, direction)`（端でも `preventDefault` する）。
  4. そうでなく `shouldSuppressAltArrowNavigation(input)` なら `event.preventDefault()` だけ。
  5. それ以外は何もしない。

- [ ] `nodeIndentShortcut.test.ts`（基準の入力: `key: "ArrowRight", altKey: true`、他の修飾キー偽、`isComposing: false, keyCode: 39, defaultPrevented: false, target: document.body, isEditing: false, selectedNodeId: 1, hasActiveGesture: false`）:
  - `resolveNodeIndentShortcut`: 基準で `"indent"`、`ArrowLeft`（`keyCode: 37`）で `"outdent"`。`ArrowUp`・`ArrowDown`・`"x"` で `null`。`it.each` で条件を1つ外す（`altKey: false`、`shiftKey: true`、`ctrlKey: true`、`metaKey: true`、`isComposing: true`、`keyCode: 229`、`defaultPrevented: true`、`isEditing: true`、`selectedNodeId: null`、`hasActiveGesture: true`、目印の無い `button` の内側）→ `null`。目印付きの `button` で `"indent"`。
  - `shouldSuppressAltArrowNavigation`: 基準と `ArrowLeft` で `true`。`selectedNodeId` を含まない入力（型の上で持たない）で `true` になることを、未選択の場面として1テストで書く。目印の無い `button`・`a[href]` の上で `true`。`input`・`textarea`・`select`・`contenteditable="true"` の内側で `false`。`isEditing: true`、`shiftKey: true`、`ctrlKey: true`、`metaKey: true`、`altKey: false`、`isComposing: true`、`keyCode: 229`、`defaultPrevented: true`、`key: "ArrowUp"` で `false`。
- [ ] `useNodeIndentShortcut.test.tsx`（`useSiblingReorderShortcut.test.tsx` と同じく `renderHook` と `fireEvent.keyDown(document.body, …)`）:
  - `selectedNodeId: 5`・`enabled: true` で `Alt+ArrowRight` → `onChangeNodeIndent` が `(5, "indent")` で1回、`fireEvent.keyDown` の戻り値が `false`。`Alt+ArrowLeft` → `(5, "outdent")`。
  - `repeat: true` でも呼び、戻り値 `false`。
  - `enabled: false` で、選択中でも呼ばれず、戻り値 `true`（抑止もしない）。`rerender` で `enabled: true` に戻すと呼ばれる。
  - 登録をやり直さない: `jest.spyOn(window, "addEventListener")` で、`enabled`・`selectedNodeId`・`onChangeNodeIndent`・`hasActiveGesture` を変えて `rerender` しても `"keydown"` の登録が1回だけ。
  - `hasActiveGesture` を keydown の時点で呼ぶ: `let active = false; hasActiveGesture: () => active` で、描画の後に `active = true` にして `Alt+ArrowRight` → 呼ばれず、戻り値 `false`（抑止はする）。
  - 抑止: `selectedNodeId: null` の `body` への `Alt+ArrowLeft` → 呼ばれず、戻り値 `false`。目印の無い `<button>` に送った `Alt+ArrowLeft` → 呼ばれず、戻り値 `false`。
  - 何もしない: `<input>` に送った `Alt+ArrowLeft` → 呼ばれず、戻り値 `true`。`isEditing: true` → 戻り値 `true`。`Alt+Shift+ArrowRight`・`isComposing: true` → 戻り値 `true`。`Alt+ArrowUp` → 呼ばれず、戻り値 `true`。
- [ ] RED: `npm test -- --runInBand nodeIndentShortcut.test.ts useNodeIndentShortcut.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-061、L-474、L-522。
- 完了条件: 全ケースが通る。フックはまだどこからも使われない（Task 12 で配線する）。

### Task 12: MapStage のショートカットと MapEditor の上げ下げの配線

**Files**
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`
- Modify: `client/src/components/map/__tests__/MapStageVisibility.test.tsx`、`client/src/components/map/__tests__/MapStageContextMenu.test.tsx`、`client/src/components/map/__tests__/MapStageHistory.test.tsx`（必須の props を1行足すだけ）
- Modify: `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`

**Interfaces**
- Consumes: Task 4 の `publishTreeEditNotice`（`MapEditor` の中）。Task 6 の `NodeIndentDirection`。Task 8 の `changeNodeIndent`（`useNodes` の戻り値）。Task 9 の `useNodeIndentAction`。Task 11 の `useNodeIndentShortcut`。既存の `MapStage` の `shortcutsEnabled`（`MapEditor` の `editorShortcutsEnabled`）、`hasActiveGesture`、`editing.editingNodeId`、`branchCollapse.expandNodes`。
- Produces:
  ```ts
  // MapStageProps に追加（必須）
  // ショートカットの上げ下げの要求。結果の通知と展開は呼び出し元が行う
  onChangeNodeIndent: (nodeId: number, direction: NodeIndentDirection) => void;

  // MapEditor の中（Task 13 が使う）
  const nodeIndent = useNodeIndentAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    changeNodeIndent,
    expandNodes: branchCollapse.expandNodes,
    publishNotice: publishTreeEditNotice,
  });
  ```

**実装の要点**
- `MapStage.tsx`: `onChangeNodeIndent` を受け取り、`useSiblingReorderShortcut({...})` の直後で `useNodeIndentShortcut({ selectedNodeId, isEditing: editing.editingNodeId !== null, hasActiveGesture, enabled: shortcutsEnabled, onChangeNodeIndent })`。
- `MapEditor.tsx`: `useNodes()` から `changeNodeIndent` を取り出し、`useSiblingReorderAction` の直後で上の `useNodeIndentAction` を呼ぶ。`MapStage` に `onChangeNodeIndent={nodeIndent.change}` を渡す。
- `AutoLayoutMapStageHarness.tsx`: `useNodes()` から `changeNodeIndent` を取り出し、`onChangeNodeIndent={(nodeId, direction) => { changeNodeIndent(nodeId, direction, new Set(nodes.map((node) => node.id))); }}`（`onReorderSibling` と同じ形）。
- テストの `defaultProps` に `onChangeNodeIndent: jest.fn()`、`defaultProps` を使わない `<MapStage` には `onChangeNodeIndent={() => {}}` を足す（`MapStage.test.tsx` の3か所、`MapStageHistory.test.tsx` の1か所）。

- [ ] `MapStage.test.tsx` にテストを足す（既存の `Alt+↑` のテストと同じ書き方）:
  - `selectedNodeId: 1` で `fireEvent.keyDown(document.body, { key: "ArrowRight", altKey: true })` → `onChangeNodeIndent` が `(1, "indent")` で1回、戻り値 `false`。`ArrowLeft` → `(1, "outdent")`。
  - `shortcutsEnabled: false` で呼ばれず、戻り値 `true`。ラベル編集中（ノードのダブルクリックで開いた入力欄に送る。既存の「ラベル編集中は Alt+↑…」と同じ手順）で呼ばれない。`Alt+Shift+ArrowRight` で呼ばれない。
  - `Alt+ArrowUp` では `onChangeNodeIndent` を呼ばず `onReorderSibling` を呼ぶ。`Alt+ArrowRight` では `onReorderSibling` を呼ばない（同じ `keydown` で両方が動かない）。
  - `selectedNodeId: null` で `body` への `Alt+ArrowLeft` → 呼ばれず、戻り値 `false`。
- [ ] 影響の確認: `npm run typecheck` で `<MapStage` の漏れが無いこと。
- [ ] RED: `npm test -- --runInBand MapStage.test.tsx`（新しいテストが失敗し、既存のテストは必須の値を足した後も通る）。
- [ ] 実装し、GREEN と `npm test -- --runInBand MapStage MapEditor page`、verify。
- 知見: L-060、L-061（ショートカットにも `editorShortcutsEnabled` を渡す）。
- 完了条件: `MapEditor` から `MapStage` へ `onChangeNodeIndent` が渡り、ショートカットで上げ下げと通知が動く。既存のテストは必須の値を足す以外の変更なしで通る。

### Task 13: ヘッダーのボタンと操作ヒントの配線

**Files**
- Modify: `client/src/components/map/MapEditor.tsx`、`client/src/components/map/__tests__/MapEditor.test.tsx`
- Modify: `client/src/components/layout/LayoutModeOperationHint.tsx`、`client/src/components/layout/__tests__/LayoutModeOperationHint.test.tsx`

**Interfaces**
- Consumes: Task 10 の `NodeIndentControl`。Task 12 の `nodeIndent`（`MapEditor` の中の `useNodeIndentAction` の戻り値）。
- Produces: 新しい公開 API は無い。

**実装の要点**
- `MapEditor.tsx`: `const { changeSelected: changeSelectedIndent } = nodeIndent;`、`const outdentSelected = useCallback(() => changeSelectedIndent("outdent"), [changeSelectedIndent]);`、`const indentSelected = useCallback(() => changeSelectedIndent("indent"), [changeSelectedIndent]);`。`operationControls` の中で `NodeSiblingOrderControl` の直後、`CLIPBOARD_OPERATION_HINT` の `<span>` の前に `<NodeIndentControl canOutdent={nodeIndent.canOutdent} canIndent={nodeIndent.canIndent} onOutdent={outdentSelected} onIndent={indentSelected} />`。
- `LayoutModeOperationHint.tsx` の両モードの文言の末尾に `・Alt(Option)+←/→で階層を上げ下げ` を足す:
  - manual: `空白ダブルクリックで追加・ノードダブルクリックで編集・ノードドラッグで移動・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ`
  - auto: `空白ダブルクリックで追加・ノードダブルクリックで編集・追加・削除・接続時に自動整列・ノードドラッグで兄弟の順序を変更・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ`

- [ ] `MapEditor.test.tsx` にテストを足す（既存の「兄弟の順序」のテストと同じ描画のヘルパーと `createTestStorageSession({ initialJson })`）:
  - ボタンの並び: `getByRole("group", { name: "階層" })` が `getByRole("group", { name: "兄弟の順序" })` の後、クリップボードの案内（「枝をコピー: Ctrl/Cmd+C」で始まる文字）の前（`compareDocumentPosition`）。
  - 未選択で「枝の階層を上げる」「枝の階層を下げる」が両方 `disabled`。
  - 手動配置で R（id 1, x 0, y 100）の子 A（id 2, x 220, y 0）・B（id 3, x 220, y 200）の V3 JSON。R を選択すると「上げる」「下げる」が両方無効。A を選択すると「上げる」が有効・「下げる」が無効。B を選択すると両方有効（`canIndent` と `canOutdent` の取り違えを、A の選択で検出する）。
  - B を選択して「枝の階層を下げる」を押すと、操作通知バー（`getByTestId("operation-notices")`）に「枝の階層を下げました（「A」の子、第3階層）。」。
- [ ] `LayoutModeOperationHint.test.tsx` の期待の文言を上の文言に直す（両モード。完全一致）。
- [ ] 影響の確認: `grep -rn 'name: /' client/src/app/__tests__ client/src/components/map/__tests__ client/src/components/layout/__tests__` を実行し、「枝」「階層」「上げ」「下げ」を含む正規表現の名前があれば、新しいボタンに一致しないか確かめ、一致するなら文字列の完全一致に直す。
- [ ] RED: `npm test -- --runInBand MapEditor.test.tsx LayoutModeOperationHint.test.tsx`。
- [ ] 実装し、GREEN と `npm test -- --runInBand page`、verify。
- 知見: L-058、L-060。
- 完了条件: ヘッダーのボタン・ショートカットのすべてが実際の `MapEditor` からつながる。既存のテストは文言の更新以外の変更なしで通る。

### Task 14: ページの結合テスト

**Files**
- Create: `client/src/app/__tests__/pageNodeIndent.test.tsx`
- 読む: 設計書の「受け入れ基準」「テスト方針」の「ページの結合テスト」「既存の操作との関係」「エラーと境界条件」節
- Modify（テストで見つかった不具合がある場合だけ）: Task 1〜13 で作成・変更したファイル

**Interfaces**
- Consumes: Task 13 までの `Home`（`@/app/page`）。既存の `seedMapLibrary`・`readActiveMapJson`（`client/src/testing/mapLibraryTestStorage.ts`）、`renderReady`・`mockStageBounds`・`mockNodePointerHandlers`・`mockStageHandlers`・`pointer`・`resetMapStageTestRuntime`（`client/src/components/map/testing/mapStageTestRuntime.tsx`）と、`pageSiblingOrder.test.tsx` と同じ Pixi・イラスト生成・ダウンロード・画像化のモック。ヘルパーの `v3Json`（`layoutMode` を引数で `"auto"` にも切り替えられるようにする）・`selectNode(index, nodeCount, x, y)`・`exportedMap`・`storedMap`・`stageContainer`・`renderPage` は `pageSiblingOrder.test.tsx` から複製する。新しい公開 API は作らない。
- テストの前提: 初期のビューポートは `{ offsetX: 0, offsetY: 0, scale: 1 }` なので、ポインタの座標がそのままワールド座標になる。`selectNode` には対象のノードの中心の座標を渡す。`mockNodePointerHandlers` は直近の描画で見えているノードの分だけ配列の順に登録される（折りたたみで隠れたノードは数えない）。保存された JSON は `readActiveMapJson(window.localStorage)` を `waitFor` で待って読む（300ms の自動保存）。ボタンは `within(screen.getByRole("banner")).getByRole("button", { name: "枝の階層を下げる" })` などで取る。

- [ ] `pageNodeIndent.test.tsx` を書く（ノードは幅 100・高さ 60）。基本のマップ: 手動配置で R（id 1、ラベル「R」、x 0, y 100）、A（id 2, parentId 1、「A」、x 220, y 0）、B（id 3, parentId 1、「B」、x 220, y 200）。
  - 基本（ボタン）: B を選択して「枝の階層を下げる」→ 保存された B の `parentId` が 2、B が (440, 0)、通知「枝の階層を下げました（「A」の子、第3階層）。」、「枝の階層を下げる」が無効・「枝の階層を上げる」が有効（選択は B のまま）。続けて「枝の階層を上げる」→ B の `parentId` が 1、B が (220, 100)、ID の並びが `[1, 2, 3]`、通知「枝の階層を上げました（「R」の子、第2階層）。」。
  - Undo / Redo: B を下げた後、「元に戻す」1回で B の `parentId` が 1・(220, 200)、通知が消える（`queryByText` が `null`）。「やり直す」で `parentId` 2・(440, 0)。
  - ショートカット: B を選択して `fireEvent.keyDown(document.body, { key: "ArrowRight", altKey: true })` → ボタンと同じ結果。`ArrowLeft` で戻る。
  - 止まる場面: ラベル編集中（B のダブルクリックで開いた入力欄に `Alt+ArrowRight`）、検索入力欄（`getByRole("combobox", { name: "ノードを検索" })` に送る）、`Alt+Shift+ArrowRight`、「枝を複製」のボタンに送る、で B の `parentId` が 1 のまま。
  - 目印の共有: B を選択し、「枝を上へ移動」に `focus()` したまま `Alt+ArrowRight` を「枝を上へ移動」へ送ると、B の `parentId` が 2。別のマップ（ルート id 1・2・3 の縦並び。`pageSiblingOrder.test.tsx` の `storeThreeRoots` と同じ）で id 2 を選択し、「枝の階層を下げる」に `focus()` したまま `Alt+ArrowUp` を送ると、ID の並びが `[2, 1, 3]`。
  - 閉じた親へ下げる: 基本のマップに A1（id 5, parentId 2、「A1」、x 440, y 0）を足す。A を選択して「枝を折りたたむ」→ B を選択（A1 が隠れているので見えているノードは3つ）→「枝の階層を下げる」→ B の `parentId` 2、B が (440, 100)（A1 の下端 60 + 40）。「枝の階層を上げる」が有効（B が選択されたまま見えている）。A を選択し直すと、ヘッダーのボタンが「枝を折りたたむ」（展開されている）。
  - 失敗では開かない: 上と同じ形で A1 の y を `1e17` にする。A を閉じ、B を選択して「枝の階層を下げる」→ 通知「枝の階層を変更できませんでした。」、B の `parentId` が 1。A を選択し直すと「枝を展開」（閉じたまま）。
  - 端: R を選択すると「枝の階層を上げる」「枝の階層を下げる」が `disabled`。`Alt+ArrowLeft` で通知「これ以上階層を上げられません（ルートです）。」。A を選択して `Alt+ArrowRight` で「これ以上階層を下げられません（見えている直前の兄弟がありません）。」。
  - 隠れた兄弟: R（high）の子 A（high, x 220, y 0）・L（id 4、low、x 220, y 100）・C（id 6、high、x 220, y 200）。「表示 高のみ」を押してから C を選択し「枝の階層を下げる」→ C の `parentId` が 2、L の `parentId` が 1 のまま、保存された ID の並びで L が残る（L-460）。別のマップで R（high）の子 L（low, y 0）・C（high, y 100）だけにし、「表示 高のみ」で C を選択 →「枝の階層を下げる」が無効、`Alt+ArrowRight` で通知「これ以上階層を下げられません（見えている直前の兄弟がありません）。隠れている兄弟の子にするには、表示を『すべて』に切り替えてください。」。
  - 自動配置: `layoutMode: "auto"` で2つのルート（id 1「一」、id 2「二」）を作り（座標は任意。読み込み時に並び直る）、保存された id 1 の座標を控えてから id 2 を選択して `Alt+ArrowRight` → id 2 の `parentId` が 1、id 1 の `x` / `y` が控えた値と同じ。
  - 通知の枠の共有: B を選択して「枝を上へ移動」→ 並べ替えの通知。続けて「枝の階層を下げる」→ 操作通知バー（`getByTestId("operation-notices")`）に上げ下げの文言があり、並べ替えの文言が無く、通知の要素が1つ。「元に戻す」で消える。
  - ダイアログ（L-061）: B を選択してから（未選択のままでは抑止が無くても変化しないので、必ず選択する）「箇条書きから追加」でダイアログを開き、`(document.activeElement as HTMLElement).blur()` の後、`document.activeElement === document.body` を確かめてから `Alt+ArrowRight` を `document.body` に送っても B の `parentId` が 1 のまま。
  - 「戻る」の抑止: 未選択で `fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true })` の戻り値が `false`。
  - 自動保存: 上げ下げの後、保存された本体の `nodes` の `parentId` と順が期待どおり（上の各テストで確かめる）。JSON 書き出しの `nodes` の順も同じ（基本のテストで1回確かめる）。
- [ ] RED の確認: 新しいテストは Task 13 の実装で通る場合がある。その場合は、主要な配線を1つずつ一時的に壊して、対応するテストが失敗することを確かめてから元に戻す。壊す箇所: `MapEditor` が `MapStage` に `onChangeNodeIndent` として空の関数を渡す、ヘッダーへ `canIndent` と `canOutdent` を取り違えて渡す、`useNodeIndentAction` に `expandNodes` として空の関数を渡す、`publishNotice` に別の `useRevisionScopedNotice` の `publishNotice`（バーに出ない枠）を渡す、`MapStage` の `useNodeIndentShortcut` に `enabled: true` を渡す、`useNodes.changeNodeIndent` で `applyTreeChange` を2回呼ぶ、`useNodeIndentShortcut` の抑止の分岐を消す。結果を報告に書く。
- [ ] 失敗したテストがあれば最小の修正を入れ、`npm test -- --runInBand pageNodeIndent.test.tsx` を GREEN にし、verify。
- 知見: L-001、L-057、L-060、L-061、L-460。
- 完了条件: 設計書の受け入れ基準 1〜9 が結合テストか前のタスクの単体テストで固定され、変異の確認の結果を報告に書く。

### Task 15: 仕様の文書の更新（features.md・data-model.md）

**Files**
- Modify: `docs/specifications/features.md`
- Modify: `docs/specifications/data-model.md`
- 読む: 設計書の「既存の文書の更新」の `features.md`・`data-model.md` の項、「上げ下げの規則」（例 I・O の表）、「手動配置の座標」（式と例 M1〜M6）、「自動配置と先頭のルート」、「下げるときの折りたたみの展開」、「通知」、「UI」、「既存の操作との関係」、「対象外」節

- [ ] 各文書を「8系統」「8 系統」「兄弟の順序変更の通知」「data-sibling-reorder-button」「Alt+↑/↓」「Alt + ↑」「Phase 14」「階層」で grep し、注記が要る箇所をすべて洗い出してから直す。
- [ ] `features.md`（設計書の「既存の文書の更新」のとおり）:
  - 目次と新しい「15. 階層の上げ下げ」の章: 15.1 操作、15.2 上げ下げの規則と隠れた兄弟（例 I・O の表。「直前の兄弟」は並べ替えと同じく `nodes` 配列の相対順と表示集合で決め、画面の上下では決めないこと、手動配置では画面で真上に見える兄弟と一致しないことがあり、そのときは並べ替えで順を直してから下げることを明記する。L-472）、15.3 手動配置の座標（式と例 M1〜M6）、15.4 自動配置と先頭のルート、15.5 折りたたみの展開、15.6 履歴・選択・通知（文言の表）、15.7 キーボードとフォーカス（「戻る」「進む」の抑止と、入力欄の中とダイアログを開いている間は抑止しない既知の制限）、15.8 既存の操作との関係、15.9 対象外。
  - 1.1 の Phase 14 の行に「階層の上げ下げ」を足す（残りの3項目は未実装と書く）。1.2 のヘッダーの説明に「階層を上げる」「階層を下げる」を足す。
  - 3.7（接続）に、直前の兄弟・祖父母への付け替えは 15 章の上げ下げでもできることを1行で参照する。
  - 8.1 の表に「階層の上げ下げ | `parentId` の変更、配列の位置、手動配置での枝の平行移動、自動配置での再配置をまとめて1操作」。8.2 の消える通知の記述を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ）」に直す。
  - 10.4 に「階層を下げる: 閉じた新しい親は、成功したときだけ展開する。上げ下げは折りたたみを保つ」。
  - 11.1 の表に `Alt`（`Option`）+ `←` / `→` の行。`Alt` + `↑` / `↓` の行の「ヘッダーの『上へ』『下へ』にフォーカスがある間」を「ヘッダーの『上へ』『下へ』『階層を上げる』『階層を下げる』にフォーカスがある間」に直す。止まる場面・ダイアログの NOTE に `Alt+←/→` を足し、「戻る」「進む」の抑止の NOTE を足す。
  - 11.4 の表に「階層」のボタンの行。操作通知バーの行・「マップ全体置換時の同期リセット」の10番・「8系統独立表示」の本文の、兄弟の順序変更の通知を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ）」に直し、`kind` の表の主な用途に上げ下げの成功・端・失敗を足す。「レイアウトモード別操作ヒント」の文言を Task 13 の文言に直す。
  - 14.1 の「ボタンを押した後…」と 14.7 の目印の属性名を `data-tree-edit-shortcut-button` に直し、目印が4つのボタンに付くことを書く。14.6 の「8系統目」の説明に、上げ下げと枠を共有することを足す。14.9 の対象外の「階層の上げ下げ」を消す。
- [ ] `data-model.md`: 2.1 の `Node` の説明に「`parentId` は上げ下げ（features.md 15 章）でも変わる。上げ下げは T の `parentId` と根ノード1つの配列内の位置を変え、子孫の `parentId` と位置は変えない」。新しい節「2.8 階層の上げ下げの型」に `NodeIndentDirection`・`NodeIndentAvailability`・`NodeIndentFailureReason`・`NodeIndentResult`・`ChangeNodeIndentResult`（定義元は `client/src/domain/nodes/nodeIndent.ts`。Task 6 の Interfaces のとおり）。保存形式（3章）は変えないことを確かめる。
- [ ] 文書に書いた型名・関数名・文言・定数が実装と一致することを `grep` で確かめる（`changeNodeIndent`、`calculateIndentTranslation`、`useNodeIndentAction`、`data-tree-edit-shortcut-button`、成功・端・失敗の通知の文言）。`git diff --check` と verify。
- 知見: L-061（既存の操作との関係を文書にも表で残す）、L-472、L-614。
- 完了条件: `grep -n "data-sibling-reorder-button" docs/specifications/features.md` が空。features.md の目次と章番号が連続している。

### Task 16: 構成・案内・手動テストの文書の更新

**Files**
- Modify: `docs/architecture/overview.md`
- Modify: `README.md`、`client/README.md`、`docs/README.md`
- Modify: `docs/testing/browser-test-cases.md`
- 読む: 設計書の「既存の文書の更新」の `overview.md`・README 類・`browser-test-cases.md` の項、「手動テスト」節（R-01〜R-12 の表と共通の決まり）、「全体の構成」節

- [ ] 各文書を「8系統」「兄弟の順序変更」「data-sibling-reorder-button」「Alt+↑/↓」「Phase 14」で grep し、注記が要る箇所をすべて洗い出してから直す。
- [ ] `overview.md`: レイヤーの説明に新しいファイル（`nodeSiblingNeighbors.ts`、`nodeIndent.ts`、`nodeIndentPlacement.ts`、`nodeIndentMessages.ts`、`useNodeIndentAction.ts`、`NodeIndentControl.tsx`、`usePairedButtonFocusHandover.ts`、`treeEditShortcutGuard.ts`、`nodeIndentShortcut.ts`、`useNodeIndentShortcut.ts`）を足し、各ディレクトリのファイル数を `ls` で数えた実数に合わせる。`useSiblingReorderAction` の説明を `publishNotice` を受け取る形に直す。「兄弟の順序変更の流れ」の後に「階層の上げ下げの流れ」（ボタン・ショートカット → `useNodeIndentAction` → `useNodes.changeNodeIndent` の1回の commit → 成功した下げで `expandNodes` → `MapEditor` の枝の構造の変更の通知）を足す。
- [ ] `README.md`: 機能の一覧に「13. 階層の上げ下げ（Phase 14 の2番目の項目）」を足し、編集履歴の対象の列挙に上げ下げを足す。`client/README.md`: キーボードショートカットに `Alt`（`Option`）+ `←` / `→`、機能の一覧に階層の上げ下げ、`domain/nodes/` の説明に上げ下げを足す。`docs/README.md`: 各文書の説明の「兄弟ノードの順序変更」の列挙に「階層の上げ下げ」を足す（流れ、Phase の範囲、型の節 2.8、手動テストの R 節）。
- [ ] `browser-test-cases.md`: 冒頭の対象に「階層の上げ下げ」を足す。新しい節「Phase 14: 階層の上げ下げ」（記号 `R`）を Q 節の後・「結果の集計」の前に足し、設計書の「手動テスト」の表の R-01〜R-12 を、前提・手順・期待の形で書く（R-02 の「後ろの兄弟」は、C を B の子にした後に C を選択して `Enter` で足す B の子であることを、R-06 の「前に低の兄弟だけがある状態」は別のマップ `R-06b` で R の子を低・高の順に作る手順を、設計書のとおりに書く）。共通の決まりは Q 節と同じ（`npm run build` の後に `npm run start -- -p 3114`、保存データはキーを名前で1つずつ消す、各ケースは「新しいマップ」でケースの ID を名前にしたマップ、特に書かない限り表示は「すべて」、通知の行が出るとキャンバスがずれる、結果は実ブラウザで確かめたものだけを記録し Jest の結果を実機の確認として扱わない）。位置の期待は相対的な関係で書き、フォーカスは `document.activeElement.getAttribute("aria-label")` で確かめる（L-613）。「結果の集計」に R-01〜R-12 の未実施の行を足す。Q 節のケースで目印の属性名に触れている箇所があれば直す。
- [ ] 文書に書いたファイル名・関数名・文言が実装と一致することを `grep` で確かめる。`git diff --check` と verify。
- 知見: L-061、L-613。
- 完了条件: 設計書の受け入れ基準 11 に挙がった文書（`ROADMAP.md` を除く）が実装と一致する。実ブラウザで確認していない項目を確認済みと書いていない。

### Task 17: ROADMAP の更新と最終検証

**Files**
- Modify: `ROADMAP.md`

- [ ] Phase 14 の見出しは「## Phase 14: ツリー構造の編集（進行中）」のまま、「階層の上げ下げ（候補002）」を `[x]` にする。ほかの3項目（途中への親ノード挿入、枝の切り取り・移動、ノードだけ削除）は `[ ]` のまま。
- [ ] 「現在地」:
  - Phase 14 の項目の要約に、階層の上げ下げの完了を足す（ヘッダーの「階層を上げる」「階層を下げる」と `Alt` / `Option` + `←` / `→` で、選択中のノードの枝を、見えている直前の兄弟の子にしたり、親の兄弟（元の親の直後）にしたりできる。閉じた兄弟の下へ下げるとその兄弟を開く。手動配置では枝を新しい親に合わせて平行移動し、自動配置では全体を並び直す。1回の上げ下げを1操作として Undo / Redo できる。Jest（jsdom）の自動テストと `npm run verify`（lint・typecheck・test・build）で確認済みで、実ブラウザでの確認（docs/testing/browser-test-cases.md の R 節）は未確認で、実機では確かめていないこと）。
  - 「次に取り組む項目は、Phase 14「階層の上げ下げ」（候補002）。」を「次に取り組む項目は、Phase 14「途中への親ノード挿入」（候補003）。」に直す。
  - 「Phase 14は進行中（兄弟ノードの順序変更が完了）。…」を「Phase 14は進行中（兄弟ノードの順序変更・階層の上げ下げが完了）。Phase 15〜39は未着手。追加候補100案を、優先順位と依存関係を踏まえた26フェーズへ整理済み。」に直す。
  - 文書体系の行の「Phase 0からPhase 14の兄弟ノードの順序変更まで」を「Phase 0からPhase 14の階層の上げ下げまで」に直す。
- [ ] Phase 14 の節以外の追加候補の節（「## Phase 14以降の計画（全100案・26フェーズ）」と Phase 15〜39 の各節）は変更しない。`git diff ROADMAP.md` で、その範囲に差分が無いことを確かめる。
- [ ] 「最終更新」を実装を完了した日付にする。
- [ ] `cd client && npm run verify` と `git diff --check` を実行し、テストのスイート数・テスト数と、lint・typecheck・build の成功を報告に書く。
- [ ] 全体の仕様・品質レビューを別のサブエージェントで行い、指摘を解消する（解消のたびに `cd client && npm run verify`）。
- [ ] ブランチと worktree を保持する。コミット・push・PR は明示の依頼が無ければ行わない。完了報告では、ブランチ名・worktree のパス・未決事項（実ブラウザの未確認のケースなど）を伝える。
- 完了条件: ROADMAP の「階層の上げ下げ」だけが新たに完了になり、現在地・次の項目（Phase 14「途中への親ノード挿入」（候補003））・最終更新が実態と一致する。ほかの節に差分が無い。全タスクの完了後の `npm run verify` が成功している。

---

## 設計書との対応

| 設計書の節 | タスク |
| :--- | :--- |
| `scanSiblingNeighbors` の移動 | 1 |
| ショートカットの共通の条件・目印の属性 | 2 |
| `usePairedButtonFocusHandover` | 3, 10 |
| 通知の枠 | 4, 9, 12 |
| 型・`getNodeIndentAvailability`・`changeNodeIndent`・例 I1〜I8・O1〜O5 | 6 |
| 子孫の配列位置を動かさなくてよい根拠 | 6 |
| 手動配置の座標（式・丸め誤差・例 M1〜M8） | 5, 6 |
| 自動配置と先頭のルート | 6, 8, 14 |
| useNodes の操作 | 8 |
| useNodeIndentAction の入出力・下げるときの折りたたみの展開 | 9, 12, 14 |
| 履歴 | 8, 14 |
| 通知の文言 | 7, 9 |
| UI: ヘッダーのボタン | 10, 13 |
| UI: 操作ヒント | 13 |
| UI: ショートカット（判定・抑止・登録） | 11, 12 |
| 既存の操作との関係 | 12, 13, 14, 15 |
| エラーと境界条件 | 5, 6, 8, 11, 14 |
| 受け入れ基準 | 1 → 6・14、2 → 6・14、3 → 5・6・14、4 → 6・8・14、5 → 9・14、6 → 7・10・14、7 → 8・14、8 → 4・7・14、9 → 2・10・11・12・14、10 → 8・14、11 → 15・16・17 |
| 既存の文書の更新・手動テスト | 15, 16, 17 |

## 知見の割り当て

| 知見 | タスク |
| :--- | :--- |
| L-001 | 5, 7, 8, 9, 14 |
| L-035 | 6, 8 |
| L-037 | 4, 8, 9 |
| L-057 | 7, 9, 14 |
| L-058 | 10, 13 |
| L-060 | 4, 12, 13, 14 |
| L-061 | 11, 12, 14, 15, 16 |
| L-150 | 10 |
| L-246 | 3, 10 |
| L-408 | 3, 10 |
| L-457 | 6 |
| L-460 | 1, 6, 14 |
| L-472 | 1, 6, 15 |
| L-474 | 2, 11 |
| L-522 | 2, 11 |
| L-524 | 5 |
| L-540 | 6 |
| L-541 | 5, 6 |
| L-612 | 9 |
| L-613 | 16 |
| L-614 | 7, 15 |
