# タグ（候補023）設計

作成日: 2026-11-17。対象: Phase 18 の候補023「タグ」。前提: 候補011「詳細メモ」・候補012「URLの添付」（右パネル「ノードの詳細」・任意項目の足し方・保存形式 V3 への項目追加・統合/分割/複製との整合・件数と長さの上限・追加/削除のフォームの作り）。状態: サブエージェントレビュー 2 周通過・自動承認済み（設計確定）。

## 決めたこと（ユーザー確認済み）

1. **持ち方**: **ノードごとの文字列（自由入力）**。タグをノードに文字列として持つ。マップ全体のタグ一覧という別の保存項目は持たない（名前の変更・色の管理はしない）。
2. **上限**: 1 ノードに**最大 10 件**、タグ名は**最大 30 文字**（`string.length`＝UTF-16 のコード単位）。
3. **同じタグとみなす規則**: **区別しない**。ゼロ幅結合子 `U+200D` と異体字セレクタ `U+FE0E`・`U+FE0F` を除いてから、ノード検索と同じ正規化（NFKC＋小文字化）に、空白のまとめと trim を加えて比べ、同じノードに重複して付けられない。表示と保存は**最初に入力した表記**のまま。
4. **範囲**: 最小構成（保存・Undo / Redo・複製・コピー＆貼り付け・別マップへの枝の移動・分割・統合との整合と、右パネルでの追加・削除）のみ。**入力候補・ノード検索・表示の絞り込み・キャンバスの印は含めない**（追加範囲は選ばれなかった）。

### 設計中に決めたこと

- **項目**: `Node.tags?: readonly string[]`（`links` と同じ。V3 のまま任意項目。版は上げない。タグの無いノードでは項目ごと持たない。空配列を持たない）。値は**正規化したタグ名**だけを入れる。
- **タグ名の規則**（`normalizeNodeTagName`）: ①前後の空白を削る。空は拒否。②**入力の長さの先行判定**: 削った後の `length` が 256 を超えたら `too-long`（空白の圧縮などの処理より先に、巨大な入力で処理しない。L-443）。③連続する空白（タブ・改行・全角の空白 `U+3000` を含む `\s`）を **1 個の半角スペースにまとめる**。④制御文字を含むものは `invalid`。範囲は `U+0000`〜`U+0008`、`U+000E`〜`U+001F`、`U+007F`〜`U+009F`（`U+0085` を含む）。タブ・改行・VT・FF・CR（`U+0009`〜`U+000D`）は③で空白としてまとめられるので `invalid` にならない（`\s` は NBSP・BOM（`U+FEFF`）・`U+3000` も含み、これらも半角スペースにまとまる）。**不可視の書式文字**: 最終的な判断として、`\p{Default_Ignorable_Code_Point}`（ゼロ幅スペース `U+200B`・双方向制御・`U+2060`〜`U+2064`・ソフトハイフン `U+00AD`・ハングルの埋め字・タグ文字 `U+E0000` 台など）から `U+200D`（ゼロ幅結合子）・`U+FE0E`・`U+FE0F`（異体字セレクタ）を除いたものと、行内注釈の制御 `U+FFF9`〜`U+FFFB` も `invalid`（見た目が同じタグが並ぶ・一覧の並びが崩れるのを避ける。L-816・L-112。文字を列挙すると解釈の差の数だけ漏れる: L-032）。絵文字に要る `U+200D`・`U+FE0E`・`U+FE0F` は受け付ける（書式文字 Cf を一律には拒否しない）が、これらと空白だけで構成され `nodeTagKey` が空になる名前（見た目が空）は `invalid`（使えない文字の検査の直後）。BOM `U+FEFF` は③で空白としてまとまる。対になっていないサロゲートは特別に扱わず受け付ける（サロゲートペアは `length` 2 として数える。絵文字 15 個で 30 文字）。⑤まとめた後の `length` が **30 を超えたら `too-long`**。成功値はまとめた後の名前（大文字小文字・全角半角は変えない。最初の表記を残す）。
- **同一性**（`nodeTagKey(name)`）: `name` から `U+200D`・`U+FE0E`・`U+FE0F` を除き、`normalize("NFKC")` し、連続する空白を半角スペース 1 個にまとめて前後を削り（`normalizeNodeTagName` と同じ規則。3 文字を除くと前後・中に空白が残る名前（`AI` と `AI`＋空白＋`U+200D` など）を同じ鍵にし、見た目が空白だけの名前の鍵を空にする）、`toLowerCase()` した値（名前には許可するが、見た目に現れず NFKC でも消えないので、除かないと見た目が同じタグが別のタグになる。除くのは NFKC より前（この 3 文字は NFKC の合成を止めるので、後で除くと `é` と `e`＋`U+200D`＋`U+0301` のような見た目が同じ並びの鍵が一致しない）。絵文字の `❤` と `❤️` も同じタグになる）。NFKC と小文字化はノード検索（`normalizeNodeSearchText`）と同じ規則だが、`domain/nodes` が `domain/search` に依存しない（検索が `domain/nodes` に依存している）ので、**同じ規則を `nodeTag.ts` に持つ**（コメントで明記）。同じノードの中で `nodeTagKey` が同じタグは追加できない（`duplicate`）。
- **追加・削除の履歴**: 追加・削除はそれぞれ**即時に 1 回の履歴**（`links` と同じ。途中反映・履歴グループは使わない）。
- **並び**: 追加した順（自動で並べ替えない）。
- **操作の入口**: 右パネルの「タグ」の節だけ。対象は主選択の 1 ノード。
- **属性の追加漏れを防ぐ守り（L-825）**: ノードの任意の属性が 4 つ（`illustration`・`note`・`links`・`tags`）になるので、`domain/nodes/nodeAttributePolicy.ts` に**任意の属性だけの扱いの表**を持ち（`satisfies Record<OptionalNodeKey, …>`。足したのに更新しないと型エラー）、さらに**全属性の往復（書き出し→読み込み）と比較（競合判定・履歴）の検査**を 1 つ足す。表は宣言で、各操作の実装を置き換えない。表と実際の振る舞いの一致はテストで固定する（§3.7）。

