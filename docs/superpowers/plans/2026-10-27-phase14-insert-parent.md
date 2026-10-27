# Phase 14: 途中への親ノード挿入 Implementation Plan

> **For agentic workers:** `superpowers:subagent-driven-development`でタスクを1つずつ実装し、別担当の仕様・品質レビュー後に次へ進む。各タスクのサブエージェントには、そのタスク本文、Global Constraints、依存する前タスクの Interfaces だけを渡す。

**Goal:** ROADMAP Phase 14 の「途中への親ノード挿入（候補003）」を実装し、選択中のノード T とその親の間に新しいノード N を1つ入れる操作（N は T がいた兄弟の位置に入り、T と子孫が N の唯一の子になる。T がルートなら N が新しいルートになる）を、ヘッダーの「親を挿入」と `Alt`/`Option`+`Enter` から、1回の Undo / Redo で戻せる1操作として提供し、挿入の後は N を選択して空のラベルの編集を始める。
**Architecture:** 挿入の規則は純関数（`domain/nodes/nodeParentInsertion.ts`）、新しいノードの値は純関数（`domain/nodes/nodePlacement.ts` の `createParentNode`）、失敗の文言は純関数（`domain/nodes/nodeParentInsertionMessages.ts`）。手動配置の座標は既存の `calculateIndentTranslation` と `translateBranch`（`domain/nodes/nodeIndentPlacement.ts`）を再利用する。`useNodes.insertParentNode` が `applyTreeChange` を1回だけ呼んで N を選択し、`useNodeParentInsertionAction` がボタンの有効・無効、失敗の通知、成功時の通知の枠のクリアと「ラベルの編集の要求」（`NodeLabelEditRequest`）を持つ。`MapStage` は `useNodeLabelEditRequest` で要求を受けて `startEditing(nodeId, "")` を呼ぶ。ショートカットの判定は `components/map/nodeParentInsertionShortcut.ts`（共通の条件は既存の `treeEditShortcutGuard.ts`）、登録は `useNodeParentInsertionShortcut`。既存の `useNodeKeyboardShortcuts` は `Alt` を含む `Enter` で兄弟を足さず、`NodeLabelEditor` はリピートの `Enter` で確定しない。
**Tech Stack:** TypeScript、React 19、Next.js 16、Pixi.js、Jest、Testing Library。追加依存なし。
**Spec:** `docs/superpowers/specs/2026-10-27-phase14-insert-parent-design.md`

## Global Constraints

- 新規依存なし。`Node`、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式を変えない。挿入は、N を1つ足し、T の `parentId` を N の ID に変え、手動配置では T の枝を平行移動するだけ。子孫の `parentId` と配列位置、ほかのノードは変えない（同じオブジェクトのまま）。
- 境界: 挿入の規則は純関数（`domain/nodes/nodeParentInsertion.ts`）、新しいノードの値は純関数（`domain/nodes/nodePlacement.ts` の `createParentNode`）、失敗の文言は純関数（`domain/nodes/nodeParentInsertionMessages.ts`）、ショートカットの判定は純関数（`components/map/nodeParentInsertionShortcut.ts`、共通の条件は `components/map/treeEditShortcutGuard.ts`）、状態と1回の commit は React フック、表示と操作は部品。domain は hooks・components を import しない。型 `InsertParentNodeResult` は `nodeParentInsertion.ts` に置き、`hooks/useNodes.ts` から再 export しない。
- 結果は判別共用体で返し、呼び出し元は成功したときだけラベルの編集の要求を出し、通知の枠を空にする。共用体の分岐は `switch` で網羅し、`default` で新しいメンバーを既定の分岐へ流さない（網羅は `const unreachable: never = value;` で型検査する）。
- 対象は ID で指定し、配列の添字を層の間で受け渡さない。T の解決と新しい ID の採番は `applyTreeChange` のコールバックの中で、最新のノード配列から行う。
- 挿入は、表示で絞り込んだ部分配列ではなく、正本の全 `nodes` に対して行う。隠れた兄弟・隠れた子孫を消したり、順序を変えたりしない。
- 配列の操作は1回の走査で新しい配列を作る。`splice`・`indexOf` による位置の計算を使わない。大きな配列に `Math.min(...arr)`・`Math.max(...arr)`・`push(...arr)` を使わない。
- 座標の計算は既存の `calculateIndentTranslation(nodes, nodeId, newParentId)` と `translateBranch(nodes, rootId, translation)`（`@/domain/nodes/nodeIndentPlacement`。どちらも溢れ・桁落ち・非有限・間隔不足で `null`）だけを使い、新しい式を書かない。`null` なら `placement-failed` にし、途中まで動いた配列を返さない。
- 定数は既存のものを使う: `RECT_WIDTH = 100`・`RECT_HEIGHT = 60`・`CHILD_HORIZONTAL_GAP = 120`（`client/src/config/shapes.ts`）、`TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE = "data-tree-edit-shortcut-button"`（`treeEditShortcutGuard.ts`）。新しい定数は作らない。
- 失敗の通知の文言は理由によらず `親ノードを挿入できませんでした。`（`kind: "error"`）。成功の通知は出さず、枝の構造の変更の通知の枠（8系統目。並べ替え・上げ下げと共有）を空にする。操作通知バーの系統は8のまま。
- 新しい props・options・コールバックは必須にする（省略可能にして既定値を置かない）。下の層に必須の値を足すタスクでは、上の層の呼び出し元（テストの `defaultProps`・ハーネスを含む）も同じタスクで直す。実際の `Home` から `MapEditor`、ヘッダー、`MapStage` まで通す結合テストで配線を確かめる。
- 各タスクは「テスト追加 → 対象テストの RED → 実装 → 対象テストの GREEN → `cd client && npm run typecheck && npm run lint`」で終える（各タスクの終わりで typecheck が通る状態にする。タスク単位でコミットする場合も各コミットで typecheck が通る）。全タスクの最後（Task 14）で `cd client && npm run verify` が成功することを確かめる。
- 対象外（作らない）: Phase 14 の他の項目（枝の切り取り・移動、ノードだけの削除）、複数ノードの一括挿入、兄弟の一部をまとめて新しい親の子にすること、ドラッグでの挿入、コンテキストメニューの項目、手動配置での重なりの回避、挿入の前のラベル・重要度の入力、挿入の成功の通知、`Tab` の挙動の変更、`Ctrl`・`Cmd`・`Shift` だけと併用した `Enter` の挙動の変更、ラベルの編集の後にフォーカスを「親を挿入」へ戻すこと、IME 変換中の `Enter` の扱いの変更、`usePairedButtonFocusHandover` の利用。
- 実装は `.worktrees/codex/phase14-insert-parent` の `codex/phase14-insert-parent` ブランチで行う。タスク単位のサブエージェント実装、別担当の仕様・品質レビュー、TDD（先にテストを書いて RED を確かめる）。
- コミット・push・PR 作成は依頼時のみ。依頼された場合のメッセージは Conventional Commits（例: `feat(nodes): ...`、`feat(map): ...`、`test(map): ...`、`docs(nodes): ...`）。最後のタスクで `ROADMAP.md` を実態に合わせて更新する。
- 反映する知見（サブエージェントは知見ファイルを読まない前提。ここの1行が要約）:
  - **L-001**: 操作の成否を呼び出し元へ返し、呼び出し元は結果を見て、失敗のときに成功の後続処理（ラベルの編集の要求・通知の枠のクリア）を行わない。自動配置の失敗も `placement-failed` として返す。
  - **L-002**: 「無い」「重なる」を黙って通さない。純関数が受け取る新しい ID が既存のノードと重なるときは `id-conflict` で拒否する。
  - **L-035**: 配列の添字など位置ベースの識別子は、表示から操作までの間にずれる。ID で指し、T と新しい ID は `applyTreeChange` の中の最新の配列で解決・採番する。
  - **L-037**: 通知やラベルの編集の要求を識別子だけで対象に結び付けない。`documentRevision` と組にし、Undo / Redo・マップの置き換えの後に古い要求で編集を始めない。
  - **L-048**: 既存の操作に手を入れる前に、既存の動作をコードで確かめる。`useNodeKeyboardShortcuts` と `NodeLabelEditor` は修飾キーとリピートを見ていないことを確かめたうえで、変えるのは「`Alt` を含む `Enter`」と「入力欄のリピートの `Enter`」だけにする。
  - **L-058**: 見た目だけ無効なボタンは押せてしまう。`disabled` 属性で無効にし、無効のときクリックしてもコールバックが呼ばれないことをテストする。
  - **L-060**: 省略可能な props と既定値のせいで配線漏れをどのテストも検出しない。新しい props（`onInsertParentNode`、`labelEditRequest`、ボタンの props、`publishNotice`、`clearNotice`）は必須にし、`Home` からの結合テストと配線の変異（渡さない・取り違える）で確かめる。
  - **L-061**: 新しい操作の入口（ボタン・ショートカット）を、ダイアログの根の `inert`、`editorShortcutsEnabled`、ラベル編集中、ジェスチャー中の停止条件の対象に入れ、既存の操作との関係を表で確かめる。
  - **L-150**: クリックで画面を切り替えない UI では、ダブルクリックの続きのクリックは2回目の操作になる。`event.detail` で弾かず、2回の挿入として扱う。
  - **L-155 / L-157**: ボタンが消えたり無効になったりするとフォーカスが `body` に落ちる。「親を挿入」は成功しても無効にならず、フォーカスは入力欄の `autoFocus` で移る。編集の後に `body` へ落ちるのは `Tab`・`Enter` と同じ既知の挙動として扱う。
  - **L-166**: 通知が古いまま残る・同じ内容だと読み上げられない。成功の通知は出さず、成功で枠を空にする。失敗の文言が続くと読み上げられないことは既知の制限として文書に書く。
  - **L-408**: Enter の押し続け（`event.repeat`）が、フォーカスを移した先（ラベルの入力欄）に届いて操作が連続する。ボタンの `keydown` とショートカットの判定でリピートを止め、`NodeLabelEditor` でもリピートの `Enter` で確定しない。2つの対策は組で働くので片方だけを消さない。`repeat` を明示したテストと `detail: 0` のクリックのテストを書く。
  - **L-460**: 表示で絞り込んだ部分配列で操作すると画面外の要素が消える。正本の全配列で挿入し、隠れた兄弟が全件残り順が変わらないことをテストで固定する。
  - **L-473**: 入力欄の `Enter`・`Escape` と `blur` の確定を併用すると二重確定が起きる。`NodeLabelEditor` の変更はリピートの `Enter` の無視だけにし、`actionHandledRef` と `blur` での確定を変えない。
  - **L-474**: 日本語 IME の変換中のキー（`isComposing`、`keyCode === 229`）を無視する（共通の条件で行う）。
  - **L-522**: グローバルなショートカットは、対話要素にフォーカスがあるときは働かせない（`isInteractiveTarget`）。ショートカットを案内する5つのボタン（「上へ」「下へ」「階層を上げる」「階層を下げる」「親を挿入」）だけを目印の属性で対象に戻す。
  - **L-524**: 有限な座標同士の演算でも、溢れ・桁落ちが起きる。検査付きの `calculateIndentTranslation` と `translateBranch` を再利用し、失敗を `placement-failed` にする。
  - **L-541**: `splice` と添字の計算で配列を組み替えると壊れる。1回の走査で新しい配列を作り、「N を末尾に足す」「N を T の直後に積む」変異で落ちるテストにする。
  - **L-612**: 有効・無効を使う値の一部の変化だけで判定すると古い結果が残る。`canInsert` は `nodes`・選択・表示集合のすべてを依存にして求め、3つを1つずつ変えるテストを書く。
  - **L-613**: 手動テストの期待を見た目で書かない。位置は相対的な関係、フォーカスは `document.activeElement.getAttribute("aria-label")` か `getAttribute("data-testid")` で確かめる。
  - **L-616**: テストのデータが、正しい実装と近い誤りで同じ結果になる偶然の性質を持つと変異が生き残る。重要度を既定値 `"medium"` 以外（`"high"` と `"low"`）にする、T の大きさを既定値以外（幅 140・高さ 116）にする、`x` と `y` を異なる 0 でない値にする、T の後ろに兄弟を置く、自動配置の入力の座標を配置の結果と違う値にする。テストを書いた後に各タスクに挙げた「近い誤り」の変異を当て、落ちることを確かめて報告に書く。
  - **L-617**: フォーカスの移動を1回だけでなく連続で確かめる。「挿入 → 入力欄へ移る → 確定して `body` に戻る → もう一度押して次の入力欄へ移る」を結合テストに書く。

## Review Focus

