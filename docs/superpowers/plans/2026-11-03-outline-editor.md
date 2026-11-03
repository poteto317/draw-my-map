# アウトライン表示・編集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`でタスク単位に実装する。AGENTS.mdに従いインライン実装を選ばない。各タスクの新しい実装者→別エージェントによる仕様適合レビュー→コード品質レビューを順番に行い、指摘修正と再レビュー完了後に次へ進む。チェックボックスで進捗を記録する。

**Goal:** 候補004として、同じ正本・選択・履歴・保存を使う全件アウトライン表示と編集をマップ表示へ往復できるようにする。

**Architecture:** 全件先行順を導出する純粋ドメイン、draftと原子的操作を管理するhook、DOMと局所キー操作を扱うUIに分ける。MapEditorが表示モードと既存状態を配線し、MapStageとアウトラインを排他的にマウントする。保存・履歴・イラストは既存経路を共有する。

**Tech Stack:** Next.js 16.1.6 / React 19.2.3 / TypeScript / Tailwind CSS 4 / Jest 30 / Testing Library。依存追加なし。

**Spec:** `docs/superpowers/specs/2026-11-03-outline-editor-design.md`（実装者・レビュアーは必読）。

## Global Constraints

- 対象は候補004のみ。候補005、Markdown出力、全文再パース、DnD、独自折りたたみ・検索、仮想化、新規保存形式・依存ライブラリは含めない。
- 作業場所は`.worktrees/codex/phase15-outline-editor`。各タスク内ではcommit/pushしない。後続dev-flow-kit `commit-ja`でまとめてConventional Commitsにする。
- 正本は既存`useNodes`の全`nodes`と`layoutMode`。ID、parentId、配列内兄弟順、座標、寸法、importance、illustration、生ラベルを保持し、表示一覧から再構築しない。
- 表示モードは`map | outline`、初期`map`。モードは保存・履歴対象外。中央は一方だけマウントし、アウトラインにwindowショートカットを追加しない。
- 構造APIにはoutlineで全nodesのID集合、mapで従来の`displayState.visibleNodeIds`を渡す。保存・画像出力には従来どおり全件正本を渡す。
- ルート追加は`insertForest([{ label: "", parentIndex: null }], { kind: "root" })`。子・兄弟は末尾追加。削除は`deleteNodeOnly`のみ。各操作は既存APIを1回呼び、複数更新へ分解しない。
- 成功したラベル確定・追加・兄弟移動・階層変更・削除は各1履歴。追加後ラベル確定は別履歴。失敗・draft入力・選択・モード・フォーカスは履歴を増やさない。
- draftは`{ nodeId, documentRevision, originalLabel, text }`。同revision・対象存在・元ラベル一致を確定時に検証し、同期ガードでEnter/blur、Escape/blurの二重処理を止める。
- 通常ボタンのpointerdown→blur確定→clickを保つ。Undo/Redoやモード切り替えのpointerdownでdraftをキャンセルしない。プログラムUndo/Redo・全置換が先にrevisionを変えた場合は古いdraftを破棄する。失敗したUndo/Redoはrevisionを変えない。
- IMEは`nativeEvent.isComposing`と`keyCode === 229`の両方を扱う。repeatで確定・再編集・追加しない。textareaのCtrl/Cmd+Z・Tab/Shift+Tabはネイティブ動作へ委ねる。
- enabled/revision/全ID/nodesの新規propsは必須。dialog時は既存inertと`editorShortcutsEnabled`を共用し、保護モード・マップ変更時は既存editor寿命で終了する。
- 保存は同じ1つの`useMapPersistence`を常時マウントして行う。失敗時も編集を保持し既存通知・JSON救出・flush・競合保護を維持する。独自保存やdebounceは作らない。
- 導出は明示スタックでO(n)時間/O(n)領域。10,000件の幅広い森・10,000段の鎖に新たな正本制限を設けない。全件表示し字下げだけ深さ12で上限にする。
- 全返答・レビュー・通知・説明は日本語。既存APIのformatterを再利用する。各タスクはテストを先に追加しRED→GREENを確認する。
- タスクの引き渡しは本文・本Global Constraints・依存タスクInterfacesを渡す。会話履歴に依存しない。最終`client/npm run verify`成功前に完了を主張しない。

## Review Focus

