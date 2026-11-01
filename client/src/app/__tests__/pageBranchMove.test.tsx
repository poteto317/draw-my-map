import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  mockContainers,
  mockStage,
  mockStageHandlers,
  pointer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary, readMapIndex } from "@/testing/mapLibraryTestStorage";
import { encodeBranchMoveJournal } from "@/services/persistence/branchMoveJournal";
import { MAP_INDEX_STORAGE_KEY, mapBodyKey } from "@/services/persistence/mapLibraryStorage";

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

const JOURNAL_KEY = "draw-my-map.branch-move.v1";
const SAME_MAP_NOTICE = "枝を移動しました。Fキーで選択ノードへ移動できます。";

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => jest.restoreAllMocks());

function seed() {
  seedMapLibrary(window.localStorage, [
    {
      id: "a",
      name: "元マップ",
      json: v3Json([
        { id: 1, label: "元親" },
        { id: 2, parentId: 1, label: "移動する枝" },
        { id: 3, parentId: 2, label: "子孫" },
        { id: 4, label: "移動先親" },
      ]),
    },
    { id: "b", name: "別マップ", json: v3Json([{ id: 1, label: "別の根" }]) },
  ], { currentMapId: "a" });
}

function openMove() {
  selectNode(1, 4);
  fireEvent.click(headerButton("枝を移動"));
}

function submit() {
  fireEvent.click(dialog().getByRole("button", { name: "移動する" }));
}

function chooseTargetMap(id: string) {
  fireEvent.change(dialog().getByLabelText("移動先マップ"), { target: { value: id } });
}

function chooseParent(value: string) {
  fireEvent.change(dialog().getByLabelText("移動先の親"), { target: { value } });
}

function shellNotices() {
  return screen.getByTestId("map-library-notices");
}

// キャンバスの空白を押す。ブラウザの順に pointerdown → mousedown と送り、
// mousedown の既定の動作（フォーカスの移動）が許されるなら true を返す
function pressBlankCanvas() {
  act(() => {
    mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
  return fireEvent.mouseDown(stageContainer());
}

// 確定点のジャーナル削除と、その後の原本の復元の両方を失敗させる
function failJournalRemovalAndRestore() {
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  let failed = false;
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
    if (key === JOURNAL_KEY) {
      failed = true;
      throw new DOMException("blocked", "SecurityError");
    }
    removeItem.call(this, key);
  });
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (failed) throw new DOMException("blocked", "SecurityError");
    setItem.call(this, key, value);
  });
}

it("未選択では無効、親・自分・子孫を除外し、同一マップの移動を1回でUndo/Redoする", async () => {
  seed();
  await renderPage();
  expect(headerButton("枝を移動")).toBeDisabled();
  const original = exportedMap(mockDownloadMapJson);

  openMove();
  for (const name of ["元親", "移動する枝", "子孫"]) {
    expect(dialog().queryByRole("option", { name })).not.toBeInTheDocument();
  }
  expect(dialog().getByRole("button", { name: "移動する" })).toBeDisabled();
  chooseParent("4");
  expect(JSON.parse(window.localStorage.getItem(mapBodyKey("a"))!).nodes[1].parentId).toBe(1);

  await act(async () => {
    submit();
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(exportedMap(mockDownloadMapJson).nodes.find(n => n.id === 2)?.parentId).toBe(4);
  expect(exportedMap(mockDownloadMapJson).nodes.find(n => n.id === 3)?.parentId).toBe(2);

  fireEvent.click(undoButton());
  expect(exportedMap(mockDownloadMapJson)).toEqual(original);
  fireEvent.click(redoButton());
  expect(exportedMap(mockDownloadMapJson).nodes.find(n => n.id === 2)?.parentId).toBe(4);
});

it.each([["新しいルート", "root"], ["別の親", "4"]])("同一マップの%sへの移動の通知を操作通知バーに出し、移動した根を選択したままにする", async (_name, parent) => {
  seed();
  await renderPage();
  openMove();
  chooseParent(parent);

  await act(async () => {
    submit();
  });

  expect(screen.getByText(SAME_MAP_NOTICE)).toBeInTheDocument();
  expect(within(shellNotices()).queryByText(SAME_MAP_NOTICE)).not.toBeInTheDocument();
  expect(headerButton("枝を移動")).toBeEnabled();
  expect(headerButton("枝を移動")).toHaveFocus();
});

it("ルートへの移動とキャンセルに対応する", async () => {
  seed();
  await renderPage();
  const original = exportedMap(mockDownloadMapJson);

  openMove();
  chooseParent("root");
  fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));
  expect(exportedMap(mockDownloadMapJson)).toEqual(original);

  openMove();
  chooseParent("root");
  submit();
  expect(exportedMap(mockDownloadMapJson).nodes.find(n => n.id === 2)?.parentId).toBeNull();
});

