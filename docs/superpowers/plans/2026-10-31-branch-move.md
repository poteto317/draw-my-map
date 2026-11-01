# 枝の切り取り・移動 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。タスクごとの実装と別エージェントの仕様・品質レビューを順番に行う。コミットは後続のcommit-jaまで行わない。

**Goal:** 枝を同一マップの別の親・ルート、または別マップのルートへデータを失わず移動する。
**Architecture:** 純粋な枝変換、復旧可能な保存トランザクション、ライブラリ操作、ダイアログを分離する。useNodesは1履歴操作、useMapLibraryはセッション切り替えを担当。
**Tech Stack:** React / TypeScript / Jest / localStorage（依存追加なし）。
**Spec:** docs/superpowers/specs/2026-10-31-branch-move-design.md

## Global Constraints
- 日本語UI・通知・コメント。依存追加なし。候補016のみ。
- 全子孫・全属性を保持。同一マップではID保持、別マップではID再採番。失敗時は枝を消さない。
- 同一マップはUndo1回。別マップは成功後移動先を開きUndo履歴をリセットし、その旨を実行前に表示。
- 保存順序はjournal→target→source→index→journal削除。中断は起動時に原本復元。復元失敗はjournal保持・保護モード。nullと既存値を区別。
- エディタの最新状態とセッション世代を使い、成功前に表示切り替えない。
- ダイアログのinert、focus trap、ショートカット停止、dblclick抑止を既存方式で維持。
- TDD（テストRED→実装→GREEN）。コミットしない。各タスクのテストと最後にclient/npm run verify。
- 知見L-001/003/035/037/103/060/061/150/155/453/537を守る。

## Review Focus
- 隠れた子孫や画像を含む枝を移す: Task1で属性・内部順序を確認。
- 保存領域の不足と復元自体の失敗: Task2で各段階のfault injectionと再起動を確認。
- ダイアログを開いた後の置換・古いセッション: Task3/4で無変更を確認。
- 別マップの本体が未存在と破損: Task3でnullだけ空と扱うことを確認。
- 実際のHomeから確定後に旧autosaveが走る: Task4で統合テスト、Task3でABAを確認。

---

### Task 1: 枝移動の純粋変換と同一マップ履歴
**Files:** Create `client/src/domain/nodes/nodeBranchMove.ts`, `client/src/domain/nodes/__tests__/nodeBranchMove.test.ts`, `client/src/hooks/__tests__/useNodesBranchMove.test.ts`; Modify `client/src/hooks/useNodes.ts`。必要な型は同domainでexport。
**Interfaces:**
- Produces `moveNodeBranch(nodes: readonly Node[], rootId: number, parentId: number | null, mode: NodeLayoutMode): BranchMoveResult`。成功 `{ok:true,nodes:Node[],rootId:number}`、失敗 `{ok:false,reason:"missing-node"|"invalid-parent"|"same-parent"|"placement-failed"}`。
- Produces `transferNodeBranch(source: NodeMapState, target: NodeMapState, rootId: number): BranchTransferResult`。成功 `{ok:true,source:NodeMapState,target:NodeMapState,rootId:number}`、失敗は同じreason union。両方の自動配置もここで計算する。ID採番は既存allocatorを使い衝突を避ける。
- Produces useNodes `moveBranch(rootId:number,parentId:number|null): Omit<成功,"nodes"> | 失敗`（型別名をexportしてよい）。既存applyTreeChangeWithOutcomeを使い一回の履歴へ確定。成功時のみ根を選択。
- Consumes `collectSubtreeIds`, `calculateIndentTranslation`, `translateBranch`, `insertNodeSubtree`, `layoutNodeForest` 等既存domain。
- [x] テストを先に追加: 任意親/ルート/最後の兄弟、非連続配列と隠れた子孫、ID・ラベル・重要度・画像・枝内順序保持、循環/不存在/同親拒否。手動位置とauto両モード、有限座標失敗で入力不変。transferの衝突再採番、最後の枝を移すと空、target layout保持。
- [x] `cd client && npm test -- --runInBand src/domain/nodes/__tests__/nodeBranchMove.test.ts src/hooks/__tests__/useNodesBranchMove.test.ts` のREDを確認。
- [x] 純粋関数とhookのmoveBranchを実装。rootへの手動移動は残ったnodesの下へcalculateManualOffsetYで平行移動。元親と同じなら拒否。
- [x] 上記をGREEN。同一イベント内の連続変更が失われないこと、1回Undo/Redo、失敗時履歴・選択不変を確認。報告には実行コマンドと件数。

### Task 2: マップ間移動の保存と復旧
**Files:** Create `client/src/services/persistence/branchMoveTransaction.ts`, `branchMoveJournal.ts` と各 `__tests__/*.test.ts`; Modify `mapLibraryStartupRunner.ts` とそのテスト。
**Interfaces:**
- Produces `BranchMoveWriteInput = {sourceId:string,targetId:string,sourceBefore:string|null,targetBefore:string|null,indexBefore:string,sourceAfter:string,targetAfter:string,indexAfter:string}`。
- Produces `writeBranchMove(storage:MapLibraryStorage,input:BranchMoveWriteInput): {ok:true}|{ok:false,error:string,recoveryRequired:boolean}`。
- Produces `recoverBranchMove(storage:MapLibraryStorage): {kind:"none"|"recovered"}|{kind:"blocked",initialJson:string|null,mapId:string,mapName:string,error:string}`。
- Journal key `draw-my-map.branch-move.v1`、version1の厳密codec。任意キーの復元は禁止し、sourceId/targetIdからmapBodyKeyでキーを導く。両IDの妥当性/非同一、原本indexの整合を検証。
- Consumes existing storage/index codec。Task3がwriteを使い、startup runnerは通常のstartup計画より前にrecoverを呼ぶ。
- [x] RED tests: 正常順序とjournal消去、原本照合不一致で無書き込み、既存journalがある時拒否、journal/target/source/index/最終removeの各失敗、null targetをremoveで復元、既存targetを原文復元、rollback失敗の全復元試行とjournal保持、途中journalから再起動復元、二度復元、破損journal/読取失敗で保護モード。
- [x] `cd client && npm test -- --runInBand src/services/persistence/__tests__/branchMove*.test.ts src/services/persistence/__tests__/mapLibraryStartupRunner.test.ts` でRED。
- [x] codecとtransaction/recoveryを実装。失敗時は書いたキーを戻し、復旧時は3原本を戻す。復元完了後のみjournal削除。容量を空けるため先に拡大したtargetを元へ戻してからsourceを復元してよい。rollbackが一つ失敗しても残りを試行。
- [x] startup統合。blockedは通常の初期化・migrationを書かず既存protected結果へ変換。読み取れるjournal原本を表示し日本語で書き出しを案内。全対象テストGREEN。

