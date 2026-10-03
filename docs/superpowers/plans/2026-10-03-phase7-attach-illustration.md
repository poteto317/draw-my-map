# 生成したイラストをノードに紐付けて表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 右パネルでプレビューしたイラストを「ノードに設定」で選択中のノードへ紐付け、キャンバス（Pixi）に表示し、保存（localStorage / JSON）と画像エクスポート（PNG / SVG）にも反映する。

**Architecture:** `Node` に任意項目 `illustration`（縮小済み JPEG の data URL）を追加する。生成直後に 128px へ縮小して（`createIllustrationThumbnail`）プレビューと保存の両方に同じ画像を使うので、保存サイズが小さく（1枚 約10KB）、localStorage の上限（約5MB）に収まる。イラスト付きノードは高さが `ILLUSTRATED_NODE_HEIGHT`（116）に伸び、上部にイラスト、下部にテキストを置く。高さは `Node.height` に保存されるので、自動レイアウト・エッジ・エクスポート範囲は既存の仕組みのまま動く。保存形式は JSON を version 3 に上げ、version 1・2 は引き続き読み込める。

**Tech Stack:** Next.js 16 / React 19（React Compiler）/ PixiJS 8.16 / TypeScript / Jest（jsdom）

## Global Constraints

- 作業は通常のブランチ `phase7-attach-illustration` で行う。**git worktree は使わない**。
- 実装は必ずサブエージェント駆動（AGENTS.md）。実装者とレビュアーは別のエージェント。サブエージェントを呼ぶときは必ずモデルを指定する。
- コミットは、実装者が **ファイルを1つずつ指定して** 行う（`git add -A` / `git add .` / `git commit -a` は禁止）。
- コミットメッセージは日本語の Conventional Commits。空行のあと、最後に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` を付ける（`git interpret-trailers --parse` で確認する）。
- `client/.env.local` と秘密情報は、読まない・出力しない・ログに出さない。実際の Cloudflare API は、最後の手動確認（Task 7）の1回だけ呼んでよい（HTTP ステータスとエラーコードだけを表示する）。
- 各タスクは、先に失敗するテストを書く（TDD）。ユニットテストは `client/src/**/__tests__/` に置く。
- Jest の環境は jsdom が既定。`Response` / `fetch` を使うテストだけ、ファイル先頭に `/** @jest-environment node */` を付ける。
- React Compiler の lint ルールを守る（描画中に ref を読まない。effect の中で同期的に setState しない）。
- 既存のテストの期待値は変更しない（バージョンを表す `version: 2` を `3` に変える、のような、この計画が明示した変更を除く）。
- 検証は `client` で `npm run verify`（tailwind scan / lint / typecheck / test / build）。
- 最後のタスクで ROADMAP.md を更新し、同じブランチでコミットする。実装した項目だけをチェックし、「現在地」と「最終更新」の日付も直す。
- 範囲外: イラストの削除と再生成の専用 UI（ROADMAP の次の項目）。既にイラストがあるノードへ「ノードに設定」で置き換えることはできる（上書きの1操作だけで、削除はしない）。

## 設計の決定（確認したい点の、推奨の既定値）

1. **イラストの置き場所**: ノード内。ノードの高さを 60 → 116 に伸ばし、上に 48×48 のイラスト（上余白 8）、下にテキストを置く。幅は変えない。
2. **保存サイズ**: 生成画像（1024px、約100KB）を 128px の JPEG（品質 0.85）に縮小してから保存する。data URL の長さの上限は 100,000 文字（読み込み時に検証）。
3. **紐付けの操作**: 生成後に、パネルのプレビューの下に出る「ノードに設定」ボタンで紐付ける（気に入らない画像を紐付けないため）。
4. **JSON**: version 3（`nodes[].illustration` は任意）。version 1・2 は読み込める。書き出しは常に version 3。
5. **エクスポート**: PNG・SVG にイラストを含める（SVG の `<image href="data:...">`）。
6. **手動レイアウトの重なり**: 手動モードでは、イラストの追加で高さが伸びたノードが、下のノードと重なることがある（自動レイアウトのときは、再配置される）。利用者がドラッグで直す前提にする。
7. **重要度フィルタ**: イラストはノードのコンテナの中に描くので、既存のフェード（透明度、操作の有効・無効）にそのまま従う。

## File Structure

新規:
- `client/src/config/illustration.ts` — サムネイルの大きさ、品質、data URL の上限。
- `client/src/domain/illustration/illustrationDataUrl.ts` — data URL の検証（`isIllustrationDataUrl`）。
- `client/src/domain/nodes/nodeIllustration.ts` — イラストの配置（矩形、テキストの中心）。
- `client/src/domain/nodes/nodeIllustrationUpdate.ts` — イラストを設定した新しいノード配列を作る純粋関数。
- `client/src/services/illustration/illustrationThumbnail.ts` — 画像を 128px の JPEG に縮小する。
- `client/src/components/map/pixi/illustrationTextureLoader.ts` — data URL から Pixi のテクスチャを作る。
- `client/src/components/map/useIllustrationTextures.ts` — テクスチャを読み込んで保持するフック。

変更:
- `client/src/config/shapes.ts`、`client/src/types/node.ts`、`client/src/types/mapDocument.ts`
- `client/src/domain/persistence/` の `mapDocumentDecoder.ts`、`mapDocumentEncoder.ts`、`mapDocumentNode.ts`、`mapDocumentNodeProjection.ts`、`mapDocumentNodeImportance.ts`（version の型だけ）
- `client/src/services/illustration/illustrationClient.ts`（エラーの種類を1つ追加）
- `client/src/hooks/useIllustrationGeneration.ts`、`client/src/hooks/useNodes.ts`
- `client/src/components/layout/IllustrationPanel.tsx`、`client/src/app/page.tsx`
- `client/src/components/map/pixi/pixiTypes.ts`、`usePixiApplication.ts`、`renderMapNodes.ts`、`renderMapScene.ts`、`testing/pixiTestHarness.ts`、`client/src/components/map/useRenderedMapScene.ts`、`client/src/components/map/MapStage.tsx`
- `client/src/domain/imageExport/mapSvgNodes.ts`、`mapSvgDocument.ts`、`mapExportBounds.ts`
- `ROADMAP.md`、`client/README.md`

---

### Task 1: イラストの型と配置（純粋なドメイン）

**Files:**
- Modify: `client/src/config/shapes.ts`、`client/src/types/node.ts`
- Create: `client/src/config/illustration.ts`、`client/src/domain/illustration/illustrationDataUrl.ts`、`client/src/domain/nodes/nodeIllustration.ts`、`client/src/domain/nodes/nodeIllustrationUpdate.ts`
- Test: `client/src/domain/illustration/__tests__/illustrationDataUrl.test.ts`、`client/src/domain/nodes/__tests__/nodeIllustration.test.ts`、`client/src/domain/nodes/__tests__/nodeIllustrationUpdate.test.ts`

**Interfaces:**
- Produces:
  - `ILLUSTRATION_SIZE = 48`、`ILLUSTRATION_TOP_PADDING = 8`、`ILLUSTRATION_AREA_HEIGHT = 56`、`ILLUSTRATED_NODE_HEIGHT = 116`（`config/shapes.ts`）
  - `ILLUSTRATION_THUMBNAIL_SIZE = 128`、`ILLUSTRATION_THUMBNAIL_QUALITY = 0.85`、`MAX_ILLUSTRATION_DATA_URL_LENGTH = 100_000`（`config/illustration.ts`）
  - `Node.illustration?: string`
  - `isIllustrationDataUrl(value: unknown): value is string`
  - `getNodeIllustrationRect(node: Pick<Node, "x" | "y" | "width">): { x: number; y: number; size: number }`
  - `getNodeLabelCenterOffset(node: Pick<Node, "height" | "illustration">): number`（ノード上端からテキストの中心までの距離）
  - `replaceNodeIllustration(nodes: readonly Node[], id: number, dataUrl: string): Node[] | null`

- [ ] **Step 1: 失敗するテストを書く**

`illustrationDataUrl.test.ts`:

```ts
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";
import { MAX_ILLUSTRATION_DATA_URL_LENGTH } from "@/config/illustration";

