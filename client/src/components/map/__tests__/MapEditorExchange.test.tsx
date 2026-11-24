import "@/components/map/testing/mockExchangeTextDownload";
import { mockDownloadExchangeText } from "@/components/map/testing/mockExchangeTextDownload";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode, RefObject } from "react";
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
import {
  CONFLICT_NOTICE_MESSAGE,
  EXTERNALLY_DELETED_NOTICE_MESSAGE,
  RELOAD_CONFIRM_ACTION_LABEL,
  RELOAD_EXTERNAL_BUTTON_LABEL,
} from "@/domain/mapLibrary/mapConflictMessages";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import { decodeCsv, encodeCsv } from "@/domain/exchange/csvTsvCodec";
import { decodeOpml, encodeOpml } from "@/domain/exchange/opmlCodec";

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

type ExportedMap = { nodes: Array<{ id: number; label: string; parentId: number | null }> };

const viewNavigationJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "親ルート", importance: "high" },
    { id: 2, parentId: 1, label: "集中する枝", importance: "low", mapLinks: [{ targetMapId: "test-map", targetNodeId: 5 }] },
    { id: 3, parentId: 2, label: "内部ノード", importance: "low" },
    { id: 4, parentId: 3, label: "末端ノード", importance: "low" },
    { id: 5, parentId: null, label: "別のルート", importance: "high" },
    { id: 6, parentId: 5, label: "別の枝の子", importance: "low" },
  ].map((node, index) => ({ ...node, x: 100 + index * 120, y: 100 + index * 50, width: 100, height: 60 })),
});

function viewNavigationJsonWithRelation() {
  const base = JSON.parse(viewNavigationJson) as Record<string, unknown>;
  return JSON.stringify({
    ...base,
    relations: [{ id: 10, fromId: 1, toId: 5, kind: "related", directed: false }],
  });
}

function viewNavigationJsonWithGroup() {
  const base = JSON.parse(viewNavigationJson) as Record<string, unknown>;
  return JSON.stringify({
    ...base,
    groups: [{ id: 20, nodeIds: [2, 3], label: "枝束" }],
  });
}

type RenderEditorOptions = {
  mapName?: string;
  mapCreatedAt?: string;
  storageMode?: "persistent" | "protected";
  shortcutsEnabled?: boolean;
  mapControls?: ReactNode;
  storage?: TestStorageSession;
  dialogMouseClickedAtRef?: RefObject<number | null>;
  onSaveCurrentAsNewMap?: (name: string, snapshotJson: string) => MapLibraryOperationResult;
};

