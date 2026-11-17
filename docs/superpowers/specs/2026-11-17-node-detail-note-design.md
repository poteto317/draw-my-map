# 詳細メモ（候補011）設計

作成日: 2026-11-17。対象: Phase 18 の候補011「詳細メモ」。前提: 候補034・035（`useNodes` の更新の作り・履歴）、既存の右パネル（イラスト）。状態: サブエージェントレビュー 2 周通過・自動承認済み（設計確定）。

## 決めたこと（ユーザー確認済み）

1. **保存形式**: V3 のまま、ノードに任意の項目 `note` を足す。版は上げない。旧データ（`note` なし）はそのまま読める。
2. **置き場所**: 今の右パネル（イラスト）を「ノードの詳細」としてまとめ、**上に詳細メモ、下にイラスト**を縦に積む。パネルの幅は広げる。
3. **文字数の上限**: 1 ノードあたり **10,000 文字**。数え方は JS の `string.length`（UTF-16 のコード単位。textarea の `maxLength` と同じ。絵文字などは 2 文字分）。入力済みの文字数を「N / 10,000 文字」で表示し、超える入力は受け付けない。
4. **範囲**: 保存・Undo / Redo・複製・コピー＆貼り付け・分割・統合との整合まで。キャンバス上の「メモあり」の印、ラベル検索へのメモの追加、アウトライン書き出しへのメモの追加は**含めない**（追加範囲は選ばれなかった）。

### 設計中に決めたこと

- **確定のしかた**: テキスト欄は手元の下書きを持ち、**入力が 300ms 止まるたびにマップへ反映**し（自動保存の対象になる）、**フォーカスを外したときに残りを反映して 1 回の履歴にまとめる**。入力のたびに履歴を積まない（履歴の上限を使い切らない）。反映の途中は既存の履歴グループ（`beginMoveHistory`）を使い、グループ内は表示用の現在値だけを更新する（`preview`）。
- **`Escape`**: 編集を取り消し、フォーカスを入れた時点の内容へ戻して欄から出る（IME 変換中の `Escape` は取り消さない）。取り消しの後の `blur` では何も反映しない（二重確定を避ける。L-473）。
- **空のメモ**: 空文字、または空白だけのメモは「メモなし」とみなし、項目ごと持たない（イラストと同じ。`note` は `undefined`）。前後の空白・改行は、それ以外では削らない。
- **複数選択**: メモの対象は**主選択の 1 ノード**。マップ表示で複数選択のときだけ「N 件選択中。主選択のノードのメモを編集します」と出す。アウトライン表示は単一選択として扱い、キャンバスで残った複数選択の件数を出さない（`MapEditor` の `importanceTargetIds` と同じ規則。見えない選択を見せない）。
- **統合**: 残すノードのメモは、選択中のノードのメモを**配列順に**、空行（`"\n\n"`）で連結したもの（メモのあるノードだけ。無いものは飛ばす）。連結が上限（10,000 文字）を超えるときは**統合できない**（新しい失敗の理由 `note-too-long`。黙って切り詰めない）。
- **分割**: 最初の断片（元のノード）にメモを残し、新しい断片のノードにはメモを持たせない。
- **アウトライン表示でもパネルは出す**（今のイラストのパネルと同じ。メモの編集は表示モードに依存しない）。
- 入力中のフォーカスと**ショートカットの競合**は既存の判定（ツリー編集のキーは `isInteractiveTarget`、クリップボードなどは `isTextEntryTarget`／`isEditableTarget`）に任せる（`textarea` 内の `Delete`・`Tab`・`Enter`・`Cmd/Ctrl+Z` などでマップを動かさない）。テキスト欄の中の Undo は、ブラウザ標準のテキスト欄の Undo に任せる。ヘッダーの Undo ボタンはマップの履歴を戻す（押す時点でテキスト欄の `blur` が先に起き、反映が終わっている）。

---

## 1. 目的と境界

キャンバスには短い見出し（ラベル）だけを置き、長い説明は詳細パネルのメモに保存できるようにする。

### 対象外（YAGNI）