describe("isIllustrationDataUrl", () => {
  it("jpeg の base64 data URL を受け付ける", () => {
    expect(isIllustrationDataUrl("data:image/jpeg;base64,AAAA")).toBe(true);
  });

  it.each(["png", "webp"])("%s は拒否する（アプリが出力するのは jpeg だけ）", (type) => {
    expect(isIllustrationDataUrl(`data:image/${type};base64,AAAA`)).toBe(false);
  });

  it.each([
    ["文字列でない", 1],
    ["null", null],
    ["svg は不可（スクリプトを含みうる）", "data:image/svg+xml;base64,AAAA"],
    ["base64 でない", "data:image/jpeg,AAAA"],
    ["http の URL", "https://example.com/a.png"],
    ["本体が空", "data:image/jpeg;base64,"],
    ["属性を壊す文字を含む", 'data:image/jpeg;base64,AA"AA'],
    ["改行を含む", "data:image/jpeg;base64,AA\nAA"],
  ])("%s は拒否する", (_name, value) => {
    expect(isIllustrationDataUrl(value)).toBe(false);
  });

  it("上限ちょうどは受け付け、1文字超えると拒否する", () => {
    const prefix = "data:image/jpeg;base64,";
    const atLimit = prefix + "A".repeat(MAX_ILLUSTRATION_DATA_URL_LENGTH - prefix.length);
    expect(isIllustrationDataUrl(atLimit)).toBe(true);
    expect(isIllustrationDataUrl(`${atLimit}A`)).toBe(false);
  });
});
```

`nodeIllustration.test.ts`:

```ts
import {
  ILLUSTRATED_NODE_HEIGHT,
  ILLUSTRATION_AREA_HEIGHT,
  ILLUSTRATION_SIZE,
  ILLUSTRATION_TOP_PADDING,
  RECT_HEIGHT,
} from "@/config/shapes";
import { getNodeIllustrationRect, getNodeLabelCenterOffset } from "@/domain/nodes/nodeIllustration";

describe("ノードのイラストの配置", () => {
  it("定数が整合している", () => {
    expect(ILLUSTRATION_AREA_HEIGHT).toBe(ILLUSTRATION_TOP_PADDING + ILLUSTRATION_SIZE);
    expect(ILLUSTRATED_NODE_HEIGHT).toBe(RECT_HEIGHT + ILLUSTRATION_AREA_HEIGHT);
  });

  it("イラストは、ノードの上部の中央に置く", () => {
    expect(getNodeIllustrationRect({ x: 10, y: 20, width: 100 })).toEqual({
      x: 10 + (100 - ILLUSTRATION_SIZE) / 2,
      y: 20 + ILLUSTRATION_TOP_PADDING,
      size: ILLUSTRATION_SIZE,
    });
  });

  it("イラストが無いノードは、従来どおり、高さの半分がテキストの中心", () => {
    expect(getNodeLabelCenterOffset({ height: 60 })).toBe(30);
  });

  it("イラストがあるノードは、イラストの下の領域の中央がテキストの中心", () => {
    // 下の領域 = 116 - 56 = 60、その中央 = 56 + 30 = 86
    expect(getNodeLabelCenterOffset({ height: ILLUSTRATED_NODE_HEIGHT, illustration: "data:image/png;base64,AAAA" })).toBe(86);
  });
});
```

`nodeIllustrationUpdate.test.ts`:

```ts
import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import { replaceNodeIllustration } from "@/domain/nodes/nodeIllustrationUpdate";
import type { Node } from "@/types/node";

const URL1 = "data:image/jpeg;base64,AAAA";
const node = (id: number): Node => ({
  id, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "a", importance: "medium",
});

