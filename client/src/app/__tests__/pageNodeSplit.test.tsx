import { act, fireEvent, screen } from "@testing-library/react";
import {
  dialog,
  exportedMap,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  stageContainer,
  undoButton,
  v3Json,
} from "@/app/testing/pageTestHelpers";
import {
  mockStage,
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

// 1: 分割できるラベル（読点）、2: 1 の子、3: 分割できるラベル（スラッシュ）、4: 分割できないラベル。1・3・4 はルート
function seed() {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "分割テスト",
      json: v3Json([
        { id: 1, label: "りんご、みかん、ぶどう", x: 100, y: 100, importance: "high" },
        { id: 2, parentId: 1, label: "りんごの子", x: 300, y: 100 },
        { id: 3, label: "dog/cat/bird", x: 100, y: 400 },
        { id: 4, label: "単一", x: 100, y: 600 },
      ]),
    },
  ], { currentMapId: "a" });
}

const NODE_COUNT = 4;

function openDialog() {
  fireEvent.click(headerButton("ノードを分割"));
}

function nodesOf() {
  return exportedMap(mockDownloadMapJson).nodes;
}

function labelsOf(): string[] {
  return nodesOf().map((node) => node.label);
}

const ORIGINAL_LABELS = ["りんご、みかん、ぶどう", "りんごの子", "dog/cat/bird", "単一"];