- キャンバスやアウトラインにメモの有無・本文を表示すること（印・ツールチップ・折りたたみ）。
- ラベル検索・一括置換・アウトライン書き出し・画像書き出しへのメモの反映。
- Markdown の描画（候補053）、URL（候補012）、タグ（候補023）、出典（候補054）。メモは**プレーンテキスト**で、HTML として解釈しない。
- 複数ノードへのメモの一括編集。
- 版の引き上げ（V4）と、古いアプリへの書き戻し互換（古いアプリは `note` を知らず、保存し直すと落とす。その環境はサポートしない）。

## 2. 既存実装の調査と制約

- `Node`（`types/node.ts`）は属性を足すときの見直し箇所をコメントに持つ。イラストが先例で、`illustration?: string` を「無いノードでは項目ごと持たない」として扱う。
- **保存**: `domain/persistence/mapDocumentNode.ts`（`normalizeMapDocumentNode`）が読み込み・JSON 取り込み・コピー＆ペーストの検証の入口。`mapDocumentNodeProjection.ts`（`projectMapDocumentNode`）が書き出す項目を決める。イラストは `mapDocumentNodeIllustration.ts` が「version 3 のときだけ読む、以前の版では無視」を担う。
- **履歴**: `areNodesEqual`（`domain/history/mapHistory.ts`）は全キーを比べるので、`note` を足せば自動で比較される。マップの競合判定（`domain/mapLibrary/mapConflict.ts`）の `areNodesEqual` は**項目を並べて比べる**ので、`note` を足さないと、別タブで変えたメモの競合を見逃す。
- **更新**: `useNodeLayoutState` に、履歴へ 1 回積む `applyNonStructuralChange`（`commit`）と、グループ中は表示値だけを更新しグループ外では `commit` と同じになる `preview` 経由の `applyManualMove`（手動配置専用）がある。メモの途中反映には、配置モードに依存しない `preview` 版が要る。
- **複製・貼り付け**: `domain/nodes/nodeSubtreeInsertion.ts` は `...source` で属性を写す（`note` も写る）。コピー（クリップボード）は `projectMapDocumentNode` を通り、貼り付けは `normalizeMapDocumentNode` を通る。
- **統合**: `domain/nodes/nodeMerge.ts` の `applyPlanToSurvivor` は「何もしないと吸収されるノードの値は捨てられる」とコメントで見直しを求めている。計画・プレビュー・`isSameNodeMergePlan` も合わせて見る。
- **右パネル**: `MapEditor` の `sidePanel` に `IllustrationPanel`（`<aside aria-label="イラスト">`、`w-60`）が入る。`selectedNode` は `nodes.find(selectedNodeId)`（主選択）。アウトライン表示でも出る。
- ショートカットは `isInteractiveTarget`（`useNodeKeyboardShortcuts`。ボタン・入力欄・`textarea` などの内側）、`isTextEntryTarget`（`input, textarea`）、`isEditableTarget` で、文字入力先では動かさない。ダイアログを開いている間はルートを `inert` にし、`editorShortcutsEnabled` を偽にする。

## 3. ドメイン

### 3.1 メモの項目（`domain/nodes/nodeNote.ts`）

- `NODE_NOTE_MAX_LENGTH = 10000`。
- `normalizeNodeNote(value: string): string | undefined` — 次の順で行う。①末尾が**対になっていない上位サロゲート**なら 1 単位削る（`maxLength` で絵文字の途中を切られた場合の保護。L-636）。②削った後の値が空白だけ（`trim() === ""`、削った結果が空文字の場合を含む）なら `undefined`。③それ以外は値のまま。上限を超える値は切り詰めず、そのまま返す（超過の判定は呼び出し側。ここで黙って変えない）。
- `isNodeNoteWithinLimit(value: string): boolean` — `value.length <= NODE_NOTE_MAX_LENGTH`。
- `replaceNodeNote(nodes, id, note): Node[] | null` — `note` は正規化前の入力。`normalizeNodeNote` を通した値で判定する。対象が無い、正規化後の値が現在と同じ、**正規化後の値が上限超過**のとき `null`（何も変えない。無変更は履歴に積まない。L-135）。変えるときは `note` が `undefined` なら**キーごと外した**ノードを作る（`{ ...node, note: undefined }` を残さない）。

### 3.2 保存形式（`domain/persistence/`）

