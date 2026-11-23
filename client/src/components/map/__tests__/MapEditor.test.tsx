import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode, RefObject } from "react";
import { Application, Text } from "pixi.js";
import { MapEditor } from "@/components/map/MapEditor";
import {
  mockNodePointerHandlers,
  mockContainers,
  lastWorldContainer,
  mockStage,
  mockStageBounds,
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
  EXTERNAL_UPDATE_NOTICE_MESSAGE,
  RELOAD_SUCCESS_MESSAGE,
  SAVE_AS_COPY_BUTTON_LABEL,
  RELOAD_EXTERNAL_BUTTON_LABEL,
  RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL,
  RELOAD_CONFIRM_ACTION_LABEL,
} from "@/domain/mapLibrary/mapConflictMessages";
import { createConflictCopyName } from "@/domain/mapLibrary/mapConflict";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
import { DEFAULT_WHEEL_ZOOM_SENSITIVITY } from "@/domain/uiPrefs/uiPrefs";

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

const savedJson = `${JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "保存済みのノード", importance: "medium", x: 250, y: 170, width: 100, height: 60 },
  ],
})}\n`;
const legacyJson = `${JSON.stringify({
  version: 1,
  layoutMode: "auto",
  nodes: [{ id: 10, parentId: null, label: "旧データ", x: 20, y: 30, width: 160, height: 64 }],
})}\n`;

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
      mapName={mapName}
      storageSession={storage.session} storageMode={storageMode}
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

function outlineImportButton(): HTMLElement {
  return screen.getByRole("button", { name: "箇条書きから追加" });
}

function outlineDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "箇条書きから追加" });
}

// ダイアログを開き、テキストを入れてプレビューの画面へ進める
function openOutlinePreview(text: string) {
  fireEvent.click(outlineImportButton());
  fireEvent.change(within(outlineDialog()).getByLabelText("テキスト"), { target: { value: text } });
  fireEvent.click(within(outlineDialog()).getByRole("button", { name: "プレビュー" }));
}

beforeEach(() => {
  resetMapStageTestRuntime();
  setViewportCullingEnabled(true);
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
  mockDownloadMapImage.mockReset();
  mockCreateMapSvgExport.mockClear();
  mockDownloadOutlineText.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

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

function findInteractiveCanvasNode(label: string) {
  const textMock = jest.mocked(Text);
  const worldChildren = lastWorldContainer()?.addChild.mock.calls.map(([child]) => child);
  return mockContainers.findLast((container) => worldChildren?.includes(container)
    && container.eventMode === "static"
    && container.addChild.mock.calls.some(([child]) => textMock.mock.calls.some(
      ([options], index) => typeof options === "object" && "text" in options
        && options.text === label && child === textMock.mock.results[index].value,
    )));
}

function isCanvasNodeInteractive(label: string) {
  return findInteractiveCanvasNode(label) !== undefined;
}

function selectCanvasNodeByLabel(label: string, ctrlKey = false) {
  const container = findInteractiveCanvasNode(label);
  expect(container).toBeDefined();
  const handler = container!.on.mock.lastCall![1];
  act(() => {
    handler(pointer(300, 200, { ctrlKey }));
    mockStageHandlers.pointerup?.(pointer(300, 200, { ctrlKey }));
  });
}

it("選択した枝だけを表示し、解像度で隠れた集中先を残して、終了時のズームと位置を保つ", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  expect(isCanvasNodeInteractive("末端ノード")).toBe(true);
  expect(isCanvasNodeInteractive("親ルート")).toBe(false);
  expect(isCanvasNodeInteractive("別のルート")).toBe(false);
  await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
  expect(isCanvasNodeInteractive("集中する枝")).toBe(true);
  expect(isCanvasNodeInteractive("末端ノード")).toBe(false);
  act(() => {
    stageContainer().querySelector("canvas")!.dispatchEvent(new WheelEvent("wheel", {
      deltaY: -100, clientX: 120, clientY: 130, ctrlKey: true, cancelable: true,
    }));
  });
  const world = lastWorldContainer()!;
  const position = world.position.set.mock.lastCall;
  const scale = world.scale.set.mock.lastCall;
  await user.click(screen.getByRole("button", { name: "集中表示を終了" }));
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual(position);
  expect(lastWorldContainer()?.scale.set.mock.lastCall).toEqual(scale);
  expect(isCanvasNodeInteractive("親ルート")).toBe(true);
  expect(exportedMap().nodes).toHaveLength(6);
});

it("集中中の全体フィットは解像度で隠れた対象を含め、折りたたんだ子と枝外を除く", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "内部ノード");
  await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
  expect(isCanvasNodeInteractive("内部ノード")).toBe(false);

  await user.click(screen.getByRole("button", { name: "表示中の枝に合わせる" }));

  const world = lastWorldContainer()!;
  const [scale] = world.scale.set.mock.lastCall!;
  const [x, y] = world.position.set.mock.lastCall!;
  expect(scale).toBeLessThan(4);
  expect(x + 330 * scale).toBeCloseTo(400);
  expect(y + 205 * scale).toBeCloseTo(300);
  expect(screen.getByRole("button", { name: "表示中の枝に合わせる" })).toHaveFocus();
});

it("選択フィットは単一選択と複数選択の範囲を中央へ移す", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "親ルート");
  const fitSelection = screen.getByRole("button", { name: "選択に合わせる" });
  await user.click(fitSelection);
  expect(lastWorldContainer()?.scale.set.mock.lastCall).toEqual([4]);
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual([-200, -220]);

  // 単一フィットで画面外へ出たノードはカリングされるため、全体フィットで描画を戻してから複数選択する（045）
  await user.click(screen.getByRole("button", { name: "全体に合わせる" }));
  selectCanvasNodeByLabel("別のルート", true);
  expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
  await user.click(fitSelection);
  const world = lastWorldContainer()!;
  const [scale] = world.scale.set.mock.lastCall!;
  const [x, y] = world.position.set.mock.lastCall!;
  expect(scale).toBeLessThan(4);
  expect(x + 390 * scale).toBeCloseTo(400);
  expect(y + 230 * scale).toBeCloseTo(300);
});

it("空のマップではフィットできない", async () => {
  await renderEditor();
  expect(screen.getByRole("button", { name: "全体に合わせる" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "選択に合わせる" })).toBeDisabled();
});

it("パンくずと検索で有効な枝外へ移動し、集中先の削除でも集中表示を終了する", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  const breadcrumb = screen.getByRole("navigation", { name: "パンくず" });
  expect(within(breadcrumb).getByText("集中する枝")).toHaveAttribute("aria-current", "location");
  await user.click(within(breadcrumb).getByRole("button", { name: "親ルート" }));
  expect(screen.queryByRole("button", { name: "集中表示を終了" })).not.toBeInTheDocument();
  expect(within(breadcrumb).getByText("親ルート")).toHaveAttribute("aria-current", "location");
  expect(stageContainer()).toHaveFocus();
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  await navigateBySearch(user, "別のルート");
  expect(screen.queryByRole("button", { name: "集中表示を終了" })).not.toBeInTheDocument();
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  fireEvent.keyDown(stageContainer(), { key: "Delete" });
  expect(screen.queryByRole("button", { name: "集中表示を終了" })).not.toBeInTheDocument();
});

it("枝の内部ノードを一括開閉し、単独展開後も内部の閉状態と枝外の閉状態を保持する", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "別のルート");
  await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
  await navigateBySearch(user, "集中する枝");
  const expand = screen.getByRole("button", { name: "枝を一括展開" });
  const collapse = screen.getByRole("button", { name: "枝を一括折りたたみ" });
  expect(expand).toBeDisabled();
  await user.click(collapse);
  expect(collapse).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "枝を展開" }));
  expect(isCanvasNodeInteractive("内部ノード")).toBe(true);
  expect(isCanvasNodeInteractive("末端ノード")).toBe(false);
  await user.click(expand);
  expect(expand).toBeDisabled();
  expect(isCanvasNodeInteractive("末端ノード")).toBe(true);
  expect(isCanvasNodeInteractive("別の枝の子")).toBe(false);
  await navigateBySearch(user, "末端ノード");
  expect(collapse).toBeDisabled();
  expect(expand).toBeDisabled();
});

it.each([false, true])("同一マップの枝外リンクで集中表示を解除する（アウトライン: %s）", async (fromOutline) => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  if (fromOutline) await user.click(screen.getByRole("button", { name: "アウトライン" }));
  await user.click(screen.getByRole("button", { name: "テストのマップ / 別のルート" }));
  expect(screen.queryByRole("button", { name: "集中表示を終了" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "マップ" })).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByRole("navigation", { name: "パンくず" })).getByText("別のルート"))
    .toHaveAttribute("aria-current", "location");
});