1. ラベル編集中にUndo/Redoを通常クリックするとblurが先に履歴を積む。変更ありUndoはその1件だけ戻り、変更ありRedoは枝が消えて新ラベルを保つ（Task 5）。
2. 同じIDを再利用したJSON全置換・成功Undo/Redoの後着blurは新正本へ書かない。履歴なしUndo/Redoと区別する（Tasks 2・5）。
3. 非表示の兄弟・子孫と全属性が構造変更や保存で消えず、canvas復帰時のAPIは部分表示集合へ戻る（Tasks 4・5）。
4. IMEの2判定・repeat・Enter後blur・Escape後blurが競合しても1確定以内。ボタンからフォーカスを奪わない（Tasks 2・3）。
5. 再マウント時の旧ズームや非表示キャンバスのリスナーが選択を壊さず、初期縮尺でrevealする。保存失敗でも復帰・JSON救出できる（Tasks 4・5）。

## ファイルと責務

| ファイル | 責務 |
| --- | --- |
| `client/src/domain/outline/outlineRows.ts` | 全件索引・平坦行・構造異常の純粋導出。取り込みparserとは独立 |
| `client/src/hooks/useOutlineLabelDraft.ts` | draftの寿命・1回確定・元ラベル検証。DOM/viewport/保存に依存しない |
| `client/src/hooks/useOutlineEditorActions.ts` | 追加/削除結果、構造操作hook再利用、可否、選択・フォーカス要求 |
| `client/src/components/outline/OutlineEditor.tsx` | 一覧のroving focus、scroll、textareaと局所キー |
| `client/src/components/outline/OutlineToolbar.tsx` | 操作ボタンの表示とdisabled。ドメイン操作は呼出側へ委譲 |
| `client/src/components/layout/EditorViewModeControl.tsx` | 2つのaria-pressed切り替えボタン |
| `client/src/hooks/useOutlineCanvasReturn.ts` | 初期縮尺基準のrevealとrevision付きcanvas focus要求 |
| `client/src/components/map/MapEditor.tsx` | モードと上記の配線、既存通知枠、排他mount、ヘッダー構成 |
| `client/src/components/layout/AppHeader.tsx` | 必須view controlsスロット、canvas説明の表示制御 |
| `client/src/app/__tests__/pageOutlineEditor*.test.tsx` | 実Home→MapEditor→useNodes→保存の結合テスト |

---

### Task 1: 全件の平坦な表示モデル

**Files:** Create `client/src/domain/outline/outlineRows.ts`、Test `client/src/domain/outline/__tests__/outlineRows.test.ts`。

**Interfaces:**
- Consumes: `Node` from `@/types/node`（`id:number; parentId:number|null; label:string`ほか全属性）。入力`readonly Node[]`。
- Produces: `OutlineRow = { nodeId: number; depth: number }`、`OutlineRows = { rows: readonly OutlineRow[]; nodesById: ReadonlyMap<number, Node>; allNodeIds: ReadonlySet<number>; invalidStructure: boolean; duplicateIds: boolean }`、`buildOutlineRows(nodes: readonly Node[]): OutlineRows`。
- `nodesById`は重複時に先頭を保持する。行はIDにつき1回。重複検出時はTask 2/3で編集無効。構造不正時は構造操作無効（重複以外のラベル編集は可）。

- [x] **Step 1: テストを書く。** `keepsRootAndSiblingArrayOrder`は非先行順配列`[子2, 根1, 子1, 根2]`の親IDを与え、結果`[{nodeId:根1,depth:1},{nodeId:子2,depth:2},{nodeId:子1,depth:2},{nodeId:根2,depth:1}]`をassert。同名/空文字を別IDの別行として保持し、freezeした入力の全属性が不変とassert。
- [x] **Step 2: RED確認。** `cd client && npm test -- --runInBand --runTestsByPath src/domain/outline/__tests__/outlineRows.test.ts`。未定義module/exportでFAIL。
- [x] **Step 3: 最小実装。** 親→子ID列・ID索引を1度構築。ルートと子を元配列順、逆順pushの明示スタックとvisitedで巡回。未訪問は元配列順で深さ1として末尾へ一度ずつ付加、`invalidStructure=true`。循環/自己参照/親不在/重複は不正扱い。fallbackで子を辿り直して別順にしない。
- [x] **Step 4: 境界テストを追加しRED→GREEN。** `handlesTenThousandRootsAndDeepChain`は各10,000行、鎖末尾depth=10,000、各ID1回。`reportsOrphanCycleAndDuplicateWithoutMutation`は停止・不正フラグ・fallback順・重複フラグをassert。時間閾値の不安定テストではなく全配列filterの反復・再帰がないことを品質レビューで確認。
- [x] **Step 5: Step 2と同コマンドで全PASS、独立した仕様/品質レビューを通す。** commitしない。

### Task 2: draftとアウトライン操作の状態管理

