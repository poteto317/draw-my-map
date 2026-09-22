# Task 1 実装レポート: マップ出力範囲

## 実装内容

- `Node` 型の読み取り専用配列から、全ノードを囲う出力範囲を計算する `getMapExportBounds` を追加。
- 既定余白は brief 指定の 32px。空配列は `null` を返し、範囲の `minX/minY/width/height/offsetX/offsetY` を返す。
- DOM / PixiJS への依存はない。

## 変更ファイル

- `client/src/domain/imageExport/mapExportBounds.ts`
- `client/src/domain/imageExport/__tests__/mapExportBounds.test.ts`
- `.superpowers/sdd/2026-09-23-phase5-image-export/task-1-report.md`

## RED / GREEN

- RED: `npm test -- --runInBand src/domain/imageExport/__tests__/mapExportBounds.test.ts`（作業ディレクトリ `client`）
  - 実装前にモジュールが存在せず、Jest が `Cannot find module '../mapExportBounds'` で失敗。テスト 0 件実行。
- GREEN: 同じ focused test コマンド
  - 4 テスト全件 PASS: 複数ノードの既定余白、空配列、単一ノード、凍結入力の非変更。

## テスト結果

- `npm test -- --runInBand src/domain/imageExport/__tests__/mapExportBounds.test.ts`: PASS (4/4)
- `npm run typecheck`: PASS (`tsc --noEmit`)
- `git diff --check`: PASS

## 自己レビュー

- brief の署名、余白 32px、範囲計算式に従っている。
- `Node` を型専用 import し、実行時依存はない。入力配列・ノードを変更しない。
- 期待値は固定リテラルで、座標・余白計算の誤りを検出できる。

## 懸念

- brief 指定の `Math.min/max(...nodes.map(...))` は非常に大きな配列で JavaScript の引数上限に達する可能性がある。現タスクでは brief の実装をそのまま踏襲。
