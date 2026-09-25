# Phase 5 画像エクスポート単一責任リファクタリング設計

## 目的

`origin/main...HEAD`で追加・変更されたPhase 5画像エクスポート機能を、各本番モジュールが一つの変更理由だけを持つ構造へ整理する。ユーザー向けUI、生成されるPNG/SVG、通知文言、エラー契約、公開済みのHook戻り値は変更しない。

## 対象の棚卸し

### リファクタリング対象

- `client/src/hooks/useMapImageExport.ts`
  - SVG書き出し、PNG書き出し、通知、PNG排他制御、既定のSVG生成依存の組み立てが混在している。
- `client/src/domain/imageExport/mapSvgDocument.ts`
  - XML文字正規化、辺生成、ノード矩形生成、ラベル生成、文書合成が混在している。
  - ドメイン層から`components/map/mapGeometry.ts`を参照する逆向き依存がある。
- `client/src/services/imageExport/mapPngRasterizer.ts`
  - SVG画像ロードとObject URL管理、Canvas作成、描画、PNG符号化、全体の非同期調停が混在している。
- `client/src/services/imageExport/mapImageDownload.ts`
  - ファイル名生成、SVG Blob生成、ブラウザダウンロードが混在している。
- 上記4ファイルに対応する既存テスト
  - 複数責務を一つのテストファイルで検証しているため、責務別テストへ再配置する。

### 監査済み・構造維持

- `client/src/app/page.tsx`: マップ状態、永続化、画像書き出し、表示コンポーネントを接続するComposition Rootだけを担当している。
- `client/src/components/layout/AppHeader.tsx`: ヘッダーの表示領域と任意の操作・通知スロットだけを担当している。
- `client/src/components/layout/MapImageExportControls.tsx`: PNG/SVG操作ボタンの表示だけを担当している。
- `client/src/components/layout/MapOperationNotice.tsx`: 通知種別に応じたアクセシブルな表示だけを担当している。
- `client/src/domain/imageExport/mapExportBounds.ts`: ノード矩形とラベル描画範囲を含む、マップ全体の画像出力範囲計算だけを担当している。
- `client/src/domain/imageExport/mapExportText.ts`: エクスポート用ラベルの正規化と折り返しという同一テキスト方針を担当している。
- `client/src/services/imageExport/mapTextMeasurement.ts`: Canvasによる文字幅測定アダプターだけを担当している。
- `client/src/types/operationNotice.ts`: 操作通知の型契約だけを定義している。
- 永続化Hook群: 今回の差分は通知型の一般化だけであり、各Hookの既存責務を増やしていない。
- 設計書・実装計画・`.gitignore`: 実行時責務を持たないため本番コード分割の対象外とする。

## 制約

- `useMapImageExport({ nodes })`の戻り値`exportSvg`、`exportPng`、`isExportingPng`、`notice`を維持する。
- 空マップ、成功、失敗時の通知種別と日本語文言を維持する。
- 同一tickのPNG連打では最初の処理だけを実行する。
- SVGは白背景、辺、ノード矩形、ラベルの描画順を維持する。
- ノードの高さを超える複数行ラベルもSVG/PNGの出力範囲へ含める。
- XML 1.0禁止文字を文字幅測定前にU+FFFDへ置換し、構造文字をエスケープする。
- PNGは同じSVGを2倍解像度でラスタライズする。
- 成功、失敗、同期例外、競合イベントの全経路でObject URLを一度だけ解放する。
- 外部依存を追加しない。
- 公開UI、生成結果、ロードマップ、機能仕様を変更しない。
- Gitコミットを作成しない。

## 採用方針

変更理由が明確に分かれている処理だけを抽出し、既存の公開境界には合成モジュールを残す。大きな2ファイルだけを分割する最小案ではブラウザ処理の混在が残るため採用しない。全関数を一ファイルずつにする最大分割案は、移動コストと依存数を増やすため採用しない。

## モジュール設計

### 画像エクスポートHook

`client/src/hooks/useMapSvgExport.ts`を新設する。

```ts
export function useMapSvgExport(options: {
  nodes: readonly Node[];
  publishNotice: (notice: OperationNotice) => void;
  createSvgExport?: CreateSvgExport;
  downloadSvg?: DownloadImage;
}): () => void;
```

SVGドキュメントの要求、SVG Blobの作成、ダウンロード、SVG固有通知への変換だけを担当する。

