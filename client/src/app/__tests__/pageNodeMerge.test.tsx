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
  mockNodePointerHandlers,
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

// 1: 親（ルート）、2: りんご（低）、3: リンゴ（高）、4: バナナ、2 の子 5・3 の子 6、7: 別の根。2・3・4 は 1 の子で兄弟
function seed() {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "統合テスト",
      json: v3Json([
        { id: 1, label: "プロジェクト", x: 100, y: 100 },
        { id: 2, parentId: 1, label: "りんご", x: 300, y: 100, importance: "low" },
        { id: 3, parentId: 1, label: "リンゴ", x: 300, y: 300, importance: "high" },
        { id: 4, parentId: 1, label: "バナナ", x: 300, y: 500 },
        { id: 5, parentId: 2, label: "りんごの子", x: 500, y: 100 },
        { id: 6, parentId: 3, label: "リンゴの子", x: 500, y: 300 },
        { id: 7, label: "別の根", x: 100, y: 700 },
      ]),
    },
  ], { currentMapId: "a" });
}

const NODE_COUNT = 7;
const ORIGINAL_IDS = [1, 2, 3, 4, 5, 6, 7];
// 統合後: 2 が消え、2 の子 5 は、残す 3 の直下の子のうち配列順で最後の 6 の直後へ付け替わる
const MERGED_IDS = [1, 3, 4, 6, 5, 7];

// selectNode と同じ手順で、Cmd/Ctrl を押しながらノードを押して選択へ加える（index は 0 始まり）。押したノードが主選択になる
function toggleSelectNode(index: number, nodeCount: number) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(0, 0, { ctrlKey: true }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}

// 2（りんご）を選んでから 3（リンゴ）を足す。選択は [2, 3]、主選択は 3
function selectAppleAndApple() {
  selectNode(1, NODE_COUNT);
  toggleSelectNode(2, NODE_COUNT);
}

function openDialog() {
  fireEvent.click(headerButton("ノードを統合"));
}