it("異なるルートのノードを複数選択しても枝の一括開閉と集中表示は主選択を使う", async () => {
  const user = await renderViewNavigationEditor();
  function selectWithPointer(offsetFromLast: number, ctrlKey = false) {
    act(() => {
      mockNodePointerHandlers.at(offsetFromLast)?.pointerdown?.(pointer(300, 200, { ctrlKey }));
      mockStageHandlers.pointerup?.(pointer(300, 200, { ctrlKey }));
    });
  }
  // 最終描画の後ろから2番目が別のルート、5番目が集中する枝。
  selectWithPointer(-2);
  await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
  selectWithPointer(-5, true);
  expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "枝を一括折りたたみ" }));
  expect(isCanvasNodeInteractive("内部ノード")).toBe(false);
  await user.click(screen.getByRole("button", { name: "枝を一括展開" }));
  expect(isCanvasNodeInteractive("末端ノード")).toBe(true);
  expect(isCanvasNodeInteractive("別の枝の子")).toBe(false);
  expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  expect(isCanvasNodeInteractive("集中する枝")).toBe(true);
  expect(isCanvasNodeInteractive("別のルート")).toBe(false);
  await user.click(screen.getByRole("button", { name: "集中表示を終了" }));
  expect(isCanvasNodeInteractive("別のルート")).toBe(true);
  expect(isCanvasNodeInteractive("別の枝の子")).toBe(false);
});

