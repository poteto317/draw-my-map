# URLの添付（候補012）設計

作成日: 2026-11-17。対象: Phase 18 の候補012「URLの添付」。前提: 候補011「詳細メモ」（右パネル「ノードの詳細」・任意項目 `note` の作り・保存形式 V3 への項目追加・統合/分割/複製との整合）。状態: サブエージェントレビュー 2 周通過・自動承認済み（設計確定）。

## 決めたこと（ユーザー確認済み）

1. **数**: 1 ノードに**複数（最大 10 件）**の URL を付けられる。
2. **表示名**: 付けない。**URL だけ**を保存し、一覧には URL を表示する（説明は詳細メモに書く）。
3. **許可する種類**: **`http` と `https` のみ**。`javascript:`・`data:`・`file:`・`mailto:` などは保存・読み込み・貼り付けのすべてで拒否する。リンクは新しいタブで `noopener noreferrer` を付けて開く。
4. **範囲**: 最小構成（保存・Undo / Redo・複製・コピー＆貼り付け・別マップへの枝の移動・分割・統合との整合と、右パネルでの追加・削除・開く）に加えて、**キャンバスの「リンクあり」の印**と、**ノード検索に URL を含める**ことを含める。アウトライン書き出し・画像書き出しへの URL の反映は含めない。

### 設計中に決めたこと

- **項目**: `Node.links?: readonly string[]`（読み取り専用の配列。`push` などで書き換えない。統合の計画・保存の正規化の戻り値・`ExportedNode` も同じ型にそろえる）。V3 のまま任意項目として足す（版は上げない。`note` と同じ）。リンクの無いノードでは**項目ごと持たない**（空配列を持たない）。値は**正規化した URL（`URL.href`）**だけを入れる。
- **単一の解釈（L-018）**: 検証と保存と「開く」は**同じ `new URL(...).href`** を使う。入力の文字列を検証して、別の文字列を開かない。
- **検証の規則**（`normalizeNodeLinkUrl`）: ①前後の空白を削る。空は拒否。②長さの上限は **2,048 文字**。**入力（前後の空白を削った後）の `length` を解析より先に判定し（L-443）、解析した後の `href` の `length` にも同じ上限を掛ける**（パーセントエンコードで `href` は入力より長くなる。入力が上限内でも `href` が超えるものは拒否する。保存した値は常に上限内で、読み込みで拒否されない）。③`new URL(入力)` が例外なら拒否（相対 URL・スキーム無しも拒否。スキームを補わない）。④`protocol` が `http:` か `https:` 以外は拒否。⑤**資格情報つき**（`username` / `password` が空でない。`https://user:pass@host`）は拒否する（秘密を保存・表示しない。L-032）。⑥成功値は `url.href`（スキームとホストは小文字、ホストは punycode、空白などはパーセントエンコード、パスが空なら `/`）。
- **重複**: 同じノードの中で、正規化した URL が同じものは追加できない（`duplicate`）。読み込みでは後のものを捨てる（保存時に重複を作らないので、正常な文書には現れない）。
- **追加・削除の履歴**: 追加・削除はそれぞれ**即時に 1 回の履歴**になる（メモのような途中反映・履歴グループは使わない。1 回の操作が 1 つの URL の追加／削除だから）。
- **操作の入口**: 右パネルの「リンク」節だけ（ノードの右クリックメニューやショートカットは足さない）。対象は**主選択の 1 ノード**。
- **キャンバスの印**: リンクが 1 件以上あるノードに、小さな印を描く（キャンバス表示専用。画像書き出し・アウトラインには出さない。§6）。
- **検索**: ノード検索の対象に URL を加える。ラベルでも URL でも一致するときはラベル一致として扱い、URL だけが一致したときは結果に「URL」の表示を付ける。一致は既存と同じ正規化（NFKC＋小文字化）で、**パーセントエンコードを戻した形（`decodeURI` を試す）でも一致**する（パス・クエリの日本語は日本語で検索できる。IDN のホストは punycode の形だけ。）

