# Phase 34 タスクと属性管理 実装計画

> **For agentic workers:** `superpowers:subagent-driven-development` を使用する。メインのチェックアウト・ブランチ `codex/phase34-task-attributes` で、各タスクを新しい実装者に渡す。各タスクの仕様適合・品質を別のレビュアーが順に検証し、指摘解消後に次へ進む。

**目的**　カード39（project 5、内部ID 137）の候補085〜087を実装する。ノードをタスク化し、枝の親に進捗を表示し、型付きカスタム属性を編集できるようにする。

**構成**　ノードの正本にV3任意属性を2つ加え、既存の保存・構造編集・比較経路で保持する。進捗は正本からメモ化して読み取る。編集フォームは右パネル、履歴を伴う確定は `useNodes` が担当する。

**技術**　既存のTypeScript、Next.js、React、PixiJS、Tailwind CSS、Jest・Testing Libraryを使用する。

**設計**　`docs/superpowers/specs/2026-11-26-phase34-task-attributes-design.md`（レビュー2周の修正を含む）。各タスクに設計、Global Constraints、先行タスクのInterfacesを渡す。

## Global Constraints

- 日本語UI。依存追加なし。V3のバージョン番号、クリップボード・部品・バックアップの外側の形式を維持する。初期ノードや旧文書はタスクもカスタム属性も持たない。表示用の集計・下書き・編集の世代は永続化しない。
- 属性名・担当者・候補は生256、正規化後30 UTF-16コード単位。ノード当たり最大10属性、選択肢は1〜10候補。欠落、空配列、型違い、重複の扱いは設計「保存する値と検証」に従う。UI・V3・構造操作で検証・比較・投影を共有する。
- タスクの新規/解除/保存と、属性の新規/削除/保存は各1回のUndo。無変更や拒否は0回。保存は最新状態を検証してから1回だけ更新し、失敗時は元の文書と入力を保つ。別のノード・同じIDの新文書・同名同値で再作成した別項目へ以前の操作を適用しない。
- 編集可否・伝搬の仕様は設計の2表に従う。保護・編集ロック・再生時は読取可。位置固定だけなら編集可。未選択/マップ複数選択/マップ関連線・グループ選択では節を隠す。アウトラインでは有効主選択1件が対象。
- 進捗は親自身と全子孫のタスクを数える。カリングやフィルターは分母に影響しない。既存の出力、AIの送信内容、検索対象、ノード矩形、fit、当たり判定を拡張しない。
- コードを書く前に `client/AGENTS.md` と `client/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` を読む。各タスクは先にテストを追加しRED→GREENを記録し、型検査を通す。コマンドは特記のない限り `client/` で実行。対象テストが実際に走ったことを件数で確認する（JestはpassWithNoTests設定）。
- 新規ファイルと既存ファイルは各タスクで明示する。以下のパスは原則リポジトリルート相対。各タスクの実装者はコミットしない。全体レビュー後の `commit-ja` で責務別に分ける。

## 今回パック

`20261126-1421-draw-my-map`。L-001・L-003 は操作成否の伝播と副作用前の検証、L-047・L-858 は有限数・文字数の境界、L-048・L-061 は既存の属性動作と全入口の確認、L-060 は必須propsと実画面の配線、L-166 は同じエラーの再通知、L-453 は最新状態の単一更新、L-825 は属性ポリシー・往復・統合損失の開示に適用する。

## Review Focus

1. 統合で捨てるノードの期限・候補だけが変わっても、保存結果と破棄件数が同じなら見逃しやすい。元の全ノードと全属性を照合する（Task 1）。
2. 入力の `1e-9999`、閏世紀、絵文字15個/16個、正規化で同名になる候補をUIとV3の各境界に通す（Task 1・3）。
3. ラベル、イラスト、アイコン、下線、角印のある親で進捗の領域を確認し、深い枝の隠れたタスクを含める（Task 2）。
4. 選択が変わった後のハンドラ、読取専用への遷移、同一IDの別文書、同名・同値の属性を削除・再登録した後の古い削除要求を拒む（Task 2・3）。
5. フォーム送信失敗後に訂正して再送信する。同じエラーが再通知され、正しい保存のUndoで1手だけ戻る（Task 2・3）。

## Task 1　データ契約・保存と構造操作

**Files**（この節のパスは `client/src/` 相対）

