import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import {
  lastWorldContainer,
  mockContainers,
  mockNodePointerHandlers,
  mockStageBounds,
  mockStage,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";

const mockPixiInit = jest.fn<Promise<void>, []>();
jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  const pixiMock = runtime.createMockPixiModule();
  pixiMock.Application.mockImplementation(() => ({
    init: mockPixiInit,
    destroy: jest.fn(),
    canvas: document.createElement("canvas"),
    stage: runtime.mockStage,
    screen: { x: 0, y: 0, width: 800, height: 600 },
  }));
  return pixiMock;
});
jest.mock("@/services/illustration/illustrationGeneration", () => ({
  generateIllustrationThumbnail: jest.fn(),
}));
const mockDownloadMapJson = jest.fn();
jest.mock("@/services/persistence/mapJsonDownload", () => ({
  downloadMapJson: (json: string) => mockDownloadMapJson(json),
}));
jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));
const mockDownloadImage = jest.fn();
jest.mock("@/services/imageExport/mapImageDownload", () => ({ downloadMapImage: (...args: unknown[]) => mockDownloadImage(...args) }));
const mockRasterizePng = jest.fn();
jest.mock("@/services/imageExport/mapPngRasterizer", () => ({ rasterizeMapSvgToPng: (...args: unknown[]) => mockRasterizePng(...args) }));

const STORAGE_KEY = "draw-my-map.map.v1";
const tree = [
  { id: 1, parentId: null, label: "A", importance: "low", x: 40, y: 80, width: 100, height: 60 },
  { id: 2, parentId: 1, label: "B", importance: "high", x: 250, y: 80, width: 100, height: 60 },
  { id: 3, parentId: 2, label: "C", importance: "high", x: 460, y: 80, width: 100, height: 300 },
  { id: 4, parentId: 1, label: "D", importance: "low", x: 250, y: 500, width: 100, height: 60 },
];
const TREE_SIZE = tree.length;
function mapJson(layoutMode = "manual", nodes = tree) {
  return JSON.stringify({ version: 3, layoutMode, nodes });
}
function stage() { return document.querySelector<HTMLElement>(".cursor-crosshair")!; }
function select(index: number, count = TREE_SIZE) {
  act(() => {
    mockNodePointerHandlers.at(-count + index)?.pointerdown?.(pointer(0, 0));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}
function toggle() { fireEvent.click(screen.getByRole("button", { name: /枝を折りたたむ|枝を展開/ })); }
function visible(count = TREE_SIZE) { return mockContainers.slice(-count).map((node) => node.eventMode === "static"); }
function positions() {
  return mockContainers.slice(-TREE_SIZE).map((node) => node.addChild.mock.calls[0][0].rect.mock.lastCall.slice(0, 2));
}
function exported() {
  mockDownloadMapJson.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return mockDownloadMapJson.mock.lastCall![0] as string;
}
async function importMap(text: string) {
  const file = new File([text], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
  await act(async () => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } }));
}
async function start(layoutMode = "manual", nodes = tree) {
  window.localStorage.setItem(STORAGE_KEY, mapJson(layoutMode, nodes));
  await renderReady(<Home />);
  mockStageBounds(stage());
}
async function search(label: string) {
  const user = userEvent.setup();
  const input = screen.getByRole("combobox", { name: "ノードを検索" });
  await user.clear(input); await user.type(input, label);
  await user.click(screen.getByRole("option"));
  act(() => (document.activeElement as HTMLElement).blur());
}
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });
}
beforeEach(() => {
  resetMapStageTestRuntime(); mockPixiInit.mockResolvedValue(undefined); window.localStorage.clear();
  mockRasterizePng.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
});
afterEach(() => jest.restoreAllMocks());

it("入れ子指定と件数を保持し、Rの高重要度もCを突き破らない", async () => {
  await start(); select(1); toggle();
  expect(visible()).toEqual([true, true, false, true]);
  expect(screen.getByText("折りたたみで非表示: 1件")).toBeInTheDocument();
  select(0); toggle();
  expect(visible()).toEqual([true, false, false, false]);
  expect(screen.getByText("折りたたみで非表示: 3件")).toBeInTheDocument();
  toggle(); expect(visible()).toEqual([true, true, false, true]);
  fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
  expect(visible()).toEqual([true, true, false, false]);
  select(0); toggle(); expect(visible()).toEqual([true, false, false, false]);
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeEnabled();
});

