import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import {
  mockContainers,
  mockNodePointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { readActiveMapJson, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から MapEditor・ヘッダー・
// MapStage のショートカット・useNodes・折りたたみ・履歴・保存までは本物を通す
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

const INDENTED_UNDER_A_MESSAGE = "枝の階層を下げました（「A」の子、第3階層）。";
const OUTDENTED_UNDER_R_MESSAGE = "枝の階層を上げました（「R」の子、第2階層）。";
const OUTDENTED_TO_ROOT_MESSAGE = "枝の階層を上げました（ルート、第1階層）。";
const INDENT_FAILED_MESSAGE = "枝の階層を変更できませんでした。";
const OUTDENT_ROOT_EDGE_MESSAGE = "これ以上階層を上げられません（ルートです）。";
const INDENT_EDGE_MESSAGE = "これ以上階層を下げられません（見えている直前の兄弟がありません）。";
const INDENT_HIDDEN_EDGE_MESSAGE = INDENT_EDGE_MESSAGE
  + "隠れている兄弟の子にするには、表示を『すべて』に切り替えてください。";
const B_MOVED_UP_MESSAGE = "枝を上へ移動しました（見えている兄弟の2件中1番目）。";

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

function v3Json(
  nodes: Array<Partial<ExportedNode> & { id: number }>,
  layoutMode: "manual" | "auto" = "manual",
): string {
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

// R の子 A・B。中心は R (50, 130)、A (270, 30)、B (270, 230)
const BASIC_NODES: Array<Partial<ExportedNode> & { id: number }> = [
  { id: 1, label: "R", x: 0, y: 100 },
  { id: 2, parentId: 1, label: "A", x: 220, y: 0 },
  { id: 3, parentId: 1, label: "B", x: 220, y: 200 },
];

function storeBasicMap() {
  seedMapLibrary(window.localStorage, [{ json: v3Json(BASIC_NODES) }]);
}

// 基本のマップの A に子 A1 を足す。A を閉じると A1 が隠れる
function storeCollapsibleMap(a1Y = 0) {
  seedMapLibrary(window.localStorage, [{ json: v3Json([
    BASIC_NODES[0],
    BASIC_NODES[1],
    { id: 5, parentId: 2, label: "A1", x: 440, y: a1Y },
    BASIC_NODES[2],
  ]) }]);
}

// 縦に並んだ3つのルート。id 2 の中心は画面上の (300, 230)
function storeThreeRoots() {
  seedMapLibrary(window.localStorage, [{ json: v3Json([
    { id: 1, label: "一", y: 100 },
    { id: 2, label: "二", y: 200 },
    { id: 3, label: "三", y: 300 },
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

function headerButton(name: string) {
  return within(screen.getByRole("banner")).getByRole("button", { name });
}

function outdentButton() {
  return headerButton("枝の階層を上げる");
}

function indentButton() {
  return headerButton("枝の階層を下げる");
}

function undoButton() {
  return screen.getByRole("button", { name: "元に戻す" });
}

function redoButton() {
  return screen.getByRole("button", { name: "やり直す" });
}

// 直近の描画で登録されたノードのpointerdownで選択し、同じpointerで離す（indexは nodes 配列の順（折りたたみや表示レベルで隠れたノードも数える））
function selectNode(index: number, nodeCount: number, x: number, y: number) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(x, y));
    mockStageHandlers.pointerup?.(pointer(x, y));
  });
}

function selectB() {
  selectNode(2, 3, 270, 230);
}

// 折りたたみで隠れたノードも描画のコンテナとハンドラは登録されるので、R・A・A1・B の4つで数える
function selectA() {
  selectNode(1, 4, 270, 30);
}

function selectCollapsibleB() {
  selectNode(3, 4, 270, 230);
}

// R・A・A1・B のコンテナが見えている（操作できる）か。順は nodes 配列の順
function collapsibleMapVisibility(): boolean[] {
  return mockContainers.slice(-4).map((container) => container.eventMode === "static");
}

function pressAlt(
  key: "ArrowLeft" | "ArrowRight" | "ArrowUp",
  target: Element = document.body,
  init: { shiftKey?: boolean } = {},
) {
  return fireEvent.keyDown(target, { key, altKey: true, ...init });
}

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

function exportedNode(id: number): ExportedNode | undefined {
  return exportedMap().nodes.find((node) => node.id === id);
}

function storedMap(): ExportedMap | null {
  const stored = readActiveMapJson(window.localStorage);
  return stored === null ? null : JSON.parse(stored) as ExportedMap;
}

// 300ms の自動保存を待ち、保存された本体の nodes の [id, parentId] の並びを確かめる
async function expectStoredParents(parents: Array<[number, number | null]>) {
  await waitFor(() => (
    expect(storedMap()?.nodes.map((node) => [node.id, node.parentId])).toEqual(parents)
  ), { timeout: 3000 });
}

function storedNode(id: number): ExportedNode | undefined {
  return storedMap()?.nodes.find((node) => node.id === id);
}

function noticeBar() {
  return screen.getByTestId("operation-notices");
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ページの階層の上げ下げ（ボタン）", () => {
  it("「階層を下げる」で直前の兄弟の子にし、「階層を上げる」で元の親の直後へ戻す", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    selectB();

    await user.click(indentButton());

    await expectStoredParents([[1, null], [2, 1], [3, 2]]);
    expect(storedNode(3)).toMatchObject({ x: 440, y: 0 });
    expect(within(noticeBar()).getByText(INDENTED_UNDER_A_MESSAGE)).toHaveAttribute("role", "status");
    // 選択は B のままで、一人っ子になったので「下げる」だけ無効
    expect(indentButton()).toBeDisabled();
    expect(outdentButton()).toBeEnabled();
    // JSON 書き出しの nodes の順も保存と同じ
    expect(exportedMap().nodes).toEqual(storedMap()!.nodes);

    await user.click(outdentButton());

    await expectStoredParents([[1, null], [2, 1], [3, 1]]);
    expect(storedNode(3)).toMatchObject({ x: 220, y: 100 });
    expect(within(noticeBar()).getByText(OUTDENTED_UNDER_R_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(INDENTED_UNDER_A_MESSAGE)).not.toBeInTheDocument();
  });

  it("1回の「元に戻す」で元の親と位置へ戻して通知を消し、「やり直す」で下げた直後に戻す", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    selectB();
    await user.click(indentButton());

    await user.click(undoButton());
    expect(exportedNode(3)).toMatchObject({ parentId: 1, x: 220, y: 200 });
    expect(screen.queryByText(INDENTED_UNDER_A_MESSAGE)).toBeNull();
    expect(undoButton()).toBeDisabled();

    await user.click(redoButton());
    expect(exportedNode(3)).toMatchObject({ parentId: 2, x: 440, y: 0 });
    await expectStoredParents([[1, null], [2, 1], [3, 2]]);
  });

  it("ルートでは両方のボタンが無効で、無効のボタンをクリックしても変えない", async () => {
    storeBasicMap();
    await renderPage();
    selectNode(0, 3, 50, 130);

    expect(outdentButton()).toBeDisabled();
    expect(indentButton()).toBeDisabled();
    fireEvent.click(indentButton());
    expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
    expect(exportedMap().nodes.map((node) => node.parentId)).toEqual([null, 1, 1]);
  });
});

describe("ページの階層の上げ下げ（ショートカット）", () => {
  it("Alt+→ でボタンと同じく下げ、Alt+← で上げる", async () => {
    storeBasicMap();
    await renderPage();
    selectB();

    pressAlt("ArrowRight");

    await expectStoredParents([[1, null], [2, 1], [3, 2]]);
    expect(storedNode(3)).toMatchObject({ x: 440, y: 0 });
    expect(screen.getByText(INDENTED_UNDER_A_MESSAGE)).toBeInTheDocument();
    expect(indentButton()).toBeDisabled();
    expect(outdentButton()).toBeEnabled();

    pressAlt("ArrowLeft");

    await expectStoredParents([[1, null], [2, 1], [3, 1]]);
    expect(storedNode(3)).toMatchObject({ x: 220, y: 100 });
    expect(screen.getByText(OUTDENTED_UNDER_R_MESSAGE)).toBeInTheDocument();
  });

  it("ラベル編集中の入力欄への Alt+→ では下げない", async () => {
    storeBasicMap();
    await renderPage();
    selectB();
    fireEvent.doubleClick(stageContainer(), { clientX: 270, clientY: 230 });
    const input = screen.getByTestId("node-label-input");

    pressAlt("ArrowRight", input);

    expect(screen.getByTestId("node-label-input")).toBeInTheDocument();
    expect(exportedNode(3)?.parentId).toBe(1);
    expect(screen.queryByText(INDENTED_UNDER_A_MESSAGE)).not.toBeInTheDocument();
  });

  it("検索の入力欄への Alt+→ では下げない", async () => {
    storeBasicMap();
    await renderPage();
    selectB();
    const search = screen.getByRole("combobox", { name: "ノードを検索" });
    search.focus();

    pressAlt("ArrowRight", search);

    expect(exportedNode(3)?.parentId).toBe(1);
    expect(screen.queryByText(INDENTED_UNDER_A_MESSAGE)).not.toBeInTheDocument();
  });

  it("Alt+Shift+→ では下げない", async () => {
    storeBasicMap();
    await renderPage();
    selectB();

    pressAlt("ArrowRight", document.body, { shiftKey: true });

    expect(exportedNode(3)?.parentId).toBe(1);
    expect(screen.queryByText(INDENTED_UNDER_A_MESSAGE)).not.toBeInTheDocument();
  });

  it("「枝を複製」のボタンにフォーカスがあるときの Alt+→ では下げない", async () => {
    storeBasicMap();
    await renderPage();
    selectB();
    const duplicate = screen.getByRole("button", { name: "枝を複製" });
    duplicate.focus();

    pressAlt("ArrowRight", duplicate);

    expect(exportedNode(3)?.parentId).toBe(1);
    expect(screen.queryByText(INDENTED_UNDER_A_MESSAGE)).not.toBeInTheDocument();
  });

  it("ノードのドラッグ中の Alt+→ では下げない", async () => {
    storeBasicMap();
    await renderPage();
    selectB();

    // 手動配置で B をドラッグしている途中に押す
    act(() => {
      mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(270, 230));
      mockStageHandlers.pointermove?.(pointer(270, 260));
    });
    pressAlt("ArrowRight");
    act(() => {
      mockStageHandlers.pointerup?.(pointer(270, 260));
    });

    const b = exportedNode(3);
    expect(b).toMatchObject({ parentId: 1, x: 220, y: 230 });
    expect(screen.queryByText(INDENTED_UNDER_A_MESSAGE)).not.toBeInTheDocument();
  });

  it("箇条書きのダイアログを開いている間は、body への Alt+→ で下げない", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    // 未選択では抑止が無くても変わらないので、必ず選択してから開く
    selectB();
    await user.click(headerButton("箇条書きから追加"));
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    pressAlt("ArrowRight");

    expect(exportedNode(3)?.parentId).toBe(1);
    expect(screen.queryByText(INDENTED_UNDER_A_MESSAGE)).not.toBeInTheDocument();
  });

  it("未選択の Alt+← はブラウザの「戻る」を止める", async () => {
    storeBasicMap();
    await renderPage();

    expect(fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true })).toBe(false);
  });

  it("ルートの Alt+← と先頭の兄弟の Alt+→ は端の通知を出し、変えない", async () => {
    storeBasicMap();
    await renderPage();
    selectNode(0, 3, 50, 130);

    pressAlt("ArrowLeft");
    expect(within(noticeBar()).getByText(OUTDENT_ROOT_EDGE_MESSAGE)).toHaveAttribute("role", "status");

    selectNode(1, 3, 270, 30);
    pressAlt("ArrowRight");
    expect(within(noticeBar()).getByText(INDENT_EDGE_MESSAGE)).toBeInTheDocument();
    expect(exportedMap().nodes.map((node) => node.parentId)).toEqual([null, 1, 1]);
    expect(undoButton()).toBeDisabled();
  });
});

