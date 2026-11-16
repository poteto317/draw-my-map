import { act, fireEvent, screen } from "@testing-library/react";
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
  mockContainers,
  mockNodePointerHandlers,
  mockStageHandlers,
  pointer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から useMapLibrary・MapEditor・
// ヘッダー・ダイアログ・通知領域までは本物を通す
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

const mockDownloadMapImage = jest.fn();
jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: (blob: Blob, fileName: string) => mockDownloadMapImage(blob, fileName),
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

// 1: Apple pie（一致）、2: apple（一致）、3: banana（不一致）、4: 旧（置換後に空になる）、5: ＡＰＰＬＥ（全角で一致）
function seed() {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "置換テスト",
      json: v3Json([
        { id: 1, label: "Apple pie", x: 100, y: 100 },
        { id: 2, label: "apple", x: 300, y: 100 },
        { id: 3, label: "banana", x: 500, y: 100 },
        { id: 4, label: "旧", x: 100, y: 300 },
        { id: 5, label: "ＡＰＰＬＥ", x: 300, y: 300 },
      ]),
    },
  ], { currentMapId: "a" });
}

function openDialog() {
  fireEvent.click(headerButton("一括置換"));
}

// selectNode と同じ手順で、Shift を押しながらノードを押して範囲に加える（index は 0 始まり）
function shiftSelectNode(index: number, nodeCount: number) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(0, 0, { shiftKey: true }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}

function typeInto(label: string, value: string) {
  fireEvent.change(dialog().getByLabelText(label), { target: { value } });
}

function labelsOf(): string[] {
  return exportedMap(mockDownloadMapJson).nodes.map((node) => node.label);
}

