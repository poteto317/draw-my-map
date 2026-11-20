import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  dialog,
  exportedMap,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  undoButton,
  v3Json,
} from "@/app/testing/pageTestHelpers";
import {
  mockNodePointerHandlers,
  mockStageHandlers,
  pointer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から MapEditor・右パネル・
// ヘッダー・ダイアログまでは本物を通す
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

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => jest.restoreAllMocks());

// 1: 親（ルート）、2: りんご（メモあり）、3: リンゴ（メモあり）、4: バナナ（メモなし）。2・3・4 は 1 の子で兄弟
function seed() {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "メモテスト",
      json: v3Json([
        { id: 1, label: "プロジェクト", x: 100, y: 100 },
        { id: 2, parentId: 1, label: "りんご", x: 300, y: 100, note: "りんごのメモ" },
        { id: 3, parentId: 1, label: "リンゴ", x: 300, y: 300, note: "リンゴのメモ" },
        { id: 4, parentId: 1, label: "バナナ", x: 300, y: 500 },
      ]),
    },
  ], { currentMapId: "a" });
}

const NODE_COUNT = 4;
const APPLE = 1;
const APPLE_KANA = 2;
const BANANA = 3;

// Cmd/Ctrl を押しながらノードを押して選択へ加える（index は 0 始まり）。押したノードが主選択になる
function toggleSelectNode(index: number, nodeCount: number) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(0, 0, { ctrlKey: true }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}

function noteBox(): HTMLTextAreaElement {
  // ダイアログで根が inert でも取れるよう hidden を含めて探す
  return screen.getByRole("textbox", { name: "詳細メモ", hidden: true }) as HTMLTextAreaElement;
}

function nodesOf() {
  return exportedMap(mockDownloadMapJson).nodes;
}

function nodeOf(id: number) {
  return nodesOf().find((node) => node.id === id)!;
}

async function importMap(text: string) {
  const file = new File([text], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(text) });
  await act(async () => fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } }));
}

