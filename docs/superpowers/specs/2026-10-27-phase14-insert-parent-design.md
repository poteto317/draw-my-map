# Phase 14: 途中への親ノード挿入 設計

作成日: 2026-10-27
基準: main `dda975f`。作業ブランチは `codex/phase14-insert-parent`（`.worktrees/codex/phase14-insert-parent`）。

## 目的・範囲

箇条書きから取り込んだノードや、思いついた順に足したノードを、後から分類するための親でまとめられるようにする。既存の親子の間に新しいノードを1つ入れる操作を、キーボードとボタンで行えるようにする。ROADMAP Phase 14 の3番目の項目「途中への親ノード挿入（候補003）」を、1つの PR で実装する。

1. 選択中のノード T と、その親の間に、新しいノード N を入れる。N は T がいた兄弟の位置に入り、T（と子孫）が N の唯一の子になる。T がルートなら、N が T のいたルートの位置で新しいルートになる。
2. 手動配置では、N を T の位置に置き、T の枝を子の追加の規則で N の右へ平行移動する。自動配置では全体を配置し直す。
3. 挿入の後は、`Tab`・`Enter` と同じように N を選択し、空のラベルの編集を始める。
4. 1回の挿入を1つの操作として Undo / Redo できる（ラベルの編集は別の操作）。

## 対象外

- Phase 14 の他の項目（枝の切り取り・移動、ノードだけの削除）。
- 複数のノードをまとめて1つの親の下に入れること（アプリに複数選択が無い）。
- 兄弟の一部（T と後ろの兄弟など）をまとめて新しい親の子にすること。
- ドラッグでの挿入、コンテキストメニューへの項目の追加。
- 手動配置で、動かした枝と右側のノードとの重なりの回避（ユーザーの決定。重なりは避けない）。
- 新しい親のラベルや重要度を、挿入の前に入力・選択させること（挿入の後のラベルの編集で入れる）。
- 挿入の成功の通知（`Tab`・`Enter` と同じく出さない。「決めたこと」を参照）。
- `Tab`（子の追加）の挙動の変更、`Ctrl`・`Cmd`・`Shift` と併用した `Enter` の挙動の変更。
- ラベルの編集が終わった後に、フォーカスを「親を挿入」のボタンへ戻すこと（`Tab`・`Enter` と同じく `body` に落ちる）。
- ラベルの入力欄での IME 変換中の `Enter` の扱いの変更（今の実装のまま。今回はリピートの `Enter` だけを変える）。
- `Node` 型、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式の変更。

## 決めたこと

### ユーザーが決めたこと（2026-10-27）

1. **対象と位置**: 対象は選んだ1ノード T だけ。T と親の間に新しいノード N を入れる。N は T がいた兄弟の位置（配列の順）に入り、T（と子孫）が N の唯一の子になる。T がルートなら、N が T のいたルートの順の位置で新しいルートになる。
2. **入口**: ヘッダーのボタン「親を挿入」と、`Alt`（macOS では `Option`）+ `Enter`。キーは既存の `treeEditShortcutGuard`（`Alt` だけを押している、など）を使い回す。既存の `useNodeKeyboardShortcuts` は修飾キーを見ずに `Tab` → 子の追加、`Enter` → 兄弟の追加をしているので、`Alt` + `Enter` で兄弟の追加が動かないようにする。どの修飾キーで既存の `Tab`・`Enter` を止めるかは、既存の挙動を最小限だけ変える方針で決める。
3. **手動配置**: N を T の座標（`T.x`, `T.y`）に置き、T の枝全体を、子の追加の規則（`calculateChildPlacement`: `x = 親.x + 親.width + CHILD_HORIZONTAL_GAP`、子が無いとき `y = 親.y`）で T が来る位置まで平行移動する。右側のノードとの重なりは避けない。検査付きの算術（`nodeLayoutArithmetic.ts`）と `translateBranch` を使い回す。自動配置では `layoutNodeForest` に任せる。
4. **新しいノードの値と挿入の後**: N の重要度は T のものを引き継ぐ。N の大きさ（`width` / `height`）は新しいノードの既定値（100 × 60）。挿入の後は、`Tab`・`Enter` と同じように N を選び、空のラベルの編集を始める。

### 推奨案として採用したこと（ユーザーには聞いていない）

- **拒否する条件**: 未選択（ボタンは無効、ショートカットは何もしない）、T が無い（`node-missing`）、T が見えていない（`node-hidden`。表示集合 V にない）、不正な構造（`invalid-structure`。T の親が配列に無い、T が自分自身を親にしている）、新しい ID が既存のノードと重なる（`id-conflict`）、配置できない（`placement-failed`。手動配置の座標が有限でない・桁落ちする・間隔が取れない、自動配置の失敗）。端（`at-edge`）は無い（見えているノードなら、ルートを含めて必ず親を入れられる）。
- **ID が採れない場合**: ID は既存の `nodeIdAllocator.nextAvailableId` で `applyTreeChange` の中の最新の配列から採る。この関数は既存の ID と重ならない値を必ず返す（失敗しない）ので、「ID が採れない」理由は作らない。純関数は ID を引数で受け取るので、渡された ID が既存のノードと重なったときだけ `id-conflict` で拒否する（呼び出し元の誤りを黙って通さない。L-002）。
- **通知の枠**: 失敗の通知は、並べ替え・上げ下げと共有する8系統目の枠（「枝の構造の変更の通知」）に出す。系統の数は8のまま。名前を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入）」に直す。
- **成功の通知を出さない**: `Tab`・`Enter` と同じく、成功したら通知を出さず、ラベルの編集に入る。理由: (1) 入力欄へフォーカスが移ることが、見た目で結果を伝える（入力欄は「ノードのラベル」と読まれる（features.md の 3.4 節）。名前は開いた操作によらず同じなので、親が入ったことそのものは読み上げからは分からない。`Tab`・`Enter` の追加と同じ）。(2) 成功の文言に変わる値を入れないと、続けて挿入したときに同じ文言になって読み上げられない（L-166）。(3) 入力欄へのフォーカスの移動の読み上げと、ライブリージョンの読み上げが重なる。
- **成功したら枠を空にする**: 成功したときは、8系統目の枠の通知を消す（`useRevisionScopedNotice` に `clearNotice` を足す）。理由: 前の失敗の通知「親ノードを挿入できませんでした。」や、前の上げ下げの通知（「…第3階層」など、挿入で深さが変わって正しくなくなる）が、成功した挿入の後に残ると誤解を招くため（L-166 の「古いまま残る」）。ほかの7系統は消さない。
- **失敗の文言**: 理由によらず1つ。`親ノードを挿入できませんでした。`（`kind: "error"`）。ボタンは T が見えていないと無効で、ショートカットは選択が隠れると選択が外れるので、利用者が実際に見るのは、ほぼ座標の失敗と不正なデータだけである。理由ごとに文言を分けても、利用者が取れる手当て（元に戻す・座標を直す）は変わらない。
- **折りたたみ**: T が閉じていれば閉じたまま（折りたたみの集合は ID で持ち、T の ID は変わらない）。N は開いた状態（新しい ID は集合に無い）。T の親が閉じていると T は見えないので拒否する（`node-hidden`。ボタンは無効）。展開の操作は行わない（N の親は T の元の親で、T が見えている以上は閉じていない）。
- **表示レベル**: T が見えていることを条件にする。N は T の重要度を引き継ぎ、T の祖先になるので、T が見えている限り N も見える（表示レベルでは、条件を満たすノードとその祖先が見える）。隠れた兄弟には触れない。
- **Undo の単位**: 挿入（N の追加、T の `parentId` の変更、配列の位置、手動配置での枝の平行移動、自動配置での再配置）が1操作。続くラベルの編集は別の操作（`Tab` と同じ。8.1 節の「追加した直後のラベル入力は追加とは別の操作」）。1回目の「元に戻す」で確定したラベルが戻り、2回目で挿入が戻る。
- **ボタン**: ヘッダーの `NodeIndentControl`（「階層を上げる」「階層を下げる」）の右隣、コピー／貼り付けの案内の前に「親を挿入」を1つ置く。有効なのは、選択していて、T が配列にあり、見えているとき（配置モードによらない）。`aria-label="選択中のノードに親を挿入"`、`title="選択中のノードに親を挿入（Alt/Option+Enter）"`、`aria-keyshortcuts="Alt+Enter"`。`role="group"` では囲まない（1つのボタンなので。「枝を複製」と同じ）。
- **ショートカットの目印**: 「親を挿入」にも `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE`（`data-tree-edit-shortcut-button`）を付け、5つのボタン（「上へ」「下へ」「階層を上げる」「階層を下げる」「親を挿入」）のどれにフォーカスがあっても、`Alt` + `↑` / `↓` / `←` / `→` / `Enter` がすべて効くようにする。理由: 5つのボタンは隣り合い、どれもショートカットを案内している。目印の有無で効くキーが分かれると分かりにくい（14.7 節の決定と同じ考え方）。また、目印を付けないと「親を挿入」にフォーカスがあるときの `Alt` + `Enter` がショートカットの判定から外れ、ブラウザがボタンを押すかどうかに任されてしまう。目印を付ければ、`window` の判定が `preventDefault` してから1回だけ挿入する。
- **ボタンのフォーカス**: 押した後、アプリはボタンのフォーカスを操作しない。挿入が成功すると N のラベルの入力欄が描かれ、その `autoFocus` でフォーカスが入力欄へ移る（`Tab`・`Enter` で追加したときと同じ部品・同じ経路）。ラベルを確定・取り消すと入力欄が消え、フォーカスは `body` に落ちる（`Tab`・`Enter` と同じ）。ボタンは成功しても有効のまま（N が選択され、見えているため）なので、もう一方のボタンへの引き継ぎ（`usePairedButtonFocusHandover`）は使わない。失敗したときはフォーカスはボタンに残る。
- **ラベルの入力欄のリピートの Enter**: `NodeLabelEditor` は、`event.repeat` が真の `Enter` の `keydown` を `preventDefault` して何もしない（確定しない）。理由は「ラベルの入力欄のリピートの Enter」の節。`Tab`・`Enter` で追加した後の長押しの挙動も変わる（長押しで兄弟が次々に増えなくなる）。
- **編集中にボタンを押したとき**: 既存の流れに乗る。ボタンの `pointerdown` の既定動作を止めないので、入力欄の `blur` で編集中のラベルを確定してから、`click` で挿入する（上げ下げ・並べ替え・複製のボタンと同じ）。編集中のノードが T 自身でも、確定してから T の上に親を入れる。
- **ダイアログ中**: マップのダイアログ・箇条書きからの追加のダイアログを開いている間は、根の `inert` でボタンが押せず、ショートカットは `editorShortcutsEnabled`（`MapStage` の `shortcutsEnabled`）で止まる（既存の入口と同じ。L-061）。
- **ドラッグ中**: ショートカットは `hasActiveGesture` で止まる（共通の条件）。ボタンはジェスチャーを確かめない（並べ替え・上げ下げのボタンと同じ）。ボタンで挿入したとき、ラベルの編集を始める時点でジェスチャーが進行中なら、先に中止する（`useNodeFocusRequest` と同じ扱い。入力欄の下でドラッグが続かないようにする）。
- **ダブルクリック**: ボタンのダブルクリックは2回の操作として扱う（「枝を複製」と同じ。L-150）。1回目で N1 を入れて編集に入り、2回目の `pointerdown` で N1 の空のラベルを確定し、`click` で N1 の上に N2 を入れる。どちらも「元に戻す」で1回ずつ戻る。
- **キーの押し続け**: ショートカットは `event.repeat` が真なら `preventDefault` だけして挿入しない。ボタンは Enter の押し続け（`event.repeat`）を `preventDefault` する（L-408。ほかのボタンと同じ）。