it("件数は閉じた親だけ全子孫数を示し、開いた親・葉・未選択では0件にする", async () => {
  const hiddenCount = () => screen.getByText(/^折りたたみで非表示: \d+件$/).textContent;
  const deselect = () => act(() => {
    mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
  await start();
  expect(hiddenCount()).toBe("折りたたみで非表示: 0件");
  select(0); expect(hiddenCount()).toBe("折りたたみで非表示: 0件");
  select(2); expect(hiddenCount()).toBe("折りたたみで非表示: 0件");
  select(1); expect(hiddenCount()).toBe("折りたたみで非表示: 0件");
  toggle(); expect(hiddenCount()).toBe("折りたたみで非表示: 1件");
  select(0); expect(hiddenCount()).toBe("折りたたみで非表示: 0件");
  toggle(); expect(hiddenCount()).toBe("折りたたみで非表示: 3件");
  toggle(); expect(hiddenCount()).toBe("折りたたみで非表示: 0件");
  select(1); expect(hiddenCount()).toBe("折りたたみで非表示: 1件");
  deselect(); expect(hiddenCount()).toBe("折りたたみで非表示: 0件");
  expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toBeDisabled();
});

it("折りたたみで隠れた子孫の位置を右クリックしてもメニューを開かず、表示中の親では開く", async () => {
  await start(); select(1); toggle();
  fireEvent.contextMenu(stage(), { clientX: 500, clientY: 200 });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeEnabled();
  fireEvent.contextMenu(stage(), { clientX: 300, clientY: 110 });
  expect(screen.getByRole("menu")).toHaveStyle({ left: "300px", top: "110px" });
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeEnabled();
});

it("auto投影の座標で編集・F移動し、R変更だけでは動かずmanualで正本に戻る", async () => {
  await start("auto"); select(1); toggle();
  const projected = positions();
  expect(projected).toEqual([[40, 80], [260, 30], [460, 80], [260, 130]]);
  expect(projected[3]).not.toEqual([250, 500]);
  fireEvent.doubleClick(stage(), { clientX: projected[3][0] + 10, clientY: projected[3][1] + 10 });
  expect(screen.getByTestId("node-label-input")).toHaveValue("D");
  expect(screen.getByTestId("node-label-input")).toHaveStyle({ left: `${projected[3][0]}px`, top: `${projected[3][1]}px` });
  fireEvent.keyDown(screen.getByTestId("node-label-input"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
  expect(positions()).toEqual(projected);
  fireEvent.click(screen.getByRole("button", { name: "表示 すべて" }));
  select(3); fireEvent.keyDown(window, { key: "f" });
  expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(350 - projected[3][0], 270 - projected[3][1]);
  fireEvent.click(screen.getByRole("button", { name: "手動配置" }));
  expect(positions()[3]).toEqual([250, 500]);
});

it("折りたたみ中にmanualからautoへ切り替えると投影が始まり、元に戻すと全展開のmanual正本に戻る", async () => {
  await start(); select(1); toggle();
  expect(positions()).toEqual([[40, 80], [250, 80], [460, 80], [250, 500]]);
  fireEvent.click(screen.getByRole("button", { name: "自動配置" }));
  const projected = positions();
  expect([projected[0], projected[1], projected[3]]).toEqual([[40, 80], [260, 30], [260, 130]]);
  expect(visible()).toEqual([true, true, false, true]);
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeEnabled();
  expect(screen.getByText("折りたたみで非表示: 1件")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
  expect(visible()).toEqual([true, true, true, true]);
  expect(positions()).toEqual([[40, 80], [250, 80], [460, 80], [250, 500]]);
  select(1);
  expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toBeEnabled();
  expect(screen.getByText("折りたたみで非表示: 0件")).toBeInTheDocument();
});

it("検索で閉祖先を展開した最新座標へfocusし編集位置も追従する", async () => {
  await start("auto"); select(1); toggle(); select(0); toggle(); await search("C");
  expect(visible()).toEqual([true, true, true, true]);
  expect(screen.getByRole("button", { name: "表示 自動" })).toHaveAttribute("aria-pressed", "true");
  expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(-110, 70);
  fireEvent.doubleClick(stage(), { clientX: 400, clientY: 300 });
  expect(screen.getByTestId("node-label-input")).toHaveValue("C");
  expect(screen.getByTestId("node-label-input")).toHaveStyle({ left: "350px", top: "150px" });
  expect(screen.getByTestId("operation-notices")).toHaveTextContent("祖先の枝を展開しました");
});

it("折畳前後でJSON・localStorage・SVG・PNG全件と座標を維持する", async () => {
  await start("auto"); const before = exported();
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(JSON.parse(before)));
  fireEvent.click(screen.getByRole("button", { name: "SVG書き出し" }));
  const svgBefore = await blobText(mockDownloadImage.mock.lastCall![0]);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "PNG書き出し" })));
  const pngBefore = mockRasterizePng.mock.lastCall!.slice();
  select(1); toggle(); expect(exported()).toBe(before);
  expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(JSON.parse(before));
  fireEvent.click(screen.getByRole("button", { name: "SVG書き出し" }));
  expect(await blobText(mockDownloadImage.mock.lastCall![0])).toBe(svgBefore);
  expect(svgBefore).toContain(">C</tspan>");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "PNG書き出し" })));
  expect(mockRasterizePng.mock.lastCall).toEqual(pngBefore);
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
});

