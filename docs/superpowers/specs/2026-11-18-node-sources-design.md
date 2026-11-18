# 出典情報（候補054）設計

作成日: 2026-11-18。対象: Phase 18 の候補054「出典情報」。前提: 候補011「詳細メモ」・候補012「URLの添付」・候補023「タグ」・候補053「Markdownメモ」（右パネル「ノードの詳細」・任意項目の足し方・保存形式 V3・統合/分割/複製との整合・件数と長さの上限・追加/削除のフォームの作り・`NODE_ATTRIBUTE_POLICY`）。状態: サブエージェントレビュー 2 周通過・自動承認済み（設計確定）。

## 決めたこと（ユーザー確認済み・推奨採用）

1. **持ち方**: **構造化レコードの配列**。既存の `links`（URL だけ）とは別の任意属性 `sources` を持つ。マップ全体の書誌一覧は持たない。
2. **1 件のフィールド（初期）**: **タイトル必須**、**ページ任意**、**URL 任意**（`http`/`https` のみ。既存 `normalizeNodeLinkUrl` と同じ規則）。著者・年・引用文は含めない（YAGNI）。
3. **上限**: 1 ノードに**最大 10 件**。
4. **UI**: 右パネル「ノードの詳細」で、**リンクの下・イラストの上**に「出典」節。追加・削除はそれぞれ**即時に 1 回の Undo / Redo**。
5. **検索・キャンバス印**: **初期はどちらも無し**（タグと同様。編集・URL を開くのは右パネルのみ）。

### 設計中に決めたこと

- **項目**: `Node.sources?: readonly NodeSource[]`。無いノードでは項目ごと持たない（空配列を持たない）。V3 のまま任意項目（版は上げない）。
- **型**: `NodeSource = { title: string; page?: string; url?: string }`。任意フィールドは無いときキーごと持たない（空文字・空白だけの `page` / `url` はキーを外す）。
- **タイトルの規則**（`normalizeNodeSourceTitle`）: ①前後の空白を削る。空は拒否。②入力の先行判定: 削った後の `length` が 256 を超えたら `too-long`（L-443）。③連続する空白（`\s`。タグと同じ）を半角スペース 1 個にまとめる。④制御文字と、タグと同じ不可視書式文字の集合を含むものは `invalid`（`U+200D`・`U+FE0E`・`U+FE0F` は許可）。⑤まとめた後の `length` が **200 を超えたら `too-long`**。成功値はまとめた後のタイトル（大文字小文字・全角半角は変えない）。
- **ページの規則**（`normalizeNodeSourcePage`）: 空・空白だけは「無し」（キーを外す）。それ以外はタイトルと同じ空白まとめ・制御／不可視書式の拒否。入力先行 256、正規化後 **80 文字**上限。
- **URL の規則**: 空・空白だけは「無し」。それ以外は **`normalizeNodeLinkUrl` をそのまま使う**（検証と保存と「開く」は同じ `href`。L-018。資格情報拒否 L-032。入力と `href` の両方に長さ上限 L-836）。
- **同一性（重複）**: `nodeSourceKey({ title, page?, url? })` = `タイトルの鍵（NFKC→空白まとめ→小文字化→NFKC。タグの `nodeTagKey` と同じ手順だが、タグ名用の U+200D 除去はタイトルにも適用）` + `"\0"` + `ページの正規化値（無しは空文字）` + `"\0"` + `URL の正規化値（無しは空文字）`。同じノードで鍵が同じ出典は追加できない（`duplicate`）。表示・保存は正規化した title / page / url（最初の表記を残すのはタイトル・ページの空白まとめ後の形。URL は `href`）。
- **並び**: 追加した順（自動並べ替えしない）。
- **操作の入口**: 右パネルの「出典」節だけ。対象は主選択の 1 ノード。
- **属性ポリシー**: `NODE_ATTRIBUTE_POLICY.sources = { split: "original-only", merge: "union", parentInsert: "none" }`（`satisfies Record<OptionalNodeKey, …>`。L-825）。見本 `SAMPLE` / `DIFFERENT` も更新する。
- **知見 ID（実装時）**: L-001, L-018, L-032, L-036, L-155, L-157, L-408, L-443, L-453, L-454, L-474, L-522, L-588, L-609, L-737, L-825, L-836。

---

## 1. 目的と境界

短いノード名の裏側に、書籍名・ページ・引用元 URL などの出典を記録し、根拠を辿れるようにする。詳細メモ（長文）・リンク（URL だけ）・タグ（分類）とは役割を分ける。

### 対象外（YAGNI）

- 著者・発行年・出版社・引用文・DOI・ISBN の専用フィールド。
- マップ全体の書誌一覧、出典マスタ、名前の一括変更。
- ノード検索・キャンバスの印・アウトライン／画像書き出しへの出典の反映。
- ページタイトルの自動取得、リンク先の存在確認、外部への通信。
- 複数ノードへの一括追加・削除、出典の並べ替え UI。
- `links` との自動同期（同じ URL を両方に持つことは許す。重複排除は各属性内のみ）。

## 2. 既存実装の調査と制約