### この設計書の作成者が決めたこと（下の各節で根拠を書く）

- **既存の `Tab`・`Enter` を止める修飾キー**: `useNodeKeyboardShortcuts` は、`Enter` で `altKey` が真のときだけ兄弟を追加しない（`preventDefault` もしない）。`Tab`・`Delete`・`Backspace` と、`Ctrl`・`Cmd`・`Shift` だけと併用した `Enter` は変えない。理由: 新しく割り当てるのは `Alt` + `Enter` だけなので、ほかの組み合わせで兄弟を足している利用者の操作を変えない。`Alt` だけでなく「`altKey` が真なら」止める理由: 親の挿入の判定は `Alt` だけを要求するので、`Alt` だけに絞って止めると、`Ctrl` + `Alt` + `Enter`（Windows の AltGr + `Enter`）や `Alt` + `Shift` + `Enter` で兄弟が足され、`Alt` を含む組み合わせが親の挿入と兄弟の追加に分かれて分かりにくい。「`Alt` を含む `Enter` は兄弟を足さない」と一言で言えるようにする。結果として、`Ctrl` + `Alt` + `Enter`・`Alt` + `Shift` + `Enter` は何もしない。
- **ラベルの編集の開始の経路**: ラベルの編集の状態（`useNodeEditing`）は `MapStage` の中にあり、ヘッダーのボタンは `MapEditor` にある。そこで、`MapEditor` が「ラベルの編集の要求」（`NodeLabelEditRequest = { nodeId, sequence, documentRevision }`。検索の `NodeFocusRequest` と同じ形）を持ち、`MapStage` が新しいフック `useNodeLabelEditRequest` で受けて `startEditing(nodeId, "")` を呼ぶ。ショートカットもボタンも、同じ `useNodeParentInsertionAction.insert` を通り、同じ要求で編集を始める（経路を1つにする）。
- **N の配列の位置**: N を T の直前に積み、T をその直後に積む（T の元の配列の位置に N が入り、T は1つ後ろへずれる）。理由: 兄弟の順は同じ `parentId` 同士の相対順だけで決まるので、N が T の元の位置に入れば、元の親の子の並びで N が T のいた位置を占める。N を T の直後に置いても木は同じだが、親を子より前に積むと、描画の順（配列の順）で親が子の下に描かれ、配列を読む人にも自然になる。
- **手動配置の座標の計算**: 上げ下げの `calculateIndentTranslation`（子の追加の規則を検査付きで計算する関数）を、N を足して T の親をまだ変えていない配列（N に子が無い状態）に対して呼ぶ。N の座標は T と同じなので、根 T の目的の位置は `x = T.x + 100 + 120`、`y = N.y = T.y` になり、`dy` は常に 0 になる。式を新しく書かないので、`calculateChildPlacement` と式が食い違わないことは、上げ下げで固定済みのテストがそのまま守る。
- **自動配置でも N に T の座標を入れる**: 自動配置の基準は先頭のルート F の `x` / `y` である。T が F のとき N が新しい F になるので、N に T の座標を入れておけば、基準の位置が変わらない（「自動配置と先頭のルート」の節）。
- **ショートカットのフック**: 上げ下げのフックとは別に `useNodeParentInsertionShortcut` を作る（`window` の `keydown` の登録は1つ増える）。理由: 呼ぶ相手と押し続けの扱い（上げ下げは押し続けを許可し、挿入は許可しない）が違い、既存のフックとそのテストを変えずに済むため。キーは重ならない（`Enter` と矢印）。
- **`Alt` + `Enter` の判定の入力**: 共通の `TreeEditShortcutInput` に `repeat` が無いので、`NodeParentInsertionShortcutInput = TreeEditShortcutInput & { repeat: boolean }` を作り、判定 `resolveNodeParentInsertionShortcut` は `"insert"`（挿入する）・`"suppress"`（押し続けなので `preventDefault` だけする）・`null`（何もしない）を返す。

## Global Constraints

- 新規依存なし。`Node`、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式を変えない。
- 挿入の規則は純関数（`domain/nodes/nodeParentInsertion.ts`）、新しいノードの値は純関数（`domain/nodes/nodePlacement.ts` の `createParentNode`）、通知の文言は純関数（`domain/nodes/nodeParentInsertionMessages.ts`）、ショートカットの判定は純関数（`components/map/nodeParentInsertionShortcut.ts`。共通の条件は `components/map/treeEditShortcutGuard.ts`）、状態と1回の commit は React フック、表示と操作は部品、という既存の境界を守る。nodeIndent 系と同じ粒度にする。
- 結果は判別共用体で返し、呼び出し元は成功したときだけ編集の要求を出し、通知の枠を空にする。共用体の分岐は `switch` で網羅し、新しいメンバーを既定の分岐へ流さない（L-001）。
- 対象は ID で指定し、配列の添字を層の間で受け渡さない。T と新しい ID は `applyTreeChange` のコールバックの中で最新のノード配列から解決・採番する（L-035）。
- 挿入は、表示で絞り込んだ部分配列ではなく、正本の全 `nodes` に対して行う。隠れた兄弟・隠れた子孫を消したり、順序を変えたりしない（L-460）。
- 配列の操作は1回の走査で新しい配列を作る。`splice` と添字の計算を使わない（L-541）。大きな配列に `Math.min(...arr)` や `push(...arr)` を使わない。
- 座標の計算は既存の `calculateIndentTranslation`（`checkedAdd` / `checkedSubtract` と `hasSufficientGap` で検査する）と `translateBranch` を使い、失敗なら `placement-failed` にする（L-524）。
- 新しい props とコールバックは必須にする。実際の `Home` から `MapEditor`、ヘッダー、`MapStage` まで通す結合テストで配線を確かめる（L-060）。
- TDD で進め、`client` の変更後に `npm run verify` を実行する。タスク単位のサブエージェント実装と、別担当の仕様・品質レビューを行う。
- コミット・push・PR 作成は依頼されたときだけ行う。最後のタスクで `ROADMAP.md` を実態に合わせて更新する。

## 全体の構成

```
MapEditor
├─ useNodes
│   └─ insertParentNode(nodeId, visibleNodeIds)          … applyTreeChange を1回呼ぶ。成功時は N を選択。documentRevision は変えない
├─ useRevisionScopedNotice（枝の構造の変更の通知。8系統目。clearNotice を足す）
├─ useNodeParentInsertionAction                          … ボタンの有効・無効、選択中のノードへの挿入、MapStage からの要求、通知、ラベルの編集の要求
│   ├─ useRevisionScopedNodeRequest                      … ラベルの編集の要求の採番と revision での絞り込み（検索の中央移動と共有）
│   ├─ canInsertParentNode                               … domain/nodes/nodeParentInsertion.ts
│   └─ formatNodeParentInsertionFailureNotice            … domain/nodes/nodeParentInsertionMessages.ts
├─ AppHeader の operationControls
│   ├─ NodeSiblingOrderControl（「上へ」「下へ」）
│   ├─ NodeIndentControl（「階層を上げる」「階層を下げる」）
│   └─ NodeParentInsertControl（「親を挿入」）             … NodeIndentControl の右隣
└─ MapStage（onInsertParentNode と labelEditRequest を新しく受け取る）
    ├─ useNodeKeyboardShortcuts（Alt を含む Enter では兄弟を足さない）
    ├─ useNodeParentInsertionShortcut                    … Alt+Enter。判定は resolveNodeParentInsertionShortcut
    ├─ useNodeLabelEditRequest                           … 要求を受けて startEditing(nodeId, "")。振り分けは classifyNodeRequest（useNodeFocusRequest と共有）
    └─ NodeLabelEditor（リピートの Enter では確定しない）
```

新しく作るファイル:

| 層 | ファイル | 役割 |
| :--- | :--- | :--- |
| types | `types/nodeLabelEditRequest.ts` | 型 `NodeLabelEditRequest`（`{ nodeId, sequence, documentRevision }`） |
| types | `types/revisionScopedNodeRequest.ts` | ノードへの要求の共通の形 `RevisionScopedNodeRequest`（`{ nodeId, sequence, documentRevision }`）。検索の中央移動とラベルの編集の要求が共有する |
| domain | `domain/nodes/nodeParentInsertion.ts` | 型（`useNodes` の戻り値の `InsertParentNodeResult` を含む全型）、ボタンの有効・無効 `canInsertParentNode`、挿入 `insertParentNode` |
| domain | `domain/nodes/nodeParentInsertionMessages.ts` | 失敗の通知の文言 `formatNodeParentInsertionFailureNotice` |
| hooks | `hooks/useNodeParentInsertionAction.ts` | ボタンの状態、挿入の要求、通知、ラベルの編集の要求 |
| hooks | `hooks/useRevisionScopedNodeRequest.ts` | `useRevisionScopedNodeRequest(documentRevision)`。要求の採番（`issueRequest(nodeId)`）と、`documentRevision` が違う要求を隠す絞り込み |
| hooks | `hooks/treeChangeOutcome.ts` | `settleTreeChangeOutcome`。`applyTreeChange` の後で、候補の計算の結果と確定できたかから、操作の結果（`placement-failed` を含む）を決める |
| components | `components/layout/NodeParentInsertControl.tsx` | ヘッダーの「親を挿入」 |
| components | `components/map/nodeParentInsertionShortcut.ts` | 入力の型 `NodeParentInsertionShortcutInput`、判定 `resolveNodeParentInsertionShortcut` |
| components | `components/map/useNodeParentInsertionShortcut.ts` | `window` の `keydown` の登録 |
| components | `components/map/useNodeLabelEditRequest.ts` | ラベルの編集の要求を受けて編集を始める |
| components | `components/map/nodeRequestProcessing.ts` | `classifyNodeRequest`。ノードへの要求を `skip` / `discard` / `ready` に振り分ける純関数（`useNodeFocusRequest` と `useNodeLabelEditRequest` が共有） |

