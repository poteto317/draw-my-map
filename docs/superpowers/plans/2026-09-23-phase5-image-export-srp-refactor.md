# Phase 5 Image Export SRP Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 5画像エクスポートの外部挙動を維持したまま、SVG生成、PNG変換、ダウンロード、React調停を一つの変更理由を持つモジュールへ分割する。

**Architecture:** 既存の公開APIには薄い合成境界を残し、純粋なSVG生成とブラウザ固有処理、SVG/PNG別Hookを内側の責務へ分離する。各抽出は既存挙動を直接検出する責務別テストを先に追加し、統合テストは合成順序と公開契約だけを検証する。

**Tech Stack:** Next.js 16、React 19、TypeScript、Jest、Testing Library、DOM/Canvas API

**Spec:** `docs/superpowers/specs/2026-09-23-phase5-image-export-srp-refactor-design.md`

## Global Constraints

- `useMapImageExport({ nodes })`の公開戻り値を変更しない。
- ユーザー向けUI、通知文言、生成されるPNG/SVG、描画順を変更しない。
- PNGは2倍解像度とし、同一tickの重複開始を拒否する。
- Object URLとイベントhandlerは成功・失敗・同期例外・競合イベントで一度だけ解放する。
- 外部依存、ロードマップ変更、Gitコミットを追加しない。
- 各本番変更の前に対応テストを追加し、期待した理由でREDになることを確認する。

---

### Task 1: XML文字処理と辺曲線を独立させる

**Files:**
- Create: `client/src/domain/imageExport/mapXmlText.ts`
- Create: `client/src/domain/imageExport/__tests__/mapXmlText.test.ts`
- Create: `client/src/domain/nodes/nodeEdgeCurve.ts`
- Create: `client/src/domain/nodes/__tests__/nodeEdgeCurve.test.ts`
- Modify: `client/src/components/map/mapGeometry.ts`
- Modify: `client/src/components/map/__tests__/mapGeometry.test.ts`

**Interfaces:**
- Produces: `escapeMapXmlText(value: string): string`
- Produces: `getNodeEdgeCurve(parent: Node, child: Node): EdgeCurve`
- Preserves: `mapGeometry.ts`からの`getEdgeCurve`互換export

- [ ] **Step 1: XML文字処理の失敗テストを書く**

```ts
import { escapeMapXmlText } from "@/domain/imageExport/mapXmlText";

it("XML禁止文字を置換し構造文字をエスケープする", () => {
  expect(escapeMapXmlText(`A\u0000<script>&"'B`))
    .toBe("A\uFFFD&lt;script&gt;&amp;&quot;&apos;B");
});

it("XML 1.0で許可される空白とUnicodeを保持する", () => {
  expect(escapeMapXmlText("\t\n\r日本語😀\u{10FFFF}"))
    .toBe("\t\n\r日本語😀\u{10FFFF}");
});
```

- [ ] **Step 2: XMLテストが未実装importでREDになることを確認する**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapXmlText.test.ts`

Expected: FAIL because `mapXmlText` does not exist.

- [ ] **Step 3: XML文字処理を移動する**

`mapSvgDocument.ts`の既存正規表現と5種類のXMLエスケープをそのまま`escapeMapXmlText`へ移す。置換順序を変えない。

- [ ] **Step 4: XML責務テストをGREENにする**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapXmlText.test.ts`

Expected: PASS.

- [ ] **Step 5: 辺曲線の失敗テストを書く**

```ts
import { getNodeEdgeCurve } from "@/domain/nodes/nodeEdgeCurve";

it("親の右中央から子の左中央へBezier曲線を作る", () => {
  const parent = { id: 1, parentId: null, x: 10, y: 20, width: 100, height: 60, label: "P" };
  const child = { id: 2, parentId: 1, x: 210, y: 100, width: 80, height: 40, label: "C" };

  expect(getNodeEdgeCurve(parent, child)).toEqual({
    start: { x: 110, y: 50 },
    control1: { x: 160, y: 50 },
    control2: { x: 160, y: 120 },
    end: { x: 210, y: 120 },
  });
});
```

同符号の極大有限X座標でも制御点が有限値に留まるケースを追加し、加算時のオーバーフローを検出する。

- [ ] **Step 6: 辺曲線テストが未実装importでREDになることを確認する**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeEdgeCurve.test.ts`

Expected: FAIL because `nodeEdgeCurve` does not exist.