describe("ページの階層の上げ下げ（並べ替えと目印・通知の共有）", () => {
  it("「上へ」にフォーカスがあるときの Alt+→ で下げる", async () => {
    storeBasicMap();
    await renderPage();
    selectB();
    const up = headerButton("枝を上へ移動");
    up.focus();

    pressAlt("ArrowRight", up);

    await expectStoredParents([[1, null], [2, 1], [3, 2]]);
  });

  it("「階層を下げる」にフォーカスがあるときの Alt+↑ で並べ替える", async () => {
    storeThreeRoots();
    await renderPage();
    selectNode(1, 3, 300, 230);
    const indent = indentButton();
    indent.focus();

    pressAlt("ArrowUp", indent);

    await waitFor(() => (
      expect(storedMap()?.nodes.map((node) => node.id)).toEqual([2, 1, 3])
    ), { timeout: 3000 });
  });

  it("並べ替えの通知の枠を共有し、上げ下げの通知に置き換わり、「元に戻す」で消える", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    selectB();
    await user.click(headerButton("枝を上へ移動"));
    expect(within(noticeBar()).getByText(B_MOVED_UP_MESSAGE)).toBeInTheDocument();

    // 先頭に移った B は下げられないので、上げてルートにする
    await user.click(outdentButton());

    const bar = noticeBar();
    expect(within(bar).getByText(OUTDENTED_TO_ROOT_MESSAGE)).toBeInTheDocument();
    expect(within(bar).queryByText(B_MOVED_UP_MESSAGE)).not.toBeInTheDocument();
    expect(within(bar).getAllByRole("status")).toHaveLength(1);
    await expectStoredParents([[1, null], [3, null], [2, 1]]);

    await user.click(undoButton());
    expect(screen.queryByText(OUTDENTED_TO_ROOT_MESSAGE)).not.toBeInTheDocument();
  });
});

