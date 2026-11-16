# 一括検索・置換（候補034）設計

作成日: 2026-11-16。対象: Phase 17 の候補034。前提: 候補009「複数ノード選択」・候補010「選択ノードの一括編集」。状態: サブエージェントレビュー 2 周通過・自動承認済み（設計確定）。

## 決めたこと（ユーザー確認済み・推奨案）

1. 対象範囲: 既定は**全ノード**（折りたたみ・解像度フィルターで隠れたノードも含む）。ダイアログの「選択中のノードだけを対象にする」を入れると、**開いた時点の選択集合**だけに絞る。
2. マッチ規則: **部分一致**で、既存のノード検索と同じ正規化（NFKC＋小文字化）により、大文字小文字と全角・半角を区別しない。正規表現は対応しない。置換後の文字列は**入力どおり**（正規化しない）入れる。
3. 操作: ヘッダーの「一括置換」ボタンでダイアログを開き、検索語と置換語を入力して**プレビュー**（一致したノードの置換前後のラベル一覧）を見てから確定する。確定は「N件を置換」で、**全体を1操作**として Undo / Redo できる。
4. 空ラベル: 置換後のラベルが空になるノードは**置換せず**、プレビューで警告して除外する。ほかのノードは置換する。

### 推奨案の具体化（設計中に決めたこと）

- 検索語は**前後の空白を削らず入力どおり**使う（半角スペース2つを1つにする、のような置換のため）。空文字は使えない（「置換」を押せない）。既存のノード検索（前後の空白を無視）とは異なる。
- 一致した箇所は、ラベル内の**重ならない出現をすべて**、左から順に置換する（1ラベルに複数回出てくれば全部）。
- 置換の前後でラベルが同じになるノード（例: 置換語が一致した文字列と同一）は「変更なし」として、件数に数えず、置換もしない。
- ヘッダーの「一括置換」ボタンは**マップ表示でだけ**出す（既存の「枝を移動」と同じ群に置く）。ダイアログが対象にする選択は、マップ表示の選択集合（`selectedNodeIds`）。
- 「選択中のノードだけを対象にする」の既定: 選択が **2 件以上**なら入れた状態、0 件・1 件なら外した状態で開く（1 件は単なるクリックでも起きるため）。0 件のときは項目を無効にする。
- 成功の通知は、既存の枝の構造変更の通知枠（`publishTreeEditNotice`）を共有し、新しい枠は増やさない。
- ラベルの最大長は既存に無い（空文字も許す）ため、長さの検査は追加しない。

---

## 1. 目的と境界

表記ゆれ（全角・半角、大文字・小文字、旧称・新称）や名称変更を、全ノードにわたってまとめて直せるようにする。既存の「ノードを検索」（単発の移動）とは別に、複数ノードのラベルを 1 操作で書き換える入口を作る。

### 対象外（YAGNI）

- 正規表現、単語単位の一致、大文字小文字の区別の切り替えなどのオプション。
- ノードのラベル以外の属性（重要度・イラスト）の置換。
- 置換の 1 件ずつの確認（「次へ」「置換」を繰り返す方式）と、プレビューの行ごとの除外。絞り込みは「選択中のノードだけ」の範囲と検索語の調整で行う（プレビューと確定の差を作らないため）。
- アウトライン表示中の一括置換（ボタンはマップ表示でだけ出す。既存の「枝を移動」などと同じ。アウトラインで残った見えない複数選択を、見えないまま変えないため）。
- 検索語・置換語の履歴や、前回の入力の保持。
- 選択集合の変更（置換後に選択は変えない）。

---

## 2. 既存実装の調査と制約