- 挿入の規則: 設計書の例 P1〜P9 が1例1テストで `insertParentNode` のテストにあり、子孫と他のノードのオブジェクトが同一（`toBe`）で、隠れた兄弟が全件残る。「N を末尾に足す」「N を T の直後に積む」変異で落ちる（Task 1。L-460、L-541）。
- N の値: 重要度の引き継ぎ（`"high"`・`"low"`）、大きさが既定（100 × 60）、`illustration` を持たない、座標が T と同じ（Task 1。L-616）。
- 手動配置の座標: 例 M1〜M6。`calculateIndentTranslation` を「T の親を変えた後の配列」で呼ぶ変異と、T の幅で T の位置を決める変異で落ちる（Task 1。L-524、L-616）。
- 1回の commit と失敗時の不変: 成功は1回の Undo で戻り、失敗ではノード・選択・履歴・Redo が変わらない。T の解決と採番は `applyTreeChange` の中の最新の配列（Task 3。L-001、L-035）。
- 成功したときだけ要求を出し枠を空にする（Task 4。L-001、L-037）。
- 押し続けの2つの対策（ボタン・ショートカット・入力欄）と、`Alt` を含む `Enter` で兄弟を足さないこと（Task 5・6・7・11。L-048、L-408、L-473）。
- 入口の停止（Task 6・9・11。L-061、L-474、L-522）。
- 配線: `onInsertParentNode`・`labelEditRequest`・ボタンの props・`publishNotice`・`clearNotice` が必須で、取り違えを結合テストが検出する（Task 9・10・11。L-060）。

## ファイル構成

| ファイル | 責務 | 作成・変更タスク |
| :--- | :--- | :--- |
| `client/src/domain/nodes/nodePlacement.ts` | `createParentNode` を足す | 1 |
| `client/src/domain/nodes/nodeParentInsertion.ts` | 型、`canInsertParentNode`、`insertParentNode` | 1 |
| `client/src/domain/nodes/nodeParentInsertionMessages.ts` | `formatNodeParentInsertionFailureNotice` | 2 |
| `client/src/hooks/useRevisionScopedNotice.ts` | `clearNotice` を足す | 2 |
| `client/src/hooks/useNodes.ts` | `insertParentNode`（1回の commit と N の選択） | 3 |
| `client/src/types/nodeLabelEditRequest.ts` | 型 `NodeLabelEditRequest` | 4 |
| `client/src/hooks/useNodeParentInsertionAction.ts` | ボタンの状態、挿入の要求、通知、ラベルの編集の要求 | 4 |
| `client/src/components/layout/NodeParentInsertControl.tsx` | ヘッダーの「親を挿入」 | 5 |
| `client/src/components/map/treeEditShortcutGuard.ts` | 目印のコメントだけ直す | 5 |
| `client/src/components/map/nodeParentInsertionShortcut.ts` | `NodeParentInsertionShortcutInput`、`resolveNodeParentInsertionShortcut` | 6 |
| `client/src/components/map/useNodeParentInsertionShortcut.ts` | `window` の `keydown` の登録 | 6 |
| `client/src/components/map/useNodeKeyboardShortcuts.ts` | `Alt` を含む `Enter` で兄弟を足さない | 7 |
| `client/src/components/map/NodeLabelEditor.tsx` | リピートの `Enter` で確定しない | 7 |
| `client/src/components/map/useNodeLabelEditRequest.ts` | 要求を受けて `startEditing(nodeId, "")` | 8 |
| `client/src/components/map/MapStage.tsx` | 必須の props `onInsertParentNode`・`labelEditRequest`、2つのフックの呼び出し | 9 |
| `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx` | 新しい必須の props を渡す | 9 |
| `client/src/components/map/MapEditor.tsx` | `useNodeParentInsertionAction` と `MapStage` への配線（Task 9）、ヘッダーのボタン（Task 10） | 9, 10 |
| `client/src/components/layout/LayoutModeOperationHint.tsx` | 操作ヒントの文言 | 10 |
| `client/src/app/__tests__/pageParentInsertion.test.tsx` | `Home` からの結合テスト | 11 |
| `docs/specifications/features.md`、`docs/specifications/data-model.md` | 仕様 | 12 |
| `docs/architecture/overview.md`、`README.md`、`client/README.md`、`docs/README.md`、`docs/testing/browser-test-cases.md` | 構成・案内・手動テスト | 13 |
| `ROADMAP.md` | Phase 14 の「途中への親ノード挿入」の完了、現在地、最終更新 | 14 |

テストは各ソースと同じ階層の `__tests__/` に置く（例: `client/src/domain/nodes/__tests__/nodeParentInsertion.test.ts`）。

## 既存のテストへの影響と対処するタスク

| 影響 | 内容 | 対処するタスク |
| :--- | :--- | :--- |
| `useRevisionScopedNotice` の戻り値 | `clearNotice` を足すだけ。既存の `useRevisionScopedNotice.test.tsx` と呼び出し元は変更なしで通ること | 2 |
| `useNodeKeyboardShortcuts` | 既存のテスト（修飾キーなしの `Tab`・`Enter`・`Delete`・`Backspace`）は変更なしで通ること | 7 |
| `NodeLabelEditor` | 既存のテスト（`repeat` の無い `Enter`・`Escape`・`blur`）は変更なしで通ること | 7 |
| `MapStage` の必須の props | `MapStage.test.tsx`（`defaultProps` と、`defaultProps` を使わずに `<MapStage` を描く3か所。`onChangeNodeIndent={() => {}}` がある行の隣）、`MapStageVisibility.test.tsx`・`MapStageContextMenu.test.tsx` の `defaultProps`、`MapStageHistory.test.tsx` の `<MapStage`（1か所）、`AutoLayoutMapStageHarness.tsx` に `onInsertParentNode` と `labelEditRequest` を足す | 9 |
| ヘッダーの `getByRole` | 新しいボタン（名前「選択中のノードに親を挿入」）が、既存のテストの正規表現の名前に一致しないこと | 10 |
| 操作ヒント | `LayoutModeOperationHint.test.tsx` の期待の文言を新しい文言に直す | 10 |
| 文書の「4つのボタン」・8系統目の名前 | `features.md` の 11.1・11.4・14.6・14.7・15.6・15.7 など | 12, 13 |

## 進め方

開始前に `git status` と worktree を確認し、既存のユーザー変更を reset しない。各タスクは「テスト追加 → 対象テストの RED を確認 → 実装 → 対象テストの GREEN → `cd client && npm run typecheck && npm run lint`」の順で進め、別のサブエージェントで仕様・品質を確認する。テストのコマンドは `client` ディレクトリで実行する（`npm test -- --runInBand <ファイル名>`）。ファイルのパスはリポジトリ相対。テストの期待値は実装の定数を import せずリテラルで書く（例: `100`、`"親ノードを挿入できませんでした。"`。ただし目印の属性はテストでも `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE` を import する）。テストを書いた後、各タスクの「変異」に挙げた近い誤りを1つずつ実装へ当て、対象のテストが失敗することを確かめてから元に戻し、結果（どの変異で何件落ちたか）をタスクの報告に書く（L-616）。

テストで使うノードは `createTestNode`（`client/src/testing/createTestNode.ts`。既定は `{ id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "", importance: "medium" }`）で作る。

例で使う ID とラベル（Task 1・3 で共通）: R = 1（ラベル「R」）、A = 2（「A」）、B = 3（「B」）、T = 4（「T」）、A1 = 5（「A1」）、Tc = 6（「Tc」）、H = 7（「H」、隠れた兄弟）、R2 = 8（「R2」）、A2 = 9（「A2」）、Tc2 = 10（「Tc2」）。純関数のテストで渡す新しい ID は N = 50。

---

### Task 1: 新しい親の値と挿入の規則（createParentNode・nodeParentInsertion）

**Files**
- Modify: `client/src/domain/nodes/nodePlacement.ts`（`createParentNode` を足す）
- Modify: `client/src/domain/nodes/__tests__/nodePlacement.test.ts`（`createParentNode` の describe を足す）
- Create: `client/src/domain/nodes/nodeParentInsertion.ts`
- Create: `client/src/domain/nodes/__tests__/nodeParentInsertion.test.ts`
- 読む: 設計書の「挿入の規則」「手動配置の座標」「自動配置と先頭のルート」節

**Interfaces**
- Consumes: 既存の `calculateIndentTranslation(nodes: readonly Node[], nodeId: number, newParentId: number): BranchTranslation | null` と `translateBranch(nodes: readonly Node[], rootId: number, translation: BranchTranslation): Node[] | null`（`@/domain/nodes/nodeIndentPlacement`。`calculateIndentTranslation` は新しい親の右端 + 120 を `rootX`、新しい親の既存の子（`parentId === newParentId`）の下端の最大 + 40 か、子が無ければ新しい親の `y` を `rootY` にし、`dx`・`dy` を求める。`translateBranch` は根を `(rootX, rootY)` に置き、`collectSubtreeIds` の子孫を `(dx, dy)` だけ動かす）。`nodePlacement.ts` の非公開の `createNode(id, parentId, x, y)`（`width: RECT_WIDTH, height: RECT_HEIGHT, label: "", importance: DEFAULT_NODE_IMPORTANCE`）。`Node`（`@/types/node`）、`NodeLayoutMode`（`@/types/nodeLayout`、`"manual" | "auto"`）。テストだけで `buildNodeForestRelations(nodes): NodeForestRelations | null`（`@/domain/nodes/nodeLayoutForestRelations`。`{ nodes, roots, childrenByParent: ReadonlyMap<number, readonly Node[]> }`）と `layoutNodeForest(nodes): Node[] | null`（`@/domain/nodes/nodeAutoLayout`）。
- Produces:
  ```ts
  // nodePlacement.ts
  // T の親・座標・重要度を写し、大きさ・ラベルは新しいノードの既定値にする。illustration は持たない
  export function createParentNode(target: Node, id: number): Node;

  // nodeParentInsertion.ts
  export type NodeParentInsertionFailureReason =
    | "node-missing"       // T が無い
    | "node-hidden"        // T が見えていない
    | "invalid-structure"  // T の親が配列に無い、T が自分自身を親にしている
    | "id-conflict"        // 渡された新しい ID が既存のノードと重なる
    | "placement-failed";  // 手動配置の座標が求められない、自動配置の失敗
  export type NodeParentInsertionResult =
    | { ok: true; nodes: Node[]; insertedId: number }
    | { ok: false; reason: NodeParentInsertionFailureReason };
  // useNodes.insertParentNode の戻り値（hooks と messages の両方がここから import する）
  export type InsertParentNodeResult =
    | { ok: true; insertedId: number }
    | { ok: false; reason: NodeParentInsertionFailureReason };

  export function canInsertParentNode(
    nodes: readonly Node[], nodeId: number | null, visibleNodeIds: ReadonlySet<number>,
  ): boolean;
  export function insertParentNode(
    nodes: readonly Node[], nodeId: number, newNodeId: number,
    visibleNodeIds: ReadonlySet<number>, mode: NodeLayoutMode,
  ): NodeParentInsertionResult;
  ```

**実装の要点**
- `createParentNode(target, id)`: `return { ...createNode(id, target.parentId, target.x, target.y), importance: target.importance };`（`createNode` を通すので `illustration` は付かない）。
- `canInsertParentNode`: `nodeId === null` → `false`。`!visibleNodeIds.has(nodeId)` → `false`。`for (const node of nodes) if (node.id === nodeId) return true;` の後 `false`（1回の走査）。座標の失敗や親の不在は予測しない。
- `insertParentNode`:
  1. 検査（この順で最初に当たったものを返す）: `nodes` を1回走査して ID → 最初のノードの `Map` を作る（同じ ID が複数あれば最初のもの）。T = `map.get(nodeId)`。無い → `node-missing`。`!visibleNodeIds.has(T.id)` → `node-hidden`。`T.parentId === T.id`、または `T.parentId !== null && !map.has(T.parentId)` → `invalid-structure`。`map.has(newNodeId)` → `id-conflict`。祖先の鎖の長い循環は確かめない。
  2. `const parent = createParentNode(T, newNodeId);`
  3. 段階1: `staged: Node[]` を1回の走査で作る。`node === T` のとき `staged.push(parent, node)`（N を積んでから T をそのまま積む）、それ以外は `staged.push(node)`。
  4. `mode` を `switch` で分ける。`"manual"`: `const translation = calculateIndentTranslation(staged, T.id, newNodeId);` `null` → `placement-failed`。`"auto"`: 座標は計算しない。`default` には `const unreachable: never = mode;` を置く。
  5. 段階2: `reparented: Node[]` を `staged` の1回の走査で作る。`node === T` のとき `{ ...T, parentId: newNodeId }`、それ以外は同じオブジェクト。`"manual"`: `placed = translateBranch(reparented, T.id, translation)`、`null` → `placement-failed`。`"auto"`: `placed = reparented`。
  6. `{ ok: true, nodes: placed, insertedId: newNodeId }`。
- `staged` で座標を計算する理由をコメントに書く（「N に子が無い状態で計算する。T が N の子になった後の配列で呼ぶと、T 自身の下端の 40 下に置いてしまう」）。
- 先頭のルートの座標の引き継ぎは書かない（`createParentNode` が T の座標を写すことがその役目を果たす、とコメントに書く）。

- [ ] `nodePlacement.test.ts` に `createParentNode` のテストを足す:
  - T = `createTestNode({ id: 4, parentId: 1, x: 220, y: 100, width: 140, height: 116, label: "T", importance: "high", illustration: "data:image/png;base64,AAAA" })`。`createParentNode(T, 50)` が `{ id: 50, parentId: 1, x: 220, y: 100, width: 100, height: 60, label: "", importance: "high" }` と `toEqual`、かつ `"illustration" in result` が `false`。T が変わらない（呼ぶ前の `structuredClone(T)` と `toEqual`）。
  - `importance: "low"` の T で結果の `importance` が `"low"`。
  - ルートの T（`parentId: null`）で結果の `parentId` が `null`。
  - 変異: 重要度に既定値を入れる、T の `width`・`height` を写す、`x` と `y` を取り違える、のそれぞれで落ちる。
