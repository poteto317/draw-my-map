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
// MapStage のジェスチャー・useNodes・履歴・保存までは本物を通す
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

const MOVED_DOWN_MESSAGE = "枝を下へ移動しました（見えている兄弟の3件中2番目）。";

type ExportedNode = {
  id: number;
  parentId: number | null;
  label: string;
  x: number;
  y: number;
};
type ExportedMap = { version: number; layoutMode: string; nodes: ExportedNode[] };

// 自動配置の R の子 A・B・C。座標は layoutNodeForest の結果と一致する。A の中心は (520, 100)
function storeAutoLayoutChildren() {
  const node = { importance: "medium", width: 100, height: 60 };
  seedMapLibrary(window.localStorage, [{ json: `${JSON.stringify({
    version: 3,
    layoutMode: "auto",
    nodes: [
      { ...node, id: 1, parentId: null, label: "R", x: 250, y: 170 },
      { ...node, id: 2, parentId: 1, label: "A", x: 470, y: 70 },
      { ...node, id: 3, parentId: 1, label: "B", x: 470, y: 170 },
      { ...node, id: 4, parentId: 1, label: "C", x: 470, y: 270 },
    ],
  }, null, 2)}\n` }]);
}

function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

async function renderPage() {
  const rendered = await renderReady(<Home />);
  mockStageBounds(stageContainer());
  return rendered;
}

function undoButton() {
  return screen.getByRole("button", { name: "元に戻す" });
}

function redoButton() {
  return screen.getByRole("button", { name: "やり直す" });
}

// 直近の描画で登録されたハンドラは nodes 配列の順（R, A, B, C）
function nodePointerDown(index: number, x: number, y: number, options: { shiftKey?: boolean } = {}) {
  act(() => {
    mockNodePointerHandlers.at(index - 4)?.pointerdown?.(pointer(x, y, options));
  });
}

function stagePointer(event: "pointermove" | "pointerup" | "pointerupoutside", x: number, y: number) {
  act(() => {
    mockStageHandlers[event]?.(pointer(x, y));
  });
}

// A を (520, 100) から指定した y まで縦にドラッグして離す
function dragA(toY: number) {
  nodePointerDown(1, 520, 100);
  stagePointer("pointermove", 520, toY);
  stagePointer("pointerup", 520, toY);
}

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

function exportedIds(): number[] {
  return exportedMap().nodes.map((node) => node.id);
}

function storedMap(): ExportedMap | null {
  const stored = readActiveMapJson(window.localStorage);
  return stored === null ? null : JSON.parse(stored) as ExportedMap;
}

// 300ms の自動保存を待ち、保存された本体の nodes の ID・座標を確かめる
async function expectStoredPositions(positions: Array<[number, number, number]>) {
  await waitFor(() => (
    expect(storedMap()?.nodes.map((node) => [node.id, node.x, node.y])).toEqual(positions)
  ), { timeout: 3000 });
}

