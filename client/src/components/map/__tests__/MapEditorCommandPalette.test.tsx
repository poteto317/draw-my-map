import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode, RefObject } from "react";
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

jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: jest.fn(),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

type ExportedMap = { nodes: Array<{ id: number; label: string; parentId: number | null }> };

type RenderEditorOptions = {
  mapName?: string;
  shortcutsEnabled?: boolean;
  mapControls?: ReactNode;
  storage?: TestStorageSession;
  dialogMouseClickedAtRef?: RefObject<number | null>;
  mapId?: string;
};

async function renderEditor({
  mapName = "テストのマップ",
  shortcutsEnabled = true,
  mapControls = null,
  storage = createTestStorageSession(),
  dialogMouseClickedAtRef = { current: null },
  mapId,
}: RenderEditorOptions = {}) {
  const resolvedMapId = mapId ?? storage.session.mapId;
  const rendered = await renderReady(
    <MapEditor
      mapId={resolvedMapId}
      exportButtonRef={{ current: null }}
      mapMoveTargets={[
        {
          id: resolvedMapId,
          name: mapName,
          createdAt: "2026-10-31T00:00:00.000Z",
          updatedAt: "2026-10-31T00:00:00.000Z",
        },
      ]}
      onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
      mapName={mapName}
      storageSession={storage.session}
      storageMode="persistent"
      mapControls={mapControls}
      shortcutsEnabled={shortcutsEnabled}
      dialogMouseClickedAtRef={dialogMouseClickedAtRef}
      pendingNavigation={null}
      onConsumePendingNavigation={() => {}}
      onSwitchToMapTarget={() => {}}
      brokenLinksDialogRequest={0}
      onBrokenLinksDialogClosed={() => {}}
    />,
  );
  mockStageBounds(stageContainer());
  return { ...rendered, storage, dialogMouseClickedAtRef };
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

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

function commandButton(): HTMLElement {
  return screen.getByRole("button", { name: "コマンド" });
}

function paletteDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "コマンドパレット" });
}

function paletteInput(): HTMLElement {
  return within(paletteDialog()).getByRole("combobox", { name: "コマンドを検索" });
}

async function openPaletteViaHeader() {
  await userEvent.click(commandButton());
  expect(paletteDialog()).toBeInTheDocument();
}

function openPaletteViaShortcut() {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(paletteDialog()).toBeInTheDocument();
}

function executePaletteQuery(query: string) {
  const input = paletteInput();
  fireEvent.change(input, { target: { value: query } });
  fireEvent.keyDown(input, { key: "Enter" });
}

const seedJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "親ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
    { id: 2, parentId: 1, label: "子ノード", importance: "low", x: 220, y: 180, width: 100, height: 60 },
  ],
});

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapEditor コマンドパレット配線", () => {
  it("operationControls 先頭の「コマンド」と Ctrl+K で開き、aria 属性を持つ", async () => {
    await renderEditor();
    const cmd = commandButton();
    const undo = screen.getByRole("button", { name: "元に戻す" });
    expect(cmd.compareDocumentPosition(undo)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(cmd).toHaveAttribute("aria-haspopup", "dialog");
    expect(cmd).toHaveAttribute("aria-expanded", "false");
    expect(cmd).toHaveAttribute("aria-keyshortcuts", "Control+K Meta+K");

    await openPaletteViaHeader();
    expect(cmd).toHaveAttribute("aria-expanded", "true");
    expect(paletteDialog()).toBeInTheDocument();

    fireEvent.click(within(paletteDialog()).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();

    openPaletteViaShortcut();
  });

  it("editorShortcutsEnabled 偽・他ダイアログ中・既 open ではヘッダーもショートカットも開かない", async () => {
    const { rerender, storage } = await renderEditor({ shortcutsEnabled: false });
    await userEvent.click(commandButton());
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();

    rerender(
      <MapEditor
        mapId={storage.session.mapId}
        exportButtonRef={{ current: null }}
        mapMoveTargets={[{
          id: storage.session.mapId,
          name: "テストのマップ",
          createdAt: "2026-10-31T00:00:00.000Z",
          updatedAt: "2026-10-31T00:00:00.000Z",
        }]}
        onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
        mapName="テストのマップ"
        storageSession={storage.session}
        storageMode="persistent"
        mapControls={null}
        shortcutsEnabled={true}
        dialogMouseClickedAtRef={{ current: null }}
        pendingNavigation={null}
        onConsumePendingNavigation={() => {}}
        onSwitchToMapTarget={() => {}}
        brokenLinksDialogRequest={0}
        onBrokenLinksDialogClosed={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "箇条書きから追加" }));
    expect(screen.getByRole("dialog", { name: "箇条書きから追加" })).toBeInTheDocument();
    await userEvent.click(commandButton());
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("dialog", { name: "箇条書きから追加" })).getByRole("button", { name: "キャンセル" }));
    await openPaletteViaHeader();
    const before = paletteDialog();
    await userEvent.click(commandButton());
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(paletteDialog()).toBe(before);
  });

  it("パレット open 時は editorShortcutsEnabled 偽・根 inert・履歴ショートカット停止・表示切替停止（L-061）", async () => {
    await renderEditor();
    addNodeAt(300, 200);
    expect(exportedMap().nodes).toHaveLength(1);
    expect(editorRoot()).not.toHaveAttribute("inert");

    await openPaletteViaHeader();
    expect(editorRoot()).toHaveAttribute("inert");

    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    fireEvent.click(within(paletteDialog()).getByRole("button", { name: "閉じる" }));
    expect(exportedMap().nodes).toHaveLength(1);

    await openPaletteViaHeader();
    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.getByRole("button", { name: "マップ" })).toHaveAttribute("aria-pressed", "true");
    expect(paletteDialog()).toBeInTheDocument();
  });

  it("edit.undo は同期委譲し execute-immediate 相当で閉じる", async () => {
    await renderEditor();
    addNodeAt(300, 200);
    expect(exportedMap().nodes).toHaveLength(1);

    await openPaletteViaHeader();
    executePaletteQuery("元に戻す");

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(exportedMap().nodes).toHaveLength(0);
  });

  it("view.outline は同期で表示切替し、成功 notice が残り、切替列へフォーカスする（execute-immediate）", async () => {
    await renderEditor({ storage: createTestStorageSession({ initialJson: seedJson }) });
    commandButton().focus();
    await openPaletteViaHeader();
    executePaletteQuery("アウトライン表示へ切替");

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "アウトライン" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "アウトライン" })).toBeInTheDocument();
    expect(commandButton()).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "階層1・親ルート" })).toHaveFocus();
    expect(screen.getByTestId("operation-notices")).toHaveTextContent(/アウトライン表示へ切替/);

    await openPaletteViaHeader();
    executePaletteQuery("マップ表示へ切替");
    expect(screen.getByRole("button", { name: "マップ" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(document.querySelector(".cursor-crosshair")).toHaveFocus());
  });

  it.each([
    ["ラベルを一括置換", "一括置換"],
    ["全マップ検索", "全マップ検索"],
  ] as const)("opensDialog: %s は execute-dialog 連鎖し open 先へフォーカス（直前へ戻らない）", async (query, dialogName) => {
    await renderEditor({ storage: createTestStorageSession({ initialJson: seedJson }) });
    commandButton().focus();
    await openPaletteViaHeader();
    executePaletteQuery(query);

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    const next = screen.getByRole("dialog", { name: dialogName });
    expect(next).toBeInTheDocument();
    expect(next.contains(document.activeElement)).toBe(true);
    expect(commandButton()).not.toHaveFocus();
  });

  it("opensDialog 連鎖の同一同期中に履歴ショートカットが発火しない（L-061）", async () => {
    await renderEditor();
    addNodeAt(300, 200);
    await openPaletteViaHeader();

    act(() => {
      executePaletteQuery("全マップ検索");
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    });

    expect(screen.getByRole("dialog", { name: "全マップ検索" })).toBeInTheDocument();
    expect(exportedMap().nodes).toHaveLength(1);
  });

  it("不可コマンドはコアを呼ばず live 拒否し、パレットは開いたまま", async () => {
    await renderEditor();
    await openPaletteViaHeader();
    executePaletteQuery("元に戻す");

    expect(paletteDialog()).toBeInTheDocument();
    await waitFor(() => {
      expect(within(paletteDialog()).getByRole("status")).toHaveTextContent(/元に戻せる操作がありません/);
    });
  });

  it("閉じてから遅延実行しない（Enter 後に waitFor なしで委譲完了）", async () => {
    await renderEditor();
    addNodeAt(300, 200);
    await openPaletteViaHeader();

    const input = paletteInput();
    fireEvent.change(input, { target: { value: "元に戻す" } });
    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    // setTimeout 遅延なし。同一 act フラッシュ後に結果が揃う
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(exportedMap().nodes).toHaveLength(0);
  });

  it("documentRevision 進行で stale 閉じ、restore-opener 列へフォーカス", async () => {
    await renderEditor();
    addNodeAt(300, 200);
    commandButton().focus();
    await openPaletteViaHeader();

    // jsdom は inert でも click 可能。Undo で revision を進めて stale を起こす
    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(commandButton()).toHaveFocus();
  });

  it("mapId 変化でも stale 閉じる", async () => {
    const storage = createTestStorageSession({ initialJson: seedJson });
    const dialogMouseClickedAtRef: RefObject<number | null> = { current: null };
    const { rerender } = await renderEditor({ storage, dialogMouseClickedAtRef });
    await openPaletteViaHeader();

    rerender(
      <MapEditor
        mapId="other-map-id"
        exportButtonRef={{ current: null }}
        mapMoveTargets={[{
          id: "other-map-id",
          name: "別マップ",
          createdAt: "2026-10-31T00:00:00.000Z",
          updatedAt: "2026-10-31T00:00:00.000Z",
        }]}
        onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
        mapName="別マップ"
        storageSession={storage.session}
        storageMode="persistent"
        mapControls={null}
        shortcutsEnabled={true}
        dialogMouseClickedAtRef={dialogMouseClickedAtRef}
        pendingNavigation={null}
        onConsumePendingNavigation={() => {}}
        onSwitchToMapTarget={() => {}}
        brokenLinksDialogRequest={0}
        onBrokenLinksDialogClosed={() => {}}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
  });

  it("パレット onMouseClick で dialogMouseClickedAtRef を更新する", async () => {
    const dialogMouseClickedAtRef: RefObject<number | null> = { current: null };
    await renderEditor({ dialogMouseClickedAtRef });
    await openPaletteViaHeader();

    fireEvent.click(within(paletteDialog()).getByRole("button", { name: "閉じる" }), { detail: 1 });
    expect(dialogMouseClickedAtRef.current).not.toBeNull();
  });

  it("edit.open-label-replace は確定 API を呼ばず確認ダイアログ経由のみ（L-688）", async () => {
    await renderEditor({ storage: createTestStorageSession({ initialJson: seedJson }) });
    await openPaletteViaHeader();
    executePaletteQuery("ラベルを一括置換");

    const dialog = screen.getByRole("dialog", { name: "一括置換" });
    expect(within(dialog).getByRole("button", { name: /置換/ })).toBeDisabled();
    expect(exportedMap().nodes.map((n) => n.label)).toEqual(["親ルート", "子ノード"]);
  });

  it("構造変更は正本 nodes を使い、兄弟順は parentId 基準（L-015 / L-472）", async () => {
    const json = `${JSON.stringify({
      version: 3,
      layoutMode: "manual",
      nodes: [
        { id: 1, parentId: null, label: "親", importance: "high", x: 100, y: 500, width: 100, height: 60 },
        { id: 2, parentId: 1, label: "兄", importance: "low", x: 100, y: 300, width: 100, height: 60 },
        { id: 3, parentId: 1, label: "弟", importance: "low", x: 100, y: 100, width: 100, height: 60 },
      ],
    })}\n`;
    await renderEditor({ storage: createTestStorageSession({ initialJson: json }) });
    // index は nodes 配列順。弟 (id=3) を選択
    act(() => {
      mockNodePointerHandlers.at(2 - 3)?.pointerdown?.(pointer(300, 200));
      mockStageHandlers.pointerup?.(pointer(300, 200));
    });

    await openPaletteViaHeader();
    executePaletteQuery("兄弟を上へ");

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    const nodes = exportedMap().nodes;
    const siblings = nodes.filter((n) => n.parentId === 1);
    expect(siblings.map((n) => n.label)).toEqual(["弟", "兄"]);
  });

  it("拒否はパレット内 live のみで、閉じると消え、成功 notice 枠とは分離される", async () => {
    await renderEditor();
    await openPaletteViaHeader();
    executePaletteQuery("元に戻す");
    await waitFor(() => {
      expect(within(paletteDialog()).getByRole("status")).toHaveTextContent(/元に戻せる操作がありません/);
    });
    expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();

    fireEvent.click(within(paletteDialog()).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
  });

  it("outline.begin-edit はパレット経由でラベル編集を開始する（enabled ガード迂回）", async () => {
    await renderEditor({ storage: createTestStorageSession({ initialJson: seedJson }) });
    await userEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    await userEvent.click(screen.getByRole("button", { name: "階層2・子ノード" }));

    await openPaletteViaHeader();
    executePaletteQuery("ラベル編集");

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "ラベル編集" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "ラベル編集" })).toHaveValue("子ノード");
  });

  it("outline.add-root は挿入後に空ラベル編集を開始し、パレット成功 notice は出さない", async () => {
    await renderEditor({ storage: createTestStorageSession({ initialJson: seedJson }) });
    await userEvent.click(screen.getByRole("button", { name: "アウトライン" }));

    await openPaletteViaHeader();
    executePaletteQuery("ルート追加");

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "ラベル編集" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "ラベル編集" })).toHaveValue("");
    expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
    expect(exportedMap().nodes).toHaveLength(3);
  });

  it("アウトライン表示の兄弟移動は notice 付き共有コアへ委譲する", async () => {
    const json = `${JSON.stringify({
      version: 3,
      layoutMode: "manual",
      nodes: [
        { id: 1, parentId: null, label: "親", importance: "high", x: 100, y: 100, width: 100, height: 60 },
        { id: 2, parentId: 1, label: "兄", importance: "low", x: 100, y: 200, width: 100, height: 60 },
        { id: 3, parentId: 1, label: "弟", importance: "low", x: 100, y: 300, width: 100, height: 60 },
      ],
    })}\n`;
    await renderEditor({ storage: createTestStorageSession({ initialJson: json }) });
    await userEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    await userEvent.click(screen.getByRole("button", { name: "階層2・弟" }));

    await openPaletteViaHeader();
    executePaletteQuery("兄弟を上へ");

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.getByTestId("operation-notices")).toHaveTextContent(/上へ|移動/);
    const siblings = exportedMap().nodes.filter((n) => n.parentId === 1);
    expect(siblings.map((n) => n.label)).toEqual(["弟", "兄"]);
  });

  it("search.focus-in-map はパレット閉鎖後にマップ内検索へフォーカスする", async () => {
    await renderEditor({ storage: createTestStorageSession({ initialJson: seedJson }) });
    await openPaletteViaHeader();
    executePaletteQuery("マップ内検索へフォーカス");

    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "ノードを検索" })).toHaveFocus();
  });

  it("選択 0 / 複数では edit.register-part を拒否し、単一選択では部品登録ダイアログを開く", async () => {
    await renderEditor({
      storage: createTestStorageSession({
        initialJson: seedJson,
        storage: window.localStorage,
      }),
    });

    // 選択 0（背景クリック）
    act(() => {
      mockStageHandlers.pointerdown?.(pointer(10, 10));
      mockStageHandlers.pointerup?.(pointer(10, 10));
    });
    await openPaletteViaHeader();
    executePaletteQuery("選択を部品に登録");
    expect(paletteDialog()).toBeInTheDocument();
    await waitFor(() => {
      expect(within(paletteDialog()).getByRole("status")).toHaveTextContent(/1 つだけ/);
    });
    fireEvent.click(within(paletteDialog()).getByRole("button", { name: "閉じる" }));

    // 単一選択
    act(() => {
      mockNodePointerHandlers.at(0)?.pointerdown?.(pointer(120, 120));
      mockStageHandlers.pointerup?.(pointer(120, 120));
    });
    await openPaletteViaHeader();
    executePaletteQuery("選択を部品に登録");
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "部品に登録" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "部品に登録" })).getByRole("button", { name: "キャンセル" }));

    // 複数選択
    act(() => {
      mockNodePointerHandlers.at(0)?.pointerdown?.(pointer(120, 120));
      mockStageHandlers.pointerup?.(pointer(120, 120));
      mockNodePointerHandlers.at(1)?.pointerdown?.(pointer(240, 200, { ctrlKey: true }));
      mockStageHandlers.pointerup?.(pointer(240, 200, { ctrlKey: true }));
    });
    expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
    await openPaletteViaHeader();
    executePaletteQuery("選択を部品に登録");
    expect(paletteDialog()).toBeInTheDocument();
    await waitFor(() => {
      expect(within(paletteDialog()).getByRole("status")).toHaveTextContent(/1 つだけ/);
    });
  });

  it("部品の登録→挿入（新ルート）がコマンドパレットから完走する", async () => {
    await renderEditor({
      storage: createTestStorageSession({
        initialJson: seedJson,
        storage: window.localStorage,
      }),
    });
    act(() => {
      mockNodePointerHandlers.at(0)?.pointerdown?.(pointer(120, 120));
      mockStageHandlers.pointerup?.(pointer(120, 120));
    });

    await openPaletteViaHeader();
    executePaletteQuery("選択を部品に登録");
    const registerDialog = screen.getByRole("dialog", { name: "部品に登録" });
    fireEvent.change(within(registerDialog).getByLabelText("部品名"), {
      target: { value: "再利用枝" },
    });
    fireEvent.click(within(registerDialog).getByRole("button", { name: "登録" }));
    expect(screen.queryByRole("dialog", { name: "部品に登録" })).not.toBeInTheDocument();

    await openPaletteViaHeader();
    executePaletteQuery("部品を挿入");
    const insertDialog = screen.getByRole("dialog", { name: "部品を挿入" });
    expect(within(insertDialog).getByRole("combobox", { name: "部品" })).toHaveDisplayValue("再利用枝");
    fireEvent.click(within(insertDialog).getByLabelText("新しいルートとして"));
    fireEvent.click(within(insertDialog).getByRole("button", { name: "挿入" }));

    const nodes = exportedMap().nodes;
    const roots = nodes.filter((n) => n.parentId === null);
    // 元ルート + 挿入した部品ルートの 2 本（ラベルは複製）
    expect(roots).toHaveLength(2);
    expect(roots.every((n) => n.label === "親ルート")).toBe(true);
    expect(nodes.filter((n) => n.label === "子ノード")).toHaveLength(2);
  });

  it("解像度でマップ非表示の選択でもアウトラインの兄弟移動可否はツールバーと一致する", async () => {
    const json = `${JSON.stringify({
      version: 3,
      layoutMode: "manual",
      nodes: [
        { id: 1, parentId: null, label: "親", importance: "high", x: 100, y: 100, width: 100, height: 60 },
        { id: 2, parentId: 1, label: "兄", importance: "low", x: 100, y: 200, width: 100, height: 60 },
        { id: 3, parentId: 1, label: "弟", importance: "low", x: 100, y: 300, width: 100, height: 60 },
      ],
    })}\n`;
    await renderEditor({ storage: createTestStorageSession({ initialJson: json }) });
    await userEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
    await userEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    await userEvent.click(screen.getByRole("button", { name: "階層2・弟" }));
    expect(screen.getByRole("button", { name: "1つ上" })).toBeEnabled();

    await openPaletteViaHeader();
    const input = paletteInput();
    fireEvent.change(input, { target: { value: "兄弟を上へ" } });
    const option = within(paletteDialog()).getByRole("option", { name: /兄弟を上へ/ });
    expect(option).not.toHaveAttribute("aria-disabled");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
    const siblings = exportedMap().nodes.filter((n) => n.parentId === 1);
    expect(siblings.map((n) => n.label)).toEqual(["弟", "兄"]);
  });
});