it("閉親Tab成功で展開し新規ノードを編集でき、Undo一回で追加を戻す", async () => {
  await start(); select(1); toggle(); fireEvent.keyDown(window, { key: "Tab" });
  expect(visible(5)).toEqual([true, true, true, true, true]);
  expect(screen.getByTestId("node-label-input")).toHaveValue("");
  fireEvent.keyDown(screen.getByTestId("node-label-input"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
  expect(JSON.parse(exported()).nodes).toHaveLength(4);
  expect(visible()).toEqual([true, true, true, true]);
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "やり直す" }));
  expect(JSON.parse(exported()).nodes).toHaveLength(5);
});

it("閉親Tabはその親だけを展開し、ほかの閉じた枝は閉じたまま", async () => {
  await start(); select(1); toggle(); select(0); toggle();
  fireEvent.keyDown(window, { key: "Tab" });
  fireEvent.keyDown(screen.getByTestId("node-label-input"), { key: "Escape" });
  expect(visible(5)).toEqual([true, true, false, true, true]);
});

it("非表示子孫をコピー・複製・削除に含め、複製先は開き元は閉じたまま", async () => {
  await start(); select(1); toggle();
  const setData = jest.fn(); fireEvent.copy(window, { clipboardData: { setData } });
  expect(JSON.parse(setData.mock.lastCall![1]).nodes).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "枝を複製" }));
  expect(JSON.parse(exported()).nodes).toHaveLength(6);
  expect(visible(6)).toEqual([true, true, false, true, true, true]);
  select(1, 6); fireEvent.keyDown(window, { key: "Delete" });
  expect(JSON.parse(exported()).nodes.map((node: { label: string }) => node.label)).toEqual(["A", "D", "B", "C"]);
  fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
  expect(visible(6)).toEqual([true, true, true, true, true, true]);
  fireEvent.click(screen.getByRole("button", { name: "やり直す" }));
  expect(JSON.parse(exported()).nodes).toHaveLength(4);
});

it("閉じた枝を貼り付けた新しい根は開き、元の枝は閉じたまま", async () => {
  await start(); select(1); toggle();
  const store: Record<string, string> = {};
  fireEvent.copy(window, { clipboardData: { setData: (type: string, value: string) => { store[type] = value; } } });
  fireEvent.paste(window, { clipboardData: { getData: (type: string) => store[type] ?? "" } });
  const nodes = JSON.parse(exported()).nodes as { label: string; parentId: number | null }[];
  expect(nodes.map((node) => node.label)).toEqual(["A", "B", "C", "D", "B", "C"]);
  expect(visible(6)).toEqual([true, true, false, true, true, true]);
  select(1, 6);
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeEnabled();
});

