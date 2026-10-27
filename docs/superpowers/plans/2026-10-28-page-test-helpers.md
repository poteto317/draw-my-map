# ページの結合テストの共通ヘルパー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` でタスクを1つずつ実装し、別担当の仕様適合・コード品質のレビュー後に次へ進む。各タスクのサブエージェントには、そのタスク本文、Global Constraints、依存する前タスクの Interfaces だけを渡す。Steps はチェックボックス（`- [ ]`）で進捗を記録する。

**Goal:** `client/src/app/__tests__/page*.test.tsx` のうち `page.test.tsx` を除く13本で重複しているテスト用の関数・型・`jest.mock` のファクトリを、`client/src/app/testing/` の共通モジュールへ切り出す。テストの振る舞い・期待値・件数は変えない。

**Architecture:** 共通モジュールは2つに分ける。`pageModuleMocks.ts` は `jest.mock` のファクトリの中から `jest.requireActual` で読む「モジュールのモックの中身」だけを持ち、`@/app/page` や `pixi.js` を import しない（`pixi.js` のファクトリの評価中に Home を読むと循環するため）。`pageTestHelpers.tsx` は Home を描画・操作・読み取りする関数と、V3 の JSON の型・生成関数を持つ。各テストファイルはローカルの定義を消し、共通モジュールを import する。

**Tech Stack:** TypeScript、React 19、Next.js 16（`next/jest`）、Jest 30（jsdom）、Testing Library。追加依存なし。

## Global Constraints

- テストの期待値・件数・意味を変えない。`expect(...)` の行・`it`/`describe` の名前・テストの手順は、ヘルパーの呼び出し方（関数名・引数）以外は変えない。各タスクの終わりに、対象ファイルの `Tests:` の件数が置き換え前と同じで、すべて pass することを確かめる。
- 本体のコードを変えない。変更してよいのは `client/src/app/__tests__/page?*.test.tsx`（`page.test.tsx` は対象外）、新しく作る `client/src/app/testing/**`、`client/README.md`、この計画ファイルだけ。`git diff --name-only origin/main -- client/src | grep -v -E "/__tests__/|/testing/"` が空であること。
- jest のホイスティングの制約: `jest.mock(path, factory)` は import より前へ巻き上げられるため、ファクトリの中からはテストファイルの import 済みの束縛を参照できない。ファクトリの中で使える外部のものは、(1) `jest.requireActual<typeof import("…")>("…")` で読んだモジュール、(2) 名前が `mock` で始まる変数を、ファクトリの実行時（遅延）に参照するもの、だけ。`jest.mock(...)` の呼び出しそのものは各テストファイルに残す（共通モジュールの中で `jest.mock` を呼ばない）。前例: `client/src/components/map/testing/mapStageTestRuntime.tsx` の `createMockPixiModule` を `jest.requireActual` で読む形。
- `pageModuleMocks.ts` は `@/app/page`・`pixi.js`・`pageTestHelpers.tsx` を import しない（直接・間接とも）。import してよいのは `@/components/map/testing/mapStageTestRuntime`（`pixi.js` を import しない）と型だけ。
- 置き場所: 共通モジュールは `client/src/app/testing/`、その単体テストは `client/src/app/testing/__tests__/`（既存の `src/testing/__tests__/`・`src/components/map/testing/__tests__/` と同じ慣行）。jest の既定の testMatch は `__tests__` の下のすべてのファイルと `*.test.*` を拾うため、共通モジュールを `__tests__` の下に置かない・名前に `.test` を含めない。
- 共通化するのは次だけ。対象外のものは各ファイルに残す。
  - 関数: `stageContainer`、`renderPage`（`renderHome` もこれに統一）、`undoButton`、`redoButton`、`dialog`、`headerButton`、`selectNode`、`v3Json`、`v3JsonFromLabels`、`storedMap`、`exportedMap`。型: `ExportedNode`、`ExportedMap`、`V3SeedNode`、`V3LayoutMode`。
  - `jest.mock` のファクトリ: `@/services/imageExport/mapTextMeasurement`（13本すべて）と、標準形の `pixi.js`（11本。`pageCollapse`・`pageSearch` の `mockPixiInit` を使う変種は対象外）。
  - 対象外: `mapJsonDownload`・`illustrationGeneration`・`mapImageDownload`・`mapPngRasterizer` のモック、2〜3本だけに共通するヘルパー（`openList`、`outlineButton`・`textarea`・`previewRegion`・`selectedLabel` などの OutlineImport 系、`createClipboard`・`copy`・`paste`・`storeParentAndChild`・`duplicateButton`・`byPosition` などの Clipboard/Duplication 系、`exportedNodes`・`exportedLabels`、`deferred`、`flushPromises`）、`pressEnterOnActiveElement`、`jsonFile`、`pageMapLibrarySwitch` と `pageSearch` の独自の `v3Json`、`pageCollapse` の `stage()`。
- 共通モジュールに `jest.fn()` の状態を持たせない（`exportedMap` は `mockDownloadMapJson` を引数で受け取る）。
- 各タスクの終わりに `cd client && npm run typecheck` と、変更したファイルへの `npx eslint <files>` を通す（エラー・警告とも0件。置き換えで使わなくなった import は消す）。最後のタスクで `cd client && npm run verify` を通す。
- TDD: Task 1 は単体テストを先に書き、RED（モジュールが無い）を確かめてから実装する。Task 2〜4 は振る舞いを変えないリファクタリングなので、置き換え前の件数の記録が RED の代わりになる。
- 各タスクの実装者は、そのタスクの検証が通ったら、タスクの終わりにコミットする（push・PR 作成はしない）。メッセージは日本語の Conventional Commits（例: `test(page): ...`、`docs(test): ...`）にし、本文の末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける。
- `ROADMAP.md`: このリファクタリングに対応する項目は無い。最後のタスクで照合だけ行い、項目のチェック・現在地は変えない。

---

## 調査で確かめた事実（2026-10-28、`dda975f` 時点）

- `page.test.tsx` は `MapStage` をモック化する別系統で対象外。対象は次の13本。

  | ファイル | 置き換え前の件数 |
  | --- | --- |
  | `pageClipboard.test.tsx` | 16 |
  | `pageCollapse.test.tsx` | 23 |
  | `pageDuplication.test.tsx` | 14 |
  | `pageHistory.test.tsx` | 25 |
  | `pageMapLibrary.test.tsx` | 19 |
  | `pageMapLibraryDialog.test.tsx` | 17 |
  | `pageMapLibrarySwitch.test.tsx` | 19 |
  | `pageNodeIndent.test.tsx` | 20 |
  | `pageOutlineImport.test.tsx` | 11 |
  | `pageOutlineImportKeyboard.test.tsx` | 22 |
  | `pageSearch.test.tsx` | 16 |
  | `pageSiblingOrder.test.tsx` | 19 |
  | `pageSiblingOrderDrag.test.tsx` | 9 |

  各タスクでは、この表を参考にしつつ、作業の直前に自分で件数を測り直して記録する。