- `client/src/domain/search/nodeLabelSearch.ts` の `normalizeNodeSearchText`（NFKC＋小文字化）と `createNodeSearchIndex` / `searchNodeLabels` が、ノード検索の正規化と一致判定を担う。一致位置は持たない（`includes` の真偽だけ）。
- ラベルは `Node.label: string`。空文字 `""` は有効で、画面表示だけ `getNodeDisplayLabel`（「新しいノード」）に置き換える。最大長は無い。
- `useNodes.updateNodeLabel(id, label)` は `applyNonStructuralChange` で 1 件を更新する。構造（親子・座標・幅）は変わらないため、自動配置の再計算は不要。
- 既存のダイアログ（`BranchMoveDialog` と `useBranchMoveDialog` / `branchMoveDialogState.ts`）の作り方: 状態遷移を純関数（`...DialogState.ts`）に置き、フックが `documentRevision` と `useLatestRef` で古い状態を判定する。表示は `useDialogFocusTrap`・`handleDialogClickCapture`・`useReannouncedNotice` を使い、`MapEditor` の `editorShortcutsEnabled` はダイアログが開いている間 `false` になる（L-061）。
- 成功・失敗の通知は `useRevisionScopedNotice` の枠（`publishTreeEditNotice`）で出す。
- `MapEditor.tsx` は既に大きい。ダイアログの状態・フック・表示は別ファイルに置く。

---

## 3. ドメイン

`client/src/domain/search/nodeLabelReplace.ts`（新規）。純関数だけを置く。

```typescript
export type LabelReplaceRequest = {
  query: string;            // 入力どおり（空文字は「一致なし」を返す）
  replacement: string;      // 入力どおり。そのままラベルへ入れる
  targetIds: ReadonlySet<number> | null; // null なら全ノード
};

export type LabelReplaceRowStatus = "replace" | "emptied" | "unchanged";

export type LabelReplaceRow = {
  nodeId: number;
  before: string;          // 置換前のラベル（空文字なら一致しないので現れない）
  after: string;           // 置換後のラベル（"emptied" でも計算結果を持つ）
  matchCount: number;      // 置換した出現数（1 以上）
  status: LabelReplaceRowStatus;
};

export type LabelReplacePlan = {
  rows: readonly LabelReplaceRow[];   // ノード配列順
  replaceCount: number;               // status === "replace" の行数
  emptiedCount: number;
};

export function planLabelReplace(
  nodes: readonly Node[],
  request: LabelReplaceRequest,
): LabelReplacePlan;

export function applyLabelReplacements(
  nodes: readonly Node[],
  replacements: ReadonlyMap<number, string>, // nodeId → 新しいラベル
): Node[] | null;
```

### 3.1 一致の規則

- 正規化関数は既存の `normalizeNodeSearchText`（NFKC＋小文字化）を使う。検索語も同じ関数で正規化する（`trim` はしない）。正規化後の検索語が空なら、どのノードも一致しない（`rows` は空）。
- 一致は**ラベル全体を正規化した文字列**に対して、重ならない出現を左から順に探す。
- 一致した範囲を元のラベルへ戻す。正規化は文字数を変えうる（例: 全角の「㈱」→「(株)」、合成可能な結合文字、`İ` の小文字化）ため、次の規則で対応づける。
  - 元のラベルのコードポイントの境界 `i` ごとに、`normalize(label.slice(0, i))` の長さを求める（`prefixLength[i]`）。
  - 境界 `k` が**有効**とは、`normalize(label.slice(0, k))` が `normalize(label)` の接頭辞であること。有効な境界だけを候補にする（結合文字の途中や、文字数が変わる文字の途中で切れる境界を除く）。例: `a` + U+0308（NFKC で `ä`、長さ 1）では、`a` の直後の境界は有効でない（`normalize("a")` は `a` で、全体 `ä` の接頭辞でない）。
  - 正規化後の範囲 `[a, b)` に対し、有効な境界のうち `prefixLength[i] === a` となる `i` と `prefixLength[j] === b` となる `j` が**ともに存在する**ときだけ、元のラベルの `[i, j)` を置換対象にする。NFKC は空でない文字を空にしないため、同じ `prefixLength` を持つ有効な境界は 2 つ以上にならず、`i`・`j` は一意に決まる。
  - 対応づけられない一致は**一致として扱わない**（部分的に置換して文字を壊さないため）。走査の再開位置は、成功した一致なら `b`、失敗した一致なら `a + 1`（直後に正しい一致が重なっていても取りこぼさない）。`matchCount` は成功した出現数。
  - **既知の制限**: ノード検索では見つかるのに、元のラベルへ対応づけられないため「一致するノードがありません」になる場合がある（語末シグマ `ΑΣΑ` 中の `σ`、組文字・合字の一部など）。
  - **既知の制限（書記素クラスタ）**: 境界の単位はコードポイントで、書記素クラスタではない。ZWJ で結合した絵文字や国旗の一部だけを一致させて置換すると、絵文字が分解することがある（プレビューで確認できる）。
  - **既知の制限（長いラベル）**: 位置の対応づけは 1 つのラベルあたりラベルの長さの 2 乗の計算量で、非常に長いラベル（数万文字）では入力のたびに止まることがある。通常のラベル（数百文字まで）では問題にならない。