- [ ] **Step 7: 辺曲線をドメインへ移動して互換exportを残す**

`Point`、`EdgeCurve`、計算式を`nodeEdgeCurve.ts`へ移す。制御点の中点は各X座標を先に半分にしてから加算し、有限座標同士の加算オーバーフローを避ける。`mapGeometry.ts`では`getNodeEdgeCurve as getEdgeCurve`と型を再exportし、既存利用者を変更しない。

- [ ] **Step 8: ドメインテストと既存ジオメトリテストをGREENにする**

Run: `npm test -- --runInBand src/domain/nodes/__tests__/nodeEdgeCurve.test.ts src/components/map/__tests__/mapGeometry.test.ts`

Expected: PASS.

---

### Task 2: SVG辺・ノード生成を文書合成から分離する

**Files:**
- Create: `client/src/domain/imageExport/mapSvgEdges.ts`
- Create: `client/src/domain/imageExport/mapSvgNodes.ts`
- Create: `client/src/domain/imageExport/__tests__/mapSvgEdges.test.ts`
- Create: `client/src/domain/imageExport/__tests__/mapSvgNodes.test.ts`
- Modify: `client/src/domain/imageExport/mapSvgDocument.ts`
- Modify: `client/src/domain/imageExport/__tests__/mapSvgDocument.test.ts`

**Interfaces:**
- Consumes: `getNodeEdgeCurve`, `escapeMapXmlText`, `wrapMapExportText`, `getMapExportLabel`
- Produces: `createMapSvgEdges(nodes, bounds): string`
- Produces: `createMapSvgNodes(nodes, bounds, measureText): { rectangles: string; labels: string }`
- Preserves: `createMapSvgDocument(nodes, bounds, measureText): MapSvgDocument`

- [ ] **Step 1: 辺生成の失敗テストを書く**

親子2件と親欠損1件を入力し、親子のpathだけが座標offset込みで出力され、入力が変更されないことをリテラルで検証する。

```ts
expect(createMapSvgEdges(nodes, bounds)).toBe(
  '<path d="M 132 62 C 182 62 182 147 232 147" fill="none" stroke="#64748b" stroke-width="2" />',
);
```

- [ ] **Step 2: 辺テストのREDを確認する**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapSvgEdges.test.ts`

Expected: FAIL because `mapSvgEdges` does not exist.

- [ ] **Step 3: 親索引とpath生成を`mapSvgEdges.ts`へ移す**

最初の同一IDだけを親索引へ登録する既存契約、親欠損を無視する契約、入力順を維持する。

- [ ] **Step 4: 辺テストをGREENにする**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapSvgEdges.test.ts`

Expected: PASS.

- [ ] **Step 5: ノード・ラベル生成の失敗テストを書く**

次を別テストで直接検証する。

```ts
expect(markup.rectangles).toContain(
  '<rect x="32" y="32" width="100" height="60" fill="#ffffff" stroke="#3b82f6" stroke-width="2" />',
);
expect(markup.labels).toContain(
  '<tspan x="82" y="66.66666666666667">Parent</tspan>',
);
```

- 狭い幅`10`と`16`でも`A😀B`を`["A", "😀", "B"]`として保持する。
- XML禁止文字と構造文字を含むラベルをDOMParserで解析できる。
- 明示改行と負座標offsetを維持する。
- 凍結入力を変更しない。

- [ ] **Step 6: ノード生成テストのREDを確認する**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapSvgNodes.test.ts`

Expected: FAIL because `mapSvgNodes` does not exist.

- [ ] **Step 7: 矩形・ラベル生成を`mapSvgNodes.ts`へ移す**

フォントサイズ`14`、行高`18`、水平inset`8`、font family、色、baseline式を変更しない。XML処理は`escapeMapXmlText`へ委譲する。

- [ ] **Step 8: ノード生成テストをGREENにする**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapSvgNodes.test.ts`

Expected: PASS.

- [ ] **Step 9: 文書生成を合成だけへ縮小する**

`createMapSvgDocument`は背景を作り、`createMapSvgEdges`と`createMapSvgNodes`を呼び、背景→辺→矩形→ラベル順で`svg`を組み立てる。既存テストは寸法、描画順、合成結果だけを残し、移動済みの詳細テストを削除する。

- [ ] **Step 10: SVG責務別・統合テストをまとめて実行する**

