import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode, RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  mockStageBounds,
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
const mockDownloadOutlineText = jest.fn();
jest.mock("@/services/outlineExport/outlineTextDownload", () => ({
  downloadOutlineText: (text: string, mapName: string, format: string) => mockDownloadOutlineText(text, mapName, format),
}));
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
      exportButtonRef={{ current: null }}
      mapMoveTargets={[{ id: storage.session.mapId, name: mapName, updatedAt: "2026-10-31T00:00:00.000Z" }]}
      onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
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

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
  mockDownloadOutlineText.mockReset();
  mockDownloadMapImage.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});


const mockFocusedNodes = jest.fn();
const mockFocusRequests = jest.fn();
jest.mock("@/components/map/useNodeFocusRequest", () => {
  const actual = jest.requireActual<typeof import("@/components/map/useNodeFocusRequest")>("@/components/map/useNodeFocusRequest");
  return { useNodeFocusRequest: (options: Parameters<typeof actual.useNodeFocusRequest>[0]) => {
    mockFocusRequests(options.request);
    actual.useNodeFocusRequest({ ...options, onFocusNode: (node, size) => { mockFocusedNodes(node.id); options.onFocusNode(node, size); } });
  } };
});
const outlineJson = JSON.stringify({ version: 3, layoutMode: "manual", nodes: [
  { id: 1, parentId: null, label: "親A", importance: "high", x: 100, y: 100, width: 100, height: 60 },
  { id: 2, parentId: 1, label: "子B", importance: "low", x: 300, y: 200, width: 100, height: 60 },
] });
async function renderOutlineEditor() {
  return renderEditor({ storage: createTestStorageSession({ initialJson: outlineJson }) });
}
async function switchTo(name: string) {
  await userEvent.click(screen.getByRole("button", { name }));
}
function searchFor(query: string) {
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: query } });
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "Enter" });
}
beforeEach(() => { mockFocusedNodes.mockClear(); mockFocusRequests.mockClear(); });