**Files:** Create `client/src/hooks/useOutlineLabelDraft.ts`、`client/src/hooks/useOutlineEditorActions.ts`。Test `client/src/hooks/__tests__/useOutlineLabelDraft.test.tsx`、`client/src/hooks/__tests__/useOutlineEditorActions.test.tsx`。

**Interfaces:**
- Consumes: Task 1 `OutlineRows`。`type NodesApi = ReturnType<typeof useNodes>`を型のみimportし、既存API型の複製をしない。
- Produces: `OutlineLabelDraft = { nodeId:number; documentRevision:number; originalLabel:string; text:string }`。
- `useOutlineLabelDraft(options: { nodes: readonly Node[]; documentRevision:number; enabled:boolean; duplicateIds:boolean; updateNodeLabel:NodesApi["updateNodeLabel"]; publishNotice:(notice:OperationNotice)=>void })`は`{ draft:OutlineLabelDraft|null; begin:(nodeId:number, initialLabel?:string)=>void; setText:(text:string)=>void; commit:()=>number|null; cancel:()=>number|null; invalidate:()=>void }`を返す。commit/cancelは処理した対象ID、処理済み/無効ならnull。initialLabelは追加成功直後の未反映IDに空文字draftを作る専用入口。次の描画で存在を検証する。
- `OutlineFocusRequest = { target: {kind:"row"; nodeId:number} | {kind:"root-add"}; documentRevision:number; sequence:number }`。
- `UseOutlineEditorActionsOptions = { nodes:readonly Node[]; selectedNodeId:number|null; documentRevision:number; enabled:boolean; model:OutlineRows; api:Pick<NodesApi,"selectNode"|"updateNodeLabel"|"insertForest"|"addChildNode"|"addSiblingNode"|"reorderSibling"|"changeNodeIndent"|"deleteNodeOnly">; expandNodes:(ids:readonly number[])=>void; publishNotice:(notice:OperationNotice)=>void }`（全項目必須）。
- `useOutlineEditorActions(options)`の戻り値を`OutlineEditorActions`としてexport: `{ draft:OutlineLabelDraft|null; focusRequest:OutlineFocusRequest|null; canAddRoot:boolean; canAddRelated:boolean; canEdit:boolean; canMoveUp:boolean; canMoveDown:boolean; canIndent:boolean; canOutdent:boolean; canDelete:boolean; select:(id:number)=>void; beginEdit:(id:number)=>void; setDraftText:(text:string)=>void; finishEdit:(restoreFocus:boolean)=>void; cancelEdit:()=>void; invalidateDraft:()=>void; addRoot:()=>void; addChild:()=>void; addSibling:()=>void; move:(direction:SiblingReorderDirection)=>void; changeIndent:(direction:NodeIndentDirection)=>void; deleteSelected:()=>void }`。

- [x] **Step 1: draftテストを書く。** 生文字列`" \t本文\n次行 "`を保持し入力中update=0、commit→blur相当のcommit×2でupdate=1、変更なしupdate=0、cancel→commitで0。revision変更/対象削除/同revision元ラベル変更で古い確定=0＋通知。成功Undo/Redoを伴うrevision更新と、失敗してrevision不変のケースを別テストにする。
- [x] **Step 2: RED。** `cd client && npm test -- --runInBand --runTestsByPath src/hooks/__tests__/useOutlineLabelDraft.test.tsx src/hooks/__tests__/useOutlineEditorActions.test.tsx`。新module不在でFAIL（操作テストもStep 4の最初の1件を書いておく）。
- [x] **Step 3: draftを実装。** 最新optionsと処理済みdraftをrefで参照し同期的に確定/破棄を一元化。revision/存在/元ラベルを更新前に検証。enabled=false、unmountで書き込みせず失効する。非同期確定を作らず、通常blurは同期commitする。React effect完了待ちを二重保存防止の条件にしない。
- [x] **Step 4: 操作テストを追加。** 根/子/兄弟成功はAPI各1回・新IDへ編集、null/失敗は選択・draft開始・focus発行なし。空マップの可否、端/先頭/ルートのdisabled、孤立時は構造不可・重複時編集不可。reorder/indent/deleteにはmodel.allNodeIdsの全件集合を渡す。削除成功は選択APIを勝手に再選択せず先頭行へfocusだけ、空ならroot-add。削除失敗はfocus/選択を維持しformatter通知。各実行でenabledと不正フラグを再確認する。
- [x] **Step 5: 操作hookを実装。** `useSiblingReorderAction`、`useNodeIndentAction`へ全件集合を渡して可否/通知を再利用する。削除は成功結果が必要なので既存`canDeleteNodeOnly`・`formatNodeOnlyDeletionFailureNotice`と単一`deleteNodeOnly`を利用（既存void戻りのhookを無理に変更しない）。根失敗は`formatOutlineInsertFailure`、子/兄弟nullは`formatOutlineInsertFailure("placement-failed")`。通知は既存treeEdit枠へ渡す。追加成功から空draft開始までの同期処理を1入口にする。
- [x] **Step 6: Step 2コマンドで全PASS、独立仕様/品質レビュー。** UI状態に正本の選択のコピーがないこと、結果を見ず編集を開いていないことを確認。commitしない。

