# Phase 14: 兄弟ノードの順序変更 設計

作成日: 2026-10-23
基準: main `9bc6c30`。作業ブランチは `codex/phase14-sibling-reorder`（`.worktrees/codex/phase14-sibling-reorder`）。

## 目的・範囲

箇条書きから取り込んだノードや、思いついた順に足したノードを、データを失わずに並べ直せるようにする。ROADMAP Phase 14 の最初の項目「兄弟ノードの順序変更（候補001）」を、1つの PR で実装する。

1. 選択中のノードを、同じ親を持つ兄弟（ルート同士を含む）の中で1つ上・1つ下へ移す（ショートカットとヘッダーのボタン）。
2. 自動配置のときは、ノードをドラッグして同じ親の兄弟の間へ落とすと、その位置へ移す。
3. 手動配置のときは、並びと一緒に縦位置も入れ替え、画面の上下と並びを一致させる。
4. 1回の並べ替えを1つの操作として Undo / Redo できる。

## 対象外

- Phase 14 の他の項目（階層の上げ下げ、途中への親ノードの挿入、枝の切り取り・移動、ノードだけの削除）。
- 別の親の下への移動（ドラッグで別の親の兄弟の間へ落としても、親は変えない）。親の付け替えは今までどおり `Shift` + ドラッグの接続で行う。
- 手動配置でのドラッグによる並べ替え（手動配置のドラッグは今までどおり位置の移動）。
- コンテキストメニューへの「上へ」「下へ」の追加（今のメニューは1項目を前提にした作りのため、今回は触らない）。
- 複数のノードをまとめて並べ替えること（選択は1つだけ）。
- ドラッグ中の画面の自動スクロール。長い兄弟の列は、先にズームアウトしてからドラッグする。
- ラベル順などの自動の並べ替え。
- 手動配置で、入れ替えた2つの枝以外のノードとの重なりの回避（既存の手動配置の操作と同じく、重なりは避けない）。
- `Node` 型、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式の変更。順序のフィールド（`order` など）は足さない。

## 決めたこと

### ユーザーが決めたこと（2026-10-23）

1. **操作方法**: ショートカット、ヘッダーの「上へ」「下へ」ボタン、ドラッグの3つ。ドラッグは自動配置のときだけ有効にする（自動配置では今はノードのドラッグが何もしないので、既存の操作と衝突しない）。ノードをドラッグして同じ親の兄弟の間へ落とすと、並びが変わる。
2. **手動配置**: 並びと一緒に縦位置も入れ替える。入れ替える2つの枝（子孫ごと）を上下に平行移動し、画面の上下と並びを一致させる。上側の枝の上端は動かさず、2つの枝の間の間隔は元のまま保つ。横位置は変えない。
3. **隠れた兄弟**: 表示集合（折りたたみ × 表示レベル）で見えている直前・直後の兄弟を基準にする。間にある隠れた兄弟は飛び越える。
4. **キー**: `Alt`（macOS では `Option`）+ `↑` / `↓`。

### 推奨案として採用したこと（ユーザーには聞いていない）

コントローラーが推奨案として採用したもの:

- **ルート同士の並べ替え**: `parentId` が `null` のノード同士も兄弟として並べ替えられる。理由: 箇条書きの取り込みで複数のルートを作ることが多く、ルートの順も整理したいため。自動配置では先頭のルートの座標が配置の基準なので、先頭のルートが変わるときは、新しい先頭のルートへ旧先頭の `x` / `y` を引き継ぐ（「自動配置で先頭のルートが変わるとき」の節）。
- **履歴**: `applyTreeChange` を1回だけ呼ぶ1回の commit（Undo / Redo の1操作）。選択は変えない（移動したノードを選択したまま）。`documentRevision` は上げない（折りたたみは維持する）。理由: 既存の構造変更（追加・接続・複製）と同じ流儀にし、続けて何度も並べ替えられるようにするため。
- **データ形式**: 兄弟の順序は `nodes` 配列の相対順で表す（既存のまま）。並べ替えは、移動する枝の根ノード1つの配列内の位置を変えるだけにする。子孫の配列位置は変えない（足りる根拠は「子孫の配列位置を動かさなくてよい根拠」の節）。理由: 保存形式・履歴・JSON を変えずに済み、配列全体の再採番も要らないため（L-540）。
- **動かせないとき**: ボタンは `disabled`。ショートカットは、理由を `status` の通知で知らせる。理由: 押しても何も起きないと、壊れていると思われるため（L-057）。
- **通知**: 操作通知バーの8系統目として足す。成功したときも `status` で読み上げる（画面の変化をスクリーンリーダーの利用者へ伝えるため）。features.md の「7系統」の記述を「8系統」に直す。
- **ショートカットの止め方**: 既存の `useNodeKeyboardShortcuts` と同じ条件（`enabled` の ref、ラベル編集中、入力欄などの対話要素、IME 変換中、`keyCode` 229）で止める。`Ctrl` / `Meta` / `Shift` との併用は無視する。キーの押し続け（`repeat`）は許可し、押し続けると続けて移動する。ボタンの Enter の押し続けは、既存の流儀どおり無視する。
- **ドラッグ**: 4px のしきい値に達したら並べ替えのジェスチャーを始める。ポインタの y から、同じ親の見えている兄弟の間の挿入位置を決め、挿入位置を示す線を描く。落とすと1回の commit。挿入位置が元の位置と同じなら何もしない。Escape、`pointercancel`、ステージの外でポインタを離したときは中止する。`Shift` + ドラッグ（接続）は今のまま。

### この設計書の作成者が決めたこと（下の各節で根拠を書く）

- **飛び越える範囲**: 移動するノードは「通過した見えている兄弟と、その間の隠れた兄弟」だけを飛び越え、通過した最後の見えている兄弟の隣に着く。上へは「直前の見えている兄弟の前」、下へは「直後の見えている兄弟の後ろ」。ドラッグも同じ規則（上へ動かしたら挿入位置の直後の見えている兄弟の前、下へ動かしたら挿入位置の直前の見えている兄弟の後ろ）にし、1段のドラッグとショートカットの結果を一致させる。
- **手動配置で飛び越えた隠れた枝**: 飛び越えた見えている兄弟と隠れた兄弟の枝をひとまとまり（「飛び越えた組」）として、相対位置を保ったまま一緒に平行移動する。理由: 画面上で間にある隠れた枝を置いたままにすると、表示を「すべて」に戻したときに、画面の上下と並びが食い違うため（例2）。
- **手動配置で2つの枝が縦に重なっているとき**: 元の間隔が負（重なっている）なら、間隔を `SIBLING_VERTICAL_GAP`（40px）にする。理由: 重なったまま入れ替えると、入れ替えた後も上下が決まらず、並びと画面が一致しないため。40px は兄弟を手動で追加したときの間隔と同じ。
- **自動配置で先頭のルートが変わるとき**: 旧先頭のルートの `x` / `y`（ノード自身の座標）を、新しい先頭のルートへそのまま代入する。木の上端ではなくノードの座標を引き継ぐ理由は、自動配置の基準が「先頭のルートのノード自身の座標」（`placeNodeForest` は第1ルートの `y` を保ち、`columnX[0]` は第1ルートの `x`）であり、折りたたみ中の表示用の配置（`projectCollapsedLayout`）でも同じ点が基準になるため。引き継げば、保存される座標でも表示用の座標でも基準点が動かない。代わりに、新しい先頭の木の高さが違うと、マップ全体の上端は動くことがある（例6）。
- **通知に位置を入れる**: 成功の通知に「見えている兄弟の N 件中 M 番目」を入れる。理由: 続けて押したときに文言が変わり、スクリーンリーダーで毎回読み上げられるため。また、今どこにいるかが音声だけでも分かるため。
- **端の通知に案内を入れる**: 端より先に隠れた兄弟がある場合だけ、「表示を『すべて』に切り替える」案内を足す。兄弟が隠れる理由は表示レベルだけ（下の「隠れた兄弟が生まれる理由」）なので、この案内で必ず先へ進める。
- **ドラッグ中の見た目**: ノードはポインタに追従させず、元の位置で半透明（`alpha` 0.5）にし、挿入位置に青い横線を描く。理由: 自動配置では落とした後に全体が並び直るので、ノードを動かして見せると、落とした後の位置と食い違うため。線だけなら、描画の負担も小さい。
- **ドラッグの挿入位置の判定**: ポインタの横位置は見ず、縦位置だけで決める。

## Global Constraints

- 新規依存なし。`Node`、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式を変えない。
- 並べ替えの規則は純関数（`domain/nodes/nodeSiblingOrder.ts`、`domain/nodes/nodeSiblingSwapPlacement.ts`）、通知の文言は純関数（`domain/nodes/nodeSiblingOrderMessages.ts`）、ショートカットの判定とドロップ位置の判定は純関数（`components/map/siblingReorderShortcut.ts`、`components/map/siblingReorderDropSlot.ts`）、状態と1回の commit は React フック、表示と操作は部品、という既存の境界を守る。
- 結果は判別共用体で返し、呼び出し元は成功したときだけ成功の通知を出す。共用体の分岐は `switch` で網羅し、新しいメンバーを既定の分岐へ流さない（L-001）。
- 対象と挿入先は ID で指定し、配列の添字を層の間で受け渡さない。ショートカットとボタンの「1つ上・1つ下」は、`applyTreeChange` のコールバックの中で最新のノード配列から解決する（L-035）。
- 並べ替えは、表示で絞り込んだ部分配列ではなく、正本の全 `nodes` に対して行う。隠れた兄弟を消したり、順序を変えたりしない（L-460）。
- 配列の操作は1回の走査で新しい配列を作る。`splice` と添字の計算を使わない（L-541）。大きな配列に `Math.min(...arr)` や `push(...arr)` を使わない。
- 座標の計算は `checkedAdd` / `checkedSubtract` を使い、`null` なら `placement-failed` にする。
- 新しい props とコールバックは必須にする。実際の `Home` から `MapEditor`、ヘッダー、`MapStage` まで通す結合テストで配線を確かめる（L-060）。
- TDD で進め、`client` の変更後に `npm run verify` を実行する。タスク単位のサブエージェント実装と、別担当の仕様・品質レビューを行う。
- コミット・push・PR 作成は依頼されたときだけ行う。最後のタスクで `ROADMAP.md` を実態に合わせて更新する。

## 全体の構成

