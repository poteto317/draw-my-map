# Phase 14: 階層の上げ下げ 設計

作成日: 2026-10-26
基準: main `65f9676`。作業ブランチは `codex/phase14-indent-outdent`（`.worktrees/codex/phase14-indent-outdent`）。

## 目的・範囲

箇条書きから取り込んだノードや、思いついた順に足したノードの親子関係を、ドラッグの接続を使わずにキーボードとボタンで直せるようにする。ROADMAP Phase 14 の2番目の項目「階層の上げ下げ（候補002）」を、1つの PR で実装する。

1. 選択中のノードの枝（ノードと全子孫）を、見えている直前の兄弟の子にする（階層を下げる）。
2. 選択中のノードの枝を、親の兄弟にする（階層を上げる）。元の親の直後に入る。
3. 手動配置では、新しい親に合わせて枝を平行移動する。自動配置では全体を配置し直す。
4. 1回の上げ下げを1つの操作として Undo / Redo できる。

## 対象外

- Phase 14 の他の項目（途中への親ノードの挿入、枝の切り取り・移動、ノードだけの削除）。
- ドラッグでの階層の変更。親の付け替えは今までどおり `Shift` + ドラッグの接続でも行える。
- 上げたときに、後ろの兄弟を一緒に動かすこと（後ろの兄弟は元の親の子のまま残す。ユーザーの決定）。
- 隠れた兄弟の子にすること（見えている直前の兄弟の子にする。隠れた兄弟の子にしたいときは、表示を「すべて」にしてから下げる）。
- コンテキストメニューへの項目の追加。
- 複数のノードをまとめて上げ下げすること。
- 手動配置で、動かした枝とほかの枝との重なりの回避、および画面の上下と兄弟の順序の一致（並べ替えと同じく重なりは避けない。上げた枝が、元の親の後ろの兄弟より画面の下に来ることがある。並べ替えで直せる）。
- `Tab`（子の追加）・`Enter`（兄弟の追加）の挙動の変更。
- 入力欄の中で押した `Alt` + `←` / `→` の扱い（ブラウザに任せる。Windows・Linux では「戻る」「進む」になる。既知の制限）。
- ダイアログ（マップのダイアログ・箇条書きからの追加のダイアログ）を開いている間（`useNodeIndentShortcut` の `enabled` が偽）の `Alt` + `←` / `→` の「戻る」「進む」の抑止（抑止しない。Windows・Linux ではダイアログの中で押すとページが「戻る」「進む」ことがある。既知の制限。ダイアログは入力欄を持ち、文字入力先の中はもともとブラウザに任せるため、`enabled` が偽のときは何もしない規則を単純に保つ）。
- `MapHistoryControls` のフォーカスの引き継ぎの共通化（今回の共通化は兄弟の順序と階層のボタンだけ）。
- `Node` 型、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式の変更。

## 決めたこと

### ユーザーが決めたこと（2026-10-26）

1. **キー**: `Alt`（macOS では `Option`）+ `→` で階層を下げる（直前の兄弟の子にする）、`Alt` + `←` で階層を上げる（親の兄弟にする）。既存の `Tab`（子を追加）は変えない。
2. **上げたときの後ろの兄弟**: そのまま元の親の子として残す。動かすのは選択ノードとその子孫だけ。上げたノードは元の親のすぐ後ろ（元の親の兄弟の並びで、元の親の直後）に入る。
3. **下げたときの折りたたみ**: 新しい親（直前の兄弟）が閉じていたら展開し、動かしたノードを見える状態・選択のままにする。Phase 13 の「子として追加」と同じ扱い。
4. **手動配置**: 新しい親に合わせて移す。下げるときは子の追加と同じ規則（新しい親の右、既存の子の下）で枝の根の位置を決め、子孫ごと平行移動する。上げるときは元の親と同じ列（`x`）で、元の親の枝の下に置く。

### 推奨案として採用したこと（ユーザーには聞いていない）

- **「直前の兄弟」の基準**: 並べ替えと同じく、表示集合 V（折りたたみ × 表示レベル）で見えている兄弟。見えている直前の兄弟が無ければ下げられない（端の通知）。間に隠れた兄弟があれば飛び越え、見えている直前の兄弟の子にする。理由: 画面で真上に見えている兄弟の子になるのが、利用者の予想と一致するため。隠れた兄弟は元の階層のまま残し、消さない・並びを変えない（L-460）。「直前」は並べ替えと同じく `nodes` 配列の相対順で決め、画面の上下（`y`）では決めない。手動配置では兄弟の配列の順と画面の上下が一致しないことがある（自由に動かした後など）ので、画面で真上に見える兄弟と「直前の兄弟」が違うことがある。そのときは並べ替え（14 章）で順を直してから下げる（L-472）。
- **下げたノードの位置**: 新しい親の子の末尾。配列では「新しい親の既存の子のうち配列で最後のもの」の直後に置く（子が無ければ配列の位置を変えない）。理由: 子の追加（`Tab`）が末尾に足すのと揃えるため。
- **ルート**: ルートは上げられない（端の通知）。ルートは下げられる（見えている直前のルートの子になる）。
- **上げたノードの配列の位置**: 元の親の直後。子孫の配列位置は動かさない（「子孫の配列位置を動かさなくてよい根拠」の節）。
- **履歴**: `applyTreeChange` を1回だけ呼ぶ1回の commit。選択は動かしたノードのまま。`documentRevision` は上げない（折りたたみを保つ）。下げたときの親の展開は折りたたみ集合の変更で、履歴には入らない（Phase 13 の挙動と同じ）。
- **UI**: ヘッダーの「上へ」「下へ」の右隣に「階層を上げる」「階層を下げる」。`disabled`、Enter の押し続けの抑止、端で無効になったときのフォーカスの引き継ぎ、ボタンにフォーカスがあるときもショートカットが効くこと、は並べ替えのボタンと同じ。
- **通知**: 新しい系統を足さず、並べ替えの通知（8系統目）と同じ枠を「枝の構造の変更の通知」として共有する。系統の数は8のまま。
- **ショートカットの条件**: 並べ替えのショートカットと同じ（`Alt` のみ、`Ctrl` / `Meta` / `Shift` の併用は無視、IME、`keyCode` 229、`defaultPrevented`、ラベル編集中、対話要素（並べ替え・階層のボタン自身は除く）、未選択、ジェスチャー中）。押し続けは許可する。
- **自動配置**: 構造を変えた後、既存の `applyTreeChange` が `layoutNodeForest` で全体を配置し直す。先頭のルートの基準点は、並べ替えの `applyAutoFirstRoot` と同じ考え方で扱う（結論として、上げ下げでは先頭のルートは変わらないので引き継ぎは不要。「自動配置と先頭のルート」の節）。
- **ドラッグ**: 対象外（既存の `Shift` + ドラッグの接続がある）。

### この設計書の作成者が決めたこと（下の各節で根拠を書く）

- **上げたときの縦位置**: 動かす枝（T と子孫）の上端を、元の親の枝（T の枝を除く）の下端から `SIBLING_VERTICAL_GAP`（40px）下に置く。根 T ではなく枝の上端で合わせる理由: 自動配置から手動配置へ切り替えたマップでは子が根より上に並ぶので、根で合わせると子が元の親の枝に食い込むため。「枝の下に置く」というユーザーの決定を、枝全体について満たす。
- **下げたときの縦位置**: ユーザーの決定どおり、根 T の位置を子の追加の規則で決める（子の追加の規則は根の位置の規則なので、枝の上端ではなく根で合わせる）。T の子が T より上にあると、新しい親の既存の子と重なることがある（重なりは避けない。対象外）。
- **座標の計算**: `calculateChildPlacement` と同じ式を、`checkedAdd` と `hasSufficientGap` で検査する版として新しいファイルに書く（`calculateChildPlacement` は検査をしないため）。式が食い違わないことをテストで固定する。
- **先頭のルートは変わらない**: 上げ下げでは先頭のルートが変わらないことを示し（「自動配置と先頭のルート」の節）、座標の引き継ぎの処理を書かない。テストで固定する。
- **通知の枠の共有のしかた**: `MapEditor` が `useRevisionScopedNotice` を1つ持ち、`publishNotice` を並べ替えと上げ下げのフックの両方に渡す（`useMapClipboardEvents` の `publishNotice` と同じ形）。`useSiblingReorderAction` は通知を自分で持たなくなる。
- **通知の文言**: 成功に新しい親のラベルと階層の深さ（ルートが第1階層）を入れる。同じ枝を続けて押すと深さが変わるので、文言が変わって読み上げ直される（別の枝を続けて同じ親の下の同じ深さへ動かすと文言が同じになり、読み上げられないことがある。既知の制限）。ラベルは空なら「新しいノード」、21コードポイント以上なら先頭20コードポイントに「…」を付ける。
- **ショートカットの判定の共通化**: 並べ替えと上げ下げで共通の条件（キー以外）を `treeEditShortcutGuard.ts` へ移し、両方の判定から呼ぶ。ボタンの目印の属性も1つ（`data-tree-edit-shortcut-button`）にして4つのボタンに付け、どのボタンにフォーカスがあっても4つのショートカットがすべて効くようにする。理由: 4つのボタンは隣り合い、どれもショートカットを案内している。「上へ」を押した直後に `Alt` + `→` で下げられないと、目印の有無で挙動が分かれて分かりにくいため。
- **ショートカットのフック**: 並べ替えのフックとは別に `useNodeIndentShortcut` を作る（`window` の `keydown` の登録は1つ増える）。理由: 呼ぶ相手（`onChangeNodeIndent`）と要求の形が違い、既存のフックとそのテストを変えずに済むため。2つの判定はキーが重ならないので、同じ `keydown` で両方が動くことは無い。
- **ブラウザの「戻る」「進む」の抑止**: Windows・Linux のブラウザでは `Alt` + `←` / `→` が「戻る」「進む」に割り当てられている。「元に戻す」で選択が外れた直後などに `Alt` + `←` を押すと、ページを離れてしまう。そこで、ショートカットの条件のうち「選択している」「ジェスチャー中でない」「対話要素の外」を満たさないときでも、文字入力先（`isEditableTarget`）の外で、ラベル編集中でなく、`Alt` だけを押した `←` / `→` なら `preventDefault` する（何もしないが、ページも離れない）。文字入力先の中ではブラウザに任せる（macOS の単語単位のカーソル移動を壊さないため）。
- **ボタンのフォーカスの引き継ぎ**: `NodeSiblingOrderControl` の仕組みを `usePairedButtonFocusHandover` へ移し、`NodeSiblingOrderControl` と `NodeIndentControl` の両方で使う。挙動は変えない。

## Global Constraints