### Task 3: 平坦リスト・操作ツールバーと局所キー操作

**Files:** Create `client/src/components/outline/OutlineEditor.tsx`、`client/src/components/outline/OutlineToolbar.tsx`、Test `client/src/components/outline/__tests__/OutlineEditor.test.tsx`。

**Interfaces:**
- Consumes: Tasks 1・2の型。
- Produces: `OutlineEditorProps = { nodes:readonly Node[]; model:OutlineRows; selectedNodeId:number|null; documentRevision:number; enabled:boolean; actions:OutlineEditorActions }`と`OutlineEditor(props:OutlineEditorProps)`。`OutlineToolbar({actions, enabled, selectedNodeId, rootAddButtonRef}:{actions:OutlineEditorActions;enabled:boolean;selectedNodeId:number|null;rootAddButtonRef:RefObject<HTMLButtonElement|null>})`。すべて必須。MapEditorではhookを所有しUIへ渡す。
- 選択ボタンの名前は`階層${depth}・${getNodeDisplayLabel(label)}`、`aria-pressed`を選択状態とする。ボタン表示も実深さを示す。textarea名は`ラベル編集`。操作名は「ルート追加」「子を追加」「兄弟を末尾に追加」「ラベル編集」「1つ上」「1つ下」「階層を下げる」「階層を上げる」「ノードだけ削除」。

- [x] **Step 1: テストを書く。** `rendersAllRowsAndRovingEntry`で全件・順序・階層と選択aria、Tab入口1個（選択行、なければ先頭）、長文/空ラベルをassert。選択行のscrollIntoViewは初回/選択変化だけ、rerenderで重複しない。初回にモードボタンからfocusを奪わない。
- [x] **Step 2: RED。** `cd client && npm test -- --runInBand --runTestsByPath src/components/outline/__tests__/OutlineEditor.test.tsx`。未実装でFAIL。
- [x] **Step 3: 表示とツールバーを実装。** 再帰しない`ol/li`と索引を使う（毎行nodes.findをしない）。字下げは`Math.min(depth,12)`基準でclamp。`min-w-0/min-h-0`・折返し・一覧内縦scroll・折返すtoolbar。説明は「折りたたみや表示の細かさに関係なく、すべてのノードを表示します。兄弟追加は末尾に追加します。」、空は「ノードがありません」、削除は子孫を残す旨を示す。不正構造通知は見える領域に表示し正本を修復しない。
- [x] **Step 4: 入力/キーのテストを先に追加しRED。** 行↑↓Home/Endがfocusと共通選択を変更。Enter/F2/ダブルクリック/toolbarで同一編集開始、Spaceは通常選択。textarea Enter確定・Shift+Enter改行・Escape破棄・blur確定。`isComposing:true`と`keyCode:229`を個別にEnter/Escapeへ与え処理なし。repeatで確定/再編集/追加しない。Ctrl/Cmd+Z、Tab/Shift+Tab、textareaのDelete/Backspace、toolbar↑↓はpreventDefaultや構造呼出なし。
- [x] **Step 5: 局所ハンドラを実装。** キーは行ボタンとtextareaで分離し、Enter/Spaceのネイティブclickと編集を二重実行しない。確定/キャンセル後は対象行へfocus、blur起因では`finishEdit(false)`で次のボタンから奪わない。別行クリックは前行blur確定→次行select。削除後requestに応じ先頭行/root-addへfocus、revisionとsequenceで古い要求を無視。enabled=false時もイベントから操作不能にする。
- [x] **Step 6: 反復focus・同じ行再要求・削除後・空・disabled・buttonへblurする順序のテストを追加し、Step 2で全PASS。** 独立仕様/品質レビュー。commitしない。

### Task 4: MapEditorの表示モード・canvas復帰reveal