- 置換語は元のラベルの `[i, j)` へそのまま入れる。1 ラベルの置換は、後ろの出現から順に適用して、前の位置がずれないようにする。

### 3.2 行の状態

- `after === before`: `"unchanged"`（置換しない。件数に数えない）。
- `after === ""`: `"emptied"`（置換しない。警告対象）。
- それ以外: `"replace"`。
- `targetIds` が `null` でなければ、その集合に含まれるノードだけを調べる。集合に含まれる ID がどのノードにも無ければ、`rows` は空。

### 3.3 置換の適用

`applyLabelReplacements` は、`replacements` のうち**現在のノードに存在する ID**だけ新しいラベルへ置き換えた配列を返す。存在する ID が 1 件も無い（空の Map を含む）なら `null`（L-002: 空を全件や成功と扱わない）。すでに同じラベルのノードは参照を保つ。

---

## 4. フック

`useNodes` に追加する。

```typescript
updateNodeLabels: (replacements: ReadonlyMap<number, string>) => boolean;
```

- `applyNonStructuralChange((current) => applyLabelReplacements(current, replacements))` を **1 回だけ**呼ぶ（L-453: 1 操作として記録）。
- 戻り値は `applyNonStructuralChange` の戻り値（受理したか）。全件が同値の場合は `true`（履歴は不変）、空・全 ID 不在は `false`（L-001）。
- 既存の `updateNodeLabel` は変えない。

---

## 5. ダイアログ

`client/src/hooks/labelReplaceDialogState.ts`（状態遷移の純関数）、`client/src/hooks/useLabelReplaceDialog.ts`（フック）、`client/src/components/layout/LabelReplaceDialog.tsx`（表示）、`client/src/components/layout/LabelReplaceControl.tsx`（ヘッダーのボタン）を新規に作る。`BranchMove*` の構成に倣う。

### 5.1 状態

```typescript
type LabelReplaceDialogState = {
  screen: "closed" | "open";
  query: string;
  replacement: string;
  scopeSelectedOnly: boolean;           // 「選択中のノードだけ」
  scopeIds: readonly number[];          // 開いた時点の選択集合（ノード配列順）
  openedRevision: number;
  mapId: string;
  error: LabelReplaceError;             // { sequence: number; message: string | null }（BranchMoveError と同形。再読み上げの sequence を持つ）。stale・失敗などを表す
  focusRequest: "query" | "header" | null;
};
```

- 開く: `scopeIds` に開いた時点の `selectedNodeIds` を記録する。`scopeSelectedOnly` の既定は「推奨案の具体化」のとおり（2 件以上で `true`）。`documentRevision` を `openedRevision` に記録する。
- 検索語・置換語・範囲は状態遷移で変える。
- `documentRevision` が `openedRevision` と違えば stale。確定できず、「マップが更新されました。閉じてから開き直してください。」を出す（`BranchMove` と同じ流儀）。
- マップ切り替え（`mapId` の変化）でも閉じる。

### 5.2 プレビューと確定