- ヘルパーの分布（`○` = ローカルに定義がある）

  | ファイル | stageContainer | renderPage/renderHome | undo | redo | dialog | headerButton | selectNode | v3Json（nodes 版） | Exported 型 | storedMap | exportedMap |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Clipboard | ○ | Page | ○ | ○ | | | ○(300,200) | ○ | ○ | ○ | ○ |
  | Duplication | ○ | Page | ○ | ○ | | | ○(300,200) | ○ | ○ | ○ | ○ |
  | History | ○ | Page | ○ | ○ | | | | ○ | ○(部分) | ○ | ○ |
  | SiblingOrder | ○ | Page | ○ | ○ | | | ○(300,200) | ○ | ○ | ○ | ○ |
  | NodeIndent | ○ | Page | ○ | ○ | | ○(string) | ○(x,y 必須) | ○(+layoutMode) | ○ | ○ | ○ |
  | SiblingOrderDrag | ○ | Page | ○ | ○ | | | | | ○(部分) | ○ | ○ |
  | OutlineImport | ○ | Home | ○ | ○ | ○ | | ○(0,0) | ○(+layoutMode) | ○ | ○ | ○ |
  | OutlineImportKeyboard | ○ | Home | | | ○ | | ○(0,0) | | ○(部分) | | |
  | MapLibrary | | Home(寛容) | ○ | | ○ | ○ | | labels 版 | Map だけ | | |
  | MapLibraryDialog | ○ | Home | | | ○ | ○ | ○(0,0) | labels 版 | Map だけ | | |
  | MapLibrarySwitch | ○ | Home(ui) | ○ | | ○ | ○(banner()) | ○(0,0) | 独自（残す） | ○(部分) | | |
  | Collapse | | | | | | | | | | | |
  | Search | | | | | | | | 独自（残す） | | | |

- `pageMapLibrary.test.tsx` の `renderHome` だけは、キャンバスが無いときに `mockStageBounds` を飛ばす寛容な形だった。厳密な形（`mockStageBounds(stageContainer())`）へ一時的に変えて実行しても 19 件すべて pass した（どのテストでもキャンバスがある）ので、共通の `renderPage` に統一してよい。
- `selectNode` の既定の座標: Clipboard・Duplication・SiblingOrder の既定値は `(300, 200)`、他は `(0, 0)` 固定。共通の既定値は `(0, 0)` にする。座標を省いて呼んでいる Clipboard・Duplication・SiblingOrder の呼び出しの意味は変わらない。根拠:
  - `selectNode` は同じ座標で `pointerdown` と `pointerup` を送る。ノードの移動（`components/map/pixi/nodeMoveGesture.ts`）と兄弟の並べ替え（`components/map/pixi/siblingReorderGesture.ts`）は `createDragActivation`（`components/map/pixi/dragActivation.ts`）でしきい値を超えて動いたときだけ動作し、移動量が 0 なら何もしない。選択の対象は `mockNodePointerHandlers.at(index - nodeCount)` で決まり、座標では決まらない。ダブルクリックは DOM の `dblclick` で判定し、この座標を使わない。
  - 3本のローカル定義の既定値を一時的に `(0, 0)` に変えて実行しても、3本合計 49 件すべて pass した。
  - したがって、座標を省いた呼び出し（例: `selectNode(0, 2)`）はそのまま残し、座標を明示している呼び出し（例: `selectNode(1, 2, 450, 200)`、`selectNode(0, 3, 300, 130)`、NodeIndent のすべての呼び出し）もそのまま残す。
- 共通の `jest.mock` ファクトリの方式（`jest.requireActual` で `@/app/testing/pageModuleMocks` を読む）は、`pageSiblingOrderDrag.test.tsx` で一時的に試し、9 件 pass、`eslint`・`tsc --noEmit` とも問題なしを確かめた（試行は元に戻してある）。

---

## ファイル構成

- Create: `client/src/app/testing/pageModuleMocks.ts` — `jest.mock` のファクトリから `jest.requireActual` で読む、モジュールのモックの中身（Pixi の標準形、文字幅の測定）。
- Create: `client/src/app/testing/pageTestHelpers.tsx` — Home の描画・要素の取得・ノードの選択・JSON の書き出しと保存内容の読み取り・V3 の JSON の生成、と `ExportedNode`・`ExportedMap` などの型。
- Create: `client/src/app/testing/__tests__/pageModuleMocks.test.ts`
- Create: `client/src/app/testing/__tests__/pageTestHelpers.test.tsx`
- Modify: `client/src/app/__tests__/page?*.test.tsx`（13本、Task 2〜4）
- Modify: `client/README.md`（Task 5）

---

### Task 1: 共通モジュールとその単体テスト

**Files:**
- Create: `client/src/app/testing/pageModuleMocks.ts`
- Create: `client/src/app/testing/pageTestHelpers.tsx`
- Test: `client/src/app/testing/__tests__/pageModuleMocks.test.ts`
- Test: `client/src/app/testing/__tests__/pageTestHelpers.test.tsx`

**Interfaces:**
- Consumes: `@/components/map/testing/mapStageTestRuntime` の `createMockPixiModule()`・`mockStage`・`mockNodePointerHandlers`・`mockStageHandlers`・`pointer(x, y)`・`renderReady(ui)`・`mockStageBounds(container)`・`resetMapStageTestRuntime()`、`@/testing/mapLibraryTestStorage` の `readActiveMapJson(storage)`・`seedMapLibrary(storage, maps, options?)`。
- Produces（`@/app/testing/pageModuleMocks`）:
  - `createPagePixiModuleMock(): ReturnType<typeof createMockPixiModule>`
  - `createMapTextMeasurementModuleMock(): { createMapTextMeasurer: () => MeasureMapText }`（1文字 8px）
- Produces（`@/app/testing/pageTestHelpers`）:
  - `type ExportedNode = { id: number; parentId: number | null; label: string; importance: string; x: number; y: number; width: number; height: number; illustration?: string }`
  - `type ExportedMap = { version: number; layoutMode: string; nodes: ExportedNode[] }`
  - `type V3SeedNode = Partial<ExportedNode> & { id: number }`
  - `type V3LayoutMode = "manual" | "auto"`
  - `v3Json(nodes: readonly V3SeedNode[], layoutMode: V3LayoutMode = "manual"): string`
  - `v3JsonFromLabels(labels: readonly string[]): string`
  - `stageContainer(): HTMLElement`
  - `renderPage(ui: ReactElement = <Home />): Promise<RenderResult>`（`renderReady` の戻り値）
  - `undoButton(): HTMLElement`、`redoButton(): HTMLElement`
  - `dialog(): ReturnType<typeof within>`
  - `headerButton(name: string): HTMLElement`
  - `selectNode(index: number, nodeCount: number, x = 0, y = 0): void`
  - `exportedMap(downloadMapJson: jest.Mock): ExportedMap`
  - `storedMap(): ExportedMap | null`

- [ ] **Step 1: `pageModuleMocks` の単体テストを書く**

`client/src/app/testing/__tests__/pageModuleMocks.test.ts`:

```ts
import {
  createMapTextMeasurementModuleMock,
  createPagePixiModuleMock,
} from "@/app/testing/pageModuleMocks";
import { mockStage } from "@/components/map/testing/mapStageTestRuntime";

describe("pageModuleMocks", () => {
  it("文字幅の測定は、文字数×8px を返す", () => {
    const measure = createMapTextMeasurementModuleMock().createMapTextMeasurer();

    expect(measure("")).toBe(0);
    expect(measure("abc")).toBe(24);
    expect(measure("あいう")).toBe(24);
  });

  it("Pixi の標準形の Application は、mapStageTestRuntime の共有のステージと 800×600 の画面を持つ", () => {
    const pixi = createPagePixiModuleMock();

    const app = new pixi.Application();

    expect(app.stage).toBe(mockStage);
    expect(app.screen).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});
```

- [ ] **Step 2: `pageTestHelpers` の単体テストを書く**