変える既存のファイル: `domain/nodes/nodePlacement.ts`（`createParentNode` を足す）、`domain/nodes/nodeIndentPlacement.ts`（`applyBranchPlacement` を公開して挿入と共有する）、`domain/nodes/nodeIndent.ts`（共有した配置の関数を使う）、`domain/nodes/nodeTree.ts`（`indexFirstNodes`）、`hooks/useNodes.ts`（`insertParentNode`。確定後の結果は `settleTreeChangeOutcome` で決める）、`hooks/useNodeSearchNavigation.ts`・`components/map/useNodeFocusRequest.ts`（要求の採番・絞り込みと振り分けを共有の部品へ移す）、`hooks/useRevisionScopedNotice.ts`（`clearNotice`）、`components/map/useNodeKeyboardShortcuts.ts`（`Alt` を含む `Enter`）、`components/map/NodeLabelEditor.tsx`（リピートの `Enter`）、`components/map/treeEditShortcutGuard.ts`（目印のコメントだけ）、`components/layout/LayoutModeOperationHint.tsx`、`components/map/MapEditor.tsx`、`components/map/MapStage.tsx`、および既存のテスト（`useNodeKeyboardShortcuts`・`NodeLabelEditor`・`useRevisionScopedNotice`・`LayoutModeOperationHint`・`nodeTree`（`indexFirstNodes`）・`nodeIndentPlacement`（`applyBranchPlacement`）のテストへの追加と、`MapStage` を直接描くテストへの新しい必須 props の追加）。

## 用語

- **T**: 親を入れる対象（選択中のノード）。**T の枝**: T と全子孫（折りたたみ・表示レベルで隠れた子孫を含む。`collectSubtreeIds`）。
- **P**: T の元の親（T がルートなら無い）。
- **N**: 挿入する新しいノード。挿入の後、N の親は P（T がルートなら `null`）、T の親は N。
- **見える**: 表示集合 V（`useMapDisplayState` の `visibleNodeIds`）に含まれること。
- **F**: 配列で最初のルート（`parentId === null` の最初のノード）。自動配置の基準。

## 挿入の規則

### 型（`domain/nodes/nodeParentInsertion.ts`）

```ts
export type NodeParentInsertionFailureReason =
  | "node-missing"       // T が無い
  | "node-hidden"        // T が見えていない
  | "invalid-structure"  // T の親が配列に無い、T が自分自身を親にしている
  | "id-conflict"        // 渡された新しい ID が既存のノードと重なる
  | "placement-failed";  // 手動配置の座標が有限でない・桁落ちする・間隔が取れない、自動配置の失敗

export type NodeParentInsertionResult =
  | { ok: true; nodes: Node[]; insertedId: number }
  | { ok: false; reason: NodeParentInsertionFailureReason };

// useNodes.insertParentNode の戻り値（hooks と messages の両方がここから import する）
export type InsertParentNodeResult =
  | { ok: true; insertedId: number }
  | { ok: false; reason: NodeParentInsertionFailureReason };
```

- 型を `hooks/useNodes.ts` に置かない理由は上げ下げと同じ（domain の文言の関数が hooks を import しないため）。

### `canInsertParentNode(nodes, nodeId, visibleNodeIds): boolean`

- `nodeId` が `null` → `false`。
- `visibleNodeIds.has(nodeId)` が偽 → `false`。
- `nodes` を1回走査し、`id === nodeId` のノードがあれば `true`、無ければ `false`。
- 座標の失敗や不正なデータ（親が無い）はここでは予測しない（押した後に失敗の通知を出す。上げ下げと同じ）。

### 新しいノードの値（`domain/nodes/nodePlacement.ts` の `createParentNode(target, id)`）

```ts
export function createParentNode(target: Node, id: number): Node;
```

既存の非公開の `createNode(id, parentId, x, y)` に `target.parentId`・`target.x`・`target.y` を渡し、`importance` だけを `target.importance` に置き換える。結果は `{ id, parentId: target.parentId, x: target.x, y: target.y, width: RECT_WIDTH, height: RECT_HEIGHT, label: "", importance: target.importance }`。`illustration` は持たない。新しいノードの既定値（大きさ・空のラベル）を `nodePlacement.ts` の1か所に保つ。

### `insertParentNode(nodes, nodeId, newNodeId, visibleNodeIds, mode): NodeParentInsertionResult`

1. **検査**（この順で、最初に当たったものを返す）
   - `nodes` を1回走査して、`id === nodeId` の最初のノード T、`id === newNodeId` のノードの有無、T の親の候補（`id === T.parentId`）の有無を求める（T の親の照合は T が見つかった後でよいので、`Map` で ID → 最初のノードを引けるようにしてから行ってよい。上げ下げの `indexFirstNodes` と同じ）。
   - T が無い → `node-missing`。
   - `!visibleNodeIds.has(T.id)` → `node-hidden`。
   - `T.parentId === T.id`、または `T.parentId !== null` で親が配列に無い → `invalid-structure`。
   - `newNodeId` のノードがある → `id-conflict`。
   - T の祖先の鎖のもっと長い循環は確かめない。挿入は T と P の間に N を入れるだけで循環を増やさず、読み込み時には `validateMapDocumentGraph` が循環を拒否する。
2. **新しいノード**: `N = createParentNode(T, newNodeId)`。
3. **配列（段階1）**: `nodes` を1回走査して `staged` を作る。T に出会ったら、N を積んでから T をそのまま積む。それ以外のノードは同じオブジェクトのまま積む。`staged` では N に子が無い（T の親はまだ P）。
4. **座標**
   - `mode === "manual"`: `translation = calculateIndentTranslation(staged, T.id, N.id)`。`null` なら `placement-failed`。
   - `mode === "auto"`: 座標は変えない（この後に `applyTreeChange` が `layoutNodeForest` で決める）。
5. **配列（段階2）**: `staged` を1回走査して、T を `T' = { ...T, parentId: N.id }` に置き換えた配列 `reparented` を作る（ほかは同じオブジェクト）。
   - `mode === "manual"`: `placed = translateBranch(reparented, T.id, translation)`。`null` なら `placement-failed`（途中まで動いた配列を返さない）。
   - `mode === "auto"`: `placed = reparented`。
6. **結果**: `{ ok: true, nodes: placed, insertedId: newNodeId }`。

- `staged` と `reparented` を分けるのは、座標の計算を「N に子が無い状態」で行うため（`calculateIndentTranslation` は新しい親の既存の子の下端を見るので、T が N の子になった後の配列で呼ぶと、T 自身の下端から 40 下に置いてしまう）。どちらも1回の走査で作る。
- `translateBranch` は根 T に式の値をそのまま入れ、子孫を `(dx, 0)` だけ動かす。N は T の枝に含まれないので動かない。

### 例（配列の動き）

括弧は親。`(隠)` は見えていない兄弟、`(閉)` は閉じたノード。子孫は、書いていないものも配列のどこにあっても動かない。

| 例 | 操作前 | 操作 | 操作後 | 木 |
| :--- | :--- | :--- | :--- | :--- |
| P1 | `R, A(R), T(R), B(R)` | T に親を入れる | `R, A, N(R), T'(N), B` | R の子は A, N, B（N が T のいた位置）。N の子は T |
| P2 | `R, T(R), Tc(T), A(R)` | T に親を入れる | `R, N(R), T'(N), Tc, A` | Tc は T の子のまま。配列の位置も変えない |
| P3 | `R, Tc(T), T(R), A(R)` | T に親を入れる | `R, Tc, N(R), T'(N), A` | 子が配列で T より前にある場合（並べ替えの後など）。Tc の位置は変えない |
| P4 | `R1, T(null), R2` | T に親を入れる | `R1, N(null), T'(N), R2` | ルートの並びは R1, N, R2 |
| P5 | `T(null), R2` | T に親を入れる | `N(null), T'(N), R2` | T が先頭のルート F だった。N が新しい F になる |
| P6 | `R, H(R・隠), T(R), B(R)` | T に親を入れる | `R, H, N(R), T'(N), B` | 隠れた兄弟 H は R の子のまま、順も変わらない |
| P7 | `R, T(R・閉), Tc(T)` | T に親を入れる | `R, N(R), T'(N・閉), Tc` | T は閉じたまま、N は開いている。Tc は隠れたまま |
| P8 | `R, T(R・隠)` | T に親を入れる | （変わらない） | `node-hidden` |
| P9 | `T(X)`（X は配列に無い） | T に親を入れる | （変わらない） | `invalid-structure` |

「元に戻す」1回で、挿入の前の配列にそのまま戻る（N が消え、T の `parentId` と座標が戻る）。

## 手動配置の座標

`calculateIndentTranslation(staged, T.id, N.id)` が求める値（上げ下げの設計の「下げるとき」の式）を、N の値に当てはめると次になる。

1. `right = checkedAdd(N.x, N.width)`（`N.x = T.x`、`N.width = 100`）、`rootX = checkedAdd(right, CHILD_HORIZONTAL_GAP)`（120）。どちらかが `null`、または `hasSufficientGap(right, rootX, 120)` が偽なら失敗。
2. `staged` で N に子は無いので、`rootY = N.y = T.y`（有限でなければ失敗）。
3. `dx` は `rootX` と `T.x` の差（`checkedSubtract`。丸めの許容誤差以下なら 0 だが、差は約 220 なので 0 にはならない）、`dy` は `rootY === T.y` なので 0（差を計算しない）。
4. `translateBranch` が、T を `(rootX, T.y)` に、子孫を `x + dx`（`checkedAdd`）に動かす。`y` は変えない。

- 失敗の条件: `T.x`・`T.y` が有限でない、`T.x + 100` や `+ 120` が桁落ちする（`T.x` がおよそ `2^60` を超えると `+ 100` が丸めで消える）、子孫の `x + dx` が桁落ち・溢れる。どれも `placement-failed` で、何も変えずに失敗の通知を出す。幅が既定の 100 で間隔が 120 なので、`hasSufficientGap` の検査だけが偽になる座標は、`checkedAdd` の桁落ちより先には現れない（検査は再利用する関数の中に残る）。
- 重なりは避けない。T の枝の右側にノードがあると、動かした枝が重なることがある（ユーザーの決定）。
- 閉じた T の隠れた子孫、表示レベルで隠れた子孫も一緒に動く（`collectSubtreeIds` は表示によらない）。
- 縦位置は変えないので、T の子が T より上にある枝（自動配置から手動配置へ切り替えたマップ）でも、枝の形はそのまま右へずれるだけである。

### 例（ノードはすべて幅 100、高さ 60）

- **例 M1（基本）**: R (0, 0)。R の子 A (220, 0)、T (220, 100)、B (220, 200)。T の子 Tc (440, 100)。T に親を入れる。N → (220, 100)。`rootX = 220 + 100 + 120 = 440`、`dx = 220`、`dy = 0`。T → (440, 100)、Tc → (660, 100)。R・A・B は動かない（同じオブジェクト）。
- **例 M2（T が既定でない大きさ）**: M1 で T が高さ 116・幅 140（JSON から読み込んだノード。アプリ内でイラストを付けても幅は 100 のまま）。N は高さ 60・幅 100（T の大きさを写さない）。T の新しい `x` は N の幅で決まるので、T の幅 140 を使う誤りとは結果が異なる。N → (220, 100)、T → (440, 100)。
- **例 M3（右側のノードと重なる）**: R (0, 0)。R の子 A (220, 0)、A の子 A1 (440, 0)・A2 (440, 100)。R の子 T (220, 100)。T に親を入れると T → (440, 100) で、A2 と同じ位置に重なる（避けない）。
- **例 M4（子が根より上）**: T (220, 100)、T の子 Tc1 (440, 50)・Tc2 (440, 150)。T → (440, 100)、Tc1 → (660, 50)、Tc2 → (660, 150)。
- **例 M5（溢れ・桁落ち）**: T の `x` が `1e19` なら `checkedAdd(1e19, 100)` が桁落ち（結果が変わらない）で `placement-failed`。T (0, 0) の子 Tc の `x` が `Number.MAX_VALUE` なら、`Number.MAX_VALUE + 220` は `Number.MAX_VALUE` に丸まり、`checkedAdd` が桁落ちと判定して `placement-failed`（途中まで動いた配列を返さない）。
- **例 M6（非有限）**: T の `y` が `NaN` なら、`calculateIndentTranslation` の「新しい親の `y` が有限か」の検査（N の `y` は T の `y`）で `placement-failed`。