- [ ] `nodeParentInsertion.test.ts` を書く（ノードは `createTestNode`、ラベルは「進め方」の表。配列の検査は `result.nodes.map((n) => [n.id, n.parentId])`。座標を見ないテストは `mode: "auto"`。`all(nodes)` は全 ID の `Set` を返すヘルパー）:
  - `canInsertParentNode`（`[R(1), A(2, 1), T(4, 1)]`）: `nodeId: null` → `false`。`nodeId: 4`・全件見えている → `true`。`nodeId: 1`（ルート）→ `true`。`nodeId: 99`・表示集合に 99 を含めても → `false`。`nodeId: 4`・表示集合 `{1, 2}` → `false`。走査が1回: 配列を `Proxy` で包み、`get` のうち数値の添字への呼び出しの回数が `nodes.length` 以下。
  - 配列（例 P。1例1テスト）:
    - P1: `[R(1), A(2, 1), T(4, 1), B(3, 1)]`、T に挿入 → `[[1, null], [2, 1], [50, 1], [4, 50], [3, 1]]`、`insertedId: 50`。`buildNodeForestRelations(result.nodes)!.childrenByParent.get(1)` の ID が `[2, 50, 3]`、`get(50)` が `[4]`。
    - P2: `[R(1), T(4, 1), Tc(6, 4), A(2, 1)]` → `[[1, null], [50, 1], [4, 50], [6, 4], [2, 1]]`。
    - P3: `[R(1), Tc(6, 4), T(4, 1), A(2, 1)]` → `[[1, null], [6, 4], [50, 1], [4, 50], [2, 1]]`。
    - P4: `[R(1, null), T(4, null), R2(8, null)]` → `[[1, null], [50, null], [4, 50], [8, null]]`。`buildNodeForestRelations` の `roots` の ID が `[1, 50, 8]`。
    - P5: `[T(4, null), R2(8, null)]` → `[[50, null], [4, 50], [8, null]]`、`roots` が `[50, 8]`。
    - P6: `[R(1), H(7, 1), T(4, 1), B(3, 1)]`、表示集合 `{1, 4, 3}` → `[[1, null], [7, 1], [50, 1], [4, 50], [3, 1]]`。H が1件だけ残り、`childrenByParent.get(1)` が `[7, 50, 3]`（L-460）。
    - P7: `[R(1), T(4, 1), Tc(6, 4)]`、表示集合 `{1, 4}`（T が閉じて Tc が隠れている）→ 成功、`[[1, null], [50, 1], [4, 50], [6, 4]]`。
    - P8: `[R(1), T(4, 1)]`、表示集合 `{1}` → `{ ok: false, reason: "node-hidden" }`。
    - P9: `[T(4, 99)]` → `{ ok: false, reason: "invalid-structure" }`。
  - 同一性: P2 で R・Tc・A が入力と同じオブジェクト（`toBe`）、T' は入力の T と別のオブジェクトで `{ ...T, parentId: 50 }` と `toEqual`。入力の配列と各ノードが変わらない（呼ぶ前の `structuredClone(nodes)` と `toEqual`）。
  - 失敗: `nodeId: 77` → `node-missing`。`[T(4, 4)]`（自分自身が親）→ `invalid-structure`。P1 の入力で `newNodeId: 2` → `id-conflict`。検査の順: P8 の入力で `newNodeId: 1`（隠れていて ID も重なる）→ `node-hidden`。`[T(4, 99), A(2, null)]` で `newNodeId: 2` → `invalid-structure`（ID の重なりより先）。
  - N の値（L-616）: P1 の T を `createTestNode({ id: 4, parentId: 1, x: 220, y: 100, width: 140, height: 116, label: "T", importance: "high", illustration: "data:image/png;base64,AAAA" })` にして `mode: "auto"` → N（`id === 50`）が `{ id: 50, parentId: 1, x: 220, y: 100, width: 100, height: 60, label: "", importance: "high" }` と `toEqual`、`"illustration" in N` が `false`。T' の `width`・`height`・`illustration`・`importance` は入力と同じ。`importance: "low"` の T でも N が `"low"`。P4 で N の `parentId` が `null`。
  - 手動配置（例 M。ノードはすべて幅 100・高さ 60。指定のないものは `createTestNode` の既定）:
    - M1: R(1, null, 0, 0)、A(2, 1, 220, 0)、T(4, 1, 220, 100)、B(3, 1, 220, 200)、Tc(6, 4, 440, 100)。`mode: "manual"` → N (220, 100)、T (440, 100)、Tc (660, 100)。R・A・B は入力と同じオブジェクト（`toBe`）。
    - M1 で表示集合から Tc を外しても（`{1, 2, 4, 3}`）、Tc が (660, 100) に動く（閉じた T の隠れた子孫も動く）。
    - M2: M1 の T を幅 140・高さ 116 にする → N (220, 100) の幅 100・高さ 60、T (440, 100)、Tc (660, 100)。
    - M3: R(1, null, 0, 0)、A(2, 1, 220, 0)、A1(5, 2, 440, 0)、A2(9, 2, 440, 100)、T(4, 1, 220, 100) → T (440, 100)（A2 と同じ位置。重なりを避けない）。A1・A2 は入力と同じオブジェクト。
    - M4: R(1, null, 0, 0)、T(4, 1, 220, 100)、Tc(6, 4, 440, 50)、Tc2(10, 4, 440, 150) → T (440, 100)、Tc (660, 50)、Tc2 (660, 150)。
    - M5a: R(1, null, 0, 0)、T(4, 1, 1e19, 100) → `{ ok: false, reason: "placement-failed" }`。
    - M5b: R(1, null, -220, 0)、T(4, 1, 0, 0)、Tc(6, 4, `Number.MAX_VALUE`, 0) → `{ ok: false, reason: "placement-failed" }`（結果に `nodes` が無い。`toEqual` で確かめる）。
    - M6: R(1, null, 0, 0)、T(4, 1, 220, `NaN`) → `placement-failed`。T(4, 1, `NaN`, 100) → `placement-failed`。
  - 自動配置と先頭のルート（L-616: 入力の座標を配置の結果と違う値にする）:
    - R(1, null, 30, 40)、A(2, 1, 500, 500)、T(4, 1, 37, -80)、Tc(6, 4, 9, 9) で `mode: "auto"` → 全ノード（N を除く）の `x`・`y` が入力と同じ、N が (37, -80)。
    - T が先頭のルート: `[T(4, null, 30, 40), Tc(6, 4, 0, 0), R2(8, null, 500, 500)]`、`mode: "auto"` → `layoutNodeForest(result.nodes)!` の中の id 50 の `x`・`y` が (30, 40)。
    - T が先頭でない: `[R(1, null, 30, 40), A(2, 1, 0, 0), T(4, 1, 0, 0)]`、`mode: "auto"` → `result.nodes[0]` が入力の R と同じオブジェクト（`toBe`）、`layoutNodeForest(result.nodes)!` の id 1 の `x`・`y` が (30, 40)。
- [ ] RED: `npm test -- --runInBand nodePlacement.test.ts nodeParentInsertion.test.ts`（関数が無いため失敗）。
- [ ] 実装し、GREEN。`npm run typecheck && npm run lint`。
- [ ] 変異（各々で落ちることを確かめて戻す）: N を配列の末尾に足す（P1 の `childrenByParent.get(1)` が `[2, 3, 50]` になる）。N を T の直後に積む（P1 の配列が `[1, 2, 4, 50, 3]`）。`calculateIndentTranslation` を `reparented` に対して呼ぶ（M1 で T の `y` が 200 になる）。`mode` を `"manual"` に固定する（自動配置のテストで T の `x` が 257 になる）。`id-conflict` の検査を消す。検査の順を入れ替える（`node-hidden` と `id-conflict`）。
- 知見: L-002、L-035、L-460、L-524、L-541、L-616。
- 完了条件: 全ケースが通る。`splice`・`indexOf` を使っていない。`grep -n "CHILD_HORIZONTAL_GAP" client/src/domain/nodes/nodeParentInsertion.ts` が空（式を新しく書いていない）。

### Task 2: 失敗の通知の文言と、通知の枠を空にする操作

**Files**
- Create: `client/src/domain/nodes/nodeParentInsertionMessages.ts`
- Create: `client/src/domain/nodes/__tests__/nodeParentInsertionMessages.test.ts`
- Modify: `client/src/hooks/useRevisionScopedNotice.ts`
- Modify: `client/src/hooks/__tests__/useRevisionScopedNotice.test.tsx`（テストを足すだけ）

**Interfaces**
- Consumes: Task 1 の `NodeParentInsertionFailureReason`。既存の `OperationNotice`（`@/types/operationNotice`、`{ kind: "status" | "warning" | "error"; message: string }`）。既存の `useRevisionScopedNotice(documentRevision)`（`{ notice, publishNotice }` を返す。通知は次の `publishNotice` か `documentRevision` の変化まで残る）。
- Produces:
  ```ts
  // nodeParentInsertionMessages.ts
  export function formatNodeParentInsertionFailureNotice(
    reason: NodeParentInsertionFailureReason,
  ): OperationNotice;

  // useRevisionScopedNotice.ts の戻り値（clearNotice を足す）
  export function useRevisionScopedNotice(documentRevision: number): {
    notice: OperationNotice | null;
    publishNotice: (notice: OperationNotice) => void;
    clearNotice: () => void; // 枠を空にする。参照は描画をまたいで変わらない
  };
  ```

**実装の要点**
- `formatNodeParentInsertionFailureNotice`: `switch (reason)` で5つの理由を列挙し、すべて `{ kind: "error", message: "親ノードを挿入できませんでした。" }` を返す。`default` に `const unreachable: never = reason;` を置く。
- `useRevisionScopedNotice`: `const clearNotice = useCallback(() => { setStored(null); }, []);` を足し、`return { notice, publishNotice, clearNotice };`。コメント「成功した操作の後に、前の通知を残さないために枠を空にする」。

- [ ] `nodeParentInsertionMessages.test.ts`: `it.each(["node-missing", "node-hidden", "invalid-structure", "id-conflict", "placement-failed"] as const)` で、それぞれ `{ kind: "error", message: "親ノードを挿入できませんでした。" }` と `toEqual`。
- [ ] `useRevisionScopedNotice.test.tsx` に足す:
  - `publishNotice(STATUS)` の後に `clearNotice()` → `notice` が `null`。続けて `publishNotice(ERROR)` → `notice` が `ERROR`。
  - `clearNotice` の参照が、`documentRevision` を 0 → 1 に変えた `rerender` の前後で同じ（`toBe`）。
- [ ] RED: `npm test -- --runInBand nodeParentInsertionMessages.test.ts useRevisionScopedNotice.test.tsx`。
- [ ] 実装し、GREEN。既存の `useRevisionScopedNotice.test.tsx` のテストは変更しない。`npm run typecheck && npm run lint`。
- 知見: L-001、L-166。
- 完了条件: 全ケースが通る。`clearNotice` はまだどこからも使われない（Task 9 で配線する）。

### Task 3: useNodes.insertParentNode（1回の commit と N の選択）

**Files**
- Modify: `client/src/hooks/useNodes.ts`
- Create: `client/src/hooks/__tests__/useNodesParentInsertion.test.ts`

**Interfaces**
- Consumes: Task 1 の `insertParentNode`（domain）、`InsertParentNodeResult`。既存の `applyTreeChange`（`useNodeLayoutState` が返す。コールバック `(currentNodes, mode) => Node[] | null` を受け、`null` なら何も変えず `false`、自動配置なら候補を `layoutNodeForest` に通して失敗なら `false`、成功なら1回 commit して `true`）、`nodeIdAllocatorRef.current!.nextAvailableId(currentNodes)`（既存の ID と重ならない ID を返す）、`setSelectedNodeId`。テストだけで Task 1 の `createParentNode`。
- Produces（`UseNodesReturn` に追加。型は `useNodes.ts` から再 export しない）:
  ```ts
  // 選択中のノードと親の間に新しいノードを入れる。applyTreeChange を1回だけ呼び、成功時は新しいノードを選択する。
  // documentRevision は変えない。失敗時は何も変えない
  insertParentNode: (
    nodeId: number,
    visibleNodeIds: ReadonlySet<number>,
  ) => InsertParentNodeResult;
  ```

**実装の要点**
- import: `import { insertParentNode as computeParentInsertion, type InsertParentNodeResult } from "@/domain/nodes/nodeParentInsertion";`
  ```ts
  // 新しい ID は確定時点の最新の配列から採番する。確定しなかった ID は欠番のままにする。
  // 挿入は編集中の折りたたみや通知を保つため、documentRevision を上げない
  const insertParentNode = useCallback((
    nodeId: number,
    visibleNodeIds: ReadonlySet<number>,
  ): InsertParentNodeResult => {
    let outcome: InsertParentNodeResult | null = null;
    const applied = applyTreeChange((currentNodes, mode) => {
      const id = nodeIdAllocatorRef.current!.nextAvailableId(currentNodes);
      const inserted = computeParentInsertion(currentNodes, nodeId, id, visibleNodeIds, mode);
      if (!inserted.ok) {
        outcome = inserted;
        return null;
      }
      outcome = { ok: true, insertedId: inserted.insertedId };
      return inserted.nodes;
    });
    // 候補を作れた後に失敗するのは、全体の自動配置だけ
    const settled = outcome as InsertParentNodeResult | null;
    if (applied && settled?.ok) {
      setSelectedNodeId(settled.insertedId);
      return settled;
    }
    if (settled === null || settled.ok) return { ok: false, reason: "placement-failed" };
    return settled;
  }, [applyTreeChange]);
  ```