**Files:** Create `client/src/hooks/useOutlineCanvasReturn.ts`、`client/src/components/layout/EditorViewModeControl.tsx`、Test `client/src/hooks/__tests__/useOutlineCanvasReturn.test.tsx`、`client/src/components/map/__tests__/MapEditorOutline.test.tsx`。Modify `client/src/components/map/MapEditor.tsx`、`client/src/components/layout/AppHeader.tsx`、`client/src/hooks/useMapResolutionFilter.ts`、`client/src/hooks/mapResolutionFilterState.ts`、`client/src/hooks/useNodeSearchNavigation.ts`、`client/src/hooks/__tests__/useNodeSearchNavigation.test.ts`、`client/src/hooks/useRevisionScopedNodeRequest.ts`、`client/src/hooks/__tests__/useRevisionScopedNodeRequest.test.tsx`と既存解像度テスト・AppHeader呼出テスト。

**Interfaces:**
- Consumes: Tasks 1〜3。既存`resolveNodeSearchReveal({index,collapsedNodeIds,resolutionVisibleNodeIds,nodeId})`、`useRevisionScopedNodeRequest(documentRevision)`の`request/issueRequest`、`resolveResolutionLevel(mode,scale,previousLevel)`、`collectVisibleNodeIds(nodes,level)`。
- Produces: `EditorViewMode = "map" | "outline"`と`EditorViewModeControl({mode,onChange}:{mode:EditorViewMode;onChange:(mode:EditorViewMode)=>void})`（型は同ファイルexport）。
- `useOutlineCanvasReturn(options: { nodes:readonly Node[]; selectedNodeId:number|null; documentRevision:number; collapseIndex:NodeCollapseIndex|null; collapsedNodeIds:ReadonlySet<number>; resolutionMode:ResolutionFilterMode; expandNodes:(ids:readonly number[])=>void; setResolutionMode:(mode:ResolutionFilterMode)=>void; publishNotice:(notice:OperationNotice)=>void; issueFocusRequest:(nodeId:number)=>void })` → `{ returnToCanvas:()=>void }`。
- canvas focusの発行元はMapEditorに置く**1つの**`useRevisionScopedNodeRequest(documentRevision)`に統一する。`useNodeSearchNavigation`のoptionsへ必須`issueFocusRequest:(nodeId:number)=>void`を追加し、hook内の`useRevisionScopedNodeRequest`と戻り値`focusRequest`を削除する（戻り値は`{navigateToNode,notice}`）。同じissuerを検索hookと復帰hookへ必須注入し、両者は独自sequence・focus要求を持たない。既存検索hookテストはharness内でissuerを作り、navigationの戻り値とissuer.requestを合成して既存assertを維持する。
- `useRevisionScopedNodeRequest(documentRevision)`の戻り値へ`clearRequest:()=>void`を追加する。clearはstored requestをnullにするだけで、単調増加sequenceをリセット・増加しない。sequenceカウンタをstored requestとは独立したrefに保持し、`issueRequest`のイベント入口で1回増加してからstateへ要求を設定する（state updater内部でrefを増加しない）。既存のrevision不一致時の非表示・revision変更後も採番継続・同revisionでcallback安定を維持する。同一イベント内のclear→issueでも最後の新requestを保持し、clear→clearは冪等。選択・revision・履歴は変更しない。
- `useMapResolutionFilter`の戻り値へ`resetViewportScale:(scale:number)=>void`を追加する。`ResolutionFilterAction`に`{type:"resetViewport"; level:ResolutionLevel; pendingScale:number|null}`を追加し、現在のmodeを保って`previousAutoLevel/pendingResetScale`だけ更新する。callbackは`resolveResolutionLevel("auto",scale,null)`をlevelに、現在のprops.scaleと異なる間だけscaleをpendingScaleにする。復帰ハンドラは`INITIAL_VIEWPORT.scale`でこれを呼ぶ。JSON全置換の既存reset動作は維持する。
- `AppHeader`に必須`viewControls:ReactNode`、`showCanvasHints:boolean`を追加。後者falseでは`LayoutModeOperationHint`を描かない。全本番呼出・テストを更新する。MapEditorの既存外向けpropsは変更しない。