- `mapDocumentNodeNote.ts`: `normalizeMapDocumentNodeNote(note, index, version): MapDocumentResult<string | undefined>`。`version !== 3` または `note === undefined` は `undefined`（以前の版では、あっても無視する）。文字列でない、または**上限超過**は失敗（`node[${index}].noteは10000文字以内の文字列である必要があります。`）。上限は**入力の文字列の `length` で判定し、正規化や走査より先**に行う（L-443）。上限内なら `normalizeNodeNote` を通した値を返す（対になっていない末尾の上位サロゲートを削り、空白だけなら `undefined`）。
- `mapDocumentNode.ts`: `normalizeMapDocumentNode` が上を呼び、成功値を `projectMapDocumentNode` へ渡す。
- `mapDocumentNodeProjection.ts`: `note` があるときだけ項目を出す（`...(node.note === undefined ? {} : { note: node.note })`）。
- `mapConflict.ts` の `areNodesEqual`: `(a.note ?? "") === (b.note ?? "")` を足す。
- 保存形式は V3 のまま。JSON 書き出し・自動保存・バックアップ・ゴミ箱・コピー＆ペーストはこの 3 点を通るので、`note` が往復する。

### 3.3 統合（`domain/nodes/nodeMerge.ts`）

- 計画（`NodeMergePlan` の成功側）に `note: string | undefined` と `noteSourceCount: number`（メモのあるノードの件数）を足す。`note` は選択中のノードを**配列順**に見て、メモのあるものを `NODE_NOTE_MERGE_JOINER`（`"\n\n"`）で連結したもの。メモが 1 つも無ければ `undefined`。
- 失敗の理由に `note-too-long` を足す。検査の順は既存の最後（`different-parents` の後）に置く。連結後の `length` が上限を超えたら `note-too-long`。
- `applyPlanToSurvivor` は、`plan.note` が `undefined` ならキーを持たせず、それ以外なら `note` を写す（残すノードが持っていたメモは計画の連結結果に含まれるので、上書きで失われない）。
- `isSameNodeMergePlan` に `note` と `noteSourceCount` の一致を足す（`note` は連結結果そのもので、`noteSourceCount` はプレビューで見せる件数として比べる。プレビューで見せた内容が確定時に変わっていないことを保証する。L-036）。
- 失敗の文言（`nodeMergeMessages.ts`）に `note-too-long` を足す: 「メモをまとめると文字数の上限（10,000 文字）を超えるため、統合できません。」`never` による網羅性の検査も保つ。

### 3.4 分割・複製・貼り付け

- 分割（`domain/nodes/nodeSplit.ts`）は変更しない。最初の断片は元のノードを `{ ...node, label }` で更新するのでメモが残り、新しい断片は `createSiblingNode` 由来なのでメモを持たない。テストで固定する。
- 複製・貼り付け（`nodeSubtreeInsertion.ts`）は変更しない。`...source` でメモが写る。テストで固定する。

## 4. フック

### 4.1 `useNodeLayoutState`

- `applyNonStructuralPreview(update: NodeChange): boolean` を足す。`getPresent` から更新を作り、`preview` へ渡す。**配置モードに依存しない**（`applyManualMove` は自動配置で `false` を返すので使えない）。グループ中は履歴に積まず、グループ外では `commit` と同じ動きになる。

### 4.2 `useNodes`

- `previewNodeNote(id, note): boolean` — `replaceNodeNote` を `applyNonStructuralPreview` で行う。**メモの更新はこの 1 経路だけ**で、履歴グループ中は履歴に積まず、グループ外（グループが他の操作で閉じた後など）は 1 回の履歴として確定する。**戻り値は更新関数が変更を受理したか**（無変更・対象不在・上限超過は `false`）。確定用の別 API（`commit` 版）は作らない。
- 履歴グループの開始は既存の `beginMoveHistory` を使う（名前は移動由来だが、機構はグループ一般。コメントで明記する）。

### 4.3 `useNodeNoteEditing`（`hooks/useNodeNoteEditing.ts`）

テキスト欄の下書き・途中反映・確定を 1 か所で受け持つ。引数: 対象ノードの ID（`number`。ID が無いときはフックを使わない。§5.1）と現在のメモ、`previewNote(id, note)`、`beginGroup()`。返す値: `value`、`length`（`value.length`）、`isAtLimit`、`onFocus`、`onChange(value)`、`onBlur`、`onKeyDown`、`onCompositionStart`、`onCompositionEnd`。