- `changeNodeIndent` の直後に置き、戻り値のオブジェクトの `changeNodeIndent` の直後に `insertParentNode` を足す。`setDocumentRevision` は呼ばない。ラベルの編集と通知はここでは扱わない。

- [ ] `useNodesParentInsertion.test.ts` を書く（`useNodesIndent.test.ts` と同じ構成: `renderHook(() => useNodes())`、`act(() => result.current.replaceMap(state))`、`jest.mock("@/domain/nodes/nodeAutoLayout", …)` で `layoutNodeForest` を `jest.fn(actual.layoutNodeForest)` に包む。ノードは幅 100・高さ 60、ラベルは「進め方」の表）。新しい ID は採番器が決めるので、テストでは戻り値の `insertedId` を使い、値を決め打ちしない:
  - 手動配置の成功: `manualMap()` = R(1, null, 0, 0)、A(2, 1, 220, 0)、T(4, 1, 220, 100、`importance: "high"`)、B(3, 1, 220, 200)、Tc(6, 4, 440, 100)。`selectNode(2)` の後、`insertParentNode(4, new Set([1, 2, 4, 3, 6]))` → `{ ok: true, insertedId: X }`（X は 1・2・3・4・6 のどれとも違う）。ノードの ID の並びが `[1, 2, X, 4, 3, 6]`。X のノードが `{ id: X, parentId: 1, x: 220, y: 100, width: 100, height: 60, label: "", importance: "high" }`、T の `parentId` が X で (440, 100)、Tc が (660, 100)。`selectedNodeId` が X。`documentRevision` が挿入の前と同じ。
  - 自動配置の成功: `{ layoutMode: "auto", nodes: [R(1, null, 30, 40), A(2, 1, 500, 500), T(4, 1, 37, -80)] }` を `replaceMap` した後の `result.current.nodes` を `before` に控え、`insertParentNode(4, 全件)` → 成功。`result.current.nodes` が `layoutNodeForest([before[0], before[1], createParentNode(before[2], X), { ...before[2], parentId: X }])` と `toEqual`。R の `x`・`y` が `before[0]` と同じ。
  - 1回の commit: `replaceMap(manualMap())` の直後に挿入 → `undo()` が1回目 `true`、`result.current.nodes` が `manualMap().nodes` と `toEqual`。`redo()` で挿入の直後の配列と `toEqual`。2回目の `undo()` は `false`。
  - 失敗で何も変わらない（L-001）。各ケースで、事前に `updateNodeLabel(1, "変更")` → `undo()` で `canRedo === true` にし（id 1 はどのマップにもある。`useNodesIndent.test.ts` の失敗のテストと同じ形）、`selectNode(1)` した後に失敗させ、`nodes`（`toBe` で同じ配列）・`selectedNodeId`（1）・`canUndo`・`canRedo`（`true`）が変わらない:
    - 表示集合 `{1, 2, 3, 6}` で T に挿入 → `{ ok: false, reason: "node-hidden" }`。
    - `replaceMap({ layoutMode: "manual", nodes: [R(1, null, 0, 0), T(4, 99, 220, 0)] })` で T に挿入 → `invalid-structure`。
    - 手動配置で T の `x` が `1e19`（R(1, null, 0, 0)、T(4, 1, 1e19, 100)）→ `placement-failed`。
    - 自動配置: `jest.mocked(layoutNodeForest).mockImplementationOnce(() => null)` の後に挿入 → `{ ok: false, reason: "placement-failed" }`。
  - 最新の配列で解決する（L-035）: 手動配置で R(1, null, 0, 0)、A(2, 1, 220, 0) だけのマップ。同じ `act` の中で `const created = result.current.addSiblingNode(2)!; outcome = result.current.insertParentNode(created, new Set([1, 2, created]));` → `outcome.ok` が `true`。`act` の後、`created` のノードの `parentId` が `outcome.insertedId`、`insertedId` のノードの `parentId` が 1。描画時の古い `nodes` で判定する変異では `node-missing` になって落ちる。
  - 続けて2回: `manualMap()` で `insertParentNode(4, 全件)` を2回（2回目の表示集合には1回目の ID を足す）→ 全ノードの ID が異なる（`new Set(ids).size === ids.length`）、2回目の N の `parentId` が1回目の N の ID、T の `parentId` が2回目の N の ID。
- [ ] RED: `npm test -- --runInBand useNodesParentInsertion.test.ts`。
- [ ] 実装し、GREEN と `npm test -- --runInBand useNodes`（既存の `useNodes*.test.ts` が変更なしで通る）。`npm run typecheck && npm run lint`。
- [ ] 変異: `setSelectedNodeId` を呼ばない、`applyTreeChange` が `false` のときに控えた成功を返す、T の解決を `applyTreeChange` の外（描画時の `nodes`）で行う（L-035 のテストで `node-missing` になって落ちる）、のそれぞれで落ちる。採番を `applyTreeChange` の外で行う変異は、採番器が単調増加で既存の ID と重ならないため等価変異になるので一覧に入れない。
- 知見: L-001、L-035、L-037（`documentRevision` を上げない理由）。
- 完了条件: 全ケースが通る。

### Task 4: ラベルの編集の要求の型と useNodeParentInsertionAction

**Files**
- Create: `client/src/types/nodeLabelEditRequest.ts`
- Create: `client/src/hooks/useNodeParentInsertionAction.ts`
- Create: `client/src/hooks/__tests__/useNodeParentInsertionAction.test.tsx`
- 読む: 設計書の「useNodeParentInsertionAction の入出力」節

**Interfaces**
- Consumes: Task 1 の `canInsertParentNode`、`InsertParentNodeResult`。Task 2 の `formatNodeParentInsertionFailureNotice`、`clearNotice` の型 `() => void`。Task 3 の `insertParentNode` の型。既存の `OperationNotice`、`Node`。
- Produces:
  ```ts
  // types/nodeLabelEditRequest.ts（NodeFocusRequest と同じ形）
  export type NodeLabelEditRequest = {
    nodeId: number;
    sequence: number;          // 要求ごとに 1 ずつ増える
    documentRevision: number;  // 要求を出した時点の世代
  };

  // hooks/useNodeParentInsertionAction.ts
  export type UseNodeParentInsertionActionOptions = {
    selectedNodeId: number | null;
    nodes: readonly Node[];                 // 正本（useNodes の nodes）
    visibleNodeIds: ReadonlySet<number>;    // displayState.visibleNodeIds
    documentRevision: number;
    insertParentNode: (
      nodeId: number,
      visibleNodeIds: ReadonlySet<number>,
    ) => InsertParentNodeResult;
    publishNotice: (notice: OperationNotice) => void; // 枝の構造の変更の通知の枠
    clearNotice: () => void;                          // 同じ枠を空にする
  };
  export type UseNodeParentInsertionActionReturn = {
    canInsert: boolean;
    insertSelected: () => void;                    // ヘッダーのボタン用。未選択なら何もしない
    insert: (nodeId: number) => void;              // MapStage の onInsertParentNode に渡す
    labelEditRequest: NodeLabelEditRequest | null; // MapStage の labelEditRequest に渡す
  };
  export function useNodeParentInsertionAction(
    options: UseNodeParentInsertionActionOptions,
  ): UseNodeParentInsertionActionReturn;
  ```

**実装の要点**
- `canInsert = useMemo(() => canInsertParentNode(nodes, selectedNodeId, visibleNodeIds), [nodes, selectedNodeId, visibleNodeIds])`（3つすべてを依存に入れる。L-612）。
- `const [storedRequest, setStoredRequest] = useState<NodeLabelEditRequest | null>(null);`
- `insert(nodeId)`（`useCallback`、依存 `insertParentNode`・`visibleNodeIds`・`documentRevision`・`publishNotice`・`clearNotice`）:
  1. `const result = insertParentNode(nodeId, visibleNodeIds);`（受け取った集合をそのまま渡す）。
  2. `if (result.ok)`: `clearNotice();` の後 `setStoredRequest((previous) => ({ nodeId: result.insertedId, sequence: (previous?.sequence ?? 0) + 1, documentRevision }));`。
  3. それ以外: `publishNotice(formatNodeParentInsertionFailureNotice(result.reason));`。要求は変えない。
- `insertSelected()`（`useCallback`、依存 `selectedNodeId`・`insert`）: `selectedNodeId === null` なら何もしない。それ以外は `insert(selectedNodeId)`。
- `labelEditRequest = storedRequest !== null && storedRequest.documentRevision === documentRevision ? storedRequest : null`（`useNodeSearchNavigation` の `focusRequest` と同じ。L-037）。
- フックの先頭に「親の挿入のボタンの有効・無効を持ち、成功したときだけ通知の枠を空にしてラベルの編集を要求し、失敗したときだけ通知を1回発行する」とコメントを書く。

- [ ] `useNodeParentInsertionAction.test.tsx` を書く（`renderHook` と `rerender`。`insertParentNode` は `jest.fn<InsertParentNodeResult, [number, ReadonlySet<number>]>()`、`publishNotice`・`clearNotice` は `jest.fn()`。ノードは `[R(1), A(2, 1), T(4, 1)]`、表示集合は全件、`documentRevision: 3`）:
  - `canInsert`: 1つの `renderHook` の中で、基準の入力（`selectedNodeId: 4`、`nodes` は上の配列 `baseNodes`、`visibleNodeIds` は集合 `baseVisible = new Set([1, 2, 4])`）で `true`。入力を1つだけ変えて `rerender` し、ほかの2つの入力は基準と同じ参照（同じ `baseNodes`・`baseVisible` のオブジェクト）のまま渡す。各入力について、基準へ戻す `rerender`（`true` に戻ることを確かめる）の後に次の入力を変える: (a) `selectedNodeId: null` → `false` → 基準へ戻して `true`。(b) `visibleNodeIds: new Set([1, 2])` → `false` → 基準へ戻して `true`。(c) `nodes: [R, A]` → `false`。`useMemo` の依存から `selectedNodeId`・`visibleNodeIds`・`nodes` のどれを外す変異でも、対応する手順で古い `true` が残って落ちる。
  - `insertSelected`: `selectedNodeId: 4` で `insertParentNode` が `(4, visibleNodeIds)` で1回、第2引数が渡した集合と同じオブジェクト（`toBe`）。`selectedNodeId: null` では `insertParentNode`・`publishNotice`・`clearNotice` のどれも呼ばれない。
  - `insert(2)` が `insertParentNode` を `(2, visibleNodeIds)` で呼ぶ。
  - 成功: `insertParentNode.mockReturnValueOnce({ ok: true, insertedId: 50 })` で `insert(4)` → `clearNotice` が1回、`publishNotice` が0回、`labelEditRequest` が `{ nodeId: 50, sequence: 1, documentRevision: 3 }`。`insertParentNode` → `clearNotice` の順（`mock.invocationCallOrder`）。続けて `{ ok: true, insertedId: 51 }` → `{ nodeId: 51, sequence: 2, documentRevision: 3 }`。
  - 失敗（L-001）: 成功で要求を作った後、`{ ok: false, reason: "placement-failed" }` → `publishNotice` が `{ kind: "error", message: "親ノードを挿入できませんでした。" }` で1回、`clearNotice` は成功の分の1回のまま、`labelEditRequest` が前の要求と同じオブジェクト（`toBe`）。最初から失敗（`node-hidden`）させたときは `labelEditRequest` が `null` のまま。
  - 世代: 成功で要求を作った後、`documentRevision: 4` で `rerender` → `labelEditRequest` が `null`。
- [ ] RED: `npm test -- --runInBand useNodeParentInsertionAction.test.tsx`。
- [ ] 実装し、GREEN。`npm run typecheck && npm run lint`。
- [ ] 変異: 成功で `clearNotice` を呼ばない、失敗でも要求を更新する、`labelEditRequest` の世代の比較を外す、`sequence` を増やさない、のそれぞれで落ちる。
- 知見: L-001、L-037、L-166、L-612。
- 完了条件: 全ケースが通る。フックはまだどこからも使われない（Task 9 で配線する）。

### Task 5: ヘッダーの「親を挿入」ボタン（NodeParentInsertControl）

**Files**
- Create: `client/src/components/layout/NodeParentInsertControl.tsx`
- Create: `client/src/components/layout/__tests__/NodeParentInsertControl.test.tsx`
- Modify: `client/src/components/map/treeEditShortcutGuard.ts`（目印のコメントだけ）

**Interfaces**
- Consumes: 既存の `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE`（`@/components/map/treeEditShortcutGuard`）。見た目は `client/src/components/layout/NodeIndentControl.tsx` の `buttonClassName` と同じ文字列。
- Produces:
  ```ts
  export type NodeParentInsertControlProps = {
    canInsert: boolean;
    onInsert: () => void;
  };
  // 戻り値の型は書かない（既存の NodeIndentControl に合わせる）
  export function NodeParentInsertControl({ canInsert, onInsert }: NodeParentInsertControlProps);
  ```