- 新規依存なし。`Node`、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式を変えない。
- 上げ下げの規則は純関数（`domain/nodes/nodeIndent.ts`）、手動配置の座標は純関数（`domain/nodes/nodeIndentPlacement.ts`）、通知の文言は純関数（`domain/nodes/nodeIndentMessages.ts`）、ショートカットの判定は純関数（`components/map/nodeIndentShortcut.ts`、共通の条件は `components/map/treeEditShortcutGuard.ts`）、状態と1回の commit は React フック、表示と操作は部品、という既存の境界を守る。
- 結果は判別共用体で返し、呼び出し元は成功したときだけ親の展開を行う。共用体の分岐は `switch` で網羅し、新しいメンバーを既定の分岐へ流さない（L-001）。
- 対象は ID で指定し、配列の添字を層の間で受け渡さない。新しい親は `applyTreeChange` のコールバックの中で最新のノード配列から解決する（L-035）。
- 上げ下げは、表示で絞り込んだ部分配列ではなく、正本の全 `nodes` に対して行う。隠れた兄弟・隠れた子孫を消したり、順序を変えたりしない（L-460）。
- 配列の操作は1回の走査で新しい配列を作る。`splice` と添字の計算を使わない（L-541）。大きな配列に `Math.min(...arr)` や `push(...arr)` を使わない。
- 座標の計算は `checkedAdd` / `checkedSubtract` と `hasSufficientGap` を使い、失敗なら `placement-failed` にする（L-524）。
- 新しい props とコールバックは必須にする。実際の `Home` から `MapEditor`、ヘッダー、`MapStage` まで通す結合テストで配線を確かめる（L-060）。
- TDD で進め、`client` の変更後に `npm run verify` を実行する。タスク単位のサブエージェント実装と、別担当の仕様・品質レビューを行う。
- コミット・push・PR 作成は依頼されたときだけ行う。最後のタスクで `ROADMAP.md` を実態に合わせて更新する。

## 全体の構成

```
MapEditor
├─ useNodes
│   └─ changeNodeIndent(nodeId, direction, visibleNodeIds)  … applyTreeChange を1回呼ぶ。選択と documentRevision は変えない
├─ useRevisionScopedNotice（枝の構造の変更の通知。8系統目）
├─ useSiblingReorderAction（publishNotice を受け取るように変える）
├─ useNodeIndentAction                                       … ボタンの有効・無効、選択中のノードの上げ下げ、MapStage からの要求、下げたときの親の展開、通知
│   ├─ getNodeIndentAvailability                             … domain/nodes/nodeIndent.ts
│   └─ formatNodeIndentNotice                                … domain/nodes/nodeIndentMessages.ts
├─ AppHeader の operationControls
│   ├─ NodeSiblingOrderControl（「上へ」「下へ」）
│   └─ NodeIndentControl（「階層を上げる」「階層を下げる」）  … NodeSiblingOrderControl の右隣
└─ MapStage（onChangeNodeIndent を新しく受け取る）
    └─ useNodeIndentShortcut                                 … Alt+← / Alt+→。判定は resolveNodeIndentShortcut
```

新しく作るファイル:

| 層 | ファイル | 役割 |
| :--- | :--- | :--- |
| domain | `domain/nodes/nodeSiblingNeighbors.ts` | `nodeSiblingOrder.ts` の非公開関数 `scanSiblingNeighbors` と型 `SiblingNeighbors` / `SiblingNeighborsScan` を移して公開する（挙動は変えない） |
| domain | `domain/nodes/nodeIndent.ts` | 型（`useNodes` の戻り値の `ChangeNodeIndentResult` を含む全型）、ボタンの有効・無効 `getNodeIndentAvailability`、上げ下げ `changeNodeIndent` |
| domain | `domain/nodes/nodeIndentPlacement.ts` | 手動配置の平行移動量 `calculateIndentTranslation` / `calculateOutdentTranslation` と、枝の平行移動 `translateBranch` |
| domain | `domain/nodes/nodeIndentMessages.ts` | 通知の文言 `formatNodeIndentNotice` |
| hooks | `hooks/useNodeIndentAction.ts` | ボタンの状態、上げ下げの要求、親の展開、通知 |
| components | `components/layout/NodeIndentControl.tsx` | ヘッダーの「階層を上げる」「階層を下げる」 |
| components | `components/layout/usePairedButtonFocusHandover.ts` | 2つのボタンの片方が無効になったときのフォーカスの引き継ぎ（`NodeSiblingOrderControl` から移す） |
| components | `components/map/treeEditShortcutGuard.ts` | 目印の属性 `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE`、入力の型 `TreeEditShortcutInput`、共通の条件 `passesTreeEditShortcutGuard` |
| components | `components/map/nodeIndentShortcut.ts` | ショートカットの判定 `resolveNodeIndentShortcut`、「戻る」「進む」の抑止の判定 `shouldSuppressAltArrowNavigation` |
| components | `components/map/useNodeIndentShortcut.ts` | `window` の `keydown` の登録 |

変える既存のファイル: `domain/nodes/nodeSiblingOrder.ts`（`scanSiblingNeighbors` を import に変えるだけ）、`hooks/useNodes.ts`、`hooks/useSiblingReorderAction.ts`、`components/layout/NodeSiblingOrderControl.tsx`、`components/layout/LayoutModeOperationHint.tsx`、`components/map/siblingReorderShortcut.ts`、`components/map/MapEditor.tsx`、`components/map/MapStage.tsx`、および既存のテスト（目印の定数の名前の変更、`useSiblingReorderAction` の通知の受け渡しの変更）。

## 用語

- **T**: 上げ下げする枝の根（選択中のノード）。**T の枝**: T と全子孫（折りたたみ・表示レベルで隠れた子孫を含む。`collectSubtreeIds`）。
- **兄弟の列**: T と同じ `parentId` を持つノード（T を含む）を、`nodes` 配列の順に並べたもの。ルートなら `parentId === null` のノード全体。
- **見える**: 表示集合 V（`useMapDisplayState` の `visibleNodeIds`）に含まれること。
- **隠れた兄弟が生まれる理由**: T が見えているなら T の親も見えていて閉じていない。ルートは折りたたみで隠れない。したがって、見えている T の兄弟が隠れる理由は表示レベルだけ（並べ替えの設計と同じ）。端の通知の案内（「表示を『すべて』に切り替える」）はこの性質に基づく。
- **表示レベルの可視性**: 表示レベルでは、重要度が条件を満たすノードとその祖先が見える（`collectVisibleNodeIds`）。T の可視性は T と子孫の重要度だけで決まり、親が変わっても変わらない。元の親の可視性は、T を子孫に持たなくなると変わることがある（「既存の操作との関係」の表）。

## 上げ下げの規則

### 型（`domain/nodes/nodeIndent.ts`）

```ts
export type NodeIndentDirection = "indent" | "outdent"; // indent = 階層を下げる、outdent = 階層を上げる

export type NodeIndentAvailability = { indent: boolean; outdent: boolean };

export type NodeIndentFailureReason =
  | "node-missing"       // T が無い
  | "node-hidden"        // T が見えていない
  | "invalid-structure"  // 上げるとき親が配列に無い、下げるとき新しい親が T の子孫（循環などの不正なデータ）
  | "placement-failed";  // 手動配置の座標が有限でない・桁落ちする・間隔が取れない、自動配置の失敗

type NodeIndentSuccess = {
  ok: true;
  direction: NodeIndentDirection;
  newParentId: number | null;     // 上げてルートになったら null
  newParentLabel: string | null;  // 新しい親の label（生の値。空文字もそのまま）。ルートなら null
  depth: number;                  // 移した後の T の深さ。ルートが 1
};

type NodeIndentAtEdge =
  | { ok: false; reason: "at-edge"; direction: "indent"; hiddenBeyond: boolean; isRoot: boolean }
  | { ok: false; reason: "at-edge"; direction: "outdent" }; // 上げられないのはルートだけ

export type NodeIndentResult =
  | (NodeIndentSuccess & { nodes: Node[] })
  | NodeIndentAtEdge
  | { ok: false; reason: NodeIndentFailureReason };

// useNodes.changeNodeIndent の戻り値（hooks と messages の両方がここから import する）
export type ChangeNodeIndentResult =
  | NodeIndentSuccess
  | NodeIndentAtEdge
  | { ok: false; reason: NodeIndentFailureReason };
```

- `NodeIndentAtEdge` の `"indent"` の `hiddenBeyond` は、T より前に隠れた兄弟が1つ以上あるとき `true`。`isRoot` は `T.parentId === null`。
- 型を `hooks/useNodes.ts` に置かない理由は並べ替えと同じ（domain の `formatNodeIndentNotice` が hooks を import しないため）。

### `scanSiblingNeighbors` の移動

`nodeSiblingOrder.ts` の `scanSiblingNeighbors(nodes, nodeId, visibleNodeIds)` と型 `SiblingNeighbors`・`SiblingNeighborsScan` を、そのまま `domain/nodes/nodeSiblingNeighbors.ts` へ移して export する。`nodeSiblingOrder.ts` はそこから import する。中身・戻り値は変えない（`node`、`previousVisibleId`、`hiddenBefore`、`nextVisibleId`、`hiddenAfter`）。既存の `nodeSiblingOrder.test.ts` がそのまま通ることで確かめる。下げるときの「見えている直前の兄弟」は `previousVisibleId`、`hiddenBeyond` は `hiddenBefore` をそのまま使う。

### `getNodeIndentAvailability(nodes, nodeId, visibleNodeIds)`

- `nodeId` が `null` → `{ indent: false, outdent: false }`。
- `scanSiblingNeighbors` を1回だけ呼ぶ。`node-missing`・`node-hidden` → `{ indent: false, outdent: false }`。
- `found` → `{ indent: previousVisibleId !== null, outdent: node.parentId !== null }`。
- 座標の失敗や不正なデータ（親が無い・循環）はここでは予測しない（押した後に失敗の通知を出す）。

### `changeNodeIndent(nodes, nodeId, direction, visibleNodeIds, mode): NodeIndentResult`

#### 下げる（`"indent"`）

1. **検査**（この順で、最初に当たったものを返す）
   - `scanSiblingNeighbors` が `node-missing` / `node-hidden` → その理由。
   - `previousVisibleId === null` → `{ ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: hiddenBefore, isRoot }`。
   - 新しい親 P = `previousVisibleId` のノード。`canConnectNodes(nodes, P.id, T.id)` が偽（P が T の子孫など）→ `invalid-structure`。
2. **配列**: `nodes` を1回走査して、P の子（`parentId === P.id`）のうち配列で最後のもの L を求める（T は P の子ではないので L になり得ない）。もう1回走査して新しい配列を作る。
   - `T' = { ...T, parentId: P.id }`。
   - L があるとき: T は飛ばし、L を積んだ直後に T' を積む。
   - L が無いとき: T の位置に T' を積む（配列の位置を変えない）。
   - それ以外のノードは同じオブジェクトのまま積む。
3. **座標**
   - `mode === "manual"`: `calculateIndentTranslation(nodes, T.id, P.id)`（元の配列で計算する）で移動量を求め、`translateBranch(新しい配列, T.id, translation)` を適用する。どちらかが `null` なら `placement-failed`。
   - `mode === "auto"`: 座標は変えない（この後に `applyTreeChange` が `layoutNodeForest` で決める）。
4. **結果**: `newParentId = P.id`、`newParentLabel = P.label`、`depth` = 新しい配列で T から `parentId` を辿った祖先の数 + 1（`visited` の集合で循環を検出したら `invalid-structure`。検査済みなので通常は起きない）。

#### 上げる（`"outdent"`）

