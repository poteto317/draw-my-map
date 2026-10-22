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
  dialogMouseClickedAtRef?: RefObject<number | null>;
};

async function renderEditor({
  mapName = "テストのマップ",
  shortcutsEnabled = true,
  mapControls = null,
  storage = createTestStorageSession(),
  dialogMouseClickedAtRef = { current: null },
}: RenderEditorOptions = {}) {
  const rendered = await renderReady(
    <MapEditor
      mapId={storage.session.mapId}
      mapName={mapName}
      storageSession={storage.session}
      mapControls={mapControls}
      shortcutsEnabled={shortcutsEnabled}
      dialogMouseClickedAtRef={dialogMouseClickedAtRef}
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
});