describe("ページの階層の上げ下げ（折りたたみ）", () => {
  it("閉じた兄弟の下へ下げると兄弟を開き、B は見えて選択されたまま", async () => {
    const user = userEvent.setup();
    storeCollapsibleMap();
    await renderPage();
    selectA();
    await user.click(headerButton("枝を折りたたむ"));
    expect(collapsibleMapVisibility()).toEqual([true, true, false, true]);
    selectCollapsibleB();

    await user.click(indentButton());

    await expectStoredParents([[1, null], [2, 1], [5, 2], [3, 2]]);
    expect(storedNode(3)).toMatchObject({ x: 440, y: 100 });
    // A が開いて A1 と B が見え、B は選択されたまま（A1 が見えるので「下げる」も有効。B が隠れると両方無効になる）
    expect(collapsibleMapVisibility()).toEqual([true, true, true, true]);
    expect(outdentButton()).toBeEnabled();
    expect(indentButton()).toBeEnabled();

    selectA();
    expect(headerButton("枝を折りたたむ")).toBeEnabled();
  });

  it("下げるのに失敗したときは閉じた兄弟を開かない", async () => {
    const user = userEvent.setup();
    storeCollapsibleMap(1e17);
    await renderPage();
    selectA();
    await user.click(headerButton("枝を折りたたむ"));
    selectCollapsibleB();

    await user.click(indentButton());

    expect(screen.getByText(INDENT_FAILED_MESSAGE)).toBeInTheDocument();
    expect(exportedNode(3)?.parentId).toBe(1);
    expect(collapsibleMapVisibility()).toEqual([true, true, false, true]);
    selectA();
    expect(headerButton("枝を展開")).toBeEnabled();
  });
});