`client/src/app/testing/__tests__/pageTestHelpers.test.tsx`（このファイル自身も、共通の `jest.mock` ファクトリを使う最初の利用者になる）:

```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import {
  dialog,
  exportedMap,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  stageContainer,
  storedMap,
  undoButton,
  v3Json,
  v3JsonFromLabels,
} from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

jest.mock("pixi.js", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createPagePixiModuleMock()
));

jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return { ...actual, generateIllustrationThumbnail: jest.fn() };
});

const mockDownloadMapJson = jest.fn();
jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return {
    ...actual,
    downloadMapJson: (json: string, mapName: string) => mockDownloadMapJson(json, mapName),
  };
});

jest.mock("@/services/imageExport/mapTextMeasurement", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createMapTextMeasurementModuleMock()
));

jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: jest.fn(),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

const TWO_ROOTS = [
  { id: 1, label: "一" },
  { id: 2, label: "二", y: 300 },
];

// 側面のパネルの「対象ノード」に、選択中のノードの表示名が出る
function selectedLabel(): string | null {
  const panel = within(screen.getByRole("complementary", { name: "イラスト" }));
  if (panel.queryByText("ノードを選択してください") !== null) return null;
  return panel.getByText("対象ノード").nextElementSibling!.textContent;
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("pageTestHelpers", () => {
  describe("v3Json", () => {
    it("既定値を補って上書きを優先し、2文字のインデントと末尾の改行付きの V3 の JSON を返す", () => {
      expect(v3Json([{ id: 1 }, { id: 2, parentId: 1, label: "子", x: 400 }])).toBe(`${JSON.stringify({
        version: 3,
        layoutMode: "manual",
        nodes: [
          { parentId: null, x: 250, y: 170, width: 100, height: 60, label: "", importance: "medium", id: 1 },
          { parentId: 1, x: 400, y: 170, width: 100, height: 60, label: "子", importance: "medium", id: 2 },
        ],
      }, null, 2)}\n`);
    });

    it("layoutMode を渡すと、その値を書く", () => {
      expect(JSON.parse(v3Json([{ id: 1 }], "auto"))).toMatchObject({ version: 3, layoutMode: "auto" });
    });
  });

  describe("v3JsonFromLabels", () => {
    it("ラベルごとに id を 1 から振り、x を 200 ずつずらしたルートを並べる", () => {
      expect(v3JsonFromLabels(["A1", "A2"])).toBe(`${JSON.stringify({
        version: 3,
        layoutMode: "manual",
        nodes: [
          { id: 1, parentId: null, x: 100, y: 100, width: 100, height: 60, label: "A1", importance: "medium" },
          { id: 2, parentId: null, x: 300, y: 100, width: 100, height: 60, label: "A2", importance: "medium" },
        ],
      }, null, 2)}\n`);
    });
  });

  describe("storedMap", () => {
    it("保存が無ければ null、あれば現在のマップの本体を解析して返す", () => {
      expect(storedMap()).toBeNull();

      seedMapLibrary(window.localStorage, [{ json: v3Json(TWO_ROOTS) }]);

      expect(storedMap()?.nodes.map((node) => [node.id, node.label])).toEqual([[1, "一"], [2, "二"]]);
    });
  });

  describe("renderPage・stageContainer", () => {
    it("Home を描画し、キャンバスの枠の大きさを 800×600 に固定する", async () => {
      await renderPage();

      expect(stageContainer()).toHaveClass("cursor-crosshair");
      expect(stageContainer().getBoundingClientRect()).toMatchObject({ left: 0, top: 0, width: 800, height: 600 });
    });

    it("ui を渡すと、Home の代わりにその要素を描画する", async () => {
      await renderPage(<><Home /><p>追加の要素</p></>);

      expect(screen.getByText("追加の要素")).toBeInTheDocument();
      expect(stageContainer().getBoundingClientRect()).toMatchObject({ width: 800, height: 600 });
    });
  });

  describe("要素の取得", () => {
    it("undoButton・redoButton・headerButton・dialog が、それぞれの要素を返す", async () => {
      const user = userEvent.setup();
      seedMapLibrary(window.localStorage, [{ name: "旅行", json: v3Json(TWO_ROOTS) }]);
      await renderPage();

      expect(undoButton()).toHaveAccessibleName("元に戻す");
      expect(redoButton()).toHaveAccessibleName("やり直す");

      await user.click(headerButton("マップ一覧"));

      expect(dialog().getByRole("button", { name: "旅行（開いています）" })).toBeInTheDocument();
    });
  });

  describe("selectNode", () => {
    it("直近の描画のノードを nodes 配列の順の index で選択する（座標は省略も指定もできる）", async () => {
      seedMapLibrary(window.localStorage, [{ json: v3Json(TWO_ROOTS) }]);
      await renderPage();

      selectNode(1, 2);
      expect(selectedLabel()).toBe("二");

      selectNode(0, 2, 300, 200);
      expect(selectedLabel()).toBe("一");
    });
  });

  describe("exportedMap", () => {
    it("「JSON書き出し」を押し、受け取ったモックの最後の呼び出しの JSON を解析して返す", async () => {
      seedMapLibrary(window.localStorage, [{ json: v3Json(TWO_ROOTS) }]);
      await renderPage();

      const map = exportedMap(mockDownloadMapJson);

      expect(mockDownloadMapJson).toHaveBeenCalledTimes(1);
      expect(map.layoutMode).toBe("manual");
      expect(map.nodes.map((node) => [node.id, node.label])).toEqual([[1, "一"], [2, "二"]]);
    });
  });
});
```

- [ ] **Step 3: RED を確かめる**

Run: `cd client && npx jest src/app/testing/__tests__`
Expected: 2本とも FAIL（`Cannot find module '@/app/testing/pageModuleMocks'`・`'@/app/testing/pageTestHelpers'`）。

- [ ] **Step 4: `pageModuleMocks.ts` を実装する**

`client/src/app/testing/pageModuleMocks.ts`:

```ts
import { createMockPixiModule } from "@/components/map/testing/mapStageTestRuntime";
import type { MeasureMapText } from "@/domain/imageExport/mapExportText";

// ページの結合テストで、jest.mock のファクトリの中から jest.requireActual で読むモックの中身。
// jest.mock は import より前へ巻き上げられるため、ファクトリからは requireActual で読んだものしか使えない。
// pixi.js のファクトリの評価中に読まれるので、@/app/page・pixi.js・pageTestHelpers をここから import しない。
//
// 使い方:
// jest.mock("pixi.js", () => (
//   jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
//     .createPagePixiModuleMock()
// ));

// Pixi の標準形。Application の init を差し替える変種（折りたたみ・検索のテスト）は各ファイルに残す
export function createPagePixiModuleMock(): ReturnType<typeof createMockPixiModule> {
  return createMockPixiModule();
}

// jsdom は canvas の 2D context を持たないため、文字幅を「文字数×8px」として測る
export function createMapTextMeasurementModuleMock(): { createMapTextMeasurer: () => MeasureMapText } {
  return {
    createMapTextMeasurer: () => (text: string) => text.length * 8,
  };
}
```

- [ ] **Step 5: `pageTestHelpers.tsx` を実装する**

`client/src/app/testing/pageTestHelpers.tsx`:

```tsx
import { act, fireEvent, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import Home from "@/app/page";
import {
  mockNodePointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
} from "@/components/map/testing/mapStageTestRuntime";
import { readActiveMapJson } from "@/testing/mapLibraryTestStorage";

// Home（app/page）を本物の MapEditor・MapStage まで通して描画する結合テストの共通ヘルパー。
// 使う側のテストファイルで、pixi.js などを jest.mock で差し替えておくこと（pageModuleMocks を参照）。

// JSON 書き出し・保存の本体として読む V3 のノード。テストで読むフィールドの和集合
export type ExportedNode = {
  id: number;
  parentId: number | null;
  label: string;
  importance: string;
  x: number;
  y: number;
  width: number;
  height: number;
  illustration?: string;
};
export type ExportedMap = { version: number; layoutMode: string; nodes: ExportedNode[] };

export type V3SeedNode = Partial<ExportedNode> & { id: number };
export type V3LayoutMode = "manual" | "auto";

// 既定値（ルート、(250, 170)、100×60、ラベル空、重要度 medium）を補った V3 の保存データ
export function v3Json(nodes: readonly V3SeedNode[], layoutMode: V3LayoutMode = "manual"): string {
  return `${JSON.stringify({
    version: 3,
    layoutMode,
    nodes: nodes.map((node) => ({
      parentId: null,
      x: 250,
      y: 170,
      width: 100,
      height: 60,
      label: "",
      importance: "medium",
      ...node,
    })),
  }, null, 2)}\n`;
}

// ラベルだけを並べた手動配置のマップ。id は 1 から、x は 100 から 200 ずつ
export function v3JsonFromLabels(labels: readonly string[]): string {
  return `${JSON.stringify({
    version: 3,
    layoutMode: "manual",
    nodes: labels.map((label, i) => ({
      id: i + 1,
      parentId: null,
      x: 100 + i * 200,
      y: 100,
      width: 100,
      height: 60,
      label,
      importance: "medium",
    })),
  }, null, 2)}\n`;
}

export function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

// 描画後にキャンバスの枠を (0, 0) から 800×600 に固定する
export async function renderPage(ui: ReactElement = <Home />) {
  const rendered = await renderReady(ui);
  mockStageBounds(stageContainer());
  return rendered;
}

export function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: "元に戻す" });
}

export function redoButton(): HTMLElement {
  return screen.getByRole("button", { name: "やり直す" });
}

export function dialog() {
  return within(screen.getByRole("dialog"));
}

export function headerButton(name: string): HTMLElement {
  return within(screen.getByRole("banner")).getByRole("button", { name });
}

// 直近の描画で登録されたノードの pointerdown で選択し、同じ座標で離す（index は nodes 配列の順）。
// 押した座標と離した座標が同じなのでドラッグにはならず、座標は選択の結果に影響しない
export function selectNode(index: number, nodeCount: number, x = 0, y = 0) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(x, y));
    mockStageHandlers.pointerup?.(pointer(x, y));
  });
}

// 「JSON書き出し」を押し、downloadMapJson のモックが最後に受け取った JSON を解析する
export function exportedMap(downloadMapJson: jest.Mock): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(downloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

// localStorage に保存された現在のマップの本体
export function storedMap(): ExportedMap | null {
  const stored = readActiveMapJson(window.localStorage);
  return stored === null ? null : JSON.parse(stored) as ExportedMap;
}
```

- [ ] **Step 6: GREEN を確かめる**

Run: `cd client && npx jest src/app/testing/__tests__`
Expected: PASS（`pageModuleMocks` 2件、`pageTestHelpers` 9件、合計 11 件）。

- [ ] **Step 7: 型検査と lint**

Run: `cd client && npm run typecheck && npx eslint src/app/testing`
Expected: エラー・警告とも0件。

- [ ] **Step 8: 既存のテストに影響が無いことを確かめる**

Run: `cd client && npx jest src/app`
Expected: 既存の15本（page 系14本と `src/app/api/illustrations/__tests__/route.test.ts`）と新しい2本がすべて PASS（共通モジュールはまだどこからも使われていないので、page 系の件数は調査の表と同じ）。

- [ ] **Step 9: コミット**

```bash
git add client/src/app/testing
git commit -m "test(page): ページの結合テストの共通ヘルパーとモジュールのモックを追加する" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Clipboard・Duplication・History・SiblingOrder の置き換え

**Files:**
- Modify: `client/src/app/__tests__/pageClipboard.test.tsx`
- Modify: `client/src/app/__tests__/pageDuplication.test.tsx`
- Modify: `client/src/app/__tests__/pageHistory.test.tsx`
- Modify: `client/src/app/__tests__/pageSiblingOrder.test.tsx`

**Interfaces:**
- Consumes（Task 1）: `@/app/testing/pageModuleMocks` の `createPagePixiModuleMock()`・`createMapTextMeasurementModuleMock()`、`@/app/testing/pageTestHelpers` の `type ExportedNode`・`type ExportedMap`・`type V3SeedNode`・`v3Json(nodes, layoutMode = "manual")`・`stageContainer()`・`renderPage(ui = <Home />)`・`undoButton()`・`redoButton()`・`selectNode(index, nodeCount, x = 0, y = 0)`・`exportedMap(downloadMapJson: jest.Mock)`・`storedMap()`。
- Produces: なし（テストファイルだけの変更）。

各ファイルで行う置き換え（4本共通）:

1. `jest.mock("pixi.js", ...)` の6行を、共通のファクトリを読む形にする（直前のコメントは残す）。

   置き換え前:
   ```ts
   jest.mock("pixi.js", () => {
     const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
       "@/components/map/testing/mapStageTestRuntime",
     );
     return runtime.createMockPixiModule();
   });
   ```
   置き換え後:
   ```ts
   jest.mock("pixi.js", () => (
     jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
       .createPagePixiModuleMock()
   ));
   ```

2. `jest.mock("@/services/imageExport/mapTextMeasurement", ...)` を置き換える（直前のコメント「jsdomはcanvasの2D contextを持たないため…」は残す）。

   置き換え前:
   ```ts
   jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
     createMapTextMeasurer: () => (text: string) => text.length * 8,
   }));
   ```
   置き換え後:
   ```ts
   jest.mock("@/services/imageExport/mapTextMeasurement", () => (
     jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
       .createMapTextMeasurementModuleMock()
   ));
   ```

3. ローカルの `type ExportedNode`・`type ExportedMap`・`function v3Json`・`function stageContainer`・`function renderPage`・`function undoButton`・`function redoButton`・`function selectNode`（History には無い）・`function exportedMap`・`function storedMap` を削除し、`@/app/testing/pageTestHelpers` から import する。`Array<Partial<ExportedNode> & { id: number }>` と書いている引数の型（Clipboard・Duplication の `storeParentAndChild` など）はそのままでよい（`ExportedNode` は import した型になる）。
4. `exportedMap()` の呼び出し（テスト本文と、`exportedByPosition`・`exportedIds`・`exportedPositions` などのローカルのヘルパーの中）をすべて `exportedMap(mockDownloadMapJson)` にする。`mockDownloadMapJson` の定義と `jest.mock("@/services/persistence/mapJsonDownload", ...)` はそのまま残す。
   - 置き換え前: `expect(exportedMap().nodes).toEqual([]);`
   - 置き換え後: `expect(exportedMap(mockDownloadMapJson).nodes).toEqual([]);`
5. `selectNode` の呼び出しは変えない。座標を省いた呼び出し（例: `selectNode(0, 2)`、`selectNode(1, 3)`）の既定値は `(300, 200)` から `(0, 0)` に変わるが、調査の節のとおり結果は変わらない。座標を明示した呼び出し（例: `selectNode(1, 2, 450, 200)`、`selectNode(0, 3, 300, 130)`）はそのまま。ローカルの `selectNode` の上にあった座標の説明のコメント（「親（画面上の中心300,200）」など、ノードの配置を説明するもの）は、`storeParentAndChild` などの配置の説明として残っている場合は残す。
6. 使わなくなった import（`mockStageBounds`・`renderReady`・`Home`・`within`・`readActiveMapJson` など。ファイルごとに違う）を、eslint の `no-unused-vars` の警告に従って消す。まだ使っているものは残す。

ファイルごとの注意:
- `pageClipboard.test.tsx`: 定義は 69〜98行目（型と `v3Json`）、140〜173行目（`stageContainer`〜`selectNode`。間の `duplicateButton`・`filterButton` は残す）、180〜188行目（`exportedMap`・`storedMap`）。`openLabelEditor`・`worldPosition`・`byPosition`・`exportedByPosition`・`clipboardNodes`・`createClipboard`・`copy`・`paste`・`jsonFile`・`storeParentAndChild` は残す。`exportedMap()` は13か所。
- `pageDuplication.test.tsx`: 定義は 67〜109行目（型と `v3Json`。間の `Deferred`・`deferred` は残す）、127〜156行目（`stageContainer`〜`selectNode`。`duplicateButton` は残す）、163〜171行目。`exportedMap()` は13か所。
- `pageHistory.test.tsx`: ローカルの `ExportedNode` は `{ id; label; x; y; illustration? }` の部分型だったが、共通の和集合の型に置き換えてよい（`JSON.parse` の結果への型の主張なので実行時の振る舞いは変わらない）。定義は 79〜97行目、117〜125行目、131〜138行目、158〜166行目。`fileInput`・`addNodeAt`・`openLabelEditor`・`selectNodeAt`・`jsonFile`・`failingFile`・`readBlobText`・`flushPromises`・`deferred` は残す。`exportedMap()` は28か所。
- `pageSiblingOrder.test.tsx`: 定義は 59〜87行目、107〜139行目（`upButton`・`downButton` は残す）、145〜148行目、158〜161行目。`pressAlt`・`exportedIds`・`exportedPositions`・`expectStoredIds`・`noticeBar`・`storeThreeRoots`・`storeHiddenSibling` は残す。`exportedMap()` は4か所。

- [ ] **Step 1: 置き換え前の件数を記録する**

Run:
```bash
cd client && for f in pageClipboard pageDuplication pageHistory pageSiblingOrder; do printf "%s " $f; npx jest src/app/__tests__/$f.test.tsx 2>&1 | grep -E "^Tests:"; done
```
Expected（参考値）: Clipboard 16、Duplication 14、History 25、SiblingOrder 19（すべて passed）。測った値を作業メモに残す。

- [ ] **Step 2: `pageClipboard.test.tsx` を置き換える**

上の 1〜6 を行う。import の例:

```ts
import {
  exportedMap,
  type ExportedMap,
  type ExportedNode,
  redoButton,
  renderPage,
  selectNode,
  stageContainer,
  storedMap,
  undoButton,
  v3Json,
} from "@/app/testing/pageTestHelpers";
```
（`ExportedMap` など、置き換え後に使っていない名前は import しない。）

Run: `cd client && npx jest src/app/__tests__/pageClipboard.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 3: `pageDuplication.test.tsx` を置き換える**