- 追加　`domain/nodes/nodeTaskAttributes.ts`（型付き値の正規化・比較・差し替え）、`domain/nodes/nodeTaskAttributeMerge.ts`（統合専用の採用・喪失集計）、`domain/persistence/mapDocumentNodeTaskAttributes.ts`（V3エラーへの変換）。
- 変更　`types/node.ts`、`domain/nodes/nodeAttributePolicy.ts`、`domain/persistence/mapDocumentNode.ts`、`domain/persistence/mapDocumentNodeProjection.ts`、`domain/history/mapHistory.ts`、`domain/mapLibrary/mapConflict.ts`、`domain/nodes/nodeMerge.ts`、`domain/nodes/nodeMergeMessages.ts`、`hooks/nodeMergePreview.ts`、`components/layout/NodeMergeDialog.tsx`。AI統合のローカル採否画面は `hooks/aiAssistDialogView.ts` の `mergeHint` を確認する。
- テスト　`domain/nodes/__tests__/nodeTaskAttributes.test.ts`（追加）、`domain/nodes/__tests__/nodeAttributePolicy.test.ts`、`domain/nodes/__tests__/nodeMerge.test.ts`、`domain/persistence/__tests__/mapDocumentNode.test.ts`、`domain/clipboard/__tests__/subtreeClipboardCodec.test.ts`、`domain/parts/__tests__/partsCodec.test.ts`、`domain/mapLibrary/__tests__/libraryBackupCodec.test.ts`、`hooks/__tests__/nodeMergePreview.test.ts`、`components/layout/__tests__/NodeMergeDialog.test.tsx`、`hooks/__tests__/aiAssistDialogView.test.ts`。
- 参照　`domain/nodes/nodeTag.ts`、`domain/nodes/nodeSplit.ts`、`domain/nodes/nodePlacement.ts`、`domain/nodes/nodeSubtreeInsertion.ts`、`domain/nodes/extractBranchToMap.ts`、`domain/aiAssist/aiStructureProposal.ts`、`services/persistence/mapBranchTransfer.ts`。値を正しく保持する既存のスプレッド／V3転送はそのまま使う。

**Interfaces**　名前の照合は既存 `nodeTagKey` を重複判定・統合の共通の正本とする。`types/node.ts` から `NodeTask`、`NodeCustomAttribute` を公開する。前者は `Readonly<{ completed: boolean; dueDate?: string; assignee?: string }>`、後者は設計の `number | date | choice` の識別付き共用体。`Node.task?: NodeTask` と `Node.customAttributes?: readonly NodeCustomAttribute[]` を追加する。

`nodeTaskAttributes.ts` の公開契約（失敗理由は文字列リテラルの共用体。UIは理由を日本語化する）。

~~~ts
type AttributeResult<T> = { ok: true; value: T } | { ok: false; reason: AttributeFailure }
normalizeNodeTask(raw: unknown): AttributeResult<NodeTask>
normalizeCustomAttributes(raw: unknown): AttributeResult<readonly NodeCustomAttribute[] | undefined>
parseCustomNumber(input: string): AttributeResult<number>
areNodeTasksEqual(a: Node["task"], b: Node["task"]): boolean
areCustomAttributesEqual(a: Node["customAttributes"], b: Node["customAttributes"]): boolean
withNodeTask(node: Node, value: Node["task"]): Node
withCustomAttributes(node: Node, value: Node["customAttributes"]): Node
~~~