describe("ページの階層の上げ下げ（隠れた兄弟）", () => {
  it("「高のみ」で隠れた兄弟を飛び越えて下げ、隠れた兄弟を元の階層に残す", async () => {
    const user = userEvent.setup();
    seedMapLibrary(window.localStorage, [{ json: v3Json([
      { id: 1, label: "R", importance: "high", x: 0, y: 100 },
      { id: 2, parentId: 1, label: "A", importance: "high", x: 220, y: 0 },
      { id: 4, parentId: 1, label: "L", importance: "low", x: 220, y: 100 },
      { id: 6, parentId: 1, label: "C", importance: "high", x: 220, y: 200 },
    ]) }]);
    await renderPage();
    await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
    // 表示で隠れた L もコンテナとハンドラは登録されるので、4つで数える
    expect(mockContainers.slice(-4).map((container) => container.eventMode === "static"))
      .toEqual([true, true, false, true]);
    selectNode(3, 4, 270, 230);

    await user.click(indentButton());

    await expectStoredParents([[1, null], [2, 1], [4, 1], [6, 2]]);
    expect(storedMap()!.nodes.filter((node) => node.label === "L")).toEqual([
      expect.objectContaining({ id: 4, parentId: 1, importance: "low" }),
    ]);
  });

  it("前に隠れた兄弟しか無いときは「下げる」が無効で、Alt+→ で「すべて」への切り替えを案内する", async () => {
    const user = userEvent.setup();
    seedMapLibrary(window.localStorage, [{ json: v3Json([
      { id: 1, label: "R", importance: "high", x: 0, y: 100 },
      { id: 4, parentId: 1, label: "L", importance: "low", x: 220, y: 0 },
      { id: 6, parentId: 1, label: "C", importance: "high", x: 220, y: 100 },
    ]) }]);
    await renderPage();
    await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
    selectNode(2, 3, 270, 130);

    expect(indentButton()).toBeDisabled();
    pressAlt("ArrowRight");

    expect(within(noticeBar()).getByText(INDENT_HIDDEN_EDGE_MESSAGE)).toBeInTheDocument();
    expect(exportedNode(6)?.parentId).toBe(1);
  });
});

describe("ページの階層の上げ下げ（自動配置）", () => {
  it("2つ目のルートを下げると1つ目の子になり、先頭のルートの位置を変えない", async () => {
    seedMapLibrary(window.localStorage, [{ json: v3Json([
      { id: 1, label: "一", y: 100 },
      { id: 2, label: "二", y: 200 },
    ], "auto") }]);
    await renderPage();
    const first = exportedNode(1)!;
    selectNode(1, 2, 300, 230);

    pressAlt("ArrowRight");

    await expectStoredParents([[1, null], [2, 1]]);
    expect(storedNode(1)).toMatchObject({ x: first.x, y: first.y });
  });
});
