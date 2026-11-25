import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  lastWorldContainer,
  mockNodePointerHandlers,
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
} from "@/domain/mapLibrary/mapConflictMessages";
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

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

const baseNodesJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
    { id: 2, parentId: 1, label: "子", importance: "low", x: 220, y: 100, width: 100, height: 60 },
  ],
});

function defaultSnapshot(offsetX: number) {
  return {
    viewport: { offsetX, offsetY: 0, scale: 1 },
    selectedNodeId: null,
    selectedNodeIds: [] as number[],
    focusRootId: null,
    collapsedNodeIds: [] as number[],
    resolutionMode: "auto" as const,
    autoResolutionLevel: "all" as const,
  };
}

function jsonWithTour(
  offsets: number[],
  captions: Array<string | undefined> = [],
  selectedNodeId: number | null = null,
  overrides: Record<string, unknown> = {},
) {
  const base = JSON.parse(baseNodesJson) as Record<string, unknown>;
  return JSON.stringify({
    ...base,
    ...overrides,
    tour: {
      version: 1,
      title: "案内ツアー",
      steps: offsets.map((offsetX, index) => ({
        id: `step-${index + 1}`,
        snapshot: {
          ...defaultSnapshot(offsetX),
          selectedNodeId,
          selectedNodeIds: selectedNodeId === null ? [] : [selectedNodeId],
        },
        ...(captions[index] ? { caption: captions[index] } : {}),
      })),
    },
  });
}

type RenderEditorOptions = {
  storageMode?: "persistent" | "protected";
  storage?: TestStorageSession;
  dialogMouseClickedAtRef?: RefObject<number | null>;
};

async function renderEditor({
  storageMode = "persistent",
  storage = createTestStorageSession(),
  dialogMouseClickedAtRef = { current: null },
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
      onSaveCurrentAsNewMap={undefined}
      pendingNavigation={null}
      onConsumePendingNavigation={() => {}}
      onSwitchToMapTarget={() => {}}
      brokenLinksDialogRequest={0}
      onBrokenLinksDialogClosed={() => {}}
    />,
  );
}

function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

function editorRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-map-id]")!;
}

function startButtons(): HTMLElement[] {
  return screen.getAllByRole("button", { name: "プレゼン開始" });
}

function startButton(): HTMLElement {
  return startButtons()[0]!;
}

function tourButton(): HTMLElement {
  return screen.getByRole("button", { name: "ツアー" });
}

function tourDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "ツアー" });
}

function playbackRegion(): HTMLElement {
  return screen.getByRole("region", { name: "プレゼン再生" });
}

function addNodeAt(x: number, y: number) {
  fireEvent.doubleClick(stageContainer(), { clientX: x, clientY: y });
}

async function navigateBySearch(user: ReturnType<typeof userEvent.setup>, label: string) {
  const search = screen.getByRole("combobox", { name: "ノードを検索" });
  await user.clear(search);
  await user.type(search, label);
  await user.keyboard("{ArrowDown}{Enter}");
}

async function createTourWithSteps(user: ReturnType<typeof userEvent.setup>, stepCount: number) {
  addNodeAt(300, 200);
  await user.click(tourButton());
  const dialog = tourDialog();
  await user.type(within(dialog).getByLabelText("ツアーのタイトル"), "案内ツアー");
  await user.click(within(dialog).getByRole("button", { name: "ツアーを作成" }));
  for (let index = 0; index < stepCount; index += 1) {
    if (index > 0) {
      act(() => {
        mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStageHandlers }));
        mockStageHandlers.pointermove?.(pointer(30 * index, 20));
        mockStageHandlers.pointerup?.(pointer(30 * index, 20));
      });
    }
    await user.click(within(dialog).getByRole("button", { name: "現在の表示をステップに追加" }));
  }
  await user.click(within(dialog).getByRole("button", { name: "閉じる" }));
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

