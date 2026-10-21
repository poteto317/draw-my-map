# Phase 11: 枝の折りたたみ・展開 Implementation Plan

> **For agentic workers:** `superpowers:subagent-driven-development`でタスクを1つずつ実装し、別担当の仕様・品質レビュー後に次へ進む。インライン実装はユーザーの明示指示時のみ。2026-10-20の実装依頼に基づき実行する。

**Goal:** ROADMAP Phase 11の5項目を実装し、編集データを失わず枝を折りたたみ、検索で再表示できるようにする。
**Architecture:** 正本nodesとは別に世代付き折りたたみ状態と表示用座標を持つ。可視集合は既存解像度集合との積集合、表示用配置は折りたたみだけを反映する。Homeで統合し、MapStageは一貫した表示座標・可視集合を受け取る。
**Tech Stack:** TypeScript、React、PixiJS、Jest、Testing Library。追加依存なし。
**Spec:** `docs/superpowers/specs/2026-10-20-phase11-branch-collapse-design.md`

## Global Constraints

- 新規依存なし。Node、NodeMapState、V3保存形式、履歴形式を変えない。折りたたみ・展開・検索による祖先展開ではdocumentRevisionを増やさず履歴に積まない。
- 元の全nodesを正本とし、表示用配列は保存・複製・コピー・削除・生成処理へ渡さない（L-015, L-460）。
- 状態はノードIDとdocumentRevisionで識別。文書変更後は旧状態を描画時点で無効にする（L-035, L-037）。
- 表示条件・状態遷移は純関数、React hookは状態管理、Homeは配線、MapStageは表示・操作という既存境界を維持（L-317）。
- 新規props/callbackは必須。実HomeからMapStageまで通る結合テストで配線を検証（L-060）。
- 深い木を再帰で処理しない。索引・子孫数・可視判定は全体O(N)、祖先展開はO(depth)。順序はnodes配列順を保持。
- 実装時は `.worktrees/codex/phase11-branch-collapse` の `codex/phase11-branch-collapse` を使用。タスク単位のサブエージェント実装、別担当の仕様・品質レビュー、TDD、各client変更後の `npm run verify` を必須とする。
- コミット・push・PR作成は依頼時のみ。最後にROADMAPを実態に合わせて更新し、Phase 12以降を完了にしない。
- state updater内で通知・選択・履歴操作をしない。同イベントの複数更新はfunctional updateで保持（L-453）。

## Review Focus

- 低重要度の折りたたみ根と高重要度の孫: 解像度集合を全nodesから計算し、根を残して孫を隠す（Task 1/3/6）。
- 同じIDのimportとUndo/Redo: 初回描画で旧折りたたみが消え、古いfocus要求も復活しない（Task 2/6）。
- 自動配置表示と正本の混同: focus（`F`キー・検索の中央移動）/editorは投影座標、JSON/画像/複製/履歴は正本（Task 3/6）。
- 折りたたんだ親へのTab追加: 成功時だけ展開し新規編集対象を隠さない。失敗時は維持（Task 6）。
- 葉になったIDと入れ子: 無効指定の復活を防ぎ、外側展開で内側の指定を失わない（Task 1/2/6）。

## 進め方

開始前にgit statusとworktreeを確認する。現在mainにあるこの計画・設計を、実装worktreeへ内容を失わず引き継ぐ。既存ユーザー変更をresetしない。タスク1～6はテスト追加→対象テストRED確認→実装→対象GREEN→`cd client && npm run verify`。各タスク後に別サブエージェントで仕様・品質を確認する。タスク7は文書整合と最終検証。以下のファイルはrepo相対パス、テスト実行はclient内。

### Task 1: 折りたたみの索引・可視集合・状態遷移

**Files**
- Create: `client/src/domain/nodes/nodeCollapse.ts`
- Create: `client/src/domain/nodes/__tests__/nodeCollapse.test.ts`
- Reuse: `nodeLayoutForest.ts`、`nodeLayoutForestTraversal.ts`（新しい再帰探索を作らない）