**実装の要点**
- `<button type="button">` を1つだけ描く（`role="group"` で囲まない）。クラスは `NodeIndentControl` の `buttonClassName` と同じ文字列（ファイル内の定数として書く）。
- 表示 `親を挿入`、`aria-label="選択中のノードに親を挿入"`、`aria-keyshortcuts="Alt+Enter"`、`title="選択中のノードに親を挿入（Alt/Option+Enter）"`、`disabled={!canInsert}`、`onClick={onInsert}`、`{ [TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE]: "" }`。
- `onKeyDown`: `event.key === "Enter" && event.repeat` なら `preventDefault`（Space は止めない）。コメント「成功するとフォーカスは入力欄へ移るので、そこへ届くリピートは NodeLabelEditor が止める。2つの対策は組で働く」。
- `onClick` で `event.detail` を見ない（L-150）。`pointerdown` の既定の動作を止めない（編集中のラベルを `blur` で確定してから挿入するため）。フォーカスを操作しない。
- `treeEditShortcutGuard.ts` の目印のコメントを「兄弟の順序・階層・親の挿入のボタンに付ける目印。このボタンはショートカットを案内しているので、フォーカスがあっても Alt+↑/↓/←/→/Enter を止めない」に直す（コードは変えない）。

- [ ] テストを書く（`NodeIndentControl.test.tsx` と同じ構成）:
  - 名前と属性: `getByRole("button", { name: "選択中のノードに親を挿入" })` の `textContent` が `"親を挿入"`、`aria-keyshortcuts` が `"Alt+Enter"`、`title` が `"選択中のノードに親を挿入（Alt/Option+Enter）"`、`type` が `"button"`。`queryByRole("group")` が `null`。
  - クリック: 有効なとき `userEvent.click` で `onInsert` が1回。`fireEvent.click(button, { detail: 0 })` と `fireEvent.click(button, { detail: 2 })` でもそれぞれ呼ばれる。`userEvent.dblClick` で2回（L-150）。
  - 無効（L-058）: `canInsert: false` で `disabled` 属性が付き、`userEvent.click` で `onInsert` が呼ばれない。
  - Enter の押し続け（L-408）: `fireEvent.keyDown(button, { key: "Enter", repeat: true })` の戻り値が `false`、`{ key: "Enter", repeat: false }` と `{ key: " ", repeat: true }` は `true`。
  - 目印: ボタンに `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE` が付く。`fireEvent.keyDown(button, { key: "Enter", altKey: true })` で `onInsert` が呼ばれず、戻り値が `true`。
  - `fireEvent.pointerDown(button)` の戻り値が `true`。
- [ ] RED: `npm test -- --runInBand NodeParentInsertControl.test.tsx`。
- [ ] 実装し、GREEN と `npm test -- --runInBand treeEditShortcutGuard.test.ts`（変更なしで通る）。`npm run typecheck && npm run lint`。
- 知見: L-058、L-150、L-408、L-522。
- 完了条件: 部品はまだどこからも描画されない（Task 10 で配線する）。

### Task 6: ショートカットの判定と登録（Alt/Option+Enter）

**Files**
- Create: `client/src/components/map/nodeParentInsertionShortcut.ts`、`client/src/components/map/__tests__/nodeParentInsertionShortcut.test.ts`
- Create: `client/src/components/map/useNodeParentInsertionShortcut.ts`、`client/src/components/map/__tests__/useNodeParentInsertionShortcut.test.tsx`

**Interfaces**
- Consumes: 既存の `TreeEditShortcutInput`、`passesTreeEditShortcutGuard(input): boolean`（既定動作が止められていない・IME でない・`Alt` だけ・ラベル編集中でない・目印のあるボタン以外の対話要素でない・選択している・ジェスチャー中でない）、`createTreeEditShortcutInput(event, { isEditing, selectedNodeId, hasActiveGesture }): TreeEditShortcutInput`、`TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE`（すべて `@/components/map/treeEditShortcutGuard`）。手本は `client/src/components/map/useNodeIndentShortcut.ts`。
- Produces:
  ```ts
  // nodeParentInsertionShortcut.ts
  export type NodeParentInsertionShortcutInput = TreeEditShortcutInput & { repeat: boolean };
  export type NodeParentInsertionShortcutAction = "insert" | "suppress";
  export function resolveNodeParentInsertionShortcut(
    input: NodeParentInsertionShortcutInput,
  ): NodeParentInsertionShortcutAction | null;

  // useNodeParentInsertionShortcut.ts
  export type UseNodeParentInsertionShortcutOptions = {
    selectedNodeId: number | null;
    isEditing: boolean;
    hasActiveGesture: () => boolean;   // keydown の時点で呼ぶ
    enabled: boolean;
    onInsertParentNode: (nodeId: number) => void;
  };
  export function useNodeParentInsertionShortcut(options: UseNodeParentInsertionShortcutOptions): void;
  ```

**実装の要点**
- `resolveNodeParentInsertionShortcut`: `passesTreeEditShortcutGuard(input)` が偽なら `null`。`input.key !== "Enter"` なら `null`。`input.repeat` なら `"suppress"`、それ以外 `"insert"`。
- `useNodeParentInsertionShortcut`: `useNodeIndentShortcut` と同じ形（最新の options を `useLayoutEffect` で ref に控え、`window` の `keydown` を `useEffect(…, [])` で1回だけ登録）。ハンドラ:
  1. `latest.enabled` が偽なら何もしない。
  2. `const input = { ...createTreeEditShortcutInput(event, { isEditing: latest.isEditing, selectedNodeId: latest.selectedNodeId, hasActiveGesture: latest.hasActiveGesture() }), repeat: event.repeat };`
  3. `const action = resolveNodeParentInsertionShortcut(input);` を `switch` で分ける: `"insert"` → `latest.selectedNodeId !== null` のとき `event.preventDefault()` してから `latest.onInsertParentNode(latest.selectedNodeId)`。`"suppress"` → `event.preventDefault()` だけ（コメント「押し続けでは挿入しない。目印のボタンの上でもボタンを押させない」）。`null` → 何もしない。`switch` は `action` が `null` の場合を `case null:` で書き、`default` で `const unreachable: never = action;`。

- [ ] `nodeParentInsertionShortcut.test.ts`（基準の入力: `key: "Enter", altKey: true`、他の修飾キー偽、`isComposing: false, keyCode: 13, defaultPrevented: false, target: document.body, isEditing: false, selectedNodeId: 1, hasActiveGesture: false, repeat: false`）:
  - 基準で `"insert"`、`repeat: true` で `"suppress"`。
  - `key: "ArrowRight"`・`"ArrowUp"`・`"Tab"` で `null`（`repeat: true` でも `null`）。
  - `it.each` で条件を1つ外す（`altKey: false`、`shiftKey: true`、`ctrlKey: true`、`metaKey: true`、`isComposing: true`、`keyCode: 229`、`defaultPrevented: true`、`isEditing: true`、`selectedNodeId: null`、`hasActiveGesture: true`、`target` が目印の無い `button`、`input`、`textarea`）→ `null`。同じ表で `repeat: true` にしても `null`（`"suppress"` にならない）。
  - 目印付きの `button`（`setAttribute(TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE, "")`）とその内側の `span` で `"insert"`。
- [ ] `useNodeParentInsertionShortcut.test.tsx`（`useNodeIndentShortcut.test.tsx` と同じく `renderHook` と `fireEvent.keyDown`）:
  - `selectedNodeId: 5`・`enabled: true` で `body` への `{ key: "Enter", altKey: true }` → `onInsertParentNode` が `(5)` で1回、`fireEvent.keyDown` の戻り値が `false`。
  - `repeat: true` → 呼ばれず、戻り値 `false`。
  - `enabled: false` → 選択中でも呼ばれず、戻り値 `true`。`rerender` で `enabled: true` に戻すと呼ばれる。
  - 登録をやり直さない: `jest.spyOn(window, "addEventListener")` で、`enabled`・`selectedNodeId`・`onInsertParentNode`・`hasActiveGesture` を変えて `rerender` しても `"keydown"` の登録が1回だけ。
  - `hasActiveGesture` を keydown の時点で呼ぶ: `let active = false; hasActiveGesture: () => active` で、描画の後に `active = true` にして送る → 呼ばれず、戻り値 `true`。
  - 未選択の `body` への `Alt+Enter` → 呼ばれず、戻り値 `true`。`<input>` に送った `Alt+Enter` → 呼ばれず、戻り値 `true`。`{ key: "Enter" }`（`Alt` なし）→ 呼ばれず、戻り値 `true`。
  - 目印付きの `<button>` に送った `Alt+Enter` → `(5)` で1回、戻り値 `false`。
- [ ] RED: `npm test -- --runInBand nodeParentInsertionShortcut.test.ts useNodeParentInsertionShortcut.test.tsx`。
- [ ] 実装し、GREEN。`npm run typecheck && npm run lint`。
- [ ] 変異: `repeat` を見ない（`"suppress"` の分岐を消す）、`"suppress"` で `preventDefault` しない、`enabled` の確認を消す、のそれぞれで落ちる。
- 知見: L-061、L-408、L-474、L-522。
- 完了条件: 全ケースが通る。フックはまだどこからも使われない（Task 9 で配線する）。

### Task 7: 既存のキー処理の変更（Alt を含む Enter・ラベルの入力欄のリピートの Enter）

**Files**
- Modify: `client/src/components/map/useNodeKeyboardShortcuts.ts`、`client/src/components/map/__tests__/useNodeKeyboardShortcuts.test.tsx`
- Modify: `client/src/components/map/NodeLabelEditor.tsx`、`client/src/components/map/__tests__/NodeLabelEditor.test.tsx`
- 読む: 設計書の「ラベルの入力欄のリピートの Enter」「既存の `Tab`・`Enter`」節

**Interfaces**
- Consumes: 既存の `useNodeKeyboardShortcuts`（`Tab` → `onAddChildNode`、`Enter` → `onAddSiblingNode`、`Delete`/`Backspace` → `onDeleteNode`。今は修飾キーとリピートを見ない）、`NodeLabelEditor`（`Enter` → `event.currentTarget.blur()` で確定、`Escape` → 取り消し。`actionHandledRef` で二重確定を防ぐ）。
- Produces: 公開の型・関数の変更なし（挙動だけを変える）。

**実装の要点**
- `useNodeKeyboardShortcuts.ts`: `} else if (event.key === "Enter") {` を `} else if (event.key === "Enter" && !event.altKey) {` にし、直前にコメント「Alt を含む Enter は親の挿入のショートカットに任せる。兄弟を足さず、既定動作も止めない」。`Tab`・`Delete`・`Backspace` と、`Ctrl`・`Cmd`・`Shift` だけと併用した `Enter` は変えない。
- `NodeLabelEditor.tsx` の `onKeyDown`: 先頭に `if (event.key === "Enter" && event.repeat) { event.preventDefault(); return; }` を置き、コメント「入力欄が開く前から押し続けていた Enter のリピートで確定しない（押し続けで追加と確定が繰り返されるのを防ぐ）」。`repeat` でない `Enter`（修飾キーによらない）と `Escape`、`handleBlur`、`actionHandledRef` は変えない（L-473）。

- [ ] `useNodeKeyboardShortcuts.test.tsx` に足す（ヘルパー `dispatchKeyWith(init: KeyboardEventInit)` を足し、`new KeyboardEvent("keydown", { cancelable: true, ...init })` を `window` に送る）:
  - `it.each` で `{ key: "Enter", altKey: true }`、`{ key: "Enter", altKey: true, ctrlKey: true }`、`{ key: "Enter", altKey: true, shiftKey: true }` → `onAddSiblingNode`・`onStartEditing` が呼ばれず、`defaultPrevented` が `false`。
  - `it.each` で `{ key: "Enter", shiftKey: true }`、`{ key: "Enter", ctrlKey: true }`、`{ key: "Enter", metaKey: true }` → `onAddSiblingNode` が `(1)` で呼ばれ、`onStartEditing` が `(3, "")`、`defaultPrevented` が `true`（既存の挙動を固定する）。
  - `{ key: "Tab", altKey: true }` → `onAddChildNode` が `(1)` で呼ばれる（変えていない）。
- [ ] `NodeLabelEditor.test.tsx` に足す:
  - `fireEvent.keyDown(input, { key: "Enter", repeat: true })` の戻り値が `false`、`onCommit` が呼ばれない、入力欄が残る。続けて `fireEvent.keyDown(input, { key: "Enter", repeat: false })` で `onCommit` が1回。
  - `fireEvent.keyDown(input, { key: "Enter", altKey: true })`（`repeat` なし）で `onCommit` が1回。
  - `fireEvent.keyDown(input, { key: "Escape", repeat: true })` で `onCancel` が1回（リピートの扱いは `Enter` だけ）。
- [ ] RED: `npm test -- --runInBand useNodeKeyboardShortcuts.test.tsx NodeLabelEditor.test.tsx`。
- [ ] 実装し、GREEN と `npm test -- --runInBand MapStage.test.tsx pageHistory.test.tsx`（変更なしで通る）。`npm run typecheck && npm run lint`。
- [ ] 変異: `!event.altKey` を `!(event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey)`（`Alt` だけで止める）に変えると `Ctrl+Alt+Enter`・`Alt+Shift+Enter` のテストで落ちる。リピートの分岐を消すと `NodeLabelEditor` のテストで落ちる。
- 知見: L-048、L-408、L-473。
- 完了条件: 全ケースが通り、既存のテストが変更なしで通る。

