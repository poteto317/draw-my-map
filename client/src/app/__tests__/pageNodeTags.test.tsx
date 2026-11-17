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

// タグ名を count 件（tag0 …）
function tagsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `tag${index}`);
}

// 1: 親（ルート）、2: りんご（タグ「Python」）、3: リンゴ（タグ「python」「資料」。「python」はりんごのタグと同じとみなす）、
// 4: バナナ（既定はタグなし）。2・3・4 は 1 の子で兄弟
function seed(bananaTags?: readonly string[]) {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "タグテスト",
      json: v3Json([
        { id: 1, label: "プロジェクト", x: 100, y: 100 },
        { id: 2, parentId: 1, label: "りんご", x: 300, y: 100, tags: ["Python"] },
        { id: 3, parentId: 1, label: "リンゴ", x: 300, y: 300, tags: ["python", "資料"] },
        { id: 4, parentId: 1, label: "バナナ", x: 300, y: 500, ...(bananaTags === undefined ? {} : { tags: bananaTags }) },
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
function tagsRegion(): HTMLElement {
  return screen.getByRole("region", { name: "タグ", hidden: true });
}

function tagInput(): HTMLInputElement {
  return within(tagsRegion()).getByRole("textbox", { name: "タグを追加", hidden: true }) as HTMLInputElement;
}

function shownTags(): string[] {
  return within(tagsRegion()).queryAllByRole("listitem").map((item) => item.firstElementChild?.textContent ?? "");
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

describe("タグ", () => {
  it("タグを追加し、別のノードを選んで戻っても残り、JSON にはまとめた名前で入る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(tagInput(), " 機械   学習 {Enter}");

    expect(tagInput()).toHaveValue("");
    expect(tagInput()).toHaveFocus();
    expect(shownTags()).toEqual(["機械 学習"]);
    selectNode(APPLE, NODE_COUNT);
    expect(shownTags()).toEqual(["Python"]);
    selectNode(BANANA, NODE_COUNT);
    expect(shownTags()).toEqual(["機械 学習"]);
    expect(nodeOf(4).tags).toEqual(["機械 学習"]);
  });

  it("追加と削除は、それぞれ 1 回の Undo で戻り、Redo でやり直せる", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    expect(undoButton()).toBeDisabled();

    await user.type(tagInput(), "重要{Enter}");
    await user.click(undoButton());
    expect("tags" in nodeOf(4)).toBe(false);
    expect(undoButton()).toBeDisabled();
    await user.click(redoButton());
    expect(nodeOf(4).tags).toEqual(["重要"]);

    selectNode(APPLE_KANA, NODE_COUNT);
    await user.click(within(tagsRegion()).getByRole("button", { name: "タグを削除: 資料" }));
    expect(nodeOf(3).tags).toEqual(["python"]);
    await user.click(undoButton());
    expect(nodeOf(3).tags).toEqual(["python", "資料"]);
    await user.click(redoButton());
    expect(nodeOf(3).tags).toEqual(["python"]);
  });

  it("JSON に書き出したタグは、読み込むと戻る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(tagInput(), "重要{Enter}");
    fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
    const json = mockDownloadMapJson.mock.lastCall![0] as string;
    expect(JSON.parse(json).nodes.find((node: { id: number }) => node.id === 4).tags).toEqual(["重要"]);

    // 消してから、書き出した JSON を読み込む
    await user.click(within(tagsRegion()).getByRole("button", { name: "タグを削除: 重要" }));
    expect(shownTags()).toEqual([]);
    await importMap(json);
    selectNode(BANANA, NODE_COUNT);

    expect(shownTags()).toEqual(["重要"]);
  });

  it("表記違いの同じタグは追加できず、理由を出し、履歴も積まない。JSON の読み込みでは使えない文字を拒否する", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(APPLE, NODE_COUNT);

    await user.type(tagInput(), "ＰＹＴＨＯＮ{Enter}");

    expect(within(tagsRegion()).getByRole("alert")).toHaveTextContent("同じタグがすでに追加されています。");
    expect(tagInput()).toHaveValue("ＰＹＴＨＯＮ");
    expect(undoButton()).toBeDisabled();
    expect(nodeOf(2).tags).toEqual(["Python"]);

    await importMap(v3Json([{ id: 1, label: "不正", tags: ["a\u200bb"] }]));

    await waitFor(() => expect(within(screen.getByRole("banner")).getByRole("alert")).toHaveTextContent(
      "現在のマップは変更されていません。",
    ));
    expect(nodesOf().map((node) => node.id)).toEqual([1, 2, 3, 4]);
  });

  it("統合では、選択中のタグが配列順に同じタグとみなすものを除いて連結され、プレビューに件数と重複の件数が出る", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);
    fireEvent.click(headerButton("ノードを統合"));

    expect(dialog().getByText("タグ").nextElementSibling).toHaveTextContent("2 件（重複 1 件を除く）");
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    expect(nodeOf(3).tags).toEqual(["Python", "資料"]);
    expect(shownTags()).toEqual(["Python", "資料"]);
  });

  it("枝の複製ではタグも写る", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(APPLE_KANA, NODE_COUNT);

    await user.click(screen.getByRole("button", { name: "枝を複製" }));

    const copies = nodesOf().filter((node) => node.label === "リンゴ");
    expect(copies).toHaveLength(2);
    for (const copy of copies) expect(copy.tags).toEqual(["python", "資料"]);
  });

  it("入力欄の中の Delete・Backspace・Tab・Enter・Ctrl/Cmd+Z ではマップを動かさない（L-522）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(tagInput(), "重要{Enter}");

    for (const init of [
      { key: "Delete" },
      { key: "Backspace" },
      { key: "Tab" },
      { key: "Enter" },
      { key: "z", ctrlKey: true },
      { key: "z", metaKey: true },
      { key: "z", ctrlKey: true, shiftKey: true },
    ]) {
      fireEvent.keyDown(tagInput(), init);
    }

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect(nodes.find((node) => node.id === 4)?.tags).toEqual(["重要"]);
  });

  it("ダイアログを開くと、タグの節も編集画面の根ごと inert になる", async () => {
    seed();
    await renderPage();
    selectNode(APPLE, NODE_COUNT);
    toggleSelectNode(APPLE_KANA, NODE_COUNT);

    fireEvent.click(headerButton("ノードを統合"));

    const root = document.querySelector("[data-map-id]");
    expect(root).toHaveAttribute("inert");
    expect(root).toContainElement(tagInput());
  });

  it("アウトライン表示でも、主選択のノードにタグを追加できる", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));

    await user.type(tagInput(), "重要{Enter}");

    expect(shownTags()).toEqual(["重要"]);
    expect(nodeOf(4).tags).toEqual(["重要"]);
  });

  it("9 件から 10 件目を追加した直後と、10 件から 9 件へ削除した直後に、フォーカスは入力欄にある（L-155）", async () => {
    seed(tagsOf(9));
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);

    await user.type(tagInput(), "重要{Enter}");
    expect(within(tagsRegion()).getByText("10 / 10 件")).toBeInTheDocument();
    expect(within(tagsRegion()).getByRole("status")).toHaveTextContent("上限（10 件）に達しました");
    expect(tagInput()).toHaveFocus();

    await user.click(within(tagsRegion()).getByRole("button", { name: "タグを削除: 重要" }));
    expect(within(tagsRegion()).getByText("9 / 10 件")).toBeInTheDocument();
    expect(within(tagsRegion()).getByRole("status")).toHaveTextContent("");
    expect(tagInput()).toHaveFocus();
  });

  it("タグの削除ボタンにフォーカスして Ctrl+Z を押すと、マップの Undo が動く（L-155・L-588）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(tagInput(), "重要{Enter}");
    const deleteButton = within(tagsRegion()).getByRole("button", { name: "タグを削除: 重要" });
    act(() => deleteButton.focus());

    // <button> は文字入力先ではないので、マップの Undo が動く。成功した Undo は選択を解除するので、タグの節は未選択の案内になる
    fireEvent.keyDown(deleteButton, { key: "z", ctrlKey: true });

    expect(within(tagsRegion()).getByText("ノードを選択してください")).toBeInTheDocument();
    const nodes = nodesOf();
    expect("tags" in nodes.find((node) => node.id === 4)!).toBe(false);
  });

  it("ノードを選択したまま、タグの「削除」ボタンにフォーカスして Delete を押しても、ノードもタグも消えない（isInteractiveTarget）", async () => {
    seed();
    await renderPage();
    const user = userEvent.setup();
    selectNode(BANANA, NODE_COUNT);
    await user.type(tagInput(), "重要{Enter}");
    const deleteButton = within(tagsRegion()).getByRole("button", { name: "タグを削除: 重要" });
    act(() => deleteButton.focus());
    expect(deleteButton).toHaveFocus();

    fireEvent.keyDown(deleteButton, { key: "Delete" });

    const nodes = nodesOf();
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3, 4]);
    expect(nodes.find((node) => node.id === 4)?.tags).toEqual(["重要"]);
    expect(within(tagsRegion()).getByRole("button", { name: "タグを削除: 重要" })).toBeInTheDocument();
  });
});