// 空きキャンバスを押す。mousedown の既定の動作（フォーカスの移動）が許されるなら true を返す
function pressBlankCanvas() {
  act(() => {
    mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
  return fireEvent.mouseDown(stageContainer());
}

function nodesOf() {
  return exportedMap(mockDownloadMapJson).nodes;
}

function idsOf(): number[] {
  return nodesOf().map((node) => node.id);
}

describe("ノードの統合", () => {
  it("複数選択を統合すると、主選択が残り、ラベルが連結され、重要度は最も高いものになり、子が付け替えられる", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();

    openDialog();
    expect(dialog().getByText("2件を1件に統合します")).toBeInTheDocument();
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(idsOf()).toEqual(MERGED_IDS);
    const nodes = nodesOf();
    expect(nodes[1]).toMatchObject({ id: 3, parentId: 1, label: "りんご リンゴ", importance: "high", x: 300, y: 300 });
    expect(nodes[4]).toMatchObject({ id: 5, parentId: 3, x: 500, y: 100 });
    expect(screen.getByText("2 件のノードを 1 件に統合しました。")).toBeInTheDocument();
  });

  it("確定全体を 1 回の Undo で戻し、1 回の Redo でやり直せる", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));

    fireEvent.click(undoButton());
    expect(idsOf()).toEqual(ORIGINAL_IDS);
    expect(nodesOf()[1]).toMatchObject({ id: 2, label: "りんご", importance: "low" });
    expect(nodesOf()[4]).toMatchObject({ id: 5, parentId: 2 });

    fireEvent.click(redoButton());
    expect(idsOf()).toEqual(MERGED_IDS);
  });

  it("確定後は選択が残したノードだけになり、ボタンが無効になるので、フォーカスは常に押せる「JSON書き出し」へ移る", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();

    fireEvent.click(dialog().getByRole("button", { name: "統合する" }), { detail: 1 });

    expect(headerButton("ノードを統合")).toBeDisabled();
    expect(screen.getByRole("button", { name: "JSON書き出し" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("区切り文字を替えると、プレビューの連結後のラベルが変わり、「その他」を空にすると区切りなしで連結する", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();
    expect(dialog().getByText("統合後のラベル").nextElementSibling).toHaveTextContent("りんご リンゴ");

    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "middle-dot" } });
    expect(dialog().getByText("統合後のラベル").nextElementSibling).toHaveTextContent("りんご・リンゴ");

    fireEvent.change(dialog().getByLabelText("区切り文字"), { target: { value: "custom" } });
    fireEvent.keyDown(dialog().getByLabelText("その他の区切り文字"), { key: "Enter" });

    expect(nodesOf().find((node) => node.id === 3)?.label).toBe("りんごリンゴ");
  });

  it("プレビューに、重要度・付け替える子の件数・統合されて消えるノードを出す", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();

    openDialog();

    expect(dialog().getByText("重要度").nextElementSibling).toHaveTextContent("高");
    expect(dialog().getByText("イラスト").nextElementSibling).toHaveTextContent("イラストなし");
    expect(dialog().getByText("付け替える子").nextElementSibling).toHaveTextContent("1件");
    expect(dialog().getByRole("list", { name: "統合されて消えるノード" })).toHaveTextContent("りんご");
  });

  it("親が違うノードを選んでいるときは、理由を文言で示して確定できない（キャンセルで閉じ、フォーカスが戻る）", async () => {
    seed();
    await renderPage();
    selectNode(1, NODE_COUNT);
    toggleSelectNode(6, NODE_COUNT);

    openDialog();
    expect(dialog().getByText("同じ親の兄弟のノードだけを統合できます。")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "統合する" })).toBeDisabled();
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(headerButton("ノードを統合")).toHaveFocus();
    expect(idsOf()).toEqual(ORIGINAL_IDS);
  });

  it("選択が 1 件以下のときはボタンが無効で、理由を title で示す。2 件になると有効になる", async () => {
    seed();
    await renderPage();

    expect(headerButton("ノードを統合")).toBeDisabled();
    selectNode(1, NODE_COUNT);
    const button = headerButton("ノードを統合");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "2 つ以上のノードを選択してください。");

    toggleSelectNode(2, NODE_COUNT);
    expect(headerButton("ノードを統合")).toBeEnabled();
  });

  it("ダイアログが開いている間は、履歴ショートカットが働かず、編集画面の根が inert になる（開く前は同じ操作で Undo される）", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }));
    const mergedIds = idsOf();

    // 前提: ダイアログを開く前なら、同じ操作で戻る
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(idsOf()).toEqual(ORIGINAL_IDS);
    fireEvent.click(redoButton());
    expect(idsOf()).toEqual(mergedIds);

    // 統合し直せるよう、元に戻してから複数選択して開く
    fireEvent.click(undoButton());
    selectAppleAndApple();
    openDialog();
    expect(document.querySelector("[data-map-id]")).toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(idsOf()).toEqual(ORIGINAL_IDS);
  });

  it("ダイアログが開いている間は、表示の切り替え（マップ・アウトライン）も働かない（L-061）", async () => {
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));

    expect(headerButton("ノードを統合")).toBeInTheDocument();
  });

  it("「統合する」の 1 回目のクリックで閉じた後、キャンバスへ届いた 500ms 以内の押下・dblclick は効かず、500ms を過ぎると選択を解除する", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
    seed();
    await renderPage();
    selectAppleAndApple();
    openDialog();

    // 開いた時刻と区別できるよう、時刻をずらしてから押す（確定のクリックが時刻を記録したことを確かめる）
    now.mockReturnValue(10_200);
    fireEvent.click(dialog().getByRole("button", { name: "統合する" }), { detail: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    now.mockReturnValue(10_699);
    const allowsFocusMove = pressBlankCanvas();
    fireEvent.doubleClick(stageContainer(), { detail: 2, clientX: 600, clientY: 450 });

    // 統合後は残したノード 1 件だけが選択されている。500ms 以内の押下では解除されず、dblclick でノードも増えない
    expect(allowsFocusMove).toBe(false);
    expect(headerButton("ノードを分割")).toBeEnabled();
    expect(idsOf()).toEqual(MERGED_IDS);

    now.mockReturnValue(10_700);
    expect(pressBlankCanvas()).toBe(true);
    expect(headerButton("ノードを分割")).toBeDisabled();
  });

  it("アウトライン表示では「ノードを統合」ボタンが出ず、マップ表示へ戻すと出る", async () => {
    seed();
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.queryByRole("button", { name: "ノードを統合" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "マップ" }));
    });
    expect(screen.getByRole("button", { name: "ノードを統合" })).toBeInTheDocument();
  });
});
