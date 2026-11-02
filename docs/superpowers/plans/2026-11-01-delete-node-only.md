# Phase 14「ノードだけ削除」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> このリポジトリでは AGENTS.md が優先される。ユーザーの明示指示がないためインライン実行は禁止。各タスクを新しい実装サブエージェントで順番に実行し、実装者とは別の仕様・品質レビュアーの二段階レビューが完了してから次へ進む。feature コマンドの手順を優先し、**各タスク内では commit しない**。後続の `commit-ja` でまとめてコミットする。

**Goal:** ヘッダーから選択中の実在・表示ノード1個だけを削除し、全子孫・属性・兄弟順を保ったまま元の親へつなぎ直す。

**Architecture:** 純粋関数で全配列から構造候補を作り、`useNodes` が既存の `applyTreeChangeWithOutcome` / `applyTreeChange` を通して1操作で確定する。小さい Control と action hook を `MapEditor` の実物へ配線し、既存の通知・履歴・保存を利用する。表示配列、保存 projection、既存の枝削除を構造変換へ流用しない。

**Tech Stack:** TypeScript、React 19、Next.js 16、Jest 30、Testing Library、既存の Pixi テストハーネス。

**Spec:** `docs/superpowers/specs/2026-11-01-delete-node-only-design.md`（独立仕様レビュー承認済み）。必ず本計画と併読する。

## Global Constraints

- 対象は現在表示されている実在ノード1個。葉、子を持つノード、ルート、折りたたんだノードを扱う。
- 複数選択、削除確認ダイアログ、右クリックメニューの再設計、他マップの編集、保存形式の変更は対象外。
- ノードの兄弟順は全ノード配列の相対順が正本。配列は深さ優先順や「親の後に子が連続する順」とは限らない。`parentId` で構造を決める。
- 全配列上で T と `parentId === T.id` の要素を除き、T があった位置へ C1…Cn をこの順で挿入する。挿入した子はそれぞれ `parentId = T.parentId` とする。
- 直下の子以外の `parentId` は変更しない。孫以降を平坦化せず、各子の枝を保持する。
- ノード数は必ず1減る。IDの生成・再採番は行わない。残る全ノードのlabel、importance、illustrationの有無と内容、width、height等を保持する。手動配置ではx/yも保持する。
- 表示配列を構造更新へ渡さない。折りたたみ・解像度により隠れた全ての子・子孫を同じ規則で保持する。
- 入力の森を `indexNodeForest` で検証してから候補を作る。構造が不正なら `invalid-structure`、数値・寸法による配置不能なら `placement-failed` とする。
- 失敗では入力・選択・履歴・保存対象が一切変わらない。
- 構造候補を `applyTreeChange` へ1回渡し、`layoutNodeForest` が全体の最終座標を決める。配置が失敗した候補は確定しない。
- 先頭ルートが変わる自動配置では新しい先頭ルートへ削除前の先頭ルートのx/yを渡す。手動配置では全ての座標を維持する。
- MapStage側に新しい削除ショートカットやpropsを増やさない。既存 `onDeleteNode` の枝削除経路は変更しない。
- 成功時、選択中のIDが削除対象なら `null` にする。親や子を自動選択しない。APIで別のノードを削除した場合は残る選択を保持する。失敗時は選択を変えない。
- 通常の成功では `documentRevision` を変えない。Undo / Redoは既存どおり選択を解除し、版を進める。新たなIDや版は発行しない。
- DOMフォーカスを別の操作やキャンバスへ強制移動しない。`detail === 0` は許し、マウスの `detail > 1` は無視する。入力欄を壊すグローバルハンドラは追加しない。
- 全返答・説明・通知は日本語。TDDのREDを実装前に確認する。最終 `client/npm run verify` 必須。実ブラウザの確認を実施していなければ実施済みとは書かない。
- 作業場所は `.worktrees/codex/phase14-delete-node-only`。各実装者に該当タスク、Global Constraints、先行タスクの Interfaces を渡す。指摘修正は実装者へ戻して再レビューする。

## Review Focus