上の 1〜6 を行う。

Run: `cd client && npx jest src/app/__tests__/pageDuplication.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 4: `pageHistory.test.tsx` を置き換える**

上の 1〜6 を行う（`selectNode` は無い）。

Run: `cd client && npx jest src/app/__tests__/pageHistory.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 5: `pageSiblingOrder.test.tsx` を置き換える**

上の 1〜6 を行う。

Run: `cd client && npx jest src/app/__tests__/pageSiblingOrder.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 6: 期待値が変わっていないことを確かめる**

Run:
```bash
git diff -U0 -- client/src/app/__tests__ | grep -E "^[-+].*(expect\(|it\(|describe\()"
```
Expected: 出てくる行は、`exportedMap()` → `exportedMap(mockDownloadMapJson)` の書き換えだけ（`-` と `+` の組で、その差以外が同じ）。

- [ ] **Step 7: 4本の件数・型検査・lint**

Run:
```bash
cd client && for f in pageClipboard pageDuplication pageHistory pageSiblingOrder; do printf "%s " $f; npx jest src/app/__tests__/$f.test.tsx 2>&1 | grep -E "^Tests:"; done
npm run typecheck
npx eslint src/app/__tests__/pageClipboard.test.tsx src/app/__tests__/pageDuplication.test.tsx src/app/__tests__/pageHistory.test.tsx src/app/__tests__/pageSiblingOrder.test.tsx
git diff --name-only origin/main -- src | grep -v -E "/__tests__/|/testing/"
```
Expected: 件数が Step 1 と一致してすべて passed、typecheck 成功、eslint のエラー・警告0件、最後のコマンドの出力が空。

- [ ] **Step 8: コミット**

```bash
git add client/src/app/__tests__/pageClipboard.test.tsx client/src/app/__tests__/pageDuplication.test.tsx client/src/app/__tests__/pageHistory.test.tsx client/src/app/__tests__/pageSiblingOrder.test.tsx
git commit -m "test(page): クリップボード・複製・履歴・兄弟の並べ替えのテストで共通ヘルパーを使う" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: NodeIndent・SiblingOrderDrag・OutlineImport・OutlineImportKeyboard の置き換え

**Files:**
- Modify: `client/src/app/__tests__/pageNodeIndent.test.tsx`
- Modify: `client/src/app/__tests__/pageSiblingOrderDrag.test.tsx`
- Modify: `client/src/app/__tests__/pageOutlineImport.test.tsx`
- Modify: `client/src/app/__tests__/pageOutlineImportKeyboard.test.tsx`

**Interfaces:**
- Consumes（Task 1）: `createPagePixiModuleMock()`・`createMapTextMeasurementModuleMock()`、`type ExportedNode`・`type ExportedMap`・`type V3SeedNode`・`type V3LayoutMode`・`v3Json(nodes, layoutMode = "manual")`・`stageContainer()`・`renderPage(ui = <Home />)`・`undoButton()`・`redoButton()`・`dialog()`・`headerButton(name: string)`・`selectNode(index, nodeCount, x = 0, y = 0)`・`exportedMap(downloadMapJson: jest.Mock)`・`storedMap()`。
- Produces: なし。

各ファイルで行う置き換え（4本共通）:

1. `jest.mock("pixi.js", ...)` と `jest.mock("@/services/imageExport/mapTextMeasurement", ...)` を、Task 2 の 1・2 と同じ形に置き換える（コメントは残す）。

   置き換え後:
   ```ts
   jest.mock("pixi.js", () => (
     jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
       .createPagePixiModuleMock()
   ));
   ```
   ```ts
   jest.mock("@/services/imageExport/mapTextMeasurement", () => (
     jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
       .createMapTextMeasurementModuleMock()
   ));
   ```
2. 下の「ファイルごとの対象」のローカル定義を削除し、`@/app/testing/pageTestHelpers` から import する。
3. `renderHome` を定義していたファイルでは、呼び出しを `renderPage` に改名する（`await renderHome();` → `await renderPage();`、`const { unmount } = await renderHome();` → `const { unmount } = await renderPage();`）。
4. `exportedMap()` の呼び出しをすべて `exportedMap(mockDownloadMapJson)` にする。
5. 使わなくなった import を eslint の警告に従って消す。