const ORIGINAL_IDS = [1, 2, 3, 4];

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ページの自動配置のドラッグによる兄弟の並べ替え", () => {
  it("A を B と C の間へ落とすと B の後ろへ移り、並び直して通知し、1回の「元に戻す」で戻る", async () => {
    const user = userEvent.setup();
    storeAutoLayoutChildren();
    await renderPage();

    dragA(250);

    await expectStoredPositions([[1, 250, 170], [3, 470, 70], [2, 470, 170], [4, 470, 270]]);
    expect(screen.getByText(MOVED_DOWN_MESSAGE)).toHaveAttribute("role", "status");

    await user.click(undoButton());
    expect(exportedMap().nodes.map((node) => [node.id, node.x, node.y])).toEqual([
      [1, 250, 170], [2, 470, 70], [3, 470, 170], [4, 470, 270],
    ]);
    expect(undoButton()).toBeDisabled();
  });

  it("C より下へ落とすと末尾へ移る", async () => {
    storeAutoLayoutChildren();
    await renderPage();

    dragA(350);

    expect(exportedIds()).toEqual([1, 3, 4, 2]);
    await expectStoredPositions([[1, 250, 170], [3, 470, 70], [4, 470, 170], [2, 470, 270]]);
  });

  it("元の位置で離すと並びも履歴も変えず、「やり直す」を残す", async () => {
    const user = userEvent.setup();
    storeAutoLayoutChildren();
    await renderPage();
    // 並べ替えて戻し、「やり直す」を有効にしておく
    dragA(250);
    await user.click(undoButton());
    expect(redoButton()).toBeEnabled();

    dragA(150);

    expect(exportedIds()).toEqual(ORIGINAL_IDS);
    expect(redoButton()).toBeEnabled();
    expect(undoButton()).toBeDisabled();
  });

  it("pointerupoutside で離すと並べ替えない", async () => {
    storeAutoLayoutChildren();
    await renderPage();

    nodePointerDown(1, 520, 100);
    stagePointer("pointermove", 520, 250);
    stagePointer("pointerupoutside", 520, 250);

    expect(exportedIds()).toEqual(ORIGINAL_IDS);
    expect(screen.queryByText(MOVED_DOWN_MESSAGE)).not.toBeInTheDocument();
    expect(undoButton()).toBeDisabled();
  });

  it("ドラッグ中の Escape の後に離しても並べ替えない", async () => {
    storeAutoLayoutChildren();
    await renderPage();

    nodePointerDown(1, 520, 100);
    stagePointer("pointermove", 520, 250);
    fireEvent.keyDown(window, { key: "Escape" });
    stagePointer("pointerup", 520, 250);

    expect(exportedIds()).toEqual(ORIGINAL_IDS);
    expect(screen.queryByText(MOVED_DOWN_MESSAGE)).not.toBeInTheDocument();
    expect(undoButton()).toBeDisabled();
  });

  it("ドラッグ中にキーボードで「マップ一覧」を開いて閉じた後に離しても、並べ替えず通知もしない", async () => {
    const user = userEvent.setup();
    storeAutoLayoutChildren();
    await renderPage();

    nodePointerDown(1, 520, 100);
    stagePointer("pointermove", 520, 250);
    within(screen.getByRole("banner")).getByRole("button", { name: "マップ一覧" }).focus();
    await user.keyboard("{Enter}");
    const dialog = within(screen.getByRole("dialog"));
    dialog.getByRole("button", { name: "閉じる" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    stagePointer("pointermove", 520, 260);
    stagePointer("pointerup", 520, 260);

    expect(exportedIds()).toEqual(ORIGINAL_IDS);
    expect(screen.queryByText(MOVED_DOWN_MESSAGE)).not.toBeInTheDocument();
    expect(undoButton()).toBeDisabled();
  });

  it("手動配置でドラッグ中に「マップ一覧」を開くと開いた時点の位置で止まり、閉じた後に離しても動かず、開く前の移動は1回の「元に戻す」で戻る", async () => {
    const user = userEvent.setup();
    storeAutoLayoutChildren();
    await renderPage();
    await user.click(within(screen.getByRole("group", { name: "レイアウトモード" })).getByRole("button", { name: "手動配置" }));
    const nodesBefore = exportedMap().nodes;

    // 開く前に動かし、履歴のグループを開いた状態にする（A は (470, 70) から 30 下へ）
    nodePointerDown(1, 520, 100);
    stagePointer("pointermove", 520, 130);
    expect(exportedMap().nodes[1]).toMatchObject({ id: 2, x: 470, y: 100 });
    within(screen.getByRole("banner")).getByRole("button", { name: "マップ一覧" }).focus();
    await user.keyboard("{Enter}");
    within(screen.getByRole("dialog")).getByRole("button", { name: "閉じる" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    stagePointer("pointermove", 520, 250);
    stagePointer("pointerup", 520, 250);

    expect(exportedMap().nodes[1]).toMatchObject({ id: 2, x: 470, y: 100 });
    await user.click(undoButton());
    expect(exportedMap().nodes).toEqual(nodesBefore);
  });

  it("手動配置に切り替えると、同じドラッグはノードの移動になり並びを変えない", async () => {
    const user = userEvent.setup();
    storeAutoLayoutChildren();
    await renderPage();
    await user.click(within(screen.getByRole("group", { name: "レイアウトモード" })).getByRole("button", { name: "手動配置" }));

    dragA(250);

    const nodes = exportedMap().nodes;
    expect(nodes.map((node) => node.id)).toEqual(ORIGINAL_IDS);
    expect(nodes[1]).toMatchObject({ id: 2, x: 470, y: 220 });
    expect(screen.queryByText(MOVED_DOWN_MESSAGE)).not.toBeInTheDocument();
  });

  it("Shift+ドラッグは並べ替えではなく接続になり、落とした先の C が A の子になる", async () => {
    storeAutoLayoutChildren();
    await renderPage();

    nodePointerDown(1, 520, 100, { shiftKey: true });
    stagePointer("pointermove", 520, 300);
    stagePointer("pointerup", 520, 300);

    // 既存の接続の規則どおり、ドラッグ元が親、落とした先が子になる
    const nodes = exportedMap().nodes;
    expect(nodes.find((node) => node.id === 4)?.parentId).toBe(2);
    expect(nodes.find((node) => node.id === 2)?.parentId).toBe(1);
    expect(screen.queryByText(MOVED_DOWN_MESSAGE)).not.toBeInTheDocument();
  });
});