describe("一括置換", () => {
  it("折りたたみ・表示レベルで隠れたノードも置換し、置換しても表示状態を変えない", async () => {
    seedMapLibrary(window.localStorage, [{
      id: "a",
      name: "A",
      json: v3Json([
        { id: 1, label: "apple 祖先", importance: "low" },
        { id: 2, parentId: 1, label: "apple 親", importance: "low" },
        { id: 3, parentId: 2, label: "apple 孫", importance: "high" },
        { id: 4, label: "apple 高", importance: "high" },
        { id: 5, label: "apple 低", importance: "low" },
      ]),
    }], { currentMapId: "a" });
    await renderPage();
    selectNode(1, 5);
    fireEvent.click(headerButton("枝を折りたたむ"));
    fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
    const visibleBefore = mockContainers.slice(-5).map((node) => node.eventMode === "static");
    expect(visibleBefore).toEqual([true, true, false, true, false]);
    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "pear");
    expect(dialog().getByText("5件を置換します。")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "5件を置換" }));

    expect(labelsOf()).toEqual(["pear 祖先", "pear 親", "pear 孫", "pear 高", "pear 低"]);
    expect(screen.getByRole("button", { name: "表示 高のみ" })).toHaveAttribute("aria-pressed", "true");
    expect(headerButton("枝を展開")).toBeInTheDocument();
    expect(mockContainers.slice(-5).map((node) => node.eventMode === "static")).toEqual(visibleBefore);
  });

  it("全ノードを対象に、検索語・置換語を入れて確定すると一致したラベルがまとまって変わる", async () => {
    seed();
    await renderPage();

    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    expect(dialog().getByText("3件を置換します。")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "3件を置換" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);
    expect(screen.getByText("3件のノードのラベルを置換しました。")).toBeInTheDocument();
  });

  it("確定全体を 1 回の Undo で戻し、1 回の Redo でやり直せる", async () => {
    seed();
    await renderPage();
    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    fireEvent.click(dialog().getByRole("button", { name: "3件を置換" }));

    fireEvent.click(undoButton());
    expect(labelsOf()).toEqual(["Apple pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);

    fireEvent.click(redoButton());
    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);
  });

  it("「選択中のノードだけ」にすると、開いた時点で選んだノード以外は変わらない", async () => {
    seed();
    await renderPage();
    selectNode(0, 5);

    openDialog();
    fireEvent.click(dialog().getByRole("checkbox", { name: "選択中のノードだけを対象にする（1件）" }));
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    expect(dialog().getByText("1件を置換します。")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "1件を置換" }));

    expect(labelsOf()).toEqual(["Orange pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);
  });

  it("置換後に空になるノードは置換せず、警告を出す", async () => {
    seed();
    await renderPage();
    openDialog();

    typeInto("検索語", "旧");
    typeInto("置換語", "");

    expect(dialog().getByText("置換後のラベルが空になるため置換しません。")).toBeInTheDocument();
    expect(dialog().getByText("置換できるノードがありません。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "0件を置換" })).toBeDisabled();
  });

  it("検索語が空のあいだは確定できず、理由を文言で示す", async () => {
    seed();
    await renderPage();
    openDialog();

    expect(dialog().getByText("検索語を入力してください。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "0件を置換" })).toBeDisabled();
  });

  it("キャンセルでラベルを変えずに閉じ、ヘッダーのボタンへフォーカスを戻す", async () => {
    seed();
    await renderPage();
    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");

    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(headerButton("一括置換")).toHaveFocus();
    expect(labelsOf()).toEqual(["Apple pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);
  });

  it("ダイアログが開いている間は、履歴ショートカットが働かない（開く前は同じ操作で Undo される）", async () => {
    seed();
    await renderPage();
    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    fireEvent.click(dialog().getByRole("button", { name: "3件を置換" }));
    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);

    // 前提: ダイアログを開く前なら、同じ操作で全件が戻る（pageBranchMove.test.tsx と同じく window へ送る）
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(labelsOf()).toEqual(["Apple pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);
    fireEvent.click(redoButton());
    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);

    openDialog();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    expect(labelsOf()).toEqual(["Orange pie", "Orange", "banana", "旧", "Orange"]);
  });

  it("ダイアログが開いている間は、Delete キーでノードが削除されない（開く前は同じ操作で消える）", async () => {
    seed();
    await renderPage();
    selectNode(0, 5);

    // 前提: ダイアログを開く前なら、同じ操作でノードが消える（pageBranchMove.test.tsx と同じく window へ送る）
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.click(undoButton());
    expect(labelsOf()).toEqual(["Apple pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);
    fireEvent.click(redoButton());
    expect(labelsOf()).toEqual(["apple", "banana", "旧", "ＡＰＰＬＥ"]);
    fireEvent.click(undoButton());
    expect(labelsOf()).toEqual(["Apple pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);

    openDialog();
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(labelsOf()).toEqual(["Apple pie", "apple", "banana", "旧", "ＡＰＰＬＥ"]);
  });

  it("複数選択 → アウトライン → マップへ戻ると、範囲の既定（2 件以上で「選択のみ」）が再び入る", async () => {
    seed();
    await renderPage();
    selectNode(0, 5);
    shiftSelectNode(1, 5);

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "マップ" }));
    });
    openDialog();

    expect(dialog().getByRole("checkbox", { name: "選択中のノードだけを対象にする（2件）" })).toBeChecked();
  });

  it("押し続けた Enter・Space がヘッダーのボタンへ届いても既定動作を止める（確定後に戻ったフォーカス先でダイアログが開き直さない）", async () => {
    seed();
    await renderPage();
    openDialog();
    typeInto("検索語", "apple");
    typeInto("置換語", "Orange");
    fireEvent.click(dialog().getByRole("button", { name: "3件を置換" }), { detail: 1 });

    const button = headerButton("一括置換");
    expect(button).toHaveFocus();
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("アウトライン表示では「一括置換」ボタンが出ず、マップ表示へ戻すと出る", async () => {
    seed();
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.queryByRole("button", { name: "一括置換" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "マップ" }));
    });
    expect(screen.getByRole("button", { name: "一括置換" })).toBeInTheDocument();
  });

  it("ノードが 1 件も無いマップでは「一括置換」ボタンが無効", async () => {
    seedMapLibrary(window.localStorage, [{ id: "a", name: "空", json: v3Json([]) }], { currentMapId: "a" });
    await renderPage();

    expect(headerButton("一括置換")).toBeDisabled();
  });
});