ファイルごとの対象:
- `pageNodeIndent.test.tsx`:
  - 削除: `type ExportedNode`・`type ExportedMap`（61〜71行目）、`function v3Json`（73〜91行目。`layoutMode` 引数付きの形は共通の `v3Json` と同じ）、`stageContainer`・`renderPage`（123〜131行目）、`headerButton`（133〜135行目。共通の `headerButton(name: string)` と同じ）、`undoButton`・`redoButton`（145〜152行目）、`selectNode`（154〜159行目）、`exportedMap`（187〜190行目）、`storedMap`（196〜199行目）。
  - 残す: `outdentButton`・`indentButton`（これらが `headerButton` を呼んでいれば、共通の `headerButton` を呼ぶ形になる）、`selectA`・`selectB`・`selectCollapsibleB`、`collapsibleMapVisibility`、`pressAlt`、`exportedNode`、`expectStoredParents`、`storedNode`、`noticeBar`、`BASIC_NODES`（93〜98行目。型注釈の `ExportedNode` は import した型になる）、`storeBasicMap`・`storeCollapsibleMap`・`storeThreeRoots`。
  - `selectNode` はすべて座標を明示して呼んでいるので変えない（例: `selectNode(2, 3, 270, 230)`）。
  - `exportedMap()` は4か所（`exportedNode` の中を含む）。
- `pageSiblingOrderDrag.test.tsx`:
  - 削除: `type ExportedNode`（52〜58行目。`{ id; parentId; label; x; y }` の部分型だが和集合の型に置き換えてよい）・`type ExportedMap`（59行目）、`stageContainer`・`renderPage`（76〜84行目）、`undoButton`・`redoButton`（86〜93行目）、`exportedMap`（114〜117行目）、`storedMap`（123〜126行目）。
  - 残す: `storeAutoLayoutChildren`（JSON をその場で組み立てる独自の形）、`nodePointerDown`、`stagePointer`、`dragA`、`exportedIds`、`expectStoredPositions`。
  - `exportedMap()` は8か所。
- `pageOutlineImport.test.tsx`:
  - 削除: `type ExportedNode`・`type ExportedMap`（50〜60行目）、`function v3Json`（64〜82行目）、`stageContainer`・`renderHome`（95〜103行目）、`dialog`（109〜111行目）、`undoButton`・`redoButton`（128〜134行目）、`selectNode`（152〜158行目。座標は `(0, 0)` 固定で、共通の既定値と同じ）、`exportedMap`・`storedMap`（166〜174行目）。
  - `seed` の引数の型を共通の型で書き直す。
    - 置き換え前: `function seed(nodes: Array<Partial<ExportedNode> & { id: number }>, layoutMode: "manual" | "auto" = "manual") {`
    - 置き換え後: `function seed(nodes: readonly V3SeedNode[], layoutMode: V3LayoutMode = "manual") {`
  - 残す: `outlineButton`・`textarea`・`inputError`・`previewRegion`・`operationNotices`・`openWithText`・`openPreview`・`selectedLabel`・`byLabel`・`TRAVEL_MAP`。
  - `renderHome` の呼び出しは11か所、`exportedMap()` は10か所。
- `pageOutlineImportKeyboard.test.tsx`:
  - 削除: `type ExportedNode`（50行目。部分型だが和集合の型に置き換えてよい）・`type ExportedMap`（51行目）、`stageContainer`・`renderHome`（65〜73行目）、`dialog`（79〜81行目）、`selectNode`（102〜107行目。座標 `(0, 0)` 固定）。
  - 残す: `seedParentAndChild`、`outlineButton`・`textarea`・`previewRegion`・`editorRoot`・`selectedLabel`、`exportedNodes`・`exportedLabels`（対象外。`ExportedNode`・`ExportedMap` は import した型を使う）、`createClipboard`、`pressEnterOnActiveElement`、`openPreview`。
  - `renderHome` の呼び出しは14か所。

- [ ] **Step 1: 置き換え前の件数を記録する**

Run:
```bash
cd client && for f in pageNodeIndent pageSiblingOrderDrag pageOutlineImport pageOutlineImportKeyboard; do printf "%s " $f; npx jest src/app/__tests__/$f.test.tsx 2>&1 | grep -E "^Tests:"; done
```
Expected（参考値）: NodeIndent 20、SiblingOrderDrag 9、OutlineImport 11、OutlineImportKeyboard 22（すべて passed）。

- [ ] **Step 2: `pageNodeIndent.test.tsx` を置き換える**

import の例:
```ts
import {
  exportedMap,
  type ExportedMap,
  type ExportedNode,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  stageContainer,
  storedMap,
  undoButton,
  v3Json,
} from "@/app/testing/pageTestHelpers";
```
（置き換え後に使っていない名前は import しない。）

Run: `cd client && npx jest src/app/__tests__/pageNodeIndent.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 3: `pageSiblingOrderDrag.test.tsx` を置き換える**

Run: `cd client && npx jest src/app/__tests__/pageSiblingOrderDrag.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 4: `pageOutlineImport.test.tsx` を置き換える**

Run: `cd client && npx jest src/app/__tests__/pageOutlineImport.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 5: `pageOutlineImportKeyboard.test.tsx` を置き換える**

Run: `cd client && npx jest src/app/__tests__/pageOutlineImportKeyboard.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 6: 期待値が変わっていないことを確かめる**

Run:
```bash
git diff -U0 -- client/src/app/__tests__/pageNodeIndent.test.tsx client/src/app/__tests__/pageSiblingOrderDrag.test.tsx client/src/app/__tests__/pageOutlineImport.test.tsx client/src/app/__tests__/pageOutlineImportKeyboard.test.tsx | grep -E "^[-+].*(expect\(|it\(|describe\()"
```
Expected: 出てくる行は `exportedMap()` → `exportedMap(mockDownloadMapJson)` の書き換えだけ。

- [ ] **Step 7: 4本の件数・型検査・lint**

Run:
```bash
cd client && for f in pageNodeIndent pageSiblingOrderDrag pageOutlineImport pageOutlineImportKeyboard; do printf "%s " $f; npx jest src/app/__tests__/$f.test.tsx 2>&1 | grep -E "^Tests:"; done
npm run typecheck
npx eslint src/app/__tests__/pageNodeIndent.test.tsx src/app/__tests__/pageSiblingOrderDrag.test.tsx src/app/__tests__/pageOutlineImport.test.tsx src/app/__tests__/pageOutlineImportKeyboard.test.tsx
git diff --name-only origin/main -- src | grep -v -E "/__tests__/|/testing/"
```
Expected: 件数が Step 1 と一致してすべて passed、typecheck 成功、eslint のエラー・警告0件、最後のコマンドの出力が空。

- [ ] **Step 8: コミット**