it.each([["別ルートの下", "5", 5], ["新しいルート", "root", null]])(
  "集中表示から枝を%sへ移動すると集中表示を終了し、移動したノードを選択したままにする",
  async (_title, parentTarget, expectedParentId) => {
    const user = await renderViewNavigationEditor();
    await navigateBySearch(user, "集中する枝");
    await user.click(screen.getByRole("button", { name: "枝に集中" }));
    await navigateBySearch(user, "内部ノード");
    await user.click(screen.getByRole("button", { name: "枝を移動" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.selectOptions(dialog.getByLabelText("移動先の親"), parentTarget);
    await user.click(dialog.getByRole("button", { name: "移動する" }));

    expect(screen.queryByRole("button", { name: "集中表示を終了" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "パンくず" })).getByText("内部ノード"))
      .toHaveAttribute("aria-current", "location");
    expect(isCanvasNodeInteractive("内部ノード")).toBe(true);
    expect(exportedMap().nodes.find(({ id }) => id === 3)?.parentId).toBe(expectedParentId);
  },
);

describe("MapEditor", () => {
  it("V1 本体の復元直後は新形式への保存待ちを表示する", async () => {
    await renderEditor({ storage: createTestStorageSession({ initialJson: legacyJson }) });

    expect(screen.getByRole("status", { name: "保存状態: 保存待ち" })).toBeInTheDocument();
    expect(exportedMap().nodes.map((node) => node.label)).toEqual(["旧データ"]);
  });

  it("本体を読み取れないときは警告と復元失敗状態を出し、空マップを保存済みにしない", async () => {
    await renderEditor({ storage: createTestStorageSession({ readError: "読み取り失敗" }) });

    expect(screen.getByRole("status", { name: "保存状態: 復元できませんでした" })).toBeInTheDocument();
    expect(screen.getByText("保存データを復元できませんでした。空のマップで開始します。")).toBeInTheDocument();
    expect(exportedMap().nodes).toEqual([]);
  });

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
    expect(screen.getByRole("status", { name: "保存状態: 保存済み" })).toBeInTheDocument();

    await user.type(screen.getByRole("combobox", { name: "ノードを検索" }), "保存済み");
    expect(screen.getByRole("option", { name: /保存済みのノード/ })).toBeInTheDocument();
    expect(exportedMap().nodes.map((node) => node.label)).toEqual(["保存済みのノード"]);

    jest.useFakeTimers();
    try {
      const writesBefore = storage.writes.length;
      addNodeAt(600, 450);
      expect(screen.getByRole("status", { name: "保存状態: 保存待ち" })).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(299);
      });
      expect(storage.writes).toHaveLength(writesBefore);
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(storage.writes).toHaveLength(writesBefore + 1);
      expect(screen.getByRole("status", { name: "保存状態: 保存済み" })).toBeInTheDocument();
      const written = JSON.parse(storage.writes.at(-1)!) as ExportedMap;
      expect(written.nodes).toHaveLength(2);
      expect(written.nodes[0].label).toBe("保存済みのノード");
    } finally {
      jest.useRealTimers();
    }
  });

  describe("兄弟の順序", () => {
    const threeRootsJson = `${JSON.stringify({
      version: 3,
      layoutMode: "manual",
      nodes: [
        { id: 1, parentId: null, label: "ルート1", importance: "medium", x: 250, y: 100, width: 100, height: 60 },
        { id: 2, parentId: null, label: "ルート2", importance: "medium", x: 250, y: 200, width: 100, height: 60 },
        { id: 3, parentId: null, label: "ルート3", importance: "medium", x: 250, y: 300, width: 100, height: 60 },
      ],
    })}\n`;

    // 直近の描画で登録されたノードのpointerdownで選択し、同じpointerで離す（indexはnodes配列の順）
    function selectNode(index: number, nodeCount: number) {
      act(() => {
        mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(300, 200));
        mockStageHandlers.pointerup?.(pointer(300, 200));
      });
    }

    function moveUpButton(): HTMLElement {
      return screen.getByRole("button", { name: "枝を上へ移動" });
    }

    function moveDownButton(): HTMLElement {
      return screen.getByRole("button", { name: "枝を下へ移動" });
    }

    it("「兄弟の順序」を「枝を複製」の後、クリップボードの案内の前に置く", async () => {
      await renderEditor();

      const duplicateButton = screen.getByRole("button", { name: "枝を複製" });
      const group = screen.getByRole("group", { name: "兄弟の順序" });
      const hint = screen.getByText((content) => content.startsWith("枝をコピー: Ctrl/Cmd+C"));
      expect(duplicateButton.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(group.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("未選択なら「上へ」「下へ」をどちらも無効にする", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: threeRootsJson }) });

      expect(moveUpButton()).toBeDisabled();
      expect(moveDownButton()).toBeDisabled();
    });

    it("先頭のルートを選択すると「上へ」だけ無効、末尾のルートを選択すると「下へ」だけ無効にする", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: threeRootsJson }) });

      selectNode(0, 3);
      expect(moveUpButton()).toBeDisabled();
      expect(moveDownButton()).toBeEnabled();

      selectNode(2, 3);
      expect(moveUpButton()).toBeEnabled();
      expect(moveDownButton()).toBeDisabled();
    });

    it("「下へ」を押すと選択中のルートを1つ下へ移し、操作通知バーに位置を出す", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: threeRootsJson }) });
      selectNode(0, 3);

      fireEvent.click(moveDownButton());

      expect(screen.getByTestId("operation-notices"))
        .toHaveTextContent("枝を下へ移動しました（見えているルートの3件中2番目）。");
      expect(exportedMap().nodes.map((node) => node.id)).toEqual([2, 1, 3]);
    });

    it("複数の系統の通知が同時に出ると、出した順ではなく系統の順に並べる", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: threeRootsJson }) });
      selectNode(0, 3);

      // 表示の順の逆から出す
      fireEvent.click(moveDownButton());
      fireEvent.click(screen.getByRole("button", { name: "枝を複製" }));
      fireEvent.click(screen.getByRole("button", { name: "SVG書き出し" }));
      fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));

      const paragraphs = Array.from(screen.getByTestId("operation-notices").querySelectorAll("p"));
      expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
        "JSONファイルを書き出しました。",
        "SVGファイルを書き出しました。",
        "枝を複製しました。Fキーで選択ノードへ移動できます。",
        "枝を下へ移動しました（見えているルートの3件中2番目）。",
      ]);
    });
  });

  describe("階層の上げ下げ", () => {
    const parentWithTwoChildrenJson = `${JSON.stringify({
      version: 3,
      layoutMode: "manual",
      nodes: [
        { id: 1, parentId: null, label: "R", importance: "medium", x: 0, y: 100, width: 100, height: 60 },
        { id: 2, parentId: 1, label: "A", importance: "medium", x: 220, y: 0, width: 100, height: 60 },
        { id: 3, parentId: 1, label: "B", importance: "medium", x: 220, y: 200, width: 100, height: 60 },
      ],
    })}\n`;

    // 直近の描画で登録されたノードのpointerdownで選択し、同じpointerで離す（indexはnodes配列の順）
    function selectNode(index: number, nodeCount: number) {
      act(() => {
        mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(300, 200));
        mockStageHandlers.pointerup?.(pointer(300, 200));
      });
    }

    function outdentButton(): HTMLElement {
      return screen.getByRole("button", { name: "枝の階層を上げる" });
    }

    function indentButton(): HTMLElement {
      return screen.getByRole("button", { name: "枝の階層を下げる" });
    }

    it("「階層」を「兄弟の順序」の後、クリップボードの案内の前に置く", async () => {
      await renderEditor();

      const siblingGroup = screen.getByRole("group", { name: "兄弟の順序" });
      const group = screen.getByRole("group", { name: "階層" });
      const hint = screen.getByText((content) => content.startsWith("枝をコピー: Ctrl/Cmd+C"));
      expect(siblingGroup.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(group.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("未選択なら「上げる」「下げる」をどちらも無効にする", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: parentWithTwoChildrenJson }) });

      expect(outdentButton()).toBeDisabled();
      expect(indentButton()).toBeDisabled();
    });

    it("R は両方無効、A は「上げる」だけ有効、B は両方有効にする", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: parentWithTwoChildrenJson }) });

      selectNode(0, 3);
      expect(outdentButton()).toBeDisabled();
      expect(indentButton()).toBeDisabled();

      selectNode(1, 3);
      expect(outdentButton()).toBeEnabled();
      expect(indentButton()).toBeDisabled();

      selectNode(2, 3);
      expect(outdentButton()).toBeEnabled();
      expect(indentButton()).toBeEnabled();
    });

    it("B で「下げる」を押すと A の子にし、操作通知バーに位置を出す", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: parentWithTwoChildrenJson }) });
      selectNode(2, 3);

      fireEvent.click(indentButton());

      expect(screen.getByTestId("operation-notices"))
        .toHaveTextContent("枝の階層を下げました（「A」の子、第3階層）。");
    });

    it("B で「上げる」を押すと R の兄弟（ルート）にし、操作通知バーに位置を出す", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: parentWithTwoChildrenJson }) });
      selectNode(2, 3);

      fireEvent.click(outdentButton());

      expect(screen.getByTestId("operation-notices"))
        .toHaveTextContent("枝の階層を上げました（ルート、第1階層）。");
    });
  });

  describe("親の挿入", () => {
    const parentWithTwoChildrenJson = `${JSON.stringify({
      version: 3,
      layoutMode: "manual",
      nodes: [
        { id: 1, parentId: null, label: "R", importance: "medium", x: 0, y: 100, width: 100, height: 60 },
        { id: 2, parentId: 1, label: "A", importance: "medium", x: 220, y: 0, width: 100, height: 60 },
        { id: 3, parentId: 1, label: "B", importance: "medium", x: 220, y: 200, width: 100, height: 60 },
      ],
    })}\n`;

    // 直近の描画で登録されたノードのpointerdownで選択し、同じpointerで離す（indexはnodes配列の順）
    function selectNode(index: number, nodeCount: number) {
      act(() => {
        mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(300, 200));
        mockStageHandlers.pointerup?.(pointer(300, 200));
      });
    }

    function insertButton() {
      return screen.getByRole("button", { name: "選択中のノードに親を挿入" });
    }

    it("「親を挿入」を階層のグループの後、クリップボードの案内の前に置く", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: parentWithTwoChildrenJson }) });

      const group = screen.getByRole("group", { name: "階層" });
      const hint = screen.getByText((content) => content.startsWith("枝をコピー: Ctrl/Cmd+C"));
      expect(group.compareDocumentPosition(insertButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(insertButton().compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("未選択では「親を挿入」が無効", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: parentWithTwoChildrenJson }) });

      expect(insertButton()).toBeDisabled();
    });

    it("A の選択では挿入が有効で階層を下げるは無効、R の選択では挿入が有効で階層を上げるは無効（canInsert と canIndent を取り違えない）", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: parentWithTwoChildrenJson }) });

      selectNode(1, 3);
      expect(insertButton()).toBeEnabled();
      expect(screen.getByRole("button", { name: "枝の階層を下げる" })).toBeDisabled();

      selectNode(0, 3);
      expect(insertButton()).toBeEnabled();
      expect(screen.getByRole("button", { name: "枝の階層を上げる" })).toBeDisabled();
    });

    it("A を選んで「親を挿入」をクリックすると、ラベルの入力欄にフォーカスが移る", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: parentWithTwoChildrenJson }) });
      selectNode(1, 3);

      await userEvent.click(insertButton());

      expect(document.activeElement).toBe(screen.getByTestId("node-label-input"));
    });

    it("A で Alt+Enter を押すと A の親を挿入し、新しいノードのラベルを空の入力欄で編集し始め、通知は出さない", async () => {
      await renderEditor({ storage: createTestStorageSession({ initialJson: parentWithTwoChildrenJson }) });
      selectNode(1, 3);

      fireEvent.keyDown(document.body, { key: "Enter", altKey: true });

      const input = screen.getByTestId("node-label-input");
      expect(document.activeElement).toBe(input);
      expect(input).toHaveValue("");
      // 「JSON書き出し」も操作通知バーに通知を出すので、書き出す前に確かめる
      expect(screen.queryByTestId("operation-notices")).toBeNull();
      const exported = exportedMap();
      expect(exported.nodes).toHaveLength(4);
      const inserted = exported.nodes.find((node) => node.id !== 1 && node.id !== 2 && node.id !== 3)!;
      expect(inserted.parentId).toBe(1);
      expect(exported.nodes.find((node) => node.id === 2)!.parentId).toBe(inserted.id);
    });
  });

  describe("箇条書きから追加", () => {
    it("「箇条書きから追加」をクリップボードの案内の後、「JSON書き出し」の前に置く", async () => {
      await renderEditor();

      const hint = screen.getByText((content) => content.startsWith("枝をコピー: Ctrl/Cmd+C"));
      const button = outlineImportButton();
      const exportButton = screen.getByRole("button", { name: "JSON書き出し" });
      expect(hint.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(button.compareDocumentPosition(exportButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("開いている間はダイアログを根の外に出し、根を inert にして Ctrl+Z と Delete を止め、閉じると元に戻す", async () => {
      await renderEditor({ shortcutsEnabled: true });
      addNodeAt(300, 200);
      expect(exportedMap().nodes).toHaveLength(1);
      selectLastNode();

      fireEvent.click(outlineImportButton());
      const dialog = outlineDialog();
      expect(outlineImportButton()).toHaveAttribute("aria-expanded", "true");
      expect(editorRoot().contains(dialog)).toBe(false);
      expect(dialog.closest("[data-map-id]")).toBeNull();
      expect(document.querySelectorAll("[data-map-id]")).toHaveLength(1);
      // jsdom は inert でイベントを止めないため、キー操作が効かないのはショートカットの停止の確認
      expect(editorRoot()).toHaveAttribute("inert");
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      // 選択したノードは、MapStage のショートカットが有効なら Delete で消える
      fireEvent.keyDown(document.body, { key: "Delete" });
      expect(exportedMap().nodes).toHaveLength(1);

      fireEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(editorRoot()).not.toHaveAttribute("inert");
      expect(outlineImportButton()).toHaveAttribute("aria-expanded", "false");
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      expect(exportedMap().nodes).toHaveLength(0);
    });

    it("閉じるとフォーカスをヘッダーの「箇条書きから追加」へ戻す", async () => {
      await renderEditor();

      fireEvent.click(outlineImportButton());
      expect(within(outlineDialog()).getByLabelText("テキスト")).toHaveFocus();
      fireEvent.click(within(outlineDialog()).getByRole("button", { name: "キャンセル" }));

      await waitFor(() => expect(outlineImportButton()).toHaveFocus());
    });

    it("ダイアログの中のマウスのクリックの時刻を dialogMouseClickedAtRef に書く", async () => {
      const dialogMouseClickedAtRef: RefObject<number | null> = { current: null };
      jest.spyOn(Date, "now").mockReturnValue(12345);
      await renderEditor({ dialogMouseClickedAtRef });

      fireEvent.click(outlineImportButton());
      expect(dialogMouseClickedAtRef.current).toBeNull();
      fireEvent.click(within(outlineDialog()).getByLabelText("テキスト"), { detail: 1 });

      expect(dialogMouseClickedAtRef.current).toBe(12345);
    });

    it("追加すると操作通知バーに件数を出し、フォーカスを「箇条書きから追加」へ戻し、先頭のルートを選択する", async () => {
      await renderEditor();
      expect(screen.getByRole("button", { name: "枝を複製" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "重要度 中" })).toBeDisabled();

      openOutlinePreview("- A\n- B");
      fireEvent.click(within(outlineDialog()).getByRole("button", { name: "マップに追加" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByTestId("operation-notices")).toHaveTextContent("2件のノードを追加しました。");
      await waitFor(() => expect(outlineImportButton()).toHaveFocus());
      expect(exportedMap().nodes.map((node) => node.label)).toEqual(["A", "B"]);
      expect(screen.getByRole("button", { name: "枝を複製" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "重要度 中" })).toBeEnabled();
    });

    it("開いた時点で選択していたノードの表示名の先頭40文字を、子として追加の選択肢に出す", async () => {
      const longLabel = "\u{1F600}".repeat(41);
      const storage = createTestStorageSession({
        initialJson: `${JSON.stringify({
          version: 3,
          layoutMode: "manual",
          nodes: [
            { id: 1, parentId: null, label: longLabel, importance: "medium", x: 250, y: 170, width: 100, height: 60 },
          ],
        })}\n`,
      });
      await renderEditor({ storage });
      selectLastNode();

      openOutlinePreview("- A");

      expect(within(outlineDialog()).getByRole("radio", {
        name: `選択中のノード「${"\u{1F600}".repeat(40)}」の子として追加`,
      })).toBeInTheDocument();
    });

    it("開いた後にマップが置き換わったら、同じ ID のノードがあっても選択していたノードとして扱わない", async () => {
      await renderEditor();
      addNodeAt(300, 200);
      const [{ id: selectedId }] = exportedMap().nodes;
      selectLastNode();
      let resolveText!: (text: string) => void;
      const file = new File(["{}"], "map.json", { type: "application/json" });
      Object.defineProperty(file, "text", {
        configurable: true,
        value: () => new Promise<string>((resolve) => {
          resolveText = resolve;
        }),
      });
      const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      fireEvent.change(fileInput, { target: { files: [file] } });

      openOutlinePreview("- A");
      expect(within(outlineDialog()).getByRole("radio", {
        name: "選択中のノード「新しいノード」の子として追加",
      })).toBeInTheDocument();
      // jsdom は inert でイベントを止めないため、開いた後でも読み込みを終えられる
      await act(async () => {
        resolveText(`${JSON.stringify({
          version: 3,
          layoutMode: "manual",
          nodes: [
            { id: selectedId, parentId: null, label: "別のノード", importance: "medium", x: 250, y: 170, width: 100, height: 60 },
          ],
        })}\n`);
      });
      await waitFor(() => expect(screen.getByText("マップを読み込みました。")).toBeInTheDocument());

      expect(exportedMap().nodes).toEqual([expect.objectContaining({ id: selectedId, label: "別のノード" })]);
      const dialog = outlineDialog();
      expect(within(dialog).getByRole("radio", { name: "選択していたノードの子として追加" })).toBeInTheDocument();
      expect(within(dialog).queryByText(/別のノード/)).not.toBeInTheDocument();
    });

    it("開いた時点で選択していたノードが空のラベルなら、表示名を出す", async () => {
      await renderEditor();
      addNodeAt(300, 200);
      selectLastNode();

      openOutlinePreview("- A");

      expect(within(outlineDialog()).getByRole("radio", {
        name: "選択中のノード「新しいノード」の子として追加",
      })).toBeInTheDocument();
    });
  });

  describe("複数タブの編集競合検出", () => {
    it("未保存編集があるときに別タブで更新されたら、競合通知を表示する", async () => {
      const { storage } = await renderEditor();
      addNodeAt(300, 200); // 未保存の編集を作る

      const newBody = `${JSON.stringify({
        version: 3,
        layoutMode: "manual",
        nodes: [{ id: 99, parentId: null, label: "別タブのノード", importance: "medium", x: 100, y: 100, width: 100, height: 60 }],
      })}\n`;

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: mapBodyKey(storage.session.mapId),
            newValue: newBody,
          }),
        );
      });

      expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL })).toBeInTheDocument();
    });

    it("競合中に「別名で保存」を実行すると、退避名で onSaveCurrentAsNewMap が呼ばれて成功後に通知が消える", async () => {
      const onSaveCurrentAsNewMap = jest.fn().mockReturnValue({ ok: true });
      const { storage } = await renderEditor({
        mapName: "旅行計画",
        onSaveCurrentAsNewMap,
      });
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

      fireEvent.click(screen.getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL }));

      expect(onSaveCurrentAsNewMap).toHaveBeenCalledTimes(1);
      expect(onSaveCurrentAsNewMap).toHaveBeenCalledWith(
        createConflictCopyName("旅行計画"),
        expect.stringContaining("\"version\": 3"),
      );
      expect(screen.queryByText(CONFLICT_NOTICE_MESSAGE)).not.toBeInTheDocument();
    });

    it("未保存編集がある競合中に「最新を読み込む」を押すと確認ダイアログが表示され、確定で最新内容が反映される", async () => {
      const { storage } = await renderEditor();
      addNodeAt(300, 200);

      const latestDocJson = `${JSON.stringify({
        version: 3,
        layoutMode: "manual",
        nodes: [{ id: 777, parentId: null, label: "最新の外部ノード", importance: "medium", x: 150, y: 150, width: 100, height: 60 }],
      })}\n`;

      // readBody が最新内容を返すようモック
      const readSpy = jest.spyOn(storage.session, "readBody").mockReturnValue({ ok: true, value: latestDocJson });

      try {
        act(() => {
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: mapBodyKey(storage.session.mapId),
              newValue: latestDocJson,
            }),
          );
        });

        expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);

        // 「最新を読み込む」をクリック
        fireEvent.click(screen.getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL }));

        // 確認ダイアログが表示される
        const confirmDialog = screen.getByRole("dialog");
        expect(confirmDialog).toBeInTheDocument();

        // 確定ボタンを押す
        fireEvent.click(within(confirmDialog).getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL }));

        // 競合通知が消え、最新読込完了通知が表示される
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.queryByText(CONFLICT_NOTICE_MESSAGE)).not.toBeInTheDocument();
        expect(screen.getByText(RELOAD_SUCCESS_MESSAGE)).toBeInTheDocument();
        expect(exportedMap().nodes).toEqual([expect.objectContaining({ id: 777, label: "最新の外部ノード" })]);
      } finally {
        readSpy.mockRestore();
      }
    });

    it("「別名で保存」が失敗した場合はエラー通知を表示し競合状態を維持する", async () => {
      const onSaveCurrentAsNewMap = jest.fn().mockReturnValue({
        ok: false,
        notice: { kind: "error", message: "名前が重複しています。" },
      });
      const { storage } = await renderEditor({
        mapName: "旅行計画",
        onSaveCurrentAsNewMap,
      });
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

      fireEvent.click(screen.getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL }));

      expect(onSaveCurrentAsNewMap).toHaveBeenCalledTimes(1);
      // 失敗通知が表示され、競合通知も維持される
      expect(screen.getByText("名前が重複しています。")).toBeInTheDocument();
      expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);
    });

    it("「最新を読み込む」確定時にストレージ上が削除されていた場合は externallyDeleted に遷移する", async () => {
      const { storage } = await renderEditor();
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

      // ストレージ上は削除されていた（value: null）
      const readSpy = jest.spyOn(storage.session, "readBody").mockReturnValue({ ok: true, value: null });

      try {
        fireEvent.click(screen.getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL }));
        const confirmDialog = screen.getByRole("dialog");
        fireEvent.click(within(confirmDialog).getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL }));

        // ダイアログは閉じ、externallyDeleted 通知へ遷移する
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getAllByText(EXTERNALLY_DELETED_NOTICE_MESSAGE).length).toBeGreaterThan(0);
      } finally {
        readSpy.mockRestore();
      }
    });

    it("「最新を読み込む」確定時にパース失敗が生じた場合はエラー通知を表示する", async () => {
      const { storage } = await renderEditor();
      addNodeAt(300, 200);

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: mapBodyKey(storage.session.mapId),
            newValue: "{}\n",
          }),
        );
      });

      // 壊れた JSON
      const readSpy = jest.spyOn(storage.session, "readBody").mockReturnValue({ ok: true, value: "invalid json" });

      try {
        fireEvent.click(screen.getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL }));
        const confirmDialog = screen.getByRole("dialog");
        fireEvent.click(within(confirmDialog).getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByText("JSONを解析できませんでした。")).toBeInTheDocument();
      } finally {
        readSpy.mockRestore();
      }
    });

    it("確認ダイアログのクリックで dialogMouseClickedAtRef が更新される", async () => {
      const dialogMouseClickedAtRef = { current: null as number | null };
      const { storage } = await renderEditor({ dialogMouseClickedAtRef });
      addNodeAt(300, 200);

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: mapBodyKey(storage.session.mapId),
            newValue: "{}\n",
          }),
        );
      });

      fireEvent.click(screen.getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL }));
      const confirmDialog = screen.getByRole("dialog");

      fireEvent.click(confirmDialog, { detail: 1 });
      expect(dialogMouseClickedAtRef.current).not.toBeNull();
      expect(typeof dialogMouseClickedAtRef.current).toBe("number");
    });

    it("未編集時の externalUpdate からキャンバス編集を行うと即座に conflict へ昇格する", async () => {
      const { storage } = await renderEditor({
        storage: createTestStorageSession({ initialJson: savedJson }),
      });

      // 保存済み・未編集の状態で外部更新イベント
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: mapBodyKey(storage.session.mapId),
            newValue: "{}\n",
          }),
        );
      });

      expect(screen.getAllByText(EXTERNAL_UPDATE_NOTICE_MESSAGE).length).toBeGreaterThan(0);
      expect(screen.queryByText(CONFLICT_NOTICE_MESSAGE)).not.toBeInTheDocument();

      // キャンバスを編集（ノード追加）
      addNodeAt(400, 300);

      // conflict へ昇格
      expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL })).toBeInTheDocument();
    });

    it("最新内容の再読み込みを行うと storageSession.rebaseSnapshot が呼ばれる", async () => {
      const latestDocJson = `${JSON.stringify({
        version: 3,
        layoutMode: "manual",
        nodes: [{ id: 777, parentId: null, label: "最新の外部ノード", importance: "medium", x: 150, y: 150, width: 100, height: 60 }],
      })}\n`;
      const testStorage = createTestStorageSession({ initialJson: savedJson });
      const rebaseSpy = jest.fn();
      testStorage.session.rebaseSnapshot = rebaseSpy;
      testStorage.session.readBody = () => ({ ok: true, value: latestDocJson });

      await renderEditor({ storage: testStorage });

      // 未保存編集ありにして確認ダイアログを開く
      addNodeAt(300, 200);

      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: mapBodyKey(testStorage.session.mapId),
            newValue: latestDocJson,
          }),
        );
      });

      fireEvent.click(screen.getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL }));
      const confirmDialog = screen.getByRole("dialog");
      fireEvent.click(within(confirmDialog).getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL }));

      expect(rebaseSpy).toHaveBeenCalledWith(latestDocJson);
    });
  });
});

