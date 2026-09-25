# Phase 5 Image Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** マップ全体を白背景のSVGと、同一内容の2倍解像度PNGとして安全に書き出せるようにする。

**Implementation status:** 本書は初期実装の順序を記録する。下記のFile Structureは現行構成へ同期している。Task 1〜3は最初のドメイン実装手順を履歴として残し、後から抽出したXML処理、辺曲線、SVG辺・ノード生成の現在の責務と実装手順は`2026-09-23-phase5-image-export-srp-refactor.md`のTask 1〜2を正とする。Task 4〜6は分割後の責務へ同期している。

**Architecture:** ノードからの範囲計算、テキスト改行、SVG構築をDOM非依存のドメイン関数に分離する。ブラウザ層では文字幅測定、ファイル名、SVG Blob、ダウンロード、SVG画像ロード、Canvas PNG符号化を別モジュールに分ける。SVG/PNG別Hookが各書き出しを調停し、公開Hookは共有通知と両Hookの合成だけを担当する。

**Tech Stack:** TypeScript 5、React 19、Next.js 16、Jest 30、Testing Library、Canvas 2D API、SVG、Blob / Object URL API

**Spec:** `docs/superpowers/specs/2026-09-22-phase5-image-export-design.md`

## Global Constraints

- 出力範囲は現在のviewportではなく、全ノードの矩形と折り返し後のラベル描画範囲の外接矩形に32pxの余白を追加した範囲とする。
- 算出した出力範囲または座標オフセットが有限値でない場合は画像生成失敗とする。
- 背景は白とする。
- PNGは共通SVGを論理寸法の2倍以上となる最小整数ピクセルのCanvasへ描画して生成する。
- 選択、編集、パン、ズーム、ポインター操作中状態は出力しない。
- ラベルはXML禁止文字を文字幅測定前に置換してからエスケープし、明示改行と幅による改行を反映する。
- 折り返しに使う空白以外の前後・連続空白は、SVGの`xml:space="preserve"`で描画時にも維持する。
- 新しい外部依存を追加しない。
- マップ状態を変更しない。
- 利用者向け通知は日本語とし、内部例外を表示しない。
- 実装コードより先に対応するテストを書き、意図した理由で失敗することを確認する。
- `client`ディレクトリの変更後は`npm run verify`を実行する。
- `ROADMAP.md`のPhase 5完了更新はPRマージ後の後処理で行う。

## File Structure

