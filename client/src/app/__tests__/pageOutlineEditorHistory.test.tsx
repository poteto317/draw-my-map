import { fireEvent, screen } from "@testing-library/react";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import userEvent from "@testing-library/user-event";
import { exportedMap, redoButton, renderPage, undoButton, v3Json } from "@/app/testing/pageTestHelpers";
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


function exported() { return exportedMap(mockDownloadMapJson); }
function button(name: string) { return screen.getByRole("button", { name }); }
function row(label: string, depth = 1) { return button(`階層${depth}・${label}`); }
function textarea() { return screen.getByRole("textbox", { name: "ラベル編集" }); }
beforeEach(() => { resetMapStageTestRuntime(); window.localStorage.clear(); mockDownloadMapJson.mockReset(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

const TREE = v3Json([
  { id: 1, label: "R", x: 0, y: 100 },
  { id: 2, parentId: 1, label: "A", x: 220, y: 100 },
  { id: 3, parentId: 1, label: "B", x: 220, y: 300 },
  { id: 4, parentId: 3, label: "G", importance: "low", illustration: createJpegDataUrl(128, 128), x: 440, y: 300, width: 120, height: 130 },
]);
async function openOutline() {
  seedMapLibrary(window.localStorage, [{ json: TREE }]);
  await renderPage();
  const user = userEvent.setup();
  expect(exported().nodes).toHaveLength(4);
  await user.click(button("アウトライン"));
  return user;
}
it.each([
  { name: "ルート追加", target: "R", depth: 1 },
  { name: "子を追加", target: "R", depth: 1 },
  { name: "兄弟を末尾に追加", target: "A", depth: 2 },
  { name: "1つ上", target: "B", depth: 2 },
  { name: "1つ下", target: "A", depth: 2 },
  { name: "階層を下げる", target: "B", depth: 2 },
  { name: "階層を上げる", target: "B", depth: 2 },
  { name: "ノードだけ削除", target: "B", depth: 2 },
])("$nameはUndo1回で完全復元、Redo1回で再適用する", async ({ name, target, depth }) => {
  const user = await openOutline();
  await user.click(row(target, depth));
  const before = exported();
  await user.click(button(name));
  if (screen.queryByRole("textbox", { name: "ラベル編集" })) await user.keyboard("{Escape}");
  const after = exported();
  expect(after).not.toEqual(before);
  // 手動構造操作で座標/parentId/配列順が変わっても、既存ノードの属性は保持する。
  for (const node of after.nodes) {
    const original = before.nodes.find(candidate => candidate.id === node.id);
    if (original) {
      expect(node).toMatchObject({ id: original.id, label: original.label, importance: original.importance,
        width: original.width, height: original.height });
      expect(node.illustration).toBe(original.illustration);
    }
  }
  if (["ルート追加", "子を追加", "兄弟を末尾に追加"].includes(name)) {
    const added = after.nodes.find(node => !before.nodes.some(original => original.id === node.id))!;
    expect(added.label).toBe("");
    expect(added.parentId).toBe(name === "ルート追加" ? null : 1);
    expect(after.nodes.filter(node => node.parentId === added.parentId).at(-1)?.id).toBe(added.id);
  }
  if (name === "ノードだけ削除") {
    expect(after.nodes.find(node => node.id === 4)).toEqual({ ...before.nodes[3], parentId: 1 });
    expect(row("R")).toHaveFocus();
    expect(button("ノードだけ削除")).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /^階層\d/ }).every(node => node.getAttribute("aria-pressed") === "false")).toBe(true);
  }
  await user.click(undoButton());
  expect(exported()).toEqual(before);
  expect(undoButton()).toBeDisabled();
  await user.click(redoButton());
  expect(exported()).toEqual(after);
  expect(redoButton()).toBeDisabled();
});
it("追加とラベル確定は別履歴で、入力・選択・モードには履歴がない", async () => {
  const user = await openOutline();
  const before = exported();
  await user.click(row("A", 2)); await user.click(button("マップ")); await user.click(button("アウトライン"));
  expect(undoButton()).toBeDisabled();
  await user.click(button("子を追加"));
  const added = exported();
  await user.type(textarea(), "追加ラベル");
  expect(exported()).toEqual(added);
  await user.keyboard("{Enter}");
  const labeled = exported();
  expect(labeled.nodes.at(-1)?.label).toBe("追加ラベル");
  await user.click(undoButton()); expect(exported()).toEqual(added);
  await user.click(undoButton()); expect(exported()).toEqual(before); expect(undoButton()).toBeDisabled();
  await user.click(redoButton()); await user.click(redoButton()); expect(exported()).toEqual(labeled);
});
it("変更ありdraftの通常Undo clickはblur確定したラベルだけを戻す", async () => {
  const user = await openOutline();
  await user.click(row("B", 2)); await user.click(button("1つ上"));
  const prior = exported();
  await user.dblClick(row("B", 2)); await user.clear(textarea()); await user.type(textarea(), "新しいラベル");
  await user.click(undoButton());
  expect(exported()).toEqual(prior);
  expect(undoButton()).toBeEnabled();
  await user.click(undoButton()); expect(exported()).toEqual(JSON.parse(TREE));
});
it("変更ありdraftの通常Redo clickはblurでRedo枝を消し新ラベルを保つ", async () => {
  const user = await openOutline();
  await user.dblClick(row("A", 2)); await user.type(textarea(), "確定{Enter}");
  await user.click(undoButton());
  await user.dblClick(row("A", 2)); await user.clear(textarea()); await user.type(textarea(), "上書き");
  await user.click(redoButton());
  expect(exported().nodes[1].label).toBe("上書き"); expect(redoButton()).toBeDisabled();
  await user.click(undoButton()); expect(exported()).toEqual(JSON.parse(TREE)); expect(undoButton()).toBeDisabled();
});
it.each(["元に戻す", "やり直す"])("変更なしdraftの通常%s clickは既存履歴を動かす", async name => {
  const user = await openOutline();
  await user.click(row("B", 2)); await user.click(button("1つ上"));
  const reordered = exported();
  if (name === "やり直す") await user.click(undoButton());
  await user.dblClick(row("A", 2));
  await user.click(button(name));
  expect(exported()).toEqual(name === "元に戻す" ? JSON.parse(TREE) : reordered);
  expect(name === "元に戻す" ? undoButton() : redoButton()).toBeDisabled();
});
it("通常モードclickはblur確定を採用し、切替自体は履歴を増やさない", async () => {
  const user = await openOutline();
  await user.dblClick(row("A", 2)); await user.clear(textarea());
  fireEvent.change(textarea(), { target: { value: "  生ラベル\n\t  " } });
  await user.click(button("マップ"));
  expect(exported().nodes[1]).toEqual({ ...JSON.parse(TREE).nodes[1], label: "  生ラベル\n\t  " });
  await user.click(undoButton()); expect(exported()).toEqual(JSON.parse(TREE)); expect(undoButton()).toBeDisabled();
});

it("空mapのルート追加と確定をそれぞれ1回ずつ戻せる", async () => {
  const user = userEvent.setup(); await renderPage(); await user.click(button("アウトライン"));
  await user.click(button("ルート追加"));
  const added = exported();
  expect(added.nodes).toHaveLength(1); expect(added.nodes[0]).toMatchObject({ parentId: null, label: "" });
  await user.type(textarea(), "最初の根{Enter}");
  await user.click(undoButton()); expect(exported()).toEqual(added);
  await user.click(undoButton()); expect(exported().nodes).toEqual([]); expect(undoButton()).toBeDisabled();
});