```
MapEditor
├─ useNodes
│   └─ reorderSibling(nodeId, request, visibleNodeIds)  … applyTreeChange を1回呼ぶ。選択と documentRevision は変えない
├─ useSiblingReorderAction                              … ボタンの有効・無効、選択中のノードの移動、MapStage からの要求、通知（8系統目）
│   ├─ getSiblingReorderAvailability                    … domain/nodes/nodeSiblingOrder.ts
│   ├─ formatSiblingReorderNotice                       … domain/nodes/nodeSiblingOrderMessages.ts
│   └─ useRevisionScopedNotice
├─ AppHeader の operationControls
│   └─ NodeSiblingOrderControl（「上へ」「下へ」）      … NodeDuplicateControl の右隣
└─ MapStage（layoutMode と onReorderSibling を新しく受け取る）
    ├─ useSiblingReorderShortcut                        … Alt+↑ / Alt+↓。判定は resolveSiblingReorderShortcut
    ├─ useSiblingReorderDragEscape                      … ドラッグ中の Escape で中止
    └─ useMapStageInteractions
        ├─ stageInteractions.handleNodePointerDown     … Shift なら接続、自動配置なら並べ替え、それ以外は移動
        ├─ createSiblingReorderGesture                  … pixi/siblingReorderGesture.ts
        │   └─ resolveSiblingReorderDrop                … components/map/siblingReorderDropSlot.ts
        └─ siblingReorderPreview の状態                … 描画（半透明のノードと挿入位置の線）へ渡す
```

新しく作るファイル:

| 層 | ファイル | 役割 |
| :--- | :--- | :--- |
| domain | `domain/nodes/nodeSiblingOrder.ts` | 型（`useNodes` の戻り値の `ReorderSiblingResult` を含む全型）、見えている隣の兄弟の解決 `findSiblingReorderTarget`、ボタンの有効・無効 `getSiblingReorderAvailability`、並べ替え `reorderSiblingNodes`、要求（`step` / `drop`）ごとの並べ替え `reorderSiblingByRequest` |
| domain | `domain/nodes/nodeSiblingSwapPlacement.ts` | 手動配置の縦位置の入れ替え `swapSiblingBranchPositions` |
| domain | `domain/nodes/nodeSiblingOrderMessages.ts` | 通知の文言 `formatSiblingReorderNotice` |
| hooks | `hooks/useSiblingReorderAction.ts` | ボタンの状態、移動の要求、通知 |
| components | `components/layout/NodeSiblingOrderControl.tsx` | ヘッダーの「上へ」「下へ」 |
| components | `components/map/interactiveTarget.ts` | `useNodeKeyboardShortcuts` の中の `isInteractiveTarget` を移す（挙動は変えない）。判定範囲の違い: `interactiveTarget` は `button, input, textarea, select, a[href], [contenteditable]`（値によらず）の内側、既存の `editableTarget` は文字入力先（`input, textarea, select` と、値を解釈して有効な `contenteditable`）だけ、`textEntryTarget` は `input, textarea` だけ |
| components | `components/map/siblingReorderShortcut.ts` | ショートカットの判定 `resolveSiblingReorderShortcut` |
| components | `components/map/useSiblingReorderShortcut.ts` | `window` の `keydown` の登録 |
| components | `components/map/useSiblingReorderDragEscape.ts` | ドラッグ中の Escape |
| components | `components/map/siblingReorderDropSlot.ts` | ドロップ位置・挿入先・線の位置の判定 `resolveSiblingReorderDrop` |
| components | `components/map/pixi/siblingReorderGesture.ts` | 並べ替えのジェスチャー |
| components | `components/map/pixi/renderSiblingReorderIndicator.ts` | 挿入位置の線の描画 |

変える既存のファイル: `hooks/useNodes.ts`、`components/map/MapEditor.tsx`、`components/map/MapStage.tsx`、`components/map/useNodeKeyboardShortcuts.ts`（`isInteractiveTarget` の移動だけ）、`components/map/useMapStageInteractions.ts`、`components/map/useStageInteractionValues.ts`、`components/map/pixi/stageInteractions.ts`、`components/map/useRenderedMapScene.ts`、`components/map/pixi/renderMapScene.ts`、`components/map/pixi/renderMapNodes.ts`、`components/layout/LayoutModeOperationHint.tsx`。

## 子孫の配列位置を動かさなくてよい根拠

並べ替えでは、移動するノード（以下 T）の根ノード1つだけを配列の中で動かし、T の子孫は元の位置に残す。これで足りることを、順序を読むすべての箇所で確かめた。

- **自動配置**: `buildNodeForestRelations`（`nodeLayoutForestRelations.ts`）は配列を先頭から1回走査し、`parentId === null` のノードを `roots` へ、それ以外を親ごとの `childrenByParent` へ、出会った順に積む。したがって兄弟の順は「同じ `parentId` を持つノード同士の配列内の相対順」だけで決まり、子孫がどこにあるかには依存しない。`traverseNodeForest` は `roots` からスタックで辿り、親が子より前にあることを前提にしない。`layoutNodeForest` は配列の順を変えず座標だけを差し替える。
- **保存と読み込み**: V3 のエンコード・デコードは配列の順を保つ。`validateMapDocumentGraph` は先に全 ID の表を作ってから親の存在と循環を調べるので、子が親より前にあってもよい。JSON の書き出し・読み込みも同じ。
- **履歴**: `areMapStatesEqual` は添字ごとに比べるので、並びだけが変わった状態も別の状態として commit される。
- **複製・コピー・貼り付け**: `nodeSubtreeInsertion` は元の ID から添字への表を先に作るので、配列の中で子が親より前にあってもよい。T の子孫同士の相対順は変わらないので、複製した枝の中の兄弟の順も保たれる。
- **元々の配列も先行順ではない**: 子の追加・兄弟の追加・取り込みはどれも配列の末尾へ足すので、今でも配列は先行順になっていない。「親子ブロックが連続している」前提の処理は無い。L-457（フラットな配列で親子をブロックとして動かすと、移動先の子孫を取り込んでしまう）は、親子を隣接位置で表す方式の問題で、`parentId` で親子を明示するこのデータでは起きない。ブロックとして動かさないので、移動先の子孫を割り込ませることも無い。
- **配列の順が効く他の箇所**:
  - 描画順（`renderMapNodes` は配列の順に `addChild`）: 重なったときの前後だけに効く。並べ替えた根ノードの描画順が変わるだけで、見た目の違いは重なったノードの前後だけ。
  - 検索の候補の順（`createNodeSearchIndex` は配列の順）: 並べ替えた兄弟の順に候補の順も変わる。T の子孫の候補の位置は変わらないので、T を下へ動かすと、T の子孫が T より先に候補に出ることがある。今でも配列は先行順ではないので、検索の候補は木の順ではない（features.md 9.1 の「現在のノード配列順」のとおり）。

## 並べ替えの規則

### 用語

- **兄弟の列**: T と同じ `parentId` を持つノード（T を含む）を、`nodes` 配列の順に並べたもの。ルートなら `parentId === null` のノード全体。
- **見える**: 表示集合 V（`useMapDisplayState` の `visibleNodeIds`。折りたたみ集合 C と解像度の可視集合 R の積）に含まれること。
- **隠れた兄弟が生まれる理由**: T が見えているなら T の親も見えていて、閉じていない（閉じていれば T は隠れる）。ルートは折りたたみで隠れない。したがって、見えている T の兄弟が隠れる理由は、表示レベル（R）だけになる。純関数は V だけを受け取り、この性質には依存しないが、通知の案内（「表示を『すべて』に切り替える」）はこの性質に基づく。

### 型（`domain/nodes/nodeSiblingOrder.ts`）

```ts
export type SiblingReorderDirection = "up" | "down";

// anchorId は、T と同じ親を持つ「見えている」兄弟。
// "before": T を anchor の直前へ移す（anchor は T より前にあること）。
// "after":  T を anchor の直後へ移す（anchor は T より後ろにあること）。
export type SiblingReorderTarget = { position: "before" | "after"; anchorId: number };

export type SiblingReorderRequest =
  | { kind: "step"; direction: SiblingReorderDirection } // ショートカット・ボタン
  | { kind: "drop"; target: SiblingReorderTarget };     // ドラッグ

export type SiblingReorderTargetResult =
  | { ok: true; target: SiblingReorderTarget }
  | { ok: false; reason: "node-missing" | "node-hidden" }
  | { ok: false; reason: "at-edge"; hiddenBeyond: boolean; isRoot: boolean };

export type SiblingReorderAvailability = { up: boolean; down: boolean };

export type SiblingReorderFailureReason =
  | "node-missing"      // T が無い
  | "node-hidden"       // T が見えていない
  | "invalid-target"    // anchor が無い・見えていない・兄弟でない・T 自身・向きが合わない・枝が重複している
  | "placement-failed"; // 手動配置の座標が有限でない・桁落ちする、自動配置の失敗

export type SiblingReorderResult =
  | {
    ok: true;
    nodes: Node[];
    direction: SiblingReorderDirection; // "before" なら "up"、"after" なら "down"
    visibleIndex: number;  // 移動後の、見えている兄弟の中での位置（0始まり）
    visibleCount: number;  // 見えている兄弟の数（T を含む）
    isRoot: boolean;
  }
  | { ok: false; reason: SiblingReorderFailureReason };
```

### `findSiblingReorderTarget(nodes, nodeId, direction, visibleNodeIds)`

ショートカットとボタンの「1つ上・1つ下」を、挿入先に変換する。`nodes` を1回だけ走査する。

1. T が無ければ `node-missing`、T が `visibleNodeIds` に無ければ `node-hidden`。
2. 兄弟の列の中で、
   - `"up"`: T より前にある見えている兄弟のうち、T に最も近いもの P を探す。あれば `{ position: "before", anchorId: P.id }`。
   - `"down"`: T より後ろにある見えている兄弟のうち、T に最も近いもの N を探す。あれば `{ position: "after", anchorId: N.id }`。
3. 見つからなければ `at-edge`。`hiddenBeyond` は、その向きに隠れた兄弟が1つ以上あれば `true`。`isRoot` は `T.parentId === null`。

### `getSiblingReorderAvailability(nodes, nodeId, visibleNodeIds)`

ボタンの有効・無効を決める。`nodeId` が `null`、T が無い、T が見えていない場合は `{ up: false, down: false }`。それ以外は、`findSiblingReorderTarget` の2つの向きが `ok` かどうか。`nodes` の走査は1回にまとめる（向きごとに走査し直さない）。座標の失敗はここでは予測しない（押した後に `placement-failed` の通知を出す）。

