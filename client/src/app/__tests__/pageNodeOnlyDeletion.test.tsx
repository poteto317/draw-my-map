import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { exportedMap, headerButton, redoButton, renderPage, selectNode, stageContainer, storedMap, undoButton, v3Json, type V3SeedNode, type V3LayoutMode } from "@/app/testing/pageTestHelpers";
import { mockContainers, resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";
import { createJpegDataUrl } from "@/testing/jpegFixture";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から MapEditor・ヘッダー・
// MapStage のショートカット・useNodes・折りたたみ・履歴・保存までは本物を通す
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

// jsdomはcanvasの2D contextを持たないため、文字幅の測定・PNG化・ダウンロードだけを差し替える
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

const NAME = "選択中のノードだけ削除";
const SUCCESS = "ノードだけ削除しました。子孫は残っています。";
const FAILED = "配置できないため削除できません。";
const NODES: V3SeedNode[] = [
  { id: 1, label: "R", x: 0, y: 0 },
  { id: 6, parentId: 4, label: "C", x: 440, y: 200, width: 130, height: 240, importance: "high", illustration: createJpegDataUrl(100, 100) },
  { id: 2, parentId: 1, label: "A", x: 220, y: 0, importance: "low" },
  { id: 8, parentId: 2, label: "A1", x: 440, y: 0, width: 110 },
  { id: 4, parentId: 1, label: "T", x: 220, y: 200 },
  { id: 3, parentId: 1, label: "B", x: 220, y: 500, importance: "low" },
  { id: 7, parentId: 6, label: "G", x: 660, y: 200, height: 80 },
  { id: 5, parentId: 4, label: "D", x: 440, y: 500, importance: "low" },
  { id: 9, label: "Z", x: 0, y: 500, width: 120 },
];
const BEFORE = JSON.parse(v3Json(NODES));
// Tの位置へ直下のC,Dだけを移し、孫Gは配列の後方・parentId=6を維持する。
const AFTER = { version: 3, layoutMode: "manual", nodes: [BEFORE.nodes[0], BEFORE.nodes[2], BEFORE.nodes[3], { ...BEFORE.nodes[1], parentId: 1 }, { ...BEFORE.nodes[7], parentId: 1 }, BEFORE.nodes[5], BEFORE.nodes[6], BEFORE.nodes[8]] };
function seed(nodes = NODES, mode: V3LayoutMode = "manual") {
  seedMapLibrary(window.localStorage, [{ json: v3Json(nodes, mode) }]);
}
function button() { return headerButton(NAME); }
function selectT() { selectNode(4, 9, 270, 230); }
function read() { return exportedMap(mockDownloadMapJson); }
function notice() { return within(screen.getByTestId("operation-notices")); }
async function expectSaved(expected: unknown) {
  await waitFor(() => expect(storedMap()).toEqual(expected), { timeout: 3000 });
}
beforeEach(() => { resetMapStageTestRuntime(); window.localStorage.clear(); mockDownloadMapJson.mockReset(); });
afterEach(() => jest.restoreAllMocks());

it("親を挿入の直後に新ボタンがありTだけ消え子が残る、Undo/Redoは全属性を復元する", async () => {
  const user = userEvent.setup();
  seed(); await renderPage();
  expect(headerButton("選択中のノードに親を挿入").nextElementSibling).toBe(button());
  expect(button()).toBeDisabled();
  selectT(); expect(button()).toBeEnabled();
  await user.click(button());
  expect(notice().getByText(SUCCESS)).toBeInTheDocument();
  expect(button()).toBeDisabled();
  expect(read()).toEqual(AFTER);
  await user.click(undoButton());
  expect(read()).toEqual(BEFORE);
  expect(button()).toBeDisabled();
  await user.click(redoButton());
  expect(read()).toEqual(AFTER);
});

it("自動保存と実Home再マウントで全配列・illustrationの有無を保つ", async () => {
  seed(); const page = await renderPage(); selectT(); fireEvent.click(button());
  await expectSaved(AFTER);
  expect(storedMap()!.version).toBe(3);
  expect(storedMap()!.layoutMode).toBe("manual");
  expect(storedMap()!.nodes.find(n => n.id === 6)).toHaveProperty("illustration", NODES[1].illustration);
  expect(storedMap()!.nodes.find(n => n.id === 5)).not.toHaveProperty("illustration");
  page.unmount();
  await renderPage();
  expect(read()).toEqual(AFTER);
});

it("折りたたんだTの削除は隠れた子孫を失わず、昇格したC自身の閉じた状態も保つ", async () => {
  seed(); await renderPage();
  selectNode(1, 9, 505, 320);
  fireEvent.click(headerButton("枝を折りたたむ"));
  // 非表示のノードもPixiコンテナ自体は残る。
  selectT();
  fireEvent.click(headerButton("枝を折りたたむ"));
  // Tを閉じたまま削除。C,Dが再び表示され、GはC自身が閉じているため非表示。
  fireEvent.click(button());
  expect(notice().getByText(SUCCESS)).toBeInTheDocument();
  expect(read()).toEqual(AFTER);
  expect(mockContainers.slice(-8).map(n => n.eventMode === "static")).toEqual([true, true, true, true, true, true, false, true]);
  selectNode(3, 8, 505, 320);
  expect(headerButton("枝を展開")).toBeEnabled();
  fireEvent.click(headerButton("枝を展開"));
  expect(mockContainers.slice(-8).map(n => n.eventMode === "static")).toEqual([true, true, true, true, true, true, true, true]);
  selectNode(6, 8, 710, 240);
  expect(button()).toBeEnabled();
  await expectSaved(AFTER);
});

it("解像度で隠れた子・兄弟も保存に残し、重要度と表示レベルは変更しない", async () => {
  seed(NODES.map(n => n.id === 4 ? { ...n, importance: "high" } : n));
  await renderPage();
  fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
  // highのC,Tとその祖先Rが見え、低重要度の子Dと兄弟A,Bは隠れる。
  const initial = read();
  expect(mockContainers.slice(-9).map(n => n.eventMode === "static")).toEqual([true, true, false, false, true, false, false, false, false]);
  selectT();
  expect(button()).toBeEnabled();
  fireEvent.click(button());
  expect(notice().getByText(SUCCESS)).toBeInTheDocument();
  expect(read()).toEqual(AFTER);
  expect(mockContainers.slice(-8).map(n => n.eventMode === "static")).toEqual([true, false, false, true, false, false, false, false]);
  await expectSaved(AFTER);
  expect(screen.getByRole("button", { name: "表示 高のみ" })).toHaveAttribute("aria-pressed", "true");
  expect(initial.nodes).toHaveLength(9);
});

it("表示レベルで選択が隠れると無効で構造を変えない", async () => {
  const nodes = NODES.map(n => n.id === 6 ? { ...n, importance: "medium" } : n);
  seed(nodes); await renderPage(); selectT(); expect(button()).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
  expect(button()).toBeDisabled(); fireEvent.click(button()); expect(read()).toEqual(JSON.parse(v3Json(nodes)));
});

it("配置失敗を通知し、保存・選択・Redoを変えない", async () => {
  const failureNodes: V3SeedNode[] = [
    { id: 1, label: "R", x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE },
    { id: 6, parentId: 1, label: "C", x: 220, y: 200 },
    { id: 4, label: "T", x: 220, y: 400 },
  ];
  seed(failureNodes, "auto"); await renderPage();
  const before = read();
  await act(async () => { fireEvent.doubleClick(stageContainer(), { clientX: 270, clientY: 230 }); });
  const input = screen.getByTestId("node-label-input");
  fireEvent.change(input, { target: { value: "C変更" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(undoButton());
  expect(redoButton()).toBeEnabled();
  selectNode(2, 3, 270, 430);
  expect(button()).toBeEnabled();
  fireEvent.click(button());
  expect(notice().getByText(FAILED)).toBeInTheDocument();
  expect(screen.queryByText(SUCCESS)).not.toBeInTheDocument();
  expect(button()).toBeEnabled();
  expect(read()).toEqual(before);
  expect(redoButton()).toBeEnabled();
  await new Promise(resolve => setTimeout(resolve, 400));
  expect(storedMap()).toEqual(before);
  fireEvent.click(redoButton());
  expect(read().nodes.find(n => n.id === 6)?.label).toBe("C変更");
});

it.each(["Delete", "Backspace"])("従来の%sは枝全体を削除し、検索とラベル入力ではノードを消さない", async key => {
  const user = userEvent.setup();
  seed(); await renderPage(); selectT();
  const search = screen.getByRole("combobox", { name: "ノードを検索" });
  fireEvent.change(search, { target: { value: "T" } });
  await user.click(search);
  if (key === "Delete") await user.keyboard("{Home}");
  await user.keyboard(`{${key}}`);
  expect(search).toHaveValue("");
  expect(read()).toEqual(BEFORE);
  fireEvent.change(search, { target: { value: "" } });
  await act(async () => { fireEvent.doubleClick(stageContainer(), { clientX: 270, clientY: 230 }); });
  const input = screen.getByTestId("node-label-input");
  await user.click(input);
  await user.keyboard(key === "Delete" ? "{Home}" : "{End}");
  await user.keyboard(`{${key}}`);
  expect(input).toHaveValue("");
  expect(read()).toEqual(BEFORE);
  fireEvent.keyDown(input, { key: "Escape" });
  selectT(); fireEvent.keyDown(document.body, { key });
  expect(read().nodes.map(n => n.id)).toEqual([1, 2, 8, 3, 9]);
});

it.each(["pointer", "keyboard"])("%sの連続入力で他ノードを削除せずアプリからfocusを移さない", async kind => {
  const user = userEvent.setup();
  seed(); await renderPage(); selectT();
  const control = button(); control.focus();
  const focus = jest.spyOn(HTMLElement.prototype, "focus"); focus.mockClear();
  if (kind === "pointer") await user.click(control);
  else {
    // jsdomにはEnterの既定click合成がないため明示して再現する。
    if (fireEvent.keyDown(control, { key: "Enter" })) fireEvent.click(control, { detail: 0 });
  }
  expect(notice().getByText(SUCCESS)).toBeInTheDocument();
  expect(control).toBeDisabled();
  fireEvent.click(control, { detail: 2 });
  for (const key of ["Enter", " "]) fireEvent.keyDown(control, { key, repeat: true });
  expect(focus).not.toHaveBeenCalled();
  expect(button()).toBeDisabled();
  expect(read()).toEqual(AFTER);
});

it("ラベル編集からの通常クリックはblurでラベルを確定してから削除する", async () => {
  const user = userEvent.setup();
  seed(); await renderPage(); selectT();
  await act(async () => { fireEvent.doubleClick(stageContainer(), { clientX: 270, clientY: 230 }); });
  fireEvent.change(screen.getByTestId("node-label-input"), { target: { value: "T編集中" } });
  await user.click(button());
  expect(notice().getByText(SUCCESS)).toBeInTheDocument();
  expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
  expect(read()).toEqual(AFTER);
  fireEvent.click(undoButton());
  expect(read()).toEqual({ ...BEFORE, nodes: BEFORE.nodes.map((n: {id:number}) => n.id === 4 ? { ...n, label: "T編集中" } : n) });
});