1. **検査**
   - T が無い → `node-missing`。T が見えていない → `node-hidden`。
   - `T.parentId === null` → `{ ok: false, reason: "at-edge", direction: "outdent" }`。
   - 元の親 P（`T.parentId` のノード）が配列に無い → `invalid-structure`。
2. **配列**: 新しい配列を1回の走査で作る。`T' = { ...T, parentId: P.parentId }`（祖父母。P がルートなら `null`）。T は飛ばし、P を積んだ直後に T' を積む。それ以外は同じオブジェクトのまま積む。T が配列で P より前にあっても同じ規則（T を飛ばし、P の直後に積む）。
3. **座標**
   - `mode === "manual"`: `calculateOutdentTranslation(nodes, T.id, P.id)`（元の配列で計算する）、`translateBranch(新しい配列, T.id, translation)`。`null` なら `placement-failed`。
   - `mode === "auto"`: 座標は変えない。
4. **結果**: `newParentId = P.parentId`、`newParentLabel` = 祖父母の `label`（P がルートなら `null`）、`depth` は下げると同じ方法で求める。

### 例（配列の動き）

括弧は親。`(隠)` は見えていない兄弟。子孫は、書いていないものも配列のどこにあっても動かない。

| 例 | 操作前 | 操作 | 操作後 | 木 |
| :--- | :--- | :--- | :--- | :--- |
| I1 | `R, A(R), B(R), T(R)` | T を下げる | `R, A, B, T'(B)` | B に子が無いので配列の位置は変えない |
| I2 | `R, A(R), A1(A), T(R), Tc(T)` | T を下げる | `R, A, A1, T'(A), Tc` | L = A1。T はすでに A1 の後ろ。A の子は A1, T |
| I3 | `R, A(R), T(R), A1(A)` | T を下げる | `R, A, A1, T'(A)` | A1 が後から足された場合。T を A1 の直後へ移し、A の子の末尾にする |
| I4 | `R, A(R), H(R・隠), T(R)` | T を下げる | `R, A, H, T'(A)` | 隠れた H を飛び越え、見えている A の子になる。H は R の子のまま |
| I5 | `R, H(R・隠), T(R)` | T を下げる | （変わらない） | `at-edge`、`hiddenBeyond: true` |
| I6 | `R, T(R), A(R)` | T を下げる | （変わらない） | `at-edge`、`hiddenBeyond: false`（先頭の兄弟） |
| I7 | `R1, R2` | R2 を下げる | `R1, R2'(R1)` | ルートを下げると、直前のルートの子になる |
| I8 | `R1, A(R1), R2` | R2 を下げる | `R1, A, R2'(R1)` | L = A。R2 はすでに A の後ろ。R1 の子は A, R2 |
| O1 | `R, A(R), A1(A), A2(A), A3(A), B(R)` | A2 を上げる | `R, A, A2'(R), A1, A3, B` | R の子は A, A2, B。A の子は A1, A3（後ろの兄弟 A3 は A に残る） |
| O2 | `R, A1(A), A(R), B(R)` | A1 を上げる | `R, A, A1'(R), B` | T が配列で P より前にある場合（並べ替えの後など） |
| O3 | `R1, T(R1), Tc(T), R2` | T を上げる | `R1, T'(null), Tc, R2` | 元の親がルートなので T はルートになり、ルートの並びは R1, T, R2 |
| O4 | `R, A(R), T(A), H(R・隠), B(R)` | T を上げる | `R, A, T'(R), H, B` | 元の親 A の直後。後ろの隠れた兄弟 H より前に入る |
| O5 | `R` | R を上げる | （変わらない） | `at-edge`（ルート） |

I1 の後に T を上げると、B の直後へ戻り `R, A, B, T(R)` になる（元に戻る）。I3 の後に上げると `R, A, T(R), A1` になり、配列は元と違うが、木（R の子は A, T。A の子は A1）は元に戻る。元の配列に正確に戻すには「元に戻す」を使う。

## 子孫の配列位置を動かさなくてよい根拠

上げ下げでは、T の `parentId` を変え、T の根ノード1つだけを配列の中で動かす（下げる I1 のように動かさないこともある）。T の子孫の `parentId` と配列位置は変えない。並べ替えの設計書の同じ節の根拠がそのまま当てはまる。要点と、上げ下げで足す点:

- **兄弟の順は「同じ `parentId` を持つノード同士の配列内の相対順」だけで決まる**（`buildNodeForestRelations`）。子孫がどこにあるかには依存しない。`traverseNodeForest`・`createNodeCollapseIndex`（`indexNodeForest`）・`collectSubtreeIds`・`collectVisibleNodeIds`・`validateMapDocumentGraph` は、親が子より前にあることを前提にしない。
- **下げたとき T が末尾になること**: L は P の子のうち配列で最後のものなので、L の直後に置いた T' より後ろに P の子は無い。L が無ければ T' が P の唯一の子になる。どちらでも T' は P の子の末尾。
- **上げたとき T が元の親の直後になること**: 新しい配列で P と T' の間にノードは無いので、祖父母の子（またはルート）の列で、T' は P の直後になる。P の後ろにある隠れた兄弟（O4 の H）より前に入る。
- **T の子孫**: `parentId` は T のままなので、T の枝の形と、枝の中の兄弟の順は変わらない。
- **L-457 との関係**: 親子を `parentId` で明示するデータなので、ブロックとして動かさず、移動先の子孫を割り込ませる問題が起きない。

## 手動配置の座標

`domain/nodes/nodeIndentPlacement.ts`。

```ts
// 根 T を (rootX, rootY) へ、子孫を (dx, dy) だけ動かす
export type BranchTranslation = { rootX: number; rootY: number; dx: number; dy: number };

export function calculateIndentTranslation(
  nodes: readonly Node[], nodeId: number, newParentId: number,
): BranchTranslation | null;

export function calculateOutdentTranslation(
  nodes: readonly Node[], nodeId: number, parentId: number,
): BranchTranslation | null;

export function translateBranch(
  nodes: readonly Node[], rootId: number, translation: BranchTranslation,
): Node[] | null;
```

`null` はすべて `placement-failed` に写す。最小値・最大値はループで求める（スプレッドを使わない）。

### 下げるとき（`calculateIndentTranslation`）

子の追加の規則（`calculateChildPlacement`）と同じ式を、検査付きで計算する。`nodes` は上げ下げの前の配列（T はまだ P の子ではない）。

1. P と T を探す。無ければ `null`。
2. `right = checkedAdd(P.x, P.width)`、`rootX = checkedAdd(right, CHILD_HORIZONTAL_GAP)`（120）。どちらかが `null`、または `hasSufficientGap(right, rootX, CHILD_HORIZONTAL_GAP)` が偽なら `null`。
3. P の子（`parentId === P.id`。隠れた子を含む。孫は含めない）の下端 `checkedAdd(y, height)` の最大値 `bottom` を求める（`null` が1つでもあれば `null`）。
   - 子があるとき: `rootY = checkedAdd(bottom, SIBLING_VERTICAL_GAP)`（40）。`null`、または `hasSufficientGap(bottom, rootY, SIBLING_VERTICAL_GAP)` が偽なら `null`。
   - 子が無いとき: `rootY = P.y`（有限でなければ `null`）。
4. `dx` は `rootX` と `T.x` の差、`dy` は `rootY` と `T.y` の差（`checkedSubtract`）。ただし等しいか、差が丸めの許容誤差以下なら 0（「丸め誤差への配慮」）。`null` なら `null`。

### 上げるとき（`calculateOutdentTranslation`）

1. P と T を探す。無ければ `null`。
2. `subtree = collectSubtreeIds(nodes, T.id)`、`parentBranch = collectSubtreeIds(nodes, P.id)` から `subtree` を除いたもの（P を含む。T の後ろの兄弟とその子孫も含む）。P が `subtree` に含まれる（循環）なら `null`。
3. `parentBottom` = `parentBranch` の各ノードの `checkedAdd(y, height)` の最大値。`branchTop` = `subtree` の各ノードの `y` の最小値。途中の `null`、非有限の値があれば `null`。
4. `newTop = checkedAdd(parentBottom, SIBLING_VERTICAL_GAP)`。`null`、または `hasSufficientGap(parentBottom, newTop, SIBLING_VERTICAL_GAP)` が偽なら `null`。
5. `rootX = P.x`（有限でなければ `null`）。`dx` は `rootX` と `T.x` の差、`dy` は `newTop` と `branchTop` の差（等しいか許容誤差以下なら 0。下げるときと同じ）。`null` なら `null`。
6. T が枝の上端（`branchTop === T.y`）なら `rootY = newTop`。そうでなければ `rootY = dy === 0 ? T.y : checkedAdd(T.y, dy)`。`null` なら `null`。

### 平行移動（`translateBranch`）

1. `ids = collectSubtreeIds(nodes, rootId)`。根が配列に無ければ `null`。
2. 根の座標が `(rootX, rootY)` と等しく、`dx === 0 && dy === 0` なら、各ノードを同じオブジェクトのまま返す（新しい配列。L-524 の4: 変化が無いと分かれば差を計算しない）。
3. 1回の走査で新しい配列を作る。根は `{ ...node, x: rootX, y: rootY }`（式で決めた値をそのまま入れ、`T.x + dx` の丸めを残さない）。根以外の `ids` のノードは、`dx !== 0` なら `x = checkedAdd(x, dx)`、`dy !== 0` なら `y = checkedAdd(y, dy)`。`null` が1つでもあれば `null` を返す（途中まで動いた配列を返さない）。ほかのノードは同じオブジェクト。

### 丸め誤差への配慮（L-524）

- 並べ替えでは、すでに目的の位置にあるときに差を計算すると、丸めで 0 にならず（例: `1.42e-14`）、`checkedAdd` が桁落ちと判定して `placement-failed` になった。上げ下げでは、目的の座標と今の座標の差が丸めの許容誤差以下なら、差を 0 とみなす（等しければ `checkedSubtract` も呼ばない）。許容誤差は `calculateRoundingTolerance(目的, max(|今|, 枝の座標の大きさ), 間隔 × 1e-9)`、つまり `min(間隔 × 1e-9, Number.EPSILON × max(1, |目的|, |今|, 枝の座標の大きさ) × 4)`。「枝の座標の大きさ」は、動かす枝（T と全子孫）の各ノードの座標の絶対値の最大（x の差には |x|、y の差には |y|）。間隔は x が 120、y が 40（上限の考え方は `hasSufficientGap` と同じ）。目的・今の座標だけに比例させると、T が 0 の近くにあり、子孫が数千離れているとき、許容誤差（約 4e-14）が途中の計算の丸め（約 1e4 の値で最大約 9e-13）より小さくなり、差が残って子孫の `checkedAdd` が桁落ちになる。座標が 0〜1e6 の範囲なら許容誤差は 1e-9 未満なので、1e-6 程度の本来の移動は 0 にならない。
- 等値の比較だけでは足りない。手動配置で複製・貼り付けした枝の根の y は `calculateManualOffsetY` の `top + (bottom + 40 − top)` で作られるため、式で求めた目的の座標と 1 ulp ずれることがある（例: 子の下端 + 40 = `371.8218956071483` に対して、根の y が `371.82189560714824`、差 `5.684e-14`）。その枝を、すでに正しい位置にある状態で下げると、差を子孫（y = `1051.4452116460998` など）に `checkedAdd` で足したときに結果が変わらず、桁落ちとして `placement-failed` になる。許容誤差で 0 とみなせば子孫は動かず、根だけが式の値になる（子孫との相対位置のずれは許容誤差以下に収まる）。
- 根の座標は式の値をそのまま入れる。上げるとき T が枝の上端なら、`rootY` は `T.y + dy` ではなく `newTop` そのものにする。子孫は `checkedAdd(x, dx)` で動かすので、`dx` が許容誤差より大きく、かつ子孫の座標に比べて極端に小さい（子孫が遠く離れている）と、桁落ちとして `placement-failed` になる。この経路は、座標の出所（追加・自動配置では間隔が 40px 以上空く）と、失敗しても何も変えずに通知するだけであることを根拠に見送る（L-524 の4 の後半）。
- 正の間隔を足したところ（親の右端 + 120、子の下端 + 40、親の枝の下端 + 40）は、`checkedAdd` の「厳密に増えたこと」に加えて `hasSufficientGap` で実際の間隔を確かめる。