---

## 1. 目的と境界

資料や Web ページを、ノードに関連付けて持てるようにする。キャンバスの見出しを短く保ちながら、根拠となる URL を開けるようにする。

### 対象外（YAGNI）

- URL の表示名（タイトル）、ページタイトルの自動取得、リンク先の存在確認、favicon・プレビューの表示（外部への通信を一切しない）。
- `mailto:` など `http`/`https` 以外のスキーム、スキーム補完（`example.com` を `https://example.com` にしない）。
- キャンバス上のリンクの直接クリック（印は表示のみ。開くのは右パネルから）。
- アウトライン書き出し・画像書き出し・ラベル検索の結果の一括置換（`nodeLabelReplace`）への URL の反映。
- 出典情報（候補054）・タグ（候補023）・Markdown メモ（候補053）。
- 複数ノードへの URL の一括追加。

## 2. 既存実装の調査と制約

- `Node`（`types/node.ts`）。属性を足すときの見直し箇所はコメントにある（分割・統合・複製・保存形式・エクスポート）。`note`（候補011）の足し方が先例: `normalizeMapDocumentNodeNote`（V3 だけ読む・上限を先に判定）、`projectMapDocumentNode`、`mapConflict.areNodesEqual`、`nodeMerge`（計画・プレビュー・`isSameNodeMergePlan`・`applyPlanToSurvivor`）、`withNodeNote`。
- **履歴**: `domain/history/mapHistory.ts` の `areNodesEqual` は全キーを `!==`（参照）で比べる。配列の `links` は、内容が同じでも別の配列なら「違う」になり、実変更が無いのに履歴が積まれる。要素ごとの比較に直す（§3.5）。
- `mapConflict.ts` の `areNodesEqual` は項目を並べて比べる。`links` を足す。
- **右パネル**: `NodeDetailPanel`（上にメモ `NodeNoteEditor`、下に `IllustrationPanel`）。`documentRevision` を含む `key` でテキスト欄を作り直す作り（`NodeNoteEditor`）。
- **描画**: `components/map/pixi/renderMapNodes.ts` がノードごとに `Container` を作る（形・イラスト・ラベル）。Pixi はテストでモックされる。
- **検索**: `domain/search/nodeLabelSearch.ts`（`createNodeSearchIndex`・`searchNodeLabels`・`NodeSearchMatch`）、`hooks/useNodeLabelSearch.ts`、`components/layout/NodeSearchBox.tsx`（`role="combobox"`・`listbox`・`optionName(match)`）。
- ショートカットは `isInteractiveTarget`／`isEditableTarget` で、入力欄・ボタン・リンクの内側では動かさない。
- 既存に外部リンクを開く UI は無い。

## 3. ドメイン

### 3.1 URL の規則（`domain/nodes/nodeLink.ts`）