- [x] **Step 1: reveal/mountのテストを書く。** 初期map、outline切替でMapStage DOM消滅、map復帰で再mount。outline中のwindowキー/clipboard/contextmenuが古いcanvasを操作しない、選択がhidden resetで消えない。復帰時選択の祖先展開/必要level/非検索文言/revision focus要求をassert。旧scaleが小さくても`INITIAL_VIEWPORT.scale`でvisible集合を計算し、不要なlevel固定を起こさない。`outlineReturnThenFirstSearchFocusesBoth`は復帰時sequence=1で1回中央移動、そのMapStageをマウントしたまま初回検索でsequence=2となり別対象へ1回移動するとassert。`searchThenOutlineReturnThenSearchNeverReusesSequence`は検索1→outline復帰2→次検索3をassert。共通issuer＋両操作hook＋実`useNodeFocusRequest`の結合harnessでも移動回数・対象・同request再描画で再移動なしを検証する。
- [x] **Step 2: clearのテストも先に追加しRED。** issuerユニットではissue(A)=seq1→clear=request null→clear=null→issue(B)=seq2、同一actのclear→issue(C)=seq3、revision変更後issue=seq4をassert。`doesNotReplaySearchAfterSelectedOutlineNodeWasDeleted`は検索A→outlineで別ノードB選択→Bだけ削除→選択null/A残存/revision不変→map復帰を通し、再マウントした実focus consumerでAへの移動0回、渡されるrequest=nullをassertする。その後の有効検索Aでは新sequence=2で移動1回とする。無効な選択IDで復帰した場合も古い要求を再生しない。Run: `cd client && npm test -- --runInBand --runTestsByPath src/hooks/__tests__/useRevisionScopedNodeRequest.test.tsx src/hooks/__tests__/useOutlineCanvasReturn.test.tsx src/hooks/__tests__/useNodeSearchNavigation.test.ts src/components/map/__tests__/MapEditorOutline.test.tsx`。
- [x] **Step 3: 復帰hookを実装。** 初期縮尺の`resolveResolutionLevel(resolutionMode, INITIAL_VIEWPORT.scale, null)`→`collectVisibleNodeIds`をrevealへ渡す。ヒステリシスの前回level/旧viewportを持ち込まない。展開と必要level設定後にfocus要求。文言は「選択したノードを表示するため、祖先の枝を展開しました。」と必要levelの案内（既存`RESOLUTION_LEVEL_LABELS`）、検索結果とは言わない。無効選択/nullでは要求なし。
- [x] **Step 4: issuerのclearとMapEditorを配線。** 上記clear契約を実装してmode stateを保存外で持つ。outline model/actionsを正本nodes/revision/`enabled = editorShortcutsEnabled && mode === "outline"`で接続。通常clickで実際にmodeを変えるときは、方向にかかわらず共通issuerの`clearRequest()`を先に呼ぶ。mapへ戻す場合は続けてscaleを`INITIAL_VIEWPORT.scale`へ揃え、returnToCanvasで有効選択がある場合のみ新要求を発行し、最後にmodeをmapへ変える。同じイベント内のclear→新要求→mountを一緒に反映し、MapStage再mount前に旧要求を確実に失効させる。検索と復帰へ同じ`issueFocusRequest`を渡し、MapStageへその単一issuerの`request`を渡す。source選択stateや別requestのsequence比較・付け替えを導入しない。既存`useNodeFocusRequest`はsequenceだけで正しく重複排除できる。
- [x] **Step 5: ヘッダーを分岐。** 常時: map管理、view、配置、importance、履歴、JSON、画像、箇条書き取り込み、通知。mapだけ: 検索、解像度、collapse、構造・枝操作、clipboard説明とcanvasヒント。AppWorkspace.sidePanelは同じIllustrationPanel。`useMapPersistence`と`useMapHistoryShortcuts`は各1つを維持。mapの既存構造hooksには従来表示集合を渡し続け、outlineは別actionsの全件集合を使う。`resetViewportScale(INITIAL_VIEWPORT.scale)`でautoの前回levelを初期縮尺へ揃える。旧scale=0.5/auto/highから初期scale=1/allへ更新、手動highはhighのまま、JSON全置換の既存resetは不変、という既存hook/reducerのテストを先に追加してRED→GREENを確認する（JSON全置換用resetRevisionを流用して他のUIを初期化しない）。
- [x] **Step 6: Step 2をGREEN。** map/outline切替で履歴・座標が不変、同map JSON全置換ではmode維持してdraft/focus失効、map変更はkey再mountでmap初期へ、disabled/dialog時操作不能、illustration選択共用をassert。独立仕様/品質レビュー。commitしない。

### Task 5: 実Homeからの往復・履歴・保存の受け入れテスト

**Files:** Create `client/src/app/__tests__/pageOutlineEditor.test.tsx`、`client/src/app/__tests__/pageOutlineEditorHistory.test.tsx`、`client/src/app/__tests__/pageOutlineEditorLifetime.test.tsx`。Modify Tasks 2〜4の実装（テストで明らかになった配線修正のみ）、必要なら`client/src/app/testing/pageTestHelpers.ts`へ重複しない利用補助を追加。