- Create: `client/src/domain/imageExport/mapExportBounds.ts` — ノード矩形とラベル描画範囲を含む出力範囲と座標オフセット
- Create: `client/src/domain/imageExport/mapExportText.ts` — ラベルの表示文字列と改行
- Create: `client/src/domain/imageExport/mapXmlText.ts` — XML禁止文字の正規化と構造文字のエスケープ
- Create: `client/src/domain/imageExport/mapSvgEdges.ts` — 接続線SVGの生成
- Create: `client/src/domain/imageExport/mapSvgNodes.ts` — ノード矩形・ラベルSVGの生成
- Create: `client/src/domain/imageExport/mapSvgDocument.ts` — 背景、辺、ノードのSVG文書合成
- Create: `client/src/domain/nodes/nodeEdgeCurve.ts` — 接続線のBezier曲線計算
- Create: `client/src/domain/imageExport/__tests__/mapExportBounds.test.ts`
- Create: `client/src/domain/imageExport/__tests__/mapExportText.test.ts`
- Create: `client/src/domain/imageExport/__tests__/mapXmlText.test.ts`
- Create: `client/src/domain/imageExport/__tests__/mapSvgEdges.test.ts`
- Create: `client/src/domain/imageExport/__tests__/mapSvgNodes.test.ts`
- Create: `client/src/domain/imageExport/__tests__/mapSvgDocument.test.ts`
- Create: `client/src/domain/nodes/__tests__/nodeEdgeCurve.test.ts`
- Modify: `client/src/components/map/mapGeometry.ts` — `getEdgeCurve`互換exportを維持
- Modify: `client/src/components/map/__tests__/mapGeometry.test.ts`
- Create: `client/src/services/imageExport/mapTextMeasurement.ts` — Canvas 2Dによる文字幅測定
- Create: `client/src/services/imageExport/createMapSvgExport.ts` — 範囲計算、文字幅測定、SVG文書生成のユースケース
- Create: `client/src/services/imageExport/mapImageFileName.ts` — 日時付きファイル名
- Create: `client/src/services/imageExport/mapSvgArtifact.ts` — UTF-8 SVG Blob生成
- Create: `client/src/services/imageExport/mapImageDownload.ts` — BlobダウンロードとObject URL解放
- Create: `client/src/services/imageExport/loadMapSvgImage.ts` — SVG画像ロードと中間Object URL解放
- Create: `client/src/services/imageExport/mapCanvasPngEncoder.ts` — 2倍解像度Canvas描画とPNG符号化
- Create: `client/src/services/imageExport/mapPngRasterizer.ts` — SVG画像ロードとCanvas符号化の合成
- Create: `client/src/services/imageExport/__tests__/mapTextMeasurement.test.ts`
- Create: `client/src/services/imageExport/__tests__/createMapSvgExport.test.ts`
- Create: `client/src/services/imageExport/__tests__/mapImageFileName.test.ts`
- Create: `client/src/services/imageExport/__tests__/mapSvgArtifact.test.ts`
- Create: `client/src/services/imageExport/__tests__/mapImageDownload.test.ts`
- Create: `client/src/services/imageExport/__tests__/loadMapSvgImage.test.ts`
- Create: `client/src/services/imageExport/__tests__/mapCanvasPngEncoder.test.ts`
- Create: `client/src/services/imageExport/__tests__/mapPngRasterizer.test.ts`
- Create: `client/src/hooks/useMapSvgExport.ts` — SVG書き出しの調停
- Create: `client/src/hooks/useMapPngExport.ts` — PNG書き出しと重複実行防止の調停
- Create: `client/src/hooks/useMapImageExport.ts` — 共有通知とSVG/PNG Hookの合成
- Create: `client/src/hooks/__tests__/useMapSvgExport.test.tsx`
- Create: `client/src/hooks/__tests__/useMapPngExport.test.tsx`
- Create: `client/src/hooks/__tests__/useMapImageExport.test.tsx`
- Create: `client/src/types/mapImageExport.ts` — 画像書き出しの共有依存型
- Create: `client/src/types/operationNotice.ts` — 機能横断の通知型
- Create: `client/src/components/layout/MapOperationNotice.tsx` — 機能横断の通知表示
- Create: `client/src/components/layout/MapImageExportControls.tsx` — PNG / SVG操作
- Create: `client/src/components/layout/__tests__/MapOperationNotice.test.tsx`
- Create: `client/src/components/layout/__tests__/MapImageExportControls.test.tsx`
- Modify: `client/src/hooks/useMapPersistence.ts` — 汎用通知型を使用
- Modify: `client/src/hooks/useMapJsonExport.ts` — 汎用通知型を使用
- Modify: `client/src/hooks/useMapFilePersistence.ts` — 汎用通知型を使用
- Modify: `client/src/hooks/useMapJsonImport.ts` — 汎用通知型を使用
- Modify: `client/src/hooks/useMapStorageAutoSave.ts` — 汎用通知型を使用
- Modify: `client/src/hooks/useMapStoragePersistence.ts` — 汎用通知型を使用
- Modify: `client/src/hooks/useMapStorageRestoration.ts` — 汎用通知型を使用
- Delete: `client/src/types/persistence.ts`
- Delete: `client/src/components/layout/MapPersistenceNotice.tsx`
- Delete: `client/src/components/layout/__tests__/MapPersistenceNotice.test.tsx`
- Modify: `client/src/components/layout/AppHeader.tsx` — 操作と通知の汎用slot
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`
- Modify: `client/src/app/page.tsx` — 画像出力HookとUIの配線
- Modify: `client/src/app/__tests__/page.test.tsx`

---

### Task 1: マップ出力範囲

**Files:**
- Create: `client/src/domain/imageExport/mapExportBounds.ts`
- Test: `client/src/domain/imageExport/__tests__/mapExportBounds.test.ts`

**Interfaces:**
- Produces: `MapExportBounds = { minX: number; minY: number; width: number; height: number; offsetX: number; offsetY: number }`
- Produces: `getMapExportBounds(nodes: readonly Node[], measureText: MeasureMapText, padding?: number): MapExportBounds | null`

- [ ] **Step 1: Write the failing bounds tests**

```ts
import { getMapExportBounds } from "@/domain/imageExport/mapExportBounds";