## 自動配置と先頭のルート

自動配置の基準は F の `x` / `y` である（`layoutNodeForest` は F の `x` を最初の列、F の `y` を F の位置としてそのまま使う）。

- **T がルートでないとき**: ルートの集合も順も変わらないので、F は同じオブジェクトのまま。
- **T がルートで F でないとき**: N は T の位置に入るので、F より後ろ。F は同じオブジェクトのまま。
- **T が F のとき**（例 P5）: N が新しい F になる。N には T の `x` / `y` を入れているので、`layoutNodeForest` の後も F の位置（左上）は挿入の前と同じになる。T は N の子として右の列に並ぶ。

したがって、並べ替えの `applyAutoFirstRoot` に当たる座標の引き継ぎは別に書かない（`createParentNode` が T の座標を写すことがその役目を果たす）。テストで「T が F のとき、`layoutNodeForest` の後の N の `x` / `y` が挿入の前の T の `x` / `y` と等しい」「T が F でないとき、F のオブジェクトが同じ（`toBe`）」ことを固定する。

## useNodes の操作

```ts
// hooks/useNodes.ts の UseNodesReturn
// nodeId のノードと親の間に新しいノードを入れる。applyTreeChange を1回だけ呼び、成功時は新しいノードを選択する。
// documentRevision は変えない。失敗時は何も変えない
insertParentNode: (
  nodeId: number,
  visibleNodeIds: ReadonlySet<number>,
) => InsertParentNodeResult;
```

- `applyTreeChange` のコールバックで、`id = nodeIdAllocatorRef.current!.nextAvailableId(currentNodes)` を採番し、`insertParentNode(currentNodes, nodeId, id, visibleNodeIds, mode)`（domain の関数。フックの関数と名前が同じなので、import では `insertParentNode as computeParentInsertion` などの別名を付ける）を呼ぶ。失敗なら結果を控えて `null`、成功なら `insertedId` を控えて `nodes` を返す。採番して確定しなかった ID は欠番のままにする（既存の規則）。
- `applyTreeChange` が `false` を返し、控えた失敗が無い場合（自動配置の `layoutNodeForest` の失敗）は `placement-failed`。控えた成功があっても `applyTreeChange` が `false` なら `placement-failed`。
- 成功したら `setSelectedNodeId(insertedId)`（`addChildNode` と同じ）。`documentRevision` は変えない。失敗したときは、ノード・選択・履歴・Redo を変えない。
- ラベルの編集の開始と通知はここでは行わない（`useNodeParentInsertionAction` が行う）。

## useNodeParentInsertionAction の入出力

```ts
// hooks/useNodeParentInsertionAction.ts
type UseNodeParentInsertionActionOptions = {
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

type UseNodeParentInsertionActionReturn = {
  canInsert: boolean;                               // canInsertParentNode の結果
  insertSelected: () => void;                       // ヘッダーのボタン用。未選択なら何もしない
  insert: (nodeId: number) => void;                 // MapStage の onInsertParentNode にそのまま渡す
  labelEditRequest: NodeLabelEditRequest | null;    // MapStage の labelEditRequest に渡す
};
```

- `canInsert` は `useMemo` で `nodes`・`selectedNodeId`・`visibleNodeIds` が変わったときだけ求める。3つの入力をすべて依存に入れる（L-612）。
- 要求の採番と `documentRevision` による絞り込みは、自分では持たず `useRevisionScopedNodeRequest(documentRevision)` に任せる（`useNodeSearchNavigation` の中央移動の要求と同じ部品）。部品は `{ request, issueRequest }` を返す。
- `insert(nodeId)`:
  1. `result = insertParentNode(nodeId, visibleNodeIds)`（受け取った `visibleNodeIds` をそのまま渡す）。
  2. `result.ok` なら、`clearNotice()` を呼び、`issueRequest(result.insertedId)` を呼ぶ（`{ nodeId: result.insertedId, sequence: 前の sequence + 1, documentRevision }` が控えられる）。
  3. 失敗なら `publishNotice(formatNodeParentInsertionFailureNotice(result.reason))` を1回呼ぶ。要求は変えない。
- `labelEditRequest` は部品の `request` をそのまま返す。控えた要求の `documentRevision` が今の `documentRevision` と等しいときだけ返り、違えば `null`（`useNodeSearchNavigation` の `focusRequest` と同じ）。
- `insertSelected()` は `insert(selectedNodeId)` と同じ。

## ラベルの編集の開始（`useNodeLabelEditRequest`）

```ts
// components/map/useNodeLabelEditRequest.ts
type UseNodeLabelEditRequestOptions = {
  request: NodeLabelEditRequest | null;
  documentRevision: number;
  nodes: readonly Node[];                 // MapStage の nodes（表示用）
  hasActiveGesture: () => boolean;
  cancelActiveGesture: () => void;
  startEditing: (nodeId: number, initialText?: string) => void;
};
```

- `useLayoutEffect` で、`request` が変わったときに処理する。処理済みの `sequence` を ref に控え、同じ `sequence` は二度処理しない（StrictMode の二重実行でも1回）。
  振り分けは純関数 `classifyNodeRequest(request, processedSequence, documentRevision, nodes)`（`components/map/nodeRequestProcessing.ts`。`useNodeFocusRequest` と共有）で行い、結果の `kind` ごとに処理する。判定の順は次のとおり。
  1. `request === null`、または `sequence` が処理済み → `skip`（何もしない）。
  2. `request.documentRevision !== documentRevision` → `discard`（処理済みにして何もしない）。
  3. `nodes` に `request.nodeId` が無い → `discard`（処理済みにして何もしない。後で現れても始めない）。
  4. それ以外は `ready`。処理済みにし、`hasActiveGesture()` なら `cancelActiveGesture()` を呼び、`startEditing(request.nodeId, "")` を呼ぶ。
- `useLayoutEffect` にする理由: 挿入の commit の描画の直後、画面に出る前に入力欄を描き、`autoFocus` でフォーカスを移すため（`useEffect` だと、N が選択されたが入力欄の無い状態が一瞬描かれる）。
- 入力欄（`NodeLabelEditor`）は `autoFocus` を持つので、描かれた時点でフォーカスがボタンや `body` から入力欄へ移る。`Tab`・`Enter` の追加で使う部品・`startEditing` と同じなので、確定（`Enter`・`blur`）・取り消し（`Escape`）・空の確定（`label: ""` のまま、表示は「新しいノード」）の挙動も同じになる。
- `MapStage` は `useHiddenNodeInteractionReset` の後で呼ぶ。N は見えているので、隠れたノードの編集の破棄とは競合しない。

## ラベルの入力欄のリピートの Enter

- **問題**: ヘッダーの「親を挿入」にフォーカスして `Enter` を押し続けると、最初の `keydown` でボタンが押され、挿入が成功して入力欄が描かれ、フォーカスが入力欄へ移る。続くリピートの `keydown` は入力欄に届き、`NodeLabelEditor` の `Enter`（`blur` で確定）が N の空のラベルを確定して入力欄を閉じる。フォーカスは `body` に落ち、さらに続くリピートの `Enter` は `useNodeKeyboardShortcuts` の兄弟の追加になり、追加 → 編集 → リピートで確定 → 追加…と、手を離すまでノードが増え続ける（L-408 の「フォーカスを移した先に届くリピート」）。ボタンの側でリピートを止めても、リピートはもうボタンに届かないので止まらない。
- **今の挙動の確認**: `body` で `Enter` を押し続けたときも、今の実装では同じ連鎖が起きる（`useNodeKeyboardShortcuts` も `NodeLabelEditor` も `repeat` を見ない）。
- **決定**: `NodeLabelEditor` の `onKeyDown` で、`event.key === "Enter" && event.repeat` なら `preventDefault` して何もしない（確定しない）。`repeat` でない `Enter` と `Escape` は今までどおり。
- **これで十分な理由**: 入力欄で `repeat` の無い `Enter` を押すとすぐ確定して入力欄が閉じるので、入力欄に `repeat` の `Enter` が届くのは、入力欄が開く前から押し続けていたキーだけである。したがって、入力欄の中で意図して押した `Enter` の確定は変わらない。
- **既存の挙動への影響**: `body` で `Enter`（または `Alt` + `Enter`）を押し続けたとき、追加（挿入）は1回だけになり、入力欄が開いたまま残る（今までは手を離すまで兄弟が増え続けた）。`Tab` の押し続けは変わらない（入力欄に届くリピートの `Tab` はブラウザのフォーカス移動になり、`blur` で確定するだけ。今までどおり）。
- **ラベル編集中の `Alt` + `Enter`**: 入力欄の `Enter` の処理は修飾キーを見ないので、今までどおり確定になる（挿入はしない。ショートカットはラベル編集中に働かない）。
- `actionHandledRef` による二重確定の防止（L-473）は変えない。

## 履歴

- 1回の挿入（N の追加、T の `parentId` の変更、配列の位置、手動配置での枝の平行移動、自動配置での再配置）が Undo / Redo の1操作。8.1 の表に「親の挿入」を足す。
- 続くラベルの確定は別の1操作（同じ値（空文字）の確定は、既存の規則どおり履歴を増やさない）。
- 失敗では `applyTreeChange` が候補を返さないので、履歴も Redo も変えない。
- 成功した「元に戻す」「やり直す」は、既存の規則どおり選択を外し、`documentRevision` を上げる。枝の構造の変更の通知と、まだ処理していないラベルの編集の要求は、それで無効になる。

## 通知

### 枠

- 並べ替え・上げ下げと共有する8系統目の枠を使う。`MapEditor` の `useRevisionScopedNotice(documentRevision)` の `publishNotice` と、新しく足す `clearNotice` を `useNodeParentInsertionAction` へ渡す。
- `useRevisionScopedNotice` に `clearNotice: () => void`（`setStored(null)`）を足す。既存の呼び出し元は受け取らなくてよい（戻り値に足すだけ）。
- 系統の数は8のまま。名前を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入）」に直す。

### 文言（`formatNodeParentInsertionFailureNotice(reason): OperationNotice`）

| 結果 | `kind` | 文言 |
| :--- | :--- | :--- |
| 成功 | — | 通知を出さず、枠を空にする |
| `node-missing`・`node-hidden`・`invalid-structure`・`id-conflict`・`placement-failed` | `error` | `親ノードを挿入できませんでした。` |

- 関数は理由を `switch` で網羅する（L-001）。
- **読み上げ**: 失敗の文言は理由によらず同じなので、失敗が続くと2回目以降は読み上げられないことがある（既知の制限。ほかの通知と同じ。L-166）。間に成功の挿入があると枠が空になるので、次の失敗の通知は新しく描かれる。成功の通知は出さないので、成功の文言が同じで読み上げられない問題は起きない。
- **出す場面**: ショートカット・ボタンで挿入を試みて失敗したときに、結果ごとに1つ出す。

