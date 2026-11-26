import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  mockGraphicsPointerHandlers,
  mockNodePointerHandlers,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
  setViewportCullingEnabled,
} from "@/components/map/testing/mapStageTestRuntime";
import { createTestStorageSession, type TestStorageSession } from "@/testing/createTestStorageSession";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
import { CONFLICT_NOTICE_MESSAGE } from "@/domain/mapLibrary/mapConflictMessages";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";

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

const mockCreateMapSvgExport = jest.fn(
  (nodes: Array<{ id: number }>) => (nodes.length === 0
    ? null
    : { svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" />", width: 10, height: 10 }),
);
jest.mock("@/services/imageExport/createMapSvgExport", () => ({
  createMapSvgExport: (nodes: Array<{ id: number }>) => mockCreateMapSvgExport(nodes),
}));

const mockDownloadOutlineText = jest.fn();
jest.mock("@/services/outlineExport/outlineTextDownload", () => ({
  downloadOutlineText: (text: string, mapName: string, format: string) =>
    mockDownloadOutlineText(text, mapName, format),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

type ExportedMap = {
  tour?: { title: string; steps: Array<{ caption?: string }> };
  nodes: Array<{ id: number; label: string }>;
};

const viewNavigationJsonWithRelation = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "親ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
    { id: 2, parentId: 1, label: "子", importance: "low", x: 220, y: 100, width: 100, height: 60 },
  ],
  relations: [{ id: 10, fromId: 1, toId: 2, kind: "related", directed: false }],
});

const viewNavigationJsonWithGroup = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
    { id: 2, parentId: 1, label: "子", importance: "low", x: 220, y: 100, width: 100, height: 60 },
  ],
  groups: [{ id: 20, nodeIds: [1, 2], label: "束" }],
});

type RenderEditorOptions = {
  storageMode?: "persistent" | "protected";
  storage?: TestStorageSession;
  dialogMouseClickedAtRef?: RefObject<number | null>;
  onSaveCurrentAsNewMap?: (name: string, snapshotJson: string) => MapLibraryOperationResult;
};

async function renderEditor({
  storageMode = "persistent",
  storage = createTestStorageSession(),
  dialogMouseClickedAtRef = { current: null },
  onSaveCurrentAsNewMap,
}: RenderEditorOptions = {}) {
  return renderReady(
    <MapEditor
      mapId={storage.session.mapId}
      exportButtonRef={{ current: null }}
      mapMoveTargets={[
        {
          id: storage.session.mapId,
          name: "テストのマップ",
          createdAt: "2026-10-31T00:00:00.000Z",
          updatedAt: "2026-10-31T00:00:00.000Z",
        },
      ]}
      libraryMeta={createEmptyMapLibraryMeta()}
      onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
      onExtractBranchToNewMap={() => ({ ok: false, notice: { kind: "error", message: "切り出せません。" } })}
      mapName="テストのマップ"
      storageSession={storage.session}
      storageMode={storageMode}
      mapControls={null}
      shortcutsEnabled
      dialogMouseClickedAtRef={dialogMouseClickedAtRef}
      onSaveCurrentAsNewMap={onSaveCurrentAsNewMap}
      pendingNavigation={null}
      onConsumePendingNavigation={() => {}}
      onSwitchToMapTarget={() => {}}
      brokenLinksDialogRequest={0}
      onBrokenLinksDialogClosed={() => {}}
      shareSession={null}
      shareSessionStatus="ready"
      shareDialogOpen={false}
      onShareDialogOpenChange={() => {}}
      onShareRequest={() => {}}
      onShareLogin={() => {}}
    />,
  );
}

function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

function editorRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-map-id]")!;
}

function tourButton(): HTMLElement {
  return screen.getByRole("button", { name: "ツアー" });
}

function tourDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "ツアー" });
}

function addNodeAt(x: number, y: number) {
  fireEvent.doubleClick(stageContainer(), { clientX: x, clientY: y });
}

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

async function triggerEditConflict(storage: TestStorageSession) {
  addNodeAt(300, 200);
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: mapBodyKey(storage.session.mapId),
        newValue: "{}\n",
      }),
    );
  });
  expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);
}

async function switchToOutline(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "アウトライン" }));
}

