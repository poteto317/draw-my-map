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

// Pixiだけを差し替え、MapStage・useMapClipboardEvents・codec・useNodes・履歴・保存hookは本物を通す
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
const COPY_MESSAGE = "枝をコピーしました。";
const PASTE_MESSAGE = "枝を貼り付けました。Fキーで選択ノードへ移動できます。見えない場合は表示を『すべて』に切り替えてください。";
const INVALID_MESSAGE = "貼り付ける枝データが無効です。";
const DUPLICATE_MESSAGE = "枝を複製しました。Fキーで選択ノードへ移動できます。";
const HINT = "枝をコピー: Ctrl/Cmd+C ／ 貼り付け: Ctrl/Cmd+V（新しいルートとして追加）";

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

// OSのクリップボードの代わり。copyで書いた内容をpasteで読める（別タブ間の受け渡しに相当）
function createClipboard(initialText = "") {
  const store = new Map<string, string>([["text/plain", initialText]]);
  return {
    store,
    data: {
      setData: jest.fn((format: string, text: string) => {
        store.set(format, text);
      }),
      getData: jest.fn((format: string) => store.get(format) ?? ""),
    },
  };
}
type Clipboard = ReturnType<typeof createClipboard>;

// 実イベントの経路（window の copy/paste リスナー）へ届けるため、DOM要素から発火する
function copy(clipboard: Clipboard, target: Element = document.activeElement ?? document.body): boolean {
  return fireEvent.copy(target, { clipboardData: clipboard.data });
}