it("中央だけ切替え、outlineでは古いcanvasのキー/clipboard/contextmenuが操作しない", async () => {
  const { storage } = await renderOutlineEditor();
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
  const oldStage = stageContainer();
  expect(oldStage).not.toBeNull();
  await switchTo("アウトライン");
  expect(document.body).not.toContainElement(oldStage);
  expect(stageContainer()).toBeNull();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "階層2・子B" }));
  expect(screen.getByRole("button", { name: "階層2・子B" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.keyDown(window, { key: "Delete" });
  fireEvent.keyDown(window, { key: "Tab" });
  fireEvent.keyDown(window, { key: "v", ctrlKey: true });
  fireEvent.copy(window); fireEvent.paste(window); fireEvent.contextMenu(oldStage);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(exportedMap().nodes).toEqual(JSON.parse(outlineJson).nodes);
  expect(storage.registeredFlushCount()).toBe(1);
  await switchTo("マップ");
  expect(stageContainer()).not.toBeNull(); expect(stageContainer()).not.toBe(oldStage);
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
  expect(exportedMap().nodes).toEqual(JSON.parse(outlineJson).nodes);
});
it("outlineReturnThenFirstSearchFocusesBoth", async () => {
  await renderOutlineEditor(); await switchTo("アウトライン");
  await userEvent.click(screen.getByRole("button", { name: "階層2・子B" }));
  await switchTo("マップ");
  await waitFor(() => expect(mockFocusedNodes.mock.calls).toEqual([[2]]));
  expect(mockFocusRequests.mock.lastCall?.[0]).toMatchObject({ nodeId: 2, sequence: 1 });
  const mountedStage = stageContainer();
  searchFor("親A");
  await waitFor(() => expect(mockFocusedNodes.mock.calls).toEqual([[2], [1]]));
  expect(mockFocusRequests.mock.lastCall?.[0]).toMatchObject({ nodeId: 1, sequence: 2 });
  expect(stageContainer()).toBe(mountedStage);
});
it("searchThenOutlineReturnThenSearchNeverReusesSequence", async () => {
  await renderOutlineEditor(); searchFor("親A");
  await waitFor(() => expect(mockFocusedNodes).toHaveBeenCalledTimes(1));
  expect(mockFocusRequests.mock.lastCall?.[0]?.sequence).toBe(1);
  await switchTo("アウトライン");
  await userEvent.click(screen.getByRole("button", { name: "階層2・子B" }));
  await switchTo("マップ");
  await waitFor(() => expect(mockFocusedNodes.mock.calls).toEqual([[1], [2]]));
  expect(mockFocusRequests.mock.lastCall?.[0]?.sequence).toBe(2);
  searchFor("親A");
  await waitFor(() => expect(mockFocusedNodes.mock.calls).toEqual([[1], [2], [1]]));
  expect(mockFocusRequests.mock.lastCall?.[0]?.sequence).toBe(3);
});
it("doesNotReplaySearchAfterSelectedOutlineNodeWasDeleted", async () => {
  await renderOutlineEditor(); searchFor("親A");
  await waitFor(() => expect(mockFocusedNodes).toHaveBeenCalledTimes(1));
  await switchTo("アウトライン");
  await userEvent.click(screen.getByRole("button", { name: "階層2・子B" }));
  await userEvent.click(screen.getByRole("button", { name: "ノードだけ削除" }));
  mockFocusedNodes.mockClear();
  await switchTo("マップ");
  expect(mockFocusRequests.mock.lastCall?.[0]).toBeNull();
  expect(mockFocusedNodes).not.toHaveBeenCalled();
  searchFor("親A");
  await waitFor(() => expect(mockFocusedNodes.mock.calls).toEqual([[1]]));
  expect(mockFocusRequests.mock.lastCall?.[0]).toMatchObject({ nodeId: 1, sequence: 2 });
});

it("折りたたみと解像度で隠れた選択もoutlineで保持し、復帰時だけ祖先と必要段階を戻す", async () => {
  await renderOutlineEditor(); searchFor("親A");
  await userEvent.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
  await userEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
  await switchTo("アウトライン");
  expect(screen.queryByText(/空白ダブルクリックで追加/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "枝を展開" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "表示 高のみ" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "階層2・子B" }));
  expect(screen.getByRole("button", { name: "階層2・子B" })).toHaveAttribute("aria-pressed", "true");
  await switchTo("マップ");
  expect(screen.getByRole("button", { name: "表示 すべて" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText(/選択したノードを表示するため、祖先の枝を展開しました/)).toBeInTheDocument();
  expect(mockFocusRequests.mock.lastCall?.[0]).toMatchObject({ nodeId: 2, sequence: 2 });
});
it("同じmapのJSON全置換でもoutlineを維持し古いdraftを失効させる", async () => {
  await renderOutlineEditor(); await switchTo("アウトライン");
  await userEvent.dblClick(screen.getByRole("button", { name: "階層2・子B" }));
  fireEvent.change(screen.getByRole("textbox", { name: "ラベル編集" }), { target: { value: "古いdraft" } });
  const file = new File([outlineJson.replace("子B", "新しい子")], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => outlineJson.replace("子B", "新しい子") });
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "階層2・新しい子" })).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "アウトライン" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("textbox", { name: "ラベル編集" })).not.toBeInTheDocument();
  expect(exportedMap().nodes[1].label).toBe("新しい子");
  await switchTo("マップ");
  expect(mockFocusRequests.mock.lastCall?.[0]).toBeNull();
});
it("dialogとdisabledはoutline操作を止め、共通選択をイラストパネルへ渡す", async () => {
  const { rerender, storage } = await renderOutlineEditor(); await switchTo("アウトライン");
  await userEvent.click(screen.getByRole("button", { name: "階層2・子B" }));
  expect(screen.getByRole("button", { name: "階層2・子B" })).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByRole("complementary", { name: "イラスト" })).getByText("子B")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "箇条書きから追加" }));
  expect(document.querySelector("[data-map-id]")).toHaveAttribute("inert");
  expect(screen.getByRole("button", { name: "階層2・子B" })).toBeDisabled();
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "キャンセル" }));
  expect(screen.getByRole("button", { name: "階層2・子B" })).not.toBeDisabled();
  rerender(<MapEditor mapId={storage.session.mapId} mapName="別" storageSession={storage.session}
    mapControls={null} exportButtonRef={{ current: null }} mapMoveTargets={[]} onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "なし" } })}
    shortcutsEnabled={false} dialogMouseClickedAtRef={{ current: null }} />);
  expect(screen.getByRole("button", { name: "階層2・子B" })).toBeDisabled();
});