it("枝外検索から戻ると複数選択・主選択・閉状態・集中・位置と倍率を復元し、進むと検索先へ戻る", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  selectCanvasNodeByLabel("内部ノード", true);
  expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
  const primary = screen.getByRole("navigation", { name: "パンくず" }).querySelector('[aria-current="location"]')?.textContent;
  act(() => {
    stageContainer().querySelector("canvas")!.dispatchEvent(new WheelEvent("wheel", {
      deltaY: -100, clientX: 120, clientY: 130, ctrlKey: true, cancelable: true,
    }));
  });
  const position = lastWorldContainer()?.position.set.mock.lastCall;
  const scale = lastWorldContainer()?.scale.set.mock.lastCall;
  await navigateBySearch(user, "別のルート");
  await user.click(screen.getByRole("button", { name: "閲覧を戻る" }));
  expect(screen.getByRole("button", { name: "集中表示を終了" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "パンくず" }).querySelector('[aria-current="location"]')?.textContent).toBe(primary);
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual(position);
  expect(lastWorldContainer()?.scale.set.mock.lastCall).toEqual(scale);
  await user.click(screen.getByRole("button", { name: "閲覧を進む" }));
  expect(screen.getByText("別のルート", { selector: '[aria-current="location"]' })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "閲覧を進む" })).toBeDisabled();
});

