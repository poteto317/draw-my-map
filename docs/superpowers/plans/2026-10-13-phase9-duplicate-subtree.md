# Phase 9: 枝の複製 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`。AGENTS.mdに従い、各タスクを新しい実装サブエージェントへ順番に渡す。別エージェントによる仕様適合・品質レビューを通過してから次へ進む。インライン実装はユーザーの明示指示がある場合のみ。

**Goal:** 選択ノードと全子孫を、親子関係・内容を保ってアプリ内で複製する。

**Architecture:** 部分木の複製候補を生成するドメイン関数とIDの一括採番を追加し、useNodesから既存のapplyTreeChangeへ候補全体を1回渡す。ヘッダーの専用ボタンから実行し、選択・通知を配線する。フォーカスはボタンに残す（キャンバスへ移さない）。

**Tech Stack:** 既存React 19 / Next.js 16 / TypeScript / PixiJS 8 / Jest / Testing Library。

**Spec:** `docs/superpowers/specs/2026-10-13-phase9-duplicate-subtree-design.md`

クリップボード対応は含めない。

## Global Constraints

- `NodeMapState`とV3保存形式を変更しない。新規依存を追加しない。
- フィルターで見えない子孫も含め、選択ノードの部分木全体を複製する。
- 元ノードと枝外のノードは変更しない。ただしautoモードでは既存の自動配置に伴う座標変更を許す。
- 複製は`applyTreeChange`を1回だけ呼んで確定し、追加と自動配置をUndo／Redoの1操作として扱う。`applyTreeChange`のコールバックへ`getPresent()`の最新`layoutMode`を第2引数として渡す（既存の1引数コールバックと互換）。
- 複製後にキャンバスへフォーカスを移さない。複製ボタンではEnterのキーリピートを`preventDefault`で抑止する（L-408）。
- 失敗時はマップ、選択、履歴、Redoを保持する。採番済みIDの欠番は許し、allocatorを巻き戻さない。
- 実装は`codex/phase9-duplicate-subtree`ブランチ、`.worktrees/codex/phase9-duplicate-subtree`で、タスクごとのサブエージェントと独立した仕様・品質レビューを順番に行う。
- TDDを行い、client変更後は`cd client && npm run verify`を成功させる。最終タスクでROADMAP.mdを更新し、未実装の貼り付けを完了にしない。

## Review Focus

1. 子が親より前にある配列、深い枝、非表示の子孫でも親子関係を欠落させない（Task 1・2）。
2. 読み込み済みIDと衝突する採番、同一イベントの連続複製、Undo後の分岐でもIDを再利用しない（Task 1・2）。
3. 手動配置のoverflowと自動配置失敗で、部分的な追加・選択変更・Redo消去を起こさない（Task 1・2）。
4. ドラッグ／ラベル編集中の複製で最新値を使い、旧ジェスチャーが複製後の状態を壊さない（Task 2・3）。
5. ボタンから実処理、選択、通知まで接続し、ボタンにフォーカスが残った状態でFキーが実際に使え、Enterの押し続けで連続複製しない（Task 3）。

関連知見: L-001, L-037, L-038, L-048, L-060, L-061, L-063, L-107, L-157, L-408, L-419。実装前にdev-flow-kitの優先度Aチェックリストと該当本文を再確認する。

## File Structure

| ファイル | 責務 |
| --- | --- |
| `client/src/domain/nodes/nodeSubtreeDuplication.ts`（新規） | 子孫の抽出、ID置換、手動配置、複製候補 |
| `client/src/domain/nodes/nodeIdAllocator.ts` | IDの一括採番`nextAvailableIds`を追加 |
| `client/src/hooks/useNodes.ts` | 単一の構造変更として確定・成功時選択 |
| `client/src/components/layout/NodeDuplicateControl.tsx`（新規） | 日本語ボタンとdisabled |
| `client/src/hooks/useNodeDuplicationAction.ts`（新規） | UI操作結果の通知 |
| `client/src/app/page.tsx` | 上記の結合 |

## 実装開始前

- [ ] `git status --short`、worktree一覧を確認して`superpowers:using-git-worktrees`で作業場所を準備する。現在の未コミットROADMAP.md（Phase 9〜13追加）と本計画・設計書を実装worktreeへ持ち込み、元の変更を上書きしない。他の変更を混ぜない。
- [ ] `cd client && npm run verify`で基準結果を確認する。
- [ ] `npm test`は`--passWithNoTests`付きのため、RED／GREEN確認では対象テストの実行件数が0でないことも確かめる。
- [ ] 各実装者にタスク本文・Global Constraints・依存するInterfacesを渡す。タスクのレビュー指摘は実装者へ戻し、再レビューを通過させる。コミットは個別ファイルを指定して日本語Conventional Commitsで行う。push・PR作成・マージは明示依頼がない限り行わない。

