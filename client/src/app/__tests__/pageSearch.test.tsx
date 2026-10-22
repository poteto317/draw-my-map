import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import {
  lastWorldContainer,
  mockStage,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

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
  downloadMapJson: (json: string, mapName: string) => mockDownloadMapJson(json, mapName),
}));
jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));
jest.mock("@/services/imageExport/mapImageDownload", () => ({ downloadMapImage: jest.fn() }));
jest.mock("@/services/imageExport/mapPngRasterizer", () => ({ rasterizeMapSvgToPng: jest.fn() }));

function v3Json() {
  return `${JSON.stringify({
    version: 3,
    layoutMode: "manual",
    nodes: [
      { id: 1, parentId: null, label: "親ノード", importance: "high", x: 250, y: 170, width: 100, height: 60 },
      { id: 2, parentId: 1, label: "検索対象", importance: "low", x: 400, y: 270, width: 100, height: 60 },
    ],
  })}\n`;
}

beforeEach(() => {
  resetMapStageTestRuntime();
  mockPixiInit.mockResolvedValue(undefined);
  window.localStorage.clear();
  seedMapLibrary(window.localStorage, [{ json: v3Json() }]);
});

function jsonFile(text: string): File {
  const file = new File(["{}"], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: jest.fn(() => Promise.resolve(text)),
  });
  return file;
}

function exportedJson(): string {
  mockDownloadMapJson.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  expect(mockDownloadMapJson).toHaveBeenCalledTimes(1);
  return mockDownloadMapJson.mock.lastCall![0] as string;
}

function worldPosition(): readonly unknown[] | undefined {
  return lastWorldContainer()?.position.set.mock.lastCall?.slice();
}

async function prepareSelectedSearchInput() {
  const user = userEvent.setup();
  await renderReady(<Home />);
  const stage = document.querySelector<HTMLElement>(".cursor-crosshair")!;
  mockStageBounds(stage);
  const input = screen.getByRole("combobox", { name: "ノードを検索" });
  await user.type(input, "検索");
  await user.click(screen.getByRole("option", { name: "検索対象（親: 親ノード）" }));
  act(() => {
    mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
    mockStageHandlers.pointermove?.(pointer(20, 10));
    mockStageHandlers.pointerup?.(pointer(20, 10));
  });
  input.focus();
  return input;
}

function editLowImportanceNode(label: string) {
  const stage = document.querySelector<HTMLElement>(".cursor-crosshair")!;
  fireEvent.doubleClick(stage, { clientX: 450, clientY: 300 });
  const editor = screen.getByTestId("node-label-input");
  fireEvent.change(editor, { target: { value: label } });
  fireEvent.keyDown(editor, { key: "Enter" });
}