describe("replaceNodeIllustration", () => {
  it("対象のノードにだけ、イラストを設定し、高さを伸ばす", () => {
    const result = replaceNodeIllustration([node(1), node(2)], 2, URL1)!;
    expect(result[0]).toEqual(node(1));
    expect(result[1]).toEqual({ ...node(2), illustration: URL1, height: ILLUSTRATED_NODE_HEIGHT });
  });

  it("入力の配列とノードを変更しない", () => {
    const nodes = [node(1)];
    replaceNodeIllustration(nodes, 1, URL1);
    expect(nodes[0]).toEqual(node(1));
  });

  it("既にイラストがあるノードは、置き換える（高さは変わらない）", () => {
    const first = replaceNodeIllustration([node(1)], 1, URL1)!;
    const second = replaceNodeIllustration(first, 1, "data:image/jpeg;base64,BBBB")!;
    expect(second[0].illustration).toBe("data:image/jpeg;base64,BBBB");
    expect(second[0].height).toBe(ILLUSTRATED_NODE_HEIGHT);
  });

  it("対象のノードが無いときは null", () => {
    expect(replaceNodeIllustration([node(1)], 9, URL1)).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run（`client` で）: `npx jest src/domain/illustration/__tests__/illustrationDataUrl.test.ts src/domain/nodes/__tests__/nodeIllustration.test.ts src/domain/nodes/__tests__/nodeIllustrationUpdate.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`config/shapes.ts` の末尾に追加:

```ts
// ノードに紐付けるイラストの配置（ノード上部の中央に置き、その分だけノードの高さを伸ばす）
export const ILLUSTRATION_SIZE = 48;
export const ILLUSTRATION_TOP_PADDING = 8;
export const ILLUSTRATION_AREA_HEIGHT = ILLUSTRATION_TOP_PADDING + ILLUSTRATION_SIZE;
export const ILLUSTRATED_NODE_HEIGHT = RECT_HEIGHT + ILLUSTRATION_AREA_HEIGHT;
```

`types/node.ts` の `Node` に、次の項目を足す（他の項目と同じ書式で）:

```ts
  // 縮小済みのイラストの data URL。無いノードでは、項目ごと持たない
  illustration?: string;
```

`config/illustration.ts`:

```ts
// 保存するイラストの大きさ。表示は 48px で、PNG エクスポート（2倍）でも足りる大きさにする
export const ILLUSTRATION_THUMBNAIL_SIZE = 128;
export const ILLUSTRATION_THUMBNAIL_QUALITY = 0.85;
// localStorage（約5MB）を使い切らないための、1枚あたりの上限
export const MAX_ILLUSTRATION_DATA_URL_LENGTH = 100_000;
```

`domain/illustration/illustrationDataUrl.ts`:

```ts
import { MAX_ILLUSTRATION_DATA_URL_LENGTH } from "@/config/illustration";

// アプリが保存するのは JPEG だけ。svg は除く（スクリプトを含みうる）。属性や XML に入れても壊れない文字だけを許す
const ILLUSTRATION_DATA_URL_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

export function isIllustrationDataUrl(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= MAX_ILLUSTRATION_DATA_URL_LENGTH
    && ILLUSTRATION_DATA_URL_PATTERN.test(value);
}
```

`domain/nodes/nodeIllustration.ts`:

```ts
import { ILLUSTRATION_AREA_HEIGHT, ILLUSTRATION_SIZE, ILLUSTRATION_TOP_PADDING } from "@/config/shapes";
import type { Node } from "@/types/node";

export function getNodeIllustrationRect(node: Pick<Node, "x" | "y" | "width">) {
  return {
    x: node.x + (node.width - ILLUSTRATION_SIZE) / 2,
    y: node.y + ILLUSTRATION_TOP_PADDING,
    size: ILLUSTRATION_SIZE,
  };
}

// ノード上端から、テキストの中心までの距離。イラストがあるときは、その下の領域の中央にする。
// 「height / 2」の形を保つのは、イラストが無いノードの描画・エクスポートの計算結果（浮動小数点）を変えないため。
export function getNodeLabelCenterOffset(node: Pick<Node, "height" | "illustration">): number {
  return node.height / 2 + (node.illustration === undefined ? 0 : ILLUSTRATION_AREA_HEIGHT / 2);
}
```

`domain/nodes/nodeIllustrationUpdate.ts`:

```ts
import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import type { Node } from "@/types/node";

export function replaceNodeIllustration(
  nodes: readonly Node[],
  id: number,
  dataUrl: string,
): Node[] | null {
  if (!nodes.some((node) => node.id === id)) return null;

  return nodes.map((node) => (
    node.id === id ? { ...node, illustration: dataUrl, height: ILLUSTRATED_NODE_HEIGHT } : node
  ));
}
```

- [ ] **Step 4: 成功を確認する**

Run: Step 2 と同じコマンド → PASS。続けて `npx tsc --noEmit`（`client` で）→ エラーなし。

- [ ] **Step 5: コミット**

```bash
git add client/src/config/shapes.ts client/src/types/node.ts client/src/config/illustration.ts client/src/domain/illustration/illustrationDataUrl.ts client/src/domain/nodes/nodeIllustration.ts client/src/domain/nodes/nodeIllustrationUpdate.ts client/src/domain/illustration/__tests__/illustrationDataUrl.test.ts client/src/domain/nodes/__tests__/nodeIllustration.test.ts client/src/domain/nodes/__tests__/nodeIllustrationUpdate.test.ts
git commit -m "feat(illustration): ノードに紐付けるイラストの型・配置・検証を追加"
```

---

### Task 2: 保存形式 version 3（JSON と localStorage）

**Files:**
- Modify: `client/src/types/mapDocument.ts`、`client/src/domain/persistence/mapDocumentNodeProjection.ts`、`mapDocumentNode.ts`、`mapDocumentNodeImportance.ts`、`mapDocumentDecoder.ts`、`mapDocumentEncoder.ts`
- Test: `client/src/domain/persistence/__tests__/mapDocumentDecoder.test.ts`、`mapDocumentEncoder.test.ts`、`client/src/app/__tests__/page.test.tsx`（`version: 2` の期待値だけ）

**Interfaces:**
- Consumes: `isIllustrationDataUrl`（Task 1）
- Produces: `MapDocumentV3 = NodeMapState & { version: 3 }`（`MapDocument` は V3 を指す）。`parseMapDocumentJsonWithVersion` の `sourceVersion` は `1 | 2 | 3`。`createMapDocument` / `serializeMapDocument` は `version: 3` を出す。

方針:
- version 1・2 の `nodes[].illustration` は読まない（その version には無い項目）。version 3 だけが読み、あるのに `isIllustrationDataUrl`（jpeg のみ）と縦横 512px 以下の検証（`jpegDimensions.ts`）を満たさなければ、読み込み全体を失敗にする（エラー文: `node[N].illustrationは、画像のdata URLである必要があります。`）。
- `projectMapDocumentNode` は、`illustration` があるときだけ項目を出す（無いノードの JSON は、従来と同じ形）。
- `useMapStorageRestoration.ts` の `sourceVersion === 1` の判定は、変更しない（version 2 の保存データは、読み込み時には書き換えず、次に変更があったときに version 3 で保存される）。

- [ ] **Step 1: 失敗するテストを書く**（`mapDocumentDecoder.test.ts` と `mapDocumentEncoder.test.ts` に追加。既存の `version: 2` の出力の期待値は `3` に直す）

```ts
// mapDocumentDecoder.test.ts に追加（ファイル内の既存のノードの作り方に合わせる）
const baseNode = { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 116, label: "a", importance: "medium" };
const IMAGE = "data:image/jpeg;base64,AAAA";
const json = (version: number, node: Record<string, unknown>) =>
  JSON.stringify({ version, layoutMode: "manual", nodes: [node] });

describe("version 3 のイラスト", () => {
  it("version 3 の illustration を読み込む", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, { ...baseNode, illustration: IMAGE }));
    expect(parsed).toMatchObject({ ok: true, value: { sourceVersion: 3, document: { version: 3 } } });
    expect(parsed.ok && parsed.value.document.nodes[0].illustration).toBe(IMAGE);
  });

  it("illustration が無いノードは、項目を持たない", () => {
    const parsed = parseMapDocumentJsonWithVersion(json(3, baseNode));
    expect(parsed.ok && "illustration" in parsed.value.document.nodes[0]).toBe(false);
  });

  it.each([1, 2])("version %i の illustration は無視する", (version) => {
    const node = version === 1 ? { ...baseNode, illustration: IMAGE, importance: undefined } : { ...baseNode, illustration: IMAGE };
    const parsed = parseMapDocumentJsonWithVersion(json(version, node));
    expect(parsed.ok && "illustration" in parsed.value.document.nodes[0]).toBe(false);
    expect(parsed.ok && parsed.value.document.version).toBe(3);
  });

  it.each([123, "https://example.com/a.png", "data:image/svg+xml;base64,AAAA"])(
    "version 3 で不正な illustration（%p）は、読み込みを失敗にする",
    (illustration) => {
      expect(parseMapDocumentJsonWithVersion(json(3, { ...baseNode, illustration }))).toEqual({
        ok: false,
        error: "node[0].illustrationは、画像のdata URLである必要があります。",
      });
    },
  );

  it("version 4 は未対応", () => {
    expect(parseMapDocumentJsonWithVersion(json(4, baseNode))).toEqual({ ok: false, error: "未対応のマップ形式です。" });
  });
});
```

```ts
// mapDocumentEncoder.test.ts に追加
it("illustration があるノードだけ、項目を書き出し、version 3 にする", () => {
  const withImage = { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 116, label: "a", importance: "medium" as const, illustration: "data:image/jpeg;base64,AAAA" };
  const without = { ...withImage, id: 2, height: 60, illustration: undefined };
  const document = createMapDocument([withImage, without], "manual");
  expect(document.version).toBe(3);
  expect(document.nodes[0].illustration).toBe("data:image/jpeg;base64,AAAA");
  expect("illustration" in document.nodes[1]).toBe(false);
  expect(JSON.parse(serializeMapDocument(document)).version).toBe(3);
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx jest src/domain/persistence`
Expected: FAIL

- [ ] **Step 3: 実装する**

`types/mapDocument.ts`: `MapDocumentV2 = NodeMapState & { version: 2 }` を `MapDocumentV3 = NodeMapState & { version: 3 }` に置き換え、`MapDocument = MapDocumentV3`。`MapDocumentV2` を参照している箇所（`mapDocumentDecoder.ts`、`mapDocumentEncoder.ts`）を `MapDocumentV3` にする（`grep -rn MapDocumentV2 client/src` が 0 件になること）。

`mapDocumentNodeProjection.ts`:

```ts
export function projectMapDocumentNode(node: Node): Node {
  return {
    id: node.id,
    parentId: node.parentId,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    label: node.label,
    importance: node.importance,
    ...(node.illustration === undefined ? {} : { illustration: node.illustration }),
  };
}
```

`mapDocumentNodeImportance.ts` と `mapDocumentNode.ts`: `version` の型を `1 | 2 | 3`（共通の型 `MapDocumentVersion = 1 | 2 | 3` を `types/mapDocument.ts` に置いて使う）。`mapDocumentNode.ts` の末尾を次のようにする:

```ts
  let illustration: string | undefined;
  if (version === 3 && node.illustration !== undefined) {
    if (!isIllustrationDataUrl(node.illustration)) {
      return failure(index, ".illustrationは、画像のdata URLである必要があります。");
    }
    illustration = node.illustration;
  }
  return {
    ok: true,
    value: projectMapDocumentNode({
      id, parentId, x, y, width, height, label,
      importance: importanceResult.value,
      ...(illustration === undefined ? {} : { illustration }),
    }),
  };
```

（`import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";` を足す。）

`mapDocumentDecoder.ts`: `record.version !== 1 && record.version !== 2` を `!== 3` も含む判定にし（`record.version !== 1 && record.version !== 2 && record.version !== 3`）、`sourceVersion: 1 | 2 | 3`、返す `document.version` は `3`。

`mapDocumentEncoder.ts`: `version: 3`。

`page.test.tsx` で `version: 2` を出力の期待値として使っている箇所だけ `3` にする（`grep -n "version: 2" client/src/app/__tests__/page.test.tsx`）。**読み込み用の入力**（古い保存データを模したもの）の `version: 2` は、そのまま残す（version 2 の互換を確認するため）。

- [ ] **Step 4: 成功を確認する**

Run: `npx jest src/domain/persistence src/hooks src/app` と `npx tsc --noEmit`
Expected: PASS、型エラーなし

- [ ] **Step 5: コミット**（変更したファイルを1つずつ指定する）

```bash
git add client/src/types/mapDocument.ts client/src/domain/persistence/mapDocumentNodeProjection.ts client/src/domain/persistence/mapDocumentNode.ts client/src/domain/persistence/mapDocumentNodeImportance.ts client/src/domain/persistence/mapDocumentDecoder.ts client/src/domain/persistence/mapDocumentEncoder.ts client/src/domain/persistence/__tests__/mapDocumentDecoder.test.ts client/src/domain/persistence/__tests__/mapDocumentEncoder.test.ts client/src/app/__tests__/page.test.tsx
git commit -m "feat(persistence): 保存形式をversion 3にし、ノードのイラストを保存・復元する"
```

---

### Task 3: 生成画像の縮小と、生成フックへの組み込み

**Files:**
- Create: `client/src/services/illustration/illustrationThumbnail.ts`
- Modify: `client/src/services/illustration/illustrationClient.ts`、`client/src/hooks/useIllustrationGeneration.ts`
- Test: `client/src/services/illustration/__tests__/illustrationThumbnail.test.ts`、`illustrationClient.test.ts`、`client/src/hooks/__tests__/useIllustrationGeneration.test.ts`

**Interfaces:**
- Consumes: `ILLUSTRATION_THUMBNAIL_SIZE`、`ILLUSTRATION_THUMBNAIL_QUALITY`、`isIllustrationDataUrl`（Task 1）
- Produces:
  - `calculateCoverCrop(width: number, height: number): { sx: number; sy: number; size: number }`（中央の正方形を切り出す）
  - `createIllustrationThumbnail(dataUrl: string, deps?: ThumbnailDeps): Promise<string>`。失敗時は `IllustrationThumbnailError` を投げる。
  - `type ThumbnailDeps = { loadImage: (dataUrl: string) => Promise<{ image: CanvasImageSource; width: number; height: number }>; createCanvas: () => HTMLCanvasElement }`
  - `IllustrationErrorKind` に `"image-processing"` を追加。メッセージ: `生成した画像を処理できませんでした。もう一度お試しください。`
  - `IllustrationGenerationState` の `succeeded.dataUrl` は、縮小済みの data URL（プレビューも、ノードに設定する画像も、これ）。
  - `useIllustrationGeneration` の戻り値に `dismissGeneration: () => void`（状態を idle に戻す）を足す。

- [ ] **Step 1: 失敗するテストを書く**

`illustrationThumbnail.test.ts`:

```ts
import { ILLUSTRATION_THUMBNAIL_QUALITY, ILLUSTRATION_THUMBNAIL_SIZE } from "@/config/illustration";
import {
  calculateCoverCrop,
  createIllustrationThumbnail,
  IllustrationThumbnailError,
  type ThumbnailDeps,
} from "@/services/illustration/illustrationThumbnail";

describe("calculateCoverCrop", () => {
  it("正方形は、全体を使う", () => {
    expect(calculateCoverCrop(1024, 1024)).toEqual({ sx: 0, sy: 0, size: 1024 });
  });
  it("横長は、中央の正方形を使う", () => {
    expect(calculateCoverCrop(200, 100)).toEqual({ sx: 50, sy: 0, size: 100 });
  });
  it("縦長は、中央の正方形を使う", () => {
    expect(calculateCoverCrop(100, 300)).toEqual({ sx: 0, sy: 100, size: 100 });
  });
});

function createDeps(toDataURL: () => string) {
  const drawImage = jest.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => ({ drawImage })),
    toDataURL: jest.fn(toDataURL),
  } as unknown as HTMLCanvasElement;
  const image = {} as CanvasImageSource;
  const deps: ThumbnailDeps = {
    loadImage: jest.fn().mockResolvedValue({ image, width: 200, height: 100 }),
    createCanvas: () => canvas,
  };
  return { deps, canvas, drawImage, image };
}

describe("createIllustrationThumbnail", () => {
  it("中央を正方形に切り出し、128pxの JPEG にして返す", async () => {
    const { deps, canvas, drawImage, image } = createDeps(() => "data:image/jpeg;base64,AAAA");
    await expect(createIllustrationThumbnail("data:image/png;base64,SRC", deps)).resolves.toBe("data:image/jpeg;base64,AAAA");
    expect(canvas.width).toBe(ILLUSTRATION_THUMBNAIL_SIZE);
    expect(canvas.height).toBe(ILLUSTRATION_THUMBNAIL_SIZE);
    expect(drawImage).toHaveBeenCalledWith(image, 50, 0, 100, 100, 0, 0, ILLUSTRATION_THUMBNAIL_SIZE, ILLUSTRATION_THUMBNAIL_SIZE);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", ILLUSTRATION_THUMBNAIL_QUALITY);
  });

  it("画像を読み込めないときは IllustrationThumbnailError", async () => {
    const { deps } = createDeps(() => "data:image/jpeg;base64,AAAA");
    (deps.loadImage as jest.Mock).mockRejectedValue(new Error("decode"));
    await expect(createIllustrationThumbnail("x", deps)).rejects.toBeInstanceOf(IllustrationThumbnailError);
  });

  it("2D コンテキストが無いときは IllustrationThumbnailError", async () => {
    const { deps, canvas } = createDeps(() => "data:image/jpeg;base64,AAAA");
    (canvas.getContext as jest.Mock).mockReturnValue(null);
    await expect(createIllustrationThumbnail("x", deps)).rejects.toBeInstanceOf(IllustrationThumbnailError);
  });

  it("出力が data URL の条件を満たさないとき（例: 空の canvas）は IllustrationThumbnailError", async () => {
    const { deps } = createDeps(() => "data:,");
    await expect(createIllustrationThumbnail("x", deps)).rejects.toBeInstanceOf(IllustrationThumbnailError);
  });

  it("元の画像の大きさが 0 のときは IllustrationThumbnailError", async () => {
    const { deps } = createDeps(() => "data:image/jpeg;base64,AAAA");
    (deps.loadImage as jest.Mock).mockResolvedValue({ image: {}, width: 0, height: 0 });
    await expect(createIllustrationThumbnail("x", deps)).rejects.toBeInstanceOf(IllustrationThumbnailError);
  });
});
```

`illustrationClient.test.ts` に追加: `describeIllustrationError("image-processing")` が `生成した画像を処理できませんでした。もう一度お試しください。` を返す。

`useIllustrationGeneration.test.ts`: 既存のテストはモックで `requestIllustration` を差し替えている前提。そこへ `jest.mock("@/services/illustration/illustrationThumbnail")` を足し、`createIllustrationThumbnail` を `mockImplementation(async (url) => \`thumb:${url}\`)` にして、次を追加・修正する（既存の成功テストの期待値 `dataUrl` は `thumb:` 付きになる）:

```ts
it("成功時は、縮小した画像を state に持つ", async () => {
  // requestIllustration → { dataUrl: "data:image/png;base64,RAW" } を返すように設定済みの前提
  // generateIllustration(1) を act で呼び、解決を待つ
  expect(result.current.generation).toEqual({ status: "succeeded", nodeId: 1, dataUrl: "thumb:data:image/png;base64,RAW" });
});

it("縮小に失敗したときは image-processing のメッセージで failed になる", async () => {
  (createIllustrationThumbnail as jest.Mock).mockRejectedValue(new IllustrationThumbnailError());
  // generateIllustration(1) → 解決を待つ
  expect(result.current.generation).toEqual({
    status: "failed", nodeId: 1, message: describeIllustrationError("image-processing"),
  });
});

it("dismissGeneration で idle に戻る", async () => {
  // 成功させたあと
  act(() => result.current.dismissGeneration());
  expect(result.current.generation).toEqual({ status: "idle" });
});

it("縮小の途中でマップが置き換わったら、結果を捨てる", async () => {
  // 縮小を、解決を遅らせた Promise にして generateIllustration(1) → rerender(resetRevision + 1)
  // → 縮小を解決 → generation は idle のまま
});
```

（`useIllustrationGeneration.test.ts` の既存のヘルパーとモックの書き方に合わせて、上のコメントの部分を実際のコードにする。）

- [ ] **Step 2: 失敗を確認する**

Run: `npx jest src/services/illustration src/hooks/__tests__/useIllustrationGeneration.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`illustrationThumbnail.ts`:

```ts
import { ILLUSTRATION_THUMBNAIL_QUALITY, ILLUSTRATION_THUMBNAIL_SIZE } from "@/config/illustration";
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";

export class IllustrationThumbnailError extends Error {
  constructor() {
    super("illustration thumbnail failed");
    this.name = "IllustrationThumbnailError";
  }
}

export type ThumbnailDeps = {
  loadImage: (dataUrl: string) => Promise<{ image: CanvasImageSource; width: number; height: number }>;
  createCanvas: () => HTMLCanvasElement;
};

export function calculateCoverCrop(width: number, height: number) {
  const size = Math.min(width, height);
  return { sx: (width - size) / 2, sy: (height - size) / 2, size };
}

const defaultDeps: ThumbnailDeps = {
  loadImage: async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  },
  createCanvas: () => document.createElement("canvas"),
};

// 生成画像（1024px 程度）を、保存・表示に十分な大きさの JPEG に縮小する
export async function createIllustrationThumbnail(
  dataUrl: string,
  deps: ThumbnailDeps = defaultDeps,
): Promise<string> {
  try {
    const { image, width, height } = await deps.loadImage(dataUrl);
    if (!(width > 0) || !(height > 0)) throw new IllustrationThumbnailError();

    const canvas = deps.createCanvas();
    canvas.width = ILLUSTRATION_THUMBNAIL_SIZE;
    canvas.height = ILLUSTRATION_THUMBNAIL_SIZE;
    const context = canvas.getContext("2d");
    if (context === null) throw new IllustrationThumbnailError();

    const { sx, sy, size } = calculateCoverCrop(width, height);
    context.drawImage(image, sx, sy, size, size, 0, 0, ILLUSTRATION_THUMBNAIL_SIZE, ILLUSTRATION_THUMBNAIL_SIZE);
    const thumbnail = canvas.toDataURL("image/jpeg", ILLUSTRATION_THUMBNAIL_QUALITY);
    if (!isIllustrationDataUrl(thumbnail)) throw new IllustrationThumbnailError();
    return thumbnail;
  } catch (error) {
    throw error instanceof IllustrationThumbnailError ? error : new IllustrationThumbnailError();
  }
}
```

`illustrationClient.ts`: `IllustrationErrorKind` に `"image-processing"` を足し、`ERROR_MESSAGES` に `"image-processing": "生成した画像を処理できませんでした。もう一度お試しください。"` を足す。

`useIllustrationGeneration.ts`:
- `requestIllustration(...)` の `.then` を、縮小を挟む形にする:

```ts
    requestIllustration(validation.label, { signal: controller.signal })
      .then((image) => createIllustrationThumbnail(image.dataUrl))
      .then((dataUrl) => {
        if (controller.signal.aborted) return;
        setGeneration({ status: "succeeded", nodeId, dataUrl });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof IllustrationRequestError
          ? error.kind
          : error instanceof IllustrationThumbnailError
            ? "image-processing"
            : "upstream-error";
        setGeneration({ status: "failed", nodeId, message: describeIllustrationError(kind) });
      })
```
- 戻り値に追加:

```ts
  const dismissGeneration = useCallback(() => setGeneration(IDLE), [setGeneration]);
  return { generation, generateIllustration, dismissGeneration };
```

- [ ] **Step 4: 成功を確認する**

Run: `npx jest src/services/illustration src/hooks/__tests__/useIllustrationGeneration.test.ts` と `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**（変更・新規のファイルを1つずつ指定。メッセージ例: `feat(illustration): 生成画像を128pxのJPEGに縮小して扱う`）

---

### Task 4: 「ノードに設定」の操作（useNodes・パネル・配線）

**Files:**
- Modify: `client/src/hooks/useNodes.ts`、`client/src/components/layout/IllustrationPanel.tsx`、`client/src/app/page.tsx`
- Test: `client/src/hooks/__tests__/useNodes.test.ts`（無ければ、既存の `useNodes` のテストファイルに追加。`ls client/src/hooks/__tests__ | grep -i useNodes`）、`client/src/components/layout/__tests__/IllustrationPanel.test.tsx`、`client/src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `replaceNodeIllustration`（Task 1）、`dismissGeneration`（Task 3）
- Produces:
  - `useNodes().attachIllustration: (id: number, dataUrl: string) => boolean`
  - `IllustrationPanel` の props: `selectedNode: Pick<Node, "id" | "label" | "illustration"> | null`、`generation`、`onGenerate(nodeId)`、`onAttach(nodeId: number, dataUrl: string)`

- [ ] **Step 1: 失敗するテストを書く**

`useNodes` のテスト（既存のテストの `renderHook` / `act` の書き方に合わせる）:

```ts
it("attachIllustration は、ノードにイラストを設定して、高さを伸ばす", () => {
  const { result } = renderHook(() => useNodes());
  let id!: number;
  act(() => { id = result.current.addNode(100, 100); });
  let attached = false;
  act(() => { attached = result.current.attachIllustration(id, "data:image/jpeg;base64,AAAA"); });
  expect(attached).toBe(true);
  expect(result.current.nodes[0]).toMatchObject({ illustration: "data:image/jpeg;base64,AAAA", height: ILLUSTRATED_NODE_HEIGHT });
});

it("存在しないノードには設定できず、false を返す", () => {
  const { result } = renderHook(() => useNodes());
  let attached = true;
  act(() => { attached = result.current.attachIllustration(99, "data:image/jpeg;base64,AAAA"); });
  expect(attached).toBe(false);
});

it("自動レイアウトのとき、高さが伸びた分、兄弟ノードが下へ再配置される", () => {
  const { result } = renderHook(() => useNodes());
  act(() => { result.current.setLayoutMode("auto"); });
  let rootId!: number; let a!: number; let b!: number;
  act(() => { rootId = result.current.addNode(0, 0); });
  act(() => { a = result.current.addChildNode(rootId)!; });
  act(() => { b = result.current.addSiblingNode(a)!; });
  const yBefore = result.current.nodes.find((n) => n.id === b)!.y;
  act(() => { result.current.attachIllustration(a, "data:image/jpeg;base64,AAAA"); });
  expect(result.current.nodes.find((n) => n.id === b)!.y).toBeGreaterThan(yBefore);
});
```

`IllustrationPanel.test.tsx` に追加（既存の `render` の props の作り方に `onAttach` を足す）:

```tsx
it("生成結果のプレビューがあるとき、「ノードに設定」で、ノード ID と画像を渡す", async () => {
  const onAttach = jest.fn();
  render(<IllustrationPanel
    selectedNode={{ id: 3, label: "予算" }}
    generation={{ status: "succeeded", nodeId: 3, dataUrl: "data:image/jpeg;base64,AAAA" }}
    onGenerate={jest.fn()} onAttach={onAttach} />);
  await userEvent.click(screen.getByRole("button", { name: "ノードに設定" }));
  expect(onAttach).toHaveBeenCalledWith(3, "data:image/jpeg;base64,AAAA");
});

it("別のノードの生成結果では、「ノードに設定」を出さない", () => {
  render(<IllustrationPanel selectedNode={{ id: 4, label: "x" }}
    generation={{ status: "succeeded", nodeId: 3, dataUrl: "data:image/jpeg;base64,AAAA" }}
    onGenerate={jest.fn()} onAttach={jest.fn()} />);
  expect(screen.queryByRole("button", { name: "ノードに設定" })).toBeNull();
});

it("プレビューが無く、ノードに設定済みのイラストがあるときは、それを表示する", () => {
  render(<IllustrationPanel selectedNode={{ id: 4, label: "予算", illustration: "data:image/jpeg;base64,BBBB" }}
    generation={{ status: "idle" }} onGenerate={jest.fn()} onAttach={jest.fn()} />);
  expect(screen.getByAltText("予算の設定済みイラスト")).toHaveAttribute("src", "data:image/jpeg;base64,BBBB");
  expect(screen.queryByRole("button", { name: "ノードに設定" })).toBeNull();
});

it("生成中・失敗のときは、「ノードに設定」を出さない", () => {
  const { rerender } = render(<IllustrationPanel selectedNode={{ id: 1, label: "a" }}
    generation={{ status: "generating", nodeId: 1 }} onGenerate={jest.fn()} onAttach={jest.fn()} />);
  expect(screen.queryByRole("button", { name: "ノードに設定" })).toBeNull();
  rerender(<IllustrationPanel selectedNode={{ id: 1, label: "a" }}
    generation={{ status: "failed", nodeId: 1, message: "x" }} onGenerate={jest.fn()} onAttach={jest.fn()} />);
  expect(screen.queryByRole("button", { name: "ノードに設定" })).toBeNull();
});
```

`page.test.tsx`: 既存の生成のテストの流れ（`requestIllustration` のモック）に、`createIllustrationThumbnail` のモックを足し、「イラストを生成 → 『ノードに設定』を押す → パネルに `…の設定済みイラスト` が出る・プレビューは消える」を1件追加する。

- [ ] **Step 2: 失敗を確認する**

Run: `npx jest src/hooks src/components/layout src/app`
Expected: FAIL

- [ ] **Step 3: 実装する**

`useNodes.ts`:
- 戻り値の型に `attachIllustration: (id: number, dataUrl: string) => boolean;` を足す。
- 実装（`updateNodeImportance` の近くに）:

```ts
  const attachIllustration = useCallback((id: number, dataUrl: string) => (
    applyTreeChange((currentNodes) => replaceNodeIllustration(currentNodes, id, dataUrl))
  ), [applyTreeChange]);
```
（`import { replaceNodeIllustration } from "@/domain/nodes/nodeIllustrationUpdate";`）。return に `attachIllustration` を足す。構造変更（高さ）なので、`applyNonStructuralChange` ではなく `applyTreeChange`（自動レイアウトのとき再配置される）を使う。

`IllustrationPanel.tsx`: props に `onAttach` を足し、`selectedNode` の型に `illustration` を足す。画像表示の部分を次のようにする:

```tsx
      {selectedNode !== null && forSelectedNode && generation.status === "succeeded" ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URLのため、next/imageは使わない */}
          <img
            src={generation.dataUrl}
            alt={`${getNodeDisplayLabel(selectedNode.label)}のイラスト`}
            className="w-full rounded-md border border-zinc-200 dark:border-zinc-700"
          />
          <button
            type="button"
            onClick={() => onAttach(selectedNode.id, generation.dataUrl)}
            className="rounded-md border border-blue-600 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-zinc-700"
          >
            ノードに設定
          </button>
        </>
      ) : (
        selectedNode?.illustration !== undefined && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">設定済みのイラスト</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URLのため、next/imageは使わない */}
            <img
              src={selectedNode.illustration}
              alt={`${getNodeDisplayLabel(selectedNode.label)}の設定済みイラスト`}
              className="w-full rounded-md border border-zinc-200 dark:border-zinc-700"
            />
          </div>
        )
      )}