const measureText = (text: string) => Array.from(text).length * 10;

it("全ノードの外接矩形に32pxの余白を追加する", () => {
  const nodes = [
    { id: 1, parentId: null, x: -20, y: 10, width: 100, height: 60, label: "A" },
    { id: 2, parentId: 1, x: 180, y: 90, width: 120, height: 70, label: "B" },
  ];

  expect(getMapExportBounds(nodes, measureText)).toEqual({
    minX: -20,
    minY: 10,
    width: 384,
    height: 214,
    offsetX: 52,
    offsetY: 22,
  });
});

it("空のマップには出力範囲がない", () => {
  expect(getMapExportBounds([], measureText)).toBeNull();
});

it("有限座標間の差がオーバーフローする場合は失敗する", () => {
  const nodes = [
    { id: 1, parentId: null, x: -Number.MAX_VALUE, y: 0, width: 1, height: 18, label: "A" },
    { id: 2, parentId: null, x: Number.MAX_VALUE, y: 0, width: 1, height: 18, label: "B" },
  ];

  expect(() => getMapExportBounds(nodes, measureText)).toThrow(
    new RangeError("Map export bounds must be finite"),
  );
});

// 正の寸法加算や平行移動後の余白が精度飽和するX/Y境界、
// 右端・下端が画像境界へ丸められるケース、20万ノードの集約も検証する。
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapExportBounds.test.ts`

Expected: FAIL because `mapExportBounds.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure calculation**

```ts
import {
  getMapExportTextLayout,
  MAP_EXPORT_HORIZONTAL_INSET,
  type MeasureMapText,
} from "@/domain/imageExport/mapExportText";

export const MAP_EXPORT_PADDING = 32;

export function getMapExportBounds(
  nodes: readonly Node[],
  measureText: MeasureMapText,
  padding = MAP_EXPORT_PADDING,
): MapExportBounds | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const nodeRight = node.x + node.width;
    const nodeBottom = node.y + node.height;
    if (
      !Number.isFinite(nodeRight) ||
      !Number.isFinite(nodeBottom) ||
      nodeRight <= node.x ||
      nodeBottom <= node.y
    ) {
      throw new RangeError("Map export bounds must be finite");
    }

    const centerX = node.x / 2 + nodeRight / 2;
    const layout = getMapExportTextLayout(
      node.label,
      node.width - MAP_EXPORT_HORIZONTAL_INSET * 2,
      node.y / 2 + nodeBottom / 2,
      measureText,
    );

    const extent = {
      left: Math.min(node.x, centerX - layout.width / 2),
      top: Math.min(node.y, layout.top),
      right: Math.max(nodeRight, centerX + layout.width / 2),
      bottom: Math.max(nodeBottom, layout.bottom),
    };
    minX = Math.min(minX, extent.left);
    minY = Math.min(minY, extent.top);
    maxX = Math.max(maxX, extent.right);
    maxY = Math.max(maxY, extent.bottom);
  }

  return {
    minX,
    minY,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    offsetX: padding - minX,
    offsetY: padding - minY,
  };
}
```

- [ ] **Step 4: Add immutability and single-node cases, then verify GREEN**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapExportBounds.test.ts`

Expected: PASS, including a frozen input array and a single-node case.

- [ ] **Step 5: Commit Task 1**

```bash
git add client/src/domain/imageExport/mapExportBounds.ts client/src/domain/imageExport/__tests__/mapExportBounds.test.ts
git commit -m "feat(image-export): マップ全体の出力範囲を計算"
```

---

### Task 2: ラベル改行

**Files:**
- Create: `client/src/domain/imageExport/mapExportText.ts`
- Test: `client/src/domain/imageExport/__tests__/mapExportText.test.ts`

**Interfaces:**
- Produces: `MeasureMapText = (text: string) => number`
- Produces: `getMapExportLabel(label: string): string`
- Produces: `wrapMapExportText(label: string, maxWidth: number, measureText: MeasureMapText): string[]`
- Produces: `getMapExportTextLayout(label: string, maxWidth: number, centerY: number, measureText: MeasureMapText): MapExportTextLayout`

- [ ] **Step 1: Write failing text-layout tests**

Use a deterministic Unicode code-point measurer `Array.from(text).length * 10`. Cover one line, wrapping at whitespace, consecutive and leading whitespace at the minimum width, a Japanese string without whitespace, a long Latin word, CRLF normalization, explicit blank lines, XML 1.0 forbidden-character normalization before measurement, and the fallback label.

```ts
const measure = (text: string) => Array.from(text).length * 10;