1. 子がTより前後に散在する非連続配列と、子を持つ隠れた兄弟: 昇格子を重複させず、全兄弟順と孫の親を保つ（Task 1）。
2. 自動配置で先頭ルートを削除し、子がない場合や子が配列先頭寄りにある場合: 次の先頭ルートだけが元の基準座標を引き継ぐ（Task 1）。
3. 純粋変換成功後に実レイアウトの算術が失敗: ノード・選択・Undo/Redo・版・保存対象を確定しない（Task 1 / 2）。
4. 折りたたみと解像度に隠れた子孫、および残る子の折りたたみ: 昇格後もデータと子自身の折りたたみを保ち、Home再マウント後も構造・順序・属性を復元する（Task 2）。
5. disabledへの遷移、ダブルクリックとキーリピート: 親子の自動選択や他操作へのfocus呼び出しがなく、次の入力で別ノードを消さない。disabled後のactiveElementはブラウザ差として実機確認を分ける（Task 2 / 3）。

---

## ファイルと既存境界

- `Node` は `client/src/types/node.ts`: `id/parentId/x/y/width/height/label/importance` と optional `illustration?: string`。`NodeLayoutMode = "manual" | "auto"`。
- `indexNodeForest(nodes: readonly Node[]): IndexedNodeForest | null` は構造・geometryを検証し、`roots` と `childrenByParent` を配列順で返す。構造検証や再帰走査を複製しない。
- `applyTreeChangeWithOutcome<R extends { ok: boolean }>(applyTreeChange, compute): R | TreeChangePlacementFailure` は `compute(currentNodes: readonly Node[], mode: NodeLayoutMode)` から `{ nodes: Node[] | null; outcome: R }` を受ける。`useNodeLayoutState.applyTreeChange` は最新状態を読み、自動配置後に1回commitする。
- `MapEditor` が `useNodes()` を所有し、`useMapDisplayState` の可視IDと `treeEditNotice` のpublish/clearを各actionへ渡す。新しい本番必須propsをoptionalにしてテストを通さない。
- `client/src/app/testing/pageTestHelpers.tsx` の `renderPage` は実Homeを描画する。`seedMapLibrary`、`v3Json`、`selectNode`、`storedMap`、`exportedMap`、`undoButton`、`redoButton` を再利用する。

### Task 1: 純粋な1ノード削除と最新状態・原子的なuseNodes API

**Files:**
- Create: `client/src/domain/nodes/nodeOnlyDeletion.ts`
- Create: `client/src/domain/nodes/__tests__/nodeOnlyDeletion.test.ts`
- Modify: `client/src/hooks/useNodes.ts`（`UseNodesReturn`、構造編集コールバック、返却値）
- Create: `client/src/hooks/__tests__/useNodesOnlyDeletion.test.ts`

**Interfaces:**
- Consumes: 上記既存の `Node` / `NodeLayoutMode`、`indexNodeForest`、`applyTreeChangeWithOutcome`、`useNodes` の `replaceMap(map: NodeMapState): void`、`selectNode(id: number | null): void`、`undo(): boolean`、`redo(): boolean`。
- Produces（`nodeOnlyDeletion.ts` からexport）:
  - `NodeOnlyDeletionFailureReason = "node-missing" | "node-hidden" | "invalid-structure" | "placement-failed"`
  - `DeleteNodeOnlyResult = { ok: true; deletedId: number } | { ok: false; reason: NodeOnlyDeletionFailureReason }`
  - `NodeOnlyDeletionResult = { ok: true; nodes: Node[]; deletedId: number } | { ok: false; reason: NodeOnlyDeletionFailureReason }`
  - `canDeleteNodeOnly(nodes: readonly Node[], nodeId: number | null, visibleNodeIds: ReadonlySet<number>): boolean`
  - `deleteNodeOnly(nodes: readonly Node[], nodeId: number, visibleNodeIds: ReadonlySet<number>, mode: NodeLayoutMode): NodeOnlyDeletionResult`
- Produces（`UseNodesReturn` / `useNodes`）: `deleteNodeOnly(nodeId: number, visibleNodeIds: ReadonlySet<number>): DeleteNodeOnlyResult`。安定したコールバック。戻り値に `nodes` を含めない。