### Task 8: useNodeLabelEditRequest（要求を受けて編集を始める）

**Files**
- Create: `client/src/components/map/useNodeLabelEditRequest.ts`
- Create: `client/src/components/map/__tests__/useNodeLabelEditRequest.test.tsx`
- 読む: 設計書の「ラベルの編集の開始（`useNodeLabelEditRequest`）」節。手本は `client/src/components/map/useNodeFocusRequest.ts` とそのテスト。

**Interfaces**
- Consumes: Task 4 の `NodeLabelEditRequest`（`@/types/nodeLabelEditRequest`）。既存の `useNodeEditing` の `startEditing(nodeId: number, initialText?: string)`（`initialText` を渡すとノードの有無によらず編集を始める）。`Node`。
- Produces:
  ```ts
  export type UseNodeLabelEditRequestOptions = {
    request: NodeLabelEditRequest | null;
    documentRevision: number;
    nodes: readonly Node[];                 // MapStage の nodes（表示用）
    hasActiveGesture: () => boolean;
    cancelActiveGesture: () => void;
    startEditing: (nodeId: number, initialText?: string) => void;
  };
  export function useNodeLabelEditRequest(options: UseNodeLabelEditRequestOptions): void;
  ```

**実装の要点**
- `processedSequenceRef = useRef<number | null>(null)`。`hasActiveGesture`・`cancelActiveGesture`・`startEditing` は `useLayoutEffect` で ref に控える（この effect を処理の effect より前に宣言する）。
- 処理は `useLayoutEffect(…, [request, documentRevision, nodes])`（画面に出る前に入力欄を描き、`autoFocus` でフォーカスを移すため。コメントに理由を書く）:
  1. `request === null` → 何もしない。
  2. `processedSequenceRef.current === request.sequence` → 何もしない（StrictMode の二重実行でも1回）。
  3. `request.documentRevision !== documentRevision` → `processedSequenceRef.current = request.sequence;` で終わる。
  4. `nodes` に `request.nodeId` が無い → 処理済みにして終わる（後で現れても始めない）。
  5. 処理済みにし、`hasActiveGesture()` なら `cancelActiveGesture()`、続けて `startEditing(request.nodeId, "")`。

- [ ] テストを書く（`renderHook` と `rerender`。`startEditing`・`cancelActiveGesture` は `jest.fn()`、`hasActiveGesture` は `jest.fn(() => false)`。`nodes` は `[createTestNode({ id: 1 }), createTestNode({ id: 2, parentId: 1 })]`、`documentRevision: 0`）:
  - `request: { nodeId: 2, sequence: 1, documentRevision: 0 }` → `startEditing` が `(2, "")` で1回。同じ `request` オブジェクトで `rerender` → 増えない。同じ値の新しいオブジェクトで `rerender` → 増えない。`{ nodeId: 2, sequence: 2, documentRevision: 0 }` で `rerender` → 2回。
  - `request: null` → 呼ばれない。
  - 世代が違う: `request.documentRevision: 0`・`documentRevision: 1` → 呼ばれない。
  - ノードが無い: `nodes` を `[id 1]` だけにして `request.nodeId: 2` → 呼ばれない。続けて `nodes` に id 2 を足して `rerender`（同じ `request`）→ 呼ばれない。
  - ジェスチャー中: `hasActiveGesture` が `true` を返す → `cancelActiveGesture` が1回、`startEditing` が1回、`cancelActiveGesture` → `startEditing` の順（`mock.invocationCallOrder`）。ジェスチャーが無ければ `cancelActiveGesture` は呼ばれない。
- [ ] RED: `npm test -- --runInBand useNodeLabelEditRequest.test.tsx`。
- [ ] 実装し、GREEN。`npm run typecheck && npm run lint`。
- [ ] 変異: 処理済みの確認を消す（同じ要求で2回呼ばれる）、世代の確認を消す、ノードの不在で処理済みにしない（後で現れたときに呼ばれる）、のそれぞれで落ちる。
- 知見: L-037。
- 完了条件: 全ケースが通る。フックはまだどこからも使われない（Task 9 で配線する）。

### Task 9: MapStage と MapEditor の配線（ショートカット・ラベルの編集の要求）