function paste(clipboard: Clipboard, target: Element = document.activeElement ?? document.body): boolean {
  return fireEvent.paste(target, { clipboardData: clipboard.data });
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

function filterButton(label: string) {
  return screen.getByRole("button", { name: `表示 ${label}` });
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

function clipboardNodes(clipboard: Clipboard): ExportedNode[] {
  return (JSON.parse(clipboard.store.get("text/plain")!) as { nodes: ExportedNode[] }).nodes;
}

const PARENT = { id: 0, parentId: null, label: "親", importance: "high", x: 250, y: 170, width: 100, height: 60 };
const CHILD = { id: 1, parentId: 0, label: "子", importance: "low", x: 400, y: 170, width: 100, height: 60 };
// 手動配置では、マップの下端230からSIBLING_VERTICAL_GAP(40)だけ空けて、枝を100下げる
const PASTED_PARENT = { ...PARENT, id: 2, y: 270 };
const PASTED_CHILD = { ...CHILD, id: 3, parentId: 2, y: 270 };
// 画像付きの子はイラストの領域を含む高さで保存され、枝はその下端から間隔を空けて置く
const ILLUSTRATED_CHILD = { ...CHILD, height: ILLUSTRATED_NODE_HEIGHT, illustration: IMAGE };
const ILLUSTRATED_PASTE_Y = 170 + ILLUSTRATED_NODE_HEIGHT + SIBLING_VERTICAL_GAP;
const ILLUSTRATED_BRANCH = [
  PARENT,
  ILLUSTRATED_CHILD,
  { ...PARENT, id: 2, y: ILLUSTRATED_PASTE_Y },
  { ...ILLUSTRATED_CHILD, id: 3, parentId: 2, y: ILLUSTRATED_PASTE_Y },
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
  window.getSelection()?.removeAllRanges();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("ページの枝のコピーと貼り付け", () => {
  it("ヘッダーにキーボード操作の常設案内を表示する", async () => {
    await renderPage();

    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("親子をコピーして新しいルートとして貼り付け、Undo／Redoで1操作として往復する", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    const viewportBefore = worldPosition();

    expect(copy(clipboard)).toBe(false);
    expect(screen.getByText(COPY_MESSAGE)).toHaveAttribute("role", "status");
    expect(byPosition(clipboardNodes(clipboard))).toEqual([PARENT, CHILD]);
    expect(exportedByPosition()).toEqual([PARENT, CHILD]);
    expect(undoButton()).toBeDisabled();

    expect(paste(clipboard)).toBe(false);
    expect(screen.getByText(PASTE_MESSAGE)).toHaveAttribute("role", "status");
    expect(screen.queryByText(COPY_MESSAGE)).not.toBeInTheDocument();
    const pasted = exportedMap().nodes;
    expect(byPosition(pasted)).toEqual([PARENT, CHILD, PASTED_PARENT, PASTED_CHILD]);
    expect(worldPosition()).toEqual(viewportBefore);
    // 新しい根を選択している。Fキーで、貼り付けた根の中心(300,300)を画面800x600の中央へ置く
    await user.keyboard("f");
    expect(worldPosition()).toEqual([100, 0]);

    await user.click(undoButton());
    expect(exportedByPosition()).toEqual([PARENT, CHILD]);
    expect(screen.queryByText(PASTE_MESSAGE)).not.toBeInTheDocument();

    await user.click(redoButton());
    expect(exportedMap().nodes).toEqual(pasted);
    expect(screen.queryByText(PASTE_MESSAGE)).not.toBeInTheDocument();
  });

  it("コピー後にコピー元を変えても、コピーした時点の枝を貼り付ける", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    copy(clipboard);

    const input = openLabelEditor(300, 200);
    await user.clear(input);
    await user.type(input, "変更後{Enter}");
    expect(exportedByPosition()[0].label).toBe("変更後");

    paste(clipboard, document.body);

    expect(exportedByPosition()).toEqual([
      { ...PARENT, label: "変更後" },
      CHILD,
      PASTED_PARENT,
      PASTED_CHILD,
    ]);
  });

  it("別のマップへ貼り付けると、コピー元と衝突しないIDで追加する", async () => {
    const clipboard = createClipboard();
    storeParentAndChild();
    const { unmount } = await renderPage();
    selectNode(0, 2);
    copy(clipboard);

    unmount();
    resetMapStageTestRuntime();
    // 同じIDを持つ別のマップ
    window.localStorage.setItem(STORAGE_KEY, v3Json([
      { id: 1, label: "別1" },
      { id: 2, label: "別2", x: 400 },
    ]));
    await renderPage();
    paste(clipboard, document.body);

    expect(exportedByPosition()).toEqual([
      { ...PARENT, label: "別1", importance: "medium" },
      { ...PARENT, id: 1, label: "別2", importance: "medium", x: 400 },
      PASTED_PARENT,
      PASTED_CHILD,
    ]);
  });

  it("表示フィルターで隠れた子孫も含めてコピーし、表示フィルターを変えない", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    await user.click(filterButton("高のみ"));
    selectNode(0, 2);

    copy(clipboard, document.body);
    paste(clipboard, document.body);

    expect(exportedByPosition()).toEqual([PARENT, CHILD, PASTED_PARENT, PASTED_CHILD]);
    expect(filterButton("高のみ")).toHaveAttribute("aria-pressed", "true");
  });

  it("重要度の低い枝が非表示で貼り付けられると、選択を解除して表示設定を案内し、viewportを動かさない", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    // 子（重要度：低）を選んでコピーし、表示を高のみにする
    selectNode(1, 2, 450, 200);
    copy(clipboard, document.body);
    await user.click(filterButton("高のみ"));
    expect(screen.getByText("ノードを選択してください")).toBeInTheDocument();
    const viewportBefore = worldPosition();

    paste(clipboard, document.body);

    expect(exportedByPosition()).toEqual([
      PARENT,
      CHILD,
      { ...CHILD, id: 2, parentId: null, y: 270 },
    ]);
    expect(screen.getByText("ノードを選択してください")).toBeInTheDocument();
    expect(duplicateButton()).toBeDisabled();
    expect(screen.getByText(PASTE_MESSAGE)).toHaveAttribute("role", "status");
    expect(filterButton("高のみ")).toHaveAttribute("aria-pressed", "true");
    expect(worldPosition()).toEqual(viewportBefore);
  });

  it("連続した paste では、そのつど1つずつ枝を追加し、Undo 1回で1つだけ戻る", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    copy(clipboard);

    paste(clipboard);
    paste(clipboard);

    expect(exportedByPosition()).toEqual([
      PARENT,
      CHILD,
      PASTED_PARENT,
      PASTED_CHILD,
      { ...PARENT, id: 4, y: 370 },
      { ...CHILD, id: 5, parentId: 4, y: 370 },
    ]);
    await user.click(undoButton());
    expect(exportedByPosition()).toEqual([PARENT, CHILD, PASTED_PARENT, PASTED_CHILD]);
  });
});