**Interfaces**
- `NodeCollapseIndex`: `nodesById: ReadonlyMap<number, Node>`、`parentById: ReadonlyMap<number, number | null>`、`childrenByParent: ReadonlyMap<number, readonly Node[]>`、`descendantCountById: ReadonlyMap<number, number>`、`roots: readonly Node[]`。
- `createNodeCollapseIndex(nodes: readonly Node[]): NodeCollapseIndex | null`。重複ID/循環/孤児等は既存forest検証に従いnull。
- `deriveNodeCollapse(index: NodeCollapseIndex, collapsedIds: ReadonlySet<number>): { collapsedNodeIds: ReadonlySet<number>; visibleNodeIds: ReadonlySet<number>; hiddenCountById: ReadonlyMap<number, number> }`。集合から不在/葉を除く。hiddenCountByIdは有効な折りたたみ根だけに全子孫数を持つ。
- `collectAncestorIds(index: NodeCollapseIndex, nodeId: number): readonly number[] | null`。対象自身を除き親→根の順、不在null。
- `toggleCollapsedNode(index, current: ReadonlySet<number>, nodeId: number): ReadonlySet<number>`、`expandCollapsedNodes(current: ReadonlySet<number>, nodeIds: readonly number[]): ReadonlySet<number>`。入力不変、無効toggleは変更なし。

- [x] A→B→C/A→Dの入れ子、外側展開、葉/不在toggle、配列順、入力凍結のテストを追加。
- [x] 深さ10,000の木、広い木で件数と可視性を検証。索引へのアクセスをProxy/Map計測で測りO(N)の読み取り上限を固定。単なる結果一致だけで二乗実装を見逃さない。
- [x] `npm test -- --runInBand nodeCollapse.test.ts` でRED確認。
- [x] indexNodeForestの後順を使って子孫数、明示stackで祖先の折りたたみ状態を伝播。各ノードから全子孫を再探索しない。
- [x] 対象GREENとverify。Interfacesと検証結果を報告。

### Task 2: 世代付き折りたたみ状態の管理

**Files**
- Create: `client/src/hooks/useBranchCollapse.ts`
- Create: `client/src/hooks/__tests__/useBranchCollapse.test.tsx`

**Interfaces**
- Consumes: Task 1の索引と純関数。
- `useBranchCollapse({nodes, documentRevision})`は `index: NodeCollapseIndex | null`、`collapsedNodeIds`、`collapseVisibleNodeIds`、`hiddenCountById`、`toggle(nodeId): void`、`expandNodes(nodeIds: readonly number[]): void` を返す。
- 不正forestは全nodesを可視、折りたたみ操作を無効とする。正本データは修正しない。
- 状態は `{documentRevision, ids}`。世代不一致・葉/削除IDを描画時に無効化し、無効IDをstate自体からも整理する。条件付きの同component render調整または同等の仕組みで、旧IDの復活を防ぐ。effectだけの遅延resetは禁止。

- [x] 初期全展開、入れ子、同じイベントで2枝のtoggle/expandが双方反映、引数nodes未変更をテスト。
- [x] revision変更で同IDの新文書は初回から全展開、削除/葉化→同IDに子追加でも旧指定は復活しない、ラベル変更では保持をテスト。
- [x] `npm test -- --runInBand useBranchCollapse.test.tsx` RED確認。
- [x] indexをnodesでmemo化。functional更新時も現在の世代・有効IDへ正規化し、通知等をupdaterに入れない。useNodes/historyに依存しない。
- [x] GREENとverify。次タスクへ戻り値の型を渡す。

### Task 3: 表示用配置と解像度可視性の統合

**Files**
- Create: `client/src/domain/nodes/nodeCollapseLayout.ts`
- Create: `client/src/hooks/useMapDisplayState.ts`
- Create: `client/src/domain/nodes/__tests__/nodeCollapseLayout.test.ts`
- Create: `client/src/hooks/__tests__/useMapDisplayState.test.tsx`

**Interfaces**
- `projectCollapsedLayout(nodes: readonly Node[], mode: NodeLayoutMode, collapseVisibleNodeIds: ReadonlySet<number>): { nodes: readonly Node[]; layoutFailed: boolean }`。
- `useMapDisplayState({nodes, layoutMode, collapseVisibleNodeIds, resolutionVisibleNodeIds})` → `{displayNodes: readonly Node[]; visibleNodeIds: ReadonlySet<number>; layoutFailed: boolean}`。Task 2のCと既存filterのRを受ける。
- 手動/全展開は同じnodes参照。autoでCが全件未満ならCのみlayoutNodeForestし座標を全ID配列に合成、hiddenノードは元オブジェクト。nullなら全正本nodesとlayoutFailed=true。Rは投影計算の依存に含めずV=C∩Rだけを変える。

