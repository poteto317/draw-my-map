# マウスホイールのパン化とズーム操作の見直し（カード #47）

- 日付: 2026-11-22
- 対象: [scrum #47](https://scrum-board-jkcejsb6ka-an.a.run.app/items/47?project=5)「マウス操作の修正」
- ステータス: 設計承認（レビュー反映済み）

## 問題

キャンバス上でマウスホイール／トラックパッドのスクロール操作をすると拡大・縮小になる。利用者は「スクロール＝表示位置の移動（パン）」を期待するため直感に反する。拡大・縮小はピンチや明示的なズーム操作（+/- ボタン）で行うべき、という要望。

## 背景（現状）

- `useMapWheelZoom` + `calculateWheelZoomRequest` が `wheel` の `deltaY` を常にズームに使う（`ctrlKey` 判定なし、`deltaX` は無視）。
- パンは空白ドラッグとピンチ中点移動のみ。
- ズーム ± ボタンは無い（「全体に合わせる」「選択に合わせる」のみ）。
- 操作ヒント文言: 「ホイール/ピンチで拡大縮小」。
- ズーム範囲は既存どおり 0.25x〜4.0x（`clampViewportScale`）。
- 既存のホイールズームは閲覧履歴（`recordBeforeViewportChange`）に積まない。フィット操作は積む。

## 決めたこと（推奨案・ユーザー承認済み）

1. **通常のホイール／トラックパッド縦スクロールはパン**する。
2. **拡大・縮小**は (a) タッチ等の既存ピンチ経路（現状維持）(b) 右下の +/- ボタン (c) **Ctrl/Cmd + ホイール**（および主要ブラウザで `wheel`+`ctrlKey` として届くトラックパッドピンチ）で行う。
3. **ホイール横スクロール（`deltaX`）は横方向のパン**に使う。
4. **操作ヒント文言を新しい操作に合わせて更新**する。

## 要件

### 必須

1. キャンバス上の `wheel` で、修飾キーなし（`ctrlKey` も `metaKey` も false）のとき:
   - 正規化後の `deltaX` / `deltaY` からパン量を求める（下記「パンの符号」）。
   - ズームしない。
   - パン要求が成立したときだけ `preventDefault` する。成立条件は既存ズームと同様: 正規化後の値が有限かつ `(dx, dy) !== (0, 0)`（「実質 0」などの曖昧な閾値は使わない）。
2. `ctrlKey` または `metaKey`（Cmd）が true の `wheel` は、従来どおりカーソル位置基準のズーム（既存の感度・clamp・アンカー計算を再利用）。
   - **知見**: Chrome / Safari / Firefox ではトラックパッドのピンチが `wheel` + `ctrlKey: true` として届くことが多い。この経路が「トラックパッドピンチのズーム」を兼ねる。タッチ2本指の既存ピンチ（pointer 経路）は変更しない。
3. マップ表示（`viewMode === "map"`）のとき、キャンバス右下にズームコントロール（`+` / `-`）を常設する。
   - `+` で倍率を上げ、`-` で下げる。1 回あたり **現在倍率 × 1.25**（上げ）／ **÷ 1.25**（下げ）のあと `clampViewportScale`。
   - アンカーは**現在のビューポート中央**（キャンバス要素のローカル中央）。
   - 上限・下限に達しているとき、その方向のボタンは `disabled`。
   - `aria-label`: 「拡大」「縮小」。グループ `aria-label="ズーム"`。
   - **閲覧履歴には積まない**（既存ホイールズームと同じ。フィットの `recordBeforeViewportChange` とは揃えない）。編集 Undo にも入れない。
4. `LayoutModeOperationHint` の両モード文言を更新する（ホイール／ズーム部分のみ差し替え、他操作の列挙は維持）:
   - 置換前: `ホイール/ピンチで拡大縮小`
   - 置換後: `ホイールで移動・Ctrl/Cmd+ホイールまたはピンチまたは右下の＋−で拡大縮小`
5. `docs/specifications/features.md` を実装に合わせて更新する。対象は少なくとも次:
   - Phase 3 概要行（「カーソル基準のホイールズーム」などの文言）
   - §2.2 パン / §2.3 ズーム
   - §11.2 操作対応表（ホイール行の差し替え、Ctrl/Cmd+ホイール・横スクロールパン・+/- の追記）
   - §14.3 など「ホイールでの拡大縮小」と書いている関連箇所（並べ替え中止のトリガーが wheel であること自体は維持し、意味を「ホイール操作」に合わせる）
6. 自動テストで、(a) 修飾キーなし wheel → pan、(b) Ctrl/Cmd+wheel → zoom、(c) +/- の倍率と disabled、(d) ヒント文言、を固定する。

### パンの符号

- `normalizeWheelDelta`（縦横共通。line/page は既存 `normalizeWheelDeltaY` と同規則。`deltaMode === PAGE` の係数は縦横とも `pageHeight` を使う）。
- `dx = -normalize(deltaX)`、`dy = -normalize(deltaY)` を `panViewport(viewport, dx, dy)` に渡す。  
  （下方向の正の `deltaY` で内容が上へ動く＝マップがスクロールする一般的な方向。`panViewport` はスクリーン差分を `offsetX/Y` に加算するだけで、ワールド座標への別変換はしない。）
- 空白ドラッグパンの符号規則とは「指の移動方向」と「ホイールのスクロール方向」で期待が異なるため、揃えない。本カードではホイールに上記式を使う。

### 対象外

- タッチ1本指でのスクロール代替（既存ドラッグパンのまま）
- ズームスライダー、ミニマップ、慣性スクロール
- アウトライン表示への +/- 追加（マップ表示のみ）
- ROADMAP の Phase 項目完了扱い（操作改善であり未完了ロードマップ項目ではない）
- 退避中のクリップボード案内削除（別 stash。本カードの範囲外）

## 設計

### モジュール分割

1. **`wheelPan.ts`（新規・純粋）**  
   - 入力: `deltaX`, `deltaY`, `deltaMode`, `pageHeight`（viewport は不要・受け取らない）  
   - 出力: `{ dx, dy } | null`（上記符号。両方 0 または非有限なら null）  
   - 正規化は `wheelZoom.ts` から共通関数を抽出して共有してよい（例: `normalizeWheelDelta`）。

2. **`wheelZoom.ts`（既存）**  
   - Ctrl/Cmd+wheel（および ctrlKey 付きトラックパッドピンチ）用。呼び出し側が修飾キー時だけ使う。

3. **`useMapWheelZoom`（名前は維持・責務拡張）**  
   - 修飾キーなし: pan → `onBeforeNavigate`（既存 `onBeforeZoom` 相当でジェスチャー取消）+ `onPanBy(dx, dy)`  
   - 修飾キーあり: 既存 zoom → `onZoomAt`  
   - ファイル／フック名はリネームしない（差分と呼び出しを最小化）。

4. **`MapViewportZoomControls`（新規 UI）**  
   - キャンバスコンテナ相対の `absolute bottom-3 right-3`（ヘッダーの overflow 領域には置かない＝L-799）。  
   - props: `scale: number`, `onZoomIn: () => void`, `onZoomOut: () => void`（親が中央アンカーと ×1.25 を計算）。  
   - `MapEditor` のマップ領域オーバーレイとして配置（Pixi の上、ダイアログより下）。

5. **配線**  
   - wheel パン / Ctrl+wheel ズーム / +/- : いずれも閲覧履歴に積まない。  
   - `panViewport` / `zoomViewportAt` を既存どおり利用。

### テスト方針

- 純粋関数: pan の符号・deltaMode・(0,0)→null。
- フック: 修飾キーなし pan、Ctrl/Cmd zoom、preventDefault 条件。
- UI: +/- で scale 変化、端で disabled。
- ヒント: 両 layoutMode で新文言。
- 回帰: ピンチ・ドラッグパンの既存テスト維持。

## 知見（手順 4）

- L-799: +/- を overflow 付きヘッダー内に置かない。
- preventDefault はパン／ズーム要求が成立したときだけ。
- トラックパッドピンチは多くの環境で `wheel`+`ctrlKey` → 修飾キーズーム経路が兼ねる。タッチピンチは pointer 経路のまま。

## 成功条件

- 修飾キーなしホイールでマップがパンし、ズームしない。
- Ctrl/Cmd+ホイール・（ctrlKey 付き）トラックパッドピンチ・タッチピンチ・右下 +/- でズームできる。
- ヒントと `features.md` が実装と一致する。
- `npm run verify` 成功。