## UI

### ヘッダーのボタン（`NodeParentInsertControl`）

```ts
type NodeParentInsertControlProps = {
  canInsert: boolean;
  onInsert: () => void;
};
```

- 置き場所: `operationControls` の中、`NodeIndentControl` の右隣、`CLIPBOARD_OPERATION_HINT` の前。見た目は `NodeIndentControl` と同じ `buttonClassName`。

| 項目 | 値 |
| :--- | :--- |
| 表示する文字 | `親を挿入` |
| `aria-label` | `選択中のノードに親を挿入` |
| `aria-keyshortcuts` | `Alt+Enter` |
| `title` | `選択中のノードに親を挿入（Alt/Option+Enter）` |
| `disabled` | `!canInsert` |

- `aria-label` は表示する文字「親を挿入」を含む（見える名前と読み上げる名前を一致させる）。
- `disabled` 属性で実際に押せなくする（L-058）。無効なのは、未選択と、T が見えていないとき（選択が隠れると選択は外れるので、通常は未選択だけ）。
- **ショートカットの目印**: `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE` を付ける。5つのボタンのどれにフォーカスがあっても、`Alt` + `↑` / `↓` / `←` / `→` / `Enter` が働く。ボタン自身はこれらのキーを処理しない。`treeEditShortcutGuard.ts` の目印のコメントを「兄弟の順序・階層・親の挿入のボタン」に直す。
- **Enter の押し続け**: `onKeyDown` で、`event.key === "Enter" && event.repeat` なら `preventDefault` する（L-408）。Space は止めない。挿入が成功するとフォーカスは入力欄へ移るので、リピートが入力欄へ届く分は `NodeLabelEditor` の側で止める（前の節）。2つの対策は組で働くので、片方だけを消さない。
- **フォーカス**: 押した後、アプリはボタンのフォーカスを操作しない。成功すると入力欄の `autoFocus` でフォーカスが入力欄へ移る。失敗するとボタンに残る。
- **クリック**: `event.detail` では弾かない。ダブルクリックは2回の挿入として扱う（「枝を複製」と同じ。L-150）。
- `pointerdown` の既定の動作は止めない（編集中のラベルを `blur` で確定してから挿入するため）。

### 操作ヒント

`LayoutModeOperationHint.tsx` の両モードの文言の末尾に `・Alt(Option)+Enterで親を挿入` を足す。

- 手動配置: `…・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ・Alt(Option)+Enterで親を挿入`
- 自動配置: `…・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ・Alt(Option)+Enterで親を挿入`

### ショートカット

#### 判定（`components/map/nodeParentInsertionShortcut.ts`）

```ts
export type NodeParentInsertionShortcutInput = TreeEditShortcutInput & { repeat: boolean };
export type NodeParentInsertionShortcutAction = "insert" | "suppress";

export function resolveNodeParentInsertionShortcut(
  input: NodeParentInsertionShortcutInput,
): NodeParentInsertionShortcutAction | null;
```

- `passesTreeEditShortcutGuard(input)` が偽なら `null`（`Alt` だけを押している、IME でない、`defaultPrevented` でない、ラベル編集中でない、目印のあるボタン以外の対話要素でない、選択している、ジェスチャー中でない）。
- `key !== "Enter"` なら `null`。
- `repeat` が真なら `"suppress"`、偽なら `"insert"`。

#### `useNodeParentInsertionShortcut`（`components/map/useNodeParentInsertionShortcut.ts`）

```ts
type UseNodeParentInsertionShortcutOptions = {
  selectedNodeId: number | null;
  isEditing: boolean;
  hasActiveGesture: () => boolean;
  enabled: boolean;
  onInsertParentNode: (nodeId: number) => void;
};
```

`useNodeIndentShortcut` と同じ形にする（最新の options を ref に控え、`window` の `keydown` の登録は1回だけ）。`keydown` で:

1. `enabled` が偽なら何もしない（`preventDefault` もしない）。
2. `createTreeEditShortcutInput(event, …)` に `repeat: event.repeat` を足して判定する。
3. `"insert"` なら、`preventDefault` してから `onInsertParentNode(selectedNodeId)` を呼ぶ。
4. `"suppress"` なら、`preventDefault` だけする（目印のボタンの上で押し続けても、ボタンが押されない）。
5. `null` なら何もしない。

`MapStage` は新しい必須の props `onInsertParentNode` を受け取り、`useNodeParentInsertionShortcut({ selectedNodeId, isEditing: editing.editingNodeId !== null, hasActiveGesture, enabled: shortcutsEnabled, onInsertParentNode })` を `useNodeIndentShortcut` の直後で呼ぶ。`MapEditor` は `nodeParentInsertion.insert` を渡す。

#### 既存の `Tab`・`Enter`（`useNodeKeyboardShortcuts`）

- `event.key === "Enter"` の分岐を `event.key === "Enter" && !event.altKey` にする。`Alt` を含む `Enter` では兄弟を追加せず、`preventDefault` もしない（親の挿入の判定に任せる）。
- `Tab`・`Delete`・`Backspace` と、`Ctrl`・`Cmd`・`Shift` だけと併用した `Enter` は変えない（理由は「決めたこと」）。
- 2つのリスナーは同じ `window` の `keydown` に付くが、`Alt` を含む `Enter` を処理するのは親の挿入の判定だけになるので、登録の順によらず1回の `keydown` で兄弟の追加と挿入の両方が起きることは無い。

## 既存の操作との関係

親の挿入に関わる既存の操作と入口を、`MapEditor`・`MapStage` の props とフックから列挙して1つずつ決めた（L-061）。

| 既存の操作 | 関係 |
| :--- | :--- |
| 子・兄弟の追加（`Tab` / `Enter`。3.2 節） | `Alt` を含む `Enter` は兄弟を追加しなくなる（`Ctrl`・`Cmd`・`Shift` だけとの併用は今までどおり追加する）。`Enter` を押し続けても追加は1回だけになり、入力欄が開いたまま残る（ラベルの入力欄がリピートの `Enter` で確定しなくなるため）。`Tab` は変えない。挿入の後のラベルの編集は、`Tab`・`Enter` と同じ部品と規則 |
| ラベルの編集（3.4 節） | リピートの `Enter` では確定しない。それ以外（`Enter`・`blur` での確定、`Escape` での取り消し、空の確定の扱い）は変えない。編集中に「親を挿入」を押すと、編集を確定してから挿入する |
| 兄弟の順序変更（14 章）・階層の上げ下げ（15 章） | 通知の枠、ショートカットの共通の条件、ボタンの目印の属性を共有する。5つのボタンのどれにフォーカスがあっても5つのショートカットが働く。挿入の後は、N を並べ替えたり、上げ下げしたりできる。「親を挿入」はもう一方のボタンへのフォーカスの引き継ぎを使わない |
| 枝の折りたたみ（10 章） | `documentRevision` を上げないので、折りたたみは保つ。閉じた T は閉じたまま、N は開いた状態。T の親が閉じていれば T は見えず、挿入しない。展開の操作はしない |
| 表示レベル（5 章） | T が見えていることが条件。N は T の重要度を引き継ぎ、T の祖先なので見える。隠れた兄弟は消さない・並びを変えない |
| ノード検索（9 章） | 変えない。N は T の直前に入るので、候補で N が T の前に出る |
| 枝の複製・コピー・貼り付け（3.8 節、3.9 節） | 変えない。挿入の後に N を複製・コピーすると、N・T・子孫がまとめて対象になる |
| 削除・接続（3.5 節、3.7 節） | 変えない。N を削除すると T の枝ごと消える（ノードだけの削除は未実装の別項目）。`Shift` + ドラッグの接続で、N の下へ別の枝を付け替えられる |
| 手動配置のドラッグ移動・自動配置のドラッグ（並べ替え） | 変えない。ドラッグの途中はショートカットが働かない。ボタンで挿入して編集を始めるときにジェスチャーが進行中なら中止する |
| `F` キー | 変えない。ラベル編集中は働かない（今までどおり） |
| 元に戻す / やり直す（8 章） | 挿入1回が1操作、続くラベルの確定が別の1操作。成功した Undo / Redo は選択を外し、折りたたみを全展開し、通知を消す（既存の規則） |
| マップの切り替え（12 章） | `MapEditor` ごと作り直すので、通知も編集の要求も残らない |
| マップのダイアログ・箇条書きからの追加のダイアログ | 開いている間は、根の `inert` でボタンが押せず、ショートカットは `editorShortcutsEnabled` で止まる |
| コンテキストメニュー | 変えない（項目を足さない） |
| JSON の書き出し・読み込み（6.2 節） | 形式は変えない。N は通常のノードとして書き出され、読み込むと同じ木になる |
| PNG / SVG の書き出し（6.3 節） | 変えない。挿入の後の配置が出る |
| 自動保存（6.1 節） | 変えない。挿入とラベルの確定で `nodes` が変わると、通常の 300ms の自動保存に流れる |
| 配置モードの切り替え（4.1 節） | 変えない |
| 箇条書きからの追加（13 章） | 変えない。取り込んだ後の分類に使える |

## エラーと境界条件

| 条件 | 扱い |
| :--- | :--- |
| 未選択 | ボタンは無効。ショートカットは何もしない（通知も出さない、`preventDefault` もしない） |
| T が見えていない | ボタンは無効。ショートカットは選択が外れているので何もしない。同じイベントの中で隠れた場合は `node-hidden` の失敗の通知 |
| T の親が配列に無い・T が自分自身を親にしている | `invalid-structure`。何も変わらない |
| 新しい ID が既存と重なる（純関数の呼び出し元の誤り） | `id-conflict`。何も変わらない |
| 手動配置で座標が有限でない・桁落ちする・間隔が取れない | `placement-failed`。何も変わらず、選択も編集も変えない |
| 自動配置で `layoutNodeForest` が失敗する | `placement-failed`。何も変わらない |
| ショートカットの押し続け | 最初の1回だけ挿入する。続くリピートは入力欄に届き、確定しない（入力欄が開いていなければ `preventDefault` だけ） |
| ボタンの Enter の押し続け | 最初の1回だけ挿入する。続くリピートは入力欄に届き、確定しない |
| ボタンのダブルクリック | 2回の挿入（1回目の N の空のラベルを確定してから、その上に2つ目を入れる） |
| 大きなマップ | 1回の挿入は配列の走査数回と、自動配置なら全体の再配置1回。ボタンの有効・無効は、`nodes`・選択・表示集合が変わったときに1回の走査 |

## 受け入れ基準