### `reorderSiblingNodes(nodes, nodeId, target, visibleNodeIds, mode)`

1. **検査**（この順で、最初に当たったものを返す）
   - T が無い → `node-missing`。T が見えていない → `node-hidden`。
   - anchor が無い、`anchor.id === T.id`、`anchor.parentId !== T.parentId`、anchor が見えていない → `invalid-target`。
   - `"before"` なのに anchor が兄弟の列で T より後ろ、`"after"` なのに anchor が T より前 → `invalid-target`。
2. **配列の並べ替え**: `nodes` を先頭から1回走査して新しい配列を作る。T は飛ばす。anchor に出会ったら、`"before"` なら T、anchor の順に、`"after"` なら anchor、T の順に積む。それ以外のノードは同じオブジェクトのまま積む。`current` は変えない。
3. **座標**
   - `mode === "manual"`: 「手動配置の縦位置の入れ替え」の節の `swapSiblingBranchPositions` を、並べ替えた配列に適用する。失敗なら、その節の対応どおり `invalid-target` か `placement-failed`。
   - `mode === "auto"`: 「自動配置で先頭のルートが変わるとき」の節の引き継ぎだけを行う。それ以外の座標は、この後に `applyTreeChange` が `layoutNodeForest` で決める。
4. **位置**: 並べ替えた配列で、T の兄弟の列のうち見えているものを数え、T の位置を `visibleIndex`、総数を `visibleCount` にする。

### 例（配列の動き）

兄弟の列だけを書く。`(隠)` は見えていない兄弟。子孫は書いていないが、配列の中のどこにあっても動かない。

| 例 | 操作前 | 操作 | 挿入先 | 操作後 |
| :--- | :--- | :--- | :--- | :--- |
| A1 | A, B, T, C | 上へ | before B | A, T, B, C |
| A2 | A, B, T, C | 下へ | after C | A, B, C, T |
| A3 | A, P, H1(隠), H2(隠), T, C | 上へ | before P | A, T, P, H1, H2, C |
| A4 | A, T, H1(隠), N, C | 下へ | after N | A, H1, N, T, C |
| A5 | H(隠), T, B | 上へ | （無し） | `at-edge`、`hiddenBeyond: true` |
| A6 | T, B | 上へ | （無し） | `at-edge`、`hiddenBeyond: false` |
| A7 | T | 上へ・下へ | （無し） | どちらも `at-edge`（一人っ子） |
| A8 | A, B, H(隠), C, T | ドラッグで B と C の間 | before C | A, B, H, T, C（上へドラッグしたので、挿入位置の直後の見えている兄弟 C の前） |
| A9 | T, A, H(隠), B, C | ドラッグで B と C の間 | after B | A, H, B, T, C |

例 A3 と A4 のとおり、飛び越えた隠れた兄弟は、T の反対側へ回る。隠れた兄弟同士の順と、見えている兄弟同士の順は変えない。A3 の後に「下へ」を押すと、T は P の直後へ戻り「A, P, T, H1, H2, C」になる。元の「A, P, H1, H2, T, C」とは違うが、見えている兄弟の並び（A, P, T, C）は元に戻る。元の配列に正確に戻すには「元に戻す」を使う。

配列全体の例（子孫を含む）: `[R(root), A(R), T(R), Tc(T), B(R)]`（括弧は親）で T を下へ（after B）動かすと `[R, A, Tc, B, T]`。Tc は T より前に来るが、`parentId` で親子を表すので、木の形は変わらない。

## 手動配置の縦位置の入れ替え

`swapSiblingBranchPositions(nodes, first, second): SiblingSwapResult`（`domain/nodes/nodeSiblingSwapPlacement.ts`）。

```ts
type SiblingSwapResult =
  | { ok: true; nodes: Node[] }
  | { ok: false; reason: "overlapping-branches" | "placement-failed" };
```

`reorderSiblingNodes` は `overlapping-branches` を `invalid-target` に、`placement-failed` をそのまま `placement-failed` に写す。以下で「`null` なら失敗」と書いたものは、すべて `placement-failed` を返す。`first` と `second` は、並べ替えた後の兄弟の列で上に来る組と下に来る組の、根ノードの ID の配列。

- `"before"`（上へ）: `first = [T.id]`、`second` = 兄弟の列で anchor から T の直前までの全兄弟の ID（anchor と、その間の隠れた兄弟。ドラッグで複数を越えたときは、その間の見えている兄弟も含む）。
- `"after"`（下へ）: `first` = 兄弟の列で T の直後から anchor までの全兄弟の ID、`second = [T.id]`。
- `second` / `first` のうち T でない側を「飛び越えた組」と呼ぶ。

### 外接範囲

- 組の枝の集合 = 組の各根について `collectSubtreeIds` で集めた ID の和集合。折りたたみや表示レベルで隠れている子孫も含める（一緒に動かすので、展開したときに重ならないようにする）。
- 2つの組の枝の集合が1つでも同じ ID を含めば `overlapping-branches`（循環などの不正なデータ）。
- 組の上端 `top` = 枝の集合のノードの `y` の最小値。下端 `bottom` = `checkedAdd(y, height)` の最大値。`checkedAdd` が `null` なら `null` を返す。最小値・最大値はループで求める（スプレッドを使わない）。
- 高さ `height` = `checkedSubtract(bottom, top)`。`null` なら `null`。

### 式

1. 画面上の上下を決める。`first.top < second.top` なら上側 X = first、下側 Y = second。`second.top < first.top` なら X = second、Y = first。等しければ X = first、Y = second。
2. 元の間隔 `gap0 = checkedSubtract(Y.top, X.bottom)`（`null` なら `null`）。`gap = gap0 >= 0 ? gap0 : SIBLING_VERTICAL_GAP`。
   - X が first で `gap0 >= 0` なら（画面の上下がすでに新しい並びと一致している）、3 以降の計算をせず、座標を変えずに成功を返す（`nodes` は新しい配列、各ノードは同じオブジェクト）。計算すると丸め誤差で `dySecond` が 0 にならず（例: `1.42e-14`）、`checkedAdd` が桁落ちと判定して `placement-failed` になるため。
3. 新しい上端:
   - `newFirstTop = X.top`（上側の上端を固定する）
   - `newSecondTop = checkedAdd(checkedAdd(X.top, first.height), gap)`（どちらかが `null` なら `null`）
4. 平行移動の量: `dyFirst = checkedSubtract(newFirstTop, first.top)`、`dySecond = checkedSubtract(newSecondTop, second.top)`（`null` なら `null`）。
5. first の枝の全ノードの `y` を `checkedAdd(y, dyFirst)`、second の枝の全ノードの `y` を `checkedAdd(y, dySecond)` にする。`null` が1つでもあれば `placement-failed` を返す（途中まで動いた配列を返さない）。`dy` が 0 の組のノードは同じオブジェクトのまま返す。`x` は変えない。ほかのノードは変えない。

性質:

- 画面の上下が、すでに新しい並びと一致していて重なっていない（`first` が上で `gap0 >= 0`）なら、数式の上では `dyFirst = 0`、`dySecond = (X.top + X.height + gap0) - Y.top = 0` で、座標は変わらない（配列の順だけが変わる）。浮動小数点では `dySecond` が 0 にならないことがあるので、手順 2 で計算をせずに返す。
- 入れ替えた後、first と second の間隔は `gap`。2つの組を合わせた範囲の上端は `X.top` のまま。
- `checkedAdd` は、0 でない値を足しても結果が変わらない桁落ちも `null` にするので、巨大な座標で「動いたつもりで動かない」ことは起きない。

### 例（高さ 60、幅 100 のノード。範囲は [上端, 下端]）

- **例1（隠れた兄弟なし・上へ）**: P の枝 [0, 60]。T は y=100 で、子が y=80 と y=140 にあり、T の枝は [80, 200]。T を上へ。first = T（高さ 120）、second = P。X = P（上端 0）、Y = T、`gap = 80 - 60 = 20`。T の新しい上端 0（`dy = -80`）、P の新しい上端 `0 + 120 + 20 = 140`（`dy = +140`）。結果 T の枝 [0, 120]、P [140, 200]。
- **例2（隠れた兄弟を飛び越える・上へ）**: A [0, 60]、H（隠れている）[100, 160]、T [200, 260]。T を上へ（before A）。飛び越えた組 = {A, H}、範囲 [0, 160]。first = T、X = {A, H}、`gap = 200 - 160 = 40`。T → [0, 60]（`dy = -200`）、組 → 上端 `0 + 60 + 40 = 100`（`dy = +100`）で A [100, 160]、H [200, 260]。配列は T, A, H で、画面の上下も T, A, H。H を置いたままにすると、画面は T, H, A になり、表示を「すべて」に戻したときに配列（T, A, H）と食い違う。
- **例3（隠れた兄弟を飛び越える・下へ）**: T [0, 60]、H（隠れている）[100, 160]、N [200, 260]。T を下へ（after N）。first = {H, N}（範囲 [100, 260]、高さ 160）、second = T。X = T（上端 0）、`gap = 100 - 60 = 40`。組 → 上端 0（`dy = -100`）で H [0, 60]、N [100, 160]。T → `0 + 160 + 40 = 200` で [200, 260]。配列は H, N, T で、画面も同じ。
- **例4（画面の上下が、すでに新しい並びと同じ）**: 配列は A, T だが、A [200, 260]、T [0, 60]（利用者が手で動かしていた）。T を上へ。first = T、X = T、`gap = 200 - 60 = 140`。T の `dy = 0`、A の新しい上端 `0 + 60 + 140 = 200` で `dy = 0`。座標は変わらず、配列だけが T, A になる。
- **例5（重なっている）**: A [0, 100]（子孫を含む）、T [50, 110]。T を上へ。X = A、`gap0 = 50 - 100 = -50` なので `gap = 40`。T → [0, 60]（`dy = -50`）、A → 上端 `0 + 60 + 40 = 100`（`dy = +100`）で [100, 200]。
- **例（折りたたみ）**: T が閉じていて、隠れた子が [300, 360] にあるなら、T の枝の範囲は子を含めて計算し、子も同じ `dy` で動く。展開すると、入れ替えた後の位置に現れる（3.6 節の閉じた親のドラッグと同じ）。

## 自動配置で先頭のルートが変わるとき