```
（`eslint-disable-next-line` のコメントの書き方は、JSX の中では上のように `{/* */}` にする。lint が通る形に調整してよい。）

`page.tsx`: `useNodes()` の分割代入に `attachIllustration` を足し、`useIllustrationGeneration` の戻り値に `dismissGeneration` を足す。パネルへ:

```tsx
        sidePanel={(
          <IllustrationPanel
            selectedNode={selectedNode}
            generation={generation}
            onGenerate={generateIllustration}
            onAttach={(nodeId, dataUrl) => {
              if (attachIllustration(nodeId, dataUrl)) dismissGeneration();
            }}
          />
        )}
```

- [ ] **Step 4: 成功を確認する**

Run: `npx jest src/hooks src/components/layout src/app` と `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**（メッセージ例: `feat(illustration): 生成したイラストをノードに設定できるようにする`）

---

### Task 5: キャンバス（Pixi）への表示

**Files:**
- Create: `client/src/components/map/pixi/illustrationTextureLoader.ts`、`client/src/components/map/useIllustrationTextures.ts`
- Modify: `client/src/components/map/pixi/pixiTypes.ts`、`usePixiApplication.ts`、`renderMapNodes.ts`、`renderMapScene.ts`（型だけ。`RenderMapNodesOptions` を継承しているので、ほぼ変更なし）、`pixi/testing/pixiTestHarness.ts`、`client/src/components/map/useRenderedMapScene.ts`、`client/src/components/map/MapStage.tsx`
- Test: `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts`、`illustrationTextureLoader.test.ts`、`client/src/components/map/__tests__/useIllustrationTextures.test.tsx`、`usePixiApplication.test.tsx`