- [x] **Step 1: ドメインの失敗テストを先に作る**

`createTestNode` を使い次のassertを持つテストを追加する（新規関数importでRED）。

- `非連続の直下の子をTの位置へ移し全属性と孫を保つ`: 入力ID列 `[1,6,2,8,4,3,7,5,9]`、親は `{1:null,6:4,2:1,8:2,4:1,3:1,7:6,5:4,9:null}`、可視IDは `[1,2,4,9]`。T=4削除後ID列は `[1,2,8,6,5,3,7,9]`、1の子は `[2,6,5,3]`、6/5の親だけ1へ、7の親6、8の親2。個数は元より1少なくID集合の差は4だけ。入力をclone/freezeして不変性を確認し、残存全ノードのlabel/importance/width/height/x/yを完全比較する。6には `createJpegDataUrl`（`client/src/testing/jpegFixture.ts`）で作る有効なillustrationと十分なheight、5にはoptional key自体を付けず、内容と `hasOwnProperty` の両方を比較する。
- `葉と唯一の根を消せる`: 葉のみ除去、唯一の根は `nodes: []`。`canDeleteNodeOnly` はnull/missing/hiddenでfalse、可視の根/葉でtrue。
- `ルート位置と自動配置基準を保つ`: Tが先頭/中間/末尾の根、直下の子が0/1/複数の表形式。先頭T `(30,40)` の昇格先頭子（子なしなら次の既存根）へauto時のみ `(30,40)` を渡す。中間/末尾削除では既存先頭座標を維持。manualでは全座標が元のまま。孫をrootにしない。先頭ルートは配列の0番と決めつけず、先頭に子を置くfixtureも含める。
- `失敗理由と入力不変`: missing/hidden、ID重複/親欠け/自己参照/長い循環/非有限IDは `invalid-structure`、x/y/width/heightのNaN・Infinity、寸法0/負数は `placement-failed`。missing/hiddenは対象検証で先に返す。不正ノードが削除対象自身でも削除して不正を隠蔽しない。
- `深い枝も反復走査で保持`: 数千段の有効な鎖で中間1個だけ削除、孫以降の親と個数を比較する。

- [x] **Step 2: ドメインのREDを確認**

Run（以降全てworktreeの `client` で実行）: `npm test -- --runInBand src/domain/nodes/__tests__/nodeOnlyDeletion.test.ts`
Expected: 新規モジュール未実装によるFAIL。既存設定やfixtureのエラーは先に直す。

- [x] **Step 3: 純粋関数を実装**

対象を全配列で解決しmissing→hidden→geometry→`indexNodeForest`の順で検証する。geometry前検証はx/y/width/heightの有限性と正寸法だけとし、ID/親/循環は既存indexへ任せる。直下の子を元配列順で集め、Tまたは直下の子を除いた走査中にTの位置へ子をspreadして挿入する。autoで根先頭IDが変わった場合だけそのノードへ旧先頭根座標を渡す。`layoutNodeForest` 自体はここで呼ばず、最終配置をhookへ委ねる。