it("手動配置で閉じた親をドラッグすると隠れた子孫も同じ量だけ動く", async () => {
  await start(); select(1); toggle();
  const before = JSON.parse(exported()).nodes as { x: number; y: number }[];
  act(() => {
    mockNodePointerHandlers.at(-TREE_SIZE + 1)?.pointerdown?.(pointer(260, 90));
    mockStageHandlers.pointermove?.(pointer(300, 130));
    mockStageHandlers.pointerup?.(pointer(300, 130));
  });
  const after = JSON.parse(exported()).nodes as { x: number; y: number }[];
  const delta = { x: after[1].x - before[1].x, y: after[1].y - before[1].y };
  expect(delta).not.toEqual({ x: 0, y: 0 });
  expect({ x: after[2].x - before[2].x, y: after[2].y - before[2].y }).toEqual(delta);
  expect(after[3]).toEqual(before[3]);
  expect(visible()).toEqual([true, true, false, true]);
});

it("同ID importでは折りたたみ指定を失効させる", async () => {
  await start(); select(0); toggle(); await importMap(mapJson());
  expect(visible()).toEqual([true, true, true, true]); select(0);
  expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toBeEnabled();
});

it("閉親Tabがauto配置不能で失敗した場合は展開せず履歴も作らない", async () => {
  const impossible = tree.map((node) => node.id === 1
    ? { ...node, x: Number.MAX_VALUE, width: Number.MAX_VALUE } : node);
  await start("auto", impossible); select(1); toggle();
  expect(screen.getByRole("status")).toHaveTextContent("表示用の自動配置ができないため、元の位置で表示しています。");
  const before = exported();
  fireEvent.keyDown(window, { key: "Tab" });
  expect(exported()).toBe(before);
  expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeEnabled();
  expect(visible()).toEqual([true, true, false, true]);
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
  toggle();
  expect(screen.queryByText("表示用の自動配置ができないため、元の位置で表示しています。")).not.toBeInTheDocument();
});

it("screen準備前に検索で枝を展開しても同ID import後へ移動要求を持ち越さない", async () => {
  let finish!: () => void;
  mockPixiInit.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  await start(); await search("A"); toggle(); await search("C");
  expect(screen.getByTestId("operation-notices")).toHaveTextContent("祖先の枝を展開しました");
  await importMap(mapJson());
  await act(async () => finish());
  expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(0, 0);
  expect(visible()).toEqual([true, true, true, true]);
  expect(screen.queryByText(/祖先の枝を展開しました/)).not.toBeInTheDocument();
});

it("Vから消えた編集中ノードは編集取消・選択解除され、hidden位置はhitしない", async () => {
  await start(); select(1); toggle();
  select(3);
  fireEvent.doubleClick(stage(), { clientX: 260, clientY: 510 });
  expect(screen.getByTestId("node-label-input")).toHaveValue("D");
  fireEvent.change(screen.getByTestId("node-label-input"), { target: { value: "未確定" } });
  fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
  expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "枝を複製" })).toBeDisabled();
  expect(JSON.parse(exported()).nodes[3].label).toBe("D");
  // Rでは見えるCもBの折りたたみによりVから外れ、編集対象にはならない。
  fireEvent.doubleClick(stage(), { clientX: 470, clientY: 90 });
  expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
  expect(JSON.parse(exported()).nodes).toHaveLength(5);
});

it("検索後も別の閉枝が残る場合は正本ではなく最新投影座標でfocusする", async () => {
  await start("auto"); select(1); toggle();
  await search("D");
  expect(visible()).toEqual([true, true, false, true]);
  expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(90, 140);
  fireEvent.doubleClick(stage(), { clientX: 400, clientY: 300 });
  expect(screen.getByTestId("node-label-input")).toHaveValue("D");
  expect(screen.getByTestId("node-label-input")).toHaveStyle({ left: "350px", top: "270px" });
});