`mode === "auto"` で、並べ替えの前と後で `nodes` の中の最初のルート（`parentId === null` の最初のノード）が違うときだけ、並べ替えた配列の新しい先頭のルートの `x` / `y` を、旧先頭のルートの `x` / `y`（並べ替え前の値）に置き換える（新しいオブジェクトを作る）。それ以外のノードの座標は変えない。T がルートでない並べ替えでは、ルートの順は変わらないので、何もしない。

- 新しい先頭のルートは T とは限らない。例 A4 と同じ形で、先頭のルート T を下へ動かし、その前に隠れたルート H があれば、新しい先頭は H になり、H が座標を引き継ぐ。
- この後 `applyTreeChange` が `layoutNodeForest` を呼び、新しい先頭のルートの `x` / `y` を基準に全体を配置し直す。旧先頭のルートの座標は、配置で決め直される。
- **例6**: 自動配置で、ルート R1（子なし）が (0, 0)、その下にルート R2（子が2つ）がある。R2 を上へ。R2 が (0, 0) を引き継ぎ、子は R2 を中心に上下へ並ぶ（子の範囲 60 + 40 + 60 = 160、R2 のノードは上端から 50 下）。R2 の木の上端は -50 になり、R1 の木はその下に 80 空けて並ぶ。先頭のルートのノードの位置は動かないが、マップ全体の上端は 50 上へ動く。

## useNodes の操作

`ReorderSiblingResult` は `domain/nodes/nodeSiblingOrder.ts` に置き、`hooks/useNodes.ts` と `domain/nodes/nodeSiblingOrderMessages.ts` の両方がそこから import する（`hooks/useNodes.ts` に置くと、domain の `formatSiblingReorderNotice` が hooks を import することになり、層の向きが逆になるため）。

```ts
// domain/nodes/nodeSiblingOrder.ts
export type ReorderSiblingResult =
  | { ok: true; direction: SiblingReorderDirection; visibleIndex: number; visibleCount: number; isRoot: boolean }
  | { ok: false; reason: "at-edge"; direction: SiblingReorderDirection; hiddenBeyond: boolean; isRoot: boolean }
  | { ok: false; reason: SiblingReorderFailureReason };

// hooks/useNodes.ts の UseNodesReturn
reorderSibling: (
  nodeId: number,
  request: SiblingReorderRequest,
  visibleNodeIds: ReadonlySet<number>,
) => ReorderSiblingResult;
```

- `applyTreeChange` を1回だけ呼ぶ。コールバックは最新の `currentNodes` と `mode` を受け取る。
  - コールバックの中では `reorderSiblingByRequest(currentNodes, nodeId, request, visibleNodeIds, mode)` を呼ぶ（下の2つの手順をまとめた domain の純関数）。
  - `request.kind === "step"` なら、`findSiblingReorderTarget(currentNodes, nodeId, direction, visibleNodeIds)` で挿入先を解決する。失敗なら結果を控えて `null` を返す（`at-edge` は `direction` を足して控える）。
  - `reorderSiblingNodes(currentNodes, nodeId, target, visibleNodeIds, mode)` を呼ぶ。失敗なら理由を控えて `null`、成功なら位置の情報を控えて `nodes` を返す。
- `applyTreeChange` が `false` を返し、控えた失敗が無い場合（自動配置の `layoutNodeForest` の失敗）は `placement-failed` を返す。控えた成功があっても `applyTreeChange` が `false` なら `placement-failed` にする。
- 成功しても `selectedNodeId` と `documentRevision` は変えない。失敗したときは、ノード・選択・履歴・Redo を変えない。
- `visibleNodeIds` は呼び出し元の描画時の値。ノードの ID の集合なので、同じイベント内で `nodes` が変わっていても、最新の配列に対して判定する。

## useSiblingReorderAction の入出力

```ts
// hooks/useSiblingReorderAction.ts
type UseSiblingReorderActionOptions = {
  selectedNodeId: number | null;
  nodes: readonly Node[];                 // 正本（useNodes の nodes）。ボタンの有効・無効の判定に使う
  visibleNodeIds: ReadonlySet<number>;    // displayState.visibleNodeIds（V = C ∩ R）
  documentRevision: number;
  reorderSibling: (
    nodeId: number,
    request: SiblingReorderRequest,
    visibleNodeIds: ReadonlySet<number>,
  ) => ReorderSiblingResult;
};

type UseSiblingReorderActionReturn = {
  canMoveUp: boolean;      // selectedNodeId !== null && getSiblingReorderAvailability(...).up
  canMoveDown: boolean;    // 同じく .down
  // ヘッダーのボタン用。未選択なら何もしない（reorderSibling も通知も呼ばない）
  moveSelected: (direction: SiblingReorderDirection) => void;
  // MapStage 用（ショートカットとドラッグ）。MapStage の onReorderSibling にそのまま渡す
  reorder: (nodeId: number, request: SiblingReorderRequest) => void;
  notice: OperationNotice | null; // 操作通知バーの8系統目
};
```

- `canMoveUp` / `canMoveDown` は `useMemo` で `nodes`・`selectedNodeId`・`visibleNodeIds` が変わったときだけ求める（`getSiblingReorderAvailability` を1回）。
- `moveSelected(direction)` は `reorder(selectedNodeId, { kind: "step", direction })` と同じ。
- `reorder` は `reorderSibling(nodeId, request, visibleNodeIds)` を呼び（`visibleNodeIds` は受け取った値をそのまま渡す）、結果を `formatSiblingReorderNotice` で文言にして `useRevisionScopedNotice(documentRevision)` の `publishNotice` へ渡す。結果によらず必ず1回通知する。
- `MapEditor` は `canMoveUp`・`canMoveDown`・`moveSelected("up")`・`moveSelected("down")` を `NodeSiblingOrderControl` へ、`reorder` を `MapStage` の `onReorderSibling` へ、`notice` を操作通知バーへ渡す。

## 履歴

- 1回の並べ替え（配列の順、手動配置の2つの組の平行移動、自動配置の再配置）が Undo / Redo の1操作。8.1 の表に「兄弟の順序変更」を足す。
- ドラッグは、落としたときの1回の commit だけ。ドラッグ中は履歴のグループを開かない（`onBeginNodeMove` を呼ばない）。今の自動配置の移動ジェスチャーは、`onBeginNodeMove` でグループを開き、`applyManualMove` が `false` を返して何も変えずに閉じる（空振り）。自動配置ではこのジェスチャーを作らなくなるので、空振りのグループも無くなる。
- 元の位置へ落とした・中止した場合は、`applyTreeChange` を呼ばず、履歴も Redo も変えない。
- 成功した「元に戻す」「やり直す」は、既存の規則どおり選択を外し、`documentRevision` を上げる。並べ替えの通知はそれで消える。

## UI

### ヘッダーのボタン（`NodeSiblingOrderControl`）

```ts
type NodeSiblingOrderControlProps = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
};
```

- 置き場所: `operationControls` の中、`NodeDuplicateControl`（「枝を複製」）の右隣、`CLIPBOARD_OPERATION_HINT` の前。
- 2つのボタンを `<div role="group" aria-label="兄弟の順序" className="flex shrink-0 gap-2">` で囲む。
- 見た目は `NodeDuplicateControl` と同じ `buttonClassName`。

| | 上へ | 下へ |
| :--- | :--- | :--- |
| 表示する文字 | `上へ` | `下へ` |
| `aria-label` | `枝を上へ移動` | `枝を下へ移動` |
| `aria-keyshortcuts` | `Alt+ArrowUp` | `Alt+ArrowDown` |
| `title` | `枝を上へ移動（Alt/Option+↑）` | `枝を下へ移動（Alt/Option+↓）` |
| `disabled` | `!canMoveUp` | `!canMoveDown` |

- `aria-label` は表示する文字（「上へ」「下へ」）を含む（見える名前と読み上げる名前を一致させる）。
- `disabled` 属性で実際に押せなくする（L-058）。`canMoveUp` = `selectedNodeId !== null && availability.up`、`canMoveDown` も同様。未選択、選択中のノードが見えている兄弟の端、一人っ子のときに無効になる。
- **Enter の押し続け**: 両方のボタンの `onKeyDown` で、`event.key === "Enter" && event.repeat` なら `preventDefault` する（連続して移動しない。L-408）。Space は keyup で押されるので止めない。
- **フォーカス**: `MapHistoryControls` と同じ仕組みにする。押したボタンが無効になった（端に着いた）とき、フォーカスがそのボタンか `body` にあれば、もう一方のボタンが有効ならそちらへ移す。両方の Enter の押し続けを止めているので、移った先で逆の操作が続けて起きることは無い。
- **クリック**: `event.detail` では弾かない。ダブルクリックは2回の移動として扱う（「枝を複製」と同じ）。端に着いて無効になったボタンへの2回目のクリックは何もしない。
- `pointerdown` の既定の動作は止めない（編集中のラベルを `blur` で確定してから並べ替えるため）。
- ボタンを押した後、アプリはフォーカスを移さない。

### 操作ヒント

`LayoutModeOperationHint.tsx` の文言を次にする（下線部が追加）。

- 手動配置: `空白ダブルクリックで追加・ノードダブルクリックで編集・ノードドラッグで移動・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更`
- 自動配置: `空白ダブルクリックで追加・ノードダブルクリックで編集・追加・削除・接続時に自動整列・ノードドラッグで兄弟の順序を変更・空白ドラッグで移動・ホイール/ピンチで拡大縮小・Fで中央表示・Shift+ノードドラッグで接続・Alt(Option)+↑/↓で兄弟の順序を変更`

追加した部分: 両モードの末尾の「・Alt(Option)+↑/↓で兄弟の順序を変更」と、自動配置の「・ノードドラッグで兄弟の順序を変更」（「接続時に自動整列」の直後）。

### ショートカット

判定は純関数 `resolveSiblingReorderShortcut(input): SiblingReorderDirection | null`（`components/map/siblingReorderShortcut.ts`）。

```ts
type SiblingReorderShortcutInput = {
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
```

次をすべて満たすときだけ、`key` が `"ArrowUp"` なら `"up"`、`"ArrowDown"` なら `"down"` を返す。それ以外は `null`。