beforeEach(() => {
  resetMapStageTestRuntime();
  setViewportCullingEnabled(true);
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

describe("MapEditor プレゼン再生（Task 4 / inventory N3–N7）", () => {
  it("ツアー未設定ではプレゼン開始が無効", async () => {
    await renderEditor();
    expect(startButton()).toBeDisabled();
  });

  it("保護モードではプレゼン開始が有効", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0]) });
    await renderEditor({ storage, storageMode: "protected" });
    expect(startButton()).toBeEnabled();
  });

  it("競合中はプレゼン開始が無効", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0]) });
    await renderEditor({ storage });
    await triggerEditConflict(storage);
    expect(startButton()).toBeDisabled();
  });

  it("外部削除検知後はプレゼン開始が無効", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0]) });
    await renderEditor({ storage });
    addNodeAt(300, 200);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: mapBodyKey(storage.session.mapId),
          newValue: null,
        }),
      );
    });
    expect(screen.getAllByText(EXTERNALLY_DELETED_NOTICE_MESSAGE).length).toBeGreaterThan(0);
    expect(startButton()).toBeDisabled();
  });

  it("開始で先頭を適用し、終了で開始前表示へ戻す", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0, 80]) });
    await renderEditor({ storage });
    const beforeStart = lastWorldContainer()?.position.set.mock.lastCall;
    await navigateBySearch(user, "子");
    const beforePlay = lastWorldContainer()?.position.set.mock.lastCall;
    expect(beforePlay).not.toEqual(beforeStart);

    fireEvent.click(startButton());
    expect(playbackRegion()).toBeInTheDocument();
    expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual([0, 0]);

    fireEvent.click(within(playbackRegion()).getByRole("button", { name: "終了" }));
    expect(screen.queryByRole("region", { name: "プレゼン再生" })).not.toBeInTheDocument();
    expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual(beforePlay);
  });

  it("再生のページ送りは閲覧履歴に積まず、前後ボタンは端で無効", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0, 80]) });
    await renderEditor({ storage });
    await navigateBySearch(user, "子");
    expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeEnabled();

    await user.click(startButton());
    const region = playbackRegion();
    const back = within(region).getByRole("button", { name: "戻る" });
    const forward = within(region).getByRole("button", { name: "次へ" });
    expect(back).toBeDisabled();
    expect(forward).toBeEnabled();
    await user.click(forward);
    expect(back).toBeEnabled();
    expect(forward).toBeDisabled();
    expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();
    await user.click(within(region).getByRole("button", { name: "終了" }));
    expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeEnabled();
  });

  it("再生中はキャプションを表示し、空は非表示", async () => {
    const storage = createTestStorageSession({
      initialJson: jsonWithTour([0, 1], ["第一の案内", undefined]),
    });
    await renderEditor({ storage });
    fireEvent.click(startButton());
    expect(screen.getByText("第一の案内")).toBeInTheDocument();
    fireEvent.click(within(playbackRegion()).getByRole("button", { name: "次へ" }));
    expect(screen.queryByText("第一の案内")).not.toBeInTheDocument();
  });

  it("再生中は根 inert なし・編集 Undo 無効・Escape で終了", async () => {
    await renderEditor();
    const user = userEvent.setup();
    await createTourWithSteps(user, 1);
    fireEvent.click(startButton());
    expect(editorRoot()).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "プレゼン再生" })).not.toBeInTheDocument();
  });

  it("アウトラインからプレゼン開始するとマップ表示へ切り替わり再生バーを表示する（N4）", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0, 40]) });
    await renderEditor({ storage });
    await user.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.getByRole("button", { name: "アウトライン" })).toHaveAttribute("aria-pressed", "true");

    await user.click(startButton());

    expect(screen.getByRole("button", { name: "マップ" })).toHaveAttribute("aria-pressed", "true");
    expect(playbackRegion()).toBeInTheDocument();
    expect(within(playbackRegion()).getByText("1 / 2")).toBeInTheDocument();
  });

  it("再生中は表示モード切替が無効（inventory C1/C2）", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0, 40]) });
    await renderEditor({ storage });
    fireEvent.click(startButton());
    expect(screen.getByRole("button", { name: "マップ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "アウトライン" })).toBeDisabled();
  });

  it("再生中は枝の折りたたみが無効（inventory E1c/E1d 同型）", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0], [], 1) });
    await renderEditor({ storage });
    await navigateBySearch(user, "ルート");
    expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toBeEnabled();
    fireEvent.click(startButton());
    expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toBeDisabled();
  });

  it("再生中はレイアウトモードとヘッダーレイアウト操作が無効（U43）", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({
      initialJson: jsonWithTour([0], [], 1, { layoutMode: "auto" }),
    });
    await renderEditor({ storage });
    await navigateBySearch(user, "ルート");
    await user.click(startButton());

    expect(screen.getByRole("button", { name: "自動配置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "手動配置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "直交" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "左→右" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "編集ロック" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "文字" })).toBeDisabled();
  });

  it("再生中はノード検索と全マップ検索が無効", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0]) });
    await renderEditor({ storage });
    fireEvent.click(startButton());

    expect(screen.getByRole("combobox", { name: "ノードを検索" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "全マップ検索" })).toBeDisabled();
  });

  it("再生中はツアー編集・取込・ブックマーク・閲覧履歴が無効", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0, 1]) });
    await renderEditor({ storage });
    fireEvent.click(startButton());
    expect(tourButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "箇条書きから追加" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "表示ブックマーク名" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "閲覧を戻る" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "枝を複製" })).toBeDisabled();
  });

  it("再生中はヘッダー構造操作と JSON 読み込みが無効（E9/E5）", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0], [], 1) });
    await renderEditor({ storage });
    await navigateBySearch(user, "ルート");
    fireEvent.click(startButton());

    expect(screen.getByRole("button", { name: "枝を移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "一括置換" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ノードを分割" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ノードを統合" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "枝を上へ移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "枝を下へ移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "枝の階層を上げる" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "枝の階層を下げる" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "選択中のノードに親を挿入" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "選択中のノードだけ削除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "JSON読み込み" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "JSON書き出し" })).toBeEnabled();
  });

  it("再生中はノード右クリックで構造用コンテキストメニューを開かない（E12）", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0]) });
    await renderEditor({ storage });
    fireEvent.click(startButton());
    mockStageBounds(stageContainer());
    fireEvent.contextMenu(stageContainer(), { clientX: 100, clientY: 60 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("再生中は左右矢印で前後し、ページ送り後も Undo は表示を巻き戻さない", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0, 40]) });
    await renderEditor({ storage });
    fireEvent.click(startButton());
    const first = lastWorldContainer()?.position.set.mock.lastCall;
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const second = lastWorldContainer()?.position.set.mock.lastCall;
    expect(second).not.toEqual(first);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(lastWorldContainer()?.position.set.mock.lastCall).toEqual(second);
  });

  it("関連線選択中でも保護モードで再生開始できる（inventory 代表）", async () => {
    const json = JSON.stringify({
      ...JSON.parse(baseNodesJson),
      relations: [{ id: 10, fromId: 1, toId: 2, kind: "related", directed: false }],
      tour: JSON.parse(jsonWithTour([0])).tour as unknown,
    });
    const storage = createTestStorageSession({ initialJson: json });
    await renderEditor({ storage, storageMode: "protected" });
    fireEvent.click(startButton());
    expect(playbackRegion()).toBeInTheDocument();
  });

  it("ステップ追加→保存→再読込→再生で順序とキャプションが一致", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession();
    await renderEditor({ storage });
    await createTourWithSteps(user, 2);
    await user.click(tourButton());
    const dialog = tourDialog();
    await user.click(within(dialog).getByRole("button", { name: "ステップ 1" }));
    await user.type(within(dialog).getByLabelText("キャプション（任意）"), "保存後も残る");
    await user.click(within(dialog).getByRole("button", { name: "キャプションを保存" }));
    await user.click(within(dialog).getByRole("button", { name: "閉じる" }));

    await waitFor(() => expect(storage.writes.length).toBeGreaterThan(0));
    const saved = storage.writes.at(-1)!;
    cleanup();
    const reloaded = createTestStorageSession({ initialJson: saved, mapId: storage.session.mapId });
    await renderEditor({ storage: reloaded });
    expect(startButton()).toBeEnabled();
    fireEvent.click(startButton());
    expect(screen.getByText("保存後も残る")).toBeInTheDocument();
    expect(within(playbackRegion()).getByText("1 / 2")).toBeInTheDocument();
    fireEvent.click(within(playbackRegion()).getByRole("button", { name: "次へ" }));
    expect(within(playbackRegion()).getByText("2 / 2")).toBeInTheDocument();
  });
});