- プレビューは `planLabelReplace(nodes, { query, replacement, targetIds })` を `useMemo` で求める（最新の `nodes`）。`targetIds` は `scopeSelectedOnly` なら `scopeIds` の集合、そうでなければ `null`。
- 行の表示: 置換前 → 置換後、`emptied` は警告（「置換後のラベルが空になるため置換しません」）、`unchanged` は表示しない（件数にも出さない）。`replace` 行はすべて確定の対象になる。
- 件数の表示: 「N件を置換します」（`replace` 行の数。確定の対象と必ず一致する）。`emptied` が 1 件以上なら「M件は置換後に空になるため対象外です」を併記する（`aria-live="polite"`）。
- 一覧は `replace` 行を**最大 200 行**描画する（`emptied` は常に表示し、`unchanged` は表示しないので、どちらも 200 行の枠に数えない。大量一致で重くならないため）。`replace` 行が 200 を超える場合は「ほかに K 件」（K は描画しなかった `replace` 行の数）を表示し、確定の対象には**含める**（件数表示は全 `replace` 行の数で、プレビューの一覧は先頭の 200 行まで、と画面に注記する）。
- 「N件を置換」ボタンは、確定対象が 1 件以上、検索語が空でない、stale でないときだけ有効。無効の理由は画面の文言で示す: 検索語が空なら「検索語を入力してください」、一致が 0 件（または `unchanged` だけ）なら「一致するノードがありません」、stale なら §5.1 の文言（`aria-live="polite"` の領域に常に描画し、中身だけ替える）。
- 検索語と置換語の入力欄には可視のラベルを付ける。置換語が空のときは「一致した文字を削除します」と表示する（確定前に結果の意味が見える状態にする）。
- 計算は、まず正規化済みラベルに検索語が含まれるかで絞り、含むラベルだけで §3.1 の位置の対応づけを行う（`prefixLength` は 1 ラベルあたり O(L²) になるため）。入力欄は即時に反映し、プレビューの再計算だけ `useDeferredValue` で遅らせる。プレビューの行は長い文字列を折り返して全文を表示し（一覧は `max-h-60` の内側でスクロールする）、確定は完全な文字列で行う。
- 確定: 最新の `nodes` と現在の入力から計画を**作り直し**（古いプレビューを信じない）、`status === "replace"` の行を `ReadonlyMap` にして `updateNodeLabels` を 1 回呼ぶ。`false` が返れば、ダイアログを閉じずに失敗を表示する（`role="alert"`）。成功したら閉じ、`publishTreeEditNotice` へ「N件のノードのラベルを置換しました。」（`status`）を出し、ヘッダーのボタンへフォーカスを戻す。

### 5.3 表示・操作

- ダイアログは `role="dialog"`、`aria-modal="true"`、見出しと説明を `aria-labelledby` / `aria-describedby` で結ぶ。`useDialogFocusTrap` でフォーカスを閉じ込め、開くと検索語の入力へフォーカスする。`Escape` で閉じ（IME 変換中は処理しない）、閉じるとヘッダーのボタンへフォーカスを戻す。
- 置換語の欄の `Enter` は、IME 変換中でなく、確定できるときだけ確定する。リピートの `Enter`（`event.repeat`）では確定しない（L-408）。検索語の欄の `Enter` は置換語の欄へ移るだけ（下の「Enter の確定範囲」）。
- ダイアログが開いている間は、`editorShortcutsEnabled` を `false` にする（`BranchMove` と同じ入口をそのまま写す。履歴ショートカット・ノード操作・コピー＆ペーストを止める。ダイアログが他のヘッダー操作を覆う作りも `BranchMoveDialog` と同じ。L-061）。
- 外から閉じられた場合（マップ切り替え・stale）は、フォーカスを奪わない（`focusRequest` を出さない。L-762）。
- **リピートと二重実行**（L-408、L-653、L-101）: ヘッダーの「一括置換」ボタンに `preventRepeatedActivationClick` を付ける。「N件を置換」・キャンセルのボタンはリピートの Enter・Space を止める。ダイアログの根で `handleDialogClickCapture`（`detail > 1` のクリックを握りつぶす）を使う。`submit` は先頭で `latest.current` の `screen` と `canSubmit` を再判定し、確定を押した同じ処理で閉じる（2 回目は `updateNodeLabels` を呼ばない）。
- **IME**（L-474）: 入力欄の `Enter` と `Escape` は、`nativeEvent.isComposing` が真、または `keyCode === 229` のとき処理しない。
- **Enter の確定範囲**: 検索語の欄の `Enter` は置換語の欄へフォーカスを移すだけにする。確定する `Enter` は置換語の欄とボタンに限る（置換語が空のままの確定を、プレビューを見ないまま起こさないため。L-063）。
- 範囲のチェックボックス「選択中のノードだけを対象にする（N件）」は、開いた時点の選択が 0 件なら無効（L-153、L-154: 件数をラベルに含める）。
- ヘッダーのボタン「一括置換」は、`MapEditor` の `viewMode === "map"` のブロックの中で `BranchMoveControl` の隣に置く（アウトライン表示では出さない）。ボタンは `aria-haspopup="dialog"` と `aria-expanded` を持つ。ノードが 1 件も無いとき（`nodes.length === 0`）は無効にする。