1. `defaultPrevented` が偽。
2. `isComposing` が偽、かつ `keyCode !== 229`（IME 変換中。L-474）。
3. `altKey` が真で、`ctrlKey`・`metaKey`・`shiftKey` がすべて偽（Windows の AltGr は Ctrl+Alt なので対象外）。
4. `isEditing` が偽（ラベル編集中ではない）。
5. `target` が対話要素でない（`isInteractiveTarget`: `button, input, textarea, select, a[href], [contenteditable]` の内側でない。`useNodeKeyboardShortcuts` と同じ判定を共通のモジュールへ移して使う。L-522）。検索入力欄・セレクト・ラジオボタンでの `Alt+↑/↓`（候補の移動、ドロップダウンを開く操作、macOS のカーソル移動）はブラウザに任せる。
6. `selectedNodeId !== null`。
7. `hasActiveGesture` が偽（ドラッグ・パン・ピンチの途中ではない。`F` キーと同じ）。
8. `repeat` は見ない（押し続けを許可する）。

`useSiblingReorderShortcut({ selectedNodeId, isEditing, hasActiveGesture, enabled, onReorderSibling })` は `window` の `keydown` に登録し、`enabled` は ref から読む（`useNodeKeyboardShortcuts` と同じ。`enabled` の切り替えで登録をやり直さない）。options の `hasActiveGesture` は `() => boolean` とし、`keydown` の時点で呼んで、その値を `resolveSiblingReorderShortcut` の `hasActiveGesture` に渡す（既存の `useMapViewportShortcut` と同じ形。最新の options を ref に控え、登録は1回だけにする）。`enabledRef.current` が偽なら何もしない。判定が `null` でなければ `preventDefault` してから `onReorderSibling(selectedNodeId, { kind: "step", direction })` を呼ぶ。端で動かせないときも `preventDefault` する（ページのスクロールなどを起こさない）。判定が `null` のときは `preventDefault` しない。

`MapStage` へ渡す `enabled` は既存の `shortcutsEnabled`（`MapEditor` の `editorShortcutsEnabled`）。

### ドラッグ（自動配置だけ）

#### 開始の条件と分岐

`stageInteractions.handleNodePointerDown` の分岐を次にする（それ以前の検査は変えない）。

```ts
const gesture = event.shiftKey
  ? createNodeConnectionGesture(...)          // 今のまま
  : layoutModeRef.current === "auto"
    ? createSiblingReorderGesture(...)         // 新しい
    : createNodeMoveGesture(...);              // 今のまま（手動配置）
```

- `layoutModeRef` は `useStageInteractionValues` が持つ ref。`MapStage` の新しい必須の props `layoutMode` から `useMapStageInteractions` 経由で渡す。
- `pointerdown` でノードを選択するのは今のまま（クリックだけなら選択だけ）。
- 主ボタン以外、見えていないノード、ほかのジェスチャーの途中は、今のまま始めない。

#### `createSiblingReorderGesture`

```ts
type SiblingReorderGestureOptions = {
  nodeId: number;
  startSample: PointerSample;
  nodesRef: LatestValue<readonly Node[]>;              // 表示用の座標（displayNodes）
  visibleNodeIdsRef: LatestValue<ReadonlySet<number>>;
  layoutModeRef: LatestValue<NodeLayoutMode>;
  onReorderSiblingRef: LatestValue<(nodeId: number, request: SiblingReorderRequest) => void>;
  onSiblingReorderPreviewChangeRef: LatestValue<(preview: SiblingReorderPreview | null) => void>;
  dragThreshold: number;
};

type SiblingReorderPreview = {
  nodeId: number;
  indicator: { left: number; right: number; y: number } | null; // 元の位置では null
};
```

- 始めた時点で T が `nodesRef` に無い、または座標が有限でなければ `null`（ジェスチャーを作らない）。
- `move(sample)`: 有限でない座標は無視する。`layoutModeRef.current !== "auto"` なら自分を中止する（下の `cancel` と同じ）。`createDragActivation(startSample.screen, dragThreshold)` で 4px に達するまでは何もしない。達した後は、`resolveSiblingReorderDrop` で挿入位置を求め、挿入先（position・anchorId）か線の座標（left・right・y）が前回と違うとき（または最初に達したとき）だけ `onSiblingReorderPreviewChangeRef.current({ nodeId, indicator })` を呼ぶ。
- `end(sample)`: しきい値に達していなければ何もしない（クリック）。`layoutModeRef.current !== "auto"` なら中止と同じ。それ以外は、`end` の `sample` と最新の `nodesRef`・`visibleNodeIdsRef` で挿入位置を求め直し（`move` で控えた値を使わない。L-035）、プレビューを `null` に戻してから、`target` が `null` でなければ `onReorderSiblingRef.current(nodeId, { kind: "drop", target })` を呼ぶ。`end` の座標が有限でなければ中止と同じ。
- `cancel()`: プレビューを `null` に戻し、以後の `move` / `end` を無視する。並べ替えない。
- `activeNodeIds()`: `[nodeId]`。T が隠れたら、`useMapStageInteractions` の既存の effect がジェスチャーを中止する。
- `end` と `cancel` は何度呼ばれても、プレビューを戻す・並べ替えるのは1回だけ。

#### 挿入位置の決め方（`resolveSiblingReorderDrop`）

```ts
resolveSiblingReorderDrop(
  displayNodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number>,
  nodeId: number,
  pointerY: number,
): { target: SiblingReorderTarget | null; slot: number; indicator: { left: number; right: number; y: number } | null } | null
```

- T が無い、見えていない、`pointerY` が有限でない場合は `null`。
- `displayNodes` は `MapStage` が受け取る表示用の座標（自動配置で折りたたみ中は `projectCollapsedLayout` の座標）。ポインタの `world` 座標と同じ座標系なので、画面に見えている位置で判定できる。
- O = T と同じ親を持つ見えている兄弟から T を除いたもの（配列の順）。`m` = O の件数。
- 各 O_i の中心 `centerY(O_i) = O_i.y + O_i.height / 2`。
- `slot` = `centerY(O_i) <= pointerY` を満たす O_i の数（0〜m）。自動配置では兄弟は上から配列の順に並ぶので、ポインタより上にある兄弟の数になる。
- `original` = 配列で T より前にある O の数。
- `slot === original` なら `target: null`、`indicator: null`（元の位置。線を描かず、落としても何もしない）。
- `slot < original` なら `target = { position: "before", anchorId: O[slot].id }`。
- `slot > original` なら `target = { position: "after", anchorId: O[slot - 1].id }`。
- 線の位置（`slot !== original` のとき）:
  - `left` = T と O の `x` の最小値 − 8、`right` = T と O の `x + width` の最大値 + 8。
  - `slot === 0`: `y = O[0].y − SIBLING_VERTICAL_GAP / 2`（20px 上）。
  - `slot === m`: `y = O[m−1].y + O[m−1].height + SIBLING_VERTICAL_GAP / 2`。
  - それ以外: `y = (O[slot−1].y + O[slot−1].height + O[slot].y) / 2`（上の兄弟の下端と下の兄弟の上端の中点）。
- ポインタの横位置は見ない。兄弟の列より上・下へ離れても、先頭・末尾として扱う。
- 例: 自動配置で、同じ親の兄弟 A, T, B, C（x = 220、幅 100、高さ 60）が y = 0, 100, 200, 300 にある。O = [A, B, C]、中心は 30, 230, 330、`original = 1`。
  - `pointerY = 10` → `slot = 0` → before A、線は y = −20。
  - `pointerY = 150` → `slot = 1` → 元の位置（線なし）。
  - `pointerY = 250` → `slot = 2` → after B、線は y = (260 + 300) / 2 = 280。
  - `pointerY = 400` → `slot = 3` → after C、線は y = 380。
  - 線の左右は 212〜328。
- 表示レベルで隠れた兄弟は、自動配置では見えないまま場所を取る（解像度フィルターは表示用の配置から外さない）。隠れた兄弟が O に入らないので、見えている兄弟の間（隠れた兄弟の場所を含む）が1つの挿入位置になる。

#### 見た目

- **挿入位置の線**: `renderSiblingReorderIndicator` が `Graphics` の `rect(left, y − 3, right − left, 6).fill({ color: 0x2563eb })` で描く（太さ 6、ワールド座標。倍率 1 で 6px、0.5 で 3px）。ノードと接続線の後に `worldContainer` へ足し、いちばん上に重ねる。`eventMode` は `"none"`（ポインタを受けない）。
- 色は選択の枠と同じ青 `#2563eb`。キャンバスの背景（ライト `#fafafa`、ダーク `#18181b`）に対するコントラストは、ライトで約 4.9:1、ダークで約 3.4:1 で、どちらも図形に求める 3:1 を満たす。Pixi の色はダークモードでも変えない（ノードの白背景と同じ扱い）。
- **ドラッグ中のノード**: `renderMapNodes` の新しいオプション `siblingReorderSourceNodeId` に一致するノードは、枠と背景の `Graphics`・イラストの `Sprite`・ラベルの `Text` の `alpha` を 0.5 にする（`Container` の `alpha` は表示のフェードが使うので触らない）。選択の青い枠はそのまま（半透明）。子孫と接続線は変えない。ノードはポインタに追従させず、元の位置に置いたままにする。
- 描画は `connectionTargetNodeId` と同じく、`useMapStageInteractions` の状態 `siblingReorderPreview` が変わったときに場面を描き直す。プレビューを変えるのは挿入先か線の座標が変わったときだけなので、描き直しはポインタの移動ごとには起きない。

#### 中止の条件

| 条件 | 扱い |
| :--- | :--- |
| Escape | `useSiblingReorderDragEscape` が `window` の `keydown` で受け、並べ替えのジェスチャーの途中なら中止して `preventDefault` する。`isComposing` か `keyCode === 229` のときは何もしない。ほかのジェスチャーの途中や、ジェスチャーが無いときは何もしない（`preventDefault` もしない） |
| `pointercancel` | 既存の処理で中止 |
| ステージの外でポインタを離す（`pointerupoutside`） | 既存の処理で中止 |
| 2本目の指（ピンチ） | 既存の `onBeforePinch` で中止 |
| ホイールでの拡大縮小 | 既存の `onBeforeZoom` で中止 |
| `documentRevision` の変化（Undo / Redo、マップの置き換え） | 既存の `useDocumentRestoreInteractionReset` で中止 |
| T が見えなくなる・削除される | 既存の `useMapStageInteractions` の effect と `useHiddenNodeInteractionReset` で中止 |
| 配置モードが手動になる | 次の `move` / `end` で中止（並べ替えない） |
| 元の位置で離す・しきい値に達せずに離す | 何もしない（クリックなら選択だけ） |

中止すると、線と半透明の表示を消し、並べ替えない。