- 定数: `NODE_LINKS_MAX_COUNT = 10`、`NODE_LINK_MAX_LENGTH = 2048`。
- `normalizeNodeLinkUrl(input: string): NodeLinkUrlResult`。`NodeLinkUrlResult = { ok: true; url: string } | { ok: false; reason: NodeLinkUrlFailureReason }`。`NodeLinkUrlFailureReason = "empty" | "too-long" | "invalid" | "unsupported-scheme" | "has-credentials"`。検査の順は「前後の空白を削る → 空（`empty`）→ 入力の長さ（削った後の `length` が上限超過なら `too-long`）→ `new URL`（例外は `invalid`。`http:`/`https:` はホストが空だと例外になるので、ホストの検査は別に置かない）→ `protocol`（`unsupported-scheme`）→ 資格情報（`has-credentials`）→ `href` の長さ（上限超過なら `too-long`）」。成功値は `url.href`。
- `isNodeLinkUrl(value: unknown): value is string` — 文字列で、`normalizeNodeLinkUrl(value)` が成功し、成功値が `value` と**一致**する（正規化済みの値かどうか）。**描画の再確認（`toSafeLinkHref`）とテストで使う**。保存・読み込みの検査は §3.2（正規化して受け入れる）で、これは使わない。
- `toSafeLinkHref(value: string): string | null` — 描画用。`isNodeLinkUrl(value)` が真なら `value`、偽なら `null`（`href` に危険な値を渡さない。保存データが検証済みでも、描画で再確認する）。
- `AddNodeLinkOutcome` と、`mapConflict`・統合で共有する `areNodeLinksEqual(a, b)`（要素ごとの比較。`undefined` と空は同じ扱い）も、このファイルに置く。
- `formatNodeLinkFailure(reason: Exclude<AddNodeLinkFailureReason, "empty">): string`（利用者向けの文言。§5.2。`empty` は部品が文言を出さないので引数に取らない）。
- 追加・削除の規則: `addNodeLink(nodes, id, input): AddNodeLinkResult` と `removeNodeLink(nodes, id, url): Node[] | null`。
  - `AddNodeLinkFailureReason = NodeLinkUrlFailureReason | "node-missing" | "duplicate" | "too-many"`。`AddNodeLinkResult = { ok: true; nodes: Node[] } | { ok: false; reason: AddNodeLinkFailureReason }`。検査の順は「node-missing → URL の検査（上の理由）→ duplicate → too-many」。成功時は対象ノードの `links` に末尾追加した新しいノードを返す（ほかのノードは同じ参照）。
  - `removeNodeLink` は対象が無い・その URL を持たないとき `null`（何も変えない）。最後の 1 件を消すときは `links` を**キーごと外す**（空配列を残さない）。キーを外すには `note` と同じく分割代入（`withNodeNote` と並べて 1 つのヘルパーにしない: 別の項目なので別関数 `withNodeLinks(node, links: readonly string[] | undefined)`。`undefined` または空配列ならキーを外す）。
  - 返す `nodes` は、変更したノード以外は元の参照のまま。

### 3.2 保存形式（`domain/persistence/`）

- `mapDocumentNodeLinks.ts`: `normalizeMapDocumentNodeLinks(links, index, version): MapDocumentResult<string[] | undefined>`。`version !== 3` または `links === undefined` は `undefined`（以前の版では、あっても無視する）。配列でない・**件数が 10 を超える**・要素が文字列でない・**どれかの要素が（前後の空白を削る前の）`length` で上限（2,048）を超える**・`normalizeNodeLinkUrl` が失敗する（URL の規則に合わない。`href` が上限を超えるものを含む）は失敗（`node[${index}].linksは、http または https の URL（2048文字以内）の配列（最大10件）である必要があります。`）。件数と各要素の `length` は、正規化（`new URL`）より先に判定する（L-443）。成功したら各要素を `normalizeNodeLinkUrl` が返した**正規化した値**（正規化前の `https://example.com` は `https://example.com/` になる）にし、重複は後のものを捨て、空になれば `undefined`。
- `mapDocumentNode.ts`: `normalizeMapDocumentNode` が上を呼び、成功値があるときだけ `projectMapDocumentNode` へ渡す。
- `mapDocumentNodeProjection.ts`: `links` があるときだけ項目を出す。
- `mapConflict.ts` の `areNodesEqual`: `links` を要素ごとに比べる（`(a.links ?? [])` と `(b.links ?? [])` の長さと各要素）。
- クリップボード（`domain/clipboard/`）の貼り付けは `normalizeMapDocumentNode(…, 3)` を通るので、同じ検証が働く。

### 3.3 統合（`domain/nodes/nodeMerge.ts`）