**Interfaces:**
- Consumes: `getNodeIllustrationRect`、`getNodeLabelCenterOffset`（Task 1）
- Produces:
  - `PixiConstructors` に `Sprite: typeof Sprite; Texture: typeof Texture` を追加
  - `RenderMapNodesOptions.illustrationTextures?: ReadonlyMap<string, Texture>`（キーは data URL）
  - `loadIllustrationTexture(Texture: typeof import("pixi.js").Texture, dataUrl: string): Promise<Texture>`
  - `useIllustrationTextures(runtime: PixiRuntime | null, nodes: readonly Node[]): ReadonlyMap<string, Texture>`
  - `RenderMapSceneOptions` / `useRenderedMapScene` の options に `illustrationTextures` を通す

方針:
- 描画は同期、画像の読み込みは非同期。テクスチャが無いノードは、イラストなしで描き（テキストの位置だけはイラスト用の位置にする）、読み込みが終わって `illustrationTextures` が変わると、`useRenderedMapScene` の依存配列が変わって再描画される。
- テクスチャは、`runtime` が変わる・アンマウントするときに、`destroy(true)` で破棄する。マップの置き換えで使われなくなったテクスチャは、その場では破棄しない（枚数が少なく、アンマウントで破棄されるため。コメントに理由を書く）。
- 同じ data URL の読み込みは、重複して始めない（読み込み中の Set を持つ）。

