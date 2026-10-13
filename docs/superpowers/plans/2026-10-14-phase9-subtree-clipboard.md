# Phase 9: 枝のコピー＆ペースト Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`。AGENTS.mdに従い、タスクごとに新しい実装者を起動し、別エージェントの仕様適合・品質レビュー完了後に次へ進む。インライン実装はユーザーの明示指示がある場合のみ。

**Goal:** OSクリップボードで枝をコピーし、新しいルートとして貼り付け、全体をUndo／Redoできるようにする。

**Architecture:** 専用JSON codec、既存複製と共有する挿入処理、useNodesの同期操作、ブラウザcopy/pasteイベントの順に構成する。MapStageが入力・ジェスチャーの優先順位を管理し、pageへ通知を渡す。

**Tech Stack:** 既存TypeScript / React 19 / Next.js 16 / PixiJS 8 / Jest / Testing Library、ClipboardEvent。

**Spec:** `docs/superpowers/specs/2026-10-14-phase9-subtree-clipboard-design.md`

## Global Constraints

- 新規依存なし。マップのV3保存形式と既存の枝複製の挙動を維持する。
- コピーは全子孫を含むスナップショット。フィルターによる非表示ノードも含める。
- 貼り付け先では全IDを再発行し、根のparentIdはnull、子孫は新IDで対応付ける。
- 貼り付けと自動配置は1回のapplyTreeChangeで確定し、Undo／Redoの1操作とする。
- 入力検証・配置失敗時はマップ、選択、履歴、Redoを変更しない。採番済みIDの欠番は許す。
- 入力欄・contenteditable・選択中のDOMテキストのコピー＆ペーストを奪わない。
- 対象ブラウザはChrome・Firefox（必須）。Safariは実機で確認し、選択範囲が無い状態でイベントが発火しない場合は既知の制約として記録する（代替経路は追加しない）。
- コピー失敗時はpreventDefaultしない（直前のクリップボードの内容を残す）。
- 実装は`codex/phase9-subtree-clipboard`ブランチ、`.worktrees/codex/phase9-subtree-clipboard`で、タスク順にサブエージェント駆動と独立した仕様・品質レビューを行う。
- 各実装タスクでTDDと`cd client && npm run verify`を行う。最後にROADMAP.mdを更新し、Phase 10以降を完了にしない。

## Review Focus

1. 同じIDを持つ別マップ・連続貼り付け・Undo後分岐でも衝突しない（Task 2・3）。
2. 任意JSON・循環・複数ルート・巨大入力・不正画像を貼り付けても既存データを壊さない（Task 1・4）。
3. ラベル編集中、contenteditable継承、選択テキスト、ドラッグ中のイベントはマップ操作へ流れない（Task 4）。
4. 同一イベント内のmode変更後も最新状態を使い、auto失敗やmanual数値境界で部分追加しない（Task 2・3）。
5. 合成イベントのテストだけで実クリップボード成功を主張せず、別タブ・OS標準操作を確認する（Task 4・5）。

関連知見: L-001, L-018, L-022, L-038, L-048, L-058, L-059, L-060, L-061, L-063, L-157, L-408, L-419, L-431, L-432。実装開始前にdev-flow-kitの優先度Aチェックリストと関連本文を読む。

## File Structure

| ファイル | 責務 |
| --- | --- |
| `client/src/domain/clipboard/subtreeClipboardCodec.ts`（新規） | 型、上限、専用JSONのencode/decode |
| `client/src/domain/nodes/nodeSubtreeInsertion.ts`（新規） | 共通の採番・親子変換・配置 |
| `client/src/domain/nodes/nodeSubtreeDuplication.ts` | 元部分木を抽出し共通挿入へ委譲 |
| `client/src/hooks/useNodeLayoutState.ts`, `client/src/hooks/useNodes.ts` | 最新状態のコピー・単一構造変更として貼り付け |
| `client/src/components/map/useMapClipboardEvents.ts`（新規） | copy/paste登録、対象判定、clipboardData操作 |
| `client/src/components/map/MapStage.tsx`, `client/src/app/page.tsx` | props接続、操作案内と通知 |