---

## 6. 既存機能との接続

| 機能 | 挙動 |
| :--- | :--- |
| Undo / Redo | 確定全体が 1 操作。Undo で全ノードのラベルが戻る。選択集合は既存どおり Undo で解除される（`markDocumentRestored`）。 |
| 保存・エクスポート | ラベルは既存のフィールドで、保存形式（V3）は変えない。自動保存は既存の経路で行われる。 |
| 構造・座標・配置 | 変えない（非構造変更）。自動配置の再計算は行わない。 |
| ノード検索 | 変えない。置換後は `nodes` が変わるため、検索の索引は既存どおり再計算される。 |
| 折りたたみ・解像度フィルター | 置換は表示の有無に関係なく対象。表示状態は変えない。 |
| 選択 | 変えない。 |
| 複数タブの競合検出・保護モード | 既存の保存経路に従う（置換自体は通常のラベル編集と同じ扱い）。 |
| マップ切替・JSON 読込 | ダイアログが開いていれば閉じる（`mapId` と `documentRevision` の変化）。 |

---

## 7. テスト方針

- ドメイン `planLabelReplace`: 全角・半角と大文字小文字を区別しない一致、複数回の出現（左から・重ならない）、検索語の前後の空白を保つこと、空の検索語で行が空、置換語が検索語を含む場合に再帰しないこと（1 回の走査）、`emptied`（ラベル全体が一致して置換語が空）、`unchanged`、`targetIds` による絞り込み（範囲外のノードは変わらない）、`targetIds` の ID が不在、正規化で長さが変わる文字（`㈱`・結合文字の濁点・`İ`・`a` + U+0308 に対する `a` の検索）で、元の文字を壊さず、対応づけられない一致を置換しないこと。失敗した一致の直後に正しい一致が重なる場合（`㈱` の `(` に続く `株` など）に取りこぼさないこと、`matchCount` が成功した出現数であること。
- ドメイン `applyLabelReplacements`: 置換、不在 ID の無視、空 Map・全 ID 不在で `null`、同値ノードの参照維持、選択外ノードの不変。
- フック `updateNodeLabels`: 1 回の Undo で全件戻る、全件同値で履歴を積まない（事前に 1 回別の変更をしてから呼び、Undo で事前の変更より前まで戻らないことで確かめる）、戻り値。
- ダイアログ状態: 開く・範囲の既定（0 件・1 件・2 件）、stale、閉じる、外から閉じたときに `focusRequest` を出さないこと。
- コンポーネント `LabelReplaceDialog`: プレビューの行（置換前後・警告）、件数の表示、200 行超の注記、無効の理由の文言（検索語が空・一致なし）、置換語が空のときの注記、`Enter` と `Escape` の IME（`isComposing` と `keyCode 229` を別のテストに分け、検索語と置換語の両方の欄で確かめる）、リピートの `Enter`・`Space`、検索語欄の `Enter` が置換語欄へ移るだけであること、フォーカス、確定ボタンの有効条件、確定の 2 回目で `updateNodeLabels` が呼ばれないこと、ダブルクリックの 2 回目の握りつぶし。ヘッダーのボタンのリピートとダブルクリックは「開く側」「ダイアログ内」「閉じた後の戻り先」の 3 か所で確かめる。
- ページ統合: マップ表示でダイアログを開いて検索語・置換語を入れ、確定で全ノードのラベルが変わる、選択のみの範囲で選択外が変わらない、空になる行は変わらない、複数選択 → アウトライン → マップへ戻ると範囲の既定（2 件以上で「選択のみ」）が再び入る、Undo 1 回で全件戻る、ダイアログ表示中にショートカットが働かない、アウトライン表示では「一括置換」ボタンが出ない。
- fixture は、一致するノードと一致しないノードを必ず混ぜ、選択外・`emptied`・`unchanged` の各ノードを含める。置換語は大文字・全角・結合文字を含む値にして、置換語を正規化してしまう誤実装を検出できるようにする。`targetIds` が空集合（全ノード扱いにならず `rows` が空）と、ID が不在の場合を別のテストで固定する（L-002）。ラベルは全ノード同じ値にしない（L-168、L-170、L-616）。
- 仕様: `docs/specifications/features.md` に新しい章（一括置換）と Phase 17 の行・ヘッダー構成・操作表を追記。`docs/architecture/overview.md` のファイル一覧・件数を更新。`docs/testing/browser-test-cases.md` に確認節（AD 節）を追加。