- `onFocus`: 履歴グループを開始し（`lease`）、そのときのメモを `baseNote`（空は `""`）として控える。
- `onChange(value)`: 下書きを `value` にし、300ms のタイマーを張り直す（デバウンス。**上限なしの張り直しを避けるため、直前の反映（反映がまだ無ければフォーカス）の後の最初の入力から 2 秒を超えて先送りしない**。L-399）。タイマーが満ちたら `previewNote(id, 下書き)` を呼ぶ。
- `onBlur`: タイマーを止め、下書きがあれば `previewNote` で反映し、`lease.finish()` でグループを閉じる（実変更があるときだけ 1 回の履歴になる）。下書きを捨てる（`null`）。
- `Escape`（IME 変換中でない）: タイマーを止め、`previewNote(id, baseNote)` で戻し、`lease.finish()`、下書きを `null` にしてから `blur()`。下書きが `null` なので、その後の `onBlur` は何も反映しない（L-473）。
- 下書きが `null` の間、表示する値は現在のメモ（`note ?? ""`）。下書きがある間は下書き。フォーカス中に現在のメモが外から変わる経路（ヘッダーの Undo / Redo、別タブの再読み込み、JSON 取り込み）は、いずれもフォーカスを外す操作か、`documentRevision` を進める操作なので、`NodeNoteEditor` は**対象の ID と `documentRevision` をキーに作り直す**（§5.1）（古い下書きを新しい文書へ書かない。L-588）。
- アンマウント（選択の変更・文書の入れ替え）では、タイマーを止め、**`lease.isActive()` が真で下書きがあれば、`previewNote(id, 下書き)` で反映してから** `lease.finish()` を呼ぶ。キャンバスでノードを単一選択すると、Pixi の `pointerdown` で選択が同期的に変わり、フォーカスが移る前（`blur` より先）に `NodeNoteEditor` が外れる。フォーカス中の要素が DOM から外れても `onBlur` は呼ばれないので、`blur` に頼らずアンマウントで反映する。文書の入れ替え（`reset`）では `lease` が失効しているので反映せず（`isActive()` が偽）、古い下書きを新しい文書へ書かない（L-588）。タブを閉じるなど `blur` もアンマウントも起きない終わり方では、最後の反映より後の下書き（最大 2 秒分）は残らない（既知の制限）。
- グループが他の操作で閉じられた後は `lease.isActive()` が偽なので、`finish` は何もしない。途中反映が `commit` に落ちて履歴が増えることは許容する（正しさは保たれる）。
- 入力は `maxLength={NODE_NOTE_MAX_LENGTH}`。貼り付けで超える分はブラウザが切る。IME 変換中の `onChange` も同じ経路で下書きに入れるが、**変換中は途中反映のタイマーを張らない**（変換前の文字をマップへ入れない。L-474）。変換中かどうかは `onCompositionStart` / `onCompositionEnd` で持つ（Chrome は確定直前の最後の `input` も `isComposing` が真のまま届くため、`onChange` の `isComposing` だけでは判定しない）。**`onCompositionEnd` でタイマーを張る**（日本語だけで書いた文も 300ms 後に反映される）。`Escape` の「変換中でない」判定も同じ変換中の状態と `event.nativeEvent.isComposing` / `keyCode === 229` の両方で見る。

## 5. パネル

### 5.1 構成

- `components/layout/NodeDetailPanel.tsx`（新）: `<aside aria-label="ノードの詳細">`。幅は `w-72`。内容が高さを超えたら縦にスクロールする（`overflow-y-auto`、`min-h-0`）。上に `NodeNoteSection`、下に `IllustrationPanel` を置く。
- `components/layout/IllustrationPanel.tsx`: 外側の `<aside>` を `<section aria-label="イラスト">` に変え、幅・縁・背景は親へ移す。中身と操作は変えない。
- `components/layout/NodeNoteSection.tsx`（新）: 表示のみ（フックを呼ばない）。見出し・対象・テキスト欄・文字数を、props（`value` `length` `isAtLimit` とハンドラ。未選択のときは編集の値なし）で受けて描く。
- `components/layout/NodeNoteEditor.tsx`（新）: `useNodeNoteEditing` を呼び、`NodeNoteSection` へ値を渡す小さな部品。`NodeDetailPanel` が、ノードが選択されているときだけ `key={`${node.id}:${documentRevision}`}` を付けて描く（ID や `documentRevision` が変わると作り直し、古い下書きを引き継がない。L-588）。未選択のときは `NodeNoteEditor` を使わず、無効の `NodeNoteSection` を直接描く（フックの ID は常に `number`）。
- `MapEditor` は `sidePanel` に `NodeDetailPanel` を渡す（配線のみ。選択ノード・選択件数・`documentRevision`・`previewNodeNote`・`beginMoveHistory`）。