describe("詳細メモ", () => {
  it("メモを書き、フォーカスを外さずに別のノードを選んで戻っても、メモが残り JSON にも入る", async () => {
    seed();
    await renderPage();
    selectNode(BANANA, NODE_COUNT);
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "バナナの説明\n2行目" } });

    // キャンバスで別のノードを選ぶ（blur を起こさない）
    selectNode(APPLE, NODE_COUNT);
    expect(noteBox()).toHaveValue("りんごのメモ");
    selectNode(BANANA, NODE_COUNT);

    expect(noteBox()).toHaveValue("バナナの説明\n2行目");
    expect(nodeOf(4).note).toBe("バナナの説明\n2行目");
  });

  it("フォーカスしてから外すまでの入力は、1 回の Undo で戻る", async () => {
    seed();
    await renderPage();
    selectNode(BANANA, NODE_COUNT);
    expect(undoButton()).toBeDisabled();
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "a" } });
    fireEvent.change(noteBox(), { target: { value: "ab" } });
    fireEvent.change(noteBox(), { target: { value: "abc" } });

    // userEvent は mousedown でボタンへフォーカスを移す。blur での反映 → click の Undo という実際の順序を通す
    const user = userEvent.setup();
    // 入力が 300ms 止まると途中反映され（グループ中の変更）、Undo が押せるようになる
    await waitFor(() => expect(undoButton()).toBeEnabled());
    await user.click(undoButton());
    expect(nodeOf(4).note).toBeUndefined();

    expect("note" in nodeOf(4)).toBe(false);
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeEnabled();

    await user.click(redoButton());
    expect(nodeOf(4).note).toBe("abc");
  });

  it("Escape で編集を取り消し、履歴を積まない", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "書き換え" } });

    fireEvent.keyDown(noteBox(), { key: "Escape" });

    expect(noteBox()).toHaveValue("りんごのメモ");
    expect(document.activeElement).not.toBe(noteBox());
    expect(nodeOf(2).note).toBe("りんごのメモ");
    expect(undoButton()).toBeDisabled();
  });

  it("JSON に書き出したメモは、読み込むと戻る", async () => {
    seed();
    await renderPage();
    selectNode(BANANA, NODE_COUNT);
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "往復するメモ" } });
    act(() => noteBox().blur());
    fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const json = mockDownloadMapJson.mock.lastCall![0] as string;
    expect(JSON.parse(json).nodes.find((node: { id: number }) => node.id === 4).note).toBe("往復するメモ");

    // 別の内容に書き換えてから、書き出した JSON を読み込む
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "読み込み前の変更" } });
    act(() => noteBox().blur());
    await importMap(json);
    selectNode(BANANA, NODE_COUNT);

    expect(noteBox()).toHaveValue("往復するメモ");
  });

  it("統合では、選択中のメモが配列順に空行で連結され、プレビューに件数と文字数が出る", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);
    fireEvent.click(headerButton("ノードを統合"));

    // "りんごのメモ"（6）+ "\n\n"（2）+ "リンゴのメモ"（6）= 14
    expect(dialog().getByText("メモ").nextElementSibling).toHaveTextContent("2 件のメモを連結（14 文字）");
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    expect(nodeOf(3).note).toBe("りんごのメモ\n\nリンゴのメモ");
    expect(noteBox()).toHaveValue("りんごのメモ\n\nリンゴのメモ");
  });

  it("テキスト欄の中の Delete・Tab・Enter・Ctrl/Cmd+Z ではマップを動かさない（L-522）", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: "追記したメモ" } });
    act(() => noteBox().blur());
    act(() => noteBox().focus());

    for (const init of [
      { key: "Delete" },
      { key: "Backspace" },
      { key: "Tab" },
      { key: "Enter" },
      { key: "z", ctrlKey: true },
      { key: "z", metaKey: true },
      { key: "z", ctrlKey: true, shiftKey: true },
    ]) {
      fireEvent.keyDown(noteBox(), init);
    }

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect(nodes.find((node) => node.id === 2)?.note).toBe("追記したメモ");
    expect(noteBox()).toHaveValue("追記したメモ");
  });

  it("ダイアログを開くと、右パネルも編集画面の根ごと inert になる", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);

    fireEvent.click(headerButton("ノードを統合"));

    const root = document.querySelector("[data-map-id]");
    expect(root).toHaveAttribute("inert");
    expect(root).toContainElement(noteBox());
  });

  it("マップ表示の複数選択では主選択のメモを編集すると示し、アウトライン表示では件数を出さない", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);
    expect(screen.getByText("2 件選択中。主選択のノードのメモを編集します")).toBeInTheDocument();
    expect(noteBox()).toHaveValue("リンゴのメモ");

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));

    expect(screen.queryByText(/件選択中。主選択のノードのメモを編集します/)).toBeNull();
    expect(noteBox()).toHaveValue("リンゴのメモ");
  });

  it("Markdown をプレビュー表示でき、元に戻す 1 回で変更前へ戻り、タブやプレビュー内リンク上の Delete/Backspace でノードが消えない（L-522）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    const markdown = "# 概要\n\n- 項目1\n\n[参考](https://example.com/ref)\n\n![構成図](https://example.com/diagram.png)";
    act(() => noteBox().focus());
    fireEvent.change(noteBox(), { target: { value: markdown } });

    await user.click(screen.getByRole("tab", { name: "プレビュー" }));

    // Phase 21 のパンくずも listitem を持つため、詳細メモのプレビュー枠に限定する
    const preview = screen.getByRole("tabpanel", { name: "プレビュー" });
    expect(within(preview).getByRole("heading", { level: 1, name: "概要" })).toBeVisible();
    expect(within(preview).getByRole("listitem")).toHaveTextContent("項目1");
    const refLink = within(preview).getByRole("link", { name: "参考" });
    expect(refLink).toHaveAttribute("href", "https://example.com/ref");
    const imageLink = within(preview).getByRole("link", { name: "[画像: 構成図]" });
    expect(imageLink).toHaveAttribute("href", "https://example.com/diagram.png");

    const previewTab = screen.getByRole("tab", { name: "プレビュー" });
    act(() => previewTab.focus());
    fireEvent.keyDown(previewTab, { key: "Delete" });
    fireEvent.keyDown(previewTab, { key: "Backspace" });

    act(() => refLink.focus());
    fireEvent.keyDown(refLink, { key: "Delete" });
    fireEvent.keyDown(refLink, { key: "Backspace" });

    expect(nodesOf().map((node) => node.id)).toEqual([1, 2, 3, 4]);

    await user.click(undoButton());
    expect(nodeOf(4).note).toBeUndefined();
    expect(noteBox()).toHaveValue("");
  });
});