- 計画に `links: string[] | undefined`（連結結果）と `linkSourceCount: number`（URL を持つノードの件数）、`linkDuplicateCount: number`（重複で捨てる件数）を足す。`links` は、選択中のノードを**配列順**に見て、各ノードの `links` を順に並べ、**最初に出てきたものを残して重複を除いた**もの。1 件も無ければ `undefined`。
- 失敗の理由に `links-too-many` を足す。検査の順は `note-too-long` の後（既存の最後）。重複を除いた件数が 10 を超えたら失敗（黙って切り詰めない）。
- `applyPlanToSurvivor` は `withNodeLinks` で、`plan.links` が `undefined` ならキーを持たせず、それ以外なら写す（残すノードが持っていた URL は連結結果に含まれる）。
- `isSameNodeMergePlan` に `links`（要素ごと）・`linkSourceCount`・`linkDuplicateCount` の一致を足す（L-036）。
- 失敗の文言（`nodeMergeMessages.ts`）: 「URLをまとめると件数の上限（10 件）を超えるため、統合できません。」`never` による網羅性も保つ。
- 数値は定数から組み立てる（`NODE_LINKS_MAX_COUNT`）。

### 3.4 分割・複製・貼り付け・親の挿入

- 分割は変更しない。最初の断片（元のノード）に `links` が残り、新しい断片は持たない。テストで固定する。
- 複製・貼り付け・別マップへの枝の移動（`...source`／`...node`）は `links` を写す。配列は不変として扱うので、参照を共有してよい。テストで固定する。
- 親の挿入で作る新しい親は `links` を持たない（`nodePlacement.ts` のコメントに追記）。

### 3.5 履歴の比較（`domain/history/mapHistory.ts`）

- `areNodesEqual` は、値が配列のキーを**要素ごと**に比べる（長さと各要素が `===`）。配列以外は従来どおり `!==`。`links` の内容が同じなのに履歴が積まれないようにする。

### 3.6 検索（`domain/search/nodeLabelSearch.ts`）

- 索引の型: `NodeSearchIndexEntry = Omit<NodeSearchMatch, "matchedBy"> & { normalizedLabel: string; normalizedLinks: readonly string[] }`（索引の段階では、どちらで一致するかは決まらない。`matchedBy` は検索結果を作るときに付ける）。
- `normalizedLinks`: `links` が無ければ空配列（共有の定数）。あれば各 URL について「`normalizeNodeSearchText(url)` と、`decodeURI` が成功するときその結果の `normalizeNodeSearchText`」を順に並べた配列（`decodeURI` が例外のとき（不正なパーセントエンコード）はエンコードのままだけ。同じ文字列は 1 つにする）。索引はノードが変わるたびに作り直されるので（移動など）、`links` の配列の参照を鍵にしたモジュール内の `WeakMap` で結果を使い回す（`links` が変わらないノードでは `decodeURI` と正規化を繰り返さない）。
- `NodeSearchMatch` に `matchedBy: "label" | "link"` を足す。`searchNodeLabels` は、`normalizedLabel` が一致すれば `"label"`、そうでなく `normalizedLinks` のどれかが検索語を含めば `"link"`。件数（`total`）には両方を数える。URL ごとに別の要素なので、**URL の区切りをまたぐ一致は起こらない**（検索語に改行が入っても、1 つの URL の中だけで比べる）。
- 一致の範囲: パス・クエリの日本語は、日本語の検索語で一致する（`decodeURI` で戻す）。IDN のホストは punycode の形（`xn--…`）でだけ一致する（既知の制限）。
- 関数名・ファイル名は変えない（`searchNodeLabels` は URL も検索する旨をコメントで足す）。ノードの置換（`nodeLabelReplace`）は変えない。

## 4. フック（`useNodes`）

- `addNodeLink(id, input): AddNodeLinkOutcome` — `AddNodeLinkOutcome = { ok: true } | { ok: false; reason: AddNodeLinkFailureReason }`（ドメインの `AddNodeLinkResult` はノード配列を含むので、フックの戻り値には使わない。統合の `MergeNodesResult` と同じ分け方）。最新の状態（`getCurrentState`）からドメインの `addNodeLink` で判定し、成功のときだけ `applyNonStructuralChange` で確定する（判定と確定はどちらも同期で、同じ最新の状態を読む）。成功なら 1 回の履歴。**失敗の理由を呼び出し元へ返し、何も変えない**。最新の状態から判定する（同じイベント内の連続操作でも古い値を使わない。L-453）。
- `removeNodeLink(id, url): boolean` — `removeNodeLink` を `applyNonStructuralChange` で 1 回の履歴にする。受理したかを返す。
- 既存の `useNodeLayoutState.applyNonStructuralChange` を使う（`preview` 版は不要）。