---

## 1. 目的と境界

親子関係とは別の分類軸（「重要」「資料あり」「Python」など）を、ノードに付けられるようにする。

### 対象外（YAGNI）

- タグでの絞り込み・検索・入力候補・キャンバスの印・アウトライン／画像書き出しへの反映。
- タグの名前の変更・色・マップ全体のタグ一覧の管理・並べ替え・一括付与。
- `#` 始まりの特別な扱い（`#python` はそのまま名前）。
- 複数ノードへの一括追加・削除。

## 2. 既存実装の調査と制約

- 先例は `links`（候補012）と `note`（候補011）。同じ箇所に `tags` を並べて足す。`domain/nodes/nodeLink.ts`（規則・追加・削除・`withNodeLinks`・`areNodeLinksEqual`・`AddNodeLinkOutcome`）、`domain/persistence/mapDocumentNodeLinks.ts`、`mapConflict.ts`、`mapHistory.areNodesEqual`（配列対応済み）、`useNodes.addNodeLink/removeNodeLink`、`nodeMerge.ts`（計画・`isSameNodeMergePlan`・`applyPlanToSurvivor`）、`nodeMergePreview.ts`・`NodeMergeDialog.tsx`、`NodeLinksSection.tsx`（`<form noValidate onSubmit>`・IME と repeat の抑止・`disabled` にしない・削除後のフォーカス・`key={`links:${id}`}` と `documentRevision` を描画中に比べる）、`NodeDetailPanel.tsx`。
- `types/node.ts` のコメントが見直し箇所を列挙している。
- 保存形式・クリップボード・別マップへの移動・複製は `projectMapDocumentNode`／`normalizeMapDocumentNode`／`...source` を通るので、`links` と同じ 3 点（検証・投影・競合判定）に `tags` を足せば往復する。
- 右パネル `NodeDetailPanel` は「メモ → リンク → イラスト」。

## 3. ドメイン

### 3.1 タグの規則（`domain/nodes/nodeTag.ts`）