- [x] **Step 4: ドメインのGREENを確認**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeOnlyDeletion.test.ts`
Expected: 全件PASS。

- [x] **Step 5: hookの失敗テストを追加**

`useNodesParentInsertion.test.ts` のrenderHookパターンを参考にし、以下を追加する。

- `manual/autoで成功し、削除対象だけ選択解除する`: 選択Tならnull、選択が残る子/別根ならそのまま。成功結果は厳密に `{ ok: true, deletedId: 4 }`。通常成功でdocumentRevisionは不変。autoの最終全配列は実 `layoutNodeForest(ドメイン候補)` と一致し属性を保つ。
- `1回のUndoとRedoで全順序・全属性・座標が復元する`: 削除前後の全配列を完全比較し、Undo/Redoそれぞれで選択null・版増加を確認。Undo2回目で余分な削除中間履歴がないことを確認。
- `初回コールバックが最新状態・最新modeを使う`: 最初の `deleteNodeOnly` を保存し、再render後にも同一参照であることをassert。同じactでノード追加/ラベル更新/autoへ変更して保存済みcallbackで削除し、直前変更と最新modeの配置結果を反映する。追加直後のIDを可視setに含める。
- `全失敗で選択・nodes参照・履歴・Redo・版を保つ`: domain失敗を表形式にし、ラベル変更→UndoでcanRedo=trueを準備してから実行。未配置auto入力にmissing/hiddenを指定して、失敗をきっかけに再配置しないことも比較する。
- `候補成功後の実自動配置失敗も原子的`: `replaceMap({layoutMode:"auto", nodes:[R,C,T]})`、R=根 `(Number.MAX_VALUE,0)` 幅`Number.MAX_VALUE`、C=Rの子、T=別根の葉。全geometryは有限・正、`deleteNodeOnly`の純粋候補は成功する一方、実 `layoutNodeForest(candidate)` はnullとなることを先にassertする。Rのラベル変更→UndoでRedoを作り、Tを選択して削除し `{ok:false,reason:"placement-failed"}`、全状態不変を確認する。実レイアウトをnullモックするだけで済ませない。
- `従来のdeleteNodeは子孫を含めて消す`: 新APIと同じ枝fixtureで既存APIを呼び、T/C/Gが消えることを確認。

- [x] **Step 6: hookのREDを確認**

Run: `npm test -- --runInBand src/hooks/__tests__/useNodesOnlyDeletion.test.ts`
Expected: hook未公開/未実装によるFAIL。

- [x] **Step 7: useNodesへ結果付きコールバックを実装**

Task 1のInterfacesどおり返却型と返却オブジェクトへ追加。`compute` 内で純粋関数を呼び成功時だけ `{nodes, outcome:{ok:true,deletedId}}` を渡す。settled成功後だけ `setSelectedNodeId(prev => prev === deletedId ? null : prev)`。ID allocatorとdocumentRevisionは操作しない。既存 `deleteNode` は変更しない。

- [x] **Step 8: 新規・既存hookテストとverifyを確認**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeOnlyDeletion.test.ts src/hooks/__tests__/useNodesOnlyDeletion.test.ts src/hooks/__tests__/useNodes.test.ts src/hooks/__tests__/useNodesHistory.test.ts src/hooks/__tests__/useNodesParentInsertion.test.ts`
Expected: 全件PASS。その後 `npm run verify` が終了コード0。commitせず仕様・品質の二段階レビューへ渡す。

### Task 2: 通知・Control・実MapEditor配線とHomeの保存再読結合テスト

**Files:**
- Create: `client/src/domain/nodes/nodeOnlyDeletionMessages.ts`
- Create: `client/src/domain/nodes/__tests__/nodeOnlyDeletionMessages.test.ts`
- Create: `client/src/hooks/useNodeOnlyDeletionAction.ts`
- Create: `client/src/hooks/__tests__/useNodeOnlyDeletionAction.test.tsx`
- Create: `client/src/components/layout/NodeOnlyDeleteControl.tsx`
- Create: `client/src/components/layout/__tests__/NodeOnlyDeleteControl.test.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`（useNodes destructure、tree action、operationControls）
- Create: `client/src/app/__tests__/pageNodeOnlyDeletion.test.tsx`
- Modify if required: `client/src/components/map/__tests__/MapEditor.test.tsx`（useNodesモックがある場合は必須APIを実物と合わせる。optional化しない）

