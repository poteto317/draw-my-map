import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import {
  lastWorldContainer,
  mockNodePointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { ILLUSTRATED_NODE_HEIGHT, SIBLING_VERTICAL_GAP } from "@/config/shapes";
import { createJpegDataUrl } from "@/testing/jpegFixture";

// Pixiだけを差し替え、MapStage・NodeLabelEditor・useNodes・履歴・保存hookは本物を通す
jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

const mockGenerateIllustrationThumbnail = jest.fn();
jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return {
    ...actual,
    generateIllustrationThumbnail: (label: string, options: { signal?: AbortSignal }) => (
      mockGenerateIllustrationThumbnail(label, options)
    ),
  };
});

const mockDownloadMapJson = jest.fn();
jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return {
    ...actual,
    downloadMapJson: (json: string) => mockDownloadMapJson(json),
  };
});

// jsdomはcanvasの2D contextを持たないため、文字幅の測定・PNG化・ダウンロードだけを差し替える
jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));

const mockDownloadMapImage = jest.fn();
jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: (blob: Blob, fileName: string) => mockDownloadMapImage(blob, fileName),
}));

const mockRasterizeMapSvgToPng = jest.fn();
jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: (svg: string, width: number, height: number) => (
    mockRasterizeMapSvgToPng(svg, width, height)
  ),
}));

const STORAGE_KEY = "draw-my-map.map.v1";
const IMAGE = createJpegDataUrl(128, 128);
const OLD_IMAGE = "data:image/jpeg;base64,T0xE";
const SUCCESS_MESSAGE = "枝を複製しました。Fキーで選択ノードへ移動できます。";
const FAILURE_MESSAGE = "枝を複製できませんでした。";