it("移動先の選択肢で現在のマップに印を付ける", async () => {
  seed();
  await renderPage();

  openMove();

  expect(dialog().getByRole("option", { name: "元マップ（現在のマップ）" })).toHaveValue("a");
  expect(dialog().getByRole("option", { name: "別マップ" })).toHaveValue("b");
});

it("保存待ちの編集を含む枝を別マップへ移し、移動先を開き履歴をリセット、元を再度開いても枝がない", async () => {
  seed();
  await renderPage();
  selectNode(1, 4);
  fireEvent.click(screen.getByRole("button", { name: "重要度 高" }));
  fireEvent.click(headerButton("枝を移動"));
  chooseTargetMap("b");
  expect(dialog().queryByLabelText("移動先の親")).not.toBeInTheDocument();
  expect(dialog().getByText(/別マップへの移動は元に戻せません/)).toBeInTheDocument();
  expect(dialog().getByText(/新しいルート/)).toBeInTheDocument();

  await act(async () => {
    submit();
  });

  expect(screen.getByTestId("current-map-name")).toHaveTextContent("別マップ");
  expect(undoButton()).toBeDisabled();
  const moved = exportedMap(mockDownloadMapJson).nodes;
  expect(moved.map(n => n.label)).toEqual(["別の根", "移動する枝", "子孫"]);
  expect(moved.find(n => n.label === "移動する枝")?.importance).toBe("high");
  expect(readMapIndex(window.localStorage)?.currentMapId).toBe("b");

  fireEvent.click(headerButton("マップ一覧"));
  await act(async () => {
    fireEvent.click(dialog().getByRole("button", { name: "元マップ" }));
  });
  expect(exportedMap(mockDownloadMapJson).nodes.map(n => n.label)).toEqual(["元親", "移動先親"]);
  expect(undoButton()).toBeDisabled();
});

it("別マップへの移動の成功をシェルの通知に出し、フォーカスを「マップ一覧」へ戻す", async () => {
  seed();
  await renderPage();
  openMove();
  chooseTargetMap("b");

  await act(async () => {
    submit();
  });

  await waitFor(() => expect(within(shellNotices()).getByRole("status"))
    .toHaveTextContent("枝を移動し、移動先のマップを開きました。"));
  // 移動先は未選択で開くので、Fキーの案内は出さない
  expect(within(shellNotices()).getByRole("status")).not.toHaveTextContent("Fキー");
  expect(headerButton("枝を移動")).toBeDisabled();
  expect(headerButton("マップ一覧")).toHaveFocus();
});

it("保存失敗はダイアログを残し、元の枝・表示を維持する", async () => {
  seed();
  await renderPage();
  const original = exportedMap(mockDownloadMapJson);
  openMove();
  chooseTargetMap("b");
  const setItem = Storage.prototype.setItem;
  let failed = false;
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === mapBodyKey("b") && !failed) {
      failed = true;
      throw new DOMException("full", "QuotaExceededError");
    }
    setItem.call(this, key, value);
  });

  submit();

  await waitFor(() => expect(dialog().getByRole("alert")).not.toBeEmptyDOMElement());
  expect(screen.getByTestId("current-map-name")).toHaveTextContent("元マップ");
  fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }));
  expect(exportedMap(mockDownloadMapJson)).toEqual(original);
  expect(JSON.parse(window.localStorage.getItem(mapBodyKey("a"))!).nodes).toHaveLength(4);
});

it("inert・ショートカット停止・Escapeのフォーカス復帰・閉じた直後のdblclick抑止", async () => {
  seed();
  await renderPage();
  const original = exportedMap(mockDownloadMapJson);

  openMove();
  expect(document.querySelector("[data-map-id]")).toHaveAttribute("inert");
  expect(dialog().getByLabelText("移動先マップ")).toHaveFocus();
  fireEvent.keyDown(window, { key: "Delete" });
  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(headerButton("枝を移動")).toHaveFocus();
  expect(document.querySelector("[data-map-id]")).not.toHaveAttribute("inert");
  expect(exportedMap(mockDownloadMapJson)).toEqual(original);

  openMove();
  fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }), { detail: 1 });
  fireEvent.doubleClick(stageContainer(), { clientX: 600, clientY: 400 });
  expect(exportedMap(mockDownloadMapJson)).toEqual(original);
});

