import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import {
  mockNodePointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { readActiveMapJson, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から MapEditor・ヘッダー・
// MapStage のショートカット・useNodes・履歴・保存までは本物を通す
jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

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
jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));

jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: jest.fn(),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

const ROOT_MOVED_UP_MESSAGE = "枝を上へ移動しました（見えているルートの3件中1番目）。";
const ROOT_MOVED_DOWN_MESSAGE = "枝を下へ移動しました（見えているルートの3件中3番目）。";
const ROOT_MOVED_TO_MIDDLE_MESSAGE = "枝を下へ移動しました（見えているルートの3件中2番目）。";
const ROOT_BOTTOM_EDGE_MESSAGE = "これ以上下へ移動できません（見えているルートの末尾です）。";
const ROOT_TOP_EDGE_MESSAGE = "これ以上上へ移動できません（見えているルートの先頭です）。";
const HIDDEN_SKIPPED_MESSAGE = "枝を上へ移動しました（見えている兄弟の2件中1番目）。";
const HIDDEN_BEYOND_MESSAGE = "これ以上下へ移動できません（見えている兄弟の末尾です）。"
  + "隠れている兄弟と入れ替えるには、表示を『すべて』に切り替えてください。";

type ExportedNode = {
  id: number;
  parentId: number | null;
  label: string;
  importance: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

// 縦に並んだ3つのルート。id 2 の中心は画面上の (300, 230)
function storeThreeRoots() {
  seedMapLibrary(window.localStorage, [{ json: v3Json([
    { id: 1, label: "一", y: 100 },
    { id: 2, label: "二", y: 200 },
    { id: 3, label: "三", y: 300 },
  ]) }]);
}

// 親 R の子 A・L・C。L だけ重要度が低く、「高のみ」で隠れる
function storeHiddenSibling() {
  seedMapLibrary(window.localStorage, [{ json: v3Json([
    { id: 1, label: "R", importance: "high", y: 200 },
    { id: 2, parentId: 1, label: "A", importance: "high", x: 400, y: 100 },
    { id: 3, parentId: 1, label: "L", importance: "low", x: 400, y: 200 },
    { id: 4, parentId: 1, label: "C", importance: "high", x: 400, y: 300 },
  ]) }]);
}

function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

async function renderPage() {
  const rendered = await renderReady(<Home />);
  mockStageBounds(stageContainer());
  return rendered;
}

function upButton() {
  return within(screen.getByRole("banner")).getByRole("button", { name: "枝を上へ移動" });
}

function downButton() {
  return within(screen.getByRole("banner")).getByRole("button", { name: "枝を下へ移動" });
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

function pressAlt(key: "ArrowUp" | "ArrowDown", target: Element = document.body, init: { shiftKey?: boolean } = {}) {
  fireEvent.keyDown(target, { key, altKey: true, ...init });
}

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

function exportedIds(): number[] {
  return exportedMap().nodes.map((node) => node.id);
}

function exportedPositions(): Array<[number, number, number]> {
  return exportedMap().nodes.map((node) => [node.id, node.x, node.y]);
}

function storedMap(): ExportedMap | null {
  const stored = readActiveMapJson(window.localStorage);
  return stored === null ? null : JSON.parse(stored) as ExportedMap;
}

// 300ms の自動保存を待ち、保存された本体の nodes の ID の並びを確かめる
async function expectStoredIds(ids: number[]) {
  await waitFor(() => expect(storedMap()?.nodes.map((node) => node.id)).toEqual(ids), { timeout: 3000 });
}

function noticeBar() {
  return screen.getByTestId("operation-notices");
}

const MOVED_UP_POSITIONS: Array<[number, number, number]> = [[2, 250, 100], [1, 250, 200], [3, 250, 300]];
const ORIGINAL_POSITIONS: Array<[number, number, number]> = [[1, 250, 100], [2, 250, 200], [3, 250, 300]];

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ページの兄弟の並べ替え（ボタン）", () => {
  it("「上へ」で真ん中のルートを先頭へ移し、縦位置を入れ替えて通知し、選択を保つ", async () => {
    const user = userEvent.setup();
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);

    await user.click(upButton());

    expect(exportedPositions()).toEqual(MOVED_UP_POSITIONS);
    await expectStoredIds([2, 1, 3]);
    expect(storedMap()!.nodes.map((node) => [node.id, node.x, node.y])).toEqual(MOVED_UP_POSITIONS);
    expect(within(noticeBar()).getByText(ROOT_MOVED_UP_MESSAGE)).toHaveAttribute("role", "status");
    // 選択は id 2 のままで、先頭に着いたので「上へ」だけ無効
    expect(upButton()).toBeDisabled();
    expect(downButton()).toBeEnabled();
  });

  it("「下へ」で真ん中のルートを末尾へ移す", async () => {
    const user = userEvent.setup();
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);

    await user.click(downButton());

    expect(exportedPositions()).toEqual([[1, 250, 100], [3, 250, 200], [2, 250, 300]]);
    expect(screen.getByText(ROOT_MOVED_DOWN_MESSAGE)).toBeInTheDocument();
    expect(upButton()).toBeEnabled();
    expect(downButton()).toBeDisabled();
  });

  it("1回の「元に戻す」で元の並びと位置へ戻して通知を消し、「やり直す」で並べ替えた直後に戻す", async () => {
    const user = userEvent.setup();
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);
    await user.click(upButton());

    await user.click(undoButton());
    expect(exportedPositions()).toEqual(ORIGINAL_POSITIONS);
    expect(screen.queryByText(ROOT_MOVED_UP_MESSAGE)).not.toBeInTheDocument();
    expect(undoButton()).toBeDisabled();

    await user.click(redoButton());
    expect(exportedPositions()).toEqual(MOVED_UP_POSITIONS);
    await expectStoredIds([2, 1, 3]);
  });

  it("先頭では「上へ」が無効・「下へ」が有効、末尾では「上へ」が有効・「下へ」が無効になる", async () => {
    storeThreeRoots();
    await renderPage();
    expect(upButton()).toBeDisabled();
    expect(downButton()).toBeDisabled();

    selectNode(0, 3, 300, 130);
    expect(upButton()).toBeDisabled();
    expect(downButton()).toBeEnabled();

    selectNode(2, 3, 300, 330);
    expect(upButton()).toBeEnabled();
    expect(downButton()).toBeDisabled();
  });

  it("無効の「上へ」をクリックしても並びを変えず、通知も出さない", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(0, 3, 300, 130);

    fireEvent.click(upButton());

    expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
    expect(exportedIds()).toEqual([1, 2, 3]);
  });
});