it("同じ位置への検索で進む履歴を保ち、フィットで分岐する", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "親ルート");
  await navigateBySearch(user, "別のルート");
  await user.click(screen.getByRole("button", { name: "閲覧を戻る" }));
  await navigateBySearch(user, "親ルート");
  const forward = screen.getByRole("button", { name: "閲覧を進む" });
  expect(forward).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "全体に合わせる" }));
  expect(forward).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "閲覧を戻る" }));
  expect(screen.getByText("親ルート", { selector: '[aria-current="location"]' })).toBeInTheDocument();
  expect(stageContainer()).toHaveFocus();
});

it("本文の編集Undo・Redoで閲覧履歴を保ち、消滅した主選択を復元しない", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "親ルート");
  await navigateBySearch(user, "別のルート");
  selectCanvasNodeByLabel("親ルート");
  fireEvent.keyDown(stageContainer(), { key: "Delete" });
  await user.click(screen.getByRole("button", { name: "元に戻す" }));
  await user.click(screen.getByRole("button", { name: "やり直す" }));
  expect(exportedMap().nodes.some(({ id }) => id === 1)).toBe(false);

  await user.click(screen.getByRole("button", { name: "閲覧を戻る" }));
  expect(screen.queryByRole("navigation", { name: "パンくず" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "閲覧を進む" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "閲覧を進む" }));
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual([-230, -30]);
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeEnabled();
});

it("同一文書で画面待ちの検索を新しい検索が追い越しても、遅い要求は位置と履歴を上書きしない", async () => {
  const user = await renderViewNavigationEditor();
  const { renderer } = jest.mocked(Application).mock.results.at(-1)!.value;
  const back = screen.getByRole("button", { name: "閲覧を戻る" });
  act(() => renderer.resize(0, 600));
  await navigateBySearch(user, "親ルート");
  expect(back).toBeDisabled();
  await navigateBySearch(user, "別のルート");
  expect(back).toBeDisabled();

  act(() => renderer.resize(800, 600));
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual([-230, -30]);
  await user.click(back);
  expect(back).toBeDisabled();
  expect(screen.queryByRole("navigation", { name: "パンくず" })).not.toBeInTheDocument();
  act(() => renderer.resize(900, 600));
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual([0, 0]);
});

it("パンとホイールでは履歴を追加せず、F の中央移動を一度だけ記録する", async () => {
  await renderViewNavigationEditor();
  const back = screen.getByRole("button", { name: "閲覧を戻る" });
  const undo = screen.getByRole("button", { name: "元に戻す" });
  act(() => {
    mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
    mockStageHandlers.pointermove?.(pointer(40, 30));
    mockStageHandlers.pointerup?.(pointer(40, 30));
    stageContainer().querySelector("canvas")!.dispatchEvent(new WheelEvent("wheel", {
      deltaY: -100, clientX: 120, clientY: 130, ctrlKey: true, cancelable: true,
    }));
  });
  selectCanvasNodeByLabel("別のルート");
  expect(back).toBeDisabled();
  const position = lastWorldContainer()?.position.set.mock.lastCall;
  stageContainer().focus();
  fireEvent.keyDown(stageContainer(), { key: "f" });
  fireEvent.keyDown(stageContainer(), { key: "f" });
  expect(back).toBeEnabled();
  fireEvent.click(back);
  expect(back).toBeDisabled();
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual(position);
  expect(undo).toBeDisabled();
});

it("編集Undoで旧文書世代の保留検索を破棄する", async () => {
  const user = await renderViewNavigationEditor();
  addNodeAt(50, 60);
  const { renderer } = jest.mocked(Application).mock.results.at(-1)!.value;
  act(() => renderer.resize(0, 600));
  await navigateBySearch(user, "別のルート");
  await user.click(screen.getByRole("button", { name: "元に戻す" }));
  act(() => renderer.resize(800, 600));

  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual([0, 0]);
  expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "やり直す" })).toBeEnabled();
});

it("パンくずから戻ると集中状態を戻し、集中終了の前後も往復できる", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  const breadcrumb = screen.getByRole("navigation", { name: "パンくず" });
  await user.click(within(breadcrumb).getByRole("button", { name: "親ルート" }));
  const back = screen.getByRole("button", { name: "閲覧を戻る" });
  const forward = screen.getByRole("button", { name: "閲覧を進む" });
  await user.click(back);
  await user.click(screen.getByRole("button", { name: "集中表示を終了" }));
  expect(forward).toBeDisabled();
  await user.click(back);
  expect(screen.getByRole("button", { name: "集中表示を終了" })).toBeInTheDocument();
  await user.click(forward);
  expect(screen.getByRole("button", { name: "枝に集中" })).toBeInTheDocument();
});