describe("ダイアログのボタンのダブルクリックの2回目がキャンバスへ届いたとき", () => {
  it("「キャンセル」では選択とフォーカスを保つ", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
    seed();
    await renderPage();
    openMove();

    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }), { detail: 1 });
    now.mockReturnValue(10_499);
    const allowsFocusMove = pressBlankCanvas();

    expect(allowsFocusMove).toBe(false);
    expect(headerButton("枝を移動")).toBeEnabled();
    expect(headerButton("枝を移動")).toHaveFocus();
  });

  it("同一マップの「移動する」では選択とフォーカスを保つ", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
    seed();
    await renderPage();
    openMove();
    chooseParent("4");

    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "移動する" }), { detail: 1 });
    });
    now.mockReturnValue(10_499);
    const allowsFocusMove = pressBlankCanvas();

    expect(allowsFocusMove).toBe(false);
    expect(screen.getByText(SAME_MAP_NOTICE)).toBeInTheDocument();
    expect(headerButton("枝を移動")).toBeEnabled();
    expect(headerButton("枝を移動")).toHaveFocus();
  });

  it("時間窓を過ぎた通常の空白クリックでは選択を解除する", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
    seed();
    await renderPage();
    openMove();

    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }), { detail: 1 });
    now.mockReturnValue(10_500);
    const allowsFocusMove = pressBlankCanvas();

    expect(allowsFocusMove).toBe(true);
    expect(headerButton("枝を移動")).toBeDisabled();
  });

  it("キーボードで閉じた直後の空白クリックでは選択を解除する", async () => {
    jest.spyOn(Date, "now").mockReturnValue(10_000);
    seed();
    await renderPage();
    openMove();

    fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }), { detail: 0 });
    const allowsFocusMove = pressBlankCanvas();

    expect(allowsFocusMove).toBe(true);
    expect(headerButton("枝を移動")).toBeDisabled();
  });
});

it("開いている間にマップの読み込みで選択が外れたら、閉じた後のフォーカスを「JSON書き出し」へ送る", async () => {
  seed();
  const { container } = await renderPage();
  openMove();
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([v3Json([{ id: 1, label: "読み込み済み" }])], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: () => Promise.resolve(v3Json([{ id: 1, label: "読み込み済み" }])) });

  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await waitFor(() => expect(dialog().getByRole("alert")).toHaveTextContent("マップが更新されました"));
  expect(headerButton("枝を移動")).toBeDisabled();

  fireEvent.keyDown(window, { key: "Escape" });

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(headerButton("JSON書き出し")).toHaveFocus();
});

function seedInterruptedMove(afterSource: string) {
  seed();
  const indexBefore = window.localStorage.getItem(MAP_INDEX_STORAGE_KEY)!;
  window.localStorage.setItem(JOURNAL_KEY, encodeBranchMoveJournal({
    version: 1,
    sourceId: "a",
    targetId: "b",
    sourceBefore: window.localStorage.getItem(mapBodyKey("a")),
    targetBefore: window.localStorage.getItem(mapBodyKey("b")),
    indexBefore,
  }));
  window.localStorage.setItem(mapBodyKey("a"), afterSource);
}

it("起動で原本へ戻せなかったら、移動元の原本を保護モードで開き通知を出す", async () => {
  seedInterruptedMove(v3Json([{ id: 1, label: "移動後の本体" }]));
  const removeItem = Storage.prototype.removeItem;
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
    if (key === JOURNAL_KEY) throw new DOMException("blocked", "SecurityError");
    removeItem.call(this, key);
  });

  await renderPage();

  await waitFor(() => expect(within(shellNotices()).getByRole("alert"))
    .toHaveTextContent("ページを閉じる前にJSONで書き出してください。"));
  expect(screen.getByTestId("current-map-name")).toHaveTextContent("元マップ");
  expect(exportedMap(mockDownloadMapJson).nodes.map(n => n.label))
    .toEqual(["元親", "移動する枝", "子孫", "移動先親"]);
  expect(headerButton("マップ一覧")).toBeDisabled();
  expect(window.localStorage.getItem(JOURNAL_KEY)).not.toBeNull();
});

it("起動のジャーナルが壊れていたら、空の保護モードで開き、キー名を案内して保存データを消さない", async () => {
  seed();
  window.localStorage.setItem(JOURNAL_KEY, "{broken");
  const body = window.localStorage.getItem(mapBodyKey("a"));

  await renderPage();

  const notice = await waitFor(() => {
    const alert = within(shellNotices()).getByRole("alert");
    expect(alert).toHaveTextContent(JOURNAL_KEY);
    return alert;
  });
  expect(notice).not.toHaveTextContent("書き出");
  expect(document.querySelector("[data-map-id]")).toHaveAttribute("data-map-id", "branch-move-recovery");
  expect(exportedMap(mockDownloadMapJson).nodes).toEqual([]);
  expect(headerButton("マップ一覧")).toBeDisabled();
  expect(window.localStorage.getItem(JOURNAL_KEY)).toBe("{broken");
  expect(window.localStorage.getItem(mapBodyKey("a"))).toBe(body);
});