`createStageInteractions` は、今のジェスチャーが並べ替えのジェスチャーかを返す `isSiblingReorderActive(): boolean` を足し、`useMapStageInteractions` から `MapStage` へ渡す。`useSiblingReorderDragEscape({ isSiblingReorderActive, cancelActiveGesture })` はこれを使う。Escape は `shortcutsEnabled` によらず働く（中止しか行わず、害が無いため）。

#### 落としたときの処理

`onReorderSibling(nodeId, { kind: "drop", target })` → `useSiblingReorderAction.reorder` → `useNodes.reorderSibling`。1回の commit で、成功・失敗の通知はショートカットと同じ。選択は T のまま。

#### タッチ操作

- 自動配置で、ノードを1本指でドラッグすると、マウスと同じく並べ替える（しきい値は同じ 4px）。今は何も起きない操作。
- 途中で2本目の指を置くと、並べ替えは中止され、ピンチの拡大縮小になる（既存の調停のまま）。
- 長押しなどの特別な操作は足さない。

## 通知

`useSiblingReorderAction` が `useRevisionScopedNotice(documentRevision)` をほかの通知とは別の枠として呼び、操作通知バーの8系統目に出す。

文言は `formatSiblingReorderNotice(result: ReorderSiblingResult): OperationNotice`。「兄弟」はルートなら「ルート」にする（`isRoot`）。M は `visibleIndex + 1`、N は `visibleCount`。

| 結果 | `kind` | 文言 |
| :--- | :--- | :--- |
| 成功（上へ） | `status` | `枝を上へ移動しました（見えている兄弟のN件中M番目）。` |
| 成功（下へ） | `status` | `枝を下へ移動しました（見えている兄弟のN件中M番目）。` |
| `at-edge`（上へ） | `status` | `これ以上上へ移動できません（見えている兄弟の先頭です）。` |
| `at-edge`（下へ） | `status` | `これ以上下へ移動できません（見えている兄弟の末尾です）。` |
| `at-edge` で `hiddenBeyond` | `status` | 上の文言の後に `隠れている兄弟と入れ替えるには、表示を『すべて』に切り替えてください。` を続ける |
| `node-missing`・`node-hidden`・`invalid-target`・`placement-failed` | `error` | `枝の順序を変更できませんでした。` |

例: `枝を上へ移動しました（見えているルートの3件中1番目）。`、`これ以上下へ移動できません（見えている兄弟の末尾です）。隠れている兄弟と入れ替えるには、表示を『すべて』に切り替えてください。`

- **出す場面**: ショートカット・ボタン・ドラッグで `reorderSibling` を呼んだときは、結果ごとに必ず1つ出す。ボタンは端では無効なので、ボタンから `at-edge` になるのは、描画と同じイベントの中でノードが変わった場合だけ。ドラッグで元の位置へ落とした・中止した場合は `reorderSibling` を呼ばないので、通知も出さない（前の通知も変えない）。
- **表示する期間**: 次の並べ替えの通知か、`documentRevision` の変化（成功した Undo / Redo、マップの置き換え）まで残す（枝の複製の通知と同じ）。ほかの系統の通知とは独立した枠で、互いに消さない。マップを切り替えると `MapEditor` ごと消える。
- **読み上げ**: 成功の文言には位置が入るので、続けて移動すると文言が変わり、読み上げ直される。端の通知が同じ文言で続くと読み上げられないことがある（既知の制限。枝の複製・貼り付けの通知と同じ）。

## 既存の操作との関係

並べ替えに関わる既存の操作と入口を、コードから列挙して1つずつ決めた（L-061）。

| 既存の操作 | 関係 |
| :--- | :--- |
| 枝の折りたたみ | `documentRevision` を上げないので、折りたたみは保つ。閉じた枝も並べ替えられ、手動配置では隠れた子孫も一緒に動く。自動配置で折りたたみ中のドラッグは、表示用の座標で挿入位置を決める |
| 表示レベル（解像度フィルター） | 隠れた兄弟は飛び越え、消さない・並びを変えない（L-460）。端の通知で「すべて」への切り替えを案内する |
| ノード検索 | 変えない。候補の順は配列の順なので、並べ替えに合わせて変わる（「子孫の配列位置を動かさなくてよい根拠」） |
| 枝の複製・コピー・貼り付け | 変えない。並べ替えた後の枝を複製・コピーしても、枝の中の兄弟の順は保たれる。追加した枝は今までどおり配列の末尾（兄弟・ルートの最後）に入る |
| 子・兄弟の追加（Tab / Enter） | 変えない。追加は兄弟の末尾。並べ替えのショートカットとはキーが重ならない |
| 削除・接続 | 変えない |
| 手動配置のドラッグ移動 | 変えない（手動配置ではドラッグは位置の移動） |
| 自動配置のドラッグ | 移動ジェスチャー（空振り）を、並べ替えのジェスチャーに置き換える |
| `F` キー | 変えない。並べ替えの後も選択中のノードへ移動できる |
| 元に戻す / やり直す | 並べ替え1回が1操作。並べ替えの通知は `documentRevision` の変化で消える。ドラッグ中の Ctrl/Cmd+Z は、既存の規則でジェスチャーを中止してから戻す |
| マップの切り替え | `MapEditor` ごと作り直すので、通知もジェスチャーも残らない |
| 箇条書きのダイアログ・マップのダイアログ | 開いている間は、根の `inert` でボタンとキャンバスが押せず、ショートカットは `editorShortcutsEnabled` で止まる（`MapStage` の `shortcutsEnabled` を通す）。新しいショートカットにも同じ値を渡す |
| ラベル編集中 | ショートカットは働かない。ボタンを押すと、編集を確定してから並べ替える |
| コンテキストメニュー | 変えない（項目を足さない） |
| JSON の書き出し・読み込み | 形式は変えない。並びは配列の順として書き出され、読み込むと同じ順になる |
| PNG / SVG の書き出し | 変えない。正本の `nodes` の座標をそのまま使うので、並べ替えた後の配置が出る |
| 自動保存 | 変えない。並べ替えで `nodes` が変わると、通常の 300ms の自動保存に流れる |
| 配置モードの切り替え | 変えない。並べ替えた順は、手動から自動へ切り替えたときの配置にも効く |

## エラーと境界条件

| 条件 | 扱い |
| :--- | :--- |
| 未選択 | ボタンは無効。ショートカットは何もしない（通知も出さない） |
| 一人っ子・見えている兄弟の端 | ボタンは無効。ショートカットは `at-edge` の通知 |
| 端より先に隠れた兄弟だけがある | `at-edge`。通知で「すべて」への切り替えを案内する |
| 手動配置で座標が有限でなくなる・桁落ちする | `placement-failed`。何も変わらない |
| 自動配置で `layoutNodeForest` が失敗する | `placement-failed`。何も変わらない |
| ドラッグを落とす前に anchor が消える・隠れる | 落とした時点で挿入位置を求め直すので、別の位置になるか元の位置（何もしない）になる。`useNodes` で検査に落ちれば `invalid-target` の通知 |
| 押し続け（Alt+↑） | 続けて移動し、端に着いたら端の通知を出し続ける |
| 不正なデータ（循環） | 手動配置の枝の集合が重なれば `invalid-target`。自動配置では `layoutNodeForest` が失敗して `placement-failed` |
| 大きなマップ | 1回の並べ替えは配列の走査数回と、自動配置なら全体の再配置1回。ボタンの有効・無効の判定は、`nodes`・選択・表示集合が変わったときに1回の走査 |

## 受け入れ基準

1. ノードを選択して「上へ」「下へ」または Alt（Option）+↑ / ↓ を押すと、見えている直前・直後の兄弟と順が入れ替わる。ルート同士も入れ替わる。
2. 手動配置では、入れ替えた2つの枝（子孫を含む）の上下が並びと一致し、上側の上端と間隔が保たれ、横位置は変わらない。間の隠れた兄弟は飛び越えた組として一緒に動く。
3. 自動配置では、並べ替えた順で全体が並び直る。先頭のルートが変わるときは、先頭のルートのノードの位置が変わらない。
4. 自動配置でノードを同じ親の兄弟の間へドラッグすると、挿入位置に青い線が出て、落とすとその位置へ移る。元の位置・Escape・外で離す・ピンチでは何も変わらない。手動配置のドラッグは今までどおり位置の移動。
5. 端ではボタンが無効になり、ショートカットは端の通知を出す。隠れた兄弟が先にあれば「すべて」への切り替えを案内する。
6. 1回の並べ替えが1回の「元に戻す」で戻り、「やり直す」で同じ順と座標に戻る。並べ替えた直後の選択は移動したノードのまま（「元に戻す」「やり直す」は既存の規則どおり選択を外す）。並べ替えでは折りたたみは保たれる。
7. 成功・失敗の通知が操作通知バーの8系統目に出る。
8. ラベル編集中・入力欄・IME 変換中・ダイアログを開いている間・ジェスチャーの途中は、ショートカットが働かない。ボタンの Enter の押し続けで連続して移動しない。
9. 保存形式・JSON・履歴の形式は変わらない。並べ替えた順は自動保存・JSON の書き出しと読み込みで保たれる。
10. `npm run verify` が成功する。`docs/specifications/features.md`、`docs/specifications/data-model.md`、`docs/architecture/overview.md`、`docs/testing/browser-test-cases.md`、README 類、`ROADMAP.md` が実装に合っている。

## テスト方針

### 純関数: `nodeSiblingOrder.test.ts`

- `findSiblingReorderTarget`: 例 A1〜A7 の各行（上へ・下へ、隠れた兄弟の飛び越え、`hiddenBeyond` の真偽、一人っ子、ルート）。`node-missing`・`node-hidden`。ルートの `isRoot`。T と同じ ID の別の親の子が混ざっていても、同じ `parentId` だけを数えること。
- `getSiblingReorderAvailability`: 未選択・不在・隠れている・先頭・末尾・中間・一人っ子。`nodes` を1回だけ走査すること（`nodes` を Proxy か反復の回数を数える配列で包む）。
- `reorderSiblingNodes`（配列）:
  - 例 A1〜A4、A8、A9 の配列（ID の並び）。子孫のノードの配列位置と、子孫・ほかのノードのオブジェクトの同一性（`toBe`）が変わらないこと。入力の配列を変えないこと。
  - 並べ替えた後、`buildNodeForestRelations` の `childrenByParent` の順が期待どおりで、親子関係が変わらないこと。
  - 隠れた兄弟が全件残り、隠れた兄弟同士の順が変わらないこと（L-460）。
  - 検査: anchor が無い・自分自身・別の親・隠れている、`before` で anchor が後ろ・`after` で anchor が前、で `invalid-target`。`splice` の境界の変異（添字の ±1）で落ちる入力にする（L-541）。
  - 結果の `direction`・`visibleIndex`・`visibleCount`・`isRoot`。