### Task 1: 複製候補を生成するドメイン関数

**Files:**
- Create: `client/src/domain/nodes/nodeSubtreeDuplication.ts`
- Create: `client/src/domain/nodes/__tests__/nodeSubtreeDuplication.test.ts`
- Modify: `client/src/domain/nodes/nodeIdAllocator.ts`
- Extend: `client/src/domain/nodes/__tests__/nodeIdAllocator.test.ts`

**Interfaces:**
- `DuplicateSubtreeResult = { nodes: Node[]; rootId: number }`をexportする。nodesは元配列と複製群を合わせた全体。
- `NodeIdAllocator`へ`nextAvailableIds(nodes: readonly Node[], count: number): number[]`を追加する。占有ID集合を1回だけ作り、単調増加の生成器から占有IDを飛ばして`count`個返す（返すID同士・既存IDと重ならない）。`count`が0なら空配列。既存`nextAvailableId`の契約は変えない。
- `duplicateNodeSubtree(nodes: readonly Node[], sourceId: number, mode: NodeLayoutMode, allocateIds: (occupied: readonly Node[], count: number) => number[]): DuplicateSubtreeResult | null`。
- allocateIdsは`NodeIdAllocator.nextAvailableIds`の契約に従う。入力は有効なforest。対象不在・手動配置不能はnull（採番前に判定できる不在は採番しない）。

- [ ] **Step 1: REDテストを書く。** 元配列をdeep-freezeし、親より先に子を置いたfixtureで、全複製のIDが異なり、根は元のparentId、子孫は複製親IDを指すことを検証する。根・子・孫に異なるlabel/importance/寸法/画像を設定し、全項目をそのまま引き継ぐこと、別の枝は参照も維持することを確認する。

```ts
// source: id=2, parentId=1, y=100。子id=3の下端を含む全体bottom=300。
// 部分木のminY=100なのでdy=240。採番は200, 201。
expect(result!.rootId).toBe(200);
expect(result!.nodes.find(n => n.id === 200)).toMatchObject({ parentId: 1, y: 340 });
expect(result!.nodes.find(n => n.id === 201)?.parentId).toBe(200);
expect(originalNodes).toEqual(before);
```

ルート複製はparentId:null、画像なしはillustrationプロパティを追加しない。allocateIdsが1回だけ、occupiedに元全ノード、countに部分木のノード数で呼ばれること。allocatorのテストでは、nextAvailableIdsが既存IDを飛ばして互いに異なるIDをcount個返すこと、count=0で空配列、生成器が単調増加を続けること（直後のnextAvailableIdとも重ならない）を検証する。負座標、子が根より上、隠れた別枝の下端を含む配置を検証する。autoでは元座標のまま候補生成。manualで非有限値や40の間隔を失う丸めはnull、同じ有限入力がautoでは手動配置計算で拒否されない。1万段の枝も再帰エラーなしで、実用的な時間（テストの既定タイムアウト内）で複製できる。このテストでは偽のallocatorではなく実物の`createNodeIdAllocator().nextAvailableIds`を渡す。allocator単体でも、1万件以上の既存ノードとcount=10000で既定タイムアウト内に終わることを確かめる（1件ずつ採番するO(n²)への退行を検出するため）。allocateIdsが1回だけ呼ばれることは成功時について確かめる。手動配置がnullになる場合は採番後に判定するため欠番が出てよい（設計書どおり）。

- [ ] **Step 2: RED確認。** `cd client && npm test -- --runInBand nodeSubtreeDuplication nodeIdAllocator`。未実装exportでFAIL。
- [ ] **Step 3: 関数を実装する。** 隣接表＋queueで対象ID集合を求める。元配列の順序で複製元を抽出し、allocateIdsでまとめて採番してID対応表を先に作る。配置のmin/maxはspreadではなくループで求める。元Nodeをspreadし、id/parentId/x/yのみ変更。autoは位置を変えず、manualはSpecのdyを適用して有限性と間隔を検証する。
- [ ] **Step 4: GREENと全体検証。** Step 2と`npm run verify`を成功させる。
- [ ] **Step 5: 独立二段階レビュー後コミット。** `feat(nodes): 枝の複製候補を生成する`

### Task 2: useNodesとUndo／Redoへ接続

**Files:**
- Modify: `client/src/hooks/useNodes.ts`
- Create: `client/src/hooks/__tests__/useNodesDuplication.test.ts`
- Modify: `client/src/hooks/useNodeLayoutState.ts`
- Extend: `client/src/hooks/__tests__/useNodeLayoutState.test.ts`