expect(wrapMapExportText("alpha beta", 60, measure)).toEqual(["alpha", "beta"]);
expect(wrapMapExportText("あいうえ", 20, measure)).toEqual(["あい", "うえ"]);
expect(wrapMapExportText("A\r\n\r\nB", 100, measure)).toEqual(["A", "", "B"]);
expect(wrapMapExportText("A\u0000B", 100, measure)).toEqual(["A\uFFFDB"]);
expect(getMapExportLabel("")).toBe("新しいノード");
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapExportText.test.ts`

Expected: FAIL because `mapExportText.ts` does not exist.

- [ ] **Step 3: Implement greedy wrapping with whitespace preference**

Normalize XML 1.0 forbidden characters to U+FFFD before measuring. Normalize `\r\n` and `\r` to `\n`, then process each explicit line independently. Accumulate Unicode code points with `Array.from`; use a cursor plus exponential/binary search to find the fitting prefix without repeatedly measuring the full remaining suffix. When a candidate exceeds `maxWidth`, break at the last whitespace in the current line when available, otherwise break before the overflowing code point. Remove exactly one whitespace code point selected as the soft break across a consecutive-whitespace run while preserving adjacent whitespace, even when each line can hold only one code point; preserve explicit empty lines. Compute the widest line with iteration or `reduce`, and never spread unbounded character or line arrays into function arguments.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapExportText.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 5: Commit Task 2**

```bash
git add client/src/domain/imageExport/mapExportText.ts client/src/domain/imageExport/__tests__/mapExportText.test.ts
git commit -m "feat(image-export): ラベル改行をドメイン化"
```

---

### Task 3: SVGドキュメント生成

> **履歴上の注意:** 以下は初期実装時の手順である。現在はprivate XML処理と要素生成を`mapXmlText.ts`、`mapSvgEdges.ts`、`mapSvgNodes.ts`、`nodeEdgeCurve.ts`へ分離している。現行の責務・テスト・変更手順はSRPリファクタリング計画のTask 1〜2を参照する。

**Files:**
- Create: `client/src/domain/imageExport/mapSvgDocument.ts`
- Test: `client/src/domain/imageExport/__tests__/mapSvgDocument.test.ts`

**Interfaces:**
- Consumes: `MapExportBounds`, `MeasureMapText`, `getNodeEdgeCurve`
- Produces: `MapSvgDocument = { svg: string; width: number; height: number }`
- Produces: `createMapSvgDocument(nodes: readonly Node[], bounds: MapExportBounds, measureText: MeasureMapText): MapSvgDocument`

- [ ] **Step 1: Write the failing SVG structure tests**

Assert exact structural fragments rather than one large snapshot: namespace, width, height, `viewBox`, white background, translated node rectangle, blue stroke, gray Bezier path, and centered `<text>` / `<tspan>` lines.

```ts
expect(document.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
expect(document.svg).toContain('viewBox="0 0 384 214"');
expect(document.svg).toContain('<rect width="384" height="214" fill="#ffffff"');
expect(document.svg).toContain('stroke="#64748b" stroke-width="2"');
expect(document.svg).toContain('stroke="#3b82f6" stroke-width="2"');
```

- [ ] **Step 2: Run the SVG tests and verify RED**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapSvgDocument.test.ts`

Expected: FAIL because `mapSvgDocument.ts` does not exist.

- [ ] **Step 3: Implement XML escaping and deterministic element ordering**

Add a private `escapeXml` that replaces `&`, `<`, `>`, `"`, and `'`. Build elements in this order: background, valid parent-child paths, node rectangles, node labels. Offset every world coordinate by `bounds.offsetX` / `bounds.offsetY`; use `getNodeEdgeCurve` before applying the offset.

- [ ] **Step 4: Implement centered multiline labels**

Use constants `MAP_EXPORT_FONT_SIZE = 14`, `MAP_EXPORT_LINE_HEIGHT = 18`, and horizontal inset `8`. For `lineCount`, calculate the first baseline as `nodeCenterY - ((lineCount - 1) * lineHeight) / 2 + fontSize / 3`. Emit one escaped `<tspan x="..." y="...">` per line.

- [ ] **Step 5: Add security, orphan-edge, negative-coordinate, and immutability tests**

Verify that `<script>&"'` appears only escaped in text content, an absent parent creates no path, negative node coordinates become positive exported coordinates, and frozen nodes remain unchanged.

- [ ] **Step 6: Run domain image-export tests and verify GREEN**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__`

Expected: all three suites PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add client/src/domain/imageExport/mapSvgDocument.ts client/src/domain/imageExport/__tests__/mapSvgDocument.test.ts
git commit -m "feat(image-export): マップSVG生成を追加"
```

---

### Task 4: 文字幅測定と画像成果物・ダウンロード

**Files:**
- Create: `client/src/services/imageExport/mapTextMeasurement.ts`
- Create: `client/src/services/imageExport/mapImageFileName.ts`
- Create: `client/src/services/imageExport/mapSvgArtifact.ts`
- Create: `client/src/services/imageExport/mapImageDownload.ts`
- Test: `client/src/services/imageExport/__tests__/mapTextMeasurement.test.ts`
- Test: `client/src/services/imageExport/__tests__/mapImageFileName.test.ts`
- Test: `client/src/services/imageExport/__tests__/mapSvgArtifact.test.ts`
- Test: `client/src/services/imageExport/__tests__/mapImageDownload.test.ts`

**Interfaces:**
- Produces: `createMapTextMeasurer(): MeasureMapText`
- Produces: `createMapImageFileName(extension: "svg" | "png", now?: Date): string`
- Produces: `createMapSvgBlob(svg: string): Blob`
- Produces: `downloadMapImage(blob: Blob, fileName: string): void`

- [ ] **Step 1: Write failing browser-adapter tests**

Mock `document.createElement("canvas")` so `getContext("2d")` returns a controlled context. Assert that the font is set to `14px Arial, Helvetica, sans-serif`, the returned function delegates to `measureText`, and missing context throws.

責務別に、ファイル名ではローカル日時、SVG成果物ではMIME type、ダウンロードではanchorの`href` / `download` / `click`と成功・click例外時の`URL.revokeObjectURL`を検証する。

- [ ] **Step 2: Run the adapter tests and verify RED**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/mapTextMeasurement.test.ts src/services/imageExport/__tests__/mapImageFileName.test.ts src/services/imageExport/__tests__/mapSvgArtifact.test.ts src/services/imageExport/__tests__/mapImageDownload.test.ts`

Expected: FAIL because the service modules do not exist.

- [ ] **Step 3: Implement text measurement**

```ts
export function createMapTextMeasurer(): MeasureMapText {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");
  context.font = "14px Arial, Helvetica, sans-serif";
  return (text) => context.measureText(text).width;
}
```

- [ ] **Step 4: Implement filename, SVG Blob creation, and download separately**

`mapImageFileName.ts`はJSON出力と同じローカル時刻のゼロ埋め規則、`mapSvgArtifact.ts`はUTF-8 SVG Blob生成だけを担当する。`downloadMapImage`は受け取ったBlobからObject URLを一つ作り、一時anchorをclickし、`finally`でURLを解放する。

- [ ] **Step 5: Run the adapter tests and verify GREEN**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/mapTextMeasurement.test.ts src/services/imageExport/__tests__/mapImageFileName.test.ts src/services/imageExport/__tests__/mapSvgArtifact.test.ts src/services/imageExport/__tests__/mapImageDownload.test.ts`

Expected: all four suites PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add client/src/services/imageExport/mapTextMeasurement.ts client/src/services/imageExport/mapImageFileName.ts client/src/services/imageExport/mapSvgArtifact.ts client/src/services/imageExport/mapImageDownload.ts client/src/services/imageExport/__tests__
git commit -m "feat(image-export): ブラウザ出力アダプターを追加"
```

---

### Task 5: SVGからPNGへの2倍ラスタライズ

**Files:**
- Create: `client/src/services/imageExport/loadMapSvgImage.ts`
- Create: `client/src/services/imageExport/mapCanvasPngEncoder.ts`
- Create: `client/src/services/imageExport/mapPngRasterizer.ts`
- Test: `client/src/services/imageExport/__tests__/loadMapSvgImage.test.ts`
- Test: `client/src/services/imageExport/__tests__/mapCanvasPngEncoder.test.ts`
- Test: `client/src/services/imageExport/__tests__/mapPngRasterizer.test.ts`

**Interfaces:**
- Produces: `withLoadedMapSvgImage<T>(svg: string, consume: (image: HTMLImageElement) => Promise<T>): Promise<T>`
- Produces: `createMapPngEncoder(width: number, height: number): (image: CanvasImageSource) => Promise<Blob>`
- Produces: `rasterizeMapSvgToPng(svg: string, width: number, height: number): Promise<Blob>` as a composition boundary

- [ ] **Step 1: Write a failing successful-rasterization test**

責務別に`Image`と`URL`、Canvasと2D contextをmockする。画像ロードでは`image.onload`後にconsumerへ同じ画像を渡し、Object URLを解放することを検証する。Canvas符号化ではピクセル寸法、`context.scale(2, 2)`、`drawImage(image, 0, 0, width, height)`、`toBlob(callback, "image/png")`を検証する。ラスタライザーではloaderからencoderへ画像を渡す合成だけを検証する。

- [ ] **Step 2: Run the rasterizer test and verify RED**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/loadMapSvgImage.test.ts src/services/imageExport/__tests__/mapCanvasPngEncoder.test.ts src/services/imageExport/__tests__/mapPngRasterizer.test.ts`

Expected: FAIL because the loader, encoder, and rasterizer modules do not exist.

- [ ] **Step 3: Implement minimal async rasterization**

`loadMapSvgImage.ts`はSVG Blob、Object URL、`Image`のライフサイクルを担当する。`mapCanvasPngEncoder.ts`はCanvas準備、2倍描画、PNG符号化を担当する。`mapPngRasterizer.ts`は両者を合成し、ブラウザ詳細を再実装しない。

- [ ] **Step 4: Add all failure-path tests**

画像ロードではload errorとイベント競合、consumerの成功・拒否・同期例外を検証し、作成したURLを一度だけ解放する。Canvas符号化ではcontext欠損、`drawImage`例外、`toBlob`例外、`toBlob(null)`、非有限・上限超過寸法を検証する。

- [ ] **Step 5: Run the rasterizer tests and verify GREEN**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/loadMapSvgImage.test.ts src/services/imageExport/__tests__/mapCanvasPngEncoder.test.ts src/services/imageExport/__tests__/mapPngRasterizer.test.ts`

Expected: PASS with no unhandled promise rejection.

- [ ] **Step 6: Commit Task 5**

```bash
git add client/src/services/imageExport/loadMapSvgImage.ts client/src/services/imageExport/mapCanvasPngEncoder.ts client/src/services/imageExport/mapPngRasterizer.ts client/src/services/imageExport/__tests__
git commit -m "feat(image-export): SVGの高解像度PNG変換を追加"
```

---

### Task 6: 画像書き出しHook

**Files:**
- Create: `client/src/services/imageExport/createMapSvgExport.ts`
- Test: `client/src/services/imageExport/__tests__/createMapSvgExport.test.ts`
- Create: `client/src/types/mapImageExport.ts`
- Create: `client/src/hooks/useMapSvgExport.ts`
- Create: `client/src/hooks/useMapPngExport.ts`
- Create: `client/src/hooks/useMapImageExport.ts`
- Test: `client/src/hooks/__tests__/useMapSvgExport.test.tsx`
- Test: `client/src/hooks/__tests__/useMapPngExport.test.tsx`
- Test: `client/src/hooks/__tests__/useMapImageExport.test.tsx`

**Interfaces:**
- Produces: `createMapSvgExport(nodes: readonly Node[]): MapSvgDocument | null`
- Produces shared `CreateSvgExport`, `DownloadImage`, and `RasterizePng` types
- `useMapSvgExport` consumes: SVG生成、SVG Blob生成、ファイル名、ダウンロード
- `useMapPngExport` consumes: SVG生成、PNG変換、ファイル名、ダウンロード
- `useMapImageExport` consumes: SVG/PNG専用Hook and owns the shared notice state
- Produces: `{ exportSvg: () => void; exportPng: () => Promise<void>; isExportingPng: boolean; notice: OperationNotice | null }`
- Test seam: optional `createSvgExport`, `downloadSvg`, `rasterizePng`, and `downloadPng` dependencies distributed to the responsible hook

- [ ] **Step 1: Add `OperationNotice` and write failing Hook tests**

Create `client/src/types/operationNotice.ts` with the existing `{ kind: "status" | "warning" | "error"; message: string }` shape. 専用Hookのテストへdeterministic adapterを注入し、空マップ、SVG成功・失敗、PNG成功・失敗、正確な日本語通知を検証する。公開Hookのテストは依存の配線、共有通知、公開戻り値だけを検証する。

- [ ] **Step 2: Run the Hook tests and verify RED**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/createMapSvgExport.test.ts src/hooks/__tests__/useMapSvgExport.test.tsx src/hooks/__tests__/useMapPngExport.test.tsx src/hooks/__tests__/useMapImageExport.test.tsx`

Expected: FAIL because the image-export hooks do not exist.

- [ ] **Step 3: Implement SVG orchestration**

`useMapSvgExport`は既定の`createMapSvgExport`を呼び、空マップを扱う。`exportSvg`はSVG Blobを作り、`.svg`名でダウンロードし、指定した成功・失敗通知をpublishする。

- [ ] **Step 4: Implement PNG orchestration with a synchronous ref guard**

`useMapPngExport`はReact stateに加えて`exportingPngRef`を使用する。最初のawaitより前にRefを設定し、trueの間は重複呼び出しを無視する。コマンドごとに共通SVGを一度生成し、ラスタライズして`.png`名でダウンロードした後、`finally`でRefとstateを戻す。

- [ ] **Step 5: Add a deferred-Promise concurrency test**

Call `exportPng` twice before resolving the first rasterizer promise. Assert one rasterizer call, `isExportingPng === true` while pending, one download after resolution, and `false` afterward.

- [ ] **Step 6: Run Hook and service tests and verify GREEN**

Run: `npm test -- --runInBand src/hooks/__tests__/useMapSvgExport.test.tsx src/hooks/__tests__/useMapPngExport.test.tsx src/hooks/__tests__/useMapImageExport.test.tsx src/services/imageExport/__tests__ src/domain/imageExport/__tests__`

Expected: all image-export suites PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add client/src/services/imageExport/createMapSvgExport.ts client/src/services/imageExport/__tests__/createMapSvgExport.test.ts client/src/hooks/useMapSvgExport.ts client/src/hooks/useMapPngExport.ts client/src/hooks/useMapImageExport.ts client/src/hooks/__tests__/useMapSvgExport.test.tsx client/src/hooks/__tests__/useMapPngExport.test.tsx client/src/hooks/__tests__/useMapImageExport.test.tsx client/src/types/mapImageExport.ts client/src/types/operationNotice.ts
git commit -m "feat(image-export): PNGとSVGの出力コマンドを追加"
```

---

### Task 7: 画像出力UIと汎用通知

**Files:**
- Create: `client/src/components/layout/MapImageExportControls.tsx`
- Create: `client/src/components/layout/MapOperationNotice.tsx`
- Create: `client/src/components/layout/__tests__/MapImageExportControls.test.tsx`
- Create: `client/src/components/layout/__tests__/MapOperationNotice.test.tsx`
- Modify: `client/src/components/layout/AppHeader.tsx`
- Modify: `client/src/components/layout/__tests__/AppHeader.test.tsx`
- Modify: `client/src/hooks/useMapFilePersistence.ts`
- Modify: `client/src/hooks/useMapJsonExport.ts`
- Modify: `client/src/hooks/useMapJsonImport.ts`
- Modify: `client/src/hooks/useMapPersistence.ts`
- Modify: `client/src/hooks/useMapStorageAutoSave.ts`
- Modify: `client/src/hooks/useMapStoragePersistence.ts`
- Modify: `client/src/hooks/useMapStorageRestoration.ts`
- Delete: `client/src/components/layout/MapPersistenceNotice.tsx`
- Delete: `client/src/components/layout/__tests__/MapPersistenceNotice.test.tsx`
- Delete: `client/src/types/persistence.ts`

**Interfaces:**
- Produces: `MapImageExportControls({ onExportPng, onExportSvg, isExportingPng })`
- Produces: `MapOperationNotice({ notice })`
- Changes: `AppHeader` props to `operationControls?: ReactNode` and `operationNotices?: ReactNode`

- [ ] **Step 1: Write failing control and notice tests**

Assert exact Japanese labels, `type="button"`, callbacks, PNG-only disabled behavior, status/alert roles, aria-live values, and existing notice colors.

- [ ] **Step 2: Run the component tests and verify RED**

Run: `npm test -- --runInBand src/components/layout/__tests__/MapImageExportControls.test.tsx src/components/layout/__tests__/MapOperationNotice.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the controls and rename the notice boundary**

Move the existing notice rendering unchanged into `MapOperationNotice`, using `OperationNotice`. Update persistence Hooks to import the generic type without changing their behavior or messages. Remove the old persistence-specific component and type after all imports are migrated.

- [ ] **Step 4: Update AppHeader through a failing test**

First change `AppHeader.test.tsx` to pass `operationControls` and `operationNotices` and verify both slots. Confirm RED from the old prop names, then update `AppHeader.tsx` to render the controls inline and notices in the existing full-width container.

- [ ] **Step 5: Run all layout and persistence tests and verify GREEN**

Run: `npm test -- --runInBand src/components/layout/__tests__ src/hooks/__tests__/useMapPersistence.test.tsx src/hooks/__tests__/useMapJsonExport.test.tsx`

Expected: PASS with existing persistence notifications unchanged.

- [ ] **Step 6: Commit Task 7**

```bash
git add client/src/components/layout client/src/hooks client/src/types
git commit -m "refactor(notice): マップ操作通知を共通化"
```

---

### Task 8: ページ統合と回帰検証

**Files:**
- Modify: `client/src/app/page.tsx`
- Modify: `client/src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `useMapImageExport({ nodes })`
- Wires: JSON入出力、PNG / SVG入出力、両方の通知

- [ ] **Step 1: Write failing page-integration tests**

Mock `useMapImageExport` and assert that it receives the current node array. Verify PNG / SVG button callbacks, PNG pending state, and simultaneous placement of persistence and image-export notices. Preserve existing JSON import/export and `MapStage` wiring assertions.

- [ ] **Step 2: Run the page test and verify RED**

Run: `npm test -- --runInBand src/app/__tests__/page.test.tsx`

Expected: FAIL because `page.tsx` does not use the image-export Hook or controls.

- [ ] **Step 3: Wire the Hook, controls, and notices**

Call `useMapImageExport({ nodes })`. Pass a fragment containing `MapPersistenceControls` and `MapImageExportControls` to `operationControls`. Pass non-null persistence and image notices as separate `MapOperationNotice` elements to `operationNotices`.

- [ ] **Step 4: Run focused integration and image-export tests**

Run: `npm test -- --runInBand src/app/__tests__/page.test.tsx src/hooks/__tests__/useMapSvgExport.test.tsx src/hooks/__tests__/useMapPngExport.test.tsx src/hooks/__tests__/useMapImageExport.test.tsx src/components/layout/__tests__ src/domain/imageExport/__tests__ src/services/imageExport/__tests__`

Expected: all focused suites PASS.

- [ ] **Step 5: Run the complete verification suite**

Run: `npm run verify`

Expected: Tailwind scan, ESLint, TypeScript, every Jest suite, and Next.js production build all succeed.

- [ ] **Step 6: Commit Task 8**

```bash
git add client/src/app/page.tsx client/src/app/__tests__/page.test.tsx
git commit -m "feat(image-export): PNGとSVG書き出しUIを統合"
```

- [ ] **Step 7: Inspect the final branch diff**

Run: `git diff --check origin/main...HEAD`

Run: `git status --short --branch`

Expected: no whitespace errors, the worktree is clean, and the branch contains only the planned changes.

---

## Plan Self-Review

- Spec coverage: 全ノード範囲、32px余白、白背景、SVG、2倍PNG、ラベル改行、XMLエスケープ、日本語通知、重複実行防止、URL解放をTask 1〜8でカバーする。
- 各手順に対象ファイル、入出力型、テストコマンド、成功条件を明記している。
- Type consistency: `MapExportBounds`、`MeasureMapText`、`MapSvgDocument`、`OperationNotice`、Hookの4戻り値は後続Taskで同じ名称を使う。