it("検索結果から見えているノードを選択し、表示モードを変えず中央へ移動する", async () => {
  const user = userEvent.setup();
  await renderReady(<Home />);
  mockStageBounds(document.querySelector<HTMLElement>(".cursor-crosshair")!);

  await user.type(screen.getByRole("combobox", { name: "ノードを検索" }), "検索");
  await user.click(screen.getByRole("option", { name: "検索対象（親: 親ノード）" }));

  expect(screen.getByRole("button", { name: "重要度 低" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "表示 自動" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
  expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(-50, 0);
});

it("非表示の検索結果を選ぶと表示を切り替え、選択と通知を保つ", async () => {
  const user = userEvent.setup();
  await renderReady(<Home />);
  mockStageBounds(document.querySelector<HTMLElement>(".cursor-crosshair")!);
  await user.click(screen.getByRole("button", { name: "表示 高のみ" }));

  await user.type(screen.getByRole("combobox", { name: "ノードを検索" }), "検索");
  await user.click(screen.getByRole("option", { name: "検索対象（親: 親ノード、非表示）" }));

  expect(screen.getByRole("button", { name: "表示 すべて" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "重要度 低" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("operation-notices")).toHaveTextContent("表示を『すべて』に切り替えました");
  expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(-50, 0);
});

it.each([
  ["f", { key: "f" }],
  ["Delete", { key: "Delete" }],
  ["Backspace", { key: "Backspace" }],
  ["Tab", { key: "Tab" }],
  ["Ctrl+Z", { key: "z", ctrlKey: true }],
  ["Ctrl+Y", { key: "y", ctrlKey: true }],
] as const)("検索入力の%sでマップとviewportを変更しない", async (_name, keyInit) => {
  const input = await prepareSelectedSearchInput();
  const beforeJson = exportedJson();
  const beforePosition = worldPosition();

  fireEvent.keyDown(input, keyInit);

  expect(exportedJson()).toBe(beforeJson);
  expect(worldPosition()).toEqual(beforePosition);
});

it("一覧を閉じた検索入力のEnterでマップとviewportを変更しない", async () => {
  const input = await prepareSelectedSearchInput();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveAttribute("aria-expanded", "false");
  const beforeJson = exportedJson();
  const beforePosition = worldPosition();

  fireEvent.keyDown(input, { key: "Enter" });

  expect(exportedJson()).toBe(beforeJson);
  expect(worldPosition()).toEqual(beforePosition);
});

it.each(["copy", "paste"] as const)("検索入力の%sでマップとviewportを変更しない", async (eventName) => {
  const input = await prepareSelectedSearchInput();
  const beforeJson = exportedJson();
  const beforePosition = worldPosition();

  fireEvent[eventName](input);

  expect(exportedJson()).toBe(beforeJson);
  expect(worldPosition()).toEqual(beforePosition);
});

it("候補のダブルクリックでノードを追加せず履歴も作らない", async () => {
  const user = userEvent.setup();
  await renderReady(<Home />);
  const input = screen.getByRole("combobox", { name: "ノードを検索" });
  await user.type(input, "検索");

  fireEvent.doubleClick(screen.getByRole("option", { name: "検索対象（親: 親ノード）" }));

  expect(JSON.parse(exportedJson()).nodes).toHaveLength(2);
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
});

it("実編集後の非表示検索選択を履歴に積まず、Undoで候補を再計算して通知を消す", async () => {
  const user = userEvent.setup();
  await renderReady(<Home />);
  mockStageBounds(document.querySelector<HTMLElement>(".cursor-crosshair")!);
  editLowImportanceNode("Undo対象の検索語");
  await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
  await user.type(screen.getByRole("combobox", { name: "ノードを検索" }), "Undo対象");
  await user.click(screen.getByRole("option", { name: "Undo対象の検索語（親: 親ノード、非表示）" }));
  expect(screen.getByTestId("operation-notices")).toHaveTextContent("表示を『すべて』に切り替えました");

  await user.click(screen.getByRole("button", { name: "元に戻す" }));
  await user.click(screen.getByRole("combobox", { name: "ノードを検索" }));

  expect(screen.getByText("一致するノードはありません。")).toBeInTheDocument();
  expect(screen.queryByText(/表示を『すべて』に切り替えました/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
  expect(JSON.parse(exportedJson()).nodes[1].label).toBe("検索対象");
});

it("実編集後の非表示検索通知をimportで消し、同じ検索語から候補を再計算する", async () => {
  const user = userEvent.setup();
  await renderReady(<Home />);
  mockStageBounds(document.querySelector<HTMLElement>(".cursor-crosshair")!);
  editLowImportanceNode("import前の検索語");
  await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
  await user.type(screen.getByRole("combobox", { name: "ノードを検索" }), "検索語");
  await user.click(screen.getByRole("option", { name: "import前の検索語（親: 親ノード、非表示）" }));
  expect(screen.getByTestId("operation-notices")).toHaveTextContent("表示を『すべて』に切り替えました");

  const importedJson = JSON.stringify({
    version: 3,
    layoutMode: "manual",
    nodes: [{ id: 2, parentId: null, label: "import後の検索語", importance: "medium", x: 20, y: 30, width: 100, height: 60 }],
  });
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
    target: { files: [jsonFile(importedJson)] },
  });

  await waitFor(() => expect(screen.getByRole("option", { name: "import後の検索語（ルート）" })).toBeInTheDocument());
  expect(screen.queryByText(/表示を『すべて』に切り替えました/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
});

it("初期化前の検索移動要求を同じIDのJSON読み込み後に失効させる", async () => {
  let finishPixiInit!: () => void;
  mockPixiInit.mockImplementation(() => new Promise<void>((resolve) => {
    finishPixiInit = resolve;
  }));
  const user = userEvent.setup();
  await renderReady(<Home />);

  await user.type(screen.getByRole("combobox", { name: "ノードを検索" }), "検索");
  await user.click(screen.getByRole("option", { name: "検索対象（親: 親ノード）" }));

  const importedJson = JSON.stringify({
    version: 3,
    layoutMode: "manual",
    nodes: [
      { id: 2, parentId: null, label: "更新後の検索対象", importance: "medium", x: 20, y: 30, width: 100, height: 60 },
    ],
  });
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(fileInput, { target: { files: [jsonFile(importedJson)] } });

  await waitFor(() => {
    expect(screen.getByRole("option", { name: "更新後の検索対象（ルート）" })).toBeInTheDocument();
  });
  expect(screen.queryByText(/表示を『/)).not.toBeInTheDocument();

  finishPixiInit();
  await waitFor(() => expect(lastWorldContainer()).toBeDefined());
  expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(0, 0);
  expect(lastWorldContainer()?.scale.set).toHaveBeenLastCalledWith(1);
});

it("折りたたみだけで隠れた検索結果も非表示と表示し、選択で祖先を展開する", async () => {
  const user = userEvent.setup();
  await renderReady(<Home />);
  mockStageBounds(document.querySelector<HTMLElement>(".cursor-crosshair")!);
  const input = screen.getByRole("combobox", { name: "ノードを検索" });
  await user.type(input, "親ノード");
  await user.click(screen.getByRole("option", { name: "親ノード（ルート）" }));
  await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
  await user.clear(input); await user.type(input, "検索対象");
  await user.click(screen.getByRole("option", { name: "検索対象（親: 親ノード、非表示）" }));
  expect(screen.getByRole("button", { name: "表示 自動" })).toHaveAttribute("aria-pressed", "true");
  expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(-50, 0);
  expect(screen.getByTestId("operation-notices")).toHaveTextContent("祖先の枝を展開しました");
});