- [x] 折りたたみで兄弟間の空白が縮む、正本/hidden座標不変、全ID/順序保持、同じ入力の決定性、全展開/手動の参照保持をテスト。
- [x] 既存layout失敗経路を再現しfallbackとフラグを検証。Rだけ変更したときdisplayNodes参照が変わらず、Vだけ変わるテスト。
- [x] 低重要度A→高重要度BでA閉: RはA/B、CはA、VはAというケースを実collectVisibleNodeIdsと通す。
- [x] `npm test -- --runInBand nodeCollapseLayout.test.ts useMapDisplayState.test.tsx` RED→実装→GREEN、verify。

### Task 4: 折りたたみの操作部品

**Files**
- Create: `client/src/components/layout/NodeCollapseControl.tsx`
- Create: `client/src/components/layout/__tests__/NodeCollapseControl.test.tsx`

**Interfaces**
- 必須props `{ selectedNodeId: number | null; canToggle: boolean; collapsed: boolean; hiddenCount: number; onToggle: (nodeId: number) => void }`。
- button表示は展開中「枝を折りたたむ」、閉状態「枝を展開」。`aria-expanded`は操作可能時だけ`!collapsed`（無選択/葉はdisabledで属性を出さない）。別のテキストで「折りたたみで非表示: N件」。補足文は設計の保存/画像・auto→manual説明をそのまま記載。

- [x] 未選択/葉のdisabledとcallback不実行、親のtoggle ID、閉状態の文言/件数/aria、更新後IDを扱うテスト。
- [x] `npm test -- --runInBand NodeCollapseControl.test.tsx` RED→実装→GREEN、verify。
- [x] ボタン内に検索やlayout計算を持ち込まない。native buttonを使い、Enterの押し続けによる連続切り替えだけを`keydown`の`repeat`で止める（枝の複製ボタンと同じ方式、L-408）。

### Task 5: 検索結果からの祖先展開

**Files**
- Modify: `client/src/app/page.tsx`（必須引数の変更に合わせた暫定配線）
- Modify: `client/src/hooks/useNodeSearchNavigation.ts`
- Modify: `client/src/hooks/__tests__/useNodeSearchNavigation.test.ts`
- Create: `client/src/domain/search/nodeSearchReveal.ts`
- Create: `client/src/domain/search/__tests__/nodeSearchReveal.test.ts`

**Interfaces**
- `resolveNodeSearchReveal({index, collapsedNodeIds, resolutionVisibleNodeIds, nodeId})` → `null | { ancestorIdsToExpand: readonly number[]; resolutionLevel: ResolutionLevel | null }`。nullは不在/不正index。Task 1の祖先探索と既存resolveMinimumVisibleLevelを使う。対象自身の指定は除去しない。
- navigationの旧 `visibleNodeIds` を明示的な `resolutionVisibleNodeIds` へ置換し、`collapseIndex: NodeCollapseIndex | null`、`collapsedNodeIds`、`expandNodes`を必須追加。既存nodes、documentRevision、setResolutionMode、selectNodeは維持。
- 返り値navigated/revealed/missing、focusRequestの世代/連番、notice寿命を維持。祖先展開/段階変更のどちらかがあればrevealed。

- [x] 二重祖先折りたたみ、対象自身/無関係の枝維持、折りたたみのみ(auto維持)、段階のみ、両方、missingで副作用なしを純関数/実hookでテスト。
- [x] 通知はspecの3パターン、同ID再選択のsequence、世代失効を固定。
- [x] `npm test -- --runInBand nodeSearchReveal.test.ts useNodeSearchNavigation.test.ts` RED→実装→GREEN。
- [x] このタスクで必須propsを増やすためHomeをTask 2で作成したhookへ配線して型を通す。正式な表示/操作の統合はTask 6で完成する。Home側にdomain判断を複製しない。
- [x] 既存pageSearchテストとverify。変更したHomeの暫定配線を報告。