- 定数: `NODE_TAGS_MAX_COUNT = 10`、`NODE_TAG_MAX_LENGTH = 30`、`NODE_TAG_INPUT_MAX_LENGTH = 256`（入力の先行判定。§「タグ名の規則」②）。
- `normalizeNodeTagName(input: string): NodeTagNameResult`。`NodeTagNameResult = { ok: true; name: string } | { ok: false; reason: NodeTagNameFailureReason }`。`NodeTagNameFailureReason = "empty" | "too-long" | "invalid"`。検査の順は上の規則どおり（trim → empty → 入力の先行判定（too-long）→ 空白を 1 個にまとめる → 使えない文字（制御文字・見えない書式文字。invalid）→ 許可した見えない書式文字（`U+200D`・`U+FE0E`・`U+FE0F`）だけで `nodeTagKey` が空（invalid）→ 長さ（too-long））。
- `nodeTagKey(name: string): string` — 同一性の鍵。
- `uniqueNodeTags(tags: readonly string[]): string[]` — `nodeTagKey` が同じものは最初のものを残して除く。統合 `planNodeMerge` と保存データの検証 `mapDocumentNodeTags.ts` で共有。
- `addNodeTag(nodes, id, input): AddNodeTagResult`。`AddNodeTagFailureReason = NodeTagNameFailureReason | "node-missing" | "duplicate" | "too-many"`。`AddNodeTagResult = { ok: true; nodes: Node[] } | { ok: false; reason: AddNodeTagFailureReason }`。検査の順は「node-missing → タグ名の検査 → duplicate（`nodeTagKey` が同じ）→ too-many」。成功時は対象ノードの `tags` に末尾追加した新しいノードを返す（ほかのノードは同じ参照）。
- `removeNodeTag(nodes, id, tag): Node[] | null` — 対象が無い・そのタグ（完全一致）を持たないとき `null`。最後の 1 件を消すときは `tags` をキーごと外す。
- `withNodeTags(node, tags: readonly string[] | undefined): Node` — `undefined` または空配列ならキーを外す。
- `areNodeTagsEqual(a, b): boolean` — 要素ごと（順も区別。`undefined` は空と同じ）。`mapConflict`・統合で共有。
- `AddNodeTagOutcome = { ok: true } | { ok: false; reason: AddNodeTagFailureReason }`（フックの戻り値。ノード配列を含めない）。
- `formatNodeTagFailure(reason: Exclude<AddNodeTagFailureReason, "empty">): string`（§5.2）。

### 3.2 保存形式（`domain/persistence/`）

- `mapDocumentNodeTags.ts`: `normalizeMapDocumentNodeTags(tags, index, version): MapDocumentResult<readonly string[] | undefined>`。`version !== 3` または `tags === undefined` は `undefined`。配列でない・**件数が 10 を超える**・要素が文字列でない・**どれかの要素が（前後の空白を削る前の）`length` で `NODE_TAG_INPUT_MAX_LENGTH` を超える**・`normalizeNodeTagName` が失敗する（空・使えない文字・長すぎる）は失敗（`node[${index}].tagsは、30文字以内のタグ名の配列（最大10件）である必要があります。`。数値は `NODE_TAG_MAX_LENGTH`・`NODE_TAGS_MAX_COUNT` から組み立てる）。件数と各要素の `length` は正規化より先に判定する（L-443）。成功したら各要素を正規化した値にし、`nodeTagKey` が同じものは**後のものを捨て**、空になれば `undefined`。
- `mapDocumentNode.ts`・`mapDocumentNodeProjection.ts`・`mapConflict.ts`: `links` と同じ形で `tags` を足す。

### 3.3 統合（`domain/nodes/nodeMerge.ts`）

- 計画に `tags: readonly string[] | undefined`（連結結果）・`tagSourceCount: number`（タグを持つノードの件数）・`tagDuplicateCount: number`（重複で捨てる件数）を足す。`tags` は選択中のノードを**配列順**に見て各ノードの `tags` を並べ、**`nodeTagKey` が同じものは最初に出てきたものを残して**重複を除いたもの。1 件も無ければ `undefined`。
- 失敗の理由に `tags-too-many` を足す（検査の順は `links-too-many` の後）。重複を除いた件数が 10 を超えたら失敗（黙って切り詰めない）。
- `applyPlanToSurvivor` は `withNodeTags`、`isSameNodeMergePlan` は `tags`（要素ごと）・`tagSourceCount`・`tagDuplicateCount` の一致を足す（L-036）。
- 失敗の文言（`domain/nodes/nodeMergeMessages.ts` の `formatNodeMergeFailureNotice` に `tags-too-many` を足す）: 「タグをまとめると件数の上限（10 件）を超えるため、統合できません。」`never` の網羅性を保つ。数値は定数から組み立てる。

### 3.4 分割・複製・貼り付け・移動・親の挿入

- 分割は元のノードに `tags` を残し、新しい断片は持たない。複製・貼り付け・別マップへの枝の移動は写す。親の挿入で作る新しい親は持たない。テストで固定する（`links` と同じ）。

### 3.5 履歴の比較