**Interfaces:**
- Consumes: Task 1の`duplicateNodeSubtree`。
- `useNodes()`へ`duplicateSubtree(sourceId: number): number | null`を追加。関数参照は安定させる。
- レイアウトhookの`applyTreeChange`のみコールバック型を`(currentNodes: readonly Node[], mode: NodeLayoutMode) => Node[] | null`へ拡張する。`applyNonStructuralChange`・`applyManualMove`と共有している既存の`NodeChange`型は変えず、`applyTreeChange`専用の型を新しく作る。getPresentの最新modeを渡す。引数を1つだけ受け取る既存callbackはそのまま互換。外からrender時点のlayoutModeを閉じ込めない。

- [ ] **Step 1: REDテスト。** 実useNodesで追加・接続・画像設定した枝を複製し、件数・内容・複製根選択・返却IDを検証する。Undo1回で複製前全体、Redo1回で複製後全体が一致。autoの場合は他の枝の移動も含めて完全往復すること。
- [ ] **Step 2: 境界REDテスト。** 同一actでsetLayoutMode→duplicateSubtreeして最新modeを使用。追加→複製、連続複製、読み込みIDと衝突する採番、時刻固定でUndo→再複製もID非衝突。存在しないID／手動overflow／autoレイアウト失敗でnull、選択・nodes・canRedo維持。失敗の試験はテストfixtureまたはlayout境界のモックを使い、実装を変更しない。非表示の子孫も複製。複製元そのものが表示フィルターで非表示でも`duplicateSubtree`は複製してIDを返す（選択解除はページ側の既存規則に任せる）。ドラッグgroup中は移動と複製の2件になり、旧leaseは失効する。
- [ ] **Step 3: RED確認。** `cd client && npm test -- --runInBand useNodesDuplication useNodeLayoutState`。
- [ ] **Step 4: 実装。** applyTreeChange callback内で最新nodes/modeと既存allocatorの`nextAvailableIds`から候補を作る。受理された場合だけrootIdを返して選択する。layout失敗なら採番していてもnullを返す。各子をaddNodeで追加する実装はしない。documentRevisionを増やさない。
- [ ] **Step 5: GREEN・回帰。** Step 3、`npm test -- --runInBand useNodesHistory useNodesAutoLayout`、`npm run verify`を成功させる。
- [ ] **Step 6: 独立二段階レビュー後コミット。** `feat(nodes): 枝を一操作として複製する`

### Task 3: 複製ボタン・通知・フォーカス

**Files:**
- Create: `client/src/components/layout/NodeDuplicateControl.tsx`
- Create: `client/src/hooks/useNodeDuplicationAction.ts`
- Modify: `client/src/app/page.tsx`
- Create: `client/src/components/layout/__tests__/NodeDuplicateControl.test.tsx`
- Create: `client/src/hooks/__tests__/useNodeDuplicationAction.test.tsx`
- Create: `client/src/app/__tests__/pageDuplication.test.tsx`

**Interfaces:**
- Consumes: Task 2の`duplicateSubtree`、既存`documentRevision`と`selectedNode`。
- `NodeDuplicateControl({ disabled: boolean; onDuplicate: () => void }): React.JSX.Element`。
- `useNodeDuplicationAction(options: { selectedNodeId: number | null; documentRevision: number; duplicateSubtree: (sourceId: number) => number | null })`は`duplicateSelected(): void`, `notice: OperationNotice | null`を返す。
- MapStageのpropsは変更しない。