describe("ページの兄弟の並べ替え（ショートカット）", () => {
  it("Alt+↑ を body に送ると、ボタンと同じく先頭へ移す", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);

    pressAlt("ArrowUp");

    expect(exportedPositions()).toEqual(MOVED_UP_POSITIONS);
    expect(screen.getByText(ROOT_MOVED_UP_MESSAGE)).toBeInTheDocument();
    expect(upButton()).toBeDisabled();
    await expectStoredIds([2, 1, 3]);
  });

  it("Alt+↓ を body に送ると、末尾へ移す", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);

    pressAlt("ArrowDown");

    expect(exportedIds()).toEqual([1, 3, 2]);
    await expectStoredIds([1, 3, 2]);
  });

  it("ラベル編集中の入力欄への Alt+↑ では並べ替えない", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);
    fireEvent.doubleClick(stageContainer(), { clientX: 300, clientY: 230 });
    const input = screen.getByTestId("node-label-input");

    pressAlt("ArrowUp", input);

    expect(screen.getByTestId("node-label-input")).toBeInTheDocument();
    expect(exportedIds()).toEqual([1, 2, 3]);
    expect(screen.queryByText(ROOT_MOVED_UP_MESSAGE)).not.toBeInTheDocument();
  });

  it("検索の入力欄への Alt+↑ では並べ替えない", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);
    const search = screen.getByRole("combobox", { name: "ノードを検索" });
    search.focus();

    pressAlt("ArrowUp", search);

    expect(exportedIds()).toEqual([1, 2, 3]);
    expect(screen.queryByText(ROOT_MOVED_UP_MESSAGE)).not.toBeInTheDocument();
  });

  it("Alt+Shift+↑ では並べ替えない", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);

    pressAlt("ArrowUp", document.body, { shiftKey: true });

    expect(exportedIds()).toEqual([1, 2, 3]);
    expect(screen.queryByText(ROOT_MOVED_UP_MESSAGE)).not.toBeInTheDocument();
  });

  it("先頭で Alt+↑ を押すと端の通知を出し、並びを変えない", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(0, 3, 300, 130);

    pressAlt("ArrowUp");

    expect(within(noticeBar()).getByText(ROOT_TOP_EDGE_MESSAGE)).toHaveAttribute("role", "status");
    expect(exportedIds()).toEqual([1, 2, 3]);
    expect(undoButton()).toBeDisabled();
  });

  it("「上へ」を押した後、フォーカスがボタンにあるまま Alt+↓ を押すと並べ替えて通知する", async () => {
    const user = userEvent.setup();
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);
    await user.click(upButton());
    expect(exportedIds()).toEqual([2, 1, 3]);
    // 先頭に着いて「上へ」が無効になり、フォーカスは「下へ」へ引き継がれている
    expect(downButton()).toHaveFocus();

    pressAlt("ArrowDown", document.activeElement!);

    expect(exportedIds()).toEqual([1, 2, 3]);
    expect(within(noticeBar()).getByText(ROOT_MOVED_TO_MIDDLE_MESSAGE)).toHaveAttribute("role", "status");
    expect(downButton()).toHaveFocus();
    await expectStoredIds([1, 2, 3]);
  });

  it("「下へ」にフォーカスがあるときの Alt+↓ は1回だけ動かし、押し続けも受け付け、端では通知する", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(0, 3, 300, 130);
    downButton().focus();

    const notPrevented = fireEvent.keyDown(downButton(), { key: "ArrowDown", altKey: true });

    // ボタンとwindowで二重に動けば [2, 3, 1] になる
    expect(notPrevented).toBe(false);
    expect(exportedIds()).toEqual([2, 1, 3]);
    expect(screen.getByText(ROOT_MOVED_TO_MIDDLE_MESSAGE)).toBeInTheDocument();

    fireEvent.keyDown(downButton(), { key: "ArrowDown", altKey: true, repeat: true });
    expect(exportedIds()).toEqual([2, 3, 1]);
    // 末尾に着いて「下へ」が無効になり、フォーカスは「上へ」へ移る。そこからの Alt+↓ は端の通知になる
    expect(upButton()).toHaveFocus();

    fireEvent.keyDown(upButton(), { key: "ArrowDown", altKey: true, repeat: true });
    expect(within(noticeBar()).getByText(ROOT_BOTTOM_EDGE_MESSAGE)).toHaveAttribute("role", "status");
    expect(exportedIds()).toEqual([2, 3, 1]);
  });

  it("「上へ」「下へ」以外のヘッダーのボタンにフォーカスがあるときの Alt+↑ では並べ替えない", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);
    const otherButton = screen.getByRole("button", { name: "JSON書き出し" });
    otherButton.focus();

    pressAlt("ArrowUp", otherButton);

    expect(screen.queryByText(ROOT_MOVED_UP_MESSAGE)).not.toBeInTheDocument();
    expect(exportedIds()).toEqual([1, 2, 3]);
  });

  it("箇条書きのダイアログを開いている間は、body への Alt+↑ で並べ替えない", async () => {
    const user = userEvent.setup();
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);
    await user.click(within(screen.getByRole("banner")).getByRole("button", { name: "箇条書きから追加" }));
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    pressAlt("ArrowUp");

    expect(exportedIds()).toEqual([1, 2, 3]);
    expect(screen.queryByText(ROOT_MOVED_UP_MESSAGE)).not.toBeInTheDocument();
  });
  it("マップ一覧のダイアログを開いている間は、body への Alt+↑ で並べ替えない", async () => {
    const user = userEvent.setup();
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);
    await user.click(within(screen.getByRole("banner")).getByRole("button", { name: "マップ一覧" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement));
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    pressAlt("ArrowUp");

    expect(exportedIds()).toEqual([1, 2, 3]);
    expect(screen.queryByText(ROOT_MOVED_UP_MESSAGE)).not.toBeInTheDocument();
  });
});

