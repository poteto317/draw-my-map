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