1. ノードを選択して「親を挿入」または `Alt`（`Option`）+ `Enter` を押すと、選択中のノードと親の間に新しいノードが入る。新しいノードは元の兄弟の並びで選択中のノードがいた位置に入り、選択中のノード（と子孫）がその唯一の子になる。ルートでは、新しいノードがそのルートの位置で新しいルートになる。
2. 新しいノードは、選択中のノードの重要度を引き継ぎ、大きさは既定（100 × 60）、ラベルは空。挿入の後、新しいノードが選択され、空のラベルの入力欄が開いてフォーカスが入る。
3. 手動配置では、新しいノードが選択中のノードの元の位置に来て、選択中のノードは新しいノードの右端から 120px 右・同じ高さに来て、子孫は同じ量だけ右へ動く。右側のノードとの重なりは避けない。
4. 自動配置では、挿入した木で全体が並び直り、先頭のルートの位置は変わらない（先頭のルートに挿入したときは、新しいノードがその位置に来る）。
5. 閉じたノードに挿入すると、そのノードは閉じたまま、新しいノードは開いた状態。選択中のノードが見えていないときはボタンが無効。
6. 1回の挿入が1回の「元に戻す」で戻る（ラベルを確定した後は、1回目でラベル、2回目で挿入が戻る）。「やり直す」で同じ木と座標に戻る。
7. 失敗したときは何も変わらず、操作通知バーの8系統目に「親ノードを挿入できませんでした。」が出る。成功するとその枠は空になる。
8. `Alt` + `Enter` は兄弟を追加しない。`Enter`、`Shift` / `Ctrl` / `Cmd` + `Enter` は今までどおり兄弟を追加する。`Ctrl` + `Alt` + `Enter`・`Alt` + `Shift` + `Enter` は何もしない。
9. ラベル編集中・入力欄・5つのボタン以外のボタン・IME 変換中・ダイアログを開いている間・ジェスチャーの途中は、ショートカットが働かない。5つのボタンにフォーカスがある間は働く。ショートカット・ボタンの Enter の押し続けで、挿入が1回だけになり、入力欄が開いたまま残る。
10. 保存形式・JSON・履歴の形式は変わらない。挿入した木は自動保存・JSON の書き出しと読み込みで保たれる。
11. `npm run verify` が成功する。`docs/specifications/features.md`、`docs/specifications/data-model.md`、`docs/architecture/overview.md`、`docs/testing/browser-test-cases.md`、README 類、`ROADMAP.md` が実装に合っている。

## テスト方針

各テストを書いた後、規則ごとに「近い誤り」を変異として当て、落ちることを確かめる（L-616）。下に、データの偶然の性質で変異が生き残らないようにするための条件を書く。

### 純関数: `nodeParentInsertion.test.ts`

- `canInsertParentNode`: 未選択・不在・隠れている・見えている（ルート・ルートでない）。`nodes` を1回だけ走査すること（反復の回数を数える配列で包む）。
- `insertParentNode`（配列）: 例 P1〜P9 を1例1テストで写す（ID と `parentId` の並び）。
  - 結果に `buildNodeForestRelations` を通し、`childrenByParent` と `roots` の順が期待どおりであること（N が T のいた位置、T が N の唯一の子）。
  - T の後ろに兄弟がある入力（P1 の B、P4 の R2）で、「N を配列の末尾に足す」変異で兄弟の順が変わって落ちること。「N を T の直後に積む」変異で配列の順（`N, T'` の順）の確かめで落ちること。
  - 子孫とほかのノードのオブジェクトの同一性（`toBe`）と配列位置が変わらないこと。入力の配列を変えないこと。隠れた兄弟が全件残り、順が変わらないこと（L-460）。
  - `node-missing`・`node-hidden`・`invalid-structure`（親が無い、自分自身が親）・`id-conflict`。検査の順（T が隠れていて、かつ ID も重なる入力で `node-hidden`）。
- `insertParentNode`（N の値）: T の重要度を既定の `"medium"` 以外（`"high"` と `"low"` の両方）にし、N が引き継ぐこと（「既定の重要度を入れる」変異で落ちる）。T にイラストがあり高さ 116・幅 140 の入力で、N の大きさが 100 × 60 で `illustration` を持たないこと（「T の大きさを写す」変異で落ちる）。T の `x` と `y` を異なる 0 でない値（例 (220, 100)）にし、N の `x` / `y` が T と等しいこと（`x` と `y` の取り違えで落ちる）。N の `parentId` が T の元の親で、T の `parentId` が N の ID であること。ルートでは N の `parentId` が `null`。
- `insertParentNode`（手動配置）: 例 M1〜M4 の座標。M1 で T の右側にほかの枝があってもそのノードが動かないこと。M2 で N の右端（既定の幅 100）から 120 右に T が来ること（T の幅 140 を使う変異で落ちる）。閉じた T の隠れた子孫も動くこと。M5・M6 で `placement-failed`、途中まで動いた配列を返さないこと。`calculateIndentTranslation` を「T の親を変えた後の配列」で呼ぶ変異（T の `y` が T の下端 + 40 になる）で落ちること。
- `insertParentNode`（自動配置）: 座標を変えないこと。入力の座標を配置の結果と違う値にしておき（L-616 の「正規化済みの状態」を避ける）、手動配置の平行移動が入る変異（モードを `"manual"` に固定する）で落ちること。T が F のとき、続けて `layoutNodeForest` に通した後の N の `x` / `y` が挿入の前の T の `x` / `y` と等しいこと。T が F でないとき F のオブジェクトが同じ（`toBe`）で、`layoutNodeForest` の後も F の `x` / `y` が変わらないこと。

### 純関数: `nodePlacement.test.ts`（追加）

- `createParentNode`: 値の全項目（上の N の値の条件と同じ入力で）。

### 純関数: `nodeParentInsertionMessages.test.ts`

- 失敗の5つの理由がすべて `kind: "error"`・同じ文言になること（`it.each`）。

### 純関数: `nodeParentInsertionShortcut.test.ts`

- `Alt+Enter` → `"insert"`、`repeat: true` → `"suppress"`、`Alt+ArrowRight` などほかのキー → `null`、共通の条件を1つずつ外すと `null`（`Shift` / `Ctrl` / `Meta` の併用、IME、`keyCode` 229、`defaultPrevented`、ラベル編集中、未選択、ジェスチャー中、目印の無いボタン・入力欄）。目印付きのボタン（とその内側）で `"insert"`。条件を外した入力で `repeat: true` でも `null`（`"suppress"` にならない）こと。

### フック: `useNodesParentInsertion.test.ts`（`useNodesIndent.test.ts` に倣う）

- 手動配置・自動配置のそれぞれで成功。`selectedNodeId` が N になり、`documentRevision` が変わらないこと。1回の「元に戻す」で木と座標が戻り、「やり直す」で同じになること（1回の commit）。
- 失敗（`node-hidden`、`invalid-structure`、手動配置の `placement-failed`、自動配置の `layoutNodeForest` の失敗）で、ノード・選択・履歴・Redo が変わらないこと。
- T と新しい ID の解決が `applyTreeChange` の中の最新の配列で行われること。同じ `act` の中で `const created = addSiblingNode(a)!;` の直後に `insertParentNode(created, new Set([..., created]))` を呼び、成功して `created` の `parentId` が新しいノードの ID になること（描画時の古い `nodes` で判定すると `node-missing` で落ちる）。
- 続けて2回挿入して、すべてのノードの ID が異なることを確かめる（既存の ID との重複の回避そのものは、`nodeIdAllocator` の既存のテストが守る。`useNodes` は採番器を外から差し替えられないので、フックのテストでは重複を作らない）。

### フック: `useNodeParentInsertionAction.test.tsx`

- `canInsert` が、選択・表示集合・`nodes` のそれぞれの変化に合わせて変わること（3つの依存を1つずつ変える）。
- 成功で `clearNotice` が1回呼ばれ、`publishNotice` が呼ばれず、`labelEditRequest` が `{ nodeId: insertedId, sequence: 1, documentRevision }` になること。続けて成功すると `sequence` が 2 になること。失敗で `publishNotice` が文言と `kind` で1回呼ばれ、`clearNotice` が呼ばれず、`labelEditRequest` が変わらないこと（L-001）。
- `documentRevision` が変わると `labelEditRequest` が `null` になること。
- `insertSelected` が `selectedNodeId` で `insertParentNode` を呼び、`visibleNodeIds` をそのまま（`toBe`）渡すこと。未選択では呼ばないこと。

### 純関数: `nodeTree.test.ts`（追加）

- `indexFirstNodes`: ID ごとにノードを引けること（件数、同一の参照、無い ID は `undefined`）。同じ ID が重なっていると配列で最初のノードを引くこと。空の配列で空の Map を返すこと。

### 純関数: `nodeIndentPlacement.test.ts`（追加）

- `applyBranchPlacement`: 自動配置では計算の関数を呼ばず、受け取った配列をそのまま（`toBe`）返すこと。手動配置では計算した平行移動で枝を動かすこと（`translateBranch` の結果と等しい）。手動配置で平行移動が `null`、または根が配列に無いと `null` を返すこと。

### 純関数: `nodeRequestProcessing.test.ts`

- `classifyNodeRequest` の `skip`（要求なし・処理済み）・`discard`（世代違い・ノード無し）・`ready`。判定の順（処理済みが世代違いより先、世代違いがノード無しより先）を、条件を重ねた入力で固定する。

### 純関数: `treeChangeOutcome.test.ts`

- `settleTreeChangeOutcome`: 確定できて成功ならその結果、結果が `null`（候補を作れなかった）なら `placement-failed`、確定できなかった成功も `placement-failed`、失敗の結果はそのまま。

### フック: `useRevisionScopedNodeRequest.test.tsx`

- `issueRequest` で `sequence` が 1 から 1 ずつ進み、同じノードへの要求でも進むこと。`documentRevision` が変わると `request` が `null` になり、その後の `issueRequest` が新しい `documentRevision` で `sequence` を続けること。`issueRequest` の依存に `documentRevision` が入っていること（古い値で発行しない）。

### フック: `useRevisionScopedNotice.test.tsx`（追加）

- `clearNotice` で `notice` が `null` になり、その後の `publishNotice` で新しい通知が出ること。

### フック: `useNodeLabelEditRequest.test.tsx`（`useNodeFocusRequest.test.tsx` に倣う）

- 新しい `sequence` で `startEditing(nodeId, "")` が1回呼ばれること。同じ要求で再描画しても呼ばれないこと。`sequence` が増えると再び呼ばれること。
- `documentRevision` が違う要求、`nodes` に無いノードの要求で呼ばれず、その後にノードが現れても同じ `sequence` では呼ばれないこと。
- ジェスチャー中なら `cancelActiveGesture` の後に `startEditing` が呼ばれ（呼び出しの順を記録して確かめる）、ジェスチャーが無ければ `cancelActiveGesture` が呼ばれないこと。

### ショートカットのフック: `useNodeParentInsertionShortcut.test.tsx`（`useNodeIndentShortcut.test.tsx` に倣う）

- `enabled: false` のとき、選択中でも呼ばれず、`preventDefault` もしないこと。`enabled` を切り替えても登録をやり直さないこと。
- `Alt+Enter` で `onInsertParentNode(selectedNodeId)` が1回呼ばれ、`fireEvent.keyDown` の戻り値が `false`。`repeat: true` では呼ばれず戻り値が `false`。未選択の `body` への `Alt+Enter` では呼ばれず戻り値が `true`。入力欄への `Alt+Enter` では戻り値が `true`。

### `useNodeKeyboardShortcuts.test.tsx`（追加）