async function renderEditor({
  mapName = "テストのマップ",
  mapCreatedAt,
  storageMode = "persistent",
  shortcutsEnabled = true,
  mapControls = null,
  storage = createTestStorageSession(),
  dialogMouseClickedAtRef = { current: null },
  onSaveCurrentAsNewMap,
}: RenderEditorOptions = {}) {
  const rendered = await renderReady(
    <MapEditor
      mapId={storage.session.mapId}
      mapCreatedAt={mapCreatedAt}
      exportButtonRef={{ current: null }}
      mapMoveTargets={[
        {
          id: storage.session.mapId,
          name: mapName,
          createdAt: "2026-10-31T00:00:00.000Z",
          updatedAt: "2026-10-31T00:00:00.000Z",
        },
      ]}
      libraryMeta={createEmptyMapLibraryMeta()}
      onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
      onExtractBranchToNewMap={() => ({ ok: false, notice: { kind: "error", message: "切り出せません。" } })}
      mapName={mapName}
      storageSession={storage.session}
      storageMode={storageMode}
      mapControls={mapControls}
      shortcutsEnabled={shortcutsEnabled}
      dialogMouseClickedAtRef={dialogMouseClickedAtRef}
      onSaveCurrentAsNewMap={onSaveCurrentAsNewMap}
      pendingNavigation={null}
      onConsumePendingNavigation={() => {}}
      onSwitchToMapTarget={() => {}}
      brokenLinksDialogRequest={0}
      onBrokenLinksDialogClosed={() => {}}
    />,
  );
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

function allViewNavigationLabels(): string[] {
  return ["別のルート", "別の枝の子", "内部ノード", "末端ノード", "親ルート", "集中する枝"];
}

function focusedBranchLabels(): string[] {
  return ["内部ノード", "末端ノード", "親ルート", "集中する枝"];
}

function sortedLabels(labels: readonly string[]): string[] {
  return [...labels].sort((a, b) => a.localeCompare(b, "ja"));
}

function csvRowLabels(csv: string): string[] {
  const decoded = decodeCsv(csv, ",");
  if (!decoded.ok) return [];
  return sortedLabels(decoded.items.map((item) => item.label));
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

async function renderViewNavigationEditor() {
  const storage = createTestStorageSession({ initialJson: viewNavigationJson });
  await renderEditor({ storage });
  return userEvent.setup();
}

async function navigateBySearch(user: ReturnType<typeof userEvent.setup>, label: string) {
  const search = screen.getByRole("combobox", { name: "ノードを検索" });
  await user.clear(search);
  await user.type(search, label);
  await user.keyboard("{ArrowDown}{Enter}");
}

const EXCHANGE_SAMPLE_OPML = encodeOpml([
  {
    id: 1,
    parentId: null,
    label: "取込A",
    importance: "medium",
    x: 0,
    y: 0,
    width: 100,
    height: 60,
  },
  {
    id: 2,
    parentId: 1,
    label: "取込B",
    importance: "medium",
    x: 0,
    y: 0,
    width: 100,
    height: 60,
  },
]);

async function uploadExchangeFile(
  user: ReturnType<typeof userEvent.setup>,
  dialogName: string,
  fileName: string,
  content: string,
) {
  const dialog = screen.getByRole("dialog", { name: dialogName });
  const file = new File([content], fileName, { type: "text/plain" });
  await user.upload(within(dialog).getByLabelText("ファイル"), file);
  return dialog;
}

beforeEach(() => {
  resetMapStageTestRuntime();
  setViewportCullingEnabled(true);
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
  mockDownloadMapImage.mockReset();
  mockCreateMapSvgExport.mockClear();
  mockDownloadOutlineText.mockReset();
  mockDownloadExchangeText.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Exchange 書き出し（書き出し対象スコープ）", () => {
  function exportScopeGroup() {
    return screen.getByRole("group", { name: "書き出し対象" });
  }

  async function selectExportScope(user: ReturnType<typeof userEvent.setup>, label: "全件" | "表示中" | "選択") {
    await user.click(within(exportScopeGroup()).getByRole("button", { name: label === "選択" ? /^選択/ : label }));
  }

  function selectionScopeButton() {
    return within(exportScopeGroup()).getByRole("button", { name: /^選択/ });
  }

  it("全件スコープの OPML はマップ全ノードを書き出す", async () => {
    const user = await renderViewNavigationEditor();
    expect(within(exportScopeGroup()).getByRole("button", { name: "全件" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: /OPML書き出し/ }));
    expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
      expect.stringContaining("<opml"),
      "テストのマップ",
      "opml",
    );

    mockDownloadExchangeText.mockClear();
    await user.click(screen.getByRole("button", { name: /CSV書き出し/ }));
    expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
      expect.stringMatching(/^id,parentId/),
      "テストのマップ",
      "csv",
    );
    expect(csvRowLabels(mockDownloadExchangeText.mock.lastCall![0] as string)).toEqual(
      sortedLabels(allViewNavigationLabels()),
    );
  });

  it("表示中スコープの OPML・CSV は可視ノードと祖先閉包だけを書き出す", async () => {
    const user = await renderViewNavigationEditor();
    await navigateBySearch(user, "集中する枝");
    await user.click(screen.getByRole("button", { name: "枝に集中" }));
    await selectExportScope(user, "表示中");

    await user.click(screen.getByRole("button", { name: /OPML書き出し/ }));
    const opmlDecoded = decodeOpml(mockDownloadExchangeText.mock.lastCall![0] as string);
    expect(opmlDecoded).toEqual({ ok: true, items: expect.any(Array) });
    if (!opmlDecoded.ok) return;
    expect(opmlDecoded.items.map((item) => item.label).sort()).toEqual(focusedBranchLabels());

    await user.click(screen.getByRole("button", { name: /CSV書き出し/ }));
    expect(csvRowLabels(mockDownloadExchangeText.mock.lastCall![0] as string)).toEqual(
      sortedLabels(focusedBranchLabels()),
    );
  });

  it("選択スコープの OPML は祖先閉包で親子を保ち、子孫も欠けない", async () => {
    const user = await renderViewNavigationEditor();
    await navigateBySearch(user, "集中する枝");
    await selectExportScope(user, "選択");

    await user.click(screen.getByRole("button", { name: /OPML書き出し/ }));
    const xml = mockDownloadExchangeText.mock.lastCall![0] as string;
    const decoded = decodeOpml(xml);
    expect(decoded).toEqual({ ok: true, items: expect.any(Array) });
    if (!decoded.ok) return;
    const labels = decoded.items.map((item) => item.label).sort();
    expect(labels).toEqual(["内部ノード", "末端ノード", "親ルート", "集中する枝"]);
    const byLabel = new Map(decoded.items.map((item, index) => [item.label, { ...item, index }]));
    expect(byLabel.get("集中する枝")?.parentIndex).toBe(byLabel.get("親ルート")?.index);
    expect(byLabel.get("末端ノード")?.parentIndex).toBe(byLabel.get("内部ノード")?.index);
    expect(screen.getByText("OPMLファイルを書き出しました。", { selector: "p" })).toBeInTheDocument();
  });

  it("保護モードでも OPML・CSV・TSV 書き出しが有効", async () => {
    const user = userEvent.setup();
    await renderEditor({
      storage: createTestStorageSession({ initialJson: viewNavigationJson }),
      storageMode: "protected",
      mapCreatedAt: "2026-11-20T00:00:00.000Z",
    });

    const opml = screen.getByRole("button", { name: "OPML書き出し" });
    expect(opml).toBeEnabled();
    await user.click(opml);
    expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
      expect.stringContaining("<opml"),
      "テストのマップ",
      "opml",
    );

    const csv = screen.getByRole("button", { name: "CSV書き出し" });
    expect(csv).toBeEnabled();
    await user.click(csv);
    expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
      expect.stringMatching(/^id,parentId/),
      "テストのマップ",
      "csv",
    );

    const tsv = screen.getByRole("button", { name: "TSV書き出し" });
    expect(tsv).toBeEnabled();
    await user.click(tsv);
    expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
      expect.stringMatching(/^id\tparentId/),
      "テストのマップ",
      "tsv",
    );
  });

  it("競合中でも OPML・CSV・TSV 書き出しが有効", async () => {
    const user = userEvent.setup();
    const { storage } = await renderEditor();
    await triggerEditConflict(storage);

    for (const [name, format] of [
      ["OPML書き出し", "opml"],
      ["CSV書き出し", "csv"],
      ["TSV書き出し", "tsv"],
    ] as const) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeEnabled();
      await user.click(button);
      expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
        expect.any(String),
        "テストのマップ",
        format,
      );
    }
  });

  it("externallyDeleted でも OPML・CSV 書き出しが有効", async () => {
    const user = userEvent.setup();
    const { storage } = await renderEditor();
    await triggerEditConflict(storage);

    const readSpy = jest.spyOn(storage.session, "readBody").mockReturnValue({ ok: true, value: null });
    try {
      fireEvent.click(screen.getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL }));
      const confirmDialog = screen.getByRole("dialog");
      fireEvent.click(within(confirmDialog).getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL }));
      expect(screen.getAllByText(EXTERNALLY_DELETED_NOTICE_MESSAGE).length).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: "OPML書き出し" }));
      expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
        expect.stringContaining("<opml"),
        "テストのマップ",
        "opml",
      );
      await user.click(screen.getByRole("button", { name: "CSV書き出し" }));
      expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
        expect.stringMatching(/^id,parentId/),
        "テストのマップ",
        "csv",
      );
    } finally {
      readSpy.mockRestore();
    }
  });

  it("関連線選択中も書き出しは有効でスコープは全件にフォールバックし OPML が全ノードを書き出す", async () => {
    const user = userEvent.setup();
    await renderEditor({
      storage: createTestStorageSession({ initialJson: viewNavigationJsonWithRelation() }),
    });

    const relationHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    expect(relationHandler).toBeDefined();
    act(() => {
      relationHandler?.(pointer(150, 80));
    });
    expect(screen.getByRole("heading", { name: "関連線" })).toBeInTheDocument();
    expect(selectionScopeButton()).toBeDisabled();
    expect(within(exportScopeGroup()).getByRole("button", { name: "全件" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /OPML書き出し/ }));
    expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
      expect.stringContaining("<opml"),
      "テストのマップ",
      "opml",
    );
    mockDownloadExchangeText.mockClear();
    await user.click(screen.getByRole("button", { name: /CSV書き出し/ }));
    expect(csvRowLabels(mockDownloadExchangeText.mock.lastCall![0] as string)).toEqual(
      sortedLabels(allViewNavigationLabels()),
    );
  });

  it("グループ選択中も書き出しは有効でスコープは全件にフォールバックし OPML が全ノードを書き出す", async () => {
    const user = userEvent.setup();
    await renderEditor({
      storage: createTestStorageSession({ initialJson: viewNavigationJsonWithGroup() }),
    });

    const groupHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    expect(groupHandler).toBeDefined();
    act(() => {
      groupHandler?.(pointer(120, 40));
    });
    expect(screen.getByRole("heading", { name: "グループ" })).toBeInTheDocument();
    expect(selectionScopeButton()).toBeDisabled();
    expect(within(exportScopeGroup()).getByRole("button", { name: "全件" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /OPML書き出し/ }));
    expect(mockDownloadExchangeText).toHaveBeenLastCalledWith(
      expect.stringContaining("<opml"),
      "テストのマップ",
      "opml",
    );
    mockDownloadExchangeText.mockClear();
    await user.click(screen.getByRole("button", { name: /CSV書き出し/ }));
    expect(csvRowLabels(mockDownloadExchangeText.mock.lastCall![0] as string)).toEqual(
      sortedLabels(allViewNavigationLabels()),
    );
  });
});