it("復元失敗で同じmapIdの保護モードへ移っても原本を再読し別マップ操作を停止する", async () => {
  seed();
  await renderPage();
  selectNode(1, 4);
  fireEvent.click(screen.getByRole("button", { name: "重要度 高" }));
  expect(undoButton()).toBeEnabled();
  openMove();
  chooseTargetMap("b");
  failJournalRemovalAndRestore();

  await act(async () => {
    submit();
  });

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(exportedMap(mockDownloadMapJson).nodes.map(n => n.label))
    .toEqual(["元親", "移動する枝", "子孫", "移動先親"]);
  expect(headerButton("マップ一覧")).toBeDisabled();
  expect(undoButton()).toBeDisabled();
  expect(window.localStorage.getItem(JOURNAL_KEY)).not.toBeNull();
  openMove();
  expect(dialog().getAllByRole("option").map(option => option.getAttribute("value"))).not.toContain("b");
});

it("保護モードへ移ると書き出しを案内し、フォーカスを「JSON書き出し」へ移す", async () => {
  seed();
  await renderPage();
  openMove();
  chooseTargetMap("b");
  failJournalRemovalAndRestore();

  await act(async () => {
    submit();
  });

  await waitFor(() => expect(within(shellNotices()).getByRole("alert"))
    .toHaveTextContent("ページを閉じる前にJSONで書き出してください。"));
  expect(headerButton("JSON書き出し")).toHaveFocus();
});

it("起動の通知を出したセッションでも、保護モードへ移ると書き出しを案内する", async () => {
  seed();
  // 壊れたインデックスから作り直す起動は warning の通知を出す
  window.localStorage.setItem(MAP_INDEX_STORAGE_KEY, "{broken");
  await renderPage();
  await waitFor(() => expect(within(shellNotices()).getByRole("alert")).not.toBeEmptyDOMElement());
  const startupMessage = within(shellNotices()).getByRole("alert").textContent;
  openMove();
  chooseTargetMap("b");
  failJournalRemovalAndRestore();

  await act(async () => {
    submit();
  });

  await waitFor(() => expect(within(shellNotices()).getByRole("alert"))
    .toHaveTextContent("ページを閉じる前にJSONで書き出してください。"));
  expect(within(shellNotices()).getByRole("alert")).not.toHaveTextContent(startupMessage!);
});

const RESOLUTION_MAP = [
  { id: 1, label: "祖先", importance: "low" },
  { id: 2, parentId: 1, label: "親", importance: "low" },
  { id: 3, parentId: 2, label: "既存の子", importance: "low" },
  { id: 4, label: "移動元", importance: "high" },
];

it("移動先の折りたたみ全祖先を展開し、見えている枝を隠れた親へ移しても表示レベルを変えない", async () => {
  seedMapLibrary(window.localStorage, [{ id: "a", name: "A", json: v3Json(RESOLUTION_MAP) }]);
  await renderPage();
  selectNode(1, 4);
  fireEvent.click(headerButton("枝を折りたたむ"));
  selectNode(0, 4);
  fireEvent.click(headerButton("枝を折りたたむ"));
  fireEvent.click(screen.getByRole("button", { name: "表示 高のみ" }));
  selectNode(3, 4);
  fireEvent.click(headerButton("枝を移動"));
  chooseParent("2");

  submit();

  expect(screen.getByRole("button", { name: "表示 高のみ" })).toHaveAttribute("aria-pressed", "true");
  // 祖先・親は移した枝の祖先として見え、折りたたみも開く。既存の子は重要度で隠れたまま
  expect(mockContainers.slice(-4).map(node => node.eventMode === "static")).toEqual([true, true, false, true]);
  expect(exportedMap(mockDownloadMapJson).nodes.find(n => n.id === 4)?.parentId).toBe(2);
});

it("移動元自身が表示レベルで隠れていたら全表示にする", async () => {
  seedMapLibrary(window.localStorage, [{ id: "a", name: "A", json: v3Json(RESOLUTION_MAP) }]);
  await renderPage();
  selectNode(2, 4);
  fireEvent.click(headerButton("枝を移動"));
  chooseParent("root");
  // ダイアログの間に表示レベルが変わった状態を作る（実際は倍率で自動の表示レベルが変わる場合）。
  // jsdom は inert を強制しないので、ヘッダーのボタンから切り替えられる
  fireEvent.click(screen.getByRole("button", { name: "表示 高のみ", hidden: true }));

  submit();

  expect(screen.getByRole("button", { name: "表示 すべて" })).toHaveAttribute("aria-pressed", "true");
  expect(exportedMap(mockDownloadMapJson).nodes.find(n => n.id === 3)?.parentId).toBeNull();
});