beforeEach(() => {
  resetMapStageTestRuntime();
  setViewportCullingEnabled(true);
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

describe("MapEditor ツアー編集（Task 3 / inventory N1）", () => {
  it("マップ表示で「ツアー」ボタンが有効", async () => {
    await renderEditor();
    expect(tourButton()).toBeEnabled();
  });

  it("アウトライン表示でも「ツアー」ボタンが visible", async () => {
    const user = userEvent.setup();
    await renderEditor();
    await switchToOutline(user);
    expect(tourButton()).toBeEnabled();
  });

  it("保護モードでは「ツアー」ボタンが無効", async () => {
    await renderEditor({
      storageMode: "protected",
    });
    expect(tourButton()).toBeDisabled();
  });

  it("競合中は「ツアー」ボタンが無効", async () => {
    const storage = createTestStorageSession();
    await renderEditor({ storage });
    await triggerEditConflict(storage);
    expect(tourButton()).toBeDisabled();
  });

  it("ダイアログ中は根を inert にし、閉じると戻す", async () => {
    await renderEditor();
    addNodeAt(300, 200);
    expect(exportedMap().nodes).toHaveLength(1);

    fireEvent.click(tourButton());
    expect(tourDialog()).toBeInTheDocument();
    expect(editorRoot()).toHaveAttribute("inert");
    expect(editorRoot().contains(tourDialog())).toBe(false);

    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(exportedMap().nodes).toHaveLength(1);

    fireEvent.click(within(tourDialog()).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "ツアー" })).not.toBeInTheDocument();
    expect(editorRoot()).not.toHaveAttribute("inert");
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(exportedMap().nodes).toHaveLength(0);
  });

  it("関連線選択中でもボタンは有効でダイアログを開ける", async () => {
    const storage = createTestStorageSession({ initialJson: viewNavigationJsonWithRelation });
    await renderEditor({ storage });
    const relationHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    act(() => relationHandler?.(pointer(150, 80)));
    expect(tourButton()).toBeEnabled();
    fireEvent.click(tourButton());
    expect(tourDialog()).toBeInTheDocument();
  });

  it("関連線選択中でもツアーを作成しステップを追加できる", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: viewNavigationJsonWithRelation });
    await renderEditor({ storage });
    const relationHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    act(() => relationHandler?.(pointer(150, 80)));
    await user.click(tourButton());

    const dialog = tourDialog();
    await user.type(within(dialog).getByLabelText("ツアーのタイトル"), "関連線中");
    await user.click(within(dialog).getByRole("button", { name: "ツアーを作成" }));
    await user.click(within(dialog).getByRole("button", { name: "現在の表示をステップに追加" }));
    await user.click(within(dialog).getByRole("button", { name: "閉じる" }));

    const exported = exportedMap();
    expect(exported.tour?.title).toBe("関連線中");
    expect(exported.tour?.steps).toHaveLength(1);
  });

  it("グループ選択中でもボタンは有効でダイアログを開ける", async () => {
    const storage = createTestStorageSession({ initialJson: viewNavigationJsonWithGroup });
    await renderEditor({ storage });
    const groupHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    act(() => groupHandler?.(pointer(120, 40)));
    expect(tourButton()).toBeEnabled();
    fireEvent.click(tourButton());
    expect(tourDialog()).toBeInTheDocument();
  });

  it("ツアーを作成しステップを追加して JSON に tour が含まれる", async () => {
  const user = userEvent.setup();
    await renderEditor();
    addNodeAt(300, 200);
    await user.click(tourButton());

    const dialog = tourDialog();
    await user.type(within(dialog).getByLabelText("ツアーのタイトル"), "案内ツアー");
    await user.click(within(dialog).getByRole("button", { name: "ツアーを作成" }));
    await user.click(within(dialog).getByRole("button", { name: "現在の表示をステップに追加" }));
    await user.click(within(dialog).getByRole("button", { name: "閉じる" }));

    const exported = exportedMap();
    expect(exported.tour?.title).toBe("案内ツアー");
    expect(exported.tour?.steps).toHaveLength(1);
  });

  it("閉じるとフォーカスを「ツアー」へ戻す", async () => {
    await renderEditor();
    fireEvent.click(tourButton());
    fireEvent.click(within(tourDialog()).getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(tourButton()).toHaveFocus());
  });
});