describe("OPML/CSV取り込み", () => {
  it("OPML を取り込み、lossy 案内を出し、1 Undo で戻せる", async () => {
    const user = userEvent.setup();
    jest.spyOn(Date, "now").mockReturnValue(1000);
    await renderEditor();
    const before = exportedMap();

    await user.click(screen.getByRole("button", { name: "OPML取り込み" }));
    const dialog = await uploadExchangeFile(user, "OPML取り込み", "t.opml", EXCHANGE_SAMPLE_OPML);
    await user.click(within(dialog).getByRole("button", { name: "プレビュー" }));
    expect(within(dialog).getByText(/tags/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "マップに追加" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(exportedMap().nodes.map((node) => node.label).sort()).toEqual(["取込A", "取込B"]);

    await user.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(exportedMap()).toEqual(before);
  });

  it("不正ファイルは拒否しマップを変えない", async () => {
    const user = userEvent.setup();
    await renderEditor();
    const before = exportedMap();

    await user.click(screen.getByRole("button", { name: "OPML取り込み" }));
    const dialog = await uploadExchangeFile(
      user,
      "OPML取り込み",
      "bad.opml",
      '<?xml version="1.0"?><opml version="2.0"><head/></opml>',
    );
    await user.click(within(dialog).getByRole("button", { name: "プレビュー" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "OPML取り込み" })).toHaveTextContent(/body がありません/);
    });
    expect(exportedMap()).toEqual(before);
  });

  it("CSV はファイル id を再利用せず新規採番する", async () => {
    const user = userEvent.setup();
    jest.spyOn(Date, "now").mockReturnValue(2000);
    await renderEditor();
    const csv = encodeCsv(
      [
        {
          id: 42,
          parentId: null,
          label: "CSV根",
          importance: "medium",
          x: 0,
          y: 0,
          width: 100,
          height: 60,
        },
      ],
      ",",
    );

    await user.click(screen.getByRole("button", { name: "CSV/TSV取り込み" }));
    const dialog = await uploadExchangeFile(user, "CSV/TSV取り込み", "data.csv", csv);
    await user.click(within(dialog).getByRole("button", { name: "プレビュー" }));
    await user.click(within(dialog).getByRole("button", { name: "マップに追加" }));

    const ids = exportedMap().nodes.map((node) => node.id);
    expect(ids).not.toContain(42);
    expect(exportedMap().nodes.some((node) => node.label === "CSV根")).toBe(true);
  });

  it("TSV 既定区切りとダイアログ上書きで読み込める", async () => {
    const user = userEvent.setup();
    jest.spyOn(Date, "now").mockReturnValue(3000);
    await renderEditor();
    const tsv = encodeCsv(
      [
        {
          id: 1,
          parentId: null,
          label: "TSV根",
          importance: "medium",
          x: 0,
          y: 0,
          width: 100,
          height: 60,
        },
      ],
      "\t",
    );

    await user.click(screen.getByRole("button", { name: "CSV/TSV取り込み" }));
    const dialog = await uploadExchangeFile(user, "CSV/TSV取り込み", "data.tsv", tsv);
    await user.click(within(dialog).getByRole("button", { name: "プレビュー" }));
    await user.click(within(dialog).getByRole("button", { name: "マップに追加" }));
    expect(exportedMap().nodes.some((node) => node.label === "TSV根")).toBe(true);
  });

  it("保護モードでも取り込みボタンは有効でダイアログを開ける", async () => {
    const user = userEvent.setup();
    await renderEditor({
      storageMode: "protected",
      mapCreatedAt: "2026-11-20T00:00:00.000Z",
    });
    expect(screen.getByRole("button", { name: "OPML取り込み" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "OPML取り込み" }));
    expect(screen.getByRole("dialog", { name: "OPML取り込み" })).toBeInTheDocument();
  });

  it("競合中でも取り込みボタンは有効でダイアログを開ける", async () => {
    const user = userEvent.setup();
    const { storage } = await renderEditor();
    await triggerEditConflict(storage);
    expect(screen.getByRole("button", { name: "CSV/TSV取り込み" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "CSV/TSV取り込み" }));
    expect(screen.getByRole("dialog", { name: "CSV/TSV取り込み" })).toBeInTheDocument();
  });

  it("関連線選択中はボタン有効だがルート追加は placement-failed", async () => {
    const user = userEvent.setup();
    jest.spyOn(Date, "now").mockReturnValue(4000);
    await renderEditor({
      storage: createTestStorageSession({ initialJson: viewNavigationJsonWithRelation() }),
    });
    const before = exportedMap();
    const relationHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    act(() => relationHandler?.(pointer(150, 80)));

    expect(screen.getByRole("button", { name: "OPML取り込み" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "OPML取り込み" }));
    const dialog = await uploadExchangeFile(user, "OPML取り込み", "t.opml", EXCHANGE_SAMPLE_OPML);
    await user.click(within(dialog).getByRole("button", { name: "プレビュー" }));
    await user.click(within(dialog).getByRole("button", { name: "マップに追加" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "OPML取り込み" })).toHaveTextContent(
        "ノードを追加できませんでした。マップは変わっていません。",
      );
    });
    expect(exportedMap()).toEqual(before);
  });

  it("グループ選択中はボタン有効だがルート追加は placement-failed", async () => {
    const user = userEvent.setup();
    jest.spyOn(Date, "now").mockReturnValue(4100);
    await renderEditor({
      storage: createTestStorageSession({ initialJson: viewNavigationJsonWithGroup() }),
    });
    const before = exportedMap();
    const groupHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    act(() => {
      groupHandler?.(pointer(120, 40));
    });
    expect(screen.getByRole("heading", { name: "グループ" })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "OPML取り込み" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "OPML取り込み" }));
    const dialog = await uploadExchangeFile(user, "OPML取り込み", "t.opml", EXCHANGE_SAMPLE_OPML);
    await user.click(within(dialog).getByRole("button", { name: "プレビュー" }));
    await user.click(within(dialog).getByRole("button", { name: "マップに追加" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "OPML取り込み" })).toHaveTextContent(
        "ノードを追加できませんでした。マップは変わっていません。",
      );
    });
    expect(exportedMap()).toEqual(before);
  });

  it("取り込みダイアログ中は根を inert にする", async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole("button", { name: "OPML取り込み" }));
    expect(editorRoot()).toHaveAttribute("inert");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "キャンセル" }));
    expect(editorRoot()).not.toHaveAttribute("inert");
  });

  it("ラベル編集中に取り込みを押すと確定してからダイアログを開く", async () => {
    const user = userEvent.setup();
    await renderEditor();
    addNodeAt(300, 200);
    fireEvent.doubleClick(stageContainer(), { clientX: 300, clientY: 200 });
    const input = screen.getByTestId("node-label-input");
    await user.clear(input);
    await user.type(input, "編集中ラベル");

    await user.click(screen.getByRole("button", { name: "OPML取り込み" }));

    expect(screen.getByRole("dialog", { name: "OPML取り込み" })).toBeInTheDocument();
    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(exportedMap().nodes[0]!.label).toBe("編集中ラベル");
  });

  it("主選択の子として OPML を追加できる", async () => {
    const user = userEvent.setup();
    jest.spyOn(Date, "now").mockReturnValue(5000);
    await renderEditor();
    addNodeAt(300, 200);
    const parentId = exportedMap().nodes[0]!.id;
    selectLastNode();

    await user.click(screen.getByRole("button", { name: "OPML取り込み" }));
    const dialog = await uploadExchangeFile(user, "OPML取り込み", "t.opml", EXCHANGE_SAMPLE_OPML);
    await user.click(within(dialog).getByRole("button", { name: "プレビュー" }));
    await user.click(within(dialog).getByRole("radio", { name: /子として追加/ }));
    await user.click(within(dialog).getByRole("button", { name: "マップに追加" }));

    const importedRoot = exportedMap().nodes.find((node) => node.label === "取込A");
    expect(importedRoot?.parentId).toBe(parentId);
  });
});