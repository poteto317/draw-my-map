import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { exportedMap, headerButton, renderPage, selectNode, stageContainer, storedMap, undoButton, v3Json } from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";
import { MAP_STORAGE_KEY } from "@/services/persistence/mapStorage";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";

jest.mock("pixi.js", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createPagePixiModuleMock()
));

jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return { ...actual, generateIllustrationThumbnail: jest.fn() };
});

const mockDownloadMapJson = jest.fn();
const mockDownloadOutlineText = jest.fn();
jest.mock("@/services/outlineExport/outlineTextDownload", () => ({
  downloadOutlineText: (text: string, mapName: string, format: string) => mockDownloadOutlineText(text, mapName, format),
}));
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


function exported() { return exportedMap(mockDownloadMapJson); }
function button(name: string) { return screen.getByRole("button", { name }); }
function row(label: string, depth = 1) { return button(`階層${depth}・${label}`); }
function textarea() { return screen.getByRole("textbox", { name: "ラベル編集" }); }
beforeEach(() => { resetMapStageTestRuntime(); window.localStorage.clear(); mockDownloadMapJson.mockReset(); mockDownloadOutlineText.mockReset(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

import { createJpegDataUrl } from "@/testing/jpegFixture";
import { mockContainers } from "@/components/map/testing/mapStageTestRuntime";

it("mapで作った親子をoutlineでラベル・兄弟順・階層変更し、map・保存・再読込へ返す", async () => {
  const user = userEvent.setup();
  const { unmount } = await renderPage();
  fireEvent.doubleClick(stageContainer(), { clientX: 200, clientY: 200 });
  fireEvent.doubleClick(stageContainer(), { clientX: 200, clientY: 200 });
  await user.type(screen.getByTestId("node-label-input"), "親{Enter}");
  selectNode(0, 1);
  fireEvent.keyDown(window, { key: "Tab" });
  expect(exported().nodes).toHaveLength(2);
  await user.type(screen.getByTestId("node-label-input"), "子{Enter}");
  const original = exported();
  await user.click(button("アウトライン"));
  expect(row("親")).toBeInTheDocument(); expect(row("子", 2)).toBeInTheDocument();
  await user.click(row("子", 2)); await user.click(button("兄弟を末尾に追加")); await user.type(textarea(), "兄弟{Enter}");
  await user.click(button("1つ上"));
  expect(exported().nodes.filter(node => node.parentId === original.nodes[0].id).map(node => node.label)).toEqual(["兄弟", "子"]);
  await user.click(row("子", 2)); await user.click(button("階層を下げる"));
  expect(row("子", 3)).toBeInTheDocument();
  await user.click(button("階層を上げる"));
  await user.dblClick(row("子", 2)); await user.clear(textarea()); await user.type(textarea(), "変更した子{Enter}");
  const edited = exported();
  expect(edited.nodes.find(node => node.id === original.nodes[1].id)).toMatchObject({ label: "変更した子", parentId: original.nodes[0].id });
  await user.click(button("マップ")); expect(document.querySelector("canvas")).toBeInTheDocument(); expect(exported()).toEqual(edited);
  await waitFor(() => expect(storedMap()).toEqual(edited));
  unmount(); resetMapStageTestRuntime(); await renderPage();
  expect(exported()).toEqual(edited); expect(undoButton()).toBeDisabled();
});

it("collapse/highで隠れた全件を編集してもラベル以外の属性と座標・寸法を保持する", async () => {
  const source = v3Json([
    { id: 1, label: "R", importance: "high", x: 20, y: 30 },
    { id: 2, parentId: 1, label: "A", importance: "high", x: 240, y: 80 },
    { id: 3, parentId: 2, label: "G", importance: "low", illustration: createJpegDataUrl(128,128), x: 460, y: 80, width: 140, height: 140 },
    { id: 4, parentId: 1, label: "L", importance: "low", x: 240, y: 320, width: 130, height: 75 },
  ]);
  seedMapLibrary(window.localStorage, [{ json: source }]);
  const user = userEvent.setup(); await renderPage();
  const before = exported();
  selectNode(1, 4); await user.click(headerButton("枝を折りたたむ")); await user.click(button("表示 高のみ"));
  expect(mockContainers.slice(-4).map(node => node.eventMode === "static")).toEqual([true, true, false, false]);
  await user.click(button("アウトライン"));
  expect(screen.getAllByRole("button", { name: /^階層\d/ })).toHaveLength(4);
  for (const [label, depth] of [["G", 3], ["L", 2]] as const) {
    await user.dblClick(row(label, depth)); await user.type(textarea(), "編集{Enter}");
  }
  const expected = { ...before, nodes: before.nodes.map(node => ({ ...node, label: [3,4].includes(node.id) ? `${node.label}編集` : node.label })) };
  expect(exported()).toEqual(expected);
  await user.click(button("マップ")); expect(exported()).toEqual(expected);
  await waitFor(() => expect(storedMap()).toEqual(expected));
});

it("outline構造変更は隠れた兄弟も対象とし、map復帰後は従来visible集合で同じ階層操作を行う", async () => {
  seedMapLibrary(window.localStorage, [{ json: v3Json([
    { id: 1, label: "R", importance: "high", x: 0, y: 100 },
    { id: 2, parentId: 1, label: "A", importance: "high", x: 220, y: 0 },
    { id: 4, parentId: 1, label: "L", importance: "low", x: 220, y: 100 },
    { id: 6, parentId: 1, label: "C", importance: "high", x: 220, y: 200 },
  ]) }]);
  const user = userEvent.setup(); await renderPage(); await user.click(button("表示 高のみ"));
  const before = exported();
  await user.click(button("アウトライン")); await user.click(row("C", 2)); await user.click(button("階層を下げる"));
  expect(exported().nodes.find(node => node.id === 6)?.parentId).toBe(4);
  expect(exported().nodes.find(node => node.id === 4)).toEqual(before.nodes.find(node => node.id === 4));
  await user.click(undoButton()); expect(exported()).toEqual(before);
  await user.click(row("C", 2)); await user.click(button("マップ"));
  expect(button("表示 高のみ")).toHaveAttribute("aria-pressed", "true");
  await user.click(headerButton("枝の階層を下げる"));
  expect(exported().nodes.find(node => node.id === 6)?.parentId).toBe(2);
  expect(exported().nodes.find(node => node.id === 4)).toEqual(before.nodes.find(node => node.id === 4));
});

it("配置失敗では正本・選択・履歴を増やさない", async () => {
  seedMapLibrary(window.localStorage, [{ json: v3Json([
    { id: 1, label: "R", x: 0, y: 100 },
    { id: 2, parentId: 1, label: "A", x: 220, y: 0 },
    { id: 5, parentId: 2, label: "A1", x: 440, y: 1e17 },
    { id: 3, parentId: 1, label: "B", x: 220, y: 200 },
  ]) }]);
  const user = userEvent.setup(); await renderPage(); await user.click(button("アウトライン"));
  await user.click(row("B", 2)); const before = exported();
  await user.click(button("階層を下げる"));
  expect(exported()).toEqual(before); expect(row("B", 2)).toHaveAttribute("aria-pressed", "true"); expect(undoButton()).toBeDisabled();
  expect(within(screen.getByRole("banner")).getByRole("alert")).not.toBeEmptyDOMElement();
});

it("Home の共通ヘッダーは両モードで全件テキストを出し、保存内容を変えない", async () => {
  const source = v3Json([
    { id: 1, label: "根", importance: "high" },
    { id: 2, parentId: 1, label: "低い子", importance: "low" },
  ]);
  seedMapLibrary(window.localStorage, [{ json: source }]);
  const user = userEvent.setup();
  await renderPage();
  const before = storedMap();
  selectNode(0, 2);
  await user.click(headerButton("枝を折りたたむ"));
  await user.click(button("表示 高のみ"));
  await user.click(headerButton("Markdown書き出し"));
  expect(mockDownloadOutlineText).toHaveBeenLastCalledWith("- 根\n  - 低い子\n", "マップ 1", "md");
  await user.click(button("アウトライン"));
  await user.click(headerButton("箇条書き書き出し"));
  expect(mockDownloadOutlineText).toHaveBeenLastCalledWith("・根\n  ・低い子\n", "マップ 1", "txt");
  expect(storedMap()).toEqual(before);
  expect(exported()).toEqual(before);
  expect(undoButton()).toBeDisabled();
});

it("Home の外側ダイアログ中は書き出しボタンを含む editor 根が inert", async () => {
  await renderPage();
  const root = document.querySelector("[data-map-id]");
  expect(root).toContainElement(headerButton("Markdown書き出し"));
  await userEvent.click(headerButton("新しいマップ"));
  expect(root).toHaveAttribute("inert");
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "キャンセル" }));
  expect(root).not.toHaveAttribute("inert");
});