it("同一マップの本文をJSONで置き換えると閲覧履歴と保留検索を破棄する", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "親ルート");
  const back = screen.getByRole("button", { name: "閲覧を戻る" });
  expect(back).toBeEnabled();
  const { renderer } = jest.mocked(Application).mock.results.at(-1)!.value;
  act(() => renderer.resize(0, 600));
  await navigateBySearch(user, "別のルート");

  const changedJson = viewNavigationJson.replace("別のルート", "置き換え後のルート");
  const file = new File([changedJson], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => changedJson });
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(back).toBeDisabled());
  act(() => renderer.resize(800, 600));
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual([0, 0]);
  expect(screen.getByRole("button", { name: "閲覧を進む" })).toBeDisabled();
});

it("同じ倍率帯でも拡大側・縮小側から入った自動解像度を閲覧履歴で往復できる", async () => {
  const user = await renderViewNavigationEditor();
  const wheel = (deltaY: number) => {
    act(() => {
      stageContainer().querySelector("canvas")!.dispatchEvent(new WheelEvent("wheel", {
        deltaY, clientX: 120, clientY: 130, ctrlKey: true, cancelable: true,
      }));
    });
  };
  await navigateBySearch(user, "親ルート");
  // wheelZoom の感度積（delta × sensitivity）を固定し、感度変更でも同じ倍率帯の往復になるようにする
  const wheelZoomSensitivity = DEFAULT_WHEEL_ZOOM_SENSITIVITY;
  const stayInAllBandDelta = 0.03 / wheelZoomSensitivity;
  const crossMediumBandDelta = 0.09 / wheelZoomSensitivity;
  wheel(stayInAllBandDelta);
  const scale = lastWorldContainer()?.scale.set.mock.lastCall?.[0];
  expect(screen.getByText("現在: すべて")).toBeInTheDocument();
  await navigateBySearch(user, "別のルート");
  wheel(crossMediumBandDelta);
  wheel(-crossMediumBandDelta);
  expect(screen.getByText("現在: 中以上")).toBeInTheDocument();
  expect(lastWorldContainer()?.scale.set.mock.lastCall?.[0]).toBeCloseTo(scale);

  await user.click(screen.getByRole("button", { name: "閲覧を戻る" }));
  expect(screen.getByText("現在: すべて")).toBeInTheDocument();
  expect(lastWorldContainer()?.scale.set.mock.lastCall?.[0]).toBeCloseTo(scale);
  await user.click(screen.getByRole("button", { name: "閲覧を進む" }));
  expect(screen.getByText("現在: 中以上")).toBeInTheDocument();
  expect(lastWorldContainer()?.scale.set.mock.lastCall?.[0]).toBeCloseTo(scale);
});

it("画面待ちの検索を集中操作で上書きしたときは検索前の状態へ戻る", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "親ルート");
  const originalPosition = lastWorldContainer()?.position.set.mock.lastCall;
  const { renderer } = jest.mocked(Application).mock.results.at(-1)!.value;
  act(() => renderer.resize(0, 600));
  await navigateBySearch(user, "別のルート");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  expect(screen.getByRole("button", { name: "集中表示を終了" })).toBeInTheDocument();
  act(() => renderer.resize(800, 600));
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual(originalPosition);

  await user.click(screen.getByRole("button", { name: "閲覧を戻る" }));
  expect(screen.getByText("親ルート", { selector: '[aria-current="location"]' })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "枝に集中" })).toBeInTheDocument();
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual(originalPosition);
});

it("画面待ちの検索先が削除されたら次の検索は削除後の状態を保存する", async () => {
  const user = await renderViewNavigationEditor();
  await navigateBySearch(user, "親ルート");
  const originalPosition = lastWorldContainer()?.position.set.mock.lastCall;
  const { renderer } = jest.mocked(Application).mock.results.at(-1)!.value;
  act(() => renderer.resize(0, 600));
  await navigateBySearch(user, "別のルート");
  act(() => stageContainer().focus());
  fireEvent.keyDown(stageContainer(), { key: "Delete" });
  expect(exportedMap().nodes.some(({ id }) => id === 5)).toBe(false);
  await navigateBySearch(user, "内部ノード");
  act(() => renderer.resize(800, 600));

  await user.click(screen.getByRole("button", { name: "閲覧を戻る" }));
  expect(screen.queryByRole("navigation", { name: "パンくず" })).not.toBeInTheDocument();
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual(originalPosition);
});

it("ブックマークを保存し、再読込後は明示的な適用で閲覧状態とフォーカスを復元する", async () => {
  const user = userEvent.setup();
  const storage = createTestStorageSession({ initialJson: viewNavigationJson, storage: localStorage });
  const mapCreatedAt = "2026-11-20T00:00:00.000Z";
  const first = await renderEditor({ storage, mapCreatedAt });
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  selectCanvasNodeByLabel("内部ノード", true);
  expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
  const primary = screen.getByRole("navigation", { name: "パンくず" }).querySelector('[aria-current="location"]')?.textContent;
  act(() => {
    stageContainer().querySelector("canvas")!.dispatchEvent(new WheelEvent("wheel", {
      deltaY: -100, clientX: 120, clientY: 130, ctrlKey: true, cancelable: true,
    }));
  });
  const position = lastWorldContainer()?.position.set.mock.lastCall;
  const scale = lastWorldContainer()?.scale.set.mock.lastCall;
  await user.type(screen.getByRole("textbox", { name: "表示ブックマーク名" }), "集中");
  await user.click(screen.getByRole("button", { name: "現在の表示を保存" }));
  first.unmount();

  await renderEditor({ storage, mapCreatedAt });
  expect(screen.queryByRole("button", { name: "集中表示を終了" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();
  const apply = screen.getByRole("button", { name: "集中を適用" });
  act(() => apply.focus());
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "集中表示を終了" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "枝を展開" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "パンくず" }).querySelector('[aria-current="location"]')?.textContent).toBe(primary);
  expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual(position);
  expect(lastWorldContainer()?.scale.set.mock.lastCall).toEqual(scale);
  expect(stageContainer()).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "閲覧を戻る" }));
  expect(screen.queryByRole("button", { name: "集中表示を終了" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "集中を削除" }));
  expect(apply).not.toBeInTheDocument();
});

it("作成日時がない互換入口では表示ブックマーク保存が無効になる", async () => {
  await renderEditor({
    storage: createTestStorageSession({ initialJson: viewNavigationJson, storage: localStorage }),
  });
  expect(screen.getByRole("button", { name: "現在の表示を保存" })).toBeDisabled();
  expect(screen.getByText("このマップでは表示ブックマークを保存できません。")).toBeInTheDocument();
  await navigateBySearch(userEvent.setup(), "集中する枝");
  expect(screen.getByRole("button", { name: "枝に集中" })).toBeEnabled();
});

it("保護モードでは作成日時付きでも保存できず、閲覧操作は使える", async () => {
  await renderEditor({
    storage: createTestStorageSession({ initialJson: viewNavigationJson, storage: localStorage }),
    storageMode: "protected",
    mapCreatedAt: "2026-11-20T00:00:00.000Z",
  });
  expect(screen.getByRole("button", { name: "現在の表示を保存" })).toBeDisabled();
  expect(screen.getByText("このマップでは表示ブックマークを保存できません。")).toBeInTheDocument();
  await navigateBySearch(userEvent.setup(), "集中する枝");
  expect(screen.getByRole("button", { name: "枝に集中" })).toBeEnabled();
});