- `reorderSiblingNodes`（自動配置）: 先頭のルートが変わるとき（T が先頭になる、先頭の T が下へ動いて隠れたルートが先頭になる）に、新しい先頭のルートが旧先頭の `x` / `y` を持つこと。先頭が変わらないとき・ルートでない並べ替えでは座標を変えないこと。続けて `layoutNodeForest` に通すと、例6 の座標になること。

### 純関数: `nodeSiblingSwapPlacement.test.ts`

- 例1〜5 と折りたたみの例を、そのまま1例1テストで写す（各ノードの `y` と、`x` が変わらないこと）。
- 例4（座標が変わらない）では、ノードのオブジェクトが同じ（`toBe`）であること。
- `gap0` が 0 のとき（接している）は 0 のまま、負のときは 40 になること。`gap0 >= 0` を `> 0` に変える変異で落ちる入力にする。
- 上端が等しいとき、first を上側にすること。
- 隠れた子孫が範囲に入り、一緒に動くこと。
- 2つの組の枝が重なる不正なデータで `overlapping-branches`（`reorderSiblingNodes` では `invalid-target`）。
- `Number.MAX_VALUE` 近くの座標・`1e17` 程度で `dy` が桁落ちする座標で `placement-failed`。途中まで動いた配列を返さないこと。
- 兄弟が10,000件・枝が10,000ノードでも、スプレッドを使わず動くこと。

### 純関数: `nodeSiblingOrderMessages.test.ts`

- 通知の表の全行（上へ・下へ、兄弟・ルート、`hiddenBeyond` の有無、失敗の4つの理由）と `kind`。

### 純関数: `siblingReorderShortcut.test.ts`

- `Alt+ArrowUp` → `"up"`、`Alt+ArrowDown` → `"down"`。
- それぞれ1つだけ条件を外した入力で `null`: Alt なし、Ctrl・Meta・Shift の併用、`isComposing`、`keyCode` 229、`defaultPrevented`、`isEditing`、`selectedNodeId === null`、`hasActiveGesture`、`target` が `button`・`input`・`textarea`・`select`・`a[href]`・`[contenteditable]` の内側、`ArrowLeft` など別のキー。
- `repeat: true` でも方向を返すこと。

### 純関数: `siblingReorderDropSlot.test.ts`

- 挿入位置の例（`pointerY` が 10, 150, 250, 400）の `slot`・`target`・線の位置。中心ちょうど（`pointerY = 230`）で `slot = 2` になること（`<=` を `<` に変える変異で落ちる）。
- T が先頭・末尾・一人っ子のとき。隠れた兄弟が O に入らないこと。別の親の兄弟が入らないこと。
- 折りたたみ中の表示用の座標を渡したとき、その座標で判定すること（正本の座標を渡すと結果が変わる入力にする）。
- `pointerY` が有限でない、T が無い・隠れている → `null`。

### フック: `useNodesSiblingOrder.test.ts`（`useNodesDuplication.test.ts` に倣う）

- 手動配置・自動配置のそれぞれで、`step` と `drop` の成功。1回の「元に戻す」で順と座標が戻り、「やり直す」で同じ順と座標になること（1回の commit）。
- 成功で `selectedNodeId` と `documentRevision` が変わらないこと。
- `at-edge`・`invalid-target`・手動配置の `placement-failed`・自動配置の `layoutNodeForest` の失敗（`placement-failed`）で、ノード・選択・履歴・Redo が変わらないこと（失敗のときに Redo が消えないこと）。
- `step` の解決が `applyTreeChange` の中の最新の配列で行われること（同じ `act` の中で直前に兄弟を追加してから呼ぶと、追加後の配列で判定される）。

### フック: `useSiblingReorderAction.test.tsx`

- `canMoveUp` / `canMoveDown` が、選択・表示集合・`nodes` に合わせて変わること。
- 成功・`at-edge`・失敗で、通知の文言と `kind`。`documentRevision` が変わると通知が消えること。ほかの系統の通知を消さないこと。
- `moveSelected` が `selectedNodeId` と `{ kind: "step" }` で `reorderSibling` を呼び、`visibleNodeIds` をそのまま（`toBe`）渡すこと。未選択では呼ばないこと。

### ショートカットのフック: `useSiblingReorderShortcut.test.tsx`（`useNodeKeyboardShortcuts.test.tsx` に倣う）

- `enabled: false` のとき、選択中でも呼ばれないこと。`enabled` を切り替えても `window` への登録をやり直さないこと。
- 呼んだときだけ `fireEvent.keyDown` の戻り値が `false`（`preventDefault` 済み）、呼ばないときは `true` であること。`repeat: true` でも呼ぶこと。
- `isInteractiveTarget` を共通のモジュールへ移した後も、`useNodeKeyboardShortcuts` の既存のテストがそのまま通ること。

### ジェスチャー: `pixi/__tests__/siblingReorderGesture.test.ts` と `useMapStageInteractions.test.tsx`

- 4px 未満の移動では、プレビューも並べ替えも起きないこと。4px に達したら、挿入先か線の座標が変わったときだけプレビューの関数が呼ばれること（ドラッグ中に兄弟がずれたときは、同じ挿入位置でも呼ばれること）。
- `end` が、`end` の座標と最新の ref で挿入位置を求め直すこと（`move` の後に `nodesRef` を差し替えると、差し替えた後の配列で判定される）。
- 元の位置で離すと `onReorderSibling` を呼ばないこと。`cancel` の後の `end` で呼ばないこと。`end` と `cancel` を何度呼んでもプレビューを戻すのは1回であること。
- 配置モードが途中で手動になると、`move` / `end` で中止すること。
- `onBeginNodeMove` を一度も呼ばないこと（履歴のグループを開かない）。
- `stageInteractions`: 自動配置で Shift なし → 並べ替え、手動配置で Shift なし → 移動、Shift あり → 接続（両モード）。`pointerupoutside`・`pointercancel`・2本目の指で中止すること。`isSiblingReorderActive` が並べ替えの途中だけ真であること。
- 描画: `renderMapNodes` で `siblingReorderSourceNodeId` のノードの子要素の `alpha` が 0.5 で、`Container` の `alpha` を変えないこと。`renderSiblingReorderIndicator` が `rect` と `fill` を期待の引数で呼ぶこと、`indicator` が `null` なら何も足さないこと。
- `useSiblingReorderDragEscape`: 並べ替えの途中の Escape で中止し `preventDefault`、それ以外では何もしないこと、IME 変換中は何もしないこと。

### 部品: `NodeSiblingOrderControl.test.tsx`

- 表示する文字、`aria-label`、`aria-keyshortcuts`、`title`、`role="group"` と名前。
- `canMoveUp: false` で「上へ」に `disabled` 属性が付き、クリックで `onMoveUp` が呼ばれないこと（L-058）。
- `fireEvent.keyDown(button, { key: "Enter", repeat: true })` の戻り値が `false`、`repeat: false` では `true` であること（両方のボタン。L-408）。
- 押したボタンが無効になったとき、もう一方が有効ならそちらへフォーカスが移り、もう一方も無効なら移さないこと。

### ページの結合テスト: `app/__tests__/pageSiblingOrder.test.tsx`（`pageDuplication.test.tsx` に倣い、実際の `Home` から。L-060）

- 手動配置: 3つのルートを作り、真ん中を選択して「上へ」→ ルートの順と座標（例の式どおり）、通知の文言、選択が変わらないこと。1回の「元に戻す」で戻り、「やり直す」で同じになること。
- Alt+↑ / Alt+↓ を `body` に送って同じ結果になること。ラベル編集中・検索入力欄・`Alt+Shift+↑` で何も変わらないこと。
- 端でボタンが無効になり、Alt+↑ で端の通知が出ること。表示レベルを「高のみ」にして隠れた兄弟を作り、飛び越えることと、端の案内の文言。
- 自動配置: ノードの `pointerdown`（`mapStageTestRuntime` の `pointer` ヘルパー）→ ステージの `pointermove` → `pointerup` で並べ替わること。元の位置で離す・`pointerupoutside`・Escape で変わらないこと。自動配置のドラッグで履歴が増えず、「やり直す」が消えないこと（元の位置で離した場合）。手動配置では同じ操作でノードが移動すること（既存の動作）。
- 箇条書きのダイアログを開いている間に、`body` へ Alt+↑ を送っても変わらないこと（L-061）。
- 並べ替えの後の自動保存で、保存された本体の `nodes` の順が並べ替えた順になること。
- 配線の変異: `MapEditor` が `MapStage` に `layoutMode` / `onReorderSibling` を渡さない、ヘッダーへ `canMoveUp` を `canMoveDown` と取り違えて渡す、などの変異でどれかのテストが落ちること（上と下で有効・無効が違う状態を作って確かめる。L-060）。

## 既存の文書の更新

各文書を「7系統」「並び」「配列の順」「ドラッグ」「自動配置」「Phase 13」「Phase 14」で grep し、注記が要る箇所をすべて直す。

- `docs/specifications/features.md`
  - 目次と新しい「14. 兄弟ノードの順序変更」の章: 操作（ボタン・ショートカット・ドラッグ）、並べ替えの規則と隠れた兄弟、手動配置の縦位置の入れ替え（式と例）、自動配置と先頭のルート、履歴・選択・通知、キーボードとフォーカス、既存の操作との関係、対象外。
  - 1.1 に Phase 14 の行を足す（「ツリー構造の編集（兄弟ノードの順序変更）」。ほかの4項目は未実装と書く）。1.2 のヘッダーの説明に「上へ」「下へ」を足す。
  - 3.6 に、自動配置ではドラッグが並べ替えになることを1行で参照する。
  - 4.1 の自動配置の「手動ドラッグ移動は無効化され」を、「ドラッグは位置の移動ではなく兄弟の順序の変更になる（14 章）」に直す。
  - 4.2 の「ルートと兄弟の順序」に、14 章で順序を変えられること、先頭のルートが変わるときの座標の引き継ぎを足す。
  - 8.1 の表に「兄弟の順序変更 | 配列の順と、手動配置での2つの組の平行移動、自動配置での再配置をまとめて1操作（ドラッグは落としたときの1回）」を足す。8.2 の「元に戻した直後の状態」で消える通知に、兄弟の順序変更の通知を足す。
  - 10.4 に「並べ替え: 閉じた枝も並べ替えられ、手動配置では隠れた子孫も一緒に動く。折りたたみは保つ」を足す。
  - 11.1 の表に `Alt`（`Option`）+ `↑` / `↓` と、ドラッグ中の `Escape` の行を足す。ショートカットが止まる場面の NOTE に `Alt+↑/↓` を足す。
  - 11.2 の表のノードのドラッグを「手動配置: 位置移動 ／ 自動配置: 兄弟の順序の変更（挿入位置に青い線 `#2563eb`）」に直す。11.3 の1本指ドラッグも同様。
  - 11.4 の表に「兄弟の順序」のボタンの行を足す。操作通知バーの「7系統」を「8系統」に直し、系統の列挙、見出し「7系統独立表示」、本文の「7 系統」、`kind` の表の主な用途（`status` に兄弟の順序変更の成功と端の通知、`error` に失敗）を更新する。「マップ全体置換時の同期リセット」の `documentRevision` 側の列挙に「兄弟の順序変更の通知の消去（10 番）」を足し、番号付きの一覧に10番を足す。「レイアウトモード別操作ヒント」の文言を新しい文言に直す。
  - 13.8 の「操作通知バー（7系統目）」はそのまま（取り込みが7系統目であることは変わらない）。