Run: `npm test -- --runInBand src/domain/imageExport/__tests__/mapXmlText.test.ts src/domain/imageExport/__tests__/mapSvgEdges.test.ts src/domain/imageExport/__tests__/mapSvgNodes.test.ts src/domain/imageExport/__tests__/mapSvgDocument.test.ts`

Expected: PASS.

---

### Task 3: 画像成果物生成とブラウザダウンロードを分離する

**Files:**
- Create: `client/src/services/imageExport/mapImageFileName.ts`
- Create: `client/src/services/imageExport/mapSvgArtifact.ts`
- Create: `client/src/services/imageExport/__tests__/mapImageFileName.test.ts`
- Create: `client/src/services/imageExport/__tests__/mapSvgArtifact.test.ts`
- Modify: `client/src/services/imageExport/mapImageDownload.ts`
- Modify: `client/src/services/imageExport/__tests__/mapImageDownload.test.ts`
- Modify imports in image-export consumers

**Interfaces:**
- Produces: `createMapImageFileName(extension, now?): string`
- Produces: `createMapSvgBlob(svg): Blob`
- Preserves: `downloadMapImage(blob, fileName): void`

- [ ] **Step 1: ファイル名規則とSVG Blob表現の失敗テストを書く**

```ts
expect(createMapImageFileName("svg", new Date(2026, 8, 20, 12, 34, 56)))
  .toBe("draw-my-map-20260920-123456.svg");
expect(createMapImageFileName("png", new Date(2026, 8, 20, 12, 34, 56)))
  .toBe("draw-my-map-20260920-123456.png");
expect(createMapSvgBlob("<svg />").type).toBe("image/svg+xml;charset=utf-8");
```

- [ ] **Step 2: 成果物テストのREDを確認する**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/mapImageFileName.test.ts src/services/imageExport/__tests__/mapSvgArtifact.test.ts`

Expected: FAIL because `mapImageFileName` and `mapSvgArtifact` do not exist.

- [ ] **Step 3: ファイル名規則とSVG Blob生成を別モジュールへ移動する**

`mapImageFileName.ts`はファイル名規則だけを持つ。日時はローカル時刻、各要素は2桁ゼロ埋め、基底名は`draw-my-map`のまま維持する。`mapSvgArtifact.ts`はSVG文字列からUTF-8 Blobを作る責務だけを持つ。

- [ ] **Step 4: ダウンロードテストをDOM操作だけへ絞る**

成功時に渡されたBlobのURLをanchorへ設定してclickすること、click例外時にも同じURLを解放することを検証する。ファイル名とMIMEのテストは成果物テストへ移す。

- [ ] **Step 5: 成果物・ダウンロードテストをGREENにする**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/mapImageFileName.test.ts src/services/imageExport/__tests__/mapSvgArtifact.test.ts src/services/imageExport/__tests__/mapImageDownload.test.ts`

Expected: PASS.

---

### Task 4: SVG画像ロードとCanvas PNG符号化を分離する

**Files:**
- Create: `client/src/services/imageExport/loadMapSvgImage.ts`
- Create: `client/src/services/imageExport/mapCanvasPngEncoder.ts`
- Create: `client/src/services/imageExport/__tests__/loadMapSvgImage.test.ts`
- Create: `client/src/services/imageExport/__tests__/mapCanvasPngEncoder.test.ts`
- Modify: `client/src/services/imageExport/mapPngRasterizer.ts`
- Modify: `client/src/services/imageExport/__tests__/mapPngRasterizer.test.ts`

**Interfaces:**
- Consumes: `createMapSvgBlob`
- Produces: `withLoadedMapSvgImage<T>(svg, consume): Promise<T>`
- Produces: `createMapPngEncoder(width, height): (image: CanvasImageSource) => Promise<Blob>`
- Preserves: `rasterizeMapSvgToPng(svg, width, height): Promise<Blob>`

- [ ] **Step 1: SVG画像ロードの失敗テストを書く**

責務別に次の現象を検証する。

- load時にconsumerへ同じImageを渡す。
- error時に`Failed to load SVG image`で拒否する。
- `new Image()`と`src` setterの同期例外を拒否へ変換する。
- 重複load、load後error、error後loadでconsumerまたは拒否を一度だけ採用する。
- consumerの成功・拒否・同期例外後にhandlerとObject URLを一度だけ解放する。