it("空名・重複名と保存・削除は閲覧履歴を変えず、失敗時は一覧と本文を保つ", async () => {
  const user = userEvent.setup();
  const storage = createTestStorageSession({ initialJson: viewNavigationJson, storage: localStorage });
  await renderEditor({ storage, mapCreatedAt: "2026-11-20T00:00:00.000Z" });
  const name = screen.getByRole("textbox", { name: "表示ブックマーク名" });
  const save = screen.getByRole("button", { name: "現在の表示を保存" });
  await user.click(save);
  expect(screen.getByText("表示ブックマーク名を入力してください。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();

  await user.type(name, "一つ目");
  await user.click(save);
  expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();
  await user.type(name, "一つ目");
  await user.click(save);
  expect(screen.getByText("同じ名前の表示ブックマークがすでにあります。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();

  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  await user.clear(name);
  await user.type(name, "二つ目");
  await user.click(save);
  expect(screen.getByText("表示ブックマークを保存できませんでした。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "一つ目を適用" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "二つ目を適用" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();
  expect(storage.writes).toEqual([]);
  expect(exportedMap().nodes).toEqual(JSON.parse(viewNavigationJson).nodes.map((node: ExportedMap["nodes"][number]) =>
    expect.objectContaining({ id: node.id, label: node.label, parentId: node.parentId })));

  jest.restoreAllMocks();
  await user.click(screen.getByRole("button", { name: "一つ目を削除" }));
  expect(screen.queryByRole("button", { name: "一つ目を適用" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();
  expect(name).toHaveFocus();
});

it("同じマップに JSON を取り込んでもブックマークを保持し、置き換え後の同じノード ID に適用する", async () => {
  const user = userEvent.setup();
  const storage = createTestStorageSession({ initialJson: viewNavigationJson, storage: localStorage });
  await renderEditor({ storage, mapCreatedAt: "2026-11-20T00:00:00.000Z" });
  await navigateBySearch(user, "集中する枝");
  await user.click(screen.getByRole("button", { name: "枝に集中" }));
  await user.type(screen.getByRole("textbox", { name: "表示ブックマーク名" }), "集中");
  await user.click(screen.getByRole("button", { name: "現在の表示を保存" }));
  const changedJson = viewNavigationJson.replace("集中する枝", "置き換えた枝");
  const file = new File([changedJson], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => changedJson });
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled());
  expect(screen.queryByRole("button", { name: "集中表示を終了" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "集中を適用" }));
  expect(screen.getByRole("button", { name: "集中表示を終了" })).toBeInTheDocument();
  expect(screen.getByText("置き換えた枝", { selector: '[aria-current="location"]' })).toBeInTheDocument();
});

it("外部変更を再読み込みした同じマップで表示ブックマークを保持する", async () => {
  const user = userEvent.setup();
  const storage = createTestStorageSession({ initialJson: viewNavigationJson, storage: localStorage });
  await renderEditor({ storage, mapCreatedAt: "2026-11-20T00:00:00.000Z" });
  await navigateBySearch(user, "集中する枝");
  await user.type(screen.getByRole("textbox", { name: "表示ブックマーク名" }), "外部変更前");
  await user.click(screen.getByRole("button", { name: "現在の表示を保存" }));
  const external = viewNavigationJson.replace("集中する枝", "外部で変更した枝");
  storage.session.readBody = () => ({ ok: true, value: external });
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: mapBodyKey(storage.session.mapId), newValue: external }));
  });
  await user.click(screen.getByRole("button", { name: RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL }));
  await waitFor(() => expect(exportedMap().nodes).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 2, label: "外部で変更した枝" })]),
  ));
  await user.click(screen.getByRole("button", { name: "外部変更前を適用" }));
  expect(screen.getByText("外部で変更した枝", { selector: '[aria-current="location"]' })).toBeInTheDocument();
});

it("長いブックマーク名の全体を適用・削除ボタンのアクセシブル名に使う", async () => {
  const user = userEvent.setup();
  const storage = createTestStorageSession({ initialJson: viewNavigationJson, storage: localStorage });
  await renderEditor({ storage, mapCreatedAt: "2026-11-20T00:00:00.000Z" });
  const name = "長い表示ブックマーク名".repeat(4);
  await user.type(screen.getByRole("textbox", { name: "表示ブックマーク名" }), name);
  await user.click(screen.getByRole("button", { name: "現在の表示を保存" }));
  const apply = screen.getByRole("button", { name: `${name}を適用` });
  const remove = screen.getByRole("button", { name: `${name}を削除` });
  expect(apply).toHaveAttribute("title", name);
  expect(remove).toBeEnabled();
});

describe("MapEditor のズームコントロール", () => {
  it("修飾キーなしのホイールでパンし倍率は変えない", async () => {
    await renderEditor();
    addNodeAt(300, 200);
    const world = lastWorldContainer()!;
    const scaleBefore = world.scale.set.mock.lastCall;
    const positionBefore = world.position.set.mock.lastCall;

    act(() => {
      stageContainer().querySelector("canvas")!.dispatchEvent(new WheelEvent("wheel", {
        deltaY: 100,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        cancelable: true,
      }));
    });

    expect(world.scale.set.mock.lastCall).toEqual(scaleBefore);
    expect(world.position.set.mock.lastCall).not.toEqual(positionBefore);
  });

  it("マップ表示のとき右下の±で中央基準×1.25ズームし閲覧履歴に積まない", async () => {
    const user = userEvent.setup();
    await renderEditor();
    addNodeAt(300, 200);

    const zoom = screen.getByRole("group", { name: "ズーム" });
    expect(zoom).toHaveClass("absolute", "bottom-3", "right-3");
    expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "拡大" }));

    expect(lastWorldContainer()?.scale.set).toHaveBeenLastCalledWith(1.25);
    expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(-100, -75);
    expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "縮小" }));

    expect(lastWorldContainer()?.scale.set).toHaveBeenLastCalledWith(1);
    const position = lastWorldContainer()?.position.set.mock.lastCall;
    expect(position?.[0]).toBeCloseTo(0);
    expect(position?.[1]).toBeCloseTo(0);
    expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();
  });

  it("アウトライン表示ではズームコントロールを出さない", async () => {
    const user = userEvent.setup();
    await renderEditor();
    addNodeAt(300, 200);

    expect(screen.getByRole("group", { name: "ズーム" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "アウトライン" }));

    expect(screen.queryByRole("group", { name: "ズーム" })).not.toBeInTheDocument();
  });

  it("マップ表示ではズーム感度スライダーがあり、アウトラインでは出さない", async () => {
    const user = userEvent.setup();
    await renderEditor();

    expect(screen.getByLabelText("ズーム感度")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "アウトライン" }));

    expect(screen.queryByLabelText("ズーム感度")).not.toBeInTheDocument();
  });

  it("ズーム感度スライダーを変えるとCtrl+ホイールの倍率が変わる", async () => {
    const user = userEvent.setup();
    await renderEditor();
    addNodeAt(300, 200);

    const slider = screen.getByLabelText("ズーム感度");
    await user.click(slider);
    fireEvent.change(slider, { target: { value: "0.005" } });

    const canvas = stageContainer().querySelector("canvas")!;
    act(() => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 120,
        clientY: 130,
        deltaY: -100,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        ctrlKey: true,
        cancelable: true,
      }));
    });

    expect(lastWorldContainer()?.scale.set).toHaveBeenLastCalledWith(Math.exp(0.5));
  });
});