- 先例: `links`（候補012）・`tags`（候補023）。ドメイン・永続化・統合・右パネル・フックの足し方がそのまま使える。
- `NodeDetailPanel` の現順: 詳細メモ → タグ → リンク → イラスト。出典は **リンクとイラストの間**。
- URL 検証は `domain/nodes/nodeLink.ts` を再利用する（規則の二重実装を避ける。L-018）。
- `types/node.ts` のコメントが見直し箇所を列挙している。任意属性を足したら `NODE_ATTRIBUTE_POLICY` と `nodeAttributePolicy.test.ts` の見本も更新する（L-825）。

## 3. ドメイン

### 3.1 出典の規則（`domain/nodes/nodeSource.ts`）

- 定数: `NODE_SOURCES_MAX_COUNT = 10`、`NODE_SOURCE_TITLE_MAX_LENGTH = 200`、`NODE_SOURCE_PAGE_MAX_LENGTH = 80`、`NODE_SOURCE_INPUT_MAX_LENGTH = 256`（タイトル・ページの入力先行判定）。
- `NodeSource` 型（ドメインと `types` で共有。`types/node.ts` に置き、`nodeSource.ts` から re-export してもよいが、`Node` と同じファイルに置くのを推奨）。
- `normalizeNodeSourceTitle` / `normalizeNodeSourcePage` / `normalizeNodeSourceUrl`（URL は内部で `normalizeNodeLinkUrl`。空は「無し」）。
- `normalizeNodeSource(input: { title: string; page?: string; url?: string }): NodeSourceResult`。失敗理由: `empty-title` | `too-long-title` | `invalid-title` | `too-long-page` | `invalid-page` | URL 側の `NodeLinkUrlFailureReason`（`empty` は URL 無しとして成功扱いなので、URL 経路の `empty` は呼び出し側で「無し」にする）。検査順: タイトル → ページ → URL。
- `nodeSourceKey(source: NodeSource): string` — 重複判定用。
- `uniqueNodeSources(sources: readonly NodeSource[]): NodeSource[]` — 鍵が同じものは最初を残す（統合・保存検証で共有）。
- `areNodeSourcesEqual(a, b): boolean` — 長さと各要素の `title` / `page`（無しは同じ） / `url`（無しは同じ）を順に比較。`undefined` と空配列は同じ。
- `addNodeSource(nodes, id, input): AddNodeSourceResult`。失敗: 上記 + `node-missing` | `duplicate` | `too-many`。順: node-missing → 正規化 → duplicate → too-many。成功時は末尾追加。
- `removeNodeSource(nodes, id, index: number): Node[] | null` — 範囲外・ノード無しは `null`。最後の 1 件を消すときは `sources` キーを外す。**削除は index**（同じ title がページ違いで並びうるため。URL 削除のように値一致だけにしない）。UI は一覧の index を渡す。
- `withNodeSources(node, sources | undefined): Node` — 空／undefined ならキーを外す。
- `AddNodeSourceOutcome`（フック用。ノード配列を含めない）、`formatNodeSourceFailure`。

### 3.2 保存形式

- `mapDocumentNodeSources.ts`: `normalizeMapDocumentNodeSources(sources, index, version)`。`version !== 3` または undefined → undefined。配列でない・件数 > 10・要素がオブジェクトでない・未知キーあり・必須 `title` 欠落・各フィールドの型不正・入力長の先行超過・正規化失敗は文書全体の失敗。件数と各文字列の `length` は正規化より先（L-443）。成功後は各要素を正規化し、`uniqueNodeSources` で**後のものを捨て（最初を残す）**、空なら undefined。
- 未知キーを拒否する（L-023 の近縁: 保存形に著者などを黙って落とさない／勝手に残さない。未知は失敗）。
- `mapDocumentNode.ts` / `mapDocumentNodeProjection.ts` / `mapConflict.ts`: `sources` を足す（競合は `areNodeSourcesEqual`）。

### 3.3 統合

- 計画に `sources`・`sourceSourceCount`・`sourceDuplicateCount` を足す。配列順に連結し `uniqueNodeSources`。件数 > 10 なら `sources-too-many`（`tags-too-many` の後）。黙って切らない。
- `applyPlanToSurvivor` は `withNodeSources`。`isSameNodeMergePlan` に sources 関連を足す（L-036）。
- 文言: 「出典をまとめると件数の上限（10 件）を超えるため、統合できません。」
- プレビュー: 出典を持つノードが 1 つ以上のとき「出典: N 件（重複 M 件を除く）」（M=0 なら括弧なし）。本文は出さない。

### 3.4 分割・複製・貼り付け・移動・親の挿入

- 分割: 元ノードに残し、新断片は持たない。
- 複製・コピペ・別マップ移動: 写す（配列は不変参照共有可）。
- 親挿入の新親: 持たない。

### 3.5 履歴

- `mapHistory.areNodesEqual` は配列を要素ごと比較済みだが、**要素がオブジェクト**なので、`sources` キーは `areNodeSourcesEqual` で比べる（参照が違っても中身が同じなら同値。履歴が無駄に積まれないようにする。L-135 近縁）。他の配列（links/tags）は従来どおり要素の `===`。