## 実装前

- [ ] `git status --short`とworktree一覧を確認し、`superpowers:using-git-worktrees`で作業場所を準備する。本計画・設計書を実装worktreeへ持ち込み、元の未コミット変更は上書きしない。
- [ ] `cd client && npm run verify`で基準結果を記録する。
- [ ] 実装者にはタスク本文・Global Constraints・依存タスクのInterfacesを渡す。独立二段階レビューと修正の再レビューを通す。コミットは日本語Conventional Commitsで対象ファイルを指定する。明示依頼なしにpush・PR作成・マージを行わない。

### Task 1: クリップボード形式と検証

**Files:**
- Create: `client/src/domain/clipboard/subtreeClipboardCodec.ts`
- Create: `client/src/domain/clipboard/__tests__/subtreeClipboardCodec.test.ts`

**Interfaces:**
- `SubtreeClipboardData = { nodes: Node[]; rootId: number }`（正規化済み単一部分木。rootIdはdecode時に唯一の根から求めた値で、JSONの形式には含めない）。
- `SubtreeClipboardResult<T> = { ok: true; value: T } | { ok: false; reason: "invalid" | "too-large" }`。
- `MAX_SUBTREE_CLIPBOARD_LENGTH = 5_000_000`, `MAX_SUBTREE_CLIPBOARD_NODES = 10_000`。
- `encodeSubtreeClipboard(nodes: readonly Node[], sourceId: number): SubtreeClipboardResult<string>`。
- `decodeSubtreeClipboard(text: string): SubtreeClipboardResult<SubtreeClipboardData>`。
- `validateSubtreeClipboardNodes(nodes: readonly Node[]): SubtreeClipboardResult<SubtreeClipboardData>`（正規化済み配列の単一ルート判定とグラフ検証を担う純関数。decodeとencodeの両方から使う。線形性のテストはこの関数に対して行う）。

- [ ] **Step 1: REDテスト。** 親ありノード＋子孫をencode→decodeし、唯一の根parentIdがnull、祖先と別枝は不在、元配列は不変、画像／重要度／寸法／ラベル／配列順序／相対座標が保存されること。子が親より前の配列、深い枝も含める。

```ts
const text = encodeSubtreeClipboard(nodes, childId);
expect(text.ok).toBe(true);
if (text.ok) {
  const decoded = decodeSubtreeClipboard(text.value);
  expect(decoded.ok).toBe(true);
  if (decoded.ok) expect(decoded.value.nodes.find(n => n.id === childId)?.parentId).toBeNull();
}
expect(nodes).toEqual(before);
```

通常テキスト、通常のV3マップJSON、未知type/version、空配列、複数根、循環、孤児、重複ID、不正画像・寸法・非有限座標をinvalidにする。未知プロパティをNodeへ持ち込まない。画像高さ補正は既存V3と一致。文字数5,000,000／ノード数10,000は受理可能、各+1はtoo-large。上限内であっても不正入力はinvalid。コピーも同じ制限で、存在しないsourceIdはinvalid。serializeが生成したテキストも上限検査する。単一ルート判定とグラフ検証が線形で終わることを、時間計測ではなく、逆順に並んだ深い鎖の正規化済みNode配列を配列と各要素の両方でProxyに包んで`validateSubtreeClipboardNodes`へ渡し、要素と各ノードの`id`・`parentId`の読み取り回数がノード数の定数倍以内であることで確かめる（L-431。`find`の繰り返しによるO(n²)を検出する）。
- [ ] **Step 2: RED確認。** `cd client && npm test -- --runInBand subtreeClipboardCodec`。
- [ ] **Step 3: 実装。** コピーはcollectSubtreeIdsで全子孫を抽出し、根のみ切り離す。decodeはJSON.parse前のlength、配列正規化前のcountを確認。normalizeMapDocumentNode(..., 3)とvalidateMapDocumentGraphを再利用し、単一根を確認する。encodeでも有効性を同じ規則で検証し、受理不能なデータをクリップボードへ出さない。コピー元が10,000件を超える場合はserialize前に拒否する。
- [ ] **Step 4: GREENと全体検証。** Step 2と`npm run verify`。
- [ ] **Step 5: 二段階レビュー後コミット。** `feat(clipboard): 枝のコピー形式と入力検証を追加する`