describe("書き出し対象スコープの配線", () => {
  function exportScopeGroup() {
    return screen.getByRole("group", { name: "書き出し対象" });
  }

  async function selectExportScope(user: ReturnType<typeof userEvent.setup>, label: "全件" | "表示中" | "選択") {
    await user.click(within(exportScopeGroup()).getByRole("button", { name: label === "選択" ? /^選択/ : label }));
  }

  function selectionScopeButton() {
    return within(exportScopeGroup()).getByRole("button", { name: /^選択/ });
  }

  it("表示中スコープでは visibleNodeIds のノードだけが画像・Markdown に渡る", async () => {
    const user = await renderViewNavigationEditor();
    await navigateBySearch(user, "集中する枝");
    await user.click(screen.getByRole("button", { name: "枝に集中" }));

    await selectExportScope(user, "表示中");
    await user.click(screen.getByRole("button", { name: /SVG書き出し/ }));

    expect(mockCreateMapSvgExport).toHaveBeenCalled();
    const exportedIds = (mockCreateMapSvgExport.mock.lastCall![0] as Array<{ id: number; label: string }>)
      .map((node) => node.label)
      .sort();
    expect(exportedIds).toEqual(["内部ノード", "末端ノード", "集中する枝"]);

    await user.click(screen.getByRole("button", { name: /Markdown書き出し/ }));
    expect(mockDownloadOutlineText).toHaveBeenLastCalledWith(
      expect.stringContaining("集中する枝"),
      "テストのマップ",
      "md",
    );
    expect(mockDownloadOutlineText.mock.lastCall![0]).not.toContain("親ルート");
    expect(mockDownloadOutlineText.mock.lastCall![0]).not.toContain("別のルート");
  });

  it("選択0件・複数選択では選択スコープを選べず、map と outline の両方で無効になる", async () => {
    const user = await renderViewNavigationEditor();
    expect(selectionScopeButton()).toBeDisabled();

    await navigateBySearch(user, "親ルート");
    expect(selectionScopeButton()).toBeEnabled();

    act(() => {
      mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(300, 200, { ctrlKey: true }));
      mockStageHandlers.pointerup?.(pointer(300, 200, { ctrlKey: true }));
    });
    expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
    expect(selectionScopeButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(selectionScopeButton()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "マップ" }));

    // 選択解除（背景クリック相当）
    act(() => {
      mockStageHandlers.pointerdown?.(pointer(10, 10));
      mockStageHandlers.pointerup?.(pointer(10, 10));
    });
    expect(selectionScopeButton()).toBeDisabled();
  });

  it("選択スコープ中に選択解除すると全件へ戻る", async () => {
    const user = await renderViewNavigationEditor();
    await navigateBySearch(user, "集中する枝");
    await selectExportScope(user, "選択");

    expect(selectionScopeButton()).toHaveAttribute("aria-pressed", "true");
    expect(within(exportScopeGroup()).getByRole("button", { name: "全件" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    act(() => {
      mockStageHandlers.pointerdown?.(pointer(10, 10, { target: mockStage }));
      mockStageHandlers.pointerup?.(pointer(10, 10, { target: mockStage }));
    });

    expect(selectionScopeButton()).toBeDisabled();
    expect(within(exportScopeGroup()).getByRole("button", { name: "全件" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("選択スコープでは SVG・箇条書きが無効で、表示中では JSON・箇条書きが無効", async () => {
    const user = await renderViewNavigationEditor();
    await navigateBySearch(user, "集中する枝");

    await selectExportScope(user, "選択");
    expect(screen.getByRole("button", { name: /SVG書き出し/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /箇条書き書き出し/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /PNG書き出し/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Markdown書き出し/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /JSON書き出し/ })).toBeEnabled();

    await selectExportScope(user, "表示中");
    expect(screen.getByRole("button", { name: /JSON書き出し/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /箇条書き書き出し/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /SVG書き出し/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Markdown書き出し/ })).toBeEnabled();
  });

  it("visibleNodeIds が空のとき表示中書き出しを無効化する", async () => {
    const user = userEvent.setup();
    await renderEditor();
    await selectExportScope(user, "表示中");

    const png = screen.getByRole("button", { name: /PNG書き出し/ });
    expect(png).toBeDisabled();
    expect(screen.getByRole("button", { name: /SVG書き出し/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Markdown書き出し/ })).toBeDisabled();
    expect(png).toHaveAccessibleName(/書き出すノードがありません|表示中/);
  });

  it("選択スコープの JSON は根の parentId を null に正規化する", async () => {
    const user = await renderViewNavigationEditor();
    await navigateBySearch(user, "集中する枝");
    await selectExportScope(user, "選択");

    fireEvent.click(screen.getByRole("button", { name: /JSON書き出し/ }));
    const exported = JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
    expect(exported.nodes.map((node) => node.label).sort()).toEqual([
      "内部ノード",
      "末端ノード",
      "集中する枝",
    ]);
    expect(exported.nodes.find((node) => node.label === "集中する枝")?.parentId).toBeNull();
    expect(exported.nodes.find((node) => node.label === "内部ノード")?.parentId).not.toBeNull();
  });
});

function canvasNodeContentAlpha(label: string): number | undefined {
  const container = findInteractiveCanvasNode(label);
  if (!container) return undefined;
  const shape = container.addChild.mock.calls[0]?.[0] as { alpha?: number } | undefined;
  return shape?.alpha ?? 1;
}

describe("一時強調表示", () => {
  it("検索ヒットモードで非ヒットの論理可視ノードが薄くなる（ヒットテストは維持）", async () => {
    const user = await renderViewNavigationEditor();
    await user.selectOptions(screen.getByRole("combobox", { name: "一時強調" }), "検索ヒット");
    const search = screen.getByRole("combobox", { name: "ノードを検索" });
    await user.clear(search);
    await user.type(search, "末端");

    expect(canvasNodeContentAlpha("末端ノード")).toBe(1);
    expect(canvasNodeContentAlpha("親ルート")).toBe(0.25);
    expect(isCanvasNodeInteractive("親ルート")).toBe(true);
  });

  it("選択枝モードで選択部分木以外が薄くなり、オフに戻すと通常 alpha", async () => {
    const user = await renderViewNavigationEditor();
    await navigateBySearch(user, "集中する枝");
    await user.selectOptions(screen.getByRole("combobox", { name: "一時強調" }), "選択枝");

    expect(canvasNodeContentAlpha("集中する枝")).toBe(1);
    expect(canvasNodeContentAlpha("末端ノード")).toBe(1);
    expect(canvasNodeContentAlpha("別のルート")).toBe(0.25);

    await user.selectOptions(screen.getByRole("combobox", { name: "一時強調" }), "オフ");
    expect(canvasNodeContentAlpha("別のルート")).toBe(1);
  });
});

describe("深さによる表示制限", () => {
  it("深さを変えると検索候補の表示／非表示が変わる", async () => {
    const user = await renderViewNavigationEditor();
    const depth = screen.getByRole("combobox", { name: "深さ" });
    const search = screen.getByRole("combobox", { name: "ノードを検索" });

    await user.selectOptions(depth, "0（ルート）");
    await user.clear(search);
    await user.type(search, "末端");
    expect(screen.getByRole("option", { name: /末端ノード.*非表示/ })).toBeInTheDocument();
    expect(isCanvasNodeInteractive("末端ノード")).toBe(false);
    expect(isCanvasNodeInteractive("親ルート")).toBe(true);

    await user.selectOptions(depth, "無制限");
    await user.clear(search);
    await user.type(search, "末端");
    expect(screen.getByRole("option", { name: "末端ノード（親: 内部ノード）" })).toBeInTheDocument();
    expect(isCanvasNodeInteractive("末端ノード")).toBe(true);
  });

  it("深さ制限で表示0件なら無制限へ戻せる", async () => {
    const user = await renderViewNavigationEditor();
    await navigateBySearch(user, "集中する枝");
    await user.click(screen.getByRole("button", { name: "枝に集中" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "深さ" }), "0（ルート）");

    expect(screen.getByRole("status", { name: "深さ制限の表示案内" })).toHaveTextContent(
      "深さ制限により表示できるノードがありません。",
    );
    await user.click(screen.getByRole("button", { name: "深さを無制限に戻す" }));

    expect(screen.queryByRole("button", { name: "深さを無制限に戻す" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "深さ" })).toHaveValue("unlimited");
    expect(isCanvasNodeInteractive("集中する枝")).toBe(true);
  });
});

describe("ミニマップの配線", () => {
  beforeEach(() => {
    // getContext は引数ごとのオーバーロードがあり、spyOn の型は最後のもの（webgpu）になる
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: jest.fn(),
      strokeRect: jest.fn(),
      clearRect: jest.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      globalAlpha: 1,
    } as never);
  });

  it("マップ表示でミニマップを出し、ビューポート矩形がズームに追従する", async () => {
    const user = userEvent.setup();
    await renderEditor();
    addNodeAt(300, 200);

    const minimap = screen.getByRole("group", { name: "ミニマップ" });
    expect(minimap).toHaveClass("absolute", "bottom-3", "left-3");
    const rectBefore = screen.getByTestId("minimap-viewport-rect");
    const styleBefore = {
      left: rectBefore.style.left,
      top: rectBefore.style.top,
      width: rectBefore.style.width,
      height: rectBefore.style.height,
    };

    await user.click(screen.getByRole("button", { name: "拡大" }));

    const rectAfter = screen.getByTestId("minimap-viewport-rect");
    expect({
      left: rectAfter.style.left,
      top: rectAfter.style.top,
      width: rectAfter.style.width,
      height: rectAfter.style.height,
    }).not.toEqual(styleBefore);
  });

  it("ミニマップのクリックでキャンバスがパンする", async () => {
    await renderEditor();
    addNodeAt(300, 200);

    const canvas = screen.getByRole("group", { name: "ミニマップ" }).querySelector("canvas")!;
    jest.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 160,
      bottom: 120,
      width: 160,
      height: 120,
      toJSON: () => ({}),
    });
    const positionBefore = lastWorldContainer()?.position.set.mock.lastCall;

    fireEvent.mouseDown(canvas, { clientX: 120, clientY: 90, button: 0 });

    const positionAfter = lastWorldContainer()?.position.set.mock.lastCall;
    expect(positionAfter).not.toEqual(positionBefore);
  });

  it("アウトライン表示ではミニマップを出さない", async () => {
    const user = userEvent.setup();
    await renderEditor();
    addNodeAt(300, 200);
    expect(screen.getByRole("group", { name: "ミニマップ" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "アウトライン" }));

    expect(screen.queryByRole("group", { name: "ミニマップ" })).not.toBeInTheDocument();
  });
});
