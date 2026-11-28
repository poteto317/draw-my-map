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

const APPLE_URL = "https://example.com/apple";
const RINGO_URL = "https://example.org/ringo";
const DOCS_URL = "https://example.com/docs";

// 正規化済みの URL を count 件（https://example.com/link0 …）
function linksOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `https://example.com/link${index}`);
}

// 1: 親（ルート）、2: りんご（URL 1 件）、3: リンゴ（URL 2 件。1 件はりんごと同じ）、4: バナナ（既定は URL なし）。
// 2・3・4 は 1 の子で兄弟
function seed(bananaLinks?: readonly string[]) {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "リンクテスト",
      json: v3Json([
        { id: 1, label: "プロジェクト", x: 100, y: 100 },
        { id: 2, parentId: 1, label: "りんご", x: 300, y: 100, links: [APPLE_URL] },
        { id: 3, parentId: 1, label: "リンゴ", x: 300, y: 300, links: [APPLE_URL, RINGO_URL] },
        { id: 4, parentId: 1, label: "バナナ", x: 300, y: 500, ...(bananaLinks === undefined ? {} : { links: bananaLinks }) },
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

// ダイアログで根が inert でも取れるよう hidden を含めて探す
function linksRegion(): HTMLElement {
  return screen.getByRole("region", { name: "リンク", hidden: true });
}

function linkInput(): HTMLInputElement {
  return within(linksRegion()).getByRole("textbox", { name: "URLを追加", hidden: true }) as HTMLInputElement;
}

function shownLinks(): string[] {
  return within(linksRegion()).queryAllByRole("link").map((link) => link.textContent ?? "");
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
  await act(async () => fireEvent.change(document.querySelector('input[type="file"][accept="application/json,.json"]')!, { target: { files: [file] } }));
}

describe("URLの添付", () => {
  it("URL を追加し、別のノードを選んで戻っても残り、JSON には正規化した URL で入る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(linkInput(), "HTTPS://Example.com/docs{Enter}");

    expect(linkInput()).toHaveValue("");
    expect(linkInput()).toHaveFocus();
    expect(shownLinks()).toEqual([DOCS_URL]);
    selectNode(APPLE, NODE_COUNT);
    expect(shownLinks()).toEqual([APPLE_URL]);
    selectNode(BANANA, NODE_COUNT);
    expect(within(linksRegion()).getByRole("link", { name: DOCS_URL })).toHaveAttribute("href", DOCS_URL);
    expect(nodeOf(4).links).toEqual([DOCS_URL]);
  });

  it("追加と削除は、それぞれ 1 回の Undo で戻り、Redo でやり直せる", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    expect(undoButton()).toBeDisabled();

    await user.type(linkInput(), `${DOCS_URL}{Enter}`);
    await user.click(undoButton());
    expect("links" in nodeOf(4)).toBe(false);
    expect(undoButton()).toBeDisabled();
    await user.click(redoButton());
    expect(nodeOf(4).links).toEqual([DOCS_URL]);

    selectNode(APPLE_KANA, NODE_COUNT);
    await user.click(within(linksRegion()).getByRole("button", { name: `リンクを削除: ${RINGO_URL}` }));
    expect(nodeOf(3).links).toEqual([APPLE_URL]);
    await user.click(undoButton());
    expect(nodeOf(3).links).toEqual([APPLE_URL, RINGO_URL]);
  });

  it("JSON に書き出した URL は、読み込むと戻る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(linkInput(), `${DOCS_URL}{Enter}`);
    fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const json = mockDownloadMapJson.mock.lastCall![0] as string;
    expect(JSON.parse(json).nodes.find((node: { id: number }) => node.id === 4).links).toEqual([DOCS_URL]);

    // 消してから、書き出した JSON を読み込む
    await user.click(within(linksRegion()).getByRole("button", { name: `リンクを削除: ${DOCS_URL}` }));
    expect(shownLinks()).toEqual([]);
    await importMap(json);
    selectNode(BANANA, NODE_COUNT);

    expect(shownLinks()).toEqual([DOCS_URL]);
  });

  it("javascript: の URL は追加できず、理由を出し、履歴も積まない。JSON の読み込みでも拒否する", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(linkInput(), "javascript:alert(1){Enter}");

    expect(within(linksRegion()).getByRole("alert")).toHaveTextContent("http または https の URL だけを追加できます。");
    expect(linkInput()).toHaveValue("javascript:alert(1)");
    expect(undoButton()).toBeDisabled();
    expect("links" in nodeOf(4)).toBe(false);

    await importMap(v3Json([{ id: 1, label: "危険", links: ["javascript:alert(1)"] }]));

    await waitFor(() => expect(within(screen.getByRole("banner")).getByRole("alert")).toHaveTextContent(
      "現在のマップは変更されていません。",
    ));
    expect(nodesOf().map((node) => node.id)).toEqual([1, 2, 3, 4]);
  });

  it("統合では、選択中の URL が配列順に重複を除いて連結され、プレビューに件数と重複の件数が出る", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);
    fireEvent.click(headerButton("ノードを統合"));

    expect(dialog().getByText("URL").nextElementSibling).toHaveTextContent("2 件（重複 1 件を除く）");
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    expect(nodeOf(3).links).toEqual([APPLE_URL, RINGO_URL]);
    expect(shownLinks()).toEqual([APPLE_URL, RINGO_URL]);
  });

  it("枝の複製では URL も写る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(APPLE_KANA, NODE_COUNT);

    await user.click(screen.getByRole("button", { name: "枝を複製" }));

    const copies = nodesOf().filter((node) => node.label === "リンゴ");
    expect(copies).toHaveLength(2);
    for (const copy of copies) expect(copy.links).toEqual([APPLE_URL, RINGO_URL]);
  });

  it("ノード検索で URL からノードが見つかり、パスの日本語でも見つかる", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(linkInput(), "https://example.com/資料{Enter}");
    const search = screen.getByRole("combobox", { name: "ノードを検索" });

    await user.type(search, "ringo");
    expect(screen.getByRole("option", { name: "リンゴ（親: プロジェクト、URL 一致）" })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "資料");
    expect(screen.getByRole("option", { name: "バナナ（親: プロジェクト、URL 一致）" })).toBeInTheDocument();
  });

  it("入力欄の中の Delete・Backspace・Tab・Enter・Ctrl/Cmd+Z と、リンクの上の Delete ではマップを動かさない（L-522）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(linkInput(), `${DOCS_URL}{Enter}`);

    for (const init of [
      { key: "Delete" },
      { key: "Backspace" },
      { key: "Tab" },
      { key: "Enter" },
      { key: "z", ctrlKey: true },
      { key: "z", metaKey: true },
      { key: "z", ctrlKey: true, shiftKey: true },
    ]) {
      fireEvent.keyDown(linkInput(), init);
    }
    const link = within(linksRegion()).getByRole("link", { name: DOCS_URL });
    act(() => link.focus());
    fireEvent.keyDown(link, { key: "Delete" });
    fireEvent.keyDown(link, { key: "Backspace" });

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect(nodes.find((node) => node.id === 4)?.links).toEqual([DOCS_URL]);
  });

  it("ダイアログを開くと、リンクの節も編集画面の根ごと inert になる", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);

    fireEvent.click(headerButton("ノードを統合"));

    const root = document.querySelector("[data-map-id]");
    expect(root).toHaveAttribute("inert");
    expect(root).toContainElement(linkInput());
  });

  it("アウトライン表示でも、主選択のノードに URL を追加できる", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));

    await user.type(linkInput(), `${DOCS_URL}{Enter}`);

    expect(shownLinks()).toEqual([DOCS_URL]);
    expect(nodeOf(4).links).toEqual([DOCS_URL]);
  });

  it("9 件から 10 件目を追加した直後と、10 件から 9 件へ削除した直後に、フォーカスは入力欄にある（L-155）", async () => {
    seed(linksOf(9));
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(linkInput(), `${DOCS_URL}{Enter}`);
    expect(within(linksRegion()).getByText("10 / 10 件")).toBeInTheDocument();
    expect(within(linksRegion()).getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(linkInput()).toHaveFocus();

    await user.click(within(linksRegion()).getByRole("button", { name: `リンクを削除: ${DOCS_URL}` }));
    expect(within(linksRegion()).getByText("9 / 10 件")).toBeInTheDocument();
    expect(within(linksRegion()).getByRole("status")).toHaveTextContent("");
    expect(linkInput()).toHaveFocus();
  });
  it("リンクの「削除」ボタンにフォーカスして Ctrl+Z を押すと Undo が動き、続けて Delete を押してもノードは消えない（L-155・L-588）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(linkInput(), `${DOCS_URL}{Enter}`);
    const deleteButton = within(linksRegion()).getByRole("button", { name: `リンクを削除: ${DOCS_URL}` });
    act(() => deleteButton.focus());

    // <button> は文字入力先ではないので、マップの Undo が動く。成功した Undo は選択を解除するので、リンクの節は未選択の案内になる
    fireEvent.keyDown(deleteButton, { key: "z", ctrlKey: true });
    expect(within(linksRegion()).getByText("ノードを選択してください")).toBeInTheDocument();
    // フォーカスの行き先（押したボタンは消えている）で Delete を押しても、選択が無いので何も消えない
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Delete" });

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect("links" in nodes.find((node) => node.id === 4)!).toBe(false);
  });
});