### Task 6: Home・MapStageへの統合と回帰検証

**Files**
- Modify: `client/src/app/page.tsx`
- Modify: `client/src/components/map/MapStage.tsx`（nodes型をreadonlyにする場合に限る。配線先hook/consumerのreadonly整合も更新）
- Modify: `client/src/components/map/useNodeEditing.ts`（nodes引数をreadonlyに揃える）
- Create: `client/src/app/__tests__/pageCollapse.test.tsx`
- Modify: `client/src/app/__tests__/pageSearch.test.tsx`
- Reuse/extend: `client/src/components/map/__tests__/MapStageVisibility.test.tsx`、`MapStageHistory.test.tsx`

**Interfaces**
- Task 2のcollapse hookはHomeの一箇所のみ。Task 3のdisplayStateは正本nodes/layoutMode、CとRを受ける。
- NodeCollapseControlを既存AppHeader.operationControlsへ配置し、Task 2のtoggleへ接続。選択ノードが親かはdescendantCount>0で判定。
- MapStageにはdisplayNodesと最終V、検索hookには正本nodesとV、navigationには正本nodes/索引/折畳集合とRを渡す。persistence/imageExport/illustration/duplication/clipboardは正本を維持。
- 子追加adapter: `addChildNode(parentId)`の戻り値が非nullなら`expandNodes([parentId])`、戻り値はそのままMapStageへ返す。失敗時に展開しない。履歴操作を追加しない。
- layoutFailed時に設計のstatus文言をMapOperationNoticeで表示。復帰したら消す。noticeは保存しない。

- [x] 実Home/useNodes/MapStageを使い、Pixi・生成API・downloadなど外部境界のみモック。A/B/C/Dで入れ子維持、非表示件数、Vでhit test・メニュー・編集取消・選択解除が一致（fitに当たる機能はなく、`F`キー・検索の中央移動はVを使わず表示用座標を使う）することを検証。
- [x] auto折りたたみで表示座標が変わり、検索展開後のfocus・編集位置が最新display座標になることを実world transformとeditor位置で検証。R変更だけでは座標不変、auto→manualでは正本へ戻る。
- [x] 折畳前後のJSON・localStorage・画像出力対象が全nodesで一致し、Undo一回が直前の編集を戻す（折畳は履歴に入らない）ことを確認。
- [x] 閉親Tab子追加の成功/失敗、非表示子孫込みコピー・複製・削除、Undo/Redo、同ID import、screen準備前に検索展開→importをテスト。
- [x] `npm test -- --runInBand pageCollapse.test.tsx pageSearch.test.tsx MapStageVisibility.test.tsx MapStageHistory.test.tsx`でRED確認後、配線実装してGREEN。
- [x] 主要配線の変異確認: MapStageへ正本nodesを渡す、VをRへ替える、expandNodesを外す、画像へdisplayNodesを渡す、各変更で対応テストが失敗することを確かめ元へ戻す。
- [ ] verify成功、仕様・品質レビュー。実ブラウザで通常/狭幅、マウス/Tab、autoの詰まりと検索移動、折畳中画像出力、実IME/タッチを可能な範囲で確認。実施できなかった項目は成功扱いしない。

### Task 7: 文書・ROADMAPと最終検証

**Files**
- Modify: `README.md`、`client/README.md`、`docs/README.md`
- Modify: `docs/architecture/overview.md`、`docs/specifications/features.md`、`docs/testing/browser-test-cases.md`、`ROADMAP.md`

- [x] 表示専用状態、非表示件数の定義、auto表示座標と保存座標、検索による祖先展開、復元時全展開、画像出力全件の仕様を記録。
- [x] 実装済みのPhase 11の5項目だけを完了にし、現在地・次のPhase 12最初の項目・更新日を変更。未完了/未検証がある場合は正確に残す。
- [x] `cd client && npm run verify`と`git diff --check`を実行。全体レビューと修正の検証を完了。2026-10-21: 178 suites / 1,936 tests、lint・typecheck・build成功。
- [x] ブランチとworktreeを保持。コミット・push・PRは明示依頼がなければ行わない。検証結果と残事項を報告。