describe("ページの兄弟の並べ替え（隠れた兄弟）", () => {
  it("「高のみ」で隠れた兄弟を飛び越え、一緒に動かし、全件残す", async () => {
    const user = userEvent.setup();
    storeHiddenSibling();
    await renderPage();
    selectNode(3, 4, 450, 330);
    await user.click(screen.getByRole("button", { name: "表示 高のみ" }));

    await user.click(upButton());

    expect(exportedPositions()).toEqual([[1, 250, 200], [4, 400, 100], [2, 400, 200], [3, 400, 300]]);
    expect(screen.getByText(HIDDEN_SKIPPED_MESSAGE)).toBeInTheDocument();
    await expectStoredIds([1, 4, 2, 3]);

    pressAlt("ArrowDown");
    expect(exportedIds()).toEqual([1, 2, 4, 3]);

    pressAlt("ArrowDown");
    expect(screen.getByText(HIDDEN_BEYOND_MESSAGE)).toBeInTheDocument();
    const nodes = exportedMap().nodes;
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 4, 3]);
    // 隠れた L は消えずに残る
    expect(nodes.filter((node) => node.label === "L")).toEqual([
      expect.objectContaining({ id: 3, parentId: 1, importance: "low" }),
    ]);
    await expectStoredIds([1, 2, 4, 3]);
  });
});

describe("ページの兄弟の並べ替え（保存と書き出し）", () => {
  it("並べ替えた順を自動保存とJSON書き出しの nodes の順に反映し、形式を変えない", async () => {
    const user = userEvent.setup();
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3);

    await user.click(upButton());

    await expectStoredIds([2, 1, 3]);
    const stored = storedMap()!;
    expect(Object.keys(stored).sort()).toEqual(["layoutMode", "nodes", "version"]);
    expect(stored).toMatchObject({ version: 3, layoutMode: "manual" });
    const exported = exportedMap();
    expect(exported).toMatchObject({ version: 3, layoutMode: "manual" });
    expect(exported.nodes).toEqual(stored.nodes);
  });
});