- [ ] **Step 1: 失敗するテストを書く**

`pixiTestHarness.ts`: 既存のモックの書き方に合わせて、`Sprite`（`x`・`y`・`width`・`height`、`destroy`）と `Texture` を追加し、返す `constructors` に含める（`{ Graphics, Text, Container, Sprite, Texture }`）。型の都合で他のテストも `constructors` を作っている場合は、`grep -rn "constructors" client/src --include=*.test.ts*` で探して揃える。

`renderMapNodes.test.ts` に追加（既存のハーネスの使い方に合わせる）:

```ts
const IMAGE = "data:image/jpeg;base64,AAAA";
const illustratedNode = { id: 1, parentId: null, x: 10, y: 20, width: 100, height: ILLUSTRATED_NODE_HEIGHT, label: "予算", importance: "medium" as const, illustration: IMAGE };

it("テクスチャがあるとき、ノードの上部の中央にスプライトを置く", () => {
  const texture = {} as Texture;
  renderMapNodes(harness.stage as never, harness.constructors as never, {
    nodes: [illustratedNode], selectedNodeId: null, editingNodeId: null, connectionTargetNodeId: null,
    onNodePointerDown: jest.fn(), illustrationTextures: new Map([[IMAGE, texture]]),
  });
  expect(harness.Sprite).toHaveBeenCalledWith(texture);
  const sprite = harness.Sprite.mock.results[0].value;
  expect(sprite).toMatchObject({ x: 10 + (100 - 48) / 2, y: 20 + 8, width: 48, height: 48 });
});

it("テクスチャが未読み込みでも、テキストはイラスト用の位置に置く（スプライトは作らない）", () => {
  renderMapNodes(/* 上と同じ。illustrationTextures は省略 */);
  expect(harness.Sprite).not.toHaveBeenCalled();
  expect(harness.Text.mock.results[0].value.y).toBe(20 + 116 / 2 + 56 / 2);
});

it("イラストが無いノードのテキストは、従来どおりノードの中央", () => {
  // 既存のテストで確認済みなら、重複して書かず、既存のテストが通ることだけを確認する
});
```

`illustrationTextureLoader.test.ts`:

```ts
it("画像を decode してから Texture.from に渡す", async () => {
  const from = jest.fn().mockReturnValue({ id: "tex" });
  const decode = jest.fn().mockResolvedValue(undefined);
  const created: HTMLImageElement[] = [];
  jest.spyOn(window, "Image").mockImplementation(() => {
    const img = { decode } as unknown as HTMLImageElement;
    created.push(img);
    return img;
  });
  const texture = await loadIllustrationTexture({ from } as never, "data:image/jpeg;base64,AAAA");
  expect(created[0].src).toBe("data:image/jpeg;base64,AAAA");
  expect(decode).toHaveBeenCalled();
  expect(from).toHaveBeenCalledWith(created[0]);
  expect(texture).toEqual({ id: "tex" });
});
```