- `Alt+Enter` で `onAddSiblingNode` が呼ばれず、`dispatchEvent` の戻り値が `true`（`preventDefault` しない）こと。`Ctrl+Alt+Enter`・`Alt+Shift+Enter` でも呼ばれないこと。
- `Shift+Enter`・`Ctrl+Enter`・`Meta+Enter` では今までどおり呼ばれること（既存の挙動を固定する）。`Alt+Tab` の扱いは変えないこと（今までどおり子の追加）。

### `NodeLabelEditor.test.tsx`（追加）

- `fireEvent.keyDown(input, { key: "Enter", repeat: true })` の戻り値が `false` で、`onCommit` が呼ばれないこと。続けて `repeat: false` の `Enter` で `onCommit` が1回呼ばれること（L-408。`repeat` を明示する）。`Escape` の取り消しは変わらないこと。

### 部品: `NodeParentInsertControl.test.tsx`

- 表示する文字、`aria-label`、`aria-keyshortcuts`、`title`。
- `canInsert: false` で `disabled` 属性が付き、クリックで `onInsert` が呼ばれないこと（L-058）。`detail: 0`（キーボードのクリック）と `detail: 2` のクリックでも `onInsert` が呼ばれること（L-408 の detail の固定。ダブルクリックを2回の操作として扱う）。
- Enter の押し続け（`repeat: true`）の `keyDown` の戻り値が `false`、`repeat: false` と Space の `repeat: true` では `true`（L-408）。
- ボタンに `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE` が付くこと。ボタンへの `Alt+Enter` では `onInsert` を呼ばないこと（ボタン自身は処理しない）。

### 部品: `LayoutModeOperationHint.test.tsx`（変更）

- 両モードの文言の全文。

### ページの結合テスト: `app/__tests__/pageParentInsertion.test.tsx`（`pageNodeIndent.test.tsx` に倣い、実際の `Home` から。L-060）

- 手動配置: R の子 A・B・C を作り、B を選択して「親を挿入」→ R の子の並びが A, N, C で、N の子が B であること。N と B の座標が例 M1 の式どおり。N が選択され、`node-label-input` にフォーカスがあること（`document.activeElement`）。ラベルを入れて `Enter` で確定すると、フォーカスが `body` に戻ること。続けて N を選択したまま「親を挿入」をもう一度押すと、2つ目の新しいノードの入力欄へフォーカスが移ること（連続の確認。L-617 の考え方）。
- 1回目の「元に戻す」でラベル、2回目で挿入が戻り、「やり直す」で同じになること。
- `Alt+Enter` を `body` に送って同じ結果になり、兄弟が増えないこと（ノード数が1つだけ増え、増えたノードが B の親であること）。`Enter` で兄弟が増えること（変えていないこと）。`Ctrl+Alt+Enter` で何も変わらないこと。ラベル編集中・検索入力欄・5つのボタン以外のヘッダーのボタンへの `Alt+Enter` で何も変わらないこと。「上へ」「階層を下げる」にフォーカスがあるまま `Alt+Enter` を送ると挿入されること、「親を挿入」にフォーカスがあるまま `Alt+ArrowRight` を送ると下がること（目印の共有）。
- `Alt+Enter` の直後に入力欄へ `Alt+Enter` の `repeat: true` を送っても、入力欄が開いたままでノードが増えないこと。`body` で `Enter` を押した直後に入力欄へ `Enter` の `repeat: true` を送っても、入力欄が開いたままであること。
- ラベル編集中（A のラベルを編集）に `userEvent.click` で「親を挿入」を押すと、A のラベルが確定してから A の上に親が入り、新しいノードの編集になること。
- 閉じた C に挿入すると、C は閉じたまま（「枝を展開」の表示）、N は開いていること。表示レベルを「高のみ」にして T が見えない状態ではボタンが無効なこと。重要度「高」の T に挿入すると、N の重要度セレクターが「高」であること。
- 自動配置: 先頭のルートに挿入すると、新しいノードの位置が元の先頭のルートの位置と等しいこと。
- 失敗: `x` が `1e19` のノードを含む手動配置のマップを保存データに置いてから開き（`pageNodeIndent.test.tsx` の `1e17` の座標のマップと同じ方法）、そのノードに挿入すると何も変わらず「親ノードを挿入できませんでした。」が出ること。続けてほかのノードに挿入すると、その通知が消えること。並べ替えの通知の後に挿入すると、通知が消えること。
- 箇条書きのダイアログを開いている間に、`body` へ `Alt+Enter` を送っても変わらないこと（L-061）。
- 挿入の後の自動保存で、保存された本体の `nodes` の `parentId` と順が期待どおりであること。
- 配線の変異: `MapEditor` が `MapStage` に `onInsertParentNode` や `labelEditRequest` を渡さない、ヘッダーへ `canInsert` の代わりに上げ下げの `canIndent` を渡す、`clearNotice` を渡さない、`publishNotice` を別の枠へ渡す、などの変異でどれかのテストが落ちること（`canInsert` と `canIndent` が違う状態、たとえば先頭の兄弟を選んだ状態を作って確かめる。L-060）。

## 既存の文書の更新

各文書を「8系統」「枝の構造の変更の通知」「data-tree-edit-shortcut-button」「4つのボタン」「Enter」「Phase 14」「途中への親」で grep し、注記が要る箇所をすべて直す。

- `docs/specifications/features.md`
  - 目次と新しい「16. 途中への親ノード挿入」の章（節: 16.1 操作、16.2 挿入の規則（例 P の表）、16.3 手動配置の座標（式と例 M1〜M6）、16.4 自動配置と先頭のルート、16.5 折りたたみと表示レベル、16.6 履歴・選択・ラベルの編集・通知（失敗の文言、成功で枠を空にすること、同じ文言の失敗が続くと読み上げられない既知の制限）、16.7 キーボードとフォーカス（入力欄へのフォーカスの移動、押し続け、`Alt` を含む `Enter` と兄弟の追加）、16.8 既存の操作との関係、16.9 対象外）。並べ替え・上げ下げと同じく機能ごとに章を分ける。
  - 1.1 の Phase 14 の行に「途中への親ノード挿入」を足す（残りの2項目は未実装と書く）。1.2 のヘッダーの図と説明に「親を挿入」を足す。
  - 3.2 の表に「親ノードの挿入」の行（トリガー: 「親を挿入」・`Alt` + `Enter`、配置先: T と親の間、作成後: N を選択して空のラベルの編集を開始）を足し、兄弟ノード作成のトリガーに「`Alt` を含む `Enter` を除く」を書く。新しいノードの初期プロパティの説明に、親の挿入では重要度を T から引き継ぐことを足す。
  - 3.4 の確定とキャンセルに「リピートの `Enter`（押し続けで入力欄が開く前から押していたキー）では確定しない」を足す。
  - 8.1 の表に「親の挿入 | 新しいノードの追加、T の `parentId` の変更、配列の位置、手動配置での枝の平行移動、自動配置での再配置をまとめて1操作（続くラベルの確定は別の操作）」を足す。8.2 の消える通知の記述を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入）」に直す。
  - 10.4 に「親の挿入: 折りたたみを保つ。閉じた T は閉じたまま、新しいノードは開いた状態。展開はしない」を足す。
  - 11.1 の表に `Alt`（`Option`）+ `Enter` の行を足し、`Enter` の行に「`Alt` との併用では兄弟を作らない」を、`Alt` + `↑` / `↓` と `←` / `→` の行の「4つのボタン」を「5つのボタン（『親を挿入』を含む）」に直す。ラベル編集中の `Enter` の行に「リピートでは確定しない」を足す。NOTE（ラベル編集中に無効になるショートカットの列挙、ダイアログ中に止まるショートカットの列挙）に `Alt+Enter` を足す。
  - 11.4 の表に「親の挿入」のボタンの行と、アクセシビリティの項目を足す。操作通知バーの行・「マップ全体置換時の同期リセット」の10番・「8系統独立表示」の本文と `kind` の表の主な用途を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ・親の挿入）」と親の挿入の失敗に直す。10番に、`useNodeParentInsertionAction` が `publishNotice` と `clearNotice` を受け取ることを足す。「レイアウトモード別操作ヒント」の文言を新しい文言に直す。
  - 14.7・15.7 の目印の説明を5つのボタンに直す。14.8・15.8 の表に「親の挿入（16 章）」の行を足す。14.9・15.9 の対象外の「途中への親ノードの挿入」を消す。
- `docs/specifications/data-model.md`: 1.2 の設計原則に「親の挿入（Phase 14）は、新しいノードを1つ足し、T の `parentId` を変える（手動配置では T の枝を平行移動する）だけで、保存形式・JSON・編集履歴の項目を足さない（2.9 節）」を足す。2.1 の `Node` の説明の `parentId` に親の挿入でも変わることを足す。新しい節「2.9 途中への親ノード挿入の型」に `NodeParentInsertionFailureReason`・`NodeParentInsertionResult`・`InsertParentNodeResult`（定義元は `client/src/domain/nodes/nodeParentInsertion.ts`）と `NodeLabelEditRequest`（定義元は `client/src/types/nodeLabelEditRequest.ts`）を足す。目次も直す。保存形式（3章）は変えないことを確かめる。
- `docs/architecture/overview.md`: レイヤーの説明に新しいファイル（`nodeParentInsertion.ts`、`nodeParentInsertionMessages.ts`、`useNodeParentInsertionAction.ts`、`NodeParentInsertControl.tsx`、`nodeParentInsertionShortcut.ts`、`useNodeParentInsertionShortcut.ts`、`useNodeLabelEditRequest.ts`、`types/nodeLabelEditRequest.ts`）を足し、`nodePlacement.ts`・`useNodes.ts`・`useRevisionScopedNotice.ts`・`useNodeKeyboardShortcuts.ts`・`NodeLabelEditor.tsx` の説明を直し、各ディレクトリのファイル数を実数に合わせる（`ls` で数える）。「階層の上げ下げの流れ」の後に「親の挿入の流れ」（ボタン・ショートカット → `useNodeParentInsertionAction` → `useNodes.insertParentNode` の1回の commit と N の選択 → 成功で `clearNotice` とラベルの編集の要求 → `MapStage` の `useNodeLabelEditRequest` が `startEditing` → 入力欄の `autoFocus`。失敗で `publishNotice`）を足す。
- `docs/testing/browser-test-cases.md`: 新しい節「Phase 14: 途中への親ノード挿入」（記号 `S`）を、R 節の後・「結果の集計」の前に足す（下の「手動テスト」）。「結果の集計」に S-01〜S-15 の未実施の行を足す。Q 節・R 節で「4つのボタン」や目印に触れている箇所があれば直す。
- `README.md`: 機能の一覧に「14. 途中への親ノード挿入（Phase 14 の3番目の項目）」を足し、編集履歴の対象の列挙に親の挿入を足す。
- `client/README.md`: キーボードショートカットに `Alt`（`Option`）+ `Enter` を足し、機能の一覧に親の挿入を足す。`domain/nodes/` の説明に親の挿入を足す。
- `docs/README.md`: 各文書の説明の「階層の上げ下げ」の列挙に「途中への親ノード挿入」を足す（流れ、Phase の範囲、型の節 2.9、手動テストの S 節）。
- `ROADMAP.md`: 最後のタスクで、Phase 14 の「途中への親ノード挿入」（候補003）にチェックを付ける（見出しは「（進行中）」のまま）。「現在地」（完了した項目に途中への親ノード挿入を足し、その内容と確認の範囲（Jest と `npm run verify` だけで、実ブラウザの S 節は未確認）を書く。進行中は Phase 14、次の未完了項目は「枝の切り取り・移動」（候補016））と、ドキュメント体系の行の範囲（「Phase 14 の途中への親ノード挿入まで」）、「最終更新」の日付を更新する。実機で確認していないことは、確認していないと書く。