**Interfaces:**
- Consumes: 既存`renderPage/headerButton/exportedMap/storedMap/v3Json` from `@/app/testing/pageTestHelpers`、`seedMapLibrary`、`mapStageTestRuntime`。実Home・MapEditor・useNodes・履歴・保存はmockしない。Pixi/画像生成/ダウンロード/ラスタ化だけ既存pageテストと同じ境界で差し替える。
- Produces: 新しい本番APIなし。通常clickの順序は`userEvent.setup().click(button)`で実pointerdown→blur→clickを通す。`fireEvent.click`だけで履歴順を検証しない。

- [x] **Step 1: 往復テストを書く→対象単体で実行。** mapで作った親子→outline全件→ラベル/兄弟順/indent/outdent→mapへ戻し、表示とJSON/保存の変更箇所を比較。隠れた兄弟/子孫にimportance/illustration/座標/寸法を持たせ、collapse/重要度highからoutlineで全件編集、非変更フィールドが完全一致することをassert。manual構造操作で許される座標変更とラベル/選択/modeだけでは座標不変を別assertにする。
- [x] **Step 2: 履歴テストを書く→実行。** 各操作前後snapshotを取りUndo1回で根追加/子追加/兄弟追加/並べ替え/indent/outdent/delete/labelがそれぞれ戻り、Redo1回で再適用。追加+labelはUndo2回で戻る。失敗はUndo回数増加なし。削除は子孫全属性を保持しfocusのみ先頭、選択null。入力中は履歴0。
- [x] **Step 3: 通常clickの回帰テストを書く→実行。** 編集前履歴を用意し、変更ありdraft＋Undo clickはラベル確定だけ戻す。Redo枝のある状態で変更ありdraft＋Redo clickは先行確定で枝消失し新ラベル維持。変更なしdraft＋Undo/Redo clickは新しい履歴なしで元の履歴へ進む。モードボタンclickもblur確定後切替。押下前draft取消ハンドラが無いことをレビューする。
- [x] **Step 4: 寿命/保存テストを書く→実行。** プログラムUndo/Redo先行成功・同ID JSON全置換・対象削除後の古いblurは上書き0。Undo/Redo不成立でrevision不変ならdraft維持し通常確定。外側dialog/取り込み/枝移動中inert、別map・保護モード遷移、unmountで後着イベントが書かない。既存生成のid/revision/元ラベル検証がoutlineラベル変更後も古い画像をattachしない。
- [x] **Step 5: 保存失敗と集合切替をテスト。** MapEditorの実storage結合では`createTestStorageSession({initialJson})`→`setWriteOutcome("failed")`を用い編集保持・失敗通知・JSON書出しをassert。Homeでは既存保存失敗fixtureを使いシェルの保護/flushを通す。outline構造操作は隠れた全件を扱い、map復帰後同操作では従来visible集合に制限される挙動をassert（ドメインmockだけの検証で済ませない）。
- [x] **Step 6: 必要な不具合の最小修正とGREEN確認。** `cd client && npm test -- --runInBand --runTestsByPath src/app/__tests__/pageOutlineEditor.test.tsx src/app/__tests__/pageOutlineEditorHistory.test.tsx src/app/__tests__/pageOutlineEditorLifetime.test.tsx src/components/map/__tests__/MapEditorOutline.test.tsx`。テストが既にPASSする受け入れケースは既存動作の根拠として記録し、REDを捏造しない。独立仕様/品質レビューでGlobal Constraintsと全受け入れ項目を照合。commitしない。

**Task 5の実施記録（2026-11-03）:** Step 1〜5の受け入れテストは本番実装のままPASSし、本番不具合のREDは検出していない。初回失敗はfixture/queryの不備で、本番REDに数えない。Step 4の失敗Undo/Redoは独立レビュー指摘を受け、disabledボタンの範囲を正しく限定したうえで、実`useNodes` APIを呼ぶ結合テストを追加してrevision不変・draft維持を確認した。Step 6は本番修正不要でGREEN、独立仕様/品質レビューの指摘も解消済み。詳細は`.superpowers/sdd/2026-11-03-outline-editor/task-5-report.md`。

### Task 6: ブラウザ確認・ROADMAP・最終検証

**Files:** Modify `ROADMAP.md`、`README.md`、`docs/README.md`、`docs/specifications/features.md`、`docs/specifications/api.md`、`docs/architecture/overview.md`、`docs/testing/browser-test-cases.md`、本計画の進捗。ブラウザで見つかった問題のみ対応するFilesとテストを追加。

**Interfaces:**
- Consumes: Tasks 1〜5の完成UI/テスト、既存`npm run verify`（tailwind scan→lint→typecheck→Jest全件→build）。
- Produces: 候補004の完了状態、検証証跡、次の候補005を維持したROADMAP。新しい本番APIなし。