`useIllustrationTextures.test.tsx`（`loadIllustrationTexture` をモック）:

```tsx
jest.mock("@/components/map/pixi/illustrationTextureLoader");

it("イラストのあるノードのテクスチャを読み込んで、data URL をキーに返す", async () => {
  (loadIllustrationTexture as jest.Mock).mockResolvedValue({ destroy: jest.fn() });
  const { result } = renderHook(() => useIllustrationTextures(runtime, [illustratedNode]));
  await waitFor(() => expect(result.current.has(IMAGE)).toBe(true));
});

it("同じ data URL は、1回だけ読み込む", async () => {
  // 同じ画像を持つノードを2つ渡し、loadIllustrationTexture が1回だけ呼ばれる
});

it("読み込みに失敗しても、例外を投げず、そのテクスチャは無いまま", async () => {
  // loadIllustrationTexture を reject にし、result.current.size が 0 のまま、unhandled rejection が出ない
});

it("runtime が null の間は、何も読み込まない", () => {
  // loadIllustrationTexture が呼ばれない
});

it("アンマウント時に、テクスチャを destroy する", async () => {
  // destroy が呼ばれる
});
```
（`runtime` は `{ app: {}, constructors: { Texture: {} } } as unknown as PixiRuntime` のような最小のモックでよい。）

`usePixiApplication.test.tsx`: 返す `constructors` に `Sprite` と `Texture` が含まれることの検証を、既存の `Graphics` などの検証に合わせて追加する。

- [ ] **Step 2: 失敗を確認する**

Run: `npx jest src/components/map`
Expected: FAIL

- [ ] **Step 3: 実装する**

`pixiTypes.ts`:

```ts
import type { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";

export type PixiConstructors = {
  Graphics: typeof Graphics;
  Text: typeof Text;
  Container: typeof Container;
  Sprite: typeof Sprite;
  Texture: typeof Texture;
};
```

`usePixiApplication.ts` の `constructors` に `Sprite: pixi.Sprite, Texture: pixi.Texture` を足す。

`illustrationTextureLoader.ts`:

```ts
import type { Texture } from "pixi.js";

// data URL の画像を、デコードしてから Texture にする（描画の時点で、同期的に使えるようにするため）
export async function loadIllustrationTexture(
  TextureClass: typeof Texture,
  dataUrl: string,
): Promise<Texture> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return TextureClass.from(image);
}
```

`useIllustrationTextures.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { loadIllustrationTexture } from "@/components/map/pixi/illustrationTextureLoader";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import type { Node } from "@/types/node";
import type { Texture } from "pixi.js";

const NO_TEXTURES: ReadonlyMap<string, Texture> = new Map();

export function useIllustrationTextures(
  runtime: PixiRuntime | null,
  nodes: readonly Node[],
): ReadonlyMap<string, Texture> {
  const [loaded, setLoaded] = useState<{ runtime: PixiRuntime; textures: ReadonlyMap<string, Texture> } | null>(null);
  const requestedRef = useRef<{ runtime: PixiRuntime | null; urls: Set<string> }>({ runtime: null, urls: new Set() });

  useEffect(() => {
    if (runtime === null) return;
    if (requestedRef.current.runtime !== runtime) requestedRef.current = { runtime, urls: new Set() };
    const requested = requestedRef.current.urls;

    let cancelled = false;
    for (const node of nodes) {
      const url = node.illustration;
      if (url === undefined || requested.has(url)) continue;
      requested.add(url);
      loadIllustrationTexture(runtime.constructors.Texture, url).then(
        (texture) => {
          if (cancelled) {
            texture.destroy(true);
            return;
          }
          setLoaded((current) => ({
            runtime,
            textures: new Map([...(current?.runtime === runtime ? current.textures : NO_TEXTURES), [url, texture]]),
          }));
        },
        // 読み込めない画像は、イラストなしのままにする（再試行しない）
        () => {},
      );
    }
    return () => { cancelled = true; };
  }, [runtime, nodes]);

  // runtime が変わる・アンマウントするときは、そのテクスチャを破棄する。
  // マップの置き換えで使われなくなったテクスチャは、枚数が少ないので、ここまで残す。
  useEffect(() => () => {
    loaded?.textures.forEach((texture) => texture.destroy(true));
  }, [loaded?.runtime]); // eslint-disable-line react-hooks/exhaustive-deps

  return loaded !== null && loaded.runtime === runtime ? loaded.textures : NO_TEXTURES;
}
```

注意: 上の実装は、React Compiler の lint（描画中に ref を読まない。effect の中で同期的に setState しない）と `react-hooks/exhaustive-deps` に通るように、実装者が調整してよい。**`cancelled` になった effect の実行（`nodes` が変わった）で、まだ読み込み中の URL が `requested` に残り、二度と読み込まれない**という問題を避けること（`nodes` が変わるたびに effect が再実行され、前の実行の読み込みは `cancelled` で捨てられる）。避け方の一例: `cancelled` を実行ごとではなく、`runtime` ごとに持つ（`runtime` が変わったときだけ捨てる）。この点を確認するテスト「読み込み中に `nodes` が変わっても、そのテクスチャが最終的に返る」を追加する。

`renderMapNodes.ts`:
- `RenderMapNodesOptions` に `illustrationTextures?: ReadonlyMap<string, Texture>` を足す（`import type { Container, FederatedPointerEvent, Texture } from "pixi.js";`）。
- Graphics を足した直後（テキストの前）に追加:

```ts
    const illustrationTexture = node.illustration === undefined
      ? undefined
      : options.illustrationTextures?.get(node.illustration);
    if (illustrationTexture !== undefined) {
      const rect = getNodeIllustrationRect(node);
      const sprite = new constructors.Sprite(illustrationTexture);
      sprite.x = rect.x;
      sprite.y = rect.y;
      sprite.width = rect.size;
      sprite.height = rect.size;
      container.addChild(sprite);
    }
```
- テキストの `text.y = node.y + node.height / 2;` を `text.y = node.y + getNodeLabelCenterOffset(node);` にする。

`useRenderedMapScene.ts`: `options` から `illustrationTextures` を取り出して `renderMapScene` に渡し、effect の依存配列に足す。`MapStage.tsx`: `usePixiApplication` の戻り値（runtime）を使って `const illustrationTextures = useIllustrationTextures(runtime, nodes);` を呼び、`useRenderedMapScene` の options に渡す（`runtime` の変数名と、`useRenderedMapScene` を呼ぶ位置は `grep -n "usePixiApplication\|useRenderedMapScene" client/src/components/map/MapStage.tsx` で確認）。

- [ ] **Step 4: 成功を確認する**

Run: `npx jest src/components/map` と `npx tsc --noEmit` と `npm run lint`
Expected: PASS

- [ ] **Step 5: コミット**（メッセージ例: `feat(map): ノードに紐付けたイラストをキャンバスに表示する`）

---

### Task 6: 画像エクスポート（SVG / PNG）とテキスト編集の位置

**Files:**
- Modify: `client/src/domain/imageExport/mapSvgNodes.ts`、`mapSvgDocument.ts`、`mapExportBounds.ts`
- Investigate / Modify: ノードのテキスト編集の入力欄の位置を決めている箇所（`grep -rn "height / 2" client/src --include=*.ts --include=*.tsx | grep -v __tests__` で、ノードの高さの半分を使っている箇所を全て確認する）
- Test: `client/src/domain/imageExport/__tests__/mapSvgNodes.test.ts`、`mapSvgDocument.test.ts`、`mapExportBounds.test.ts`、編集の位置のテスト

**Interfaces:**
- Consumes: `getNodeIllustrationRect`、`getNodeLabelCenterOffset`、`isIllustrationDataUrl`
- Produces: `MapSvgNodeMarkup = { rectangles: string; images: string; labels: string }`

- [ ] **Step 1: 失敗するテストを書く**

`mapSvgNodes.test.ts` に追加（既存の `measureText` のスタブと `bounds` の作り方に合わせる）:

```ts
const IMAGE = "data:image/jpeg;base64,AAAA";
const illustrated = { id: 1, parentId: null, x: 10, y: 20, width: 100, height: 116, label: "予算", importance: "medium" as const, illustration: IMAGE };

it("イラストがあるノードは、上部の中央に <image> を出す（オフセットを加える）", () => {
  const { images } = createMapSvgNodes([illustrated], { ...bounds, offsetX: 5, offsetY: 7 }, measure);
  expect(images).toBe(`<image href="${IMAGE}" x="${10 + 5 + 26}" y="${20 + 7 + 8}" width="48" height="48" />`);
});

it("イラストが無いノードは、images が空", () => {
  expect(createMapSvgNodes([{ ...illustrated, illustration: undefined, height: 60 }], bounds, measure).images).toBe("");
});

it("data URL として不正な illustration は、<image> を出さない（SVG への注入の防止）", () => {
  const evil = { ...illustrated, illustration: 'x" onload="alert(1)' };
  expect(createMapSvgNodes([evil], bounds, measure).images).toBe("");
});

it("イラストがあるノードのテキストは、イラストの下の領域の中央に置く", () => {
  // labels の最初の tspan の y が、getMapExportTextLayout(label, width - 16, y + offsetY + 86, measure).firstBaseline と一致する
});
```

`mapSvgDocument.test.ts`: 出力の順序が、背景、エッジ、ノードの矩形、イラスト、ラベルであること（`svg.indexOf` で、`<rect x=…` < `<image` < `<text` を確認）。

`mapExportBounds.test.ts`: イラストがあるノードのテキストの範囲が、`node.y + 86` を中心に計算されること（高さ116のノードの境界が、ノード自体の矩形（116）を超えないこと）。**イラストが無いノードの既存のテストは、変更しない**。

編集の位置: Step 3 で調べた結果、ノードの高さの半分を使っている箇所（テキスト編集の入力欄など）があれば、そこにも `getNodeLabelCenterOffset(node)` を使い、イラストがあるノードで入力欄の中心がイラストの下の領域の中央になることを、その箇所のテストに追加する。

- [ ] **Step 2: 失敗を確認する**

Run: `npx jest src/domain/imageExport`
Expected: FAIL

- [ ] **Step 3: 実装する**

`mapSvgNodes.ts`:

```ts
export type MapSvgNodeMarkup = {
  rectangles: string;
  images: string;
  labels: string;
};
```
ループの中で、`rectangles.push(...)` のあとに:

```ts
    if (node.illustration !== undefined && isIllustrationDataUrl(node.illustration)) {
      const rect = getNodeIllustrationRect(node);
      images.push(
        `<image href="${node.illustration}" x="${rect.x + bounds.offsetX}" y="${rect.y + bounds.offsetY}" width="${rect.size}" height="${rect.size}" />`,
      );
    }
```
テキストの中心: `node.y + bounds.offsetY + node.height / 2` を `node.y + bounds.offsetY + getNodeLabelCenterOffset(node)` にする（足す順序は変えない）。返り値は `{ rectangles: …, images: images.join(""), labels: … }`。

`mapSvgDocument.ts`: `const { rectangles, images, labels } = …`、組み立ては `${background}${edges}${rectangles}${images}${labels}`。

`mapExportBounds.ts`: テキストの中心の計算（`node.y / 2 + nodeBottom / 2`）を、イラストがあるノードだけ `node.y + getNodeLabelCenterOffset(node)` にする:

```ts
  const centerY = node.illustration === undefined
    ? node.y / 2 + nodeBottom / 2
    : node.y + getNodeLabelCenterOffset(node);
```
（イラストが無いノードは、桁あふれを避ける既存の式のまま。）

PNG は SVG を画像として読み込んで描くので（`loadMapSvgImage`）、コードの変更は不要。data URL の `<image>` は、SVG を画像として読み込むときも使える（外部の URL ではないため）。Task 7 の手動確認で、PNG に出ることを確認する。

- [ ] **Step 4: 成功を確認する**

Run: `npx jest src/domain src/services src/components` と `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**（メッセージ例: `feat(export): 画像エクスポートにノードのイラストを含める`）

---

### Task 7: ドキュメント、ROADMAP、全体の検証

**Files:**
- Modify: `ROADMAP.md`、`client/README.md`

- [ ] **Step 1: README を更新する**

`client/README.md` のイラスト生成の節に、次を追記する: 生成したイラストは、右パネルの「ノードに設定」でノードに紐付けられる／紐付けたイラストは 128px の JPEG に縮小して、マップの保存データ（localStorage・JSON、version 3）に含まれる／PNG・SVG のエクスポートにも含まれる／自動保存が、容量の上限で失敗したときは「ブラウザへ自動保存できませんでした。」と出る（JSON のエクスポートで残せる）。

- [ ] **Step 2: 全体の検証**

Run（`client` で）: `npm run verify`
Expected: すべて成功（tailwind scan / lint / typecheck / test / build）。テストの合計（スイート数・テスト数）を記録する。

- [ ] **Step 3: 手動確認（開発サーバー。実際の Cloudflare を1回だけ呼ぶ）**

`cd client && npm run dev` で起動して、次を確認する（無料枠を使うのは、生成の1回だけ。トークンは表示しない）。
1. ノードを追加して「予算」と入力し、選択して「イラストを生成」。プレビューが出る。
2. 「ノードに設定」を押す。ノードが縦に伸び、上にイラスト、下にテキストが出る。パネルは「設定済みのイラスト」の表示に変わる。
3. ページを再読み込みしても、イラストが残る（localStorage）。
4. 自動レイアウトに切り替えて、兄弟ノードと重ならない。
5. JSON をエクスポートして、`"version": 3` と `illustration` を確認し、そのファイルをインポートして復元できる。version 2 の古いファイル（`illustration` なし）も、インポートできる。
6. PNG と SVG をエクスポートして、イラストが含まれる。
7. 重要度フィルタで、そのノードを隠すと、イラストも一緒にフェードして消える。
8. ノードをダブルクリックしてテキストを編集すると、入力欄がテキストの位置（イラストの下）に出る。

確認で見つかった不具合は、テストを足して直す。

- [ ] **Step 4: ROADMAP を更新する**

`ROADMAP.md`:
- Phase 7 の「生成したイラストをノードに紐付けて表示」を `[x]` にする（「イラストの再生成・削除」は未実装なので `[ ]` のまま）。
- 先頭付近の「現在地」を、紐付け・表示・保存・エクスポートまで実装したこと、次の未完了項目が「イラストの再生成・削除」であることに書き換える。
- 「最終更新」の日付（ファイル内の形式に合わせる）を、実装を終えた日にする。

- [ ] **Step 5: コミット**

```bash
git add ROADMAP.md client/README.md
git commit -m "docs(roadmap): イラストのノード紐付け・表示を完了にし、READMEに使い方を追記"
```

---

## Self-Review

- **要件との対応**: 紐付け（Task 1・4）／キャンバス表示（Task 5）／保存（localStorage と JSON、Task 2、サイズは Task 3 の縮小）／エクスポート（Task 6）／ROADMAP（Task 7）。削除・再生成の専用 UI は、範囲外。
- **型の一致**: `illustration?: string`（Task 1）→ 保存（Task 2）→ パネル・`useNodes`（Task 4）→ Pixi・エクスポート（Task 5・6）。`replaceNodeIllustration`、`getNodeIllustrationRect`、`getNodeLabelCenterOffset`、`isIllustrationDataUrl`、`dismissGeneration`、`attachIllustration`、`illustrationTextures` の名前は、全タスクで同じ。
- **既存の挙動を変えない点**: イラストが無いノードの描画・エクスポートの計算式は、`height / 2` と `node.y / 2 + nodeBottom / 2` の形を保つ。version 1・2 のデータは、そのまま読み込める。
- **既知の制限（PR にも書く）**: 手動レイアウトでは、高さが伸びたノードが下のノードと重なりうる。マップ置き換えで不要になったテクスチャは、アンマウントまで残る。localStorage が一杯になると自動保存が失敗する（既存の通知が出る。1枚約10KB なので、数百枚まで）。縮小は Canvas に依存するので、Canvas が使えない環境では「画像を処理できませんでした」になる。

実装後の変更: R1 レビューでデコード時のメモリ枯渇対策として、イラストは jpeg のみ許可し、デコード境界で縦横の寸法検証（`jpegDimensions.ts`、512px 以下）を追加した。