- [ ] **RED**　実際のV3ノードを往復し、選択肢の順序、期限と担当者、未完了タスクを期待する。旧V1/V2（不正な新キーを含む）と属性なしV3は新キーなし。不正V3のnull・未知キー・非候補・数値文字列・11件・重複を失敗にする。`0/-0/-1/.5/1e2`、空欄、部分数値、16進数、NaN/Infinity、非ゼロのアンダーフロー、1900/2000/2023/2024年の2月末、生256/257、絵文字15/16を固定する。
- [ ] **RED**　`SAMPLE`・`DIFFERENT` に異名の属性を追加する。split・parent insert・duplicate・入出力・履歴・別タブ比較を通し、値・種別・全taskフィールド・候補順だけを変えたときも検出する。同じ値を深くコピーした例は等価。選択肢を持つ枝をクリップボード、部品、バックアップで往復する。複製後の変更が元へ伝わらないことを確認する。
- [ ] **RED**　主選択が配列先頭でない統合、主選択task欠落の継承、別種の同名属性・同内容の重複・10件超過、採用値が不変で破棄側task/choiceだけが変わるstaleを検証する。見えるダイアログで残るタスクの中身・元ノード・破棄件数と衝突属性名を検査する。実装前に `npm test -- --runInBand nodeTaskAttributes nodeAttributePolicy nodeMerge mapDocumentNode partsCodec subtreeClipboardCodec libraryBackupCodec NodeMergeDialog aiAssistDialogView` を実行し、新しい契約が欠落して失敗することを記録する。
- [ ] **GREEN**　正規化は生値の型・長さを先に検査し、名前の正規化・比較は既存のタグ規則へ委譲する。選択肢名は表記、重複判定は鍵、選択値は正規化後の候補表記と一致させる。検証済みの値の投影・省略を共通化する。構造比較は順序・全値を比べ、先に参照一致で返せるようにする。policy登録と比較の両呼出元を同時に更新する。
- [ ] **GREEN**　統合では主選択→残りの元配列順でtaskを丸ごと1件、属性は名前鍵で最初を取る。統合計画には元ノードID別のtask/属性の完全なスナップショット、採用元、採用値、重複/破棄件数・衝突名を記録する。不変データは参照共有可。`isSameNodeMergePlan` と適用はこの計画を使う。手動統合とAIのローカルな `merge-pair` 採否画面では同じプレビュー情報を利用できるようにする。外部AIに送る投影を増やさない。
- [ ] **検証**　`npm test -- --runInBand nodeTaskAttributes nodeAttributePolicy nodeMerge NodeMergeDialog mapDocumentNode subtreeClipboardCodec partsCodec libraryBackupCodec aiAssistDialogView aiStructureProposal`、`npm run typecheck`。既存の split/duplicate、別マップ転送が個別投影していれば所有テストに追加し、属性保持を確認する。

## Task 2　ノードのタスク編集と親の進捗表示

**Files**（`client/src/` 相対）

- 追加　`domain/nodes/nodeTaskProgress.ts`、`hooks/useNodeTaskAttributeEditing.ts`（対象・世代・編集可否と最新の確定を接続）、`components/layout/NodeTaskSection.tsx`。
- 変更　`hooks/useNodes.ts`、`components/map/MapEditor.tsx`、`components/layout/NodeDetailPanel.tsx`、`components/map/MapStage.tsx`、`components/map/useRenderedMapScene.ts`、`components/map/pixi/renderMapNodes.ts`、`components/outline/OutlineEditor.tsx`。既存の `components/map/pixi/renderMapScene.ts` は `RenderMapNodesOptions` とoptions展開を引き継ぐ。
- テスト　`domain/nodes/__tests__/nodeTaskProgress.test.ts`、`components/layout/__tests__/NodeTaskSection.test.tsx`、`app/__tests__/pageNodeTasks.test.tsx`（以上追加）、`components/layout/__tests__/NodeDetailPanel.test.tsx`、`components/map/pixi/__tests__/renderMapNodes.test.ts`、`components/map/__tests__/useRenderedMapScene.test.tsx`、`components/outline/__tests__/OutlineEditor.test.tsx`。必須propsを使う既存のfixtureも型エラーに従って更新する。

**Interfaces**　Task 1の `normalizeNodeTask`、`areNodeTasksEqual`、`withNodeTask` を使う。Task 3へは `AttributeEditTarget = { nodeId: number; documentRevision: number }`、`EditOutcome = { ok: true; changed: boolean } | { ok: false; reason: string }`、共通の編集フックから `getAttributeEditRejection(target: AttributeEditTarget): string | undefined` を公開する。現行の選択・文書世代・編集可否を最新コミット済みの値から照合し、許可時は undefined。保持したハンドラも確定時に呼ぶ。各確定処理はその後、useNodesの最新状態を読む単一の更新処理内でロックと対象の元値・属性世代を照合する。task確定は `commitTask(target: AttributeEditTarget, expected: Node["task"], next: Node["task"]): EditOutcome`。進捗は `collectTaskProgress(nodes: readonly Node[]): ReadonlyMap<number, { percent: number; remaining: number }>`。結果のキーは表示対象の親だけとする。