### Task 2: 複製と貼り付けの挿入処理

**Files:**
- Create: `client/src/domain/nodes/nodeSubtreeInsertion.ts`
- Modify: `client/src/domain/nodes/nodeSubtreeDuplication.ts`
- Create: `client/src/domain/nodes/__tests__/nodeSubtreeInsertion.test.ts`
- Regression: `client/src/domain/nodes/__tests__/nodeSubtreeDuplication.test.ts`

**Interfaces:**
- `SubtreeInsertionResult = { nodes: Node[]; rootId: number }`。
- `insertNodeSubtree(current: readonly Node[], sources: readonly Node[], sourceRootId: number, targetParentId: number | null, mode: NodeLayoutMode, allocateIds: (occupied: readonly Node[], count: number) => number[], geometryPolicy: "duplicate" | "paste"): SubtreeInsertionResult | null`。
- sourcesは検証済み単一部分木。targetParentIdは複製時のみ元の親、貼り付けではnull。geometryPolicyは既存複製の検査条件を変えず、pasteで右端有限性等を追加するための明示的区別。
- 既存duplicateNodeSubtreeのシグネチャと戻り値型は維持する（型aliasで共有可能）。共通化でmanualの検査をすべて採番より前に移すため、複製でも配置失敗時に欠番が出なくなる。これは観察できる挙動（結果・失敗条件・配置）を変えない許容範囲の変化として扱い、既存複製テストはそのまま通す。

- [ ] **Step 1: REDテスト。** currentとsourcesのIDが全衝突しても、全新IDと正しい子孫対応になる。pasteでは必ず根null、duplicateでは元親維持。全属性と参照不変性を確認する。manualで既存bottom=300、sourceMinY=100ならdy=240、空currentなら元座標、autoなら元座標の候補。複数回貼り付けは新しい全体下端を使う。
- [ ] **Step 2: 数値境界REDテスト。** paste/manualはx+width／y+height overflow、dy非有限、40の間隔を失う丸めでnull。manualで失敗する場合はallocateIdsを呼ばない（検査を採番より前に済ませる。L-432）。成功時はallocateIdsを1回だけ、countに挿入ノード数で呼ぶ。挿入が線形で終わることを、逆順の深い鎖と全件が衝突するIDの入力で、配列要素と各ノードの`id`の読み取り回数がノード数の定数倍以内であることで確かめる（L-431）。既存複製の許容入力と失敗ケースは従来テストをそのまま通す。深い枝、親より子が前の配列で順序依存しない。画像は再生成しない。
- [ ] **Step 3: RED確認。** `cd client && npm test -- --runInBand nodeSubtreeInsertion nodeSubtreeDuplication`。
- [ ] **Step 4: 共通化を実装する。** 現行の採番・ID対応表・manualの間隔計算を移し、sources抽出は複製側へ残す。manualの検査をすべて済ませてから全ノードを一度に採番し、変更前のcurrentと新枝を返す。既存mapは変更しない。空currentの扱いとpasteの追加検査を明示する。autoレイアウトはこの関数内で呼ばない。
- [ ] **Step 5: GREENと全体検証。** Step 3と`npm run verify`。
- [ ] **Step 6: 二段階レビュー後コミット。** `refactor(nodes): 枝の挿入処理を複製と貼り付けで共有する`

