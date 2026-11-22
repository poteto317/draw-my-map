# Phase 23: テンプレートと部分再利用 — 設計

- カード: [#28](https://scrum-board-jkcejsb6ka-an.a.run.app/items/28?project=5)
- ROADMAP: Phase 23（候補022 / 033 / 025 / 026）
- 日付: 2026-11-22

## 決めたこと（推奨案を採用）

1. **範囲**: 022・033・025・026 をこの機能で実装する。実装プランは **1 本**とし、タスク群を ①書き出しスコープ → ②部品ライブラリ → ③テンプレート の順にする（後者は前者のドメインに依存しないが、MapEditor 配線の競合を避けるためこの順）。
2. **マップテンプレート**: 組み込みひな型のみ。ユーザー定義テンプレは後続。
3. **部品ライブラリ**: 選択枝を名前付きで localStorage に保存し、任意マップへ「新ルート」または「選択ノードの子」として挿入する。
4. **表示範囲書き出し**: 折りたたみ・解像度フィルタ・枝に集中で見えるノード集合を対象。パン／ズーム矩形の切り抜きはしない。既存の全件書き出しは残し、対象を切替可能にする。形式は PNG / SVG / Markdown（表示中でも必須）。
5. **選択枝書き出し**: 選択根の部分木を PNG / Markdown / JSON で書き出す（このスコープでは SVG・箇条書きは出さない）。
6. **UI**: 書き出し対象はヘッダー付近。テンプレはマップ作成ダイアログ。部品はコマンドパレット（必須）。コンテキストメニューは任意。
7. **複数選択**: 部品登録・選択スコープ書き出しは「選択がちょうど 1 件」のときだけ有効。複数選択時は主選択を推測せず無効化し案内する。

## 背景と現状

- 書き出し（PNG/SVG/Markdown/箇条書き/単体 JSON）はいずれも正本 `nodes` **全件**。表示用の fold / 解像度フィルタ / focus は反映されない。
- 可視集合の正本は `useMapDisplayState` の **`visibleNodeIds`**（`displayNodes` は折りたたみ投影後の全ノードであり、フィルタ後の可視集合ではない）。
- 枝のコピーは `draw-my-map/subtree` クリップボードのみ（永続・ファイル DL なし）。
- マップ作成は空マップ（`createMap`）か「現在を別名保存」（`saveCurrentAsNewMap`）。ひな型は無い。
- 部分木挿入の正本は `insertNodeSubtree` + `useNodes.applySubtreeInsertion`。

## 要件

### マップテンプレート（022）

- 組み込みテンプレートを数種用意する（最低: 議事録 / 学習 / 企画 / 比較検討）。
- 各テンプレは `MapDocumentV3` 相当（`layoutMode` + `nodes`）。ノードはラベル中心の浅い木。イラスト必須ではない。
- マップ一覧の「新規作成」でテンプレを選べる。未選択または「空」は従来どおり空マップ。
- テンプレ適用時は新 mapId を採番し、本体を書いてからそのマップを開く（初回 `writeMapBody` + index 追加の一経路）。
- 失敗時は index だけの残留を残さない（既存 library トランザクション方針に揃える）。成否を呼び出し元へ返す（L-001）。

### 枝の部品ライブラリ（033）

- **永続化（v1 固定）**: 単一キー `draw-my-map.parts.v1` に単一 JSON（一覧メタ + 各部品の nodes）。断片 doc・複数キーは非目標。
- 1 部品あたりノード上限はクリップボードと同程度（10_000）を超えない。
- 登録: **選択がちょうど 1 件**のときのそのノードを根とする部分木を名前付きで保存。0 件・2 件以上は登録不可（案内）。属性はノード複製方針に従いコピー。
- 挿入: ID 再採番して挿入。
  1. **新ルート**: 登録部分木のルート 1 件を `parentId: null` で挿入（複数トップレベルへの分割はしない）。
  2. **子として**: 選択がちょうど 1 件のとき、その子として接続。0 / 2+ では無効。
- 削除は一覧から可能。名前は登録時のみ。
- mapLinks は既存方針（無いマップ ID はそのまま残す）。

#### 部品ストレージの読み書き契約（L-002 / L-461 / L-921 / L-001）

- `readParts` は `ok` / `corrupt` / `read-error` を区別して返す。失敗を「空の成功」にしない。
- 空やフォールバックは **毎回新規オブジェクト**（共有デフォルト定数を返して mutate させない）。
- 更新は「最新読取 → エントリ追加/削除 → 書き戻し」。無関係な操作で全体スナップショットを盲書きしない。
- 破損エントリは一覧から除外し、`repaired` 相当を呼び出し元へ伝える。書き込み成否も返す。

### 表示中ノードの書き出し（025）

- 対象ノード集合の正本は **`displayState.visibleNodeIds`**（代替集合は使わない）。
- 形式（必須）: PNG / SVG / Markdown。ヘッダーで書き出し対象 `全件 | 表示中 | 選択` を切替。
- ビューポート矩形クリップはしない（部分集合の外接矩形 + 既存 `getMapExportBounds`）。

### 選択枝の書き出し（026）とスコープ統合

- `ExportScope = "all" | "visible" | "selection"`。026 は `selection`。
- `selection` 有効条件: 選択がちょうど 1 件。その部分木。
- **スコープごとの有効形式**:

  | スコープ | PNG | SVG | Markdown | JSON（マップ文書） | 箇条書き |
  |----------|-----|-----|----------|-------------------|----------|
  | all | ○ | ○ | ○ | ○（現行どおり全 nodes の MapDocumentV3） | ○（現行） |
  | visible | ○ | ○ | ○ | × | × |
  | selection | ○ | × | ○ | ○（MapDocumentV3。根の `parentId` を null に正規化） | × |

- JSON の読み込みからの新マップ化は必須ではない（ダウンロード共有が主）。

## 非目標

- ユーザー定義テンプレートの保存・共有。
- ビューポートのスクリーンショット切り抜き。
- サーバー同期・クラウドの部品ストア。
- 部品の複数キー／断片 doc 永続化。
- **表示中スコープの JSON 書き出し**（候補025は画像中心。JSON は選択枝のみ）。
- 新しい設定ページ。
- 箇条書きの visible / selection モード。

## アーキテクチャ

```
domain/exportScope/   ExportScope + resolveExportNodes
domain/templates/     組み込み定義 + 一覧
domain/parts/         Part モデル・codec
services/persistence/ partsStorage（単一キー）
hooks/                usePartsLibrary, export 配線の引数化
UI/                   CreateMap テンプレ選択, 部品ピッカー, Export scope 切替
```

### 書き出し対象の解決

```ts
type ExportScope = "all" | "visible" | "selection";
function resolveExportNodes(
  scope: ExportScope,
  nodes: Node[],
  visibleNodeIds: ReadonlySet<string> | ReadonlyArray<string>,
  selectedNodeIds: ReadonlyArray<string>,
): Node[]
```

- `all` → `nodes`
- `visible` → `nodes` のうち ID ∈ `visibleNodeIds`
- `selection` → 選択がちょうど 1 件のときその部分木。それ以外は空

画像・Markdown・JSON フックは渡された nodes だけを書く。形式の有効／無効は上表どおり UI が制御。

### テンプレ作成フロー

1. 名前 + テンプレ ID（または空）を選ぶ
2. `pickNewMapId` → テンプレ document clone → `writeMapBody` → index 追加 → セッション切替
3. 失敗時は body / index をロールバックし、結果を返す

### 部品フロー

1. 登録: encode subtree → 最新読取マージで append → write（quota 超過は notice）
2. 挿入: decode → `insertNodeSubtree`

## UI 詳細

| 機能 | 入口 |
|------|------|
| テンプレ | マップ一覧の新規作成ダイアログ |
| 部品登録 | コマンドパレット（必須） |
| 部品挿入 | コマンドパレット（一覧ピッカー） |
| 書き出し対象 | ヘッダーの書き出しボタン群の直前 |

## 失敗・空状態

- テンプレ適用失敗: notice、一覧は変更前。
- 部品 read-error / corrupt / quota: notice。空成功にしない。
- `visibleNodeIds` が 0 件: visible スコープの書き出し無効。
- 選択が 1 件でない: selection スコープ／部品登録・子挿入を無効。

## テスト方針（TDD）

- `resolveExportNodes` の all/visible/selection（visible は `visibleNodeIds`）。
- テンプレ document の graph 検証。空以外は nodes.length > 0。
- parts codec round-trip。corrupt / read-error と空の区別。フォールバックが共有参照でないこと。
- 挿入で ID 再採番・親子維持。
- **配線（L-060）**:
  - ヘッダー: スコープ切替で export に渡る nodes が変わる。
  - `selection` + 選択 0/2+: ボタン無効。
  - `selection` で SVG / 箇条書きが出ない（または disabled）。
  - `visible` で JSON / 箇条書きが出ない。
  - 部品登録コマンドが単一選択のときだけ実行可能。
  - テンプレ選択が `writeMapBody` 付き作成経路に乗る（空 create だけに落ちない）。

## 知見（実装時に意識）

- L-001 / L-002 / L-014 / L-537 / L-060 / L-921 / L-461（上記に要件化済み）。

## 受け入れ条件（カード対応）

- [ ] 組み込みテンプレから新規マップを作成できる
- [ ] 枝を部品として保存し、別マップに挿入できる（新ルート / 単一選択の子）
- [ ] 表示中ノードだけを PNG・SVG・Markdown で書き出せる（全件も選べる）
- [ ] 選択が 1 件のとき、その部分木を PNG・Markdown・JSON で書き出せる
- [ ] `client` で `npm run verify` が通る
- [ ] ROADMAP Phase 23 の 4 項目を完了にし、現在地を更新する