- `mapHistory.areNodesEqual` は配列を要素ごとに比べる（候補012 で対応済み）。`tags` も同じ経路を通る。テストで `tags` の同内容・別配列を固定する。

### 3.6 検索・キャンバス

- 変更しない（対象外）。`types/node.ts` のコメントに、将来タグを検索・描画へ使うときの見直し箇所を残す。

### 3.7 属性の追加漏れを防ぐ守り（`domain/nodes/nodeAttributePolicy.ts` とテスト）

属性を足して扱いを決め忘れると、値が黙って捨てられる（L-825）。最も害が大きいのは、手で項目を並べている箇所（保存時の書き出し `projectMapDocumentNode`（`mapDocumentNodeProjection.ts`）、読み込みの検証、競合判定 `mapConflict.areNodesEqual`、統合の照合）と、分割・統合・親の挿入での扱い。次の 2 つで守る。表は**任意の属性だけ**に限る（座標・大きさ・ID・ラベル・重要度は実際の動作が複雑で、表で宣言しても検査できないため含めない）。

- **任意の属性の表**: `type OptionalNodeKey = { [K in keyof Node]-?: undefined extends Node[K] ? K : never }[keyof Node]`（`illustration`・`note`・`links`・`tags`）。`NodeAttributePolicy = { split: "original-only"; merge: "survivor-else-first" | "joined" | "union"; parentInsert: "none" }`（今は全属性が分割で元のノードにだけ残り、親の挿入で持たない。統合は `illustration`＝`survivor-else-first`、`note`＝`joined`、`links`・`tags`＝`union`）。`export const NODE_ATTRIBUTE_POLICY = { illustration: …, note: …, links: …, tags: … } satisfies Record<OptionalNodeKey, NodeAttributePolicy>`。任意の属性を足して表を更新しないと型エラーになる。値の種類を増やすのは、実際に別の扱いの属性が現れたとき。
- **表の振る舞いの検査**（表を宣言で終わらせない）: 任意の属性をすべて持つ見本のノード（`Required<Node>` 型。属性ごとの見本の値）を用意する。`split` が `"original-only"` の属性は、`splitNode` した断片のノードが項目を持たず、元のノードが値を持ち続ける。`parentInsert` が `"none"` の属性は、`createParentNode` の結果が項目を持たない。`merge` が `"joined"`・`"union"`・`"survivor-else-first"` の属性は、吸収されるノードだけが持つ値が、統合後の残すノードに残る。表を直さず属性の扱いを実装で変えると落ちる。
- **全属性の往復と比較の検査**（必須属性も含む。`Required<Node>` 型の見本が、属性を足すと型エラーになる）: ①見本のノードを `projectMapDocumentNode` してから `normalizeMapDocumentNode`（V3）で読み込むと、見本と `toEqual` になる（書き出し・読み込みの付け忘れで落ちる）。②`Object.keys(見本)` の各キーを 1 つずつ別の値にすると、`mapConflict.isDocumentContentEqual` が `false` になり、`mapHistory.areMapStatesEqual` も `false` になる（比較の付け忘れで落ちる）。
- `types/node.ts` のコメントに「属性を足したら `nodeAttributePolicy.ts` の表と、往復と比較の検査の見本も更新する」を足す。

## 4. フック（`useNodes`）

- `addNodeTag(id, input): AddNodeTagOutcome` — 最新の状態（`getCurrentState`）からドメインの `addNodeTag` で判定し、成功のときだけ `applyNonStructuralChange` で確定する（`addNodeLink` と同じ）。失敗の理由を返し何も変えない。
- `removeNodeTag(id, tag): boolean` — `applyNonStructuralChange` で 1 回の履歴にする。

## 5. パネル

### 5.1 構成と表示