**Interfaces:**
- Consumes: Task 1の全export、`UseNodesReturn.deleteNodeOnly`。既存 `OperationNotice = { kind: "status" | "warning" | "error"; message: string }` とMapEditorの `publishTreeEditNotice: (notice: OperationNotice) => void` / `clearTreeEditNotice: () => void`。
- Produces: `formatNodeOnlyDeletionFailureNotice(reason: NodeOnlyDeletionFailureReason): OperationNotice`。
- Produces: `UseNodeOnlyDeletionActionOptions = { selectedNodeId: number | null; nodes: readonly Node[]; visibleNodeIds: ReadonlySet<number>; deleteNodeOnly: (nodeId: number, visibleNodeIds: ReadonlySet<number>) => DeleteNodeOnlyResult; publishNotice: (notice: OperationNotice) => void }`。
- Produces: `useNodeOnlyDeletionAction(options: UseNodeOnlyDeletionActionOptions): UseNodeOnlyDeletionActionReturn`、returnは `{ canDelete: boolean; deleteSelected: () => void }`。既存通知枠へのpublishは成功通知も置換するためclear専用propは不要。版変化によるclearは既存MapEditorの仕組みを使う。
- Produces: `NodeOnlyDeleteControlProps = { canDelete: boolean; onDelete: () => void }`、`NodeOnlyDeleteControl(props: NodeOnlyDeleteControlProps)`。必須props。新しいMapStage propsなし。

- [x] **Step 1: 通知・action・Controlの失敗テストを作る**

通知はmissing→「対象のノードが見つかりません。」、hidden→「表示されているノードを選択してください。」、invalid→「ノードの構造を確認できないため削除できません。」、placement→「配置できないため削除できません。」を `kind:"error"` で厳密比較。actionは未選択でAPIを呼ばず、実在/表示に応じcanDeleteを更新し、実行時のvisible setとIDをAPIへ渡す。失敗を成功として通知せず、成功は `{kind:"status",message:"ノードだけ削除しました。子孫は残っています。"}` を1回publishする。再renderで対象が消えた場合や表示状態が変わった場合も検証し、実行時の再検証はTask 1 APIへ任せる。

Controlは表示文言「ノードだけ削除」、accessible name「選択中のノードだけ削除」、title「子孫を残して、選択中のノードだけ削除」、disabledとクリック抑止、detail 0/1は1回実行、detail 2は実行しない、repeat Enter/SpaceはpreventDefaultになることをassert。既存 `preventRepeatedActivationClick`（`client/src/components/layout/repeatedEnterClick.ts`）を使う。focusを自分で移すコードや新しいグローバルハンドラを作らない。