## 5. パネル

### 5.1 構成と表示

- `components/layout/NodeLinksSection.tsx`（新）: 表示とフォームの状態（入力欄の下書き・エラーの文言・フォーカス）を持つ。`NodeDetailPanel` が、**メモの節とイラストの節の間**に置く。ノードが選択されているときは**ノードの ID だけ**の `key={`links:${node.id}`}` で作り直す（別のノードの下書きを引き継がない。兄弟の `NodeNoteEditor` の key と重ならないよう接頭辞 `links:` を付ける）。`documentRevision` は key に含めず props で渡し、節の中で描画中に前回の世代（`useState` で持つ）と比べ、変わったら入力欄の下書きとエラーの文言だけを空にする（React の「props の変化に応じた state の調整」の書き方。既存の `useReannouncedNotice` と同じ。L-588）。key に含めて作り直すと、リンク（`<a>`）や「削除」ボタンにあったフォーカスが `body` へ落ち、続けて押したキーがマップの操作になるため（L-155。`<a>`・`<button>` は `isEditableTarget` の対象外で、`Ctrl/Cmd+Z` のマップの Undo が動く）。未選択（key は `links:none`）では案内だけを出し、**入力欄とボタンは描かない**（無効にもしない。フォーカスを持つ要素が無いので、L-155・L-157 に触れない）。
- 見出し「リンク」（`<h2>`）。未選択は「ノードを選択してください」。選択中は対象ノードの表示ラベル（メモの節と同じ）。
- **一覧**: `links` を順に出す。各行は `<a href={toSafeLinkHref(url)} target="_blank" rel="noopener noreferrer">`（`toSafeLinkHref` が `null` のときは `<span>` で文字だけ出す）で URL を表示し（`truncate`、`title` に全文）、横に「削除」ボタン（`aria-label="リンクを削除: {URL}"`）。件数「N / 10 件」。0 件のときは「リンクはありません」。
- **追加フォーム**: `<label>`「URLを追加」つきの `<input type="url">`（`autoComplete="off"`、`maxLength` は付けない。長さは `normalizeNodeLinkUrl` が判定する。貼り付けた長い文字列を黙って切らない）と「追加」ボタン。**入力欄とボタンは `disabled` にしない**（フォーカスを持つ要素が無効になって `body` に落ちるのを避ける。L-155・L-157）。10 件に達したら、件数の表示の横に「上限（10 件）に達しました」を `role="status"` で出し、追加を試みたときは `too-many` のエラーを出す（§5.2）。
- **追加の確定**: 入力欄と「追加」ボタンを `<form noValidate onSubmit>` に入れ、**確定は送信の 1 か所**にする（`type="url"` のブラウザの検証の吹き出しを出さず、独自の文言（§5.2）を使う。`MapLibraryNameForm` と同じ作り）。`keydown` は確定せず、`Enter` が**変換中（`isComposing`・`keyCode === 229`）または `event.repeat`** のときに `preventDefault` して送信を止めるだけにする（二重確定を避ける。L-474・L-408・L-473）。**前後の空白を削った入力が空**のときは何もせず（エラーも出さず、`addNodeLink` を呼ばない）。成功したら入力欄を空にし、フォーカスは入力欄に残す。失敗したら入力は残し、`role="alert"` で理由を出す（文言は §5.2）。入力を変えたらエラーを消す。
- **削除の後のフォーカス**: 押したボタンは消えるので、フォーカスを**入力欄**へ移す（`body` に落とさない。L-155）。入力欄は常に有効なので、クリックの処理の中で `focus()` を呼べる（10 件から 9 件になるときも同じ）。
- 複数選択でも対象は主選択（メモの節と同じ。件数の文言は出さない。メモの節が出す）。
- ダークモード・a11y はメモの節に合わせる。

