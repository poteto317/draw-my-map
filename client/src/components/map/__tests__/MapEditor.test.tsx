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
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
import {
  CONFLICT_NOTICE_MESSAGE,
  EXTERNALLY_DELETED_NOTICE_MESSAGE,
  EXTERNAL_UPDATE_NOTICE_MESSAGE,
  RELOAD_SUCCESS_MESSAGE,
  SAVE_AS_COPY_BUTTON_LABEL,
  RELOAD_EXTERNAL_BUTTON_LABEL,
  RELOAD_CONFIRM_ACTION_LABEL,
} from "@/domain/mapLibrary/mapConflictMessages";
import { createConflictCopyName } from "@/domain/mapLibrary/mapConflict";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";

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
  shortcutsEnabled?: boolean;
  mapControls?: ReactNode;
  storage?: TestStorageSession;
  dialogMouseClickedAtRef?: RefObject<number | null>;
  onSaveCurrentAsNewMap?: (name: string, snapshotJson: string) => MapLibraryOperationResult;
};

async function renderEditor({
  mapName = "テストのマップ",
  shortcutsEnabled = true,
  mapControls = null,
  storage = createTestStorageSession(),
  dialogMouseClickedAtRef = { current: null },
  onSaveCurrentAsNewMap,
}: RenderEditorOptions = {}) {
  const rendered = await renderReady(
    <MapEditor
      mapId={storage.session.mapId}
      exportButtonRef={{ current: null }}
      mapMoveTargets={[{ id: storage.session.mapId, name: mapName, updatedAt: "2026-10-31T00:00:00.000Z" }]}
      onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
      mapName={mapName}
      storageSession={storage.session} storageMode="persistent"
      mapControls={mapControls}
      shortcutsEnabled={shortcutsEnabled}
      dialogMouseClickedAtRef={dialogMouseClickedAtRef}
      onSaveCurrentAsNewMap={onSaveCurrentAsNewMap}
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
