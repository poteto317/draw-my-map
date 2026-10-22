import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  mockNodePointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createTestStorageSession, type TestStorageSession } from "@/testing/createTestStorageSession";

// ページのテストと同じく、Pixi・画像化・ダウンロードだけを差し替える
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

jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));

const mockDownloadMapImage = jest.fn();
jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: (blob: Blob, fileName: string) => mockDownloadMapImage(blob, fileName),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

type ExportedMap = { nodes: Array<{ id: number; label: string }> };

const savedJson = `${JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "保存済みのノード", importance: "medium", x: 250, y: 170, width: 100, height: 60 },
  ],
})}\n`;

type RenderEditorOptions = {
  mapName?: string;
  shortcutsEnabled?: boolean;
  mapControls?: ReactNode;
  storage?: TestStorageSession;
};

async function renderEditor({
  mapName = "テストのマップ",
  shortcutsEnabled = true,
  mapControls = null,
  storage = createTestStorageSession(),
}: RenderEditorOptions = {}) {
  const rendered = await renderReady(
    <MapEditor
      mapId={storage.session.mapId}
      mapName={mapName}
      storageSession={storage.session}
      mapControls={mapControls}
      shortcutsEnabled={shortcutsEnabled}
      dialogMouseClickedAtRef={{ current: null }}
    />,
  );
  mockStageBounds(stageContainer());
  return { ...rendered, storage };
}

function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

function editorRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-map-id]")!;
}

function addNodeAt(x: number, y: number) {
  fireEvent.doubleClick(stageContainer(), { clientX: x, clientY: y });
}

// Pixiのノードpointerdownで選択し、同じpointerで離す
function selectLastNode() {
  act(() => {
    mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(300, 200));
    mockStageHandlers.pointerup?.(pointer(300, 200));
  });
}

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
  mockDownloadMapImage.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapEditor", () => {
  it("mapControls に渡した要素をヘッダーの見出しの直後に出す", async () => {
    await renderEditor({ mapControls: <button type="button">マップの一覧</button> });

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.nextElementSibling).toBe(screen.getByRole("button", { name: "マップの一覧" }));
  });

  it("根に mapId を data-map-id 属性として出す", async () => {
    await renderEditor({ storage: createTestStorageSession({ mapId: "map-a" }) });

    expect(editorRoot()).toHaveAttribute("data-map-id", "map-a");
    expect(editorRoot()).toHaveClass("flex", "min-h-0", "flex-1", "flex-col");
  });

  it("shortcutsEnabled が false なら根に inert を付け、Ctrl+Z でも Delete でもノードを変えない", async () => {
    await renderEditor({ shortcutsEnabled: false });
    addNodeAt(300, 200);
    expect(exportedMap().nodes).toHaveLength(1);

    // jsdom は inert でイベントを止めないため、inert は属性の有無だけを確かめる。
    // 以下のキー操作が効かないのは、shortcutsEnabled によるショートカットの停止の確認
    expect(editorRoot()).toHaveAttribute("inert");
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    // 選択したノードは、MapStage のショートカットが有効なら Delete で消える
    selectLastNode();
    fireEvent.keyDown(document.body, { key: "Delete" });

    expect(exportedMap().nodes).toHaveLength(1);
  });

  it("shortcutsEnabled が true なら inert を付けず、Ctrl+Z でノードを戻す", async () => {
    await renderEditor({ shortcutsEnabled: true });
    addNodeAt(300, 200);
    expect(exportedMap().nodes).toHaveLength(1);

    expect(editorRoot()).not.toHaveAttribute("inert");
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });

    expect(exportedMap().nodes).toHaveLength(0);
  });

  it("mapName を JSON 書き出しと SVG のファイル名へ渡す", async () => {
    const user = userEvent.setup();
    await renderEditor({ mapName: "旅行" });
    addNodeAt(300, 200);

    fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
    expect(mockDownloadMapJson).toHaveBeenLastCalledWith(expect.any(String), "旅行");

    await user.click(screen.getByRole("button", { name: "SVG書き出し" }));
    const [, fileName] = mockDownloadMapImage.mock.lastCall! as [Blob, string];
    expect(fileName.startsWith("旅行-")).toBe(true);
  });

  it("storageSession の readBody の内容を表示し、編集の300ms後に writes へ書く", async () => {
    const storage = createTestStorageSession({ initialJson: savedJson });
    const user = userEvent.setup();
    await renderEditor({ storage });

    await user.type(screen.getByRole("combobox", { name: "ノードを検索" }), "保存済み");
    expect(screen.getByRole("option", { name: /保存済みのノード/ })).toBeInTheDocument();
    expect(exportedMap().nodes.map((node) => node.label)).toEqual(["保存済みのノード"]);

    jest.useFakeTimers();
    try {
      const writesBefore = storage.writes.length;
      addNodeAt(600, 450);
      act(() => {
        jest.advanceTimersByTime(299);
      });
      expect(storage.writes).toHaveLength(writesBefore);
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(storage.writes).toHaveLength(writesBefore + 1);
      const written = JSON.parse(storage.writes.at(-1)!) as ExportedMap;
      expect(written.nodes).toHaveLength(2);
      expect(written.nodes[0].label).toBe("保存済みのノード");
    } finally {
      jest.useRealTimers();
    }
  });
});