### Task 3: useNodesのコピー・貼り付けと履歴

**Files:**
- Modify: `client/src/hooks/useNodeLayoutState.ts`
- Modify: `client/src/hooks/useNodes.ts`
- Create: `client/src/hooks/__tests__/useNodesClipboard.test.ts`
- Extend: `client/src/hooks/__tests__/useNodeLayoutState.test.ts`

**Interfaces:**
- Consumes: Task 1のcodec/型、Task 2のinsertNodeSubtree。
- `useNodeLayoutState()`へ`getCurrentState(): NodeMapState`を追加し、既存useMapHistory.getPresentを公開する（読み取りのみ）。
- `useNodes()`へ`copySubtree(sourceId: number): SubtreeClipboardResult<string>`と`pasteSubtree(data: SubtreeClipboardData): number | null`を追加。dataはTask 1のdecode成功値を渡す内部契約。
- pasteSubtreeは現在の選択に依存せず、新しい根IDを成功時に返して選択する。callbackの参照は安定させる。

- [ ] **Step 1: REDテスト。** copyでnodes/選択/history/Redoが不変。同一actでラベル変更→copyは最新ラベル。copy後に元枝を編集・削除しても元の文字列から貼り付けられる。pasteは全新ID・親子・画像を保ち、Undo1回で全体が消え、Redoで同じID・座標に戻る。既存選択ノードの子にはならない。
- [ ] **Step 2: 境界REDテスト。** 同一actでmode変更→pasteと連続pasteが最新状態を使う。IDの衝突、時刻固定でUndo→pasteの再利用なし。手動配置失敗／autoレイアウト失敗はnull、現在値・選択・Redo維持。documentRevisionは成功pasteで変わらない。copy後のマップ置換でも専用形式を新マップへ貼り付け可能。データは保存V3へround-trip可能。
- [ ] **Step 3: RED確認。** `cd client && npm test -- --runInBand useNodesClipboard useNodeLayoutState`。
- [ ] **Step 4: 実装。** copyはgetCurrentStateからencodeへ渡し、副作用を起こさない。pasteはapplyTreeChangeの最新nodes/modeからinsertNodeSubtreeを1回呼び、受理されたときだけ根を選択する。allocator.nextAvailableIdsを使い、resetしない。
- [ ] **Step 5: GREEN・回帰。** Step 3、`npm test -- --runInBand useNodesDuplication useNodesHistory`、`npm run verify`。
- [ ] **Step 6: 二段階レビュー後コミット。** `feat(nodes): 枝のコピーと一括貼り付けを履歴へ接続する`

### Task 4: ブラウザイベント・操作案内・ページ結合

