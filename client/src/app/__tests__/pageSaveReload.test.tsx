import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  dialog,
  type ExportedMap,
  exportedMap,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  stageContainer,
  storedMap,
  undoButton,
  v3Json,
  v3JsonFromLabels,
} from "@/app/testing/pageTestHelpers";
import {
  mockContainers,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
import { readMapIndex, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// 編集 → 自動保存（useMapStorageAutoSave → セッション → localStorage）→ 再読み込み
// （起動の判定 → useMapLibrary → 本体の復元 → useNodes → MapStage）の往復を、Home から本物で通す。
// Pixi・ダウンロード・画像化だけを差し替える
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

// ルート R（高）の下に子 C1・C2、C1 の下に孫 G を置いた手動配置のマップ
const TREE_JSON = v3Json([
  { id: 1, label: "R", importance: "high", x: 40, y: 80 },
  { id: 2, parentId: 1, label: "C1", importance: "high", x: 250, y: 80 },
  { id: 3, parentId: 2, label: "G", importance: "low", x: 460, y: 80 },
  { id: 4, parentId: 1, label: "C2", importance: "medium", x: 250, y: 300 },
]);
const TREE_SIZE = 4;

const IMPORTED_JSON = v3Json([
  { id: 10, label: "読み込んだ親", x: 20, y: 30 },
  { id: 11, parentId: 10, label: "読み込んだ子", importance: "low", x: 220, y: 30 },
], "auto");

function jsonFile(contents: string): File {
  const file = new File([contents], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: jest.fn().mockResolvedValue(contents),
  });
  return file;
}

function fileInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

function currentMapName(): HTMLElement {
  return screen.getByTestId("current-map-name");
}

function exported(): ExportedMap {
  return exportedMap(mockDownloadMapJson);
}

// 直近の描画のノードのうち、操作を受け付ける（見えている）ものの数
function visibleNodeCount(count: number): number {
  return mockContainers.slice(-count).filter((node) => node.eventMode === "static").length;
}

// アンマウントしてから同じ localStorage で描画し直す。ページの再読み込みにあたる
async function reload(unmount: () => void) {
  unmount();
  resetMapStageTestRuntime();
  return renderPage();
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("保存と再読み込みの往復", () => {
  it("追加したノード・重要度・配置モードを自動保存し、再読み込みすると同じ内容で開き、履歴は引き継がない", async () => {
    seedMapLibrary(window.localStorage, [{ id: "a", name: "A", json: v3JsonFromLabels(["A1"]) }]);
    const user = userEvent.setup();
    const { unmount } = await renderPage();

    fireEvent.doubleClick(stageContainer(), { clientX: 600, clientY: 400 });
    selectNode(0, 2);
    await user.click(screen.getByRole("button", { name: "重要度 高" }));
    await user.click(screen.getByRole("button", { name: "自動配置" }));
    const edited = exported();
    expect(edited.layoutMode).toBe("auto");
    expect(edited.nodes).toHaveLength(2);
    expect(edited.nodes.find((node) => node.label === "A1")?.importance).toBe("high");
    await waitFor(() => expect(storedMap()).toEqual(edited));

    await reload(unmount);

    expect(exported()).toEqual(edited);
    expect(screen.getByRole("button", { name: "自動配置" })).toHaveAttribute("aria-pressed", "true");
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
  });

  it("JSON を読み込むと開いているマップの本体へ保存し、再読み込みすると読み込んだ内容で開く。マップの名前と件数は変えない", async () => {
    seedMapLibrary(window.localStorage, [
      { id: "a", name: "A", json: v3JsonFromLabels(["A1"]), updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: "b", name: "B", json: v3JsonFromLabels(["B1"]), updatedAt: "2026-01-01T00:00:00.000Z" },
    ], { currentMapId: "a" });
    const user = userEvent.setup();
    const { unmount } = await renderPage();

    await user.upload(fileInput(), jsonFile(IMPORTED_JSON));
    await waitFor(() => expect(screen.getByText("マップを読み込みました。")).toBeInTheDocument());
    const imported = exported();
    expect(imported.nodes.map((node) => node.label)).toEqual(["読み込んだ親", "読み込んだ子"]);
    await waitFor(() => expect(storedMap()).toEqual(imported));

    await reload(unmount);

    expect(currentMapName()).toHaveTextContent("マップ: A");
    expect(exported()).toEqual(imported);
    expect(window.localStorage.getItem(mapBodyKey("b"))).toBe(v3JsonFromLabels(["B1"]));
    const index = readMapIndex(window.localStorage);
    expect(index?.maps.map((map) => [map.id, map.name])).toEqual([["a", "A"], ["b", "B"]]);
    expect(undoButton()).toBeDisabled();
  });

  it("枝の折りたたみと表示の絞り込みは保存せず、再読み込みすると全展開・表示「自動」で開く", async () => {
    seedMapLibrary(window.localStorage, [{ id: "a", name: "A", json: TREE_JSON }]);
    const user = userEvent.setup();
    const { unmount } = await renderPage();
    const before = exported();

    selectNode(1, TREE_SIZE);
    await user.click(screen.getByRole("button", { name: /枝を折りたたむ/ }));
    // 折りたたみで G だけが隠れ、高のみの絞り込みでさらに C2 が隠れる
    expect(visibleNodeCount(TREE_SIZE)).toBe(TREE_SIZE - 1);
    await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
    expect(visibleNodeCount(TREE_SIZE)).toBe(2);
    expect(exported()).toEqual(before);

    await reload(unmount);

    expect(visibleNodeCount(TREE_SIZE)).toBe(TREE_SIZE);
    expect(screen.getByRole("button", { name: "表示 自動" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "表示 高のみ" })).toHaveAttribute("aria-pressed", "false");
    selectNode(1, TREE_SIZE);
    expect(screen.getByRole("button", { name: /枝を折りたたむ/ })).toHaveAttribute("aria-expanded", "true");
    expect(exported()).toEqual(before);
  });

  it("開いているマップを削除して再読み込みすると、削除したマップは一覧にも本体にも無く、削除の後に開いたマップを開く", async () => {
    seedMapLibrary(window.localStorage, [
      { id: "a", name: "A", json: v3JsonFromLabels(["A1"]), updatedAt: "2026-01-03T00:00:00.000Z" },
      { id: "b", name: "B", json: v3JsonFromLabels(["B1"]), updatedAt: "2026-01-02T00:00:00.000Z" },
    ], { currentMapId: "a" });
    const user = userEvent.setup();
    const { unmount } = await renderPage();

    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "削除: A" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));
    expect(currentMapName()).toHaveTextContent("マップ: B");

    await reload(unmount);

    expect(currentMapName()).toHaveTextContent("マップ: B");
    expect(exported().nodes.map((node) => node.label)).toEqual(["B1"]);
    expect(window.localStorage.getItem(mapBodyKey("a"))).toBeNull();
    await user.click(headerButton("マップ一覧"));
    const list = within(screen.getByRole("dialog"));
    expect(list.queryByRole("button", { name: "A" })).not.toBeInTheDocument();
    expect(list.getByRole("button", { name: "B（開いています）" })).toBeInTheDocument();
  });

  it("切り替える直前の編集は元のマップに保存され、再読み込みして元のマップへ戻すと編集が残っている", async () => {
    // 実時間では描画が遅いと自動保存が先に走り、切り替え前の flush を通らなくても通ってしまう
    jest.useFakeTimers();
    seedMapLibrary(window.localStorage, [
      { id: "a", name: "A", json: v3JsonFromLabels(["A1"]), updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: "b", name: "B", json: v3JsonFromLabels(["B1"]), updatedAt: "2026-01-01T00:00:00.000Z" },
    ], { currentMapId: "a" });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { unmount } = await renderPage();

    // 自動保存の 300ms を待たずに切り替える。保存待ちは切り替え前の flush で元のマップへ書く
    selectNode(0, 1);
    await user.click(screen.getByRole("button", { name: "重要度 低" }));
    await user.click(headerButton("マップ一覧"));
    expect(storedMap()?.nodes.map((node) => node.importance)).toEqual(["medium"]);
    await user.click(dialog().getByRole("button", { name: "B" }));
    expect(currentMapName()).toHaveTextContent("マップ: B");

    await reload(unmount);
    expect(currentMapName()).toHaveTextContent("マップ: B");
    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "A" }));

    expect(currentMapName()).toHaveTextContent("マップ: A");
    expect(exported().nodes.map((node) => [node.label, node.importance])).toEqual([["A1", "low"]]);
    expect(exported().nodes).toEqual(
      (JSON.parse(window.localStorage.getItem(mapBodyKey("a"))!) as ExportedMap).nodes,
    );
  });
});