```bash
git add client/src/app/__tests__/pageNodeIndent.test.tsx client/src/app/__tests__/pageSiblingOrderDrag.test.tsx client/src/app/__tests__/pageOutlineImport.test.tsx client/src/app/__tests__/pageOutlineImportKeyboard.test.tsx
git commit -m "test(page): 階層の上げ下げ・並べ替えのドラッグ・箇条書きの取り込みのテストで共通ヘルパーを使う" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: MapLibrary・MapLibraryDialog・MapLibrarySwitch・Collapse・Search の置き換え

**Files:**
- Modify: `client/src/app/__tests__/pageMapLibrary.test.tsx`
- Modify: `client/src/app/__tests__/pageMapLibraryDialog.test.tsx`
- Modify: `client/src/app/__tests__/pageMapLibrarySwitch.test.tsx`
- Modify: `client/src/app/__tests__/pageCollapse.test.tsx`
- Modify: `client/src/app/__tests__/pageSearch.test.tsx`

**Interfaces:**
- Consumes（Task 1）: `createPagePixiModuleMock()`・`createMapTextMeasurementModuleMock()`、`type ExportedNode`・`type ExportedMap`・`v3JsonFromLabels(labels)`・`stageContainer()`・`renderPage(ui = <Home />)`・`undoButton()`・`dialog()`・`headerButton(name: string)`・`selectNode(index, nodeCount, x = 0, y = 0)`。
- Produces: なし。

置き換え:

1. MapLibrary・MapLibraryDialog・MapLibrarySwitch の3本: `jest.mock("pixi.js", ...)` と `jest.mock("@/services/imageExport/mapTextMeasurement", ...)` を、Task 2 の 1・2 と同じ形に置き換える。

   置き換え後:
   ```ts
   jest.mock("pixi.js", () => (
     jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
       .createPagePixiModuleMock()
   ));
   ```
   ```ts
   jest.mock("@/services/imageExport/mapTextMeasurement", () => (
     jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
       .createMapTextMeasurementModuleMock()
   ));
   ```
2. Collapse・Search の2本: `jest.mock("@/services/imageExport/mapTextMeasurement", ...)` だけを上と同じ形に置き換える。`jest.mock("pixi.js", ...)`（`mockPixiInit` で `Application` の `init` を差し替える変種）は変えない。
3. `renderHome` の呼び出しを `renderPage` に改名する（MapLibrary・MapLibraryDialog・MapLibrarySwitch）。
4. 使わなくなった import を eslint の警告に従って消す。

ファイルごとの対象:
- `pageMapLibrary.test.tsx`:
  - 削除: `type ExportedMap`（54行目。`{ nodes: Array<{ label: string }> }` だったが共通の型に置き換えてよい）、`function v3Json(labels)`（61〜76行目）、`renderHome`（91〜96行目）、`headerButton`（106〜108行目）、`dialog`（116〜118行目）、`undoButton`（131〜133行目）。
  - `v3Json([...])` の呼び出しを `v3JsonFromLabels([...])` に改名する（`seedTwoMaps` の中など）。
    - 置き換え前: `{ id: "a", name: "A", json: v3Json(["A1"]), updatedAt: "2026-01-02T00:00:00.000Z" },`
    - 置き換え後: `{ id: "a", name: "A", json: v3JsonFromLabels(["A1"]), updatedAt: "2026-01-02T00:00:00.000Z" },`
  - `renderHome` は、キャンバスが無いときに `mockStageBounds` を飛ばす寛容な形だったが、共通の厳密な `renderPage` に置き換える（調査の節のとおり、19件すべてでキャンバスがあることを確認済み）。
  - `addNodeByDoubleClick` の中の `document.querySelector<HTMLElement>(".cursor-crosshair")!` は `stageContainer()` に置き換える（同じ式）。
  - 残す: `seedTwoMaps`、`readIndex`、`currentMapName`、`shellNotices`、`exportedLabels`（対象外。`ExportedMap` は import した型を使う）、`openList`、`addNodeByDoubleClick`、`createFromHeader`。
  - `renderHome` の呼び出しは20か所。
- `pageMapLibraryDialog.test.tsx`:
  - 削除: `type ExportedMap`（50行目）、`function v3Json(labels)`（52〜68行目）、`stageContainer`・`renderHome`（78〜86行目）、`headerButton`（96〜98行目）、`dialog`（100〜102行目）、`selectNode`（116〜121行目。`.at(-count + index)` は `.at(index - nodeCount)` と同じで、座標 `(0, 0)` 固定も共通の既定値と同じ）。
  - `v3Json([...])` の呼び出しを `v3JsonFromLabels([...])` に改名する（`seedThreeMaps` の中など）。
  - 残す: `seedThreeMaps`、`currentMapName`、`shellNotices`、`openList`、`exportedLabels`、`editorRoot`。
  - `renderHome` の呼び出しは14か所。
- `pageMapLibrarySwitch.test.tsx`:
  - 削除: `type ExportedNode`（72行目。`{ id; label; illustration? }` の部分型だが和集合の型に置き換えてよい）・`type ExportedMap`（73行目）、`stageContainer`・`renderHome`（136〜144行目。`ui` 引数は共通の `renderPage(ui = <Home />)` が受け取る）、`headerButton`（154〜156行目。`banner().getByRole(...)` は `within(screen.getByRole("banner")).getByRole(...)` と同じ）、`dialog`（158〜160行目）、`selectNode`（214〜219行目）、`undoButton`（221〜223行目）。
  - 残す: 独自の `type SeedNode` と `function v3Json(nodes: readonly SeedNode[])`（対象外。共通の `v3Json` は import しない）、`banner`（`AUTO_SAVE_FAILURE_MESSAGE` の確認で使う）、`deferred`、`seedTwoMaps`、`setupUser`、`advance`、`nextFrame`、`settle`、`currentMapName`、`openList`、`switchTo`、`exportedNodes`・`exportedLabels`、`bodyLabels`、`bodyWriteNodeCounts`、`addNodeAt`、`addLabeledNodeAt`、`resolutionButton`、`fileInput`、`jsonFile`、`failSetItemFor`、`limitStorageCapacity`。
  - `StrictMode` 付きの呼び出しは引数をそのまま渡す。
    - 置き換え前: `await renderHome(<StrictMode><Home /></StrictMode>);`
    - 置き換え後: `await renderPage(<StrictMode><Home /></StrictMode>);`
    （`Home` と `StrictMode` の import は残る。）
  - `renderHome` の呼び出しは19か所。
- `pageCollapse.test.tsx`: `mapTextMeasurement` のモックだけを置き換える。`stage()`・`select`・`mapJson` など他は変えない。
- `pageSearch.test.tsx`: `mapTextMeasurement` のモックだけを置き換える。独自の `v3Json()`・`jsonFile` など他は変えない。

- [ ] **Step 1: 置き換え前の件数を記録する**

Run:
```bash
cd client && for f in pageMapLibrary pageMapLibraryDialog pageMapLibrarySwitch pageCollapse pageSearch; do printf "%s " $f; npx jest src/app/__tests__/$f.test.tsx 2>&1 | grep -E "^Tests:"; done
```
Expected（参考値）: MapLibrary 19、MapLibraryDialog 17、MapLibrarySwitch 19、Collapse 23、Search 16（すべて passed）。

- [ ] **Step 2: `pageMapLibrary.test.tsx` を置き換える**

import の例:
```ts
import {
  dialog,
  type ExportedMap,
  headerButton,
  renderPage,
  stageContainer,
  undoButton,
  v3JsonFromLabels,
} from "@/app/testing/pageTestHelpers";
```

Run: `cd client && npx jest src/app/__tests__/pageMapLibrary.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 3: `pageMapLibraryDialog.test.tsx` を置き換える**