### 5.2 失敗の文言（`formatNodeLinkFailure`）

- `empty`: 出さない（空は何もしない）。
- `too-long`: 「URLが長すぎます（2,048 文字まで。日本語などはエンコードで長くなります）。」
- `invalid`: 「URLの形式が正しくありません。https:// から始まる URL を入力してください。」
- `unsupported-scheme`: 「http または https の URL だけを追加できます。」
- `has-credentials`: 「ユーザー名やパスワードを含む URL は追加できません。」
- `duplicate`: 「同じ URL がすでに追加されています。」
- `too-many`: 「リンクは 1 つのノードに 10 件まで追加できます。」
- `node-missing`: 「ノードが見つかりません。」
- 上限の数値は定数から組み立てる。`never` による網羅性を保つ。

### 5.3 MapEditor の配線

- `NodeDetailPanel` の `selectedNode` の型に `"links"` を足し（`Pick<Node, "id" | "label" | "note" | "links" | "illustration">`）、props に `onAddLink: (id: number, input: string) => AddNodeLinkOutcome` と `onRemoveLink: (id: number, url: string) => boolean` を足す。
- `MapEditor` は `addNodeLink`・`removeNodeLink` を `NodeDetailPanel` へ渡すだけ（配線のみ）。

## 6. キャンバスの印（`components/map/pixi/renderMapNodes.ts`）

- `node.links` が 1 件以上のノードに、`createNodeLinkMarker`（新しい小さな関数）で印の `Graphics` を作り、`container` に足す。位置はノードの**右上の角**に重ねる（中心 `(x + width, y)`、半径 6 の塗りつぶしの円。既存のノードの枠と同じ青 `0x3b82f6`、白い縁）。ノードの枠の角にまたがるので、ラベル（折り返し幅は `width - 16`）にもイラスト（中央）にも重ならない。選択・接続先の色には影響されない。`contentAlpha`（並べ替えのドラッグ中の半透明）は印にも同じ値を使う。
- 印は**表示専用**。`eventMode` は親の `Container` のままで、クリックはノードのクリックとして扱う。
- 画像書き出し（`mapSvgNodes.ts`・PNG）とアウトライン書き出しには出さない（既知の制限。URL の有無は画像では読み取れない）。
- Pixi のテスト用モック（`components/map/pixi/testing/pixiTestHarness.ts` と `components/map/testing/mapStageTestRuntime.tsx`。`pageModuleMocks.ts` の `createPagePixiModuleMock` も後者を使う）の `Graphics` に `circle: jest.fn().mockReturnThis()` を足す（無いと、リンクを持つノードを描くページ統合のテストが `TypeError` で落ちる。印を描くタスクに含める）。
- 印の描画は Pixi のモック（`pixiTypes` の `Graphics`）でテストする: リンクありのノードに限って `Graphics` が 1 つ増える。

## 7. 検索の UI（`NodeSearchBox`・`useNodeLabelSearch`）

- `NodeSearchListItem` は `NodeSearchMatch` を含むので `matchedBy` が使える。
- 結果の行の補助行は「ルート／親: X」「 · 非表示」「 · URL 一致」の順（`matchedBy === "link"` のときだけ最後に「 · URL 一致」）。`optionName(match)`（`aria-label`）は `label（親: X、非表示、URL 一致）` の形で、該当するものだけを並べる。
- 状態文言・入力欄の `aria-label`・placeholder は変えない（既に「ノードを検索」）。

## 8. 既存機能との接続