- `docs/specifications/data-model.md`: 2.1 の `Node` の説明に「兄弟とルートの順は `nodes` 配列の相対順。並べ替えは根ノード1つの配列内の位置を変え、子孫の位置は変えない。順序のフィールドは持たない」を足す。新しい節「2.7 兄弟ノードの順序変更の型」に `SiblingReorderDirection`・`SiblingReorderTarget`・`SiblingReorderRequest`・`SiblingReorderResult`・`ReorderSiblingResult` を足す。定義元はすべて `client/src/domain/nodes/nodeSiblingOrder.ts` と書く。保存形式（3章）は変えないことを確かめる。
- `docs/architecture/overview.md`: レイヤーの説明に新しいファイルを足し、各ディレクトリのファイル数を実数に合わせる（`ls` で数える）。3.6 の状態図に「自動配置: NodeDragPending → Reordering（4px 以上）→ Idle（離す: 並べ替え ／ Escape・外で離す: 中止）」を足し、Shift による分岐の説明に配置モードによる分岐を足す。4.1 の「箇条書きからの追加の流れ」の後に「兄弟の順序変更の流れ」（ボタン・ショートカット・ドラッグ → `useSiblingReorderAction` → `useNodes.reorderSibling` の1回の commit、通知の8系統目）を足す。
- `docs/testing/browser-test-cases.md`: 新しい節「Phase 14: 兄弟ノードの順序変更」（記号 `Q`）を足す（下の「手動テスト」）。
- `README.md`・`client/README.md`・`docs/README.md`: 機能の一覧、Phase の範囲（「Phase 0〜13」など）、編集履歴の対象、`domain/nodes/` の説明、操作通知バーの「7系統目」の記述があれば、兄弟の順序変更を足して直す。
- `ROADMAP.md`: 最後のタスクで、Phase 14 の「兄弟ノードの順序変更」だけにチェックを付け、見出しを「（進行中）」にする。「現在地」（完了した項目に兄弟ノードの順序変更、進行中は Phase 14、次の未完了項目は「階層の上げ下げ」（候補002））と「最終更新」の日付を更新する。実機で確認していないことは、確認していないと書く。

## 手動テスト

`docs/testing/browser-test-cases.md` に「Phase 14: 兄弟ノードの順序変更」の節を追加し、ケースの記号は `Q` にする。共通の決まりは P 節と同じにする: 利用者の普段の保存データを消さないよう、`npm run start -- -p 3114` で本番ビルドを普段と別のオリジンで起動し、保存データを消すときはキーを名前で1つずつ消す（「Clear All」は使わない）。各ケースは「新しいマップ」でケースの ID を名前にしたマップで行う。特に書かない限り表示は「すべて」。結果は、実ブラウザで確かめたものだけを記録し、Jest の結果を実機の確認として扱わない。

| ID | 内容 | 優先度 |
| :--- | :--- | :--- |
| Q-01 | 基本（手動配置・ボタン）。親 R の子 A・B・C（C だけ子を2つ持つ）を作り、C を選択して「上へ」を2回。C の枝（子を含む）が A の位置へ、A・B がその下へ移り、間隔が保たれ、横位置が変わらないこと。通知「枝を上へ移動しました（見えている兄弟の3件中2番目）。」「…3件中1番目）。」。先頭で「上へ」が無効になり、フォーカスが「下へ」へ移ること | 高 |
| Q-02 | ショートカット。Alt+↑ / ↓（macOS は Option+↑ / ↓）で同じ結果になること。押し続けると続けて動き、端で「これ以上上へ移動できません（見えている兄弟の先頭です）。」が出ること。Alt+Shift+↑、Ctrl+Alt+↑ では動かないこと | 高 |
| Q-03 | 手動配置の入れ替えの式。高さの違う枝（イラスト付きのノード、子の多い枝）同士、画面の上下が並びと逆になっている兄弟、重なっている兄弟で、例1・4・5 のとおりに動くこと | 高 |
| Q-04 | 隠れた兄弟。子の重要度を「高・低・高」にし、表示を「高のみ」にして、3番目を「上へ」。低の兄弟を飛び越え、表示を「すべて」に戻すと、画面の上下と並び（例2）が一致すること。端の案内「隠れている兄弟と入れ替えるには、表示を『すべて』に切り替えてください。」 | 高 |
| Q-05 | ルートの並べ替え。手動配置で3つのルートを並べ替えること。自動配置で2番目のルートを先頭へ移すと、先頭のルートのノードの位置が変わらないこと（例6） | 高 |
| Q-06 | 自動配置のドラッグ。兄弟の間へドラッグすると青い線が挿入位置に出て、ドラッグ中のノードが半透明になり、落とすと並び直ること。元の位置、Escape、キャンバスの外で離す、で何も変わらないこと。別の親の子の間へ落としても親が変わらないこと。Shift+ドラッグは接続のままであること。手動配置ではドラッグで移動すること | 高 |
| Q-07 | 折りたたみ中の自動配置のドラッグ。別の枝を閉じて表示が詰まった状態で、線が見えている兄弟の間に正しく出て、落とした位置へ並ぶこと。並べ替えた後も折りたたみが保たれること | 中 |
| Q-08 | 元に戻す / やり直す。ボタン・ショートカット・ドラッグのそれぞれの並べ替えが1回の「元に戻す」で戻り、「やり直す」で同じ順と位置になること。通知が消えること。並べ替えの後も選択が移動したノードのままであること | 高 |
| Q-09 | ショートカットが止まる場面。ラベル編集中（Option+↑ で入力欄のカーソルが動く）、検索入力欄、表示セレクター、箇条書きのダイアログ・マップのダイアログを開いている間、日本語 IME の変換中。どれでもマップが変わらないこと | 高 |
| Q-10 | ボタンのキーボード操作と読み上げ。Tab で「上へ」「下へ」へ移り、Enter・Space で動くこと。Enter の約3秒の押し続けで1回だけ動くこと。VoiceOver で「枝を上へ移動」と通知が読まれること | 中 |
| Q-11 | 保存と書き出し。並べ替えの後にリロードしても順が保たれること。JSON を書き出して別のマップへ読み込むと同じ順になること。PNG / SVG に並べ替えた後の配置が出ること | 中 |
| Q-12 | タッチと Safari。自動配置で1本指ドラッグで並べ替えられること、途中で2本目の指を置くとピンチになり並べ替わらないこと。Safari での Option+↑ / ↓ | 低 |
| Q-13 | 幅 375px とダークモード。ヘッダーのボタンが画面に収まり、挿入位置の線がダークモードでも見えること | 中 |

## 反映した知見

| ID | 反映した箇所 |
| :--- | :--- |
| L-001 | 並べ替えの結果を判別共用体で返し、成功のときだけ成功の通知を出す。自動配置の失敗も `placement-failed` として返す。元の位置への落下と中止は commit しない |
| L-035 | 対象と挿入先を ID で指定する。1つ上・1つ下は `applyTreeChange` の中の最新の配列で解決し、ドラッグは落とした時点の座標と最新の ref で求め直す |
| L-037 | 通知は `documentRevision` と組にして持ち、Undo / Redo・置き換えで消す。ジェスチャーも `documentRevision` の変化で中止する |
| L-057 | 端で押したショートカットに、理由と、先へ進む方法（表示を「すべて」に）を通知する |
| L-058 | ボタンは `disabled` 属性で無効にし、無効のときにクリックしても呼ばれないことをテストする |
| L-060 | 新しい props（`layoutMode`、`onReorderSibling`、ボタンの props）を必須にし、`Home` からの結合テストと配線の変異で確かめる |
| L-061 | ボタン・ショートカット・ドラッグのすべてを、ダイアログの `inert` と `editorShortcutsEnabled` の対象にし、既存の操作との関係を表にした |
| L-150 | 「上へ」「下へ」は画面を切り替えないので、ダブルクリックの続きのクリックは同じボタンに届く（2回の移動として扱う）。端で無効になったボタンへの続きのクリックは何もしない。ヘッダーのボタンの `dblclick` はキャンバスに届かない |
| L-408 | ボタンの Enter の押し続けを止め、無効になったボタンのフォーカスをもう一方へ移しても往復しないようにした |
| L-457 | 親子は `parentId` で表すので、ブロックとして動かさず根ノード1つだけを動かす。移動先の子孫を割り込ませる問題が起きない根拠を書いた |
| L-460 | 並べ替えは正本の全配列に対して行い、隠れた兄弟を消さない・順を変えない。テストで固定する |
| L-472 | 自動配置では表示の上下が配列の順と一致するのでドラッグで並べ替え、一致しない手動配置ではドラッグを並べ替えに使わず、縦位置の入れ替えで画面と並びを一致させる |
| L-474 | ショートカットとドラッグ中の Escape で、`isComposing` と `keyCode` 229 を無視する |
| L-522 | ショートカットの対象外の要素を、既存の `isInteractiveTarget`（ボタン・リンク・入力欄・`contenteditable`）と同じにする |
| L-540 | 順序のフィールドを足さず、配列の相対順を正本にする。再採番をしない |
| L-541 | `splice` と添字を使わず、1回の走査で新しい配列を作る。anchor の検査で範囲外や向きの食い違いを拒否する |