- [ ] **Step 2: SVG画像ロードテストのREDを確認する**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/loadMapSvgImage.test.ts`

Expected: FAIL because `loadMapSvgImage` does not exist.

- [ ] **Step 3: `withLoadedMapSvgImage`を実装する**

状態を`loading | consuming | settled`で管理する。最初のloadだけがconsumerを開始し、consumerのPromise完了までObject URLを保持する。`finish`だけがhandler解除、URL解放、resolve/rejectを実行する。

- [ ] **Step 4: SVG画像ロードテストをGREENにする**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/loadMapSvgImage.test.ts`

Expected: PASS.

- [ ] **Step 5: Canvas符号化の失敗テストを書く**

次を直接検証する。

```ts
expect(canvas.width).toBe(640);
expect(canvas.height).toBe(360);
expect(context.scale).toHaveBeenCalledWith(2, 2);
expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 320, 180);
expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
```

factory呼び出し時にCanvasを準備し、2D context欠損は同期例外となることを検証する。返した関数では`drawImage`例外、`toBlob`例外、null BlobをそれぞれPromise拒否へ変換する。
小数の論理寸法は2倍後に整数へ切り上げ、2倍計算で非有限値になる寸法は同期例外にすることも検証する。

- [ ] **Step 6: Canvas符号化テストのREDを確認する**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/mapCanvasPngEncoder.test.ts`

Expected: FAIL because `mapCanvasPngEncoder` does not exist.

- [ ] **Step 7: 2倍Canvas描画とPNG符号化を実装する**

`PNG_SCALE = 2`をencoder側で所有する。`createMapPngEncoder(width, height)`で2倍後のピクセル寸法を有限性検証し、`Math.ceil`で整数化してからCanvasとcontextを準備する。画像を消費する関数を返し、既存のエラーメッセージを維持する。context欠損をSVG画像ロードより前に検出するため、factoryの同期例外は公開ラスタライザーの`async`境界でPromise拒否へ変換する。

- [ ] **Step 8: Canvas符号化テストをGREENにする**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/mapCanvasPngEncoder.test.ts`

Expected: PASS.

- [ ] **Step 9: ラスタライザーを合成境界へ縮小する**

```ts
export async function rasterizeMapSvgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<Blob> {
  const encode = createMapPngEncoder(width, height);
  return withLoadedMapSvgImage(svg, encode);
}
```

統合テストではloaderが生成したImageがencoderへ渡り、最終Blobが返る公開経路を検証する。既存のcontext欠損時にImage/Object URLを生成しない早期失敗テストも維持する。このfactory形式は既存契約を維持するための承認済み変更である。

- [ ] **Step 10: PNG責務別・統合テストをまとめて実行する**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/loadMapSvgImage.test.ts src/services/imageExport/__tests__/mapCanvasPngEncoder.test.ts src/services/imageExport/__tests__/mapPngRasterizer.test.ts`

Expected: PASS.

---

### Task 5: SVG/PNG Hookを分離して公開Hookで合成する

**Files:**
- Create: `client/src/types/mapImageExport.ts`
- Create: `client/src/services/imageExport/createMapSvgExport.ts`
- Create: `client/src/services/imageExport/__tests__/createMapSvgExport.test.ts`
- Create: `client/src/hooks/useMapSvgExport.ts`
- Create: `client/src/hooks/useMapPngExport.ts`
- Create: `client/src/hooks/__tests__/useMapSvgExport.test.tsx`
- Create: `client/src/hooks/__tests__/useMapPngExport.test.tsx`
- Modify: `client/src/hooks/useMapImageExport.ts`
- Modify: `client/src/hooks/__tests__/useMapImageExport.test.tsx`

**Interfaces:**
- Produces shared `CreateSvgExport`, `DownloadImage`, `RasterizePng` types
- Produces: `createMapSvgExport(nodes): MapSvgDocument | null`
- Produces: `useMapSvgExport(options): () => void`
- Produces: `useMapPngExport(options): { exportPng; isExportingPng }`
- Preserves: `useMapImageExport(options): UseMapImageExportResult`

- [ ] **Step 1: 既定SVG生成経路の失敗テストを書く**

Canvas文字測定を制御し、空ノードでは`null`、1ノードではpadding込みの`184 x 112`文書と座標`32,32`を返し、fontが`14px Arial, Helvetica, sans-serif`になることを検証する。

- [ ] **Step 2: 既定SVG生成テストのREDを確認する**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/createMapSvgExport.test.ts`

Expected: FAIL because `createMapSvgExport` does not exist.