// 空きキャンバスを押す。mousedown の既定の動作（フォーカスの移動）が許されるなら true を返す
function pressBlankCanvas() {
  act(() => {
    mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
  return fireEvent.mouseDown(stageContainer());
}

describe("ノードの分割", () => {
  it("主選択を分割すると、最初の断片が元のノードに残り、残りが直後の兄弟として断片の順に入る。通知が出る", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);

    openDialog();
    expect(dialog().getByText("3件に分割します（2件を追加）")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(labelsOf()).toEqual(["りんご", "みかん", "ぶどう", "りんごの子", "dog/cat/bird", "単一"]);
    const [original, second, third, child] = nodesOf();
    expect(original).toMatchObject({ id: 1, parentId: null, x: 100, y: 100, importance: "high" });
    expect(child).toMatchObject({ id: 2, parentId: 1 });
    // 手動配置では、断片は同じ親の兄弟の最も下の下端（4 の 660）の下へ積む。キャンバス上の並びは配列順と一致しない
    expect(second).toMatchObject({ parentId: null, x: 100, y: 700, importance: "high", width: 100, height: 60 });
    expect(third).toMatchObject({ parentId: null, x: 100, y: 800, importance: "high" });
    expect(screen.getByText("ノードを 3 件に分割しました。")).toBeInTheDocument();
  });

  it("確定全体を 1 回の Undo で戻し、1 回の Redo でやり直せる", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }));
    const splitLabels = labelsOf();

    fireEvent.click(undoButton());
    expect(labelsOf()).toEqual(ORIGINAL_LABELS);

    fireEvent.click(redoButton());
    expect(labelsOf()).toEqual(splitLabels);
  });

  it("確定後もフォーカスは「ノードを分割」へ戻り、選択は変わらないのでボタンは有効のまま", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();

    fireEvent.click(dialog().getByRole("button", { name: "分割する" }), { detail: 1 });

    const button = headerButton("ノードを分割");
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
    expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("区切り文字をプルダウンで替えると、プレビューと確定ボタンの有効が変わる", async () => {
    seed();
    await renderPage();
    selectNode(2, NODE_COUNT);

    openDialog();
    expect(dialog().getByText("区切り文字で 2 つ以上に分けられません。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "分割する" })).toBeDisabled();

    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "slash" } });
    expect(dialog().getByText("3件に分割します（2件を追加）")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }));

    expect(labelsOf().slice(2, 5)).toEqual(["dog", "cat", "bird"]);
  });

  it("「その他」は空のままだと区切り文字を求めて確定できず、入力後に入力欄の Enter で確定できる", async () => {
    seed();
    await renderPage();
    selectNode(2, NODE_COUNT);
    openDialog();

    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "custom" } });
    expect(dialog().getByText("区切り文字を入力してください。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "分割する" })).toBeDisabled();

    fireEvent.change(dialog().getByLabelText("その他の区切り文字"), { target: { value: "/" } });
    fireEvent.keyDown(dialog().getByLabelText("その他の区切り文字"), { key: "Enter" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(labelsOf().slice(2, 5)).toEqual(["dog", "cat", "bird"]);
  });

  it("分割できないラベルは、理由を文言で示して確定できない（キャンセルでラベルを変えずに閉じ、フォーカスが戻る）", async () => {
    seed();
    await renderPage();
    selectNode(3, NODE_COUNT);

    openDialog();
    expect(dialog().getByText("区切り文字で 2 つ以上に分けられません。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "分割する" })).toBeDisabled();
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(headerButton("ノードを分割")).toHaveFocus();
    expect(labelsOf()).toEqual(ORIGINAL_LABELS);
  });

  it("ダイアログが開いている間は、履歴ショートカットが働かず、編集画面の根が inert になる（開く前は同じ操作で Undo される）", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }));
    const splitLabels = labelsOf();

    // 前提: ダイアログを開く前なら、同じ操作で戻る
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(labelsOf()).toEqual(ORIGINAL_LABELS);
    fireEvent.click(redoButton());
    expect(labelsOf()).toEqual(splitLabels);

    selectNode(0, NODE_COUNT + 2);
    openDialog();
    expect(document.querySelector("[data-map-id]")).toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Delete" });

    expect(labelsOf()).toEqual(splitLabels);
  });

  it("ダイアログが開いている間は、表示の切り替え（マップ・アウトライン）も働かない（L-061）", async () => {
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(headerButton("ノードを分割")).toBeInTheDocument();
  });

  it("「分割する」の 1 回目のクリックで閉じた後、キャンバスへ届いた 500ms 以内の押下・dblclick は効かず、500ms を過ぎると選択を解除する", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
    seed();
    await renderPage();
    selectNode(0, NODE_COUNT);
    openDialog();

    // 開いた時刻と区別できるよう、時刻をずらしてから押す（確定のクリックが時刻を記録したことを確かめる）
    now.mockReturnValue(10_200);
    fireEvent.click(dialog().getByRole("button", { name: "分割する" }), { detail: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    now.mockReturnValue(10_699);
    const allowsFocusMove = pressBlankCanvas();
    fireEvent.doubleClick(stageContainer(), { detail: 2, clientX: 600, clientY: 450 });

    expect(allowsFocusMove).toBe(false);
    expect(headerButton("ノードを分割")).toBeEnabled();
    expect(headerButton("ノードを分割")).toHaveFocus();
    // 分割後の 6 件のまま（dblclick で新しいノードを足さない）
    expect(nodesOf()).toHaveLength(NODE_COUNT + 2);

    now.mockReturnValue(10_700);
    expect(pressBlankCanvas()).toBe(true);
    expect(headerButton("ノードを分割")).toBeDisabled();
  });

  it("解像度フィルター（高のみ）で主選択が隠れると、選択が整理されて「ノードを分割」が無効になる", async () => {
    seed();
    await renderPage();
    selectNode(2, NODE_COUNT);
    expect(headerButton("ノードを分割")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));

    expect(headerButton("ノードを分割")).toBeDisabled();
  });

  // ダイアログを開いている間は根が inert で、実 UI では表示の切り替えを押せない。ここは、MapEditor から分割のフックへ渡す
  // visibleNodeIds の配線（対象が隠れたら node-hidden になること）を、jsdom の合成クリックで確かめる。
  // 上のテストだけでは、MapStage が選択を整理するので、visibleNodeIds に全ノードを渡す誤配線を検出できない
  it("ダイアログを開いたまま表示（解像度フィルター）が変わって対象が隠れると、状態文言が理由を示し、確定できない", async () => {
    seed();
    await renderPage();
    selectNode(2, NODE_COUNT);
    openDialog();
    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "slash" } });
    expect(dialog().getByRole("button", { name: "分割する" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));

    expect(dialog().getByText("分割できるノードが選択されていません。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "分割する" })).toBeDisabled();
  });

  it("選択が無いとき、またはアウトライン表示では、ボタンが無効・出ない（マップ表示へ戻すと出る）", async () => {
    seed();
    await renderPage();

    const button = headerButton("ノードを分割");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "分割できるノードが選択されていません。");
    selectNode(0, NODE_COUNT);
    expect(headerButton("ノードを分割")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.queryByRole("button", { name: "ノードを分割" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "マップ" }));
    });
    expect(screen.getByRole("button", { name: "ノードを分割" })).toBeInTheDocument();
  });
});