### 5.2 `NodeNoteSection` の表示

- 見出し「詳細メモ」（`<h2>`）。ノード未選択のときは「ノードを選択してください」。選択があるときは、対象ノードの表示ラベル（`getNodeDisplayLabel`、`line-clamp-3`、`title`）。
- 選択件数（`MapEditor` が `importanceTargetIds.length` で渡す。アウトライン表示では主選択だけなので最大 1）が 2 以上のときは、「N 件選択中。主選択のノードのメモを編集します」。
- `<label>` つきの `<textarea>`（名前「詳細メモ」）。`rows` は 8 程度で、縦にだけ広げられる（`resize-y`）。プレースホルダーは「このノードの詳細な説明を書けます」。未選択のときは `disabled`。
- 文字数の表示: 「{length} / 10,000 文字」を常に出す。上限に達したら、その下に「上限に達しました」（`role="status"`）を**併記**する（数の表示は消さない）。**入力済みの数え方は上限と同じ `length`**（絵文字は 2 文字分。パネルに注記は付けない）。
- 色・ダークモードは既存のパネルに合わせる。

## 6. 既存機能との接続

| 機能 | 扱い |
| --- | --- |
| 保存・読み込み・JSON | `note` を V3 の任意項目として往復する（§3.2）。旧データ・V1/V2 は `note` なし |
| Undo / Redo | 反映の途中は履歴に積まず、`blur` で 1 回にまとめる（§4.3）。`areNodesEqual` が全キー比較なので `note` の変化は履歴の差として扱われる |
| 複製・コピー＆貼り付け | メモも一緒に写る（§3.4）。クリップボードの JSON に `note` を含み、貼り付けで検証する |
| 分割 | 元のノードにメモを残し、新しい断片には付けない（§3.4） |
| 統合 | 選択中のメモを配列順に空行で連結する。上限超過は統合できない（§3.3）。プレビューにメモの連結結果を出す（§7） |
| 競合検出 | `mapConflict` の比較に `note` を含める（§3.2） |
| 親の挿入 | 新しい親は元のノードの重要度だけを写し、メモを持たない（`nodePlacement.ts` のコメントに `note` も持たないことを追記する） |
| ノードだけ削除・枝の移動・インデント・並べ替え | 変更なし（ノードの属性をそのまま持ち運ぶ） |
| 検索・一括置換・アウトライン書き出し・画像書き出し | 変更なし（メモを対象にしない。対象外 §1） |
| ショートカット | `textarea` は文字入力先なので既存の判定で止まる。パネルのテストで `Delete`・`Tab`・`Enter`・`Cmd/Ctrl+Z` がマップを動かさないことを固定する |

## 7. 統合ダイアログのプレビュー

- `hooks/nodeMergePreview.ts` に、メモの連結結果の行を足す: メモのあるノードが 1 つ以上あるときだけ、「メモ: {noteSourceCount} 件のメモを連結（{note の length} 文字）」を出す（本文は出さない。長くなるため）。無いときは行を出さない。
- `note-too-long` のときは、プレビューを出さず、既存の失敗の表示（`formatNodeMergeFailureNotice`）を状態文言とエラーに使う。確定ボタンは無効。
- `components/layout/NodeMergeDialog.tsx` は、プレビューの行を増やす表示だけ変える（`dt` は `shrink-0`、`dd` は既存の上限つきの高さの規則に従う）。

## 8. テスト方針