- `components/layout/NodeTagsSection.tsx`（新）: `NodeLinksSection` と同じ作り。`NodeDetailPanel` が、**メモの節とリンクの節の間**に置く（上から「メモ → タグ → リンク → イラスト」）。
- key は `tags:${node.id}`（未選択は `tags:none`）。`documentRevision` は props で受けて描画中に前回の値と比べ、変わったら入力欄の下書きとエラーを消す（作り直さない。フォーカスを失わない。L-588）。未選択では案内だけを出し、入力欄とボタンは描かない。
- 見出し「タグ」（`<h2>`）。対象ノードの表示ラベル（リンクの節と同じ）。件数「N / 10 件」。
- **一覧**: 追加順に、各タグを `<ul>` の項目（`<li>`）として、タグ名と「削除」ボタン（`aria-label="タグを削除: {名前}"`、見た目は小さな「×」）で出す。0 件のときは「タグはありません」。タグ名は文字として出す（HTML として解釈しない。長い名前は折り返す。`title` に全文）。
- **追加フォーム**: `<label>`「タグを追加」つきの `<input type="text">`（`autoComplete="off"`、`maxLength` は付けない。長さは `normalizeNodeTagName` が判定し、貼り付けた長い文字列を黙って切らない）と「追加」ボタンを `<form noValidate onSubmit>` に入れ、**確定は送信の 1 か所**。`keydown` は `Enter` が変換中（`isComposing`・`keyCode === 229`）または `event.repeat` のとき `preventDefault` するだけ。前後の空白を削った入力が空のときは何もしない（エラーも出さず、`addNodeTag` を呼ばない）。成功したら入力欄を空にしてフォーカスを入力欄に残す。失敗したら入力は残し、`role="alert"` で理由を出す。入力を変えたらエラーを消す。**入力欄とボタンは `disabled` にしない**。10 件に達したら件数の横に「上限（10 件）に達しました」を `role="status"` で出し、追加を試みたときは `too-many` のエラーを出す。
- **削除の後のフォーカス**: 押したボタンは消えるので、フォーカスを入力欄へ移す。
- 複数選択でも対象は主選択。ダークモード・a11y はリンクの節に合わせる。
- `NodeDetailPanel` の `selectedNode` の型に `"tags"` を足し、props に `onAddTag: (id: number, input: string) => AddNodeTagOutcome` と `onRemoveTag: (id: number, tag: string) => boolean` を足す。`MapEditor` は渡すだけ。

### 5.2 失敗の文言（`formatNodeTagFailure`）

- `too-long`: 「タグ名が長すぎます（30 文字まで）。」
- `invalid`: 「タグ名に使えない文字が含まれています。」
- `duplicate`: 「同じタグがすでに追加されています。」
- `too-many`: 「タグは 1 つのノードに 10 件まで追加できます。」
- `node-missing`: 「ノードが見つかりません。」
- `empty` は出さない（部品が呼ばない）。数値は定数から組み立てる。`never` による網羅性を保つ。

## 6. 既存機能との接続

| 機能 | 扱い |
| --- | --- |
| 保存・読み込み・JSON | `tags` を V3 の任意項目として往復する（§3.2）。旧データ・V1/V2 は `tags` なし |
| Undo / Redo | 追加・削除が 1 回ずつの履歴。`areNodesEqual`（配列対応済み） |
| 複製・コピー＆貼り付け・別マップへの移動 | タグも写る（§3.4）。貼り付けでは検証が働く |
| 分割 | 元のノードに残し、新しい断片には付けない |
| 統合 | 配列順に連結し重複（同一視）を除く。10 件超は統合できない。プレビューに件数を出す |
| 親の挿入 | 新しい親は持たない |
| 競合検出 | `mapConflict` の比較に `tags` を含める |
| 検索・一括置換・アウトライン／画像書き出し・キャンバス | 変更なし |
| ショートカット | `<input>` の内側では動かさない（既存の判定）。`<button>` にフォーカスがあるときは既存のボタンと同じ扱い |

## 7. 統合ダイアログのプレビュー

- `NodeMergePreview` に `tagText: string | null` を足す（`nodeMergePreview.ts` の `describeTags`。タグを持つノードが無ければ `null`、あれば `"N 件"`、重複があれば `"N 件（重複 M 件を除く）"`。タグ名は出さない。`linkText` と同じ作り）。`NodeMergeDialog.tsx` は、URL の行の後に `<dt>タグ</dt><dd>{preview.tagText}</dd>` の行を出す（`tagText` が `null` のときは行ごと出さない。`dt` は `shrink-0`、`dd` は既存の規則）。
- `tags-too-many` のときはプレビューを出さず、既存の失敗の表示を使う。確定は無効。

## 8. テスト方針

