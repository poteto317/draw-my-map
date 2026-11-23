# ノードラベルの文字サイズ・太字・下線 — 設計

- カード: [#53](https://scrum-board-jkcejsb6ka-an.a.run.app/items/53?project=5)
- ROADMAP: 該当フェーズ項目なし（ロードマップ外の改善。Phase 20 候補014とは別）
- 日付: 2026-11-23

## 決めたこと

1. **範囲**: カード本文どおり **サイズ変更＋太字＋下線** を 1 機能で実装する（斜体・取り消し線・色・部分選択書式は非目標）。
2. **対象**: ノードの `label` 表示全体に対する書式（インライン部分書式はしない）。アウトライン表示のラベル行にも同じ書式を反映する。
3. **永続化**: V3 のノード任意属性として持つ（L-825）。
   - `labelFontSize?: number` — 欠落時は現行と同じ **14**。許可値は離散の `12 | 14 | 18 | 24`。
   - `labelBold?: true` — 欠落＝通常。`true` のみ永続化。
   - `labelUnderline?: true` — 欠落＝下線なし。`true` のみ永続化。
4. **ポリシー**: いずれも `split: original-only`, `merge: survivor-else-first`, `parentInsert: none`。
5. **UI**: マップ表示かつ主選択ちょうど 1 件のとき、**ヘッダー**に「文字」コントロール（`LabelTextStyleControl`）。サイズはセレクト、太字・下線はトグル。複数選択・未選択・アウトライン表示・保護モードでは **非表示または disabled**（一括書式は非目標）。コマンドパレット登録は任意（時間があれば）。
6. **編集ロック**: `locked` ノードでは書式変更を拒否（`assertNodesEditable`、L-061 / L-1061 と同系）。入口は下表。
7. **Undo**: 各変更は 1 操作（`applyNonStructuralChange`）。
8. **描画**: Pixi `Text` の `fontSize` / `fontWeight: "bold"|"normal"`。下線は **ラベル Text の直下に Graphics の水平線**（Pixi Text の underline には頼らない）。インライン編集中の HTML input も同じサイズ・太字・下線（`text-decoration`）を反映。
9. **画像書き出し**: PNG / SVG のラベル描画も同じ属性を使う。
10. **実装順**: ①型・永続化・policy ②描画・編集オーバーレイ・書き出し ③UI・フック ④features.md・data-model 任意属性列挙（L-203）。ROADMAP はロードマップ外のため「現在地」に一行追記のみ。

## 非目標

- ラベル内の部分書式（Markdown 太字など）。
- 斜体・取り消し線・文字色・フォントファミリー変更。
- 複数選択の一括書式。
- ノード枠サイズの自動伸縮（折り返し幅は現行どおり `width - 16`。サイズを大きくしても枠はユーザーが変えない限り固定）。

## 背景と現状

- 描画: `renderMapNodes.ts` で `fontSize: 14` 固定。
- 編集: `nodeLabelEditorLayout.ts` で `14 * viewport.scale`。
- `fontWeight` / underline なし。

## 要件

### サイズ

- UI: 「小 / 標準 / 大 / 特大」→ 12 / 14 / 18 / 24。
- decode: 許可集合外・非整数は **項目削除**（文書全体は失敗させない。キー省略＝14）。
- encode: **14 のときはキーを省略する**（必須。往復でキー無し＝標準）。

### 太字・下線

- トグル。ON のときのみキー `true`。
- decode: `true` 以外は項目削除。

### 表示

- **書式を描画する**: キャンバス、アウトラインのラベル行、PNG/SVG 書き出し、インラインラベル編集。
- **文字列のみで書式不要**: 検索結果一覧・コマンドパレット等のテキスト行（プレーン文字列）。
- 空ラベルのフォールバック「新しいノード」にも書式を適用（キャンバス／アウトライン／書き出し）。

## アーキテクチャ

```
types/node.ts              labelFontSize?, labelBold?, labelUnderline?
persistence/               normalize + project + encode
domain/nodes/              labelTextStyle helpers, policy, updates
components/layout/         LabelTextStyleControl
pixi/renderMapNodes        style from node
nodeLabelEditorLayout      fontSize/weight/decoration from node
hooks/useNodes             setLabelFontSize / toggle bold/underline
```

## 知見

- **L-825 / L-203**: policy・見本・投影・履歴／競合 equal。`features.md` と `data-model.md` の任意属性列挙を同期。クリップボード往復テストに含める。
- **L-061**: 下表。Phase 25 の lock-inventory にも「ラベル書式変更」行を追記。
- **L-836**: 離散集合のみ。不正値はキー削除。

### 書式変更の操作入口インベントリ（L-061）

| 入口 | 拒否／無効条件 |
|------|----------------|
| `LabelTextStyleControl`（ヘッダー） | 主選択≠1、アウトライン、保護モード、対象 locked |
| `useNodes` の setLabelFontSize / toggleLabelBold / toggleLabelUnderline | 対象 locked → 無操作 |
| コマンドパレット（任意） | 同上 |

## 検証

- 単体: normalize、描画ヘルパ、locked 拒否。
- `cd client && npm run verify`。

## 未決事項

なし（推奨案を採用）。