it("折りたたみで編集中の子が隠れたら未確定ラベルを破棄し既存の選択解除が働く", async () => {
  await start();
  fireEvent.doubleClick(stage(), { clientX: 470, clientY: 90 });
  fireEvent.change(screen.getByTestId("node-label-input"), { target: { value: "未確定" } });
  select(1); toggle();
  expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
  expect(JSON.parse(exported()).nodes[2].label).toBe("C");
  expect(screen.getByRole("button", { name: "枝を複製" })).toBeDisabled();
});

function renameA(label: string) {
  fireEvent.doubleClick(stage(), { clientX: 50, clientY: 90 });
  fireEvent.change(screen.getByTestId("node-label-input"), { target: { value: label } });
  fireEvent.keyDown(screen.getByTestId("node-label-input"), { key: "Enter" });
}

it("成功したUndo/Redoでは閉じた枝が残っていても全展開へ戻す", async () => {
  await start(); select(1); toggle(); renameA("A2");
  expect(visible()).toEqual([true, true, false, true]);
  fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
  expect(JSON.parse(exported()).nodes[0].label).toBe("A");
  expect(visible()).toEqual([true, true, true, true]);
  select(1); expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toBeEnabled();
  toggle(); expect(visible()).toEqual([true, true, false, true]);
  fireEvent.click(screen.getByRole("button", { name: "やり直す" }));
  expect(JSON.parse(exported()).nodes[0].label).toBe("A2");
  expect(visible()).toEqual([true, true, true, true]);
  select(1); expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toBeEnabled();
});

it("履歴が空でUndo/Redoが何もしない場合は折りたたみ指定を保持する", async () => {
  await start(); select(1); toggle();
  fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, shiftKey: true });
  expect(visible()).toEqual([true, true, false, true]);
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeEnabled();
  expect(screen.getByText("折りたたみで非表示: 1件")).toBeInTheDocument();
});

it("閉じた親へ既存の枝を接続しても閉状態を保持し、隠れた子の選択を解除して展開後に見せる", async () => {
  await start(); select(1); toggle();
  act(() => {
    mockNodePointerHandlers.at(-TREE_SIZE + 1)?.pointerdown?.(pointer(260, 90, { shiftKey: true }));
    mockStageHandlers.pointermove?.(pointer(260, 510));
    mockStageHandlers.pointerup?.(pointer(260, 510));
  });
  expect(JSON.parse(exported()).nodes[3].parentId).toBe(2);
  expect(visible()).toEqual([true, true, false, false]);
  expect(screen.getByRole("button", { name: "枝を複製" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toBeDisabled();
  select(1);
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeEnabled();
  expect(screen.getByText("折りたたみで非表示: 2件")).toBeInTheDocument();
  toggle();
  expect(visible()).toEqual([true, true, true, true]);
  expect(JSON.parse(exported()).nodes[3].parentId).toBe(2);
});

it("無関係な再描画ではkeydownリスナーを付け直さない", async () => {
  await start();
  select(0);
  const added = jest.spyOn(window, "addEventListener");
  const removed = jest.spyOn(window, "removeEventListener");
  const keydownCalls = (spy: jest.SpyInstance) => spy.mock.calls.filter(([type]) => type === "keydown").length;
  const user = userEvent.setup();
  await user.type(screen.getByRole("combobox", { name: "ノードを検索" }), "A");
  expect(keydownCalls(added)).toBe(0);
  expect(keydownCalls(removed)).toBe(0);
  added.mockRestore();
  removed.mockRestore();
});

it("ノードの変更だけの再描画ではkeydownリスナーを付け直さない", async () => {
  await start();
  select(0);
  const added = jest.spyOn(window, "addEventListener");
  const removed = jest.spyOn(window, "removeEventListener");
  const keydownCalls = (spy: jest.SpyInstance) => spy.mock.calls.filter(([type]) => type === "keydown").length;
  fireEvent.click(screen.getByRole("button", { name: "重要度 高" }));
  expect(JSON.parse(exported()).nodes[0].importance).toBe("high");
  expect(keydownCalls(added)).toBe(0);
  expect(keydownCalls(removed)).toBe(0);
  added.mockRestore();
  removed.mockRestore();
});