it("旧auto/highのズームを持ち込まず復帰時の初期scaleでauto/allへ戻す", async () => {
  await renderOutlineEditor();
  act(() => { stageContainer().querySelector("canvas")!.dispatchEvent(new WheelEvent("wheel", { deltaY: 700, cancelable: true })); });
  expect(screen.getByText("現在: 高のみ")).toBeInTheDocument();
  await switchTo("アウトライン");
  await userEvent.click(screen.getByRole("button", { name: "階層2・子B" }));
  await switchTo("マップ");
  expect(screen.getByRole("button", { name: "表示 自動" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("現在: すべて")).toBeInTheDocument();
  expect(screen.queryByText(/表示を『すべて』に切り替えました/)).not.toBeInTheDocument();
  await waitFor(() => expect(mockFocusedNodes.mock.calls).toEqual([[2]]));
});
it("同じ表示ボタンは要求を再発行せず、map key変更では初期mapへ戻る", async () => {
  const { rerender, storage } = await renderOutlineEditor();
  searchFor("親A");
  await waitFor(() => expect(mockFocusedNodes).toHaveBeenCalledTimes(1));
  await switchTo("マップ");
  expect(mockFocusedNodes).toHaveBeenCalledTimes(1);
  expect(mockFocusRequests.mock.lastCall?.[0]?.sequence).toBe(1);
  await switchTo("アウトライン");
  rerender(<MapEditor key="other-map" mapId="other-map" mapName="別" storageSession={storage.session}
    mapControls={null} exportButtonRef={{ current: null }} mapMoveTargets={[]} onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "なし" } })}
    shortcutsEnabled={true} dialogMouseClickedAtRef={{ current: null }} />);
  await waitFor(() => expect(document.querySelector("canvas")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "マップ" })).toHaveAttribute("aria-pressed", "true");
  expect(mockFocusRequests.mock.lastCall?.[0]).toBeNull();
});

it("再表示時の既存outline focus要求は消費済みとして切替ボタンにfocusを保つ", async () => {
  await renderOutlineEditor(); await switchTo("アウトライン");
  expect(screen.getByRole("button", { name: "アウトライン" })).toHaveFocus();
  await userEvent.dblClick(screen.getByRole("button", { name: "階層2・子B" }));
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "階層2・子B" })).toHaveFocus();
  await switchTo("マップ");
  await switchTo("アウトライン");
  expect(screen.getByRole("button", { name: "アウトライン" })).toHaveFocus();
});

it("保存session失敗でもoutline編集を保持し、同じpersistenceから失敗通知とJSON救出を使う", async () => {
  const storage = createTestStorageSession({ initialJson: outlineJson });
  await renderEditor({ storage });
  storage.setWriteOutcome("failed");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "アウトライン" }));
  await user.dblClick(screen.getByRole("button", { name: "階層2・子B" }));
  await user.clear(screen.getByRole("textbox", { name: "ラベル編集" }));
  await user.type(screen.getByRole("textbox", { name: "ラベル編集" }), "救出する編集{Enter}");
  await waitFor(() => expect(within(screen.getByRole("banner")).getByRole("alert")).toHaveTextContent("ブラウザへ自動保存できませんでした。"));
  expect(exportedMap().nodes[1].label).toBe("救出する編集");
  expect(storage.writes).toEqual([]);
  expect(storage.registeredFlushCount()).toBe(1);
  act(() => { expect(storage.callRegisteredFlush()).toMatchObject({ status: "failed" }); });
  await user.click(screen.getByRole("button", { name: "マップ" }));
  expect(exportedMap().nodes[1].label).toBe("救出する編集");
  expect(storage.registeredFlushCount()).toBe(1);
});