## 手動テスト

`docs/testing/browser-test-cases.md` に「Phase 14: 途中への親ノード挿入」の節を追加し、ケースの記号は `S` にする。共通の決まりは R 節と同じにする（`npm run start -- -p 3115` で本番ビルドを普段と別のオリジンで起動、保存データはキーを名前で1つずつ消す、各ケースは「新しいマップ」でケースの ID を名前にしたマップで行う、特に書かない限り表示は「すべて」、通知の行が出るとキャンバスがずれる、結果は実ブラウザで確かめたものだけを記録する）。位置の期待は「左端が同じ」「120px 右」などの相対的な関係で書き、フォーカスは `document.activeElement.getAttribute("aria-label")` か `document.activeElement.getAttribute("data-testid")`（ラベルの入力欄は `node-label-input`）で確かめる（L-613）。基本の木は R 節と同じ（R の子 A・B・C、C の子 C1・C2）。

| ID | 内容 | 優先度 |
| :--- | :--- | :--- |
| S-01 | 基本（手動配置・ボタン）。B を選択して「親を挿入」をマウスで押す。新しいノードが B の元の位置（A と同じ左端、A の下端から 40px 下）に入り、B は新しいノードの右端から 120px 右・同じ高さに来ること。接続線は R → 新しいノード → B。新しいノードが選択され、ラベルの入力欄が開き、`data-testid` が `node-label-input` の要素にフォーカスがあること。「分類」と入れて Enter で確定すると、フォーカスが `body` に戻ること。R の子の並びが上から A、分類、C であること。通知は出ないこと | 高 |
| S-02 | 子孫ごと動くこと。C（子 C1・C2）に親を入れると、C・C1・C2 が同じ量（右へ 220px）だけ動き、縦位置は変わらないこと。C を閉じてから入れても、展開した後に C1・C2 が同じ量だけ動いていること | 高 |
| S-03 | 重なりを避けないこと。A に子 A1・A2 を足し（A1 は A の右、A2 は A1 の 40px 下）、B に親を入れると、B が A2 と同じ位置に重なること | 中 |
| S-04 | ショートカット。`Alt` + `Enter`（macOS は `Option`）で S-01 と同じ結果になり、兄弟が増えないこと。`Enter`・`Shift` + `Enter` では今までどおり兄弟が増えること。`Ctrl` + `Alt` + `Enter`、`Alt` + `Shift` + `Enter` では何も起きないこと。`Alt` + `Enter` を約3秒押し続けても、挿入は1回だけで、入力欄が開いたままであること | 高 |
| S-05 | `Enter` の押し続け。ノードを選択して `Enter` を約3秒押し続けると、兄弟は1つだけ増え、入力欄が開いたままであること（今までは手を離すまで増え続けた） | 高 |
| S-06 | ルートと自動配置。手動配置でルート R に親を入れると、新しいノードが R の位置で新しいルートになり、R がその右に来ること。自動配置に切り替えたマップで先頭のルートに親を入れると、新しいノードが元の先頭のルートの位置に来て、木が並び直ること。先頭でないノードに入れても、先頭のルートの位置が変わらないこと（位置は localStorage の `x`・`y` で比べる。ダブルクリックで足した2本目のルートは先頭の木の下に置かれ選択もされないので、見えなければドラッグして画面に入れ、ラベルを付けてクリックで選択する） | 高 |
| S-07 | 表示レベルと重要度。B の重要度を「高」にして B に親を入れると、新しいノードの重要度が「高」であること。表示を「高のみ」にして、重要度「低」で子孫に「高」が無いノードが隠れている状態で、見えているノードを選ぶとボタンが有効、選択を外すと無効であること | 中 |
| S-08 | 元に戻す / やり直す。挿入してラベルを確定した後、1回目の「元に戻す」でラベルが空に戻り、2回目で挿入が戻って B が元の位置・元の親に戻ること。「やり直す」2回で同じ木と位置・ラベルに戻ること | 高 |
| S-09 | 編集中に押す。A のラベルを編集中に「親を挿入」をマウスで押すと、A のラベルが確定してから A の上に親が入り、新しいノードの編集になること | 高 |
| S-10 | ショートカットが止まる場面。ラベル編集中（`Alt` + `Enter` は確定になる）、検索入力欄、表示セレクター、箇条書きのダイアログ・マップのダイアログを開いている間、日本語 IME の変換中に `Alt` + `Enter` を押してもマップが変わらないこと。「上へ」「階層を下げる」にフォーカスがあるまま `Alt` + `Enter` で挿入されること | 高 |
| S-11 | ボタンのキーボード操作と読み上げ。Tab で「親を挿入」へ移り、Enter・Space で挿入され、入力欄へフォーカスが移ること。「親を挿入」にフォーカスしたまま Enter を約3秒押し続けても、挿入は1回だけで入力欄が開いたままであること。ダブルクリックで2つの親が重なって入ること（「元に戻す」2回で戻る）。VoiceOver で「選択中のノードに親を挿入」と読まれ、押した後に入力欄が「ノードのラベル」と読まれること（features.md の 3.4 節）。選択を外して無効にしたときに「使用不可」などと読まれること | 中 |
| S-12 | 失敗の通知。子孫の `x` が `1e19`（C の子 C1）の手動配置の JSON を「JSON読み込み」で読み込み、画面内の C に親を入れると、子孫を動かす計算が桁落ちして何も変わらず「親ノードを挿入できませんでした。」が出ること。続けてほかのノードに親を入れると、その通知が消えること | 中 |
| S-13 | 保存と書き出し。挿入の後にリロードしても木が保たれること。JSON を書き出して別のマップへ読み込むと同じ木になること。PNG / SVG に挿入した後の配置が出ること | 中 |
| S-14 | 幅 375px とダークモード。ヘッダーの5つのボタンが画面に収まり（折り返してよい）、押せること（通常の幅で基本の木を作ってから幅を狭め、B は「ノードを検索」で選ぶ） | 中 |
| S-15 | ドラッグ中にボタンから挿入する。キャンバスはフォーカスできず、ノードを押すとボタンのフォーカスは外れるので、コンソールの `setTimeout(() => document.querySelector('[aria-label="選択中のノードに親を挿入"]').click(), 3000)` で3秒後にボタンを押させ（タッチ端末では指でタップ）、その間に B をドラッグしてマウスのボタンを押したまま待つと、ドラッグが止まって新しいノードの入力欄が開くこと。マウスを離しても B は動かないこと。手動配置では「元に戻す」の1回目で挿入だけが戻り、2回目でドラッグ分が戻ること | 中 |

## 反映した知見

| ID | 反映した箇所 |
| :--- | :--- |
| L-001 | 挿入の結果を判別共用体で返し、成功したときだけ編集の要求を出して通知の枠を空にする。自動配置の失敗も `placement-failed` として返す。文言の関数は理由を網羅する |
| L-002 | 純関数が受け取る新しい ID が既存と重なるときは `id-conflict` で拒否し、黙って重複を作らない |
| L-035 | 対象は ID で指定し、T と新しい ID は `applyTreeChange` の中の最新の配列で解決・採番する |
| L-037 | 通知とラベルの編集の要求を `documentRevision` と組にして持ち、Undo / Redo・置き換えの後に古い要求で編集を始めない |
| L-048 | 既存の `Tab`・`Enter`・ラベルの入力欄の `Enter` の挙動（修飾キー・リピートを見ないこと）をコードで確かめてから、変える範囲を決めた |
| L-058 | ボタンは `disabled` 属性で無効にし、無効のときにクリックしても呼ばれないことをテストする |
| L-060 | 新しい props（`onInsertParentNode`、`labelEditRequest`、ボタンの props、`publishNotice`、`clearNotice`）を必須にし、`Home` からの結合テストと配線の変異で確かめる |
| L-061 | ボタン・ショートカットを、ダイアログの `inert` と `editorShortcutsEnabled` の対象にし、既存の操作との関係を表にした |
| L-150 | ボタンのダブルクリックは2回の挿入として扱う（「枝を複製」と同じ）と決め、手動テストに入れた |
| L-155 / L-157 | ボタンは成功しても無効にならず、フォーカスは入力欄へ移るので、無効化によるフォーカスの喪失は起きない。編集の後に `body` へ落ちるのは `Tab`・`Enter` と同じ既知の挙動として対象外に書いた |
| L-166 | 成功の通知を出さず（同じ文言で読み上げられない問題を作らない）、成功で枠を空にして古い通知を残さない。失敗の文言が続くと読み上げられないことを既知の制限として書いた |
| L-408 | ボタンとショートカットの押し続けを止め、フォーカスを移した先（ラベルの入力欄）に届くリピートの `Enter` も止めた。2つの対策を組で書き、`repeat` を明示したテストと手動テストで確かめる。`detail: 0` のクリックで呼ばれることも固定する |
| L-460 | 挿入は正本の全配列に対して行い、隠れた兄弟・隠れた子孫を消さない・順を変えない。テストで固定する |
| L-473 | ラベルの入力欄の変更はリピートの `Enter` の無視だけにし、`blur` での確定と `actionHandledRef` による二重確定の防止を変えない |
| L-474 | ショートカットは共通の条件で `isComposing` と `keyCode` 229 を無視する |
| L-522 | ショートカットの対象外の要素は既存の `isInteractiveTarget` と同じにし、ショートカットを案内する5つのボタンだけを共通の目印で対象に戻す |
| L-524 | 座標は検査付きの `calculateIndentTranslation` と `translateBranch` を再利用し、溢れ・桁落ち・非有限を `placement-failed` にする。`dy` は常に 0 で差を計算しない |
| L-541 | `splice` と添字を使わず、1回の走査で新しい配列を作る。「末尾に足す」「T の直後に積む」変異で落ちるテストにする |
| L-612 | ボタンの有効・無効は `nodes`・選択・表示集合のすべてを依存にして求める |
| L-613 | 手動テストの位置の期待を相対的な関係で書き、フォーカスは `document.activeElement` の属性で確かめる |
| L-616 | テストのデータに、重要度を既定値以外にする、T の大きさを既定値以外にする、`x` と `y` を異なる値にする、T の後ろに兄弟を置く、自動配置の入力の座標を配置の結果と違う値にする、という条件を付け、近い誤りの変異で落ちることを確かめる |
| L-617 | 「親を挿入」は2つのボタンの引き継ぎを使わないので、既存の `usePairedButtonFocusHandover` には触れない。入力欄へのフォーカスの移動は、1回だけでなく「確定して `body` に戻る → もう一度押して次の入力欄へ移る」の連続で結合テストに書く |