**Files:**
- Create: `client/src/components/map/useMapClipboardEvents.ts`
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/app/page.tsx`
- Create: `client/src/components/map/__tests__/useMapClipboardEvents.test.tsx`
- Create: `client/src/app/__tests__/pageClipboard.test.tsx`
- Modify: `docs/testing/browser-test-cases.md`（実キーボードでの確認手順の追加と、未確認の記録。確認結果の反映はTask 5）
- Adjust（必須props追加）: `client/src/components/map/__tests__/MapStage.test.tsx`、`MapStageVisibility.test.tsx`、`MapStageHistory.test.tsx`、`MapStageContextMenu.test.tsx`、`client/src/components/map/testing/AutoLayoutMapStageHarness.tsx`（ほか`rg "<MapStage"`で列挙したもの）

**Interfaces:**
- Consumes: Task 1のdecodeとResult、Task 3のcopySubtree/pasteSubtree。
- `useMapClipboardEvents(options: { selectedNodeId: number | null; isEditing: boolean; hasActiveGesture: () => boolean; copySubtree: (sourceId: number) => SubtreeClipboardResult<string>; pasteSubtree: (data: SubtreeClipboardData) => number | null; publishNotice: (notice: OperationNotice) => void }): void`。
- MapStageへ必須`onCopySubtree`, `onPasteSubtree`, `onClipboardNotice`を同じ型で追加する。isEditingとhasActiveGestureは内部の既存値を使用する。

- [ ] **Step 1: イベントREDテスト。** jsdomには`ClipboardEvent`も`DataTransfer`も無いため、`new ClipboardEvent`・`new DataTransfer`は使わない。イベントは`fireEvent.copy/paste(target, { clipboardData: { setData: jest.fn(), getData: jest.fn() } })`（または`new Event("copy", { bubbles: true, cancelable: true })`に`Object.defineProperty`で`clipboardData`を付ける）で作り、clipboardData欠落はプロパティを付けないイベントで作る。preventDefaultの有無は`fireEvent`の戻り値か`event.defaultPrevented`で確かめる。DOMの選択範囲は`document.createRange`と`getSelection().addRange`で作る。jsdomでは実クリップボードへ書き込まれないため、実クリップボードの確認はStep 7へ回す。copyでsetData('text/plain', 専用JSON)、preventDefault、成功通知。無選択copyは全てなし。pasteはgetData→decode→1回挿入→成功通知。不正形式／上限／欠落clipboardData／setData/getData例外／挿入nullをそれぞれSpecの失敗文言と照合し、成功通知なし。コピーencode失敗ではsetDataを呼ばず、copyの失敗（上限・例外・clipboardData欠落）ではpreventDefaultしない（`dispatchEvent`の戻り値がtrue）。pasteは対象であればpreventDefaultする。pasteイベントを連続で送ると、そのつど1回ずつ貼り付けられる（Ctrl/Cmd+Vの押し続け相当）。
- [ ] **Step 2: 優先順位REDテスト。** event.targetまたはactiveElementがinput/textarea/select/contenteditableの場合、DOM文字選択あり（`window.getSelection()?.isCollapsed === false`）、isEditing、active gesture、defaultPreventedの各ケースはcopy/paste両方でノード操作・通知・preventDefaultなし。contenteditable継承とfalse例外は既存isEditableTargetと一致。通常button focusなら処理する。アンマウント後は反応せず、再描画後は最新callbacks／選択を使う。keydownから二重に実行しない。
- [ ] **Step 3: ページ結合REDテスト。** モックは`app/__tests__/pageDuplication.test.tsx`と同じ`jest.mock`の一式に限る（`pixi.js`は`mapStageTestRuntime.createMockPixiModule`で差し替え、ほかに`illustrationGeneration`、`mapJsonDownload`、`mapTextMeasurement`、`mapImageDownload`、`mapPngRasterizer`）。Home・`useNodes`・`MapStage`・`useMapClipboardEvents`・codec・保存のhookはモックしない。JSON保存の確認には`mockDownloadMapJson`の引数を使う。localStorageの`setItem`のspyは、自動保存のデバウンスがあるため偽のタイマーで時間を進めて確かめる。常設案内の文言が表示されることも確かめる。実イベント経路で親子をcopy→貼り付け→Undo/Redoし、通知と画面データを確認。配線を外すとFAILする構成にする。コピー元変更後もsnapshotが保たれ、JSON・localStorageへ貼り付け後の親子と画像が保存される（`setItem`をspyし、書き込みの回数と各回の値を検証する。L-419）。コピー／貼り付けの通知と複製の通知が独立して表示され、互いに消さない。非表示子孫も含み、表示フィルターを変えない。通知は次の対象要求で更新し、Undo/Redo/読み込みで消える。入力中とドラッグ中のイベントをページから通してマップ不変を確認する。
- [ ] **Step 4: RED確認。** `cd client && npm test -- --runInBand useMapClipboardEvents pageClipboard`。
- [ ] **Step 5: 実装。** windowへcopy/pasteを登録し、最新optionsは既存useMapHistoryShortcutsのref更新方式を参考にする。Specの順で対象判定・codec・clipboardData・通知を処理する。文字列をinnerHTMLへ流さない。pageの通知は`{ notice, revision: documentRevision }`として保持し、既存operationNotices条件と表示へ、複製の通知とは別の枠として追加。常設案内をoperationControls内の折り返し可能なテキストとして表示する。文言はSpecに一致させる。
- [ ] **Step 6: GREENと全体検証。** Step 4と`npm run verify`。
- [ ] **Step 7: ブラウザで実操作を確認。** ブラウザ操作ツールの合成キーではクリップボードコマンドが起きないため、実キーボードでの確認は利用者による手動確認とする。実装者は dev サーバーでツールから確認できる範囲（画面配線、通知、合成イベントでの挙動）を確認して記録し、実キーボードでの確認手順（同タブ／別タブ／空マップへの貼り付け、ラベル入力欄ではテキストだけが対象、ヘッダーボタンfocus時の枝操作、画像付き枝、失敗入力、コピー失敗後も直前のクリップボードの内容が残ること、Undo、OSの編集メニュー、Safariでの発火の有無）を docs/testing/browser-test-cases.md に追加して未確認として記録する。合成イベントだけで実クリップボードの成功を主張しない。
- [ ] **Step 8: 二段階レビュー後コミット。** `feat(clipboard): 標準コピーと貼り付け操作を枝へ接続する`

### Task 5: 文書・ROADMAPと最終検証

**Files:**
- Modify: `ROADMAP.md`
- Modify: `README.md`
- Modify: `client/README.md`
- Modify: `docs/README.md`
- Modify: `docs/specifications/features.md`
- Modify: `docs/specifications/data-model.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/testing/browser-test-cases.md`

**Interfaces:** Consumes: Task 1〜4の検証済み機能。API追加なし。

- [ ] **Step 1: Specと実装を照合。** 専用形式・上限・入力優先・新ルート・画像・保存・Undo・失敗経路をテスト結果へ対応させる。文書だけのタスクにREDは追加しない。Task 4で追加した実キーボードの確認手順に、利用者による確認結果があれば反映する。無ければ未確認のまま残す。
- [ ] **Step 2: 操作説明と形式を記載。** Ctrl/Cmd+C・V、選択なしpaste、親を引き継がない、フィルター、上限、非対応入力、V3との違い、対象ブラウザ（Chrome・Firefox必須、Safariは確認結果次第で既知の制約）、実ブラウザ結果を追記。未確認の環境は未確認と書く。
- [ ] **Step 3: ROADMAP更新。** Phase 9の残り2項目を完了にし、Phase 9完了、次はPhase 10「ノードのラベルを部分一致で検索する」とする。Phase 10〜13は未着手を維持。最終更新は実装完了日。必須ブラウザ（Chrome・Firefox）の実キーボードでの確認が未実施なら、クリップボードの項目の下に「実ブラウザでの実キーボード確認は未実施（docs/testing/browser-test-cases.md）」と書き添え、完了報告の未決事項にも明記する（実装は完了しているため完了にする）。
- [ ] **Step 4: 別エージェントで全体レビュー、指摘解消後の再レビュー。** `cd client && npm run verify`とルートの`git diff --check`を成功させる。
- [ ] **Step 5: 文書コミットと保持。** `docs(clipboard): コピーと貼り付けの仕様とロードマップを更新する`。worktreeとブランチを保持し、ブランチ名・worktree・未決事項を報告する。

## 自己レビュー

Specの形式・安全性をTask 1、配置／複製互換をTask 2、原子性／最新状態をTask 3、入力優先／UI／実ブラウザをTask 4、ロードマップをTask 5へ割り当てた。同期ClipboardEventのため非同期権限・要求世代は追加しない。Review Focusの5点をタスクの検証へ反映した。