- [ ] **Step 3: 既定SVG生成ユースケースをHook外へ移す**

空ノードなら文字測定を作らず`null`を返す。ノードがあれば`createMapTextMeasurer`を一度だけ作成し、同じ測定関数を`getMapExportBounds(nodes, measureText)`と`createMapSvgDocument(nodes, bounds, measureText)`へ渡す。

- [ ] **Step 4: SVG Hookの失敗テストを書く**

空マップ警告、成功時のSVG Blobと`.svg`名、ダウンロード同期例外のエラー通知、入力不変を直接検証する。期待文言はリテラルで保持する。

- [ ] **Step 5: SVG HookテストのREDを確認する**

Run: `npm test -- --runInBand src/hooks/__tests__/useMapSvgExport.test.tsx`

Expected: FAIL because `useMapSvgExport` does not exist.

- [ ] **Step 6: `useMapSvgExport`を実装する**

通知は内部stateにせず、すべて`publishNotice`へ渡す。成果物生成とダウンロードは抽出済みサービスへ委譲する。

- [ ] **Step 7: PNG Hookの失敗テストを書く**

空マップ警告、共有SVGのラスタライズ引数、`.png`名、変換失敗、同一tick連打、処理中stateとfinally解除を直接検証する。

- [ ] **Step 8: PNG HookテストのREDを確認する**

Run: `npm test -- --runInBand src/hooks/__tests__/useMapPngExport.test.tsx`

Expected: FAIL because `useMapPngExport` does not exist.

- [ ] **Step 9: `useMapPngExport`を実装する**

同期Refを排他の真実源、React stateを表示用とする。空マップを含む全開始経路でfinallyにより両方を解除する。

- [ ] **Step 10: 公開Hookを共有通知の合成だけへ縮小する**

`useMapImageExport`は`notice` stateを一つ持ち、`setNotice`を両Hookへ渡す。既存optionsの任意依存を該当Hookへ配り、既存戻り値をそのまま返す。

- [ ] **Step 11: 公開Hook統合テストを絞る**

SVG操作とPNG操作が同じ通知slotを更新できること、optionsが各責務へ配線されること、公開戻り値の形を検証する。移動済みの詳細ケースは削除する。

- [ ] **Step 12: Hook責務別・統合テストをまとめて実行する**

Run: `npm test -- --runInBand src/services/imageExport/__tests__/createMapSvgExport.test.ts src/hooks/__tests__/useMapSvgExport.test.tsx src/hooks/__tests__/useMapPngExport.test.tsx src/hooks/__tests__/useMapImageExport.test.tsx`

Expected: PASS.

---

### Task 6: 全体検証と再監査

**Files:**
- Modify only if verification exposes a regression in files changed by Tasks 1-5

**Interfaces:**
- Preserves every public interface and user-visible behavior listed in Global Constraints

- [ ] **Step 1: 画像エクスポート関連テストを実行する**

Run: `npm test -- --runInBand src/domain/imageExport src/services/imageExport src/hooks/__tests__/useMapSvgExport.test.tsx src/hooks/__tests__/useMapPngExport.test.tsx src/hooks/__tests__/useMapImageExport.test.tsx src/components/layout/__tests__/MapImageExportControls.test.tsx src/app/__tests__/page.test.tsx`

Expected: PASS.

- [ ] **Step 2: 全検証を実行する**

Run: `npm run verify`

Expected: lint、typecheck、75件以上のtest suite、buildがすべて成功する。

- [ ] **Step 3: 差分品質を確認する**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 4: `origin/main...HEAD`と未コミット差分を再監査する**

次の観点を全変更本番ファイルへ適用する。

- 一つのファイルに独立した変更理由が複数ない。
- 合成境界が業務詳細やブラウザ詳細を再実装していない。
- ドメイン層がcomponents/hooks/servicesへ依存していない。
- HookがDOM/Canvasの詳細を持たない。
- サービスがReact stateと通知文言を持たない。
- 同じ責務が複数モジュールへ重複していない。

1件でも見つけた場合は、その責務を検出する失敗テストを追加してRED→GREENを行い、このStepを再実行する。0件になるまで繰り返す。

- [ ] **Step 5: 未コミット状態を報告する**

Run: `git status --short --branch`

Expected: `codex/phase5-image-export`上に、設計書、計画書、本番コード、テストの未コミット変更が表示され、追加コミットは存在しない。