| 機能 | 扱い |
| --- | --- |
| 保存・読み込み・JSON | `links` を V3 の任意項目として往復する（§3.2）。旧データ・V1/V2 は `links` なし |
| Undo / Redo | 追加・削除が 1 回ずつの履歴。`areNodesEqual` を配列対応にする（§3.5） |
| 複製・コピー＆貼り付け・別マップへの移動 | URL も写る（§3.4）。貼り付けでは検証が働く |
| 分割 | 元のノードに残し、新しい断片には付けない |
| 統合 | 配列順に連結し重複を除く。10 件超は統合できない。プレビューに件数を出す |
| 親の挿入 | 新しい親は URL を持たない |
| 競合検出 | `mapConflict` の比較に `links` を含める |
| 検索 | URL も検索する（§3.6・§7） |
| 一括置換 | 変更なし（ラベルだけ） |
| アウトライン書き出し・画像書き出し | 変更なし |
| ショートカット | `<input>` の内側では動かさない（既存の判定）。`<a>`・`<button>` にフォーカスがあるときのキーは、既存のボタンと同じ扱い（ツリー編集のキーは動かさず、`Ctrl/Cmd+Z` などの履歴は動く）。履歴が動いて `documentRevision` が変わっても、リンクの節は作り直さない（§5.1。フォーカスを `body` へ落とさない）。成功した Undo / Redo は選択を解除するので、節は未選択の案内に切り替わり、続けて `Delete` を押しても選択が無いのでノードは消えない |

## 9. 統合ダイアログのプレビュー

- `nodeMergePreview.ts` に URL の行を足す: URL を持つノードが 1 つ以上あるときだけ「URL: {件数} 件（重複 {M} 件を除く）」（重複が 0 件なら括弧を出さない）。URL 本文は出さない。
- `links-too-many` のときは、プレビューを出さず既存の失敗の表示を使う。確定は無効。
- `NodeMergeDialog.tsx` は行を増やす表示だけ変える。

## 10. テスト方針

- ドメイン（TDD）: `nodeLink`（スキーム・資格情報・相対 URL・長さの境界（入力が上限ちょうど／1 超過、**入力は上限内だが `href` が上限超過**）・空白・大文字のホスト・日本語のパス・punycode・`isNodeLinkUrl`・`toSafeLinkHref`・`addNodeLink` の各失敗の順序・重複・10 件目と 11 件目・`removeNodeLink` のキー除去・同値でない参照の扱い）、`mapDocumentNodeLinks`（版・型・件数・長さが先・不正な要素・正規化・重複の除去・空）、`mapDocumentNode` の往復、`mapConflict`、`nodeMerge`（連結の順序・重複・10 件ちょうど・11 件で `links-too-many`・`isSameNodeMergePlan`・キー除去）、`mapHistory.areNodesEqual`（配列の同値・差）、`nodeLabelSearch`（URL 一致・ラベル優先・デコード一致・不正なエンコード・`total`）、`nodeSplit`・`nodeSubtreeInsertion`・`nodeParentInsertion`・クリップボード（`links` の扱いを固定）。
- フック: `useNodes.addNodeLink`・`removeNodeLink`（戻り値・同値・1 回の履歴・Undo・最新の状態・連続 2 回の追加）、`useNodeLabelSearch`。
- 部品: `NodeLinksSection`（一覧・追加・失敗の表示・`Enter`・変換中と `repeat` で確定しない・上限・削除後のフォーカス・`toSafeLinkHref` が `null` のとき `<a>` を出さない・`rel`／`target`・`documentRevision` が変わると作り直さずに下書きとエラーだけを消し、要素とフォーカスを保つ）、`NodeDetailPanel`（メモとイラストの間・ノードの ID が変わると作り直して別ノードの下書きを引き継がない・`documentRevision` では作り直さず削除ボタンのフォーカスを保つ）、`NodeSearchBox`（URL 一致の表示）、`renderMapNodes`（印の有無）。部品とフックの接続は実際の DOM イベントで固定する（L-737）。
- ページ統合: URL を追加して別ノードを選び戻しても残る、Undo で 1 回で戻る、JSON の往復、`javascript:` を拒否、統合で連結される、複製で写る、検索で URL から見つかる、`<input>` 内のキーがマップに漏れない、リンクの「削除」ボタンにフォーカスして `Ctrl+Z`（マップの Undo が動く）→ 続けて `Delete` を押してもノードが消えない、ダイアログ表示中は `inert`、アウトライン表示でもパネルが使える。
- ページ統合のテスト用の型: `app/testing/pageTestHelpers.tsx` の `ExportedNode` に `links?: readonly string[]` を足す（`V3SeedNode` は `Partial<ExportedNode>`）。
- 既存テストの期待値: 型に必須の項目を足すタスクで、既存のテストの期待値も直す（検索の `nodeLabelSearch.test.ts`・`useNodeLabelSearch.test.ts`・`NodeSearchBox.test.tsx` の `parentLabel` を持つリテラルに `matchedBy`、統合の計画・プレビューの `toEqual` に `links`・`linkSourceCount`・`linkDuplicateCount`・URL の行。L-609）。
- フォーカスの境界: 9→10 件の追加直後と 10→9 件の削除直後にフォーカスが入力欄にあること。
- ミューテーションの観点: スキームの許可リスト、資格情報の拒否、上限の境界、`href` を正規化後の値で作ること、`areNodesEqual` の配列比較、`links` のキー除去、検索の `matchedBy` の優先順位を、外すと落ちるテストで固定する。