### Task 3: ライブラリからマップ間移動
**Files:** Create `client/src/services/persistence/mapBranchTransfer.ts`, `client/src/services/persistence/__tests__/mapBranchTransfer.test.ts`, `client/src/hooks/__tests__/useMapLibraryBranchMove.test.tsx`; Modify `client/src/hooks/useMapLibrary.ts`（必要なら専用hookへ調整責務を抽出）。
**Interfaces:**
- Consumes Task1 transferNodeBranch、Task2 writeBranchMove。
- Produces service `transferStoredBranch(storage:MapLibraryStorage,index:MapIndexV1,sourceId:string,targetId:string,rootId:number,now:Date): {ok:true,index:MapIndexV1,rootId:number}|{ok:false,error:string,recoveryRequired:boolean,sourceJson:string|null}`。
- Produces useMapLibrary `moveBranchToMap(sourceSession:MapStorageSession,targetId:string,rootId:number): MapLibraryOperationResult`。sourceSessionのオブジェクト同一性と最新libraryを比較して古い呼出を拒否。flush成功後に最新indexを再読、service実行。成功後のみcommitNewSession。回復不能は旧セッション無効化・原本のprotected sessionに遷移。
- [x] RED: 保存前ラベル変更と全子孫がtargetへ入る、移動元からのみ消える、target null/破損/読取失敗、同一マップ・削除済み・古いsourceSession・ABA・flush失敗で無変更。旧session write/registerFlushを成功後と保護化後に拒否。復元済み失敗なら現在セッション維持。日時とcurrentMapIdが成功時に両方更新。
- [x] `cd client && npm test -- --runInBand src/services/persistence/__tests__/mapBranchTransfer.test.ts src/hooks/__tests__/useMapLibraryBranchMove.test.tsx` のRED。
- [x] serviceとhookを実装。JSON parse/serializeは既存codec、source/target layoutと画像等属性を保持。protected transitionで古いeditorが残っていても書けないよう世代を進める。
- [x] 全対象GREEN。厳密にflush callbackの登録を確認してからflush失敗のテストを実行する。

### Task 4: 枝移動ダイアログと画面への接続、ロードマップ
**Files:** Create `client/src/components/layout/BranchMoveDialog.tsx`, `client/src/hooks/useBranchMoveDialog.ts` と各テスト; Modify `client/src/components/map/MapEditor.tsx`, `client/src/app/page.tsx`, 両者のテスト、`ROADMAP.md`。操作ボタンは必要なら独立component。
**Interfaces:**
- Consumes useNodes.moveBranch、useMapLibrary.moveBranchToMap。
- MapEditorの必須propsとして `mapMoveTargets: readonly {id:string;name:string}[]`, `onMoveBranchToMap:(rootId:number,targetMapId:string)=>MapLibraryOperationResult` を追加。Homeは現在のstorageSessionを束縛して実callbackを接続。MapEditor keyにstorageModeを含め、protected遷移時に原本を再読する。
- useBranchMoveDialogは固定sourceId/revision、画面open/close、候補選択、確定結果、focus requestを所有。BranchMoveDialogは表示とfocus trapのみ。UIのparentは同一map時だけ表示、current parent/self/descendantsは候補から除外。
- [x] RED: 未選択disabled、同一map親/ルートへの移動、キャンセル無変更、別map選択時のUndo注意表示とroot説明、失敗で開いたまま、revision変更で古い操作無効、Escape/focus/inert/shortcut停止/dblclick時刻更新。
- [x] `cd client && npm test -- --runInBand src/components/layout/__tests__/BranchMoveDialog.test.tsx src/hooks/__tests__/useBranchMoveDialog.test.tsx src/components/map/__tests__/MapEditor.test.tsx src/app/__tests__/pageBranchMove.test.tsx` のRED。既存test構造に合わせファイル拡張可。
- [x] UI実装・Home接続。別mapは成功後remount、同一mapは成功時だけclose/通知・移動先祖先展開・必要時全表示。documentRevision変更時はcloseまたは確定無効化し stale sourceを使わない。
- [x] 実Home統合テストで保存前編集→別map移動→target表示→sourceを再度開いて枝なし、戻る履歴なしを確認（MapEditorとlibraryの接続をmockしない）。失敗保存でもsource枝が残ることを確認。
- [x] 対象GREEN後 `cd client && npm run verify`。全テスト・lint・型・build成功。
- [x] ROADMAP候補016のみチェック、現在地と次の候補017、最終更新2026-10-31へ更新。未実装項目は完了にしない。docsに動作確認手順（同一Undo、別map、保存失敗・復旧）を記録。