- [ ] **RED**　子/孫の構成「親自身未完了、子完了、別の非タスクの子の孫未完了」→親33%/残2。葉はバッジなし。別ルート、親のみタスクで子あり、全完了/0件、10,000段の鎖、重複ID・循環・親不在を固定する。描画テストで同じ親のラベル編集開始・終了を切り替え、対象親のバッジだけが消えて戻ることを確かめる。実画面で子の「完了」を保存し、同じ親の進捗がPixiのシーン入力とアウトラインの行名の両方で変わることを確認する。
- [ ] **RED**　未設定→作成→完了/期限/担当者を同時保存→解除→Undo/Redo。blur/キャンセル/同値/拒否時は履歴なし。選択変更、同じIDで文書置換、ロック・保護・プレゼン開始、関連線/複数選択後に保持していたハンドラを呼んでも反映されない。位置固定だけのノード、アウトラインに戻ったときの有効主選択は編集可。`npm test -- --runInBand nodeTaskProgress NodeTaskSection pageNodeTasks renderMapNodes` でFAILを確認する。
- [ ] **GREEN**　`indexNodeForest` の `postOrder` を1回走査し、親へ件数を加算する。正本 `nodes` の変更時だけ `MapEditor` で計算し、進捗を必須propsで `MapStage → useRenderedMapScene → renderMapNodes` と `OutlineEditor` に渡す。フィルター/カリング後のノードから再集計しない。描画effectの依存にも進捗を追加する。
- [ ] **GREEN**　集計のある親だけ、既存矩形の内側に短い進捗文字を配置する。下段の幅は左右8を引き、高さは本文高の1/3以下かつ16以下。既存のイラスト上部を除き、ラベル・アイコン・下線全体を一緒に上段に収める。極小/編集中の当該親は下段なし。ピン等の角印、alpha、イベント、boundsは設計どおり。アウトラインは行末の折返し可能な文言・行ボタンの `aria-label` に加える。画像出力のコードを通さない。
- [ ] **GREEN**　`NodeSourcesSection` と `useReannouncedNotice` を参考にタスクフォームを追加し、選択IDをkeyに、文書世代と可否変更でdraft/エラーをリセットする。同一IDの世代変更でDOMを不必要に再生成しない。実行時にも現行の有効選択、保護、再生、世代を照合し、`useNodes` は最新ノードのロック・元taskを確認、確定は `applyNonStructuralChange` の成否を伝播する。成功後にだけフォームを閉じる。別の属性だけが更新されたら最新のノードにtaskを合成する。
- [ ] **検証**　`npm test -- --runInBand nodeTaskProgress NodeTaskSection pageNodeTasks renderMapNodes NodeDetailPanel renderMapNodes useRenderedMapScene OutlineEditor` と `npm run typecheck`。描画テストで実測サイズのあるラベル・画像・アイコン・下線・3角印を併用し、下段と本文の矩形が重ならないことを確認する。折りたたみ・表示フィルター内の枝の値、100%・残り0件、幅不足時のアウトライン全文を検証する。

## Task 3　カスタム属性を追加・編集・削除する

**Files**（`client/src/` 相対）

- 追加　`components/layout/NodeCustomAttributesSection.tsx`、`domain/nodes/nodeCustomAttributeUpdate.ts`。変更　`hooks/useNodes.ts`、`hooks/useNodeTaskAttributeEditing.ts`、`components/map/MapEditor.tsx`、`components/layout/NodeDetailPanel.tsx`。
- テスト追加　`domain/nodes/__tests__/nodeCustomAttributeUpdate.test.ts`、`components/layout/__tests__/NodeCustomAttributesSection.test.tsx`、`app/__tests__/pageNodeCustomAttributes.test.tsx`。Task 2と同じ実画面fixture・選択可否を利用する。

**Interfaces**　Task 1の `NodeCustomAttribute`、`normalizeCustomAttributes`、`parseCustomNumber`、`areCustomAttributesEqual`、`withCustomAttributes` とTask 2の `AttributeEditTarget`、`EditOutcome`、`getAttributeEditRejection` を確定時に利用する。名前の重複・改名・削除はTask 1の正規化・統合と同じ既存 `nodeTagKey` を使う。全角と半角が同じ鍵になる編集をテストする。一覧行は `{ key: string; expected: NodeCustomAttribute; generation: number }` を対象情報に持ち、`commitCustomAttribute(target, original, next): EditOutcome` を呼ぶ。`original: null` は追加、`next: null` は削除。変更要求は名前鍵と元の完全な構造値を持つ。追加は末尾、編集は元位置、削除は該当1件とする。