- ドメイン（TDD）: `nodeNote`（空白だけ・サロゲート・上限・`replaceNodeNote` の無変更・不在・キー除去）、`mapDocumentNodeNote`（版・型・上限・正規化・上限判定が先）、`mapDocumentNode` の往復（JSON 書き出し→読み込み、旧版は無視、上限超過は拒否）、`mapConflict`（メモだけが違う 2 文書を別物と判定）、`nodeMerge`（連結の順序・空のスキップ・メモ 1 つだけ・全員なし・上限ちょうど・上限超過で `note-too-long`・`isSameNodeMergePlan`・`applyPlanToSurvivor` のキー除去）、`nodeSplit`・`nodeSubtreeInsertion`（メモの扱いを固定）。
- フック: `useNodeLayoutState.applyNonStructuralPreview`（グループ中は履歴に積まない・グループ外は積む・自動配置でも動く）、`useNodes` の `previewNodeNote`（戻り値・同値・グループ中は履歴に積まない・グループ外は 1 回の履歴・Undo 1 回）、`useNodeNoteEditing`（フォーカス→入力→デバウンス→`blur` で 1 回・`Escape` で戻す・IME 変換中は走らず `compositionend` の後に反映される・アンマウントで、`lease` が有効なら反映してグループを閉じ、失効している（文書の入れ替え）ときは反映しない・二重確定が起きない・2 秒の打ち切り）。デバウンスは fake timers で固定する。
- コンポーネント: `NodeNoteSection`（未選択・複数選択・上限・無効状態・ラベルの関連付け）、`NodeNoteEditor`（ID・`documentRevision` で作り直す）、`NodeDetailPanel`（見出しの順・イラストの機能が従来どおり・アウトライン表示で複数選択の文言を出さない）。既存の `IllustrationPanel` のテストは、外側の `aside` から `section` への変更に合わせて更新する。
- ページ統合: メモを書いて別ノードを選び戻しても残る、Undo で 1 回で戻る、JSON を書き出して取り込むと戻る、統合でメモが連結される、`textarea` 内のキーでマップが動かない、ダイアログを開くとパネルも `inert`。
- ページ統合のテスト用の型: `app/testing/pageTestHelpers.tsx` の `ExportedNode`（書き出した JSON を読む型）と `V3SeedNode`（種データの型）に `note?: string` を足す（`createTestNode` は `Partial<Node>` なので変更不要）。
- 部品とフックの接続: `NodeNoteEditor` のテストは、実際の DOM イベント（`focus`・`input`・`compositionstart`／`compositionend`・`keydown` の `Escape`・`blur`）と fake timers で書く（フックの単体テストはハンドラを直接呼ぶので、`textarea` までの接続の外れを見逃す。L-737）。入力から 300ms 後の反映、`compositionend` の後の反映、`blur` での即時反映、`Escape` での取り消し、**`blur` を起こさずに外れたとき（キャンバスで別ノードを選ぶ経路）も下書きが反映される**こと、文書の入れ替えでは反映されないことを検査する。ページ統合のテストでも、`blur` を明示せずに別ノードを選んで戻してメモが残ることを確かめる。
- ミューテーションの観点: 上限の境界（ちょうど・1 超過）、`blur` の二重確定、デバウンスの打ち切り、キー除去（`note: undefined` を残さない）を、外すと落ちるテストで固定する。

## 9. 知見（実装時に気をつける ID）

L-453（同一ハンドラ内の連続更新）、L-454（更新関数の省略引数が既存項目を消す）、L-135（同値の更新を履歴に積まない）、L-036（確定時の再計画をプレビューと照合する）、L-473（Enter/Escape と `blur` の二重確定）、L-474（IME 変換中の誤発火）、L-399（デバウンスの上限）、L-588（文書の入れ替え後に古い状態を当てない）、L-636（UTF-16 の途中で切る）、L-443（上限の判定を走査より先に）、L-160（上限を全件のように見せない）、L-522（ショートカットが入力先で誤判定）、L-737（部品とフックの接続をフックの単体テストだけで済ませない）、L-459（旧版が新しい項目を落とす: 本機能では対象外と明記）。

## 10. ドキュメント更新

- `docs/specifications/features.md`: 新章（詳細メモ）、履歴の表、保存形式の説明（V3 に任意項目 `note` を足したこと）、右パネルの説明、統合の章の属性の扱い。
- `docs/architecture/overview.md`: 新しいファイルの一覧と件数、右パネルの構成、保存形式の項目。
- `docs/testing/browser-test-cases.md`: AF 節（メモの入力・`Escape`・Undo・別ノード・JSON 往復・統合・IME・長文）。
- `ROADMAP.md`: 候補011 の完了と現在地（次は候補012「URLの添付」）、最終更新日。`README.md`・`client/README.md`・`docs/README.md` の機能一覧を更新する。
- `types/node.ts` のコメントに、メモ（`note`）の扱いを見直す箇所を追記する。