- [x] **Step 2: 単体REDを確認**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeOnlyDeletionMessages.test.ts src/hooks/__tests__/useNodeOnlyDeletionAction.test.tsx src/components/layout/__tests__/NodeOnlyDeleteControl.test.tsx`
Expected: 新規モジュール未実装によるFAIL。

- [x] **Step 3: 通知・action・Controlを実装してGREENを確認**

Interfacesどおり3ファイルを実装する。Controlの通常pointerdownを妨げず、ラベル編集のblur確定を維持する。新ボタンに既存ショートカット用の目印・aria-keyshortcutsを追加しない（今回新しいショートカットを提供しない）。Step 2と同じコマンドで全件PASS。

- [x] **Step 4: 実Homeを通す結合失敗テストを追加**

`pageParentInsertion.test.tsx` のモック境界（Pixi、画像生成/計測/ラスタライズ、ダウンロードのみ）を踏襲する。`MapEditor`、Control、action、useNodes、MapStageショートカット、保存codec・storageは本物を使う。Task 1の非連続fixtureの全属性をV3でseedし、以下をassertする。

- `親を挿入の直後に新ボタンがありTだけ消え子が残る`: DOM順、未選択disabled、T選択で有効、クリック後ID列 `[1,2,8,6,5,3,7,9]` /親/属性/個数/選択解除を比較。成功通知はJSON exportより先に読む（exportは別通知を出す）。Undo1回で全データ復元、Redoで再現。
- `自動保存と実Home再マウントで構造を保つ`: 300ms自動保存を `waitFor(...,{timeout:3000})` で待ち、storedMapのversion=3、layoutMode、全配列・illustrationの有無まで比較。HomeをunmountしlocalStorageを残したまま新規 `renderPage()` で復元し、JSON書き出しが保存値に一致。専用保存処理を作らない。
- `折りたたんだTの削除は隠れた子孫を失わない`: 子C自身を閉じてからTを閉じ、Tを削除する。Cは昇格し閉じた状態を保ちGは隠れたまま、Tの消滅が表示更新を妨げない。解像度フィルターで隠れた子・兄弟も保存上は残り、重要度・表示レベルを変えない別ケースを加える。Undo/Redoの既存折りたたみクリアは変えない。
- `表示レベルで選択が隠れると無効`: 有効状態からフィルター変更しdisabled、クリックしても構造は不変。実在しない/非表示を再検証するfailureはhookテストでも固定する。
- `配置失敗を通知し保存もRedoも変えない`: Task 1の実算術失敗fixtureをV3でseedする。Rの巨大座標への実pointer移動は不要で、通常座標のCをダブルクリックしてラベル編集→Enter確定→UndoでRedoを準備し、Tを選択する（ラベル編集は非構造更新なのでauto再配置を要求しない）。削除後errorの正確な文言・成功通知なし・全データ不変・選択保持（ボタン有効のまま）・Redo可能を検証。300ms後も保存本体が失敗前と同じ。読み込みで拒否されるfixtureへ緩和せず、有限・正のfixtureを使う。
- `従来のDelete/Backspaceは枝全体を削除する`: 同fixtureの各キーでTと全子孫が消え、兄弟は残る。検索inputとラベルinputへDelete/Backspaceを送ってもノードは消えず、通常の文字編集を維持する。
- `連続入力で他ノードを削除しない`: 実userクリック/キーボードclick detail0→成功→disabled、detail2やrepeat Enter/Spaceを送っても追加削除なし、選択null。jsdomではEnter既定click合成を既存親挿入テスト同様に明示的に再現し、実ブラウザ検証と呼ばない。フォーカスは他の操作（枝移動/複製/親挿入など）やstageへ強制移動しないことをassertする。disabled後に必ず元ボタンへ残るとの固定assertは書かない。必要ならfocus spyでアプリ由来の追加focus呼び出しがないことを検証する。

- [x] **Step 5: 結合REDを確認**

Run: `npm test -- --runInBand src/app/__tests__/pageNodeOnlyDeletion.test.tsx`
Expected: 新ボタン未配線によりrole検索がFAIL。

- [x] **Step 6: MapEditorの実物へ配線**

`useNodes`から新APIを受け、既存全nodes/selectedNodeId/visibleNodeIdsとpublishをactionへ渡す。既存 `treeEditNotice` の同じ枠を使用し、`NodeParentInsertControl`直後へ新Controlを置く。`onDeleteNode={deleteNode}` を保つ。版変更の通知clear・折りたたみ正規化・保存には追加経路を作らない。

- [x] **Step 7: 結合・既存回帰とverifyを確認**

Run: `npm test -- --runInBand src/app/__tests__/pageNodeOnlyDeletion.test.tsx src/app/__tests__/pageParentInsertion.test.tsx src/app/__tests__/pageCollapse.test.tsx src/app/__tests__/pageHistory.test.tsx src/app/__tests__/pageSaveReload.test.tsx src/components/map/__tests__/MapEditor.test.tsx src/components/map/__tests__/useNodeKeyboardShortcuts.test.tsx`
Expected: 全件PASS。その後 `npm run verify` が終了コード0。commitせず二段階レビューへ渡す。

### Task 3: 機能/API/実ブラウザ手順とROADMAPを更新し全体検証

**Files:**
- Modify: `README.md`（機能一覧・現在地）
- Modify: `client/README.md`（構造編集機能と確認手順）
- Modify: `docs/README.md`（機能/API案内）
- Modify: `docs/architecture/overview.md`（純粋候補→1回確定、action/Control責務）
- Modify: `docs/specifications/features.md`（ノードだけ削除の機能章と未実装記述）
- Modify: `docs/specifications/api.md`（Task 1/2の実際の公開型・API）
- Modify: `docs/testing/browser-test-cases.md`（専用確認節）
- Modify: `ROADMAP.md`（候補017、Phase14、現在地、次候補、最終更新）

**Interfaces:**
- Consumes: Task 1 / 2のInterfacesおよびGREENになった結合テスト。保存形式は既存V3で変更なし。
- Produces: 実装と一致した説明・実機確認手順、候補017完了/Phase14完了/次Phase15候補004を示すロードマップ、最終verifyの実行証跡。コードAPIは追加しない。

- [x] **Step 1: 文書の旧記述を洗い出し、確認リストを作る**

Run: `rg -n 'ノードだけ|Phase 14|候補017|親を挿入|削除' README.md client/README.md docs/README.md docs/architecture/overview.md docs/specifications/features.md docs/specifications/api.md docs/testing/browser-test-cases.md ROADMAP.md`
Expected: 「ノードだけ削除は未実装」などの旧記述を特定。文書のみの変更なので人工的なREDテストは追加せず、先行タスクの振る舞いテストを受け入れ基準にする。

- [x] **Step 2: 機能/APIとブラウザ手順を更新**

新ボタンの文言/位置/disabled、全配列相対順、直下の子だけ昇格、manual座標保持/auto先頭基準、失敗理由と通知、1回Undo/Redo、折りたたみ/表示レベル、選択/フォーカス、従来の枝削除との違い、保存形式不変を書く。API文書はTask 1/2のexport名と型を実装と照合する。ブラウザ手順には中間/葉/根、隠れた子、manual/auto、保存再読み込み、Delete/Backspace回帰、Tab→Enter/Space、ダブルクリック、キー押し続け、入力欄の文字削除を含める。

フォーカスの合格条件は「アプリが他の操作/キャンバスへ強制移動しない」「次の入力で別ノードを削除しない」。disabled後activeElementが元ボタン/body等のどれになるかはブラウザ依存としてChrome/Safari/Firefoxの結果記録欄を用意する。未実行は未確認と書き、Jestの成功を実ブラウザ確認済みとしない。

- [x] **Step 3: ROADMAPを実装と照合して更新**

候補017だけを新たに[x]にする。Phase14の他4項目は既に[x]なのでPhase14見出しを完了とし、「現在地」のツリー編集完了と全実装範囲を更新。次の項目はPhase15「アウトライン表示・編集」（候補004）、Phase15は未着手として保持し候補004を完了にしない。最終更新を `2026-11-01`（実作業が翌日になれば実際の日付）にする。実機未確認の事実を維持する。

- [x] **Step 4: 文書差分・最終verifyを確認**

Run: `git diff --check`
Expected: 終了コード0。実装/ドキュメント/ROADMAPの対応を目視確認する。

Run（client）: `npm run verify`
Expected: tailwind:scan、lint、typecheck、全Jest、buildが成功し終了コード0。失敗は担当実装者へ戻し、修正部分を再レビューして再実行する。成功出力を見てから完了を報告する。

- [x] **Step 5: 二段階レビューを受けfeatureフローへ戻す**

Task 3の仕様・品質レビュー後、全体差分と最終verify証跡をメインへ返す。各タスク内のコミットは行わず、`feature → refactor-srp → review-loop → commit-ja` 以降の既存フローへ戻す。

## 計画セルフレビュー

- Spec coverage: 構造・全属性・並び・失敗分類・手動/自動配置・原子性・API・履歴/選択はTask 1、UI/通知/実配線/隠れた全データ/保存再読/枝削除回帰はTask 2、文書/実機手順/ROADMAP/最終verifyはTask 3へ割り当てた。欠落なし。
- Step scan: テスト追加→対象JestのRED→実装→GREENをコード変更前に明記し、Task 3は文書検証に限定した。関数本体の転記はせず、順序の難所は入出力配列で固定した。
- Type consistency: `NodeOnlyDeletionResult`（nodesあり）、`DeleteNodeOnlyResult`（nodesなし）、`NodeOnlyDeletionFailureReason`、`canDelete` / `deleteSelected` をTask間で統一。modeとvisible setは既存型を利用。
- Review Focus: 5項目すべてをTask 1/2の明示的assertとTask 3の実機手順へ対応させた。候補生成後の失敗は実レイアウトで検証し、モックだけに依存しない。
- Proportion: 3つの順序依存タスクに限定し、コード本体は実装者へ委ねた。レビュー可能な独立成果物はドメイン/hook、実UI経路、文書/最終証跡。未決のユーザー判断なし。