it("保護モードの Home でも正本テキストを書き出せる", async () => {
  const source = v3Json([{ id: 1, label: "救出" }]);
  window.localStorage.setItem(MAP_STORAGE_KEY, source);
  const originalSetItem = Storage.prototype.setItem;
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key.startsWith(mapBodyKey(""))) throw new DOMException("blocked", "SecurityError");
    originalSetItem.call(this, key, value);
  });
  await renderPage();
  expect(headerButton("マップ一覧")).toBeDisabled();
  await userEvent.click(headerButton("Markdown書き出し"));
  expect(mockDownloadOutlineText).toHaveBeenLastCalledWith("- 救出\n", "無題のマップ", "md");
  expect(screen.getByText("Markdownファイルを書き出しました。", { selector: "p" })).toBeInTheDocument();
});

it("Home で上限を越えた正本は書き出さず専用警告を出す", async () => {
  seedMapLibrary(window.localStorage, [{ json: v3Json([{ id: 1, label: "長".repeat(999_999) }]) }]);
  await renderPage();
  await userEvent.click(headerButton("Markdown書き出し"));
  expect(mockDownloadOutlineText).not.toHaveBeenCalled();
  expect(within(screen.getByRole("banner")).getByRole("alert")).toHaveTextContent(
    "書き出すテキストが大きすぎます。JSONで書き出してください。",
  );
});