- [ ] **Step 1: ブラウザ受け入れ。** `cd client && npm run dev`で起動し、長文・狭幅/toolbar折返し・深さ12超の字下げ/実深さ・日本語IME・Enter/Escape/blur・Tab入口・dialog復帰・一覧scroll・選択行scrollを実画面で確認。10,000行の森/鎖はUIで全行保持・スクロール・選択を確認（fixtureは一時データ、リポジトリへ大きなJSONを追加しない）。操作感が実用的でない場合はscope再評価として報告し、件数を黙って切り捨てない。必要な修正は再現テストRED→修正→GREEN後に再レビュー。
- [x] **Step 2: 既存機能文書を実装と照合して更新。** `features.md`にアウトライン操作・全件表示・キー・通常Undo click・失敗通知・保存外状態を追加し、既存canvasキーの適用モードを明記する。`api.md`に実装した表示モデル・draft/actions・復帰hook・検索の必須共通issuerと変更後署名を記載する。`overview.md`に排他mount・単一正本/保存/履歴・focus issuer共有の責務を反映する。`README.md`の主要機能と`docs/README.md`の導線/概要に完成内容を反映する。`browser-test-cases.md`はU節の次にV節を追加し、往復、全件/属性保持、Enter/IME/repeat、通常Undo/Redo click、復帰→初回検索と検索→復帰、寿命/保存失敗、狭幅/長文、10,000行の準備・手順・期待値を記載する。実施日/結果/未実施は実際の確認内容に合わせ、未確認IME/性能を確認済みにしない。保存形式や候補005に新機能があるとは書かない。
- [x] **Step 3: ROADMAP更新。** 候補004のみ`[x]`、Phase15を進行中、現在地に004完了と005未着手、次の未完了を候補005「Markdown・箇条書きへの書き出し」にする。「Phase15〜39未着手」の記載はPhase16〜39未着手へ修正。最終更新を実装完了日（作業日が変わったらその日）にする。候補005は未完了のまま。
- [x] **Step 4: 最終検証。** `cd client && npm run verify`を実行しexit 0・全工程成功を確認する。失敗したら原因を切り分け、変更を再レビューし必要なテストから再実行する。ドキュメントだけを対象に無意味なREDテストは作らない。
- [x] **Step 5: 独立仕様/品質最終レビュー。** spec受け入れ1〜9・本Review Focus・機能文書とROADMAPの実装一致・公開propsの全配線を確認。未解決は完了としない。検証コマンド/結果とブラウザ確認（実施/未実施）を引き渡す。タスクcommitせず、feature後続`refactor-srp → review-loop → commit-ja`へ進める。

**今回の受入条件調整（2026-11-03）:** Step 1は一部のみ実施。実ブラウザで確認できなかった長文・深木・狭幅・実IME・10,000行DOMの全件保持と操作感などは未確認のまま記録し、Step 1を`[x]`にしない。file chooser操作が自動承認レビューのusage limitで拒否されたため、今回の実装完了判定は実測済み範囲、Tasks 1〜5の受け入れ自動テスト、Step 4の`npm run verify`成功、Step 5の独立仕様/品質レビューで行う。Step 5の「未解決」は実装・文書の指摘を指し、上記の未実施ブラウザ項目は残る検証課題として明示して後続へ引き渡す。後日の実機確認で問題が見つかればscopeを再評価する。

## 計画セルフレビュー

- 設計の表示/操作/選択/編集/寿命/保存/深木/受け入れ1〜9をTasks 1〜6へ割当済み。
- `OutlineRows`・draft・actions・focus要求・propsは上記Interfacesの名前と型を下流で共用する。既存操作型は`ReturnType<typeof useNodes>`から取得する。
- 既存void操作hookと削除結果の差を明示し、削除成功focusを結果確認なしで発行しない。
- 通常blur順、失敗Undoのrevision不変、全件集合からmap集合への切替、初期縮尺reveal、1万段の非再帰を明示した。
- 独立レビュー指摘によりcanvas focusを単一issuerへ統一した。復帰と検索のsequence衝突を両方向で検証し、既存機能文書/API/アーキテクチャ/README/実ブラウザ手順を最終タスクに含めた。
- 再レビュー指摘によりissuerに採番を維持するclear契約を追加した。mode変更前に旧要求を破棄し、選択削除後の再mountで過去の検索要求を再生しないこと、その次の検索が新sequenceで処理されることをTask 4の回帰に固定した。
- feature commandに従い、計画は独立レビューと自動承認へ引き渡す。実行方式はAGENTS.mdの逐次サブエージェント駆動に固定し、ここでユーザーへ方式選択/確認待ちを追加しない。