## 11. 知見（実装時に気をつける ID）

L-018（検証に使う値と使う値を同じにする）、L-023（入力の複数箇所）、L-032（資格情報を含みうる入力）、L-078（URL の同一性）、L-443（上限の判定を走査より先に）、L-036（確定時の再計画とプレビューの照合）、L-453・L-454（連続更新・更新関数の引数）、L-135（同値の更新を履歴に積まない）、L-474・L-408（IME・キーリピート）、L-155（操作した要素が消えたときのフォーカス）、L-588（文書の入れ替え後に古い状態を当てない）、L-737（部品とフックの接続）、L-160（上限を全件のように見せない）、L-522（ショートカットの入力先）、L-609（既存テストの洗い出しと現状固定の RED の分離）、L-203（仕様書・README・手順書の並んだ全箇所）、L-825（比較項目の docs の列挙）、L-157（無効な要素へのフォーカス）、L-057・L-161（`type="url"` のブラウザ検証と独自の検証）。

**属性ごとの扱いの表（L-825 の `satisfies Record<keyof Node, …>`）は、今回は導入しない**（任意の属性は `illustration`・`note`・`links` の 3 つ目になるが、頼まれた範囲を超え、保存形式・統合・分割・複製の既存の扱いを組み替えるため）。導入はタグ（候補023）の設計で判断する。見直し箇所は `types/node.ts` のコメントに残す。

## 12. ドキュメント更新

- `docs/specifications/features.md`: 新章（URLの添付）、履歴の表、保存形式の説明、右パネルの説明、統合の章の属性の扱い、検索の章（URL も検索する）、キャンバスの印。
- `docs/specifications/api.md`: `isDocumentContentEqual` の比較項目の列挙（`note` の追加時にも直されていなかったので、`note`・`links` の両方を足す）。
- `docs/specifications/data-model.md`: `Node` 型・V3 のプロパティ表・版ごとの差分表・エラー表・クリップボード形式に `links`（`note` と並べて）。
- `docs/architecture/overview.md`: 新しいファイルの一覧と件数、右パネルの構成、`useNodes` の更新経路の列挙（`addNodeLink`・`removeNodeLink`）、統合の検査の順と `isSameNodeMergePlan` の比較項目、`mapConflict` の比較項目、`mapHistory.areNodesEqual` の説明（配列を要素ごとに比べる）。
- `docs/testing/browser-test-cases.md`: AG 節（追加・削除・開く・`javascript:` の拒否・上限・Undo・複製・JSON 往復・統合・検索・印・IME・長い URL）と集計表。
- `ROADMAP.md`: 候補012 の完了と現在地（次は候補023「タグ」）、最終更新日。`README.md`・`client/README.md`・`docs/README.md` の機能一覧。
- `types/node.ts` のコメントに `links` の見直し箇所を追記する。
