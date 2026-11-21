# ヘッダー縦はみ出しによる操作不能の修正（カード #46）

- 日付: 2026-11-21
- 対象: [scrum #46](https://scrum-board-jkcejsb6ka-an.a.run.app/items/46?project=5)「bug スクロールができない」
- ステータス: 設計承認（レビュー反映済み）

## 問題

下方向へスクロールできず、画面が途中までしか見えない。再現しやすい条件は、ヘッダー操作が `flex-wrap` で複数行に折り返し、ビューポート高さが足りないときである。

## 背景（現状の契約）

- シェルは `h-dvh` の縦 flex（`page.tsx`）。ページ全体の document 縦スクロールは前提にしない。
- マップ領域は可変高ヘッダーを除いた残りを受け取り、`main` に `overflow-hidden` を付ける（`AppWorkspace`）。シェル本体へ `overflow-hidden` は付けない（既存テストで固定）。
- キャンバス上のホイールはズーム、移動はパン。右パネル・ダイアログはそれぞれの内側スクロールが正規経路。
- Phase 21/22 以降、ヘッダーの `operationControls` が増え、折り返し高さが大きくなりやすい。`AppHeader` に高さ上限も縦スクロールも無い。

## 決めたこと（推奨案・ユーザー承認済み）

1. **主対象はヘッダーのはみ出し**である。ページ全体を縦スクロール可能にはしない。右パネル全体の見直しも今回の範囲外。
2. **直し方はヘッダーへ `max-height`（ビューポート比 40dvh）を付け、縦スクロールは下段の操作行ラッパに集約する**。検索ドロップダウン等の `absolute` 子がクリップされないよう、`<header>` 自体には `overflow-y-auto` を付けない。ボタン配置の再編成や、追加操作をコマンドパレットへ寄せる作業は行わない。
3. **キャンバスの操作モデルは現状維持**（ページスクロールなし／パン・ズーム）。ヘルプ文言の追加も範囲外。

## 要件

### 必須

1. ヘッダー内容の高さが `max-height: 40dvh` を超えるとき、ヘッダー領域内を縦スクロールして下段の操作ボタンへ届ける。
2. マップ／アウトライン本体は、ヘッダー実高を引いた残りの領域に収まり続ける（`min-h-0` / `flex-1` の既存契約を壊さない）。
3. シェル（`h-dvh` の外側）やページ全体に `overflow-hidden` を新たに付けない。`main` の `overflow-hidden` は維持する。
4. 通常幅・十分な高さでは、ヘッダーに不要なスクロールバーが出ない（内容が `40dvh` 未満なら自然高のまま）。
5. 自動テストで、(a) `AppHeader` 単体で root `header` が `max-h-[40dvh]` を持ち、`overflow-y-auto` と `overscroll-y-contain` は下段操作ラッパ（`data-testid="header-operations-scroll"`）に付くこと、(b) root `header` に `overflow-y-auto` が無く検索ドロップダウンがクリップされない契約、(c) `page.test.tsx` の既存シェル／main レイアウト契約、を固定する。ヘッダークラスの検証は `page.test.tsx` には足さない。

### 対象外

- ヘッダー操作の削減・再配置、コマンドパレットへの移行
- 375px 幅での横はみ出し（既知の別問題）
- 右パネル／ダイアログ内スクロールの仕様変更
- ドキュメント・ヘルプへの操作モデル追記
- ROADMAP の Phase 項目完了扱い（バグ修正でありロードマップ未完了項目ではない）

## 設計

### 変更箇所

- `client/src/components/layout/AppHeader.tsx`  
  - `<header>` は `max-h-[40dvh] flex flex-col`（既存の bg／padding／shadow を維持）。**header 自体に `overflow-y-auto` は付けない**（`NodeSearchBox` 等の `absolute` 結果一覧のクリップ防止）。
  - **上段**（`shrink-0 flex flex-wrap gap-4`）: タイトル・mapControls・saveStatus・viewControls・searchControls・LayoutModeSelector・操作ヒント。
  - **下段**（`min-h-0 flex-1 flex flex-wrap gap-4 overflow-y-auto overscroll-y-contain`、`data-testid="header-operations-scroll"`）: importanceControls・resolutionControls・operationControls・operationNotices。下段が空のときは描画しない。
  - `max-height: 40dvh` は動的ビューポート高さの 40%。これ以上ヘッダーが伸びるとマップ領域が極端に狭くなるため、残り約 60% を本体に残す。  
  - 下段ラッパの `overscroll-y-contain` は **必須**。操作行端でのホイールが背後のキャンバスズームへ伝播しにくくする。
- レイアウトの親（`page.tsx` / `MapEditor` の editor ラッパ / `AppWorkspace`）の overflow 契約は変更しない。

### 見た目・a11y

- スクロールバーは OS／ブラウザ標準でよい（独自スタイリングしない）。
- フォーカス可能なヘッダー内コントロールは、スクロール後も含めキーボードで到達できる（ネイティブ overflow に任せる）。
- 既存の `operation-notices` 全幅行もヘッダー内スクロールの対象に含める（別領域へ移さない）。

### テスト

- `AppHeader` の単体テスト: root `header` が `max-h-[40dvh]` を持ち、`overflow-y-auto`／`overscroll-y-contain` は `header-operations-scroll` に付く。検索 `absolute` ダミーで banner に `overflow-y-auto` が無いことを固定する。
- `page.test.tsx` のレイアウト契約テストは現状のシェル／main 検証のみ維持する（ヘッダークラスの断言はここに足さない）。
- 手動確認（任意）: ビューポート高さを低くしたとき、ヘッダーをスクロールして「SVG書き出し」等の下段ボタンに届き、マップ領域が残ること。

## 知見（手順 4）

今回の変更に関係しうるもの:

- 既存レイアウト契約（シェルに `overflow-hidden` を付けない / `main` のみ）を壊さない — `page.test.tsx` および Phase 3 viewport 設計。
- UI: overflow 内のフォーカスリング切れに注意（帯に `overflow: hidden` を足す場合は内側 outline。今回は `overflow-y-auto` であり hidden ではない）。
- 優先度 A のデータ破壊系・非同期系は、今回の表示専用 CSS 変更では直接該当しにくい。

## 成功条件

- 低いビューポートでもヘッダー内スクロールで全操作に届く。
- マップ領域がゼロ高さに潰れて「途中までしか見えない」状態を避ける。
- `npm run verify`（client）が通る。