Run: `cd client && npx jest src/app/__tests__/pageMapLibraryDialog.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 4: `pageMapLibrarySwitch.test.tsx` を置き換える**

Run: `cd client && npx jest src/app/__tests__/pageMapLibrarySwitch.test.tsx`
Expected: Step 1 と同じ件数で PASS。

- [ ] **Step 5: `pageCollapse.test.tsx` と `pageSearch.test.tsx` の文字幅のモックを置き換える**

Run: `cd client && npx jest src/app/__tests__/pageCollapse.test.tsx src/app/__tests__/pageSearch.test.tsx`
Expected: Step 1 と同じ件数（23・16）で PASS。

- [ ] **Step 6: 期待値が変わっていないことを確かめる**

Run:
```bash
git diff -U0 -- client/src/app/__tests__/pageMapLibrary.test.tsx client/src/app/__tests__/pageMapLibraryDialog.test.tsx client/src/app/__tests__/pageMapLibrarySwitch.test.tsx client/src/app/__tests__/pageCollapse.test.tsx client/src/app/__tests__/pageSearch.test.tsx | grep -E "^[-+].*(expect\(|it\(|describe\()"
```
Expected: 出てくる行は、`pageMapLibrary.test.tsx` の 242・264・285・398行目（置き換え前の行番号）で `expect(...)` の中の `v3Json(` を `v3JsonFromLabels(` に改名した4組（`-` と `+` の組で、その差以外が同じ）だけ。他のファイルからは出ない。

- [ ] **Step 7: 5本の件数・型検査・lint・共通化の漏れの確認**

Run:
```bash
cd client && for f in pageMapLibrary pageMapLibraryDialog pageMapLibrarySwitch pageCollapse pageSearch; do printf "%s " $f; npx jest src/app/__tests__/$f.test.tsx 2>&1 | grep -E "^Tests:"; done
npm run typecheck
npx eslint src/app/__tests__/pageMapLibrary.test.tsx src/app/__tests__/pageMapLibraryDialog.test.tsx src/app/__tests__/pageMapLibrarySwitch.test.tsx src/app/__tests__/pageCollapse.test.tsx src/app/__tests__/pageSearch.test.tsx
git diff --name-only origin/main -- src | grep -v -E "/__tests__/|/testing/"
grep -n -E "^(async )?function (stageContainer|renderPage|renderHome|undoButton|redoButton|dialog|headerButton|selectNode|exportedMap|storedMap)\(|^type Exported|text\.length \* 8|createMockPixiModule\(\)" src/app/__tests__/page?*.test.tsx
```
Expected: 件数が Step 1 と一致してすべて passed、typecheck 成功、eslint のエラー・警告0件、`git diff` の出力が空。最後の `grep` に出るのは `pageCollapse.test.tsx`・`pageSearch.test.tsx` の `runtime.createMockPixiModule()`（対象外の変種）の2行だけ。

- [ ] **Step 8: コミット**

```bash
git add client/src/app/__tests__/pageMapLibrary.test.tsx client/src/app/__tests__/pageMapLibraryDialog.test.tsx client/src/app/__tests__/pageMapLibrarySwitch.test.tsx client/src/app/__tests__/pageCollapse.test.tsx client/src/app/__tests__/pageSearch.test.tsx
git commit -m "test(page): マップの一覧・切り替え・折りたたみ・検索のテストで共通ヘルパーを使う" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: README の更新と全体の検証

**Files:**
- Modify: `client/README.md`（86行目付近のディレクトリ構成、176〜180行目付近の「共通テストフィクスチャ & Pixi テストハーネス」の一覧）

**Interfaces:**
- Consumes（Task 1〜4）: `client/src/app/testing/pageModuleMocks.ts`・`client/src/app/testing/pageTestHelpers.tsx` と、それを使う13本のテストファイル。
- Produces: なし。

- [ ] **Step 1: ディレクトリ構成に `app/testing/` を足す**

`client/README.md` のディレクトリ構成（`client/src/` のツリー）。

置き換え前:
```text
├── app/                  # Next.js App Router (ページ、レイアウト、Route Handler)
├── components/           # React UI コンポーネント (DOM オーバーレイ & Pixi キャンバス)
```
置き換え後:
```text
├── app/                  # Next.js App Router (ページ、レイアウト、Route Handler)
│   └── testing/          # ページ (Home) の結合テストの共通ヘルパーと jest.mock 用のモックの中身 (pageTestHelpers, pageModuleMocks)
├── components/           # React UI コンポーネント (DOM オーバーレイ & Pixi キャンバス)
```

86行目の `src/testing/` の行は次のようにする。

置き換え前:
```text
├── testing/              # テスト用ヘルパー、モック、フィクスチャ (createTestNode, jpegFixture, createTestStorageSession, mapLibraryTestStorage)
```
置き換え後:
```text
├── testing/              # テスト用ヘルパー、モック、フィクスチャ (createTestNode, jpegFixture, createTestStorageSession, mapLibraryTestStorage)。ページの結合テスト専用のものは app/testing/
```

- [ ] **Step 2: 「共通テストフィクスチャ & Pixi テストハーネス」の一覧に項目を足す**

`src/components/map/testing/treeEditShortcutTargets.ts` の項目（180行目付近）の次に、次の2行を足す。

```markdown
  - `src/app/testing/pageTestHelpers.tsx`: `Home` を本物の `MapEditor`・`MapStage` まで通すページの結合テストで共有する補助。描画してキャンバスの枠を固定する `renderPage`、`stageContainer`・`undoButton`・`redoButton`・`dialog`・`headerButton`、ノードを選択する `selectNode`、JSON 書き出しと保存の本体を読む `exportedMap`（`downloadMapJson` のモックを引数で受け取る）・`storedMap`、V3 の JSON を作る `v3Json`・`v3JsonFromLabels` と型 `ExportedNode`・`ExportedMap`。
  - `src/app/testing/pageModuleMocks.ts`: ページの結合テストの `jest.mock` のファクトリから `jest.requireActual` で読むモックの中身（Pixi の標準形 `createPagePixiModuleMock`、文字幅の測定 `createMapTextMeasurementModuleMock`）。`jest.mock` は巻き上げられるため、ファクトリは `jest.requireActual` 経由でだけ外部の関数を使える。`@/app/page`・`pixi.js` を import しない。
```

- [ ] **Step 3: `ROADMAP.md` を照合する**

`ROADMAP.md` に、このリファクタリング（テストの共通化）に対応する項目が無いことを確かめる。項目のチェック・現在地・最終更新は変えない。

- [ ] **Step 4: 全体の検証**

Run: `cd client && npm run verify`
Expected: Tailwind スキャン・ESLint・typecheck・Jest（`--runInBand`）・build がすべて成功。Jest の対象の13本の件数が調査の表（合計 230）と一致し、`src/app/testing/__tests__` の 11 件が増えている。

- [ ] **Step 5: 本体のコードを変えていないことの最終確認**

Step 6 のコミットの後に確かめる（Step 5 と Step 6 の順を入れ替えて実行してよい）。

Run:
```bash
git status --short
git diff --name-only origin/main
```
Expected: `git status --short` の出力が空（すべてコミット済み）。`git diff --name-only origin/main` に出るのは、`client/src/app/__tests__/page?*.test.tsx` の13本、新しく作った `client/src/app/testing/pageModuleMocks.ts`・`client/src/app/testing/pageTestHelpers.tsx`・`client/src/app/testing/__tests__/pageModuleMocks.test.ts`・`client/src/app/testing/__tests__/pageTestHelpers.test.tsx`、`client/README.md`、`docs/superpowers/plans/2026-10-28-page-test-helpers.md` だけ（計画ファイルが別のコミットで入っている場合も含む）。`client/src` の本体のファイル（`__tests__`・`testing` の外）は出ない。

- [ ] **Step 6: コミット**

```bash
git add client/README.md docs/superpowers/plans/2026-10-28-page-test-helpers.md
git commit -m "docs(test): ページの結合テストの共通ヘルパーを README のテストの一覧に載せる" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