### 例（ノードはすべて幅 100、高さ 60）

- **例 M1（下げる・新しい親に子がある）**: R (0, 0)。R の子 A (220, 0)、A の子 A1 (440, 0)。R の子 T (220, 100)、T の子 Tc (440, 100)。T を下げる（P = A）。`rootX = 220 + 100 + 120 = 440`、A の子 A1 の下端 60 から `rootY = 60 + 40 = 100`。`dx = 440 − 220 = 220`、`dy = 0`（100 と等しいので計算しない）。T → (440, 100)、Tc → (660, 100)。
- **例 M2（下げる・新しい親に子が無い）**: R (0, 0)、A (220, 0)、T (220, 100)、Tc (440, 100)。T を下げる（P = A）。`rootX = 440`、`rootY = A.y = 0`。`dx = 220`、`dy = −100`。T → (440, 0)、Tc → (660, 0)。
- **例 M3（下げる・閉じた親）**: M1 で A が閉じていても同じ座標になる（隠れた子 A1 も「既存の子」に数える）。下げた後に A を展開するので、A1 の下に T が見える。
- **例 M4（上げる・後ろの兄弟が残る）**: R (0, 0)。R の子 A (220, 0) と B (220, 200)。A の子 A1 (440, 0)、T = A2 (440, 100)、A3 (440, 200)。A2 の子 A2a (660, 100)。A2 を上げる（P = A）。P の枝から T の枝を除くと {A, A1, A3}、下端 `260`。`newTop = 300`。T の枝 {A2, A2a} の上端 `100`。`dx = 220 − 440 = −220`、`dy = 300 − 100 = 200`。A2 → (220, 300)、A2a → (440, 300)。R の子の並びは A, A2, B だが、画面では B (y = 200) が A2 (y = 300) より上にある（並びと画面の上下の不一致は避けない。対象外）。
- **例 M5（上げてルートになる）**: R1 (0, 0)、T (220, 0)、Tc (440, 0)。T を上げる（P = R1）。P の枝から T の枝を除くと {R1}、下端 `60`。`newTop = 100`、T の枝の上端 `0`。`dx = −220`、`dy = 100`。T → (0, 100)、Tc → (220, 100)。
- **例 M6（上げる・子が根より上にある）**: P (220, 0)（ほかに子なし）、T (440, 100)、T の子 Tc1 (660, 50)・Tc2 (660, 150)。P の枝から T の枝を除くと {P}、下端 `60`。`newTop = 100`、T の枝の上端 `50`（Tc1）。`dx = −220`、`dy = 50`。T → (220, 150)、Tc1 → (440, 100)、Tc2 → (440, 200)。根で合わせる（T を y = 100 に置く）と Tc1 が y = 50 のまま残り、P の枝の下端（60）より上に来て「枝の下」にならない。
- **例 M7（間隔が取れない）**: M1 で A1 の `y` が `1e17` のとき（倍精度の刻みは 16）、下端は `checkedAdd(1e17, 60)` = `1e17 + 64`、`rootY` は `checkedAdd(1e17 + 64, 40)` = `1e17 + 96`。厳密には増えているが、実際の間隔は 32 で、`hasSufficientGap(1e17 + 64, 1e17 + 96, 40)` が偽なので `placement-failed`。何も変わらず、親も展開せず、失敗の通知が出る。
- **例 M8（溢れ）**: P.x が `Number.MAX_VALUE` なら `checkedAdd(P.x, 100)` が桁落ち（結果が変わらない）で `null`。T の子孫の `x` が `Number.MAX_VALUE` で `dx = 220` なら、`Number.MAX_VALUE + 220` は `Number.MAX_VALUE` に丸まり（Infinity にはならない）、`checkedAdd` が桁落ち（結果が変わらない）と判定して `null` にし、`placement-failed`（途中まで動いた配列を返さない）。

## 自動配置と先頭のルート

自動配置の基準は、配列の最初のルート F（`parentId === null` の最初のノード）の座標である（並べ替えの設計の「自動配置で先頭のルートが変わるとき」）。上げ下げでは F は変わらない。

- **下げる**: T がルートのとき、新しい親 P は T より前にある見えているルートなので、F は P か P より前にある。T は F の後ろにあり、T がルートでなくなっても F の前に新しいルートは現れない。T がルートでないときは、ルートの集合も順も変わらない。
- **上げる**: T がルートになるのは P がルートのときだけで、T' は P の直後に入る。F は P か P より前にあるので、T' は F より後ろ。T が配列で F より前にあっても（O2 の形）、T は取り除かれて P の直後に入るので、F の前に新しいルートは現れない。

したがって、`applyAutoFirstRoot` に当たる座標の引き継ぎは行わない。`changeNodeIndent` は自動配置では座標を変えず、`applyTreeChange` の `layoutNodeForest` が F の `x` / `y` を基準に全体を配置し直す。テストで「上げ下げの前と後で F のオブジェクトが同じ（`toBe`）で、`layoutNodeForest` の後も F の座標が変わらない」ことを固定する（ルートを下げる I7・I8、ルートになる O3、配列で F より前にある T を上げる場合）。

## useNodes の操作

```ts
// hooks/useNodes.ts の UseNodesReturn
// 見えている直前の兄弟の子にする／親の兄弟にする。applyTreeChange を1回だけ呼び、選択と documentRevision は変えない。失敗時は何も変えない
changeNodeIndent: (
  nodeId: number,
  direction: NodeIndentDirection,
  visibleNodeIds: ReadonlySet<number>,
) => ChangeNodeIndentResult;
```

- `reorderSibling` と同じ形にする。`applyTreeChange` のコールバックで `changeNodeIndent(currentNodes, nodeId, direction, visibleNodeIds, mode)`（domain の関数。フックの関数と名前が同じなので、import では `changeNodeIndent as computeNodeIndent` などの別名を付ける）を呼ぶ。失敗なら結果を控えて `null`、成功なら `nodes` を除いた結果を控えて `nodes` を返す。
- `applyTreeChange` が `false` を返し、控えた失敗が無い場合（自動配置の `layoutNodeForest` の失敗）は `placement-failed`。控えた成功があっても `applyTreeChange` が `false` なら `placement-failed`。
- 成功しても `selectedNodeId` と `documentRevision` は変えない。失敗したときは、ノード・選択・履歴・Redo を変えない。
- 親の展開はここでは行わない（折りたたみは `useBranchCollapse` の状態なので、`useNodeIndentAction` が行う）。

## useNodeIndentAction の入出力

```ts
// hooks/useNodeIndentAction.ts
type UseNodeIndentActionOptions = {
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

type UseNodeIndentActionReturn = {
  canIndent: boolean;   // selectedNodeId !== null && availability.indent
  canOutdent: boolean;  // selectedNodeId !== null && availability.outdent
  changeSelected: (direction: NodeIndentDirection) => void; // ヘッダーのボタン用。未選択なら何もしない
  change: (nodeId: number, direction: NodeIndentDirection) => void; // MapStage の onChangeNodeIndent にそのまま渡す
};
```

- `availability` は `useMemo` で `nodes`・`selectedNodeId`・`visibleNodeIds` が変わったときだけ求める（`getNodeIndentAvailability` を1回）。3つの入力をすべて依存に入れ、一部だけで判定しない（L-612）。
- `change(nodeId, direction)`:
  1. `result = changeNodeIndent(nodeId, direction, visibleNodeIds)`（受け取った `visibleNodeIds` をそのまま渡す）。
  2. `result.ok && result.direction === "indent"` のときだけ `expandNodes([result.newParentId])`（成功した下げでは `newParentId` は必ず数値。型を絞るため `newParentId !== null` も確かめる）。
  3. 結果によらず `publishNotice(formatNodeIndentNotice(result))` を1回呼ぶ。
- `changeSelected(direction)` は `change(selectedNodeId, direction)` と同じ。

### 下げるときの折りたたみの展開

- **どこで**: `useNodeIndentAction.change` の中、`changeNodeIndent` が成功を返した直後。
- **どの API で**: `useBranchCollapse` の `expandNodes([newParentId])`。Phase 13 の `useOutlineImport.submit`（`expandNodes([target.parentId])`）と `MapEditor` の `addChildNodeExpanding` と同じ API。`MapEditor` は `branchCollapse.expandNodes` を渡す。
- **展開するのは新しい親 P だけ**: P は見えている兄弟なので、P の祖先は閉じていない。P を開けば T とその兄弟（P の既存の子）が見える。P が閉じていなければ `expandCollapsedNodes` は集合を変えない（同じ参照を返す）。
- **描画の順**: `applyTreeChange` の commit と `expandNodes` の状態更新は同じイベントの中で行うので、1回の描画にまとまる。T が隠れた状態の描画は起きず、`useHiddenNodeInteractionReset` が選択を外すことも無い（ページの結合テストで、閉じた親へ下げた後も T が選択されたままであることを固定する）。`expandNodes` が描画時の `index`（下げる前の木）を使っても、P は下げる前から子を持つ（閉じられるのは子を持つノードだけ）ので、P は正しく閉じた集合から外れる。
- **履歴との関係**: 折りたたみは表示の状態で、履歴に入らない。「元に戻す」で T は元の親へ戻るが、P を閉じ直すことはしない。成功した Undo は `documentRevision` を上げ、既存の規則どおり折りたたみを全展開する（8.2 節）ので、P も開いた状態になる。「やり直す」も同じ。
- **失敗したとき**: `at-edge`・`invalid-structure`・`placement-failed` など、成功でないときは展開しない（L-001）。上げるときは展開しない（T の新しい親は T の祖先なので閉じていない）。

## 履歴

- 1回の上げ下げ（`parentId` の変更、配列の位置、手動配置での枝の平行移動、自動配置での再配置）が Undo / Redo の1操作。8.1 の表に「階層の上げ下げ」を足す。
- 端・失敗では `applyTreeChange` が候補を返さないので、履歴も Redo も変えない。
- 成功した「元に戻す」「やり直す」は、既存の規則どおり選択を外し、`documentRevision` を上げる。枝の構造の変更の通知はそれで消える。