- [ ] **Step 1: REDテスト。** ボタン名「枝を複製」、disabledでcallback不発。`fireEvent.click(button, { detail: 2 })`でも`onDuplicate`が呼ばれる（設計書のとおりダブルクリックは2回の複製。L-408の`detail > 1`ガードは入れない）。`fireEvent.keyDown(button, { key: "Enter", repeat: true })`がfalse（preventDefault）を返し、repeatなしのEnterとrepeatありのSpaceはtrueを返す。actionは未選択なら何もしない、成功なら成功通知、nullならエラー通知、documentRevision変更で通知を消す。成功の後、nodesや選択が変わってもdocumentRevisionが同じなら通知が残る。次の複製要求で通知が成功から失敗へ、またはその逆へ置き換わる。通知文言はSpecの全文と一致。
- [ ] **Step 2: ページ結合REDテスト。** `app/__tests__/pageHistory.test.tsx`と同じモック境界（`pixi.js`、`services/illustration/illustrationGeneration`、`services/persistence/mapJsonDownload`、`services/imageExport/mapTextMeasurement`、`mapImageDownload`、`mapPngRasterizer`）だけを差し替え、Home・useNodes・履歴・保存hook・MapStageは実物を通す。ボタンを`userEvent.click`で押して（`fireEvent.click`ではフォーカスが移らないため）親子が複製され、新しい根選択・成功通知を確認し、document.activeElementが複製ボタンのまま（キャンバスへ移らない）であること。続けてボタンにフォーカスがある状態でFキーを押し、既存のfocus処理でviewportが変化することを検証する。さらにボタンにフォーカスがある状態で`fireEvent.keyDown(button, { key: "Enter", repeat: true })`がfalseを返し、ノード数・選択が変わらない（ノード用ショートカットの兄弟追加に届かない）こと、Tab・Deleteのkeydownでもノード数・選択が変わらないことを検証する。jsdomの`keyDown`はclickを合成しないため、「押し続けても1回だけ複製」はStep 6のブラウザ確認で担保する。Undo/Redoは全枝を往復し、通知が消えること。
- [ ] **Step 3: ページ境界REDテスト。** ラベル編集中→ボタンクリック（blurを起こすため`fireEvent.click`ではなく`userEvent.click`を使う）でblur確定したラベルが複製される。ボタンを2回クリックすると2つの枝が追加され、Undo 1回で1つだけ戻る。（非表示のノードを複製元にする場合はUIから到達できない。選択ノードが非表示になると既存規則で選択が外れてボタンがdisabledになり、見える複製元から作った複製根は同じ部分木を持つため必ず見えるため。この場合はTask 2のhookテスト「非表示でも複製してIDを返す」と既存の非表示選択解除テストで担保し、ページテストには含めない。）表示フィルターで子を隠しても全子孫追加。ドラッグ途中の複製後に旧pointermoveを送っても複製後の配置が変わらない。生成中に複製して旧生成結果が複製先へ自動添付されない。失敗通知では選択が変わらない。JSON／localStorageへ複製ID・親子関係・画像が既存V3として保存され、読み込み後も維持される。保存のテストは`setItem`をspyし、書き込みの回数と各回の値を検証する（L-419）。
- [ ] **Step 4: RED確認。** `cd client && npm test -- --runInBand NodeDuplicateControl useNodeDuplicationAction pageDuplication`。
- [ ] **Step 5: 実装。** ボタンのclickは`event.detail`で弾かない。ヘッダーoperationControlsへボタン、operationNoticesへ通知を追加（既存の通知条件にも追加）。disabledはselectedNode===null。通知はdocumentRevision付きstateとして保持し、描画時に古い通知を隠す既存生成hookの方式を参考にする。ボタンは通常のblurを妨げない（pointerdownのpreventDefaultを付けない）。ボタンのonKeyDownでEnterのrepeatをpreventDefaultする。キャンバスへのフォーカス移動は実装しない。
- [ ] **Step 6: GREENとブラウザ確認。** Step 4と`npm run verify`。ブラウザでラベルblur、複製後にボタン上でFキー、ボタン上でEnterを押し続けても1回だけ複製されること、手動／auto、長いヘッダーの折り返しを確認し結果を記録する。
- [ ] **Step 7: 独立二段階レビュー後コミット。** `feat(ui): 選択した枝を複製する操作を追加する`

### Task 4: ROADMAP・操作説明と最終検証

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/specifications/features.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `client/README.md`

**Interfaces:**
- Consumes: Task 1〜3の検証済み機能。API追加なし。

- [ ] **Step 1: 仕様と実装を照合する。** 複製対象、親、全フィールド、配置、原子性、失敗、UI、保存を検証結果と対応させる。文書のみのタスクにTDDは追加しない。
- [ ] **Step 2: 操作説明を更新する。** ボタン、親子の複製、配置、Fキー（ボタン上でも使える）、Enterの押し続けでは連続複製しないこと、画像引継ぎ、Undo単位を記載。クリップボード操作は未対応と区別し、ブラウザ検証ケースを追加する。
- [ ] **Step 3: ROADMAPを更新する。** Phase 9の先頭3項目だけ完了にする。最後の「複製・貼り付け全体をそれぞれ1操作としてUndo／Redoに対応する」は「複製全体…」（完了）と「貼り付け全体…」（未完了）に分ける。Phase 9の見出しを「（未着手）」から「（進行中）」に変え、現在地にPhase 9が進行中で次はクリップボード経由のコピー＆ペーストと書く。Phase 10〜13は未着手を維持。最終更新日は実装完了日。
- [ ] **Step 4: 別エージェントで全体レビューし、修正後に再レビューする。** `cd client && npm run verify`とルートの`git diff --check`が成功することを確認する。
- [ ] **Step 5: 文書コミット。** `docs(nodes): 枝の複製の仕様とロードマップを更新する`。ブランチ・worktreeを保持し、ブランチ名・worktree・未決事項を報告する。

## 自己レビュー

Specのデータ／配置はTask 1、成否／履歴はTask 2、操作／通知／focusはTask 3、文書はTask 4へ割り当てた。手動とautoのmodeはTask 2の同期callbackで渡す。複製の呼び出し回数とUndo単位を固定し、クリップボードに範囲を広げない。