`client/src/hooks/useMapPngExport.ts`を新設する。

```ts
export function useMapPngExport(options: {
  nodes: readonly Node[];
  publishNotice: (notice: OperationNotice) => void;
  createSvgExport?: CreateSvgExport;
  rasterizePng?: RasterizePng;
  downloadPng?: DownloadImage;
}): {
  exportPng: () => Promise<void>;
  isExportingPng: boolean;
};
```

PNG固有のSVG要求、ラスタライズ、ダウンロード、排他状態、PNG固有通知への変換だけを担当する。

`client/src/services/imageExport/createMapSvgExport.ts`を新設し、ノード範囲、文字幅測定、SVGドキュメント生成を組み合わせる既定ユースケースを担当する。

`useMapImageExport.ts`は共有通知状態を所有し、上記2つのHookを合成して既存の戻り値を返すだけにする。依存注入用の型は`client/src/types/mapImageExport.ts`へ集約し、Hook間で同一契約を共有する。

### SVG生成

`client/src/domain/imageExport/mapXmlText.ts`を新設する。

```ts
export function normalizeMapXmlText(value: string): string;
export function escapeMapXmlText(value: string): string;
```

XML 1.0で禁止されるコードポイントの置換と、XML構造文字のエスケープだけを担当する。正規化済みラベルを文字幅測定とSVG出力で共有し、算出範囲と描画内容を一致させる。

`client/src/domain/nodes/nodeEdgeCurve.ts`を新設し、Node間のBezier曲線座標計算とその型だけを担当する。制御点の中点は有限座標同士の加算でオーバーフローしないよう、各X座標を先に半分にしてから加算する。`components/map/mapGeometry.ts`は既存利用者との互換性のためこれを再exportし、画像エクスポートはドメインモジュールを直接参照する。

`client/src/domain/imageExport/mapSvgEdges.ts`を新設する。

```ts
export function createMapSvgEdges(
  nodes: readonly Node[],
  bounds: MapExportBounds,
): string;
```

親索引を作成し、存在する親子関係だけを入力順でSVG pathへ変換する。ラベルと文書外枠は扱わない。

`client/src/domain/imageExport/mapSvgNodes.ts`を新設する。

```ts
export type MapSvgNodeMarkup = {
  rectangles: string;
  labels: string;
};

export function createMapSvgNodes(
  nodes: readonly Node[],
  bounds: MapExportBounds,
  measureText: MeasureMapText,
): MapSvgNodeMarkup;
```

ノード矩形と中央揃えラベルのマークアップ生成だけを担当し、ラベル文字は`escapeMapXmlText`へ委譲する。ラベルの前後・連続空白がSVG描画で縮約されないよう、`text`要素には`xml:space="preserve"`を指定する。

`mapSvgDocument.ts`は背景、辺、全矩形、全ラベルの順でマークアップを合成し、寸法付き`MapSvgDocument`を返すだけにする。

### PNGラスタライズ

`client/src/services/imageExport/loadMapSvgImage.ts`を新設する。

```ts
export function withLoadedMapSvgImage<T>(
  svg: string,
  consume: (image: HTMLImageElement) => Promise<T>,
): Promise<T>;
```

SVG BlobからObject URLを作り、Imageを一度だけload/errorのいずれかへ遷移させる。同期例外をPromise拒否へ変換し、consumerの成否後にhandlerを解除してObject URLを一度だけ解放する。

`client/src/services/imageExport/mapCanvasPngEncoder.ts`を新設する。

```ts
export function createMapPngEncoder(
  width: number,
  height: number,
): (image: CanvasImageSource) => Promise<Blob>;
```

2倍解像度Canvasの作成、2D context取得、論理座標へのscaleをfactory呼び出し時に行い、返した関数が画像描画とPNG Blob符号化を担当する。Canvasのピクセル寸法は2倍後の値を有限性検証してから整数へ切り上げ、端の切り取りを防ぐ。Canvas属性の上限を超える寸法と、ブラウザが代入値をそのまま保持できない寸法は描画前に拒否する。2D context欠損はSVG画像ロードやObject URL生成より前に失敗する既存契約を維持する。

`mapPngRasterizer.ts`は最初に`const encode = createMapPngEncoder(width, height)`を呼び、続けて`withLoadedMapSvgImage(svg, encode)`を返す合成境界だけにする。公開関数は`async`のままとし、factoryの同期例外もPromise拒否へ変換する。