describe("ページの枝のコピーと貼り付けの通知", () => {
  it("複製の通知とは別の枠に表示し、互いに消さない", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    await user.click(duplicateButton());
    expect(screen.getByText(DUPLICATE_MESSAGE)).toBeInTheDocument();

    copy(clipboard);
    expect(screen.getByText(DUPLICATE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(COPY_MESSAGE)).toBeInTheDocument();

    await user.click(duplicateButton());
    expect(screen.getByText(DUPLICATE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(COPY_MESSAGE)).toBeInTheDocument();
    const notices = screen.getByTestId("operation-notices");
    expect(notices).toContainElement(screen.getByText(DUPLICATE_MESSAGE));
    expect(notices).toContainElement(screen.getByText(COPY_MESSAGE));
  });

  it("次の対象要求で通知を置き換え、対象外のイベントでは通知を変えない", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    copy(clipboard);
    expect(screen.getByText(COPY_MESSAGE)).toBeInTheDocument();

    const before = exportedMap();
    const invalid = createClipboard("ただの文章");
    expect(paste(invalid, document.body)).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent(INVALID_MESSAGE);
    expect(screen.queryByText(COPY_MESSAGE)).not.toBeInTheDocument();
    expect(exportedMap()).toEqual(before);
    expect(undoButton()).toBeDisabled();

    // ラベル入力欄への貼り付けは対象外で、ブラウザの既定動作に任せる
    const input = openLabelEditor(300, 200);
    await user.click(input);
    expect(paste(clipboard, input)).toBe(true);
    expect(copy(clipboard, input)).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent(INVALID_MESSAGE);
    expect(clipboard.data.getData).not.toHaveBeenCalled();
  });

  it("JSONの読み込みで通知を消す", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    const { container } = await renderPage();
    selectNode(0, 2);
    copy(clipboard);
    expect(screen.getByText(COPY_MESSAGE)).toBeInTheDocument();

    await user.upload(
      container.querySelector<HTMLInputElement>('input[type="file"]')!,
      jsonFile(v3Json([{ id: 5, label: "読み込み" }])),
    );

    await waitFor(() => expect(screen.getByText("マップを読み込みました。")).toBeInTheDocument());
    expect(screen.queryByText(COPY_MESSAGE)).not.toBeInTheDocument();
  });

  it("Undoで、履歴に残らないコピーの通知も消す", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    await user.click(duplicateButton());
    copy(clipboard);
    expect(screen.getByText(COPY_MESSAGE)).toBeInTheDocument();

    await user.click(undoButton());

    expect(screen.queryByText(COPY_MESSAGE)).not.toBeInTheDocument();
  });
});

describe("ページの枝のコピーと貼り付けの境界", () => {
  it("ラベル入力中のコピー・貼り付けはマップを変えない", async () => {
    const user = userEvent.setup();
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    copy(clipboard);
    const before = exportedMap();
    clipboard.data.setData.mockClear();

    const input = openLabelEditor(300, 200);
    await user.click(input);
    expect(copy(clipboard, input)).toBe(true);
    expect(paste(clipboard, input)).toBe(true);
    // 発火元が入力欄の外でも、ラベル編集中（focusは入力欄）なら対象外
    expect(paste(clipboard, document.body)).toBe(true);

    expect(clipboard.data.setData).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(exportedMap()).toEqual(before);
  });

  it("ドラッグ中のコピー・貼り付けはマップを変えず、中間座標を取り込まない", async () => {
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    copy(clipboard);
    const copied = clipboard.store.get("text/plain");
    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(300, 200));
      mockStageHandlers.pointermove?.(pointer(340, 240));
    });
    const moved = exportedMap();

    expect(copy(clipboard, document.body)).toBe(true);
    expect(paste(clipboard, document.body)).toBe(true);

    expect(clipboard.store.get("text/plain")).toBe(copied);
    expect(exportedMap()).toEqual(moved);
    act(() => {
      mockStageHandlers.pointerup?.(pointer(340, 240));
    });
    expect(exportedMap().nodes).toHaveLength(2);
  });

  it("DOMの文字選択があるときはブラウザに任せる", async () => {
    const clipboard = createClipboard();
    storeParentAndChild();
    await renderPage();
    selectNode(0, 2);
    const range = document.createRange();
    range.selectNodeContents(screen.getByText(HINT));
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(window.getSelection()?.isCollapsed).toBe(false);

    expect(copy(clipboard, document.body)).toBe(true);
    expect(paste(clipboard, document.body)).toBe(true);

    expect(clipboard.data.setData).not.toHaveBeenCalled();
    expect(exportedMap().nodes).toHaveLength(2);
    expect(screen.queryByText(COPY_MESSAGE)).not.toBeInTheDocument();
  });
});

describe("ページの貼り付けた枝の保存", () => {
  it("貼り付けた枝をV3としてlocalStorageへ1回保存し、再表示後も維持する", async () => {
    jest.useFakeTimers();
    const clipboard = createClipboard();
    storeParentAndChild({ child: { illustration: IMAGE, height: ILLUSTRATED_NODE_HEIGHT } });
    const { unmount } = await renderPage();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    selectNode(0, 2);

    copy(clipboard);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    // コピーはマップを変えないため保存しない
    expect(setItem.mock.calls.filter(([key]) => key === STORAGE_KEY)).toHaveLength(0);

    paste(clipboard);
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

  it("貼り付けた枝をJSONへ書き出し、親子関係と画像を維持する", async () => {
    const clipboard = createClipboard();
    storeParentAndChild({ child: { illustration: IMAGE, height: ILLUSTRATED_NODE_HEIGHT } });
    await renderPage();
    selectNode(0, 2);
    copy(clipboard);
    paste(clipboard);

    const exported = exportedMap();

    expect(exported).toMatchObject({ version: 3, layoutMode: "manual" });
    expect(byPosition(exported.nodes)).toEqual(ILLUSTRATED_BRANCH);
  });
});
