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
import type { NodeSource } from "@/types/node";

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

const A_URL = "https://example.com/a";
const B_URL = "https://example.org/b";
const DOCS_URL = "https://example.com/docs";

function source(title: string, page?: string, url?: string): NodeSource {
  return {
    title,
    ...(page === undefined ? {} : { page }),
    ...(url === undefined ? {} : { url }),
  };
}

// 1: 親（ルート）、2: りんご（出典 1 件）、3: リンゴ（出典 2 件。1 件はりんごと同一鍵）、4: バナナ（既定は出典なし）。
// 2・3・4 は 1 の子で兄弟
function seed(bananaSources?: readonly NodeSource[]) {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "出典テスト",
      json: v3Json([
        { id: 1, label: "プロジェクト", x: 100, y: 100 },
        { id: 2, parentId: 1, label: "りんご", x: 300, y: 100, sources: [source("設計入門", "12", A_URL)] },
        {
          id: 3,
          parentId: 1,
          label: "リンゴ",
          x: 300,
          y: 300,
          sources: [source("設計入門", "12", A_URL), source("実装ガイド", "3", B_URL)],
        },
        {
          id: 4,
          parentId: 1,
          label: "バナナ",
          x: 300,
          y: 500,
          ...(bananaSources === undefined ? {} : { sources: bananaSources }),
        },
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
function sourcesRegion(): HTMLElement {
  return screen.getByRole("region", { name: "出典", hidden: true });
}

function titleInput(): HTMLInputElement {
  return within(sourcesRegion()).getByRole("textbox", { name: "タイトル", hidden: true }) as HTMLInputElement;
}

function pageInput(): HTMLInputElement {
  return within(sourcesRegion()).getByRole("textbox", { name: "ページ", hidden: true }) as HTMLInputElement;
}

function urlInput(): HTMLInputElement {
  return within(sourcesRegion()).getByRole("textbox", { name: "URL", hidden: true }) as HTMLInputElement;
}

function shownSourceTitles(): string[] {
  return within(sourcesRegion())
    .queryAllByRole("listitem")
    .map((item) => item.querySelector("span")?.textContent ?? "");
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

describe("出典情報", () => {
  it("出典を追加し、別のノードを選んで戻っても残り、JSON には正規化した値で入る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(titleInput(), "  設計   入門  ");
    await user.type(pageInput(), " 12 ");
    await user.type(urlInput(), "HTTPS://Example.com/docs{Enter}");

    expect(titleInput()).toHaveValue("");
    expect(pageInput()).toHaveValue("");
    expect(urlInput()).toHaveValue("");
    expect(titleInput()).toHaveFocus();
    expect(shownSourceTitles()).toEqual(["設計 入門"]);
    expect(within(sourcesRegion()).getByText("p. 12")).toBeInTheDocument();
    selectNode(APPLE, NODE_COUNT);
    expect(shownSourceTitles()).toEqual(["設計入門"]);
    selectNode(BANANA, NODE_COUNT);
    expect(within(sourcesRegion()).getByRole("link", { name: DOCS_URL })).toHaveAttribute("href", DOCS_URL);
    expect(nodeOf(4).sources).toEqual([source("設計 入門", "12", DOCS_URL)]);
  });

  it("追加と削除は、それぞれ 1 回の Undo で戻り、Redo でやり直せる", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    expect(undoButton()).toBeDisabled();

    await user.type(titleInput(), "設計入門{Enter}");
    await user.click(undoButton());
    expect("sources" in nodeOf(4)).toBe(false);
    expect(undoButton()).toBeDisabled();
    await user.click(redoButton());
    expect(nodeOf(4).sources).toEqual([source("設計入門")]);

    selectNode(APPLE_KANA, NODE_COUNT);
    await user.click(within(sourcesRegion()).getByRole("button", { name: `出典を削除: 実装ガイド p. 3 ${B_URL}` }));
    expect(nodeOf(3).sources).toEqual([source("設計入門", "12", A_URL)]);
    await user.click(undoButton());
    expect(nodeOf(3).sources).toEqual([
      source("設計入門", "12", A_URL),
      source("実装ガイド", "3", B_URL),
    ]);
  });

  it("JSON に書き出した出典は、読み込むと戻る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(titleInput(), "設計入門");
    await user.type(pageInput(), "12{Enter}");
    fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const json = mockDownloadMapJson.mock.lastCall![0] as string;
    expect(JSON.parse(json).nodes.find((node: { id: number }) => node.id === 4).sources).toEqual([
      source("設計入門", "12"),
    ]);

    // 消してから、書き出した JSON を読み込む
    await user.click(within(sourcesRegion()).getByRole("button", { name: "出典を削除: 設計入門 p. 12" }));
    expect(shownSourceTitles()).toEqual([]);
    await importMap(json);
    selectNode(BANANA, NODE_COUNT);

    expect(shownSourceTitles()).toEqual(["設計入門"]);
    expect(within(sourcesRegion()).getByText("p. 12")).toBeInTheDocument();
  });

  it("javascript: の URL は追加できず、理由を出し、履歴も積まない。JSON の読み込みでも拒否する", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(titleInput(), "危険");
    await user.type(urlInput(), "javascript:alert(1){Enter}");

    expect(within(sourcesRegion()).getByRole("alert")).toHaveTextContent("http または https の URL だけを追加できます。");
    expect(titleInput()).toHaveValue("危険");
    expect(urlInput()).toHaveValue("javascript:alert(1)");
    expect(undoButton()).toBeDisabled();
    expect("sources" in nodeOf(4)).toBe(false);

    await importMap(v3Json([{ id: 1, label: "危険", sources: [{ title: "危険", url: "javascript:alert(1)" }] }]));

    await waitFor(() => expect(within(screen.getByRole("banner")).getByRole("alert")).toHaveTextContent(
      "現在のマップは変更されていません。",
    ));
    expect(nodesOf().map((node) => node.id)).toEqual([1, 2, 3, 4]);
  });

  it("統合では、選択中の出典が配列順に重複を除いて連結され、プレビューに件数と重複の件数が出る", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);
    fireEvent.click(headerButton("ノードを統合"));

    expect(dialog().getByText("出典").nextElementSibling).toHaveTextContent("2 件（重複 1 件を除く）");
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    expect(nodeOf(3).sources).toEqual([
      source("設計入門", "12", A_URL),
      source("実装ガイド", "3", B_URL),
    ]);
    expect(shownSourceTitles()).toEqual(["設計入門", "実装ガイド"]);
  });

  it("枝の複製では出典も写る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(APPLE_KANA, NODE_COUNT);

    await user.click(screen.getByRole("button", { name: "枝を複製" }));

    const copies = nodesOf().filter((node) => node.label === "リンゴ");
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      expect(copy.sources).toEqual([
        source("設計入門", "12", A_URL),
        source("実装ガイド", "3", B_URL),
      ]);
    }
  });

  it("入力欄の中の Delete・Backspace・Tab・Enter・Ctrl/Cmd+Z と、出典の URL 上の Delete ではマップを動かさない（L-522）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(titleInput(), "設計入門");
    await user.type(urlInput(), `${DOCS_URL}{Enter}`);

    for (const init of [
      { key: "Delete" },
      { key: "Backspace" },
      { key: "Tab" },
      { key: "Enter" },
      { key: "z", ctrlKey: true },
      { key: "z", metaKey: true },
      { key: "z", ctrlKey: true, shiftKey: true },
    ]) {
      fireEvent.keyDown(titleInput(), init);
    }
    const link = within(sourcesRegion()).getByRole("link", { name: DOCS_URL });
    act(() => link.focus());
    fireEvent.keyDown(link, { key: "Delete" });
    fireEvent.keyDown(link, { key: "Backspace" });

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect(nodes.find((node) => node.id === 4)?.sources).toEqual([source("設計入門", undefined, DOCS_URL)]);
  });

  it("出典の「削除」ボタンにフォーカスして Ctrl+Z を押すと Undo が動き、続けて Delete を押してもノードは消えない（L-155・L-588）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(titleInput(), "設計入門{Enter}");
    const deleteButton = within(sourcesRegion()).getByRole("button", { name: "出典を削除: 設計入門" });
    act(() => deleteButton.focus());

    // <button> は文字入力先ではないので、マップの Undo が動く。成功した Undo は選択を解除するので、出典の節は未選択の案内になる
    fireEvent.keyDown(deleteButton, { key: "z", ctrlKey: true });
    expect(within(sourcesRegion()).getByText("ノードを選択してください")).toBeInTheDocument();
    // フォーカスの行き先（押したボタンは消えている）で Delete を押しても、選択が無いので何も消えない
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Delete" });

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect("sources" in nodes.find((node) => node.id === 4)!).toBe(false);
  });
});