### 3.6 検索・キャンバス

- 変更しない。`types/node.ts` のコメントに、将来使うときの見直し箇所を残す。

## 4. フック（`useNodes`）

- `addNodeSource(id, input): AddNodeSourceOutcome` — 最新状態から判定し、成功時だけ `applyNonStructuralChange`（L-001・L-453）。
- `removeNodeSource(id, index): boolean` — 1 回の履歴。受理したかを返す。

## 5. パネル

### 5.1 構成

- `NodeSourcesSection.tsx`（新）。`NodeDetailPanel` がリンク節とイラスト節の間に置く。
- key: `sources:${node.id}`（未選択は `sources:none`）。`documentRevision` は props で渡し、変わったら下書きとエラーだけ消す（作り直さない。L-155・L-588）。
- 見出し「出典」。未選択は案内のみ（入力欄を描かない）。
- 一覧: 各行にタイトル、ページがあれば常に `p. {page}`（正規化後のページ文字列をそのまま続ける。数値かどうかで分岐しない）、URL があれば `toSafeLinkHref` で開くリンク、削除ボタン（`aria-label` にタイトルを含める）。件数「N / 10 件」。
- 追加フォーム: タイトル（必須）・ページ・URL の 3 入力 +「追加」。`<form noValidate onSubmit>`。IME / repeat の Enter は送信しない（L-474・L-408）。入力欄とボタンは `disabled` にしない（L-155・L-157）。上限時は status で案内し、追加試行は `too-many`。成功したら 3 入力を空にし、フォーカスはタイトル入力欄に残す（links/tags と同じ）。
- 削除後フォーカスはタイトル入力欄へ。

### 5.2 失敗文言

- タイトル空の送信は何もしない（エラーなし）。ページ／URL だけの送信はタイトル空扱いで何もしない。
- `too-long-title` / `invalid-title` / `too-long-page` / `invalid-page` / URL 系（links と同じ文言） / `duplicate` / `too-many` / `node-missing`。数値は定数から。`never` 網羅。

### 5.3 配線

- `NodeDetailPanel` の `selectedNode` に `sources` を足し、`onAddSource` / `onRemoveSource` を渡す。`MapEditor` は配線のみ。

## 6. 既存機能との接続

| 機能 | 扱い |
| --- | --- |
| 保存・JSON・localStorage | V3 任意項目 `sources` を往復 |
| Undo / Redo | 追加・削除が 1 回ずつ |
| 複製・コピペ・枝移動 | 写る。貼り付けは検証 |
| 分割 | 元に残す |
| 統合 | union。10 超は不可。プレビューに件数 |
| 親挿入 | 新親は持たない |
| 競合検出 | `areNodeSourcesEqual` |
| 検索・キャンバス印・書き出し | 変更なし |
| 一括置換 | 変更なし（ラベルのみ） |

## 7. テスト方針

- ドメイン TDD: タイトル／ページ／URL の境界、入力先行長、正規化後長、制御文字、URL 再利用（資格情報・scheme・href 伸長）、重複鍵、10/11 件、remove のキー除去、unique、areEqual（別参照・同内容）、永続化（未知キー拒否・版・件数先）、merge、split、subtree、parentInsert、mapHistory の sources オブジェクト比較、mapConflict。
- フック: 戻り値・履歴 1 回・Undo・最新状態での連続追加。
- 部品: 追加・失敗表示・IME/repeat・上限・削除後フォーカス・documentRevision・URL の rel/target・未選択で入力を描かない。**部品とフックの接続は実際の DOM イベントで固定する（L-737）**（ハンドラの直叩きだけではテンプレートの配線漏れを検出できない）。
- ページ統合: 追加して別ノードへ行って戻る、Undo、JSON 往復、javascript: 拒否、統合、複製、入力内キーがマップに漏れない、削除ボタン上の Ctrl+Z 後の Delete でノードが消えない。
- `ExportedNode` / 既存 toEqual の洗い出し（L-609）。`nodeAttributePolicy` の SAMPLE/DIFFERENT 更新。

## 8. ドキュメント更新

- `docs/specifications/features.md`: 出典の章、右パネル順、統合の属性、属性ポリシー表。
- `docs/specifications/data-model.md`: Node・V3 表・エラー。
- `docs/specifications/api.md`: 文書同一性の列挙。
- `docs/architecture/overview.md`: ファイル一覧・配線。
- `docs/testing/browser-test-cases.md`: 出典節。
- `ROADMAP.md`: 候補054 完了、現在地（Phase 18 完了・次は Phase 19）、最終更新。
- `README.md` / `client/README.md` / `docs/README.md` の機能一覧。

## 9. 決めたこと（推奨採用の要約）

1. 構造化 `sources`（links と別）。
2. タイトル必須・ページ任意・URL 任意。
3. 最大 10 件。右パネルはリンクの下。
4. 検索・キャンバス印は初期なし。
5. 追加・削除は即時 1 履歴。split=original-only、merge=union、parentInsert=none。