describe("MapEditor 再生中の構造編集ブロック（E8/E11/E13）", () => {
  async function startPresentation(storage: TestStorageSession) {
    await renderEditor({ storage });
    fireEvent.click(startButton());
    expect(playbackRegion()).toBeInTheDocument();
  }

  it("再生中はダブルクリックでラベル編集・空キャンバスへのノード追加を始めない（E8）", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0]) });
    await startPresentation(storage);
    await user.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const beforeExport = JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as {
      nodes: Array<{ id: number }>;
    };
    mockDownloadMapJson.mockClear();

    fireEvent.doubleClick(stageContainer(), { clientX: 150, clientY: 130 });
    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();

    fireEvent.doubleClick(stageContainer(), { clientX: 300, clientY: 200 });

    await user.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const afterExport = JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as {
      nodes: Array<{ id: number }>;
    };
    expect(afterExport.nodes.map((node) => node.id)).toEqual(beforeExport.nodes.map((node) => node.id));
  });

  it("再生中は右パネルと重要度の属性編集を無効にする（E11）", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0], [], 1) });
    await renderEditor({ storage });
    await navigateBySearch(user, "ルート");
    await user.click(startButton());

    expect(screen.getByRole("textbox", { name: "詳細メモ" })).toBeDisabled();
    expect(screen.getByLabelText("タグを追加")).toBeDisabled();
    expect(screen.getByRole("button", { name: "重要度 高" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重要度 中" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重要度 低" })).toBeDisabled();
  });

  it("再生中はノードドラッグで座標を変えず、キャンバスのパンはできる（E13）", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0]) });
    await startPresentation(storage);

    const panCallsBefore = lastWorldContainer()?.position.set.mock.calls.length ?? 0;
    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(50, 40));
      mockStageHandlers.pointerup?.(pointer(50, 40));
    });
    expect(lastWorldContainer()?.position.set.mock.calls.length).toBeGreaterThan(panCallsBefore);

    mockDownloadMapJson.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const beforeMove = JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as {
      nodes: Array<{ id: number; x: number; y: number }>;
    };
    const root = beforeMove.nodes.find((node) => node.id === 1)!;

    act(() => {
      mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(150, 130));
      mockStageHandlers.pointermove?.(pointer(280, 220));
      mockStageHandlers.pointerup?.(pointer(280, 220));
    });

    mockDownloadMapJson.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const afterMove = JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as {
      nodes: Array<{ id: number; x: number; y: number }>;
    };
    const rootAfter = afterMove.nodes.find((node) => node.id === 1)!;
    expect(rootAfter).toMatchObject({ x: root.x, y: root.y });
  });
});