## 通知

### 枠

並べ替えと上げ下げで、操作通知バーの8系統目の枠を共有する（「枝の構造の変更の通知」）。

- `MapEditor` が `const { notice: treeEditNotice, publishNotice: publishTreeEditNotice } = useRevisionScopedNotice(documentRevision);` を持ち、`publishTreeEditNotice` を `useSiblingReorderAction` と `useNodeIndentAction` の両方へ渡す。`treeEditNotice` を操作通知バーの8番目の `MapOperationNotice` に出す（今の `siblingReorder.notice` の位置）。操作通知バーの表示条件（`operationNotices` の「すべて `null` なら `null`」の条件）の `siblingReorder.notice === null` も `treeEditNotice === null` に置き換え、8番目の `{siblingReorder.notice !== null && <MapOperationNotice notice={siblingReorder.notice} />}` を `{treeEditNotice !== null && <MapOperationNotice notice={treeEditNotice} />}` に置き換える（条件に残すと、上げ下げの通知だけがあるときにバーが出ない）。
- `useSiblingReorderAction` は、options の `documentRevision` を `publishNotice: (notice: OperationNotice) => void` に置き換え、戻り値から `notice` を除く。中で `useRevisionScopedNotice` を呼ばない。`reorder` は今までどおり、結果ごとに `publishNotice(formatSiblingReorderNotice(result))` を1回呼ぶ。
- 表示する期間は今までどおり: 次の並べ替え・上げ下げの通知か、`documentRevision` の変化まで。並べ替えの通知の後に上げ下げをすると、上げ下げの通知に置き換わる（逆も同じ）。ほかの系統の通知とは独立した枠で、互いに消さない。
- 系統の数は8のまま。8系統目の名前を「兄弟の順序変更の通知」から「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ）」に直す。

### 文言（`formatNodeIndentNotice(result: ChangeNodeIndentResult): OperationNotice`）

`{親}` は新しい親のラベル。`getNodeDisplayLabel` で空なら「新しいノード」にし、コードポイントで数えて21以上なら先頭20コードポイントに「…」を付ける（20ちょうどは付けない。定数 `NODE_INDENT_NOTICE_LABEL_MAX_CODE_POINTS = 20`）。`{D}` は `depth`（桁区切りなし）。「兄弟」は `isRoot` なら「ルート」にする。

| 結果 | `kind` | 文言 |
| :--- | :--- | :--- |
| 成功（下げる） | `status` | `枝の階層を下げました（「{親}」の子、第{D}階層）。` |
| 成功（上げる・親がある） | `status` | `枝の階層を上げました（「{親}」の子、第{D}階層）。` |
| 成功（上げる・ルートになった） | `status` | `枝の階層を上げました（ルート、第1階層）。` |
| `at-edge`（下げる） | `status` | `これ以上階層を下げられません（見えている直前の兄弟がありません）。` |
| `at-edge`（下げる）で `hiddenBeyond` | `status` | 上の文言の後に `隠れている兄弟の子にするには、表示を『すべて』に切り替えてください。` を続ける |
| `at-edge`（上げる） | `status` | `これ以上階層を上げられません（ルートです）。` |
| `node-missing`・`node-hidden`・`invalid-structure`・`placement-failed` | `error` | `枝の階層を変更できませんでした。` |

例: `枝の階層を下げました（「新しいノード」の子、第3階層）。`、`これ以上階層を下げられません（見えている直前のルートがありません）。隠れているルートの子にするには、表示を『すべて』に切り替えてください。`

- **出す場面**: ショートカット・ボタンで `changeNodeIndent` を呼んだときは、結果ごとに必ず1つ出す。ボタンは端では無効なので、ボタンから `at-edge` になるのは描画と同じイベントの中でノードが変わった場合だけ。
- **読み上げ**: 成功の文言には深さが入るので、同じ枝を続けて下げる・上げると文言が変わって読み上げ直される。別の枝を続けて同じ親の下の同じ深さへ動かした場合など、成功の文言が同じまま続くと読み上げられないことがある。端の通知が同じ文言で続く場合も同じ（既知の制限。並べ替えと同じ）。

## UI

### ヘッダーのボタン（`NodeIndentControl`）

```ts
type NodeIndentControlProps = {
  canOutdent: boolean;
  canIndent: boolean;
  onOutdent: () => void;
  onIndent: () => void;
};
```

- 置き場所: `operationControls` の中、`NodeSiblingOrderControl`（「上へ」「下へ」）の右隣、`CLIPBOARD_OPERATION_HINT` の前。並びは「上へ」「下へ」「階層を上げる」「階層を下げる」（← と → の順に合わせ、上げるを左に置く）。
- 2つのボタンを `<div role="group" aria-label="階層" className="flex shrink-0 gap-2">` で囲む。見た目は `NodeSiblingOrderControl` と同じ `buttonClassName`。

| | 階層を上げる | 階層を下げる |
| :--- | :--- | :--- |
| 表示する文字 | `階層を上げる` | `階層を下げる` |
| `aria-label` | `枝の階層を上げる` | `枝の階層を下げる` |
| `aria-keyshortcuts` | `Alt+ArrowLeft` | `Alt+ArrowRight` |
| `title` | `枝の階層を上げる（Alt/Option+←）` | `枝の階層を下げる（Alt/Option+→）` |
| `disabled` | `!canOutdent` | `!canIndent` |

- `aria-label` は表示する文字を含む（見える名前と読み上げる名前を一致させる）。
- `disabled` 属性で実際に押せなくする（L-058）。「階層を上げる」は未選択とルートで無効、「階層を下げる」は未選択と見えている直前の兄弟が無いとき（先頭の兄弟・一人っ子・先頭のルート）で無効。
- **ショートカットの目印**: 両方のボタンに `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE`（`data-tree-edit-shortcut-button`）を付ける。`NodeSiblingOrderControl` の2つのボタンも、今の `data-sibling-reorder-button` をこの属性に置き換える。4つのボタンのどれにフォーカスがあっても、`Alt` + `↑` / `↓` / `←` / `→` が働く。ボタン自身はこれらのキーを処理しない。
- **Enter の押し続け**: 両方のボタンの `onKeyDown` で、`event.key === "Enter" && event.repeat` なら `preventDefault` する（L-408）。Space は止めない。
- **フォーカス**: `usePairedButtonFocusHandover`（下記）を使う。押したボタンが無効になったとき、フォーカスがそのボタンか `body` にあれば、もう一方のボタンが有効ならそちらへ移す。例: ルートの直前まで上げて「階層を上げる」が無効になると、上げたノードの直前に元の親があるので「階層を下げる」は有効で、そちらへ移る。両方の Enter の押し続けを止めているので、移った先で逆の操作が続けて起きることは無い（L-408 の組の要件）。移せる先が無ければ記録を捨てる（L-246）。
- **クリック**: `event.detail` では弾かない。ダブルクリックは2回の操作として扱う（並べ替えと同じ。L-150）。端に着いて無効になったボタンへの2回目のクリックは何もしない。
- `pointerdown` の既定の動作は止めない（編集中のラベルを `blur` で確定してから上げ下げするため）。
- 端で無効になったとき（上記）を除き、押した後にアプリはフォーカスを移さない。

### `usePairedButtonFocusHandover`

```ts
// components/layout/usePairedButtonFocusHandover.ts
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

`NodeSiblingOrderControl` の `upButtonRef`・`downButtonRef`・`focusedButtonRef`・`useLayoutEffect`・`handleFocus`・`handleBlur` をそのまま移す（`useLayoutEffect` の依存は `[firstEnabled, secondEnabled]`）。`NodeSiblingOrderControl` の既存のテストがそのまま通ることで、挙動が変わらないことを確かめる。

### 操作ヒント

`LayoutModeOperationHint.tsx` の両モードの文言の末尾に `・Alt(Option)+←/→で階層を上げ下げ` を足す。

- 手動配置: `…・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ`
- 自動配置: `…・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更・Alt(Option)+←/→で階層を上げ下げ`

### ショートカット

#### 共通の条件（`components/map/treeEditShortcutGuard.ts`）

```ts
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

export function passesTreeEditShortcutGuard(input: TreeEditShortcutInput): boolean;
```

`passesTreeEditShortcutGuard` は、今の `resolveSiblingReorderShortcut` のキー以外の条件をそのまま移したもの。次をすべて満たすとき `true`:

1. `defaultPrevented` が偽。
2. `isComposing` が偽、かつ `keyCode !== 229`（L-474）。
3. `altKey` が真で、`ctrlKey`・`metaKey`・`shiftKey` がすべて偽（AltGr は対象外）。
4. `isEditing` が偽。
5. `target` が対話要素でない（`isInteractiveTarget`）。例外として、`target` から最も近い `button` が `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE` を持つときは対話要素として扱わない（目印付きの要素の中にある別のボタンは止める。L-522）。
6. `selectedNodeId !== null`。
7. `hasActiveGesture` が偽。

`siblingReorderShortcut.ts` は `SIBLING_REORDER_BUTTON_ATTRIBUTE` と `isSiblingReorderButtonTarget` を消し、`resolveSiblingReorderShortcut` を「`passesTreeEditShortcutGuard(input)` が偽なら `null`、`ArrowUp` → `"up"`、`ArrowDown` → `"down"`、それ以外 `null`」にする。`SiblingReorderShortcutInput` は `TreeEditShortcutInput` の別名にする。既存の `siblingReorderShortcut.test.ts` は定数の名前を置き換えるだけで通ること。

#### 上げ下げの判定（`components/map/nodeIndentShortcut.ts`）

```ts
export function resolveNodeIndentShortcut(input: TreeEditShortcutInput): NodeIndentDirection | null;
```

`passesTreeEditShortcutGuard(input)` が偽なら `null`。`key` が `"ArrowRight"` なら `"indent"`、`"ArrowLeft"` なら `"outdent"`、それ以外は `null`。`repeat` は見ない（押し続けを許可する）。

```ts
export type AltArrowNavigationInput = Pick<
  TreeEditShortcutInput,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing" | "keyCode" | "defaultPrevented" | "target" | "isEditing"