---

## 8. 知見（実装時に気をつける ID）

- L-001 / L-002: 一括更新の成否を返す。空の計画や全 ID 不在を「全件」や成功と扱わない。
- L-453: 置換を独立した複数回の更新に分けず、1 回の更新関数でまとめる。
- L-061: ダイアログが開いている間のショートカット・ヘッダー操作の入口をすべて同じ値で止める。
- L-408 / L-653 / L-101: キーリピート・ダブルクリックの 2 回目が確定や戻り先の別の操作に届かないこと、確定の二重実行を防ぐこと。
- L-474: IME の `Enter`・`Escape` は `isComposing` と `keyCode 229` の両方を別のテストで固定する。
- L-159 / L-762: ダイアログ全般は `BranchMove` に倣い、外から閉じられたときにフォーカスを奪わない。
- L-554 / L-057 / L-058: 入力欄に可視のラベルを付け、確定ボタンが無効な理由を文言で示す。
- L-036 / L-063: プレビューと確定を食い違わせず（除外を持たない）、確定は計画を作り直して行う。確定する `Enter` の範囲を限る。
- L-153 / L-154: ライブリージョンは常に描画し、中身だけを替える。件数は文言で確認できるようにする。
- L-168 / L-170 / L-616: テスト名と fixture（一致・不一致・選択外・空・同値）を一致させ、既定値だけの fixture にしない。
- L-818: 表示モードをまたいで残る状態（選択集合）を、見えない表示で変えない。ボタンをマップ表示に限り、対象は開いた時点の選択集合に固定する。
- L-591: 設計書の更新対象にアーキテクチャ概要（ファイル数・関数の列挙）を入れる（§9）。

---

## 9. ドキュメント更新

- `docs/specifications/features.md`: 冒頭の対象機能一覧、Phase 17 の行、ヘッダー構成の図、新しい章「一括置換」、操作表・ダイアログ表示中のショートカットの記述、通知枠の説明。
- `docs/architecture/overview.md`: 新しいファイル（ドメイン・フック・状態・コンポーネント）の一覧、`domain/search/` のファイル数、`useNodes` の説明。
- `docs/testing/browser-test-cases.md`: AD 節（手順と期待結果、結果の集計表）。
- `ROADMAP.md`: 候補034 の完了と現在地（次は候補035）。