it("exportsFullModelInBothModes: 非表示の子も正本順で出し、選択・履歴・JSONを保つ", async () => {
  await renderOutlineEditor();
  const before = exportedMap();
  searchFor("親A");
  await userEvent.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
  await userEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
  await userEvent.click(screen.getByRole("button", { name: "Markdown書き出し" }));
  expect(mockDownloadOutlineText).toHaveBeenLastCalledWith("- 親A\n  - 子B\n", "テストのマップ", "md");
  expect(screen.getByText("Markdownファイルを書き出しました。", { selector: "p" })).toBeInTheDocument();
  await switchTo("アウトライン");
  await userEvent.click(screen.getByRole("button", { name: "階層2・子B" }));
  await userEvent.click(screen.getByRole("button", { name: "箇条書き書き出し" }));
  expect(mockDownloadOutlineText).toHaveBeenLastCalledWith("・親A\n  ・子B\n", "テストのマップ", "txt");
  expect(exportedMap()).toEqual(before);
  expect(screen.getByRole("button", { name: "階層2・子B" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "やり直す" })).toBeDisabled();
});

it("保存失敗中にも出力し、出力失敗は保存通知と独立して残す", async () => {
  const storage = createTestStorageSession({ initialJson: outlineJson });
  await renderEditor({ storage });
  storage.setWriteOutcome("failed");
  await switchTo("アウトライン");
  await userEvent.dblClick(screen.getByRole("button", { name: "階層2・子B" }));
  await userEvent.clear(screen.getByRole("textbox", { name: "ラベル編集" }));
  await userEvent.type(screen.getByRole("textbox", { name: "ラベル編集" }), "救出{Enter}");
  await waitFor(() => expect(within(screen.getByRole("banner")).getByRole("alert")).toHaveTextContent("ブラウザへ自動保存できませんでした。"));
  mockDownloadOutlineText.mockImplementationOnce(() => { throw new Error("救出という秘密のラベル"); });
  await userEvent.click(screen.getByRole("button", { name: "Markdown書き出し" }));
  expect(within(screen.getByRole("banner")).getAllByRole("alert").map(node => node.textContent)).toEqual([
    "ブラウザへ自動保存できませんでした。不要なマップを削除するか、JSONで書き出してください。", "Markdownファイルを書き出せませんでした。",
  ]);
  expect(screen.queryByText(/救出という秘密のラベル/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "箇条書き書き出し" }));
  expect(mockDownloadOutlineText).toHaveBeenLastCalledWith("・親A\n  ・救出\n", "テストのマップ", "txt");
  expect(within(screen.getByRole("banner")).getByRole("alert")).toHaveTextContent("ブラウザへ自動保存できませんでした。");
  expect(screen.getByText("箇条書きファイルを書き出しました。", { selector: "p" })).toBeInTheDocument();
});

it("respectsEditorInert: 取込みと枝移動のダイアログ中は根が inert で閉じると戻る", async () => {
  await renderOutlineEditor();
  const root = document.querySelector("[data-map-id]");
  const markdown = screen.getByRole("button", { name: "Markdown書き出し" });
  expect(root).toContainElement(markdown);
  await userEvent.click(screen.getByRole("button", { name: "箇条書きから追加" }));
  expect(root).toHaveAttribute("inert");
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "キャンセル" }));
  expect(root).not.toHaveAttribute("inert");
  searchFor("親A");
  await userEvent.click(screen.getByRole("button", { name: "枝を移動" }));
  expect(root).toHaveAttribute("inert");
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "キャンセル" }));
  expect(root).not.toHaveAttribute("inert");
});