type ExportedNode = {
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
type ExportedMap = { version: number; layoutMode: string; nodes: ExportedNode[] };

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

function v3Json(nodes: Array<Partial<ExportedNode> & { id: number }>): string {
  return `${JSON.stringify({
    version: 3,
    layoutMode: "manual",
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

// 親（画面上の中心300,200）と子（中心450,200）の2ノード
function storeParentAndChild(overrides: { parent?: Partial<ExportedNode>; child?: Partial<ExportedNode> } = {}) {
  window.localStorage.setItem(STORAGE_KEY, v3Json([
    { id: 1, label: "親", importance: "high", ...overrides.parent },
    { id: 2, parentId: 1, label: "子", importance: "low", x: 400, ...overrides.child },
  ]));
}

function jsonFile(text: string): File {
  const file = new File(["{}"], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: jest.fn(() => Promise.resolve(text)),
  });
  return file;
}

function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

async function renderPage() {
  const rendered = await renderReady(<Home />);
  mockStageBounds(stageContainer());
  return rendered;
}

function duplicateButton() {
  return screen.getByRole("button", { name: "枝を複製" });
}

function undoButton() {
  return screen.getByRole("button", { name: "元に戻す" });
}

function redoButton() {
  return screen.getByRole("button", { name: "やり直す" });
}

// 直近の描画で登録されたノードのpointerdownで選択し、同じpointerで離す（indexはnodes配列の順）
function selectNode(index: number, nodeCount: number, x = 300, y = 200) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(x, y));
    mockStageHandlers.pointerup?.(pointer(x, y));
  });
}

// ノード上のダブルクリックで、本物のNodeLabelEditorを開く
function openLabelEditor(x: number, y: number): HTMLInputElement {
  fireEvent.doubleClick(stageContainer(), { clientX: x, clientY: y });
  return screen.getByTestId("node-label-input") as HTMLInputElement;
}

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

function storedMap(): ExportedMap | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? null : JSON.parse(stored) as ExportedMap;
}

function worldPosition() {
  return lastWorldContainer()?.position.set.mock.lastCall;
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// 新しいIDは時刻を元に採番されるため、IDと親IDを配列上の位置へ置き換えて比べる。
// 位置へ置き換える前に、IDが重複していないことも確かめる
function byPosition(nodes: readonly ExportedNode[]): ExportedNode[] {
  const positionById = new Map(nodes.map((node, index) => [node.id, index]));
  expect(positionById.size).toBe(nodes.length);
  return nodes.map((node) => ({
    ...node,
    id: positionById.get(node.id)!,
    parentId: node.parentId === null ? null : positionById.get(node.parentId)!,
  }));
}

function exportedByPosition(): ExportedNode[] {
  return byPosition(exportedMap().nodes);
}

const PARENT = { id: 0, parentId: null, label: "親", importance: "high", x: 250, y: 170, width: 100, height: 60 };
const CHILD = { id: 1, parentId: 0, label: "子", importance: "low", x: 400, y: 170, width: 100, height: 60 };
// 手動配置では、マップの下端230からSIBLING_VERTICAL_GAP(40)だけ空けて、枝を100下げる
const COPIED_PARENT = { ...PARENT, id: 2, y: 270 };
const COPIED_CHILD = { ...CHILD, id: 3, parentId: 2, y: 270 };
// 画像付きの子はイラストの領域を含む高さで保存され、枝はその下端から間隔を空けて置く
const ILLUSTRATED_CHILD = { ...CHILD, height: ILLUSTRATED_NODE_HEIGHT, illustration: IMAGE };
const ILLUSTRATED_COPY_Y = 170 + ILLUSTRATED_NODE_HEIGHT + SIBLING_VERTICAL_GAP;
const ILLUSTRATED_BRANCH = [
  PARENT,
  ILLUSTRATED_CHILD,
  { ...PARENT, id: 2, y: ILLUSTRATED_COPY_Y },
  { ...ILLUSTRATED_CHILD, id: 3, parentId: 2, y: ILLUSTRATED_COPY_Y },
];

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockGenerateIllustrationThumbnail.mockReset();
  mockDownloadMapJson.mockReset();
  mockDownloadMapImage.mockReset();
  mockRasterizeMapSvgToPng.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("ページの枝の複製", () => {
  it("未選択では「枝を複製」ボタンが無効になる", async () => {
    storeParentAndChild();
    await renderPage();

    expect(duplicateButton()).toBeDisabled();
  });

  it("ボタンで親子を複製し、複製根を選択して成功通知を出し、フォーカスはボタンに残る", async () => {
    const user = userEvent.setup();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    expect(duplicateButton()).toBeEnabled();

    await user.click(duplicateButton());

    expect(exportedByPosition()).toEqual([PARENT, CHILD, COPIED_PARENT, COPIED_CHILD]);
    expect(screen.getByText(SUCCESS_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(SUCCESS_MESSAGE)).toHaveAttribute("role", "status");
    expect(screen.getByTestId("operation-notices")).toContainElement(screen.getByText(SUCCESS_MESSAGE));
    expect(document.activeElement).toBe(duplicateButton());
    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
  });

  it("ボタンにフォーカスがある状態のFキーで、選択した複製根へviewportを移す", async () => {
    const user = userEvent.setup();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    await user.click(duplicateButton());
    expect(duplicateButton()).toHaveFocus();
    const before = worldPosition();

    await user.keyboard("f");

    // 複製根の中心(300,300)を画面800x600の中央へ置く
    expect(worldPosition()).toEqual([100, 0]);
    expect(worldPosition()).not.toEqual(before);
    expect(duplicateButton()).toHaveFocus();
  });

  it("ボタン上のEnterのリピート・Tab・Deleteはノード用ショートカットへ届かない", async () => {
    const user = userEvent.setup();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    await user.click(duplicateButton());
    const button = duplicateButton();

    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    fireEvent.keyDown(button, { key: "Tab" });
    fireEvent.keyDown(button, { key: "Delete" });

    expect(exportedByPosition()).toEqual([PARENT, CHILD, COPIED_PARENT, COPIED_CHILD]);
    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
    // 選択が複製根のままなら、Fキーで複製根の中心へ移る
    button.focus();
    await user.keyboard("f");
    expect(worldPosition()).toEqual([100, 0]);
  });

  it("Undo／Redoで枝全体を往復し、成功通知を消す", async () => {
    const user = userEvent.setup();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    await user.click(duplicateButton());
    expect(screen.getByText(SUCCESS_MESSAGE)).toBeInTheDocument();

    await user.click(undoButton());
    expect(exportedByPosition()).toEqual([PARENT, CHILD]);
    expect(screen.queryByText(SUCCESS_MESSAGE)).not.toBeInTheDocument();
    expect(duplicateButton()).toBeDisabled();

    await user.click(redoButton());
    expect(exportedByPosition()).toEqual([PARENT, CHILD, COPIED_PARENT, COPIED_CHILD]);
    expect(screen.queryByText(SUCCESS_MESSAGE)).not.toBeInTheDocument();
  });
});

describe("ページの枝の複製の境界", () => {
  it("ラベル編集中にボタンを押すと、blurで確定したラベルを複製する", async () => {
    const user = userEvent.setup();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    const input = openLabelEditor(300, 200);
    await user.clear(input);
    await user.type(input, "確定前");

    await user.click(duplicateButton());

    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(exportedByPosition()).toEqual([
      { ...PARENT, label: "確定前" },
      CHILD,
      { ...COPIED_PARENT, label: "確定前" },
      COPIED_CHILD,
    ]);
  });

  it("ボタンを2回押すと2つの枝を追加し、Undo 1回で1つだけ戻る", async () => {
    const user = userEvent.setup();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);

    await user.click(duplicateButton());
    await user.click(duplicateButton());

    expect(exportedByPosition()).toEqual([
      PARENT,
      CHILD,
      COPIED_PARENT,
      COPIED_CHILD,
      { ...PARENT, id: 4, y: 370 },
      { ...CHILD, id: 5, parentId: 4, y: 370 },
    ]);

    await user.click(undoButton());
    expect(exportedByPosition()).toEqual([PARENT, CHILD, COPIED_PARENT, COPIED_CHILD]);
  });

  it("表示フィルターで子を隠していても、全子孫を複製する", async () => {
    const user = userEvent.setup();
    storeParentAndChild();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
    selectNode(0, 2);

    await user.click(duplicateButton());

    expect(exportedByPosition()).toEqual([PARENT, CHILD, COPIED_PARENT, COPIED_CHILD]);
  });

  it("ドラッグ途中に複製した後、旧ジェスチャーのpointermoveは複製後の配置を変えない", async () => {
    const user = userEvent.setup();
    storeParentAndChild();
    await renderPage();
    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(300, 200));
      mockStageHandlers.pointermove?.(pointer(340, 240));
    });
    const moved = exportedMap().nodes;
    expect(moved[0]).toMatchObject({ x: 290, y: 210 });

    await user.click(duplicateButton());
    const duplicated = exportedMap().nodes;
    expect(duplicated).toHaveLength(4);
    act(() => {
      mockStageHandlers.pointermove?.(pointer(500, 500));
      mockStageHandlers.pointerup?.(pointer(500, 500));
    });

    expect(exportedMap().nodes).toEqual(duplicated);
    await user.click(undoButton());
    expect(exportedMap().nodes).toEqual(moved);
  });

  it("生成中に複製しても、旧生成結果を複製先へ添付・表示しない", async () => {
    const user = userEvent.setup();
    const request = deferred<string>();
    mockGenerateIllustrationThumbnail.mockReturnValueOnce(request.promise);
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    await user.click(screen.getByRole("button", { name: "イラストを生成" }));
    expect(mockGenerateIllustrationThumbnail).toHaveBeenCalledWith("親", expect.anything());

    await user.click(duplicateButton());
    request.resolve(OLD_IMAGE);
    await flushPromises();

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ノードに設定" })).not.toBeInTheDocument();
    expect(exportedMap().nodes.every((node) => node.illustration === undefined)).toBe(true);
  });

  it("複製できないときは失敗通知を出し、マップ・選択・履歴を変えない", async () => {
    const user = userEvent.setup();
    // 下端からの間隔を丸めで確保できない座標
    window.localStorage.setItem(STORAGE_KEY, v3Json([{ id: 1, label: "唯一", y: 1e300 }]));
    await renderPage();
    selectNode(0, 1);
    const before = exportedMap();

    await user.click(duplicateButton());

    expect(screen.getByRole("alert")).toHaveTextContent(FAILURE_MESSAGE);
    expect(screen.queryByText(SUCCESS_MESSAGE)).not.toBeInTheDocument();
    expect(exportedMap()).toEqual(before);
    expect(undoButton()).toBeDisabled();
    expect(duplicateButton()).toBeEnabled();
    expect(screen.queryByText("ノードを選択してください")).not.toBeInTheDocument();
    expect(screen.getByTitle("唯一")).toBeInTheDocument();
  });

  it("成功通知の後の失敗した複製要求で、通知を失敗へ置き換える", async () => {
    const user = userEvent.setup();
    // 「枝」の子は上端が極端に小さく、複製先との間隔を丸めで確保できない。「上」は通常どおり複製できる
    window.localStorage.setItem(STORAGE_KEY, v3Json([
      { id: 1, label: "上" },
      { id: 2, label: "枝", x: 400 },
      { id: 3, parentId: 2, label: "遠い子", x: 550, y: -1e308 },
    ]));
    await renderPage();
    selectNode(0, 3);
    await user.click(duplicateButton());
    expect(screen.getByText(SUCCESS_MESSAGE)).toBeInTheDocument();
    expect(exportedMap().nodes).toHaveLength(4);

    selectNode(1, 4, 450, 200);
    await user.click(duplicateButton());

    expect(screen.queryByText(SUCCESS_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(FAILURE_MESSAGE);
    expect(exportedMap().nodes).toHaveLength(4);
  });

  it("複製した枝をV3としてlocalStorageへ1回保存し、再表示後も維持する", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    storeParentAndChild({ child: { illustration: IMAGE, height: ILLUSTRATED_NODE_HEIGHT } });
    const { unmount } = await renderPage();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    selectNode(0, 2);

    await user.click(duplicateButton());
    act(() => {
      jest.advanceTimersByTime(300);
    });

    const writes = setItem.mock.calls.filter(([key]) => key === STORAGE_KEY);
    expect(writes).toHaveLength(1);
    const written = JSON.parse(String(writes[0][1])) as ExportedMap;
    expect(Object.keys(written).sort()).toEqual(["layoutMode", "nodes", "version"]);
    expect(written).toMatchObject({ version: 3, layoutMode: "manual" });
    expect(byPosition(written.nodes)).toEqual(ILLUSTRATED_BRANCH);
    expect(storedMap()).toEqual(written);

    unmount();
    resetMapStageTestRuntime();
    await renderPage();
    expect(exportedMap().nodes).toEqual(written.nodes);
  });

  it("複製した枝をJSONへ書き出し、読み込み後も親子関係と画像を維持する", async () => {
    const user = userEvent.setup();
    storeParentAndChild({ child: { illustration: IMAGE, height: ILLUSTRATED_NODE_HEIGHT } });
    const { unmount } = await renderPage();
    selectNode(0, 2);
    await user.click(duplicateButton());
    const exported = exportedMap();
    const json = mockDownloadMapJson.mock.lastCall![0] as string;
    expect(exported).toMatchObject({ version: 3, layoutMode: "manual" });
    expect(byPosition(exported.nodes)).toEqual(ILLUSTRATED_BRANCH);

    unmount();
    resetMapStageTestRuntime();
    window.localStorage.clear();
    const { container } = await renderPage();
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, jsonFile(json));

    await waitFor(() => expect(screen.getByText("マップを読み込みました。")).toBeInTheDocument());
    expect(exportedMap()).toEqual(exported);
  });
});