>;
export function shouldSuppressAltArrowNavigation(input: AltArrowNavigationInput): boolean;
```

次をすべて満たすとき `true`（ブラウザの「戻る」「進む」を止める）: `key` が `"ArrowLeft"` か `"ArrowRight"`、条件 1〜4 を満たす、`isEditableTarget(target)` が偽（`input`・`textarea`・`select`・有効な `contenteditable` の外）。選択の有無、ジェスチャーの有無、ボタンなどの対話要素かどうかは見ない。

#### `useNodeIndentShortcut`（`components/map/useNodeIndentShortcut.ts`）

```ts
type UseNodeIndentShortcutOptions = {
  selectedNodeId: number | null;
  isEditing: boolean;
  hasActiveGesture: () => boolean;
  enabled: boolean;
  onChangeNodeIndent: (nodeId: number, direction: NodeIndentDirection) => void;
};
```

`useSiblingReorderShortcut` と同じ形にする（最新の options を ref に控え、`window` の `keydown` の登録は1回だけ）。`keydown` で:

1. `enabled` が偽なら何もしない（`preventDefault` もしない）。ダイアログを開いている間は「戻る」「進む」の抑止も働かない（既知の制限。「対象外」を参照）。
2. `resolveNodeIndentShortcut` が方向を返したら、`preventDefault` してから `onChangeNodeIndent(selectedNodeId, direction)` を呼ぶ。端で動かせないときも `preventDefault` する。
3. 方向が `null` で、`shouldSuppressAltArrowNavigation` が真なら、`preventDefault` だけする。
4. それ以外は何もしない。

`MapStage` は新しい必須の props `onChangeNodeIndent` を受け取り、`useNodeIndentShortcut({ selectedNodeId, isEditing: editing.editingNodeId !== null, hasActiveGesture, enabled: shortcutsEnabled, onChangeNodeIndent })` を `useSiblingReorderShortcut` の直後で呼ぶ。`MapEditor` は `nodeIndent.change` を渡す。

`Alt` + `↑` / `↓` と `Alt` + `←` / `→` はキーが重ならないので、同じ `keydown` で並べ替えと上げ下げの両方が動くことは無い。

## 既存の操作との関係

上げ下げに関わる既存の操作と入口を、`MapEditor`・`MapStage` の props とフックから列挙して1つずつ決めた（L-061）。

| 既存の操作 | 関係 |
| :--- | :--- |
| 兄弟の順序変更（14 章） | 通知の枠、ショートカットの共通の条件、ボタンの目印の属性を共有する。上げた後は、新しい兄弟の中で並べ替えられる。4つのボタンのどれにフォーカスがあっても4つのショートカットが働く |
| 枝の折りたたみ（10 章） | `documentRevision` を上げないので、折りたたみは保つ。下げるとき、閉じた新しい親は展開する（成功したときだけ）。閉じた T も上げ下げでき、手動配置では隠れた子孫も一緒に動く。上げても元の親は閉じていない（T が見えているため）ので、展開・正規化の影響は無い |
| 表示レベル（5 章） | 見えている直前の兄弟の子にする。隠れた兄弟は元の階層のまま残し、消さない・並びを変えない。端の通知で「すべて」への切り替えを案内する。T の可視性は変わらない。上げた後、元の親が T だけのおかげで見えていた（重要度が表示レベルに満たない）なら、元の親は隠れる。選択は T のままなので、選択は外れない |
| ノード検索（9 章） | 変えない。候補の順は配列の順なので、下げて T を L の直後へ移したとき・上げて P の直後へ移したときに、T の候補の位置が変わる |
| 枝の複製・コピー・貼り付け（3.8 節、3.9 節） | 変えない。上げ下げした後の枝を複製・コピーしても、枝の中の形と順は保たれる |
| 子・兄弟の追加（`Tab` / `Enter`） | 変えない。`Tab` は子の追加のまま。下げた位置は子の追加と同じ規則（末尾・手動配置の座標） |
| 削除・接続（3.5 節、3.7 節） | 変えない。`Shift` + ドラッグの接続は、任意のノードの子にする操作として残る（上げ下げは直前の兄弟・祖父母にだけ移す） |
| 手動配置のドラッグ移動・自動配置のドラッグ（並べ替え） | 変えない。ドラッグの途中はショートカットが働かない（`hasActiveGesture`） |
| `F` キー | 変えない。上げ下げの後も選択中のノードへ移動できる |
| 元に戻す / やり直す（8 章） | 上げ下げ1回が1操作。成功した Undo / Redo は選択を外し、折りたたみを全展開し、通知を消す（既存の規則） |
| マップの切り替え（12 章） | `MapEditor` ごと作り直すので、通知も状態も残らない |
| マップのダイアログ・箇条書きからの追加のダイアログ | 開いている間は、根の `inert` でボタンが押せず、ショートカットは `editorShortcutsEnabled`（`MapStage` の `shortcutsEnabled`）で止まる。このとき「戻る」「進む」の抑止も働かない（`enabled` が偽なら何もしない）。上げ下げにドラッグは無いので、ダイアログを開いたときに中止するジェスチャーは増えない |
| ラベル編集中 | ショートカットは働かない（`Alt` + `←` / `→` は入力欄のカーソル移動などブラウザに任せる）。ボタンを押すと、編集を確定してから上げ下げする |
| コンテキストメニュー | 変えない（項目を足さない） |
| JSON の書き出し・読み込み（6.2 節） | 形式は変えない。親子は `parentId`、順は配列の順として書き出され、読み込むと同じ木になる |
| PNG / SVG の書き出し（6.3 節） | 変えない。正本の `nodes` の座標をそのまま使うので、上げ下げした後の配置が出る |
| 自動保存（6.1 節） | 変えない。上げ下げで `nodes` が変わると、通常の 300ms の自動保存に流れる |
| 配置モードの切り替え（4.1 節） | 変えない。上げ下げした木は、手動から自動へ切り替えたときの配置にも効く |
| 箇条書きからの追加（13 章） | 変えない。取り込んだ後の階層の直しに使える |

## エラーと境界条件

| 条件 | 扱い |
| :--- | :--- |
| 未選択 | ボタンは無効。ショートカットは何もしない（通知も出さない）。文字入力先の外なら `Alt` + `←` / `→` の「戻る」「進む」は止める |
| 先頭の兄弟・一人っ子・先頭のルートで下げる | 「階層を下げる」は無効。ショートカットは `at-edge` の通知 |
| 前に隠れた兄弟だけがある | `at-edge`。通知で「すべて」への切り替えを案内する |
| ルートで上げる | 「階層を上げる」は無効。ショートカットは `at-edge` の通知 |
| 手動配置で座標が有限でなくなる・桁落ちする・間隔が取れない | `placement-failed`。何も変わらず、親も展開しない |
| 自動配置で `layoutNodeForest` が失敗する | `placement-failed`。何も変わらない |
| 不正なデータ（親が無い・循環） | `invalid-structure`。何も変わらない |
| 押し続け（`Alt` + `→`） | 続けて下げ、端に着いたら端の通知を出し続ける |
| 大きなマップ | 1回の上げ下げは配列の走査数回と、自動配置なら全体の再配置1回。ボタンの有効・無効は、`nodes`・選択・表示集合が変わったときに1回の走査 |

## 受け入れ基準

1. ノードを選択して「階層を下げる」または `Alt`（`Option`）+ `→` を押すと、見えている直前の兄弟の子の末尾になる。ルートは直前の見えているルートの子になる。間の隠れた兄弟は飛び越え、元の階層に残る。
2. 「階層を上げる」または `Alt` + `←` を押すと、元の親の兄弟になり、兄弟の並びで元の親の直後に入る。後ろの兄弟は元の親の子のまま。元の親がルートなら、T はルートになる。
3. 手動配置では、下げると根が子の追加と同じ位置（新しい親の右 120px、既存の子の下端から 40px 下。子が無ければ新しい親と同じ高さ）に来て、子孫は同じ量だけ動く。上げると根が元の親と同じ `x` に来て、枝の上端が元の親の枝（T の枝を除く）の下端から 40px 下に来る。
4. 自動配置では、上げ下げした木で全体が並び直り、先頭のルートの位置は変わらない。
5. 閉じた兄弟の下へ下げると、その兄弟が開き、T は見える状態で選択されたまま。失敗したときは開かない。
6. 端ではボタンが無効になり、ショートカットは端の通知を出す。隠れた兄弟が前にあれば「すべて」への切り替えを案内する。
7. 1回の上げ下げが1回の「元に戻す」で戻り、「やり直す」で同じ木と座標に戻る。直後の選択は T のまま。折りたたみは保たれる（下げた先の親の展開を除く）。
8. 成功・端・失敗の通知が、並べ替えと共有する操作通知バーの8系統目に出る。
9. ラベル編集中・入力欄・4つのボタン以外のボタン・IME 変換中・ダイアログを開いている間・ジェスチャーの途中は、ショートカットが働かない。「上へ」「下へ」「階層を上げる」「階層を下げる」にフォーカスがある間は働く。ボタンの Enter の押し続けで連続して動かない。文字入力先の外の `Alt` + `←` / `→` では、ページが「戻る」「進む」しない。
10. 保存形式・JSON・履歴の形式は変わらない。上げ下げした木は自動保存・JSON の書き出しと読み込みで保たれる。
11. `npm run verify` が成功する。`docs/specifications/features.md`、`docs/specifications/data-model.md`、`docs/architecture/overview.md`、`docs/testing/browser-test-cases.md`、README 類、`ROADMAP.md` が実装に合っている。

## テスト方針

### 純関数: `nodeIndent.test.ts`

- `getNodeIndentAvailability`: 未選択・不在・隠れている・ルート（上げられない）・先頭の兄弟（下げられない）・中間・一人っ子・前に隠れた兄弟だけ。`nodes` を1回だけ走査すること（反復の回数を数える配列で包む）。
- `changeNodeIndent`（配列）: 例 I1〜I8、O1〜O5 の各行を1例1テストで写す（ID と `parentId` の並び）。
  - 子孫とほかのノードのオブジェクトの同一性（`toBe`）と配列位置が変わらないこと。入力の配列を変えないこと。
  - 結果に `buildNodeForestRelations` を通し、`childrenByParent` と `roots` の順が期待どおりであること（下げた T が新しい親の子の末尾、上げた T が元の親の直後）。
  - 隠れた兄弟が全件残り、順が変わらないこと（L-460）。
  - I3 で「L の直後」を「L の直前」や「T の元の位置」に変える変異で落ちること。O1 で「P の直後」を「P の直前」や「兄弟の末尾」に変える変異で落ちること（L-541）。
  - `node-missing`・`node-hidden`、循環（P が T の子孫になっている不正なデータ）で `invalid-structure`、親が配列に無い T を上げると `invalid-structure`。
  - 結果の `direction`・`newParentId`・`newParentLabel`（空ラベルは空文字のまま）・`depth`、`at-edge` の `hiddenBeyond`・`isRoot`。
- `changeNodeIndent`（手動配置）: 例 M1〜M6 の座標。M7・M8 で `placement-failed`、途中まで動いた配列を返さないこと。
- `changeNodeIndent`（自動配置）: 座標を変えないこと。I7・I8・O3・O2 の形（F より前の T を上げる）で、最初のルートのオブジェクトが変わらず（`toBe`）、続けて `layoutNodeForest` に通しても最初のルートの `x` / `y` が変わらないこと。

### 純関数: `nodeIndentPlacement.test.ts`

- `calculateIndentTranslation`: 子あり（M1）・子なし（M2）・隠れた子を含む（M3）。孫の下端を数えないこと（孫を子より下に置いた入力で確かめる）。通常の入力で `calculateChildPlacement` と同じ `(x, y)` になること（式が食い違わないように固定する。乱数で 1,000 通りの木を作って比べる）。
- `calculateOutdentTranslation`: M4〜M6。T の後ろの兄弟とその子孫が `parentBottom` に入ること、T の枝が入らないこと（T の枝を最も下に置いた入力で確かめる）。
- 目的の座標が今と等しいとき `dx`・`dy` が 0 で、`translateBranch` がオブジェクトを変えない（`toBe`）こと。差が丸めで残る入力（L-524 の再現: 並べ替えで見つかった `1.42e-14` の型の入力）で `placement-failed` にならないこと。
- `hasSufficientGap` の検査（M7）、`checkedAdd` の溢れ（M8）、`NaN` の座標で `null`。
- 兄弟が10,000件・枝が10,000ノードでも、スプレッドを使わず動くこと。

### 純関数: `nodeIndentMessages.test.ts`

- 通知の表の全行（下げる・上げる・ルートになる、兄弟・ルート、`hiddenBeyond` の有無、失敗の4つの理由）と `kind`。
- ラベル: 空 → 「新しいノード」、20コードポイントちょうど → そのまま、21コードポイント → 先頭20 + 「…」、サロゲートペア（絵文字）を1コードポイントとして数えること（L-614）。

### 純関数: `treeEditShortcutGuard.test.ts`・`nodeIndentShortcut.test.ts`

- `passesTreeEditShortcutGuard`: 条件 1〜7 をそれぞれ1つだけ外した入力で `false`。目印付きの `button`（とその内側）で `true`、目印付きの要素の中の目印の無い `button` で `false`。
- `resolveNodeIndentShortcut`: `Alt+ArrowRight` → `"indent"`、`Alt+ArrowLeft` → `"outdent"`、`ArrowUp` などほかのキー → `null`、条件を1つ外すと `null`、`repeat: true` でも方向を返すこと。
- `shouldSuppressAltArrowNavigation`: 未選択・ジェスチャー中・目印の無いボタンの上でも `true`、`input`・`textarea`・`select`・`contenteditable` の中・ラベル編集中・`Shift` などの併用・IME・`defaultPrevented`・`ArrowUp` で `false`。
- 既存の `siblingReorderShortcut.test.ts` が、定数の名前を `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE` に置き換えるだけで通ること。

### フック: `useNodesIndent.test.ts`（`useNodesSiblingOrder.test.ts` に倣う）

- 手動配置・自動配置のそれぞれで、下げる・上げるの成功。1回の「元に戻す」で木と座標が戻り、「やり直す」で同じになること（1回の commit）。
- 成功で `selectedNodeId` と `documentRevision` が変わらないこと。
- `at-edge`・`invalid-structure`・手動配置の `placement-failed`・自動配置の `layoutNodeForest` の失敗で、ノード・選択・履歴・Redo が変わらないこと。
- 新しい親の解決が `applyTreeChange` の中の最新の配列で行われること。手動配置で R（id 1、ラベル「R」）の子 A（id 2、ラベル「A」）だけのマップにし、同じ `act` の中で `const created = addSiblingNode(2)!;`（A の直後に R の子が増える）の直後に `changeNodeIndent(created, "indent", new Set([1, 2, created]))` を呼ぶ（追加したノードを含む表示集合を明示的に渡す）。期待は `{ ok: true, direction: "indent", newParentId: 2, newParentLabel: "A", depth: 3 }` で、`created` の `parentId` が 2 になること。描画時の古い `nodes` で判定すると `created` が無く `node-missing` になって落ちる。

### フック: `useNodeIndentAction.test.tsx`

- `canIndent` / `canOutdent` が、選択・表示集合・`nodes` に合わせて変わること。
- 成功した下げで `expandNodes` が `[newParentId]` で1回呼ばれること。上げる・`at-edge`・失敗では呼ばれないこと（L-001）。
- 結果ごとに `publishNotice` が文言と `kind` で1回呼ばれること。
- `changeSelected` が `selectedNodeId` で `changeNodeIndent` を呼び、`visibleNodeIds` をそのまま（`toBe`）渡すこと。未選択では呼ばないこと。

### フック: `useSiblingReorderAction.test.tsx`（変更）

- 通知の確認を、渡した `publishNotice` が文言と `kind` で1回呼ばれることに置き換える。`documentRevision` で消えることは `useRevisionScopedNotice` の既存のテストとページの結合テストで確かめる。

### ショートカットのフック: `useNodeIndentShortcut.test.tsx`（`useSiblingReorderShortcut.test.tsx` に倣う）

- `enabled: false` のとき、選択中でも呼ばれず、`preventDefault` もしないこと。`enabled` を切り替えても登録をやり直さないこと。
- 呼んだときと抑止したときだけ `fireEvent.keyDown` の戻り値が `false`、それ以外は `true`。未選択の `body` への `Alt+ArrowLeft` で呼ばずに `false` になること。入力欄への `Alt+ArrowLeft` で `true` になること。`repeat: true` でも呼ぶこと。

### 部品: `NodeIndentControl.test.tsx`・`NodeSiblingOrderControl.test.tsx`

- 表示する文字、`aria-label`、`aria-keyshortcuts`、`title`、`role="group"` と名前「階層」、ボタンの並び（上げるが先）。
- `canOutdent: false` で「階層を上げる」に `disabled` 属性が付き、クリックで `onOutdent` が呼ばれないこと（L-058）。
- Enter の押し続け（`repeat: true`）の `keyDown` の戻り値が `false`、`repeat: false` では `true`（両方のボタン。L-408）。
- 押したボタンが無効になったとき、もう一方が有効ならそちらへフォーカスが移り、無効なら移さず、その後にボタンが有効に戻ってもフォーカスを奪わないこと（L-246）。
- 両方のボタンに `TREE_EDIT_SHORTCUT_BUTTON_ATTRIBUTE` が付き、group には付かないこと。ボタンへの `Alt+←/→` では `onOutdent` / `onIndent` を呼ばないこと。
- `NodeSiblingOrderControl` の既存のテストが、`usePairedButtonFocusHandover` へ移した後も通り、目印の属性の確認だけが新しい定数になること。

### ページの結合テスト: `app/__tests__/pageNodeIndent.test.tsx`（`pageSiblingOrder.test.tsx` に倣い、実際の `Home` から。L-060）

- 手動配置: R の子 A・B を作り、B を選択して「階層を下げる」→ B が A の子になり、座標が例 M2 の式どおり、通知の文言、選択が B のまま。「階層を上げる」で R の子へ戻り、座標が上げる式どおり。1回の「元に戻す」で戻り、「やり直す」で同じになること。
- `Alt+ArrowRight` / `Alt+ArrowLeft` を `body` に送って同じ結果になること。ラベル編集中・検索入力欄・`Alt+Shift+→`・4つのボタン以外のヘッダーのボタンで何も変わらないこと。「上へ」にフォーカスがあるまま `Alt+ArrowRight` を送ると下がること、「階層を下げる」にフォーカスがあるまま `Alt+ArrowUp` を送ると並べ替わること（目印の共有）。
- 閉じた A の下へ B を下げると、A が開き（「枝を展開」が「枝を折りたたむ」に変わる）、B が選択されたまま見えること。`placement-failed` になる座標（例 M7）では A が開かないこと。
- 端でボタンが無効になり、ショートカットで端の通知が出ること。表示レベルを「高のみ」にして前に隠れた兄弟だけがある状態を作り、端の案内の文言。隠れた兄弟を飛び越えて見えている兄弟の子になること。
- 自動配置: ルートを2つ作って2番目を下げると、先頭のルートの座標が変わらないこと。
- 並べ替えの通知の後に上げ下げすると、通知が上げ下げの文言に置き換わり、操作通知バーの通知が1つのままであること。「元に戻す」で消えること。
- 箇条書きのダイアログを開いている間に、`body` へ `Alt+ArrowRight` を送っても変わらないこと（L-061）。
- 未選択で `body` へ `Alt+ArrowLeft` を送ると、`fireEvent.keyDown` の戻り値が `false` であること。
- 上げ下げの後の自動保存で、保存された本体の `nodes` の `parentId` と順が期待どおりであること。
- 配線の変異: `MapEditor` が `MapStage` に `onChangeNodeIndent` を渡さない、ヘッダーへ `canIndent` と `canOutdent` を取り違えて渡す、`expandNodes` を渡さない、`publishNotice` を別の枠へ渡す、などの変異でどれかのテストが落ちること（上げると下げるで有効・無効が違う状態を作って確かめる。L-060）。

## 既存の文書の更新

各文書を「8系統」「兄弟の順序変更の通知」「data-sibling-reorder-button」「Alt+↑/↓」「Phase 14」「階層」で grep し、注記が要る箇所をすべて直す。

- `docs/specifications/features.md`
  - 目次と新しい「15. 階層の上げ下げ」の章（節: 15.1 操作、15.2 上げ下げの規則と隠れた兄弟（例 I・O の表。「直前の兄弟」は並べ替えと同じく配列の相対順で決め、手動配置では画面の上下と一致しないことがある、と明記する。L-472）、15.3 手動配置の座標（式と例 M1〜M6）、15.4 自動配置と先頭のルート、15.5 折りたたみの展開、15.6 履歴・選択・通知（文言の表）、15.7 キーボードとフォーカス（「戻る」「進む」の抑止を含む）、15.8 既存の操作との関係、15.9 対象外）。並べ替えと同じく機能ごとに章を分ける（14 章へ追記しない）。
  - 1.1 の Phase 14 の行に「階層の上げ下げ」を足す（残りの3項目は未実装と書く）。1.2 のヘッダーの説明に「階層を上げる」「階層を下げる」を足す。
  - 3.7（接続）に、直前の兄弟・祖父母への付け替えは 15 章の上げ下げでもできることを1行で参照する。
  - 8.1 の表に「階層の上げ下げ | `parentId` の変更、配列の位置、手動配置での枝の平行移動、自動配置での再配置をまとめて1操作」を足す。8.2 の消える通知の記述を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ）」に直す。
  - 10.4 に「階層を下げる: 閉じた新しい親は、成功したときだけ展開する。上げ下げは折りたたみを保つ」を足す。
  - 11.1 の表に `Alt`（`Option`）+ `←` / `→` の行を足し、`Alt` + `↑` / `↓` の行の「ヘッダーの『上へ』『下へ』にフォーカスがある間」を「ヘッダーの『上へ』『下へ』『階層を上げる』『階層を下げる』にフォーカスがある間」に直す。止まる場面・ダイアログの NOTE に `Alt+←/→` を足し、「戻る」「進む」の抑止の NOTE を足す。
  - 11.4 の表に「階層」のボタンの行を足す。操作通知バーの行・「マップ全体置換時の同期リセット」の10番・「8系統独立表示」の本文の、兄弟の順序変更の通知を「枝の構造の変更の通知（兄弟の順序変更・階層の上げ下げ）」に直し、`kind` の表の主な用途に上げ下げの成功・端・失敗を足す。「レイアウトモード別操作ヒント」の文言を新しい文言に直す。
  - 14.1 の「ボタンを押した後…」と 14.7 の目印の属性名を `data-tree-edit-shortcut-button` に直し、目印が4つのボタンに付くことを書く。14.6 の「8系統目」の説明に、上げ下げと枠を共有することを足す。14.9 の対象外の「階層の上げ下げ」を消す。
- `docs/specifications/data-model.md`: 2.1 の `Node` の説明に「`parentId` は上げ下げ（15 章）でも変わる。上げ下げは T の `parentId` と根ノード1つの配列内の位置を変え、子孫の `parentId` と位置は変えない」を足す。新しい節「2.8 階層の上げ下げの型」に `NodeIndentDirection`・`NodeIndentAvailability`・`NodeIndentFailureReason`・`NodeIndentResult`・`ChangeNodeIndentResult` を足す（定義元は `client/src/domain/nodes/nodeIndent.ts`）。保存形式（3章）は変えないことを確かめる。
- `docs/architecture/overview.md`: レイヤーの説明に新しいファイル（`nodeSiblingNeighbors.ts`、`nodeIndent.ts`、`nodeIndentPlacement.ts`、`nodeIndentMessages.ts`、`useNodeIndentAction.ts`、`NodeIndentControl.tsx`、`usePairedButtonFocusHandover.ts`、`treeEditShortcutGuard.ts`、`nodeIndentShortcut.ts`、`useNodeIndentShortcut.ts`）を足し、各ディレクトリのファイル数を実数に合わせる（`ls` で数える）。`useSiblingReorderAction` の説明を `publishNotice` を受け取る形に直す。「兄弟の順序変更の流れ」の後に「階層の上げ下げの流れ」（ボタン・ショートカット → `useNodeIndentAction` → `useNodes.changeNodeIndent` の1回の commit → 成功した下げで `expandNodes` → `MapEditor` の枝の構造の変更の通知）を足す。
- `docs/testing/browser-test-cases.md`: 新しい節「Phase 14: 階層の上げ下げ」（記号 `R`）を、Q 節の後・「結果の集計」の前に足す（下の「手動テスト」）。「結果の集計」に R-01〜R-12 の未実施の行を足す。Q 節のケースで目印の属性名に触れている箇所があれば直す。
- `README.md`: 機能の一覧に「13. 階層の上げ下げ（Phase 14 の2番目の項目）」を足し、編集履歴の対象の列挙に上げ下げを足す。
- `client/README.md`: キーボードショートカットに `Alt`（`Option`）+ `←` / `→` を足し、機能の一覧に階層の上げ下げを足す。`domain/nodes/` の説明に上げ下げを足す。
- `docs/README.md`: 各文書の説明の「兄弟ノードの順序変更」の列挙に「階層の上げ下げ」を足す（流れ、Phase の範囲、型の節 2.8、手動テストの R 節）。
- `ROADMAP.md`: 最後のタスクで、Phase 14 の「階層の上げ下げ」にチェックを付ける（見出しは「（進行中）」のまま）。「現在地」（完了した項目に階層の上げ下げ、進行中は Phase 14、次の未完了項目は「途中への親ノード挿入」（候補003））と「最終更新」の日付を更新する。実機で確認していないことは、確認していないと書く。

## 手動テスト

`docs/testing/browser-test-cases.md` に「Phase 14: 階層の上げ下げ」の節を追加し、ケースの記号は `R` にする。共通の決まりは Q 節と同じにする（`npm run start -- -p 3114` で本番ビルドを普段と別のオリジンで起動、保存データはキーを名前で1つずつ消す、各ケースは「新しいマップ」でケースの ID を名前にしたマップで行う、特に書かない限り表示は「すべて」、通知の行が出るとキャンバスがずれる、結果は実ブラウザで確かめたものだけを記録する）。位置の期待は「左端が同じ」「上下の並び」「40px 下」などの相対的な関係で書き、フォーカスは `document.activeElement.getAttribute("aria-label")` で確かめる（L-613）。基本の木は Q 節と同じ（R の子 A・B・C、C の子 C1・C2）。

| ID | 内容 | 優先度 |
| :--- | :--- | :--- |
| R-01 | 基本（手動配置・ボタン）。B を選択して「階層を下げる」。B が A の子になり、A の右（A の右端から 120px 右）に、A と同じ高さで並ぶこと。通知「枝の階層を下げました（「A」の子、第3階層）。」。「階層を下げる」が無効になり、フォーカスが「階層を上げる」へ移ること。続けて「階層を上げる」で R の子へ戻り、A と同じ左端で、A の枝の下端から 40px 下に来ること | 高 |
| R-02 | 子孫ごと動くこと。C（子 C1・C2）を下げると C1・C2 が同じ量だけ動き、上げると C の枝の上端が B の枝の下端から 40px 下に来ること。上げたとき、後ろの兄弟が元の親の子のまま残ること。手順: C を下げて B の子にした後、C を選択したまま `Enter` で兄弟を1つ足す（足したノードは B の子で、C の後ろに入る）。C を選択し直して「階層を上げる」を押すと、C は R の子（B の直後）になり、足したノードは B の子のまま残ること | 高 |
| R-03 | ショートカット。`Alt` + `→` / `←`（macOS は `Option`）で同じ結果になること。押し続けると続けて下がり、端で「これ以上階層を下げられません（見えている直前の兄弟がありません）。」が出ること。`Alt` + `Shift` + `→`、`Ctrl` + `Alt` + `→` では動かないこと | 高 |
| R-04 | ルート。手動配置でルートを2つ作り、2番目を下げると1番目の子になること。それを上げるとルートに戻り「枝の階層を上げました（ルート、第1階層）。」。ルートでは「階層を上げる」が無効で、ショートカットで「これ以上階層を上げられません（ルートです）。」 | 高 |
| R-05 | 閉じた親へ下げる。A に子を足して閉じ、B を下げると A が開いて、A の既存の子の下に B が見え、B が選択されたままであること。「元に戻す」で B が R の子へ戻ること | 高 |
| R-06 | 隠れた兄弟。子の重要度を「高・低・高」にし、表示を「高のみ」にして3番目を下げると、1番目の子になること（低の兄弟は R の子のまま。表示を「すべて」に戻して確かめる）。続けて、見えている兄弟の前に低の兄弟だけがある状態を作る。手順: 別の「新しいマップ」（名前は `R-06b`）で、R を選択して `Tab` で子を2つ足し、1番目の子の重要度を「低」、2番目の子の重要度を「高」にする（R の重要度は「高」）。表示を「高のみ」にして2番目（高）を選択すると「階層を下げる」が無効であること。`Alt` + `→` を押すと、端の通知「これ以上階層を下げられません（見えている直前の兄弟がありません）。隠れている兄弟の子にするには、表示を『すべて』に切り替えてください。」が出て、木が変わらないこと | 高 |
| R-07 | 自動配置。下げる・上げるで木が並び直ること。ルートを2つ作って2番目を下げても、先頭のルートの位置が変わらないこと | 高 |
| R-08 | 元に戻す / やり直す。ボタン・ショートカットのそれぞれの上げ下げが1回の「元に戻す」で戻り、「やり直す」で同じ木と位置になること。通知が消えること | 高 |
| R-09 | ショートカットが止まる場面と「戻る」の抑止。ラベル編集中（`Option` + `←` で入力欄のカーソルが動く）、検索入力欄、表示セレクター、箇条書きのダイアログ・マップのダイアログを開いている間、日本語 IME の変換中でマップが変わらないこと。Windows または Linux の Chrome・Firefox で、別のページから移ってきたタブで、未選択のまま・「元に戻す」の直後に `Alt` + `←` を押しても、ページが戻らないこと | 高 |
| R-10 | ボタンのキーボード操作と読み上げ。Tab で4つのボタンへ移り、Enter・Space で動くこと。「上へ」にフォーカスがあるまま `Alt` + `→` で下がること。Enter の約3秒の押し続けで1回だけ動くこと。VoiceOver で「枝の階層を下げる」と通知が読まれること | 中 |
| R-11 | 保存と書き出し。上げ下げの後にリロードしても木が保たれること。JSON を書き出して別のマップへ読み込むと同じ木になること。PNG / SVG に上げ下げした後の配置が出ること | 中 |
| R-12 | 幅 375px とダークモード。ヘッダーの4つのボタンが画面に収まり（折り返してよい）、押せること | 中 |

## 反映した知見

| ID | 反映した箇所 |
| :--- | :--- |
| L-001 | 上げ下げの結果を判別共用体で返し、成功したときだけ親を展開する。自動配置の失敗も `placement-failed` として返す |
| L-035 | 対象は ID で指定し、新しい親は `applyTreeChange` の中の最新の配列で解決する |
| L-037 | 通知は `documentRevision` と組にして持ち（共有する枠）、Undo / Redo・置き換えで消す |
| L-057 | 端で押したショートカットに、理由と先へ進む方法（表示を「すべて」に）を通知する |
| L-058 | ボタンは `disabled` 属性で無効にし、無効のときにクリックしても呼ばれないことをテストする |
| L-060 | 新しい props（`onChangeNodeIndent`、ボタンの props、`publishNotice`、`expandNodes`）を必須にし、`Home` からの結合テストと配線の変異で確かめる |
| L-061 | ボタン・ショートカット・「戻る」の抑止を、ダイアログの `inert` と `editorShortcutsEnabled` の対象にし、既存の操作との関係を表にした |
| L-150 | ボタンは画面を切り替えないので、ダブルクリックは2回の操作として扱う。端で無効になったボタンへの続きのクリックは何もしない |
| L-246 | フォーカスの引き継ぎで、移せる先が無い分岐でも記録を捨て、後でボタンが有効になってもフォーカスを奪わないことをテストする |
| L-408 | 両方のボタンの Enter の押し続けを止め、無効になったボタンのフォーカスをもう一方へ移しても逆の操作が続かないようにした（組の要件として書いた） |
| L-457 | 親子は `parentId` で表すので、ブロックとして動かさず根ノード1つだけを動かす |
| L-460 | 上げ下げは正本の全配列に対して行い、隠れた兄弟を消さない・順を変えない。テストで固定する |
| L-472 | 親子は配列の隣接ではなく `parentId` で持ち、「直前の兄弟」は表示の順ではなく配列の相対順と表示集合で決める。手動配置では画面の上下と一致しないことがあると、設計と features.md 15.2 に明記する |
| L-474 | ショートカットと「戻る」の抑止で、`isComposing` と `keyCode` 229 を無視する |
| L-522 | ショートカットの対象外の要素は既存の `isInteractiveTarget` と同じにし、ショートカットを案内する4つのボタンだけを共通の目印で対象に戻す。「戻る」の抑止は文字入力先（`isEditableTarget`）だけを除く |
| L-524 | 目的の座標が今と等しければ差を計算しない。根は式の値をそのまま入れる。正の間隔は `hasSufficientGap` で実際の間隔を確かめる。残る経路（ほぼ一致する座標と遠い子孫）は見送る根拠を書いた |
| L-540 | 順序のフィールドを足さず、配列の相対順を正本にする。再採番をしない |
| L-541 | `splice` と添字を使わず、1回の走査で新しい配列を作る。「直後」「直前」を取り違える変異で落ちるテストにする |
| L-612 | ボタンの有効・無効は `nodes`・選択・表示集合のすべてを依存にして求め、一部の値の変化だけで判定しない |
| L-613 | 手動テストの位置の期待を相対的な関係で書き、フォーカスは `document.activeElement` の `aria-label` で確かめる |
| L-614 | ラベルの切り詰めの境界を「21コードポイント以上なら先頭20コードポイントに『…』」と、境界の値（20ちょうどは付けない）とともに書く |