- [ ] **RED**　3種類の追加・編集・削除が各1回のUndoで戻る。名前重複、10件超過、改名時の自己除外、選択した候補の改名/削除→未選択→保存拒否→再選択・保存を検証する。候補の末尾改行1つは受理し、中間空行・複数末尾改行は拒否する。選択値は候補名と一致し、候補と値を同時に更新する。
- [ ] **RED**　一覧から保持した削除ハンドラを、値の変更後および「削除→同名同値を追加」後に呼ぶと拒否。別ノード・文書置換・ロック後も拒否。同ノードの無関係な編集は残る。失敗時に対象・入力・履歴が残り、同一エラーは再送信ごとに通知される。`npm test -- --runInBand nodeCustomAttributeUpdate NodeCustomAttributesSection pageNodeCustomAttributes` でFAILを確認する。
- [ ] **GREEN**　各名前鍵の更新世代を永続化しない管理情報として扱う。追加・改名・削除を含む成功した変更で更新し、同名が復活しても元の世代を再利用しない。削除は文書世代・ID・鍵・世代・構造値を最新状態と照合する。追加/置換も現在の配列に検証済みの候補を合成して1回だけ確定する。無変更・拒否は世代も履歴も進めない。未使用ノードに世代の配列を生成しない。
- [ ] **GREEN**　節には一覧、追加/編集フォーム、削除ボタンを置く。型選択は新規時のみに出し、編集時は元の型に固定する。候補欄に入力した名前で選択中の値が無効になれば空へ戻して再選択を求める。新規・改名・削除・最後の属性の除去までTask 1の正規化・投影を使う。失敗のフィールドに日本語説明を紐付け、IME中のEnter/キーリピートを抑止し、削除後は残るコントロールにフォーカスする。
- [ ] **検証**　`npm test -- --runInBand nodeCustomAttributeUpdate NodeCustomAttributesSection pageNodeCustomAttributes pageNodeTasks NodeDetailPanel` と `npm run typecheck`。実フォームから全型を保存し、Undo/Redo、選択切替と文書世代のリセットを確認する。

## Task 4　実装とロードマップを照合する

**Files**　変更 `ROADMAP.md`。参照 `docs/superpowers/specs/2026-11-26-phase34-task-attributes-design.md`、Task 1〜3の検証結果。

**Interfaces**　Task 1の全属性往復・構造編集、Task 2のタスク化・枝集計、Task 3のカスタム属性編集について、両段階のレビューが完了した結果を入力とする。出力は候補085〜087の実装状況と検証結果に対応するロードマップ。

- [ ] **RED（文書の差分確認）**　リポジトリルートで `rg -n '現在地|最終更新|Phase 34|候補08[5-7]|次の未完了' ROADMAP.md` を実行し、検証済みの実装と「未着手」「未完了」の差分を特定する。
- [ ] **GREEN**　該当候補のチェック、Phase 34 の状態、「現在地」「最終更新」を更新する。全体の先行未完了項目（例・候補014）と他Phaseの進行状況を保持する。手動確認を記す場合は実際に行った範囲のみ書く。
- [ ] **最終検証**　`client/` で `npm run verify`。tailwind:scan・lint・typecheck・Jest・buildのexit 0を確認し、ルートで `git diff --check` を実行する。失敗は該当タスクで修正して再レビュー後に再実行する。ロードマップの完了判定と検証結果を再読する。

## 責務別コミットの境界

`commit-ja` では、設計/計画、属性ドメインの正規化、V3・履歴・伝搬・統合の契約、タスク編集、枝集計と両ビューへの表示、カスタム属性編集、最後にロードマップの順に差分を確認する。正規化ロジックの追加だけでは型・全属性テストが成立しない箇所は、型やpolicy・投影・統合を同じコミットに含める。Task 2の同じMapEditorに混在する編集と表示は、独立して検証可能な単位でハンクを分ける。各責務にそのテストを含め、ステージした変更自体で型と対象テストが通る境界を選ぶ。コミット例は `feat(nodes): タスクと属性の保存契約を追加`、`feat(map): 親ノードに枝の進捗を表示`、`docs(roadmap): Phase 34 の完了を記録`。