**Files**
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`
- Modify: `client/src/components/map/__tests__/MapStageVisibility.test.tsx`、`client/src/components/map/__tests__/MapStageContextMenu.test.tsx`、`client/src/components/map/__tests__/MapStageHistory.test.tsx`（必須の props を足すだけ）
- Modify: `client/src/components/map/testing/AutoLayoutMapStageHarness.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`
- Modify: `client/src/components/map/__tests__/MapEditor.test.tsx`

**Interfaces**
- Consumes: Task 2 の `clearNotice`（`useRevisionScopedNotice` の戻り値）。Task 3 の `insertParentNode`（`useNodes` の戻り値）。Task 4 の `NodeLabelEditRequest`、`useNodeParentInsertionAction`。Task 6 の `useNodeParentInsertionShortcut`。Task 8 の `useNodeLabelEditRequest`。既存の `MapStage` の `shortcutsEnabled`、`hasActiveGesture`、`cancelActiveGesture`、`editing.startEditing`・`editing.editingNodeId`、`documentRevision`、`nodes`。`MapEditor` の `publishTreeEditNotice`（枝の構造の変更の通知の枠の `publishNotice`）、`displayState.visibleNodeIds`。
- Produces:
  ```ts
  // MapStageProps に追加（必須）
  // ショートカットの親の挿入の要求。結果の通知とラベルの編集の要求は呼び出し元が行う
  onInsertParentNode: (nodeId: number) => void;
  // 呼び出し元からのラベルの編集の要求（親の挿入の後）。documentRevision が違う要求は無視する
  labelEditRequest: NodeLabelEditRequest | null;

  // MapEditor の中（Task 10 が使う）
  const nodeParentInsertion = useNodeParentInsertionAction({
    selectedNodeId,
    nodes,
    visibleNodeIds: displayState.visibleNodeIds,
    documentRevision,
    insertParentNode,
    publishNotice: publishTreeEditNotice,
    clearNotice: clearTreeEditNotice,
  });
  ```

**実装の要点**
- `MapStage.tsx`: props に `onInsertParentNode` と `labelEditRequest` を足す（`onChangeNodeIndent` の直後）。`useNodeFocusRequest({...})` の直後（`useHiddenNodeInteractionReset` より後）で `useNodeLabelEditRequest({ request: labelEditRequest, documentRevision, nodes, hasActiveGesture, cancelActiveGesture, startEditing: editing.startEditing })`。`useNodeIndentShortcut({...})` の直後で `useNodeParentInsertionShortcut({ selectedNodeId, isEditing: editing.editingNodeId !== null, hasActiveGesture, enabled: shortcutsEnabled, onInsertParentNode })`。
- `MapEditor.tsx`: `useNodes()` の分割代入に `insertParentNode` を足す。枝の構造の変更の通知の分割代入に `clearNotice: clearTreeEditNotice` を足し、コメントを「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入）。8系統目」に直す。`useNodeIndentAction` の直後で上の `useNodeParentInsertionAction` を呼ぶ。`MapStage` に `onInsertParentNode={nodeParentInsertion.insert}` と `labelEditRequest={nodeParentInsertion.labelEditRequest}` を渡す。
- `AutoLayoutMapStageHarness.tsx`: `useNodes()` から `insertParentNode` を取り出し、`onInsertParentNode={(nodeId) => { insertParentNode(nodeId, new Set(nodes.map((node) => node.id))); }}`、`labelEditRequest={null}`。
- テストの `defaultProps`（`MapStage.test.tsx`・`MapStageVisibility.test.tsx`・`MapStageContextMenu.test.tsx`）に `onInsertParentNode: jest.fn()` と `labelEditRequest: null`、`defaultProps` を使わない `<MapStage`（`MapStage.test.tsx` の3か所と `MapStageHistory.test.tsx` の1か所。いずれも `onChangeNodeIndent={() => {}}` の行の直後）に `onInsertParentNode={() => {}}` と `labelEditRequest={null}` を足す。

- [ ] `MapStage.test.tsx` にテストを足す（既存の「Alt+→で選択中のノードの階層を下げる要求を…」と同じ書き方。`sampleNodes` は id 1（x 50, y 30、「ノード1」）と id 2）:
  - `selectedNodeId: 1` で `fireEvent.keyDown(document.body, { key: "Enter", altKey: true })` → `onInsertParentNode` が `(1)` で1回、戻り値 `false`、`defaultProps` の `onAddSiblingNode` が呼ばれない（呼ぶ前に `mockClear`）。
  - `{ key: "Enter" }` → `onAddSiblingNode` が `(1)` で呼ばれ、`onInsertParentNode` が呼ばれない。
  - `shortcutsEnabled: false` → `Alt+Enter` で呼ばれず、戻り値 `true`。
  - ラベル編集中（`fireEvent.doubleClick(container, { clientX: 100, clientY: 60 })` で開いた入力欄に `Alt+Enter` を送る）→ `onInsertParentNode` が呼ばれない。
  - 要求で編集を始める: `labelEditRequest={{ nodeId: 1, sequence: 1, documentRevision: 0 }}` で描くと `getByTestId("node-label-input")` があり、`value` が `""`、`document.activeElement` がその入力欄。`documentRevision: 0` の要求を `documentRevision={1}` の `MapStage` に渡すと入力欄が無い（`queryByTestId` が `null`）。
- [ ] `MapEditor.test.tsx` の `describe("階層の上げ下げ")` の後に `describe("親の挿入")` を足す。`parentWithTwoChildrenJson`（R(1)、A(2)、B(3)）と `selectNode(index, nodeCount)` は `describe("階層の上げ下げ")` の中のローカル定義なので、新しい describe の中に同じ内容で複製する（既存の describe は変えない）。`exportedMap()` はファイルの上位にあるものを使う。Task 10 のテストもこの describe に足し、同じ複製を使う:
  - A を選択（`selectNode(1, 3)`）して `fireEvent.keyDown(document.body, { key: "Enter", altKey: true })` → `screen.getByTestId("node-label-input")` が `document.activeElement` で `value` が `""`。`exportedMap()` のノード数が 4、A の `parentId` が新しいノードの ID、新しいノードの `parentId` が 1。操作通知バー（`queryByTestId("operation-notices")`）が `null`。
- [ ] 影響の確認: `npm run typecheck` で `<MapStage` の漏れが無いこと。
- [ ] RED: `npm test -- --runInBand MapStage.test.tsx MapEditor.test.tsx`（新しいテストが失敗し、既存のテストは必須の値を足した後も通る）。
- [ ] 実装し、GREEN と `npm test -- --runInBand MapStage MapEditor page`。`npm run typecheck && npm run lint`。
- 知見: L-060、L-061（ショートカットにも `shortcutsEnabled` を渡す）。
- 完了条件: `MapEditor` から `MapStage` へ `onInsertParentNode` と `labelEditRequest` が渡り、ショートカットで挿入とラベルの編集が始まる。既存のテストは必須の値を足す以外の変更なしで通る。

### Task 10: ヘッダーのボタンと操作ヒントの配線

**Files**
- Modify: `client/src/components/map/MapEditor.tsx`、`client/src/components/map/__tests__/MapEditor.test.tsx`
- Modify: `client/src/components/layout/LayoutModeOperationHint.tsx`、`client/src/components/layout/__tests__/LayoutModeOperationHint.test.tsx`

**Interfaces**
- Consumes: Task 5 の `NodeParentInsertControl`。Task 9 の `nodeParentInsertion`（`MapEditor` の中の `useNodeParentInsertionAction` の戻り値）。
- Produces: 新しい公開 API は無い。

**実装の要点**
- `MapEditor.tsx`: `operationControls` の中で `NodeIndentControl` の直後、`CLIPBOARD_OPERATION_HINT` の `<span>` の前に `<NodeParentInsertControl canInsert={nodeParentInsertion.canInsert} onInsert={nodeParentInsertion.insertSelected} />`。
- `LayoutModeOperationHint.tsx` の両モードの文言の末尾に `・Alt(Option)+Enterで親を挿入` を足す:
  - manual: `空白ダブルクリックで追加・ノードダブルクリックで編集・ノードドラッグで移動・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ・Alt(Option)+Enterで親を挿入`
  - auto: `空白ダブルクリックで追加・ノードダブルクリックで編集・追加・削除・接続時に自動整列・ノードドラッグで兄弟の順序を変更・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ・Alt(Option)+Enterで親を挿入`

- [ ] `MapEditor.test.tsx` の `describe("親の挿入")` に足す（`insertButton()` = `screen.getByRole("button", { name: "選択中のノードに親を挿入" })`）:
  - 並び: `getByRole("group", { name: "階層" })` の後、クリップボードの案内（「枝をコピー: Ctrl/Cmd+C」で始まる文字）の前に `insertButton()` がある（`compareDocumentPosition`）。
  - 未選択で `insertButton()` が `disabled`。
  - A を選択（`selectNode(1, 3)`）すると `insertButton()` が有効で、「枝の階層を下げる」が無効（`canInsert` と `canIndent` の取り違えを検出する。L-060）。R を選択（`selectNode(0, 3)`）すると `insertButton()` が有効で、「枝の階層を上げる」が無効。
  - A を選択して `await userEvent.click(insertButton())` → `screen.getByTestId("node-label-input")` が `document.activeElement`。
- [ ] `LayoutModeOperationHint.test.tsx` の期待の文言を上の文言に直す（両モード。完全一致）。
- [ ] 影響の確認: `grep -rn 'name: /' client/src/app/__tests__ client/src/components/map/__tests__ client/src/components/layout/__tests__` を実行し、「親」「挿入」「選択中」を含む正規表現の名前があれば、新しいボタンに一致しないか確かめ、一致するなら文字列の完全一致に直す。
- [ ] RED: `npm test -- --runInBand MapEditor.test.tsx LayoutModeOperationHint.test.tsx`。
- [ ] 実装し、GREEN と `npm test -- --runInBand page`。`npm run typecheck && npm run lint`。
- 知見: L-058、L-060。
- 完了条件: ヘッダーのボタン・ショートカットのすべてが実際の `MapEditor` からつながる。既存のテストは文言の更新以外の変更なしで通る。

### Task 11: ページの結合テスト

**Files**
- Create: `client/src/app/__tests__/pageParentInsertion.test.tsx`
- 読む: 設計書の「受け入れ基準」「テスト方針」の「ページの結合テスト」「既存の操作との関係」「エラーと境界条件」節
- Modify（テストで見つかった不具合がある場合だけ）: Task 1〜10 で作成・変更したファイル

**Interfaces**
- Consumes: Task 10 までの `Home`（`@/app/page`）。`client/src/app/__tests__/pageNodeIndent.test.tsx` の、Pixi・イラスト生成・ダウンロード・画像化のモック（`jest.mock` の部分）とヘルパー `v3Json(nodes, layoutMode)`・`stageContainer`・`renderPage`・`headerButton`・`undoButton`・`redoButton`・`selectNode(index, nodeCount, x, y)`・`exportedMap`・`storedMap` を複製する（新しい公開 API は作らない）。既存の `seedMapLibrary`・`readActiveMapJson`（`client/src/testing/mapLibraryTestStorage.ts`）、`renderReady`・`mockStageBounds`・`mockNodePointerHandlers`・`mockStageHandlers`・`pointer`・`resetMapStageTestRuntime`（`client/src/components/map/testing/mapStageTestRuntime.tsx`）。
- テストの前提: 初期のビューポートは `{ offsetX: 0, offsetY: 0, scale: 1 }` なので、ポインタの座標がそのままワールド座標になる。`selectNode` の `index` は `nodes` 配列の順、`nodeCount` は直近の描画で登録されたハンドラの数（`pageNodeIndent.test.tsx` の注記のとおり、折りたたみで隠れたノードも数える）、座標には対象のノードの中心を渡す。新しいノードの ID は採番器が決めるので、保存されたマップから「`parentId` が R で、既存の ID でないノード」として見つける。保存された JSON は `readActiveMapJson(window.localStorage)` を `waitFor` で待って読む（300ms の自動保存）。ボタンは `headerButton("選択中のノードに親を挿入")` などで取る。ラベルの入力欄は `screen.getByTestId("node-label-input")`。

- [ ] `pageParentInsertion.test.tsx` を書く（ノードは幅 100・高さ 60）。基本のマップ（手動配置）: R（id 1、「R」、x 0, y 200）、A（id 2, parentId 1、「A」、x 220, y 0）、B（id 3, parentId 1、「B」、x 220, y 200）、C（id 4, parentId 1、「C」、x 220, y 400）、C1（id 5, parentId 4、「C1」、x 440, y 400）。
  - 基本（ボタン）: B を選択して `await user.click(headerButton("選択中のノードに親を挿入"))` → 保存されたマップで ID の並びが `[1, 2, N, 3, 4, 5]`、N の `parentId` 1・(220, 200)・`importance: "medium"`・`label: ""`、B の `parentId` が N・(440, 200)。`document.activeElement` が `node-label-input`（`value` が `""`）。操作通知バーが無い。`fireEvent.change(input, { target: { value: "分類" } })` → `fireEvent.keyDown(input, { key: "Enter" })` → 入力欄が消え、`document.activeElement === document.body`、N の `label` が「分類」。続けて（N が選択されたまま）`await user.click(headerButton("選択中のノードに親を挿入"))` → 新しい入力欄が `document.activeElement`、ノード数が 7、2つ目の新しいノード N2 の `parentId` が 1、N の `parentId` が N2（L-617）。
  - Undo / Redo: B に挿入して「分類」を確定した後、「元に戻す」1回で N の `label` が `""`、2回目でノードが5つ・B の `parentId` 1・(220, 200)。「やり直す」2回で N（同じ ID）が戻り、`label` が「分類」、B が (440, 200)。
  - ショートカット: B を選択して `fireEvent.keyDown(document.body, { key: "Enter", altKey: true })` → ノード数が 6、増えたノードが B の親（ボタンと同じ座標）。入力欄に `{ key: "Escape" }` を送って閉じた後、B を選択し直して（配列は `[R, A, N, B, C, C1]` なので `selectNode(3, 6, 490, 230)`）`body` へ `{ key: "Enter" }` → ノード数が 7、増えたノード S の `parentId` が N（B の兄弟）、入力欄が開く。入力欄に `{ key: "Escape" }` を送って閉じ、B を選択し直して（S は配列の末尾なので `selectNode(3, 7, 490, 230)`）`body` へ `{ key: "Enter", altKey: true, ctrlKey: true }` → ノード数が 7 のまま、`queryByTestId("node-label-input")` が `null`（入力欄が開かない）。
  - 押し続け（L-408）: B を選択して `Alt+Enter` を `body` へ送った直後に、入力欄へ `{ key: "Enter", altKey: true, repeat: true }` を送る → 入力欄が残り、ノード数が 6 のまま。別のテストで B を選択して `{ key: "Enter" }` を `body` へ送った直後に、入力欄へ `{ key: "Enter", repeat: true }` を送る → 入力欄が残り、ノード数が 6 のまま。
  - ボタンの Enter の押し続け（L-408。`pageOutlineImportKeyboard.test.tsx` の `pressEnterOnActiveElement` と同じ方法）: ヘルパー `pressEnterOnActiveElement(init: { repeat: boolean })` を複製する（`document.activeElement` へ `{ key: "Enter", ...init }` の `keyDown` を送り、既定動作が止められず対象が `HTMLButtonElement` なら `fireEvent.click(target, { detail: 0 })` を送る。ブラウザがボタンの Enter で click を合成するのを再現する）。B を選択し、`headerButton("選択中のノードに親を挿入").focus()` → `pressEnterOnActiveElement({ repeat: false })` → `document.activeElement` が `node-label-input` → `pressEnterOnActiveElement({ repeat: true })` を2回 → 入力欄が残り（`document.activeElement` が `node-label-input` のまま）、ノード数が 6（1つだけ増えた）。
  - 止まる場面（L-061）: B を選択した状態で、ラベル編集中（B のダブルクリックで開いた入力欄に `Alt+Enter`。`pageNodeIndent.test.tsx` の「ラベル編集中」と同じ手順。確定はしてよいがノード数は 5 のまま）、検索入力欄（`screen.getByRole("combobox", { name: "ノードを検索" })` に送る）、「枝を複製」のボタン（`headerButton("枝を複製")` に送る）、のそれぞれでノード数が 5 のまま。箇条書きのダイアログ: B を選択してから「箇条書きから追加」でダイアログを開き、`(document.activeElement as HTMLElement).blur()` の後、`document.activeElement === document.body` を確かめてから `Alt+Enter` を `document.body` に送ってもノード数が 5 のまま。
  - 目印の共有（L-522）: B を選択し、`headerButton("枝を上へ移動")` に `focus()` したまま `Alt+Enter` をそのボタンへ送る → B に親が入る。別のテストで B を選択し、`headerButton("枝の階層を下げる")` に `focus()` したまま `Alt+Enter` を送る → B に親が入る。別のテストで B を選択し、`headerButton("選択中のノードに親を挿入")` に `focus()` したまま `{ key: "ArrowRight", altKey: true }` を送る → B の `parentId` が 2（階層を下げた）。
  - 編集中に押す: ダブルクリックでは選択されないので、先に `selectNode(1, 5, 270, 30)` で A を選ぶ。続けて A のダブルクリック（中心 (270, 30)。`pageNodeIndent.test.tsx` の「ラベル編集中」と同じ手順）で開いた入力欄に `fireEvent.change` で「A改」と入れ、`await user.click(headerButton("選択中のノードに親を挿入"))` → A の `label` が「A改」、A の `parentId` が新しいノード、新しい入力欄が `document.activeElement` で `value` が `""`。
  - 折りたたみ: C を選択（`selectNode(3, 5, 270, 430)`）して「枝を折りたたむ」→ 挿入 → 入力欄を `Escape` で閉じる。C を選択し直すと（配列は `[R, A, B, N, C, C1]` なので `selectNode(4, 6, 490, 430)`）`headerButton("枝を展開")` がある（閉じたまま）。新しいノードを選択すると（`selectNode(3, 6, 270, 430)`）ヘッダーが「枝を折りたたむ」（開いている）。保存されたマップで C1 の `parentId` が 4 のまま、x が 660。
  - 表示レベルと重要度: B の重要度を「高」にしたマップ（`importance: "high"`）で B に挿入 → 新しいノードが選択された状態で `screen.getByRole("button", { name: "重要度 高" })` の `aria-pressed` が `"true"`。別のテストで B（`"medium"`）を選択してから `screen.getByRole("button", { name: "表示 高のみ" })` を押す → B が隠れて選択が外れ、「選択中のノードに親を挿入」が `disabled`。
  - 自動配置: `layoutMode: "auto"` で2つのルート（id 1「一」、x 30, y 40。id 2「二」、x 600, y 500）を読み込み、保存された id 1 の `x`・`y` を控える。id 1 を選択して `Alt+Enter` → 新しいノードの `x`・`y` が控えた値と等しく、id 1 の `parentId` が新しいノード。
  - 失敗と通知の枠（L-001、L-166）: 基本のマップの末尾にルート Z（id 9、「Z」、x 1e19, y 0）を足したマップで Z を選択（`selectNode(5, 6, 0, 0)`。ポインタを動かさないので座標は選択に影響しない）して挿入 → ノード数が 6 のまま、`getByTestId("operation-notices")` に「親ノードを挿入できませんでした。」、入力欄が無い。続けて B を選択して挿入 → `queryByText("親ノードを挿入できませんでした。")` が `null`。別のテストで B を選択して「枝を上へ移動」→「枝を上へ移動しました（見えている兄弟の3件中1番目）。」が出た後、挿入 → その文言が消える。
  - 自動保存: 上の各テストで、保存された本体の `nodes` の `parentId` と順が期待どおりであることを確かめる（基本のテストでは `exportedMap()` の `nodes` の順も1回確かめる）。
- [ ] RED の確認: 新しいテストは Task 10 の実装で通る場合がある。その場合は、主要な配線を1つずつ一時的に壊して、対応するテストが失敗することを確かめてから元に戻す。壊す箇所: `MapEditor` が `MapStage` に `onInsertParentNode` として空の関数を渡す、`labelEditRequest` に `null` を渡す、ヘッダーへ `canInsert` の代わりに `nodeIndent.canIndent` を渡す、`clearNotice` に空の関数を渡す、`publishNotice` に別の `useRevisionScopedNotice` の `publishNotice`（バーに出ない枠）を渡す、`MapStage` の `useNodeParentInsertionShortcut` に `enabled: true` を渡す、`NodeLabelEditor` のリピートの分岐を消す、`useNodeKeyboardShortcuts` の `!event.altKey` を消す。結果を報告に書く。
- [ ] 失敗したテストがあれば最小の修正を入れ、`npm test -- --runInBand pageParentInsertion.test.tsx` を GREEN にする。`npm run typecheck && npm run lint`。
- 知見: L-001、L-060、L-061、L-166、L-408、L-460、L-522、L-617。
- 完了条件: 設計書の受け入れ基準 1〜10 が結合テストか前のタスクの単体テストで固定され、変異の確認の結果を報告に書く。

### Task 12: 仕様の文書の更新（features.md・data-model.md）

**Files**
- Modify: `docs/specifications/features.md`
- Modify: `docs/specifications/data-model.md`
- 読む: 設計書の「既存の文書の更新」の `features.md`・`data-model.md` の項、「挿入の規則」（例 P の表）、「手動配置の座標」（式と例 M1〜M6）、「自動配置と先頭のルート」、「通知」、「UI」、「既存の操作との関係」、「対象外」節

- [ ] 各文書を「8系統」「8 系統」「枝の構造の変更の通知」「data-tree-edit-shortcut-button」「4つのボタン」「Enter」「Phase 14」「途中への親」で grep し、注記が要る箇所をすべて洗い出してから直す。
- [ ] `features.md`（設計書の「既存の文書の更新」のとおり）:
  - 目次と新しい「16. 途中への親ノード挿入」の章: 16.1 操作、16.2 挿入の規則（例 P の表）、16.3 手動配置の座標（式と例 M1〜M6）、16.4 自動配置と先頭のルート、16.5 折りたたみと表示レベル、16.6 履歴・選択・ラベルの編集・通知（失敗の文言、成功で枠を空にすること、同じ文言の失敗が続くと読み上げられない既知の制限）、16.7 キーボードとフォーカス（入力欄へのフォーカスの移動、押し続け、`Alt` を含む `Enter` と兄弟の追加）、16.8 既存の操作との関係、16.9 対象外。
  - 1.1 の Phase 14 の行に「途中への親ノード挿入」を足す（残りの2項目は未実装と書く）。1.2 のヘッダーの図と説明に「親を挿入」を足す。
  - 3.2 の表に「親ノードの挿入」の行（トリガー: 「親を挿入」・`Alt` + `Enter`、配置先: T と親の間、作成後: N を選択して空のラベルの編集を開始）を足し、兄弟ノード作成のトリガーに「`Alt` を含む `Enter` を除く」を書く。新しいノードの初期プロパティの説明に、親の挿入では重要度を T から引き継ぐことを足す。
  - 3.4 の確定とキャンセルに「リピートの `Enter`（入力欄が開く前から押していたキー）では確定しない」を足す。
  - 8.1 の表に「親の挿入 | 新しいノードの追加、T の `parentId` の変更、配列の位置、手動配置での枝の平行移動、自動配置での再配置をまとめて1操作（続くラベルの確定は別の操作）」を足す。8.2 の消える通知の記述を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入）」に直す。
  - 10.4 に「親の挿入: 折りたたみを保つ。閉じた T は閉じたまま、新しいノードは開いた状態。展開はしない」を足す。
  - 11.1 の表に `Alt`（`Option`）+ `Enter` の行を足し、`Enter` の行に「`Alt` との併用では兄弟を作らない」を、`Alt` + `↑` / `↓` と `←` / `→` の行の「4つのボタン」を「5つのボタン（『親を挿入』を含む）」に直す。ラベル編集中の `Enter` の行に「リピートでは確定しない」を足す。NOTE（ラベル編集中に無効になるショートカットの列挙、ダイアログ中に止まるショートカットの列挙）に `Alt+Enter` を足す。
  - 11.4 の表に「親の挿入」のボタンの行とアクセシビリティの項目を足す。操作通知バーの行・「マップ全体置換時の同期リセット」の10番・「8系統独立表示」の本文と `kind` の表の主な用途を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入）」と親の挿入の失敗に直す。10番に `useNodeParentInsertionAction` が `publishNotice` と `clearNotice` を受け取ることを足す。「レイアウトモード別操作ヒント」の文言を Task 10 の文言に直す。
  - 14.7・15.7 の目印の説明を5つのボタンに直す。14.8・15.8 の表に「親の挿入（16 章）」の行を足す。14.9・15.9 の対象外の「途中への親ノードの挿入」を消す。
- [ ] `data-model.md`: 1.2 の設計原則に「親の挿入（Phase 14）は、新しいノードを1つ足し、T の `parentId` を変える（手動配置では T の枝を平行移動する）だけで、保存形式・JSON・編集履歴の項目を足さない（2.9 節）」を足す。2.1 の `Node` の `parentId` の説明に親の挿入でも変わることを足す。新しい節「2.9 途中への親ノード挿入の型」に `NodeParentInsertionFailureReason`・`NodeParentInsertionResult`・`InsertParentNodeResult`（定義元は `client/src/domain/nodes/nodeParentInsertion.ts`。Task 1 の Interfaces のとおり）と `NodeLabelEditRequest`（定義元は `client/src/types/nodeLabelEditRequest.ts`）を足し、目次も直す。保存形式（3章）は変えないことを確かめる。
- [ ] 文書に書いた型名・関数名・文言が実装と一致することを `grep` で確かめる（`insertParentNode`、`createParentNode`、`canInsertParentNode`、`useNodeParentInsertionAction`、`useNodeLabelEditRequest`、`data-tree-edit-shortcut-button`、「親ノードを挿入できませんでした。」、操作ヒントの文言）。`git diff --check`。
- 知見: L-061（既存の操作との関係を文書にも表で残す）、L-166。
- 完了条件: features.md の目次と章番号が連続している。14.9・15.9 に「途中への親ノードの挿入」が残っていない。

### Task 13: 構成・案内・手動テストの文書の更新

**Files**
- Modify: `docs/architecture/overview.md`
- Modify: `README.md`、`client/README.md`、`docs/README.md`
- Modify: `docs/testing/browser-test-cases.md`
- 読む: 設計書の「既存の文書の更新」の `overview.md`・README 類・`browser-test-cases.md` の項、「手動テスト」節（S-01〜S-14 の表と共通の決まり）、「全体の構成」節

- [ ] 各文書を「8系統」「枝の構造の変更」「data-tree-edit-shortcut-button」「4つのボタン」「Phase 14」「階層の上げ下げ」で grep し、注記が要る箇所をすべて洗い出してから直す。
- [ ] `overview.md`: レイヤーの説明に新しいファイル（`nodeParentInsertion.ts`、`nodeParentInsertionMessages.ts`、`useNodeParentInsertionAction.ts`、`NodeParentInsertControl.tsx`、`nodeParentInsertionShortcut.ts`、`useNodeParentInsertionShortcut.ts`、`useNodeLabelEditRequest.ts`、`types/nodeLabelEditRequest.ts`）を足し、`nodePlacement.ts`・`useNodes.ts`・`useRevisionScopedNotice.ts`・`useNodeKeyboardShortcuts.ts`・`NodeLabelEditor.tsx` の説明を直し、各ディレクトリのファイル数を `ls` で数えた実数に合わせる。「階層の上げ下げの流れ」の後に「親の挿入の流れ」（ボタン・ショートカット → `useNodeParentInsertionAction` → `useNodes.insertParentNode` の1回の commit と N の選択 → 成功で `clearNotice` とラベルの編集の要求 → `MapStage` の `useNodeLabelEditRequest` が `startEditing` → 入力欄の `autoFocus`。失敗で `publishNotice`）を足す。
- [ ] `README.md`: 機能の一覧に「14. 途中への親ノード挿入（Phase 14 の3番目の項目）」を足し、編集履歴の対象の列挙に親の挿入を足す。`client/README.md`: キーボードショートカットに `Alt`（`Option`）+ `Enter` を足し、機能の一覧と `domain/nodes/` の説明に親の挿入を足す。`docs/README.md`: 各文書の説明の「階層の上げ下げ」の列挙に「途中への親ノード挿入」を足す（流れ、Phase の範囲、型の節 2.9、手動テストの S 節）。
- [ ] `browser-test-cases.md`: 冒頭の対象に「途中への親ノード挿入」を足す。新しい節「Phase 14: 途中への親ノード挿入」（記号 `S`）を R 節の後・「結果の集計」の前に足し、設計書の「手動テスト」の表の S-01〜S-14 を、前提・手順・期待の形で書く。共通の決まりは R 節と同じ（`npm run build` の後に `npm run start -- -p 3115`、保存データはキーを名前で1つずつ消す、各ケースは「新しいマップ」でケースの ID を名前にしたマップ、特に書かない限り表示は「すべて」、通知の行が出るとキャンバスがずれる、結果は実ブラウザで確かめたものだけを記録し Jest の結果を実機の確認として扱わない）。基本の木は R 節と同じ（R の子 A・B・C、C の子 C1・C2）。位置の期待は相対的な関係で書き、フォーカスは `document.activeElement.getAttribute("aria-label")` か `getAttribute("data-testid")`（ラベルの入力欄は `node-label-input`）で確かめる（L-613）。「結果の集計」に S-01〜S-14 の未実施の行を足す。Q 節・R 節で「4つのボタン」や目印に触れている箇所があれば5つのボタンに直す。
- [ ] 文書に書いたファイル名・関数名・文言が実装と一致することを `grep` で確かめる。`git diff --check`。
- 知見: L-061、L-613。
- 完了条件: 設計書の受け入れ基準 11 に挙がった文書（`ROADMAP.md` を除く）が実装と一致する。実ブラウザで確認していない項目を確認済みと書いていない。

### Task 14: ROADMAP の更新と最終検証

**Files**
- Modify: `ROADMAP.md`

- [ ] Phase 14 の見出しは「## Phase 14: ツリー構造の編集（進行中）」のまま、「**途中への親ノード挿入**（候補003）」を `[x]` にする。「枝の切り取り・移動」（候補016）と「ノードだけ削除」は `[ ]` のまま。
- [ ] 「現在地」:
  - 19行目の Phase 14 の要約の「「兄弟ノードの順序変更」（候補001）と「階層の上げ下げ」（候補002）が完了」を「「兄弟ノードの順序変更」（候補001）、「階層の上げ下げ」（候補002）、「途中への親ノード挿入」（候補003）が完了」に直す。
  - 20行目（階層の上げ下げの段落）の直後に、次の段落を足す: 「途中への親ノード挿入（候補003）では、ヘッダーの「親を挿入」と `Alt` / `Option` + `Enter` で、選択中のノードと親の間に新しいノードを入れられる。新しいノードは選択中のノードがいた兄弟の位置に入り、重要度を引き継ぎ、挿入の後は空のラベルの編集が始まる。手動配置では選択中の枝を新しいノードの右へ平行移動し、自動配置では全体を並び直す。1回の挿入を1操作としてUndo / Redoできる。`Alt` を含む `Enter` では兄弟を追加せず、ラベルの入力欄はリピートの `Enter` で確定しない。Jest（jsdom）の自動テストと `npm run verify`（lint・typecheck・test・build）で確認済み。実ブラウザでの確認（docs/testing/browser-test-cases.md のS節）は未確認で、実機では確かめていない。」
  - 「次に取り組む項目は、Phase 14「途中への親ノード挿入」（候補003）。」を「次に取り組む項目は、Phase 14「枝の切り取り・移動」（候補016）。」に直す。
  - 「Phase 14は進行中（兄弟ノードの順序変更・階層の上げ下げが完了）。」を「Phase 14は進行中（兄弟ノードの順序変更・階層の上げ下げ・途中への親ノード挿入が完了）。」に直す（続く文は変えない）。
  - 13行目の文書体系の行の「Phase 0からPhase 14の階層の上げ下げまで」を「Phase 0からPhase 14の途中への親ノード挿入まで」に直す。
- [ ] Phase 14 の節以外の追加候補の節（「## Phase 14以降の計画（全100案・26フェーズ）」と Phase 15〜39 の各節）は変更しない。`git diff ROADMAP.md` で、その範囲に差分が無いことを確かめる。
- [ ] 「最終更新」を実装を完了した日付にする。
- [ ] `cd client && npm run verify` と `git diff --check` を実行し、テストのスイート数・テスト数と、lint・typecheck・build の成功を報告に書く。
- [ ] 全体の仕様・品質レビューを別のサブエージェントで行い、指摘を解消する（解消のたびに `cd client && npm run verify`）。
- [ ] ブランチと worktree を保持する。コミット・push・PR は明示の依頼が無ければ行わない。完了報告では、ブランチ名・worktree のパス・未決事項（実ブラウザの未確認のケースなど）を伝える。
- 完了条件: ROADMAP の「途中への親ノード挿入」だけが新たに完了になり、現在地・次の項目（Phase 14「枝の切り取り・移動」（候補016））・最終更新が実態と一致する。ほかの節に差分が無い。全タスクの完了後の `npm run verify` が成功している。

---

## 設計書との対応

| 設計書の節 | タスク |
| :--- | :--- |
| 型・`canInsertParentNode`・`insertParentNode`・例 P1〜P9 | 1 |
| 新しいノードの値（`createParentNode`） | 1 |
| 手動配置の座標（例 M1〜M6） | 1 |
| 自動配置と先頭のルート | 1, 3, 11 |
| useNodes の操作 | 3 |
| useNodeParentInsertionAction の入出力 | 4, 9 |
| ラベルの編集の開始（`useNodeLabelEditRequest`） | 8, 9 |
| ラベルの入力欄のリピートの Enter | 7, 11 |
| 履歴 | 3, 11 |
| 通知（枠・`clearNotice`・文言） | 2, 4, 9, 11 |
| UI: ヘッダーのボタン | 5, 10 |
| UI: 操作ヒント | 10 |
| UI: ショートカット（判定・登録・既存の `Tab`・`Enter`） | 6, 7, 9 |
| 既存の操作との関係 | 7, 9, 10, 11, 12 |
| エラーと境界条件 | 1, 3, 6, 7, 11 |
| 受け入れ基準 | 1 → 1・11、2 → 1・8・11、3 → 1・11、4 → 1・3・11、5 → 1・11、6 → 3・11、7 → 2・4・11、8 → 7・11、9 → 5・6・7・9・11、10 → 3・11、11 → 12・13・14 |
| 既存の文書の更新・手動テスト | 12, 13, 14 |

## 知見の割り当て

| 知見 | タスク |
| :--- | :--- |
| L-001 | 2, 3, 4, 11 |
| L-002 | 1 |
| L-035 | 1, 3 |
| L-037 | 3, 4, 8 |
| L-048 | 7 |
| L-058 | 5, 10 |
| L-060 | 9, 10, 11 |
| L-061 | 6, 9, 11, 12, 13 |
| L-150 | 5 |
| L-155 / L-157 | 5, 12 |
| L-166 | 2, 4, 11, 12 |
| L-408 | 5, 6, 7, 11 |
| L-460 | 1, 11 |
| L-473 | 7 |
| L-474 | 6 |
| L-522 | 5, 6, 11 |
| L-524 | 1 |
| L-541 | 1 |
| L-612 | 4 |
| L-613 | 13 |
| L-616 | 1, 3, 4, 6, 7, 8 |
| L-617 | 11 |