- ドメイン（TDD）: `nodeTag`（空・空白だけ・前後の空白・内部の空白のまとめ（タブ・改行・全角空白）・制御文字・30 文字ちょうど／31 文字・256 文字の先行判定・巨大入力・大文字小文字と全角半角の同一視・サロゲート・`addNodeTag` の各失敗の順序・重複（表記違い）・10 件目と 11 件目・`removeNodeTag` のキー除去と完全一致・`withNodeTags`・`areNodeTagsEqual`）、`mapDocumentNodeTags`（版・型・件数・長さが先・空要素・制御文字・正規化・同一視の重複除去・空）、`mapDocumentNode` の往復、`mapConflict`、`nodeMerge`（連結の順序・同一視の重複・10 件ちょうど・11 件で `tags-too-many`・`isSameNodeMergePlan`・キー除去）、`nodeSplit`・`nodeSubtreeInsertion`・`nodeParentInsertion`・クリップボード・別マップへの移動（`tags` の扱いを固定）、`mapHistory.areNodesEqual`（`tags` の同内容・別配列）、`nodeAttributePolicy`（表の振る舞いの検査・全属性の往復と比較の検査。§3.7）。
- フック: `useNodes.addNodeTag`・`removeNodeTag`（戻り値・同値・1 回の履歴・Undo・最新の状態・連続 2 回の追加）。
- 部品: `NodeTagsSection`（一覧・追加・失敗の表示・`Enter`・変換中と `repeat` で確定しない・上限・削除後のフォーカス・9↔10 件のフォーカス・`documentRevision` で下書きが消える・`<li>` のタグ名が HTML として解釈されない）、`NodeDetailPanel`（メモ・タグ・リンク・イラストの順・key の衝突なし）。部品とフックの接続は実際の DOM イベントで固定する（L-737）。
- ページ統合: タグを追加して別ノードを選び戻しても残る、Undo で 1 回で戻る、JSON の往復、表記違いの重複を拒否、統合で連結される、複製で写る、`<input>` 内のキーがマップに漏れない、ダイアログ表示中は `inert`、アウトライン表示でもパネルが使える。
- 既存テストの期待値: 統合の計画・プレビューの `toEqual`（`tags`・`tagSourceCount`・`tagDuplicateCount`・タグの行）、右パネルの props を渡すテスト、パネルの順を見るテスト（L-609）。
- ページ統合のテスト用の型: `ExportedNode` に `tags?: readonly string[]`。
- ミューテーションの観点: 長さの境界、同一視の鍵（`nodeTagKey`）、空白のまとめ、制御文字の拒否、`tags` のキー除去、`areNodesEqual`、統合の同一視の重複除去を、外すと落ちるテストで固定する。

## 9. 知見（実装時に気をつける ID）

L-018（検証と保存と使う値を同じにする）、L-443（上限の判定を走査より先に）、L-836（正規化後の保存値にも上限）、L-636（UTF-16 の途中で切らない）、L-036（確定時の再計画とプレビューの照合）、L-453・L-454、L-135、L-474・L-408・L-473（IME・キーリピート・二重確定・`noValidate`）、L-155・L-157（フォーカス・無効化しない）、L-588（key と世代）、L-737、L-160、L-522、L-609、L-203・L-825（比べる項目と docs の列挙・属性の扱いの表）、L-838（readonly と型）。

## 10. ドキュメント更新

- `docs/specifications/features.md`: 新章（タグ）、履歴の表、保存形式の説明、右パネルの説明（メモ → タグ → リンク → イラスト）、統合の章の属性の扱い。
- `docs/specifications/data-model.md`: `Node` 型・V3 のプロパティ表・版ごとの差分表・エラー表・クリップボード形式に `tags`（`links` と並べて）。`docs/specifications/api.md` の `isDocumentContentEqual` の比較項目。
- `docs/architecture/overview.md`: 新しいファイルの一覧と件数、右パネルの構成、`useNodes` の更新経路、統合の検査の順と比較項目、`mapConflict` の比較項目、属性の表。
- `docs/testing/browser-test-cases.md`: AH 節と集計表。
- `ROADMAP.md`: 候補023 の完了と現在地（次は候補053「Markdownメモ」）、最終更新日。`README.md`・`client/README.md`・`docs/README.md` の機能一覧。「上に…下に…」「上段・中段・下段」の言い方と、手順書のパネルの順（AF・AG 節の期待を含む）を全文検索して直す。
- `types/node.ts` のコメントに `tags` の見直し箇所と `nodeAttributePolicy.ts` への案内を追記する。`links` を挙げているコード内のコメント（`nodePlacement.ts`・`nodeSplit.ts`・`nodeMerge.ts`・`mapHistory.ts`・`NodeDetailPanel.tsx` ほか。`grep -rn "links" client/src --include='*.ts' --include='*.tsx'` で探す）にも `tags` を足す（L-203）。