### 画像成果物とダウンロード

`client/src/services/imageExport/mapImageFileName.ts`を新設する。

```ts
export function createMapImageFileName(
  extension: "svg" | "png",
  now?: Date,
): string;
```

画像成果物に共通するファイル名規則だけを担当する。

`client/src/services/imageExport/mapSvgArtifact.ts`を新設する。

```ts
export function createMapSvgBlob(svg: string): Blob;
```

SVG文字列のUTF-8 Blob表現だけを担当する。`mapImageDownload.ts`は、渡されたBlobを指定名でブラウザダウンロードし、Object URLを解放する処理だけを残す。

## データフロー

```text
Home
  → useMapImageExport（共有通知の合成）
    → useMapSvgExport
      → createMapSvgExport
      → createMapSvgBlob
      → downloadMapImage
    → useMapPngExport
      → createMapSvgExport
      → rasterizeMapSvgToPng
        → createMapPngEncoder(width, height)（先にCanvas/contextを準備）
        → withLoadedMapSvgImage(svg, encode)
          → encode(image)（ロード後に描画・符号化）
      → downloadMapImage

createMapSvgExport
  → getMapExportBounds
  → createMapTextMeasurer
  → createMapSvgDocument
    → createMapSvgEdges
    → createMapSvgNodes
      → wrapMapExportText
      → escapeMapXmlText
```

## テスト設計

- `useMapSvgExport.test.tsx`: 空マップ、成功、同期例外、入力不変を検証する。
- `useMapPngExport.test.tsx`: 空マップ、成功、変換失敗、同一tick連打、処理中状態の解除を検証する。
- `useMapImageExport.test.tsx`: 共有通知の上書きと2つのHookの公開契約を統合境界として検証する。
- `createMapSvgExport.test.ts`: 範囲・文字測定・SVG生成の既定経路を検証する。
- `mapExportBounds.test.ts`: 外接矩形、余白、平行移動後の境界内包、極端な有限座標の精度飽和、入力不変を検証する。
- `mapXmlText.test.ts`: XML構造文字、禁止文字の正規化、許可Unicodeを直接検証する。
- `nodeEdgeCurve.test.ts`: 既存Bezier座標契約と同符号の極大有限座標における制御点の有限性をドメイン境界で検証する。
- `mapSvgEdges.test.ts`: 親子辺、親欠損、入力不変を検証する。
- `mapSvgNodes.test.ts`: 矩形、中央揃え、折り返し、狭いノード、XML文字を検証する。
- `mapSvgDocument.test.ts`: 寸法、背景、描画順、合成結果だけを検証する。
- `loadMapSvgImage.test.ts`: load/error、Image生成例外、src設定例外、競合イベント、URL解放を検証する。
- `mapCanvasPngEncoder.test.ts`: factoryによる2倍Canvas準備、小数寸法の切り上げ、2倍後の非有限寸法、Canvas属性上限超過、代入後の実寸法不一致、context欠損の同期例外、返した関数による描画例外、null Blob、`toBlob`例外を検証する。
- `mapPngRasterizer.test.ts`: loaderとencoderの合成契約、およびcontext欠損時にImage/Object URL生成へ進まない早期失敗契約を検証する。
- `mapImageFileName.test.ts`: SVG/PNG共通の日時付きファイル名規則を検証する。
- `mapSvgArtifact.test.ts`: UTF-8 SVG Blob表現を検証する。
- `mapImageDownload.test.ts`: click成功・失敗時のURL解放だけを検証する。
- 既存のページ・コンポーネント統合テストは変更後も維持する。

テスト移動では、同じ不具合を新しい責務別テストまたは統合テストが検出できることを確認してから旧テストを削除する。新しい公開単位は、未作成または未分離のために失敗するテストを先に実行し、REDを確認してから実装する。

## 完了条件

- 棚卸しで要対応と判断した4つの本番モジュールが、合成または単一のブラウザ操作だけを担当する。
- SVGドメインからUIコンポーネント層への依存がなくなる。
- 新設する各モジュールが一つの変更理由だけを持つ。
- 公開Hook契約、UI、通知、PNG/SVG出力、エラー・排他・cleanup契約を維持する。
- 責務別ユニットテストと既存統合テストが成功する。
- `npm run verify`が成功する。
- `origin/main...HEAD`と未コミット差分を再点検し、追加の単一責任違反が0件である。
- Gitコミットを作成しない。
