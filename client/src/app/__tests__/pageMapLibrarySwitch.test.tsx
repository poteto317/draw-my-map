import { StrictMode } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import {
  dialog,
  type ExportedMap,
  type ExportedNode,
  headerButton,
  renderPage,
  selectNode,
  stageContainer,
  undoButton,
} from "@/app/testing/pageTestHelpers";
import { INITIAL_VIEWPORT } from "@/components/map/mapViewport";
import { MENU_ACTIVATION_DOUBLE_CLICK_WINDOW_MS } from "@/components/map/menuActivationDoubleClick";
import {
  lastWorldContainer,
  mockStage,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { AUTO_SAVE_FAILURE_MESSAGE } from "@/domain/mapLibrary/mapLibraryMessages";
import { rasterizeMapSvgToPng } from "@/services/imageExport/mapPngRasterizer";
import { generateIllustrationThumbnail } from "@/services/illustration/illustrationGeneration";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
import { MAP_STORAGE_KEY } from "@/services/persistence/mapStorage";
import { readActiveMapJson, readMapIndex, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

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

const mockGenerateIllustrationThumbnail = jest.mocked(generateIllustrationThumbnail);
const mockRasterizeMapSvgToPng = jest.mocked(rasterizeMapSvgToPng);

const LEGACY_CORRUPT_WARNING =
  "以前の保存データを読み込めなかったため、空のマップで開始します。以前の保存データは消さずに残しています。";
const SWITCH_FLUSH_FAILURE =
  "現在のマップを保存できなかったため、マップを切り替えませんでした。不要なマップを削除するか、JSONで書き出してください。";
const CREATE_FLUSH_FAILURE =
  "現在のマップを保存できなかったため、新しいマップを作成しませんでした。不要なマップを削除するか、JSONで書き出してください。";
const IMAGE = "data:image/jpeg;base64,TkVX";

type SeedNode = { id: number; label: string; parentId?: number | null; x?: number; y?: number };

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
}

function v3Json(nodes: readonly SeedNode[]): string {
  return `${JSON.stringify({
    version: 3,
    layoutMode: "manual",
    nodes: nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId ?? null,
      x: node.x ?? 100,
      y: node.y ?? 100,
      width: 100,
      height: 60,
      label: node.label,
      importance: "medium",
    })),
  }, null, 2)}\n`;
}

const A_JSON = v3Json([{ id: 1, label: "A1" }]);
const B_JSON = v3Json([{ id: 1, label: "B1" }]);

function seedTwoMaps(aJson = A_JSON, bJson = B_JSON) {
  return seedMapLibrary(window.localStorage, [
    { id: "a", name: "A", json: aJson, updatedAt: "2026-01-02T00:00:00.000Z" },
    { id: "b", name: "B", json: bJson, updatedAt: "2026-01-01T00:00:00.000Z" },
  ], { currentMapId: "a" });
}

function setupUser() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

// ダイアログ内の通知は、一度空にした次のフレームで入る
function nextFrame() {
  act(() => {
    jest.advanceTimersToNextFrame();
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function currentMapName(): HTMLElement {
  return screen.getByTestId("current-map-name");
}

function banner() {
  return within(screen.getByRole("banner"));
}

async function openList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(headerButton("マップ一覧"));
  return dialog();
}

async function switchTo(user: ReturnType<typeof userEvent.setup>, name: string) {
  const previousWorld = lastWorldContainer();
  const list = await openList(user);
  await user.click(list.getByRole("button", { name }));
  // 再マウントした MapStage が Pixi を初期化して新しいワールドを描くまで待ち、新しいステージの位置を固定する。
  // waitFor は fake timers を検出し、待つ間に fake clock を進めて act の外で予約された再描画を流す
  await waitFor(() => expect(lastWorldContainer()).not.toBe(previousWorld));
  mockStageBounds(stageContainer());
  // ダイアログを閉じたクリックの直後の dblclick は、ダブルクリックの続きとして無視される。
  // 続けてキャンバスをダブルクリックするテストのために、タイマーは動かさず時計だけ時間窓の外へ進める
  jest.setSystemTime(Date.now() + MENU_ACTIVATION_DOUBLE_CLICK_WINDOW_MS);
}

function exportedNodes(): ExportedNode[] {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return (JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap).nodes;
}

function exportedLabels(): string[] {
  return exportedNodes().map((node) => node.label);
}

function bodyLabels(id: string): string[] | null {
  const body = window.localStorage.getItem(mapBodyKey(id));
  return body === null ? null : (JSON.parse(body) as ExportedMap).nodes.map((node) => node.label);
}

// 本体のキーで絞った書き込みの履歴（L-419）。各書き込みのノード数を返す
function bodyWriteNodeCounts(setItem: jest.SpyInstance, id: string): number[] {
  return setItem.mock.calls
    .filter(([key]) => key === mapBodyKey(id))
    .map(([, value]) => (JSON.parse(String(value)) as ExportedMap).nodes.length);
}

// 空き領域のダブルクリックで、その位置を中心にノードを追加する
function addNodeAt(x: number, y: number) {
  fireEvent.doubleClick(stageContainer(), { clientX: x, clientY: y });
}

async function addLabeledNodeAt(user: ReturnType<typeof userEvent.setup>, x: number, y: number, label: string) {
  addNodeAt(x, y);
  // 1回目は空き領域で追加し、2回目は追加したノードの上でラベルの編集を開く
  fireEvent.doubleClick(stageContainer(), { clientX: x, clientY: y });
  await user.type(screen.getByTestId("node-label-input"), `${label}{Enter}`);
}

function resolutionButton(label: "自動" | "すべて"): HTMLElement {
  return screen.getByRole("button", { name: `表示 ${label}` });
}

function fileInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

function jsonFile(text: Promise<string>): File {
  const file = new File(["{}"], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: jest.fn(() => text),
  });
  return file;
}

// 指定したキーへの書き込みだけを、shouldFail が true の間は容量超過で失敗させる
function failSetItemFor(key: string, shouldFail: () => boolean) {
  const original = Storage.prototype.setItem;
  return jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, itemKey, value) {
    if (itemKey === key && shouldFail()) {
      throw new DOMException("full", "QuotaExceededError");
    }
    original.call(this, itemKey, value);
  });
}

// localStorage の容量を、キーと値の文字数の合計で capacity までに制限する
function limitStorageCapacity(capacity: number) {
  const original = Storage.prototype.setItem;
  return jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, itemKey, value) {
    let size = itemKey.length + String(value).length;
    for (let i = 0; i < this.length; i += 1) {
      const key = this.key(i);
      if (key !== null && key !== itemKey) {
        size += key.length + (this.getItem(key) ?? "").length;
      }
    }
    if (size > capacity) {
      throw new DOMException("full", "QuotaExceededError");
    }
    original.call(this, itemKey, value);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
  mockDownloadMapImage.mockReset();
  mockGenerateIllustrationThumbnail.mockReset();
  mockRasterizeMapSvgToPng.mockReset();
  mockRasterizeMapSvgToPng.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("マップの切り替えと混在の防止", () => {
  it("編集から300ms以内に切り替えると、元のマップの本体へ編集を書き、切り替えた後は元のマップの本体を書かない", async () => {
    seedTwoMaps();
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    const user = setupUser();
    await renderPage();
    addNodeAt(500, 400);
    advance(100);
    expect(bodyLabels("a")).toEqual(["A1"]);

    await switchTo(user, "B");

    expect(currentMapName()).toHaveTextContent("マップ: B");
    expect(bodyLabels("a")).toHaveLength(2);
    expect(bodyWriteNodeCounts(setItem, "a")).toEqual([2]);
    advance(300);
    expect(bodyWriteNodeCounts(setItem, "a")).toEqual([2]);
    expect(bodyLabels("b")).toEqual(["B1"]);
  });

  it("切り替えた後は前のマップの操作を元に戻せず、A と B の本体はそれぞれの編集だけを含む", async () => {
    seedTwoMaps();
    const user = setupUser();
    await renderPage();
    await addLabeledNodeAt(user, 500, 400, "A2");
    expect(undoButton()).toBeEnabled();

    await switchTo(user, "B");

    expect(undoButton()).toBeDisabled();
    await user.keyboard("{Control>}z{/Control}");
    expect(exportedLabels()).toEqual(["B1"]);
    await addLabeledNodeAt(user, 500, 400, "B2");
    advance(300);

    await switchTo(user, "A");

    expect(exportedLabels()).toEqual(["A1", "A2"]);
    expect(undoButton()).toBeDisabled();
    expect(bodyLabels("a")).toEqual(["A1", "A2"]);
    expect(bodyLabels("b")).toEqual(["B1", "B2"]);
  });

  it("検索クエリ・折りたたみ・解像度フィルターは、切り替えると初期状態に戻る", async () => {
    seedTwoMaps(
      v3Json([{ id: 1, label: "親A" }, { id: 2, label: "子A", parentId: 1, x: 300 }]),
      v3Json([{ id: 1, label: "親B" }, { id: 2, label: "子B", parentId: 1, x: 300 }]),
    );
    const user = setupUser();
    await renderPage();
    selectNode(0, 2);
    await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
    await user.click(resolutionButton("すべて"));
    await user.type(screen.getByRole("combobox", { name: "ノードを検索" }), "親");
    expect(screen.getByRole("button", { name: "枝を展開" })).toBeInTheDocument();
    expect(resolutionButton("すべて")).toHaveAttribute("aria-pressed", "true");

    await switchTo(user, "B");

    expect(screen.getByRole("combobox", { name: "ノードを検索" })).toHaveValue("");
    expect(resolutionButton("自動")).toHaveAttribute("aria-pressed", "true");
    expect(resolutionButton("すべて")).toHaveAttribute("aria-pressed", "false");
    // 同じ id 1 の親を選んでも、A の折りたたみを引き継がない
    selectNode(0, 2);
    expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "枝を展開" })).not.toBeInTheDocument();
  });

  it("ズームとパンをしたビューポートは、切り替えると初期値に戻る", async () => {
    seedTwoMaps();
    const user = setupUser();
    await renderPage();
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);
    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 100,
        clientY: 100,
        deltaY: -100,
        cancelable: true,
      }));
    });
    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
      mockStageHandlers.pointerup?.(pointer(20, 10));
    });
    const world = lastWorldContainer()!;
    expect(world.scale.set.mock.lastCall).toEqual([Math.exp(0.1)]);
    expect(world.position.set.mock.lastCall)
      .not.toEqual([INITIAL_VIEWPORT.offsetX, INITIAL_VIEWPORT.offsetY]);

    await switchTo(user, "B");

    const nextWorld = lastWorldContainer()!;
    expect(nextWorld).not.toBe(world);
    expect(nextWorld.scale.set.mock.lastCall).toEqual([INITIAL_VIEWPORT.scale]);
    expect(nextWorld.position.set.mock.lastCall)
      .toEqual([INITIAL_VIEWPORT.offsetX, INITIAL_VIEWPORT.offsetY]);
  });

  it("生成中のイラストは、同じ id のノードを持つ切り替え先のマップに出ず、付かない", async () => {
    const bJson = v3Json([{ id: 1, label: "みかん" }]);
    seedTwoMaps(v3Json([{ id: 1, label: "りんご" }]), bJson);
    const request = deferred<string>();
    mockGenerateIllustrationThumbnail.mockReturnValueOnce(request.promise);
    const user = setupUser();
    await renderPage();
    selectNode(0, 1);
    await user.click(screen.getByRole("button", { name: "イラストを生成" }));
    expect(mockGenerateIllustrationThumbnail).toHaveBeenCalledWith("りんご", expect.anything());
    const [, options] = mockGenerateIllustrationThumbnail.mock.lastCall!;

    await switchTo(user, "B");
    expect(options?.signal?.aborted).toBe(true);
    selectNode(0, 1);
    expect(screen.getByRole("complementary", { name: "イラスト" })).toHaveTextContent("みかん");
    expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
    request.resolve(IMAGE);
    await settle();
    advance(300);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ノードに設定" })).not.toBeInTheDocument();
    expect(exportedNodes()[0]).not.toHaveProperty("illustration");
    expect(window.localStorage.getItem(mapBodyKey("b"))).toBe(bJson);
  });

  it("陽性対照: 切り替えずに生成を解決すると、同じ待ち方でプレビューと「ノードに設定」が出る", async () => {
    seedTwoMaps(v3Json([{ id: 1, label: "りんご" }]));
    const request = deferred<string>();
    mockGenerateIllustrationThumbnail.mockReturnValueOnce(request.promise);
    const user = setupUser();
    await renderPage();
    selectNode(0, 1);
    await user.click(screen.getByRole("button", { name: "イラストを生成" }));

    request.resolve(IMAGE);
    await settle();
    advance(300);

    expect(screen.getByRole("img")).toHaveAttribute("src", IMAGE);
    expect(screen.getByRole("button", { name: "ノードに設定" })).toBeInTheDocument();
  });

  it("A → B → A と続けて切り替えても、A の本体には flush の内容と2回目の A での編集だけを書く", async () => {
    seedTwoMaps();
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    const user = setupUser();
    await renderPage();
    expect(banner().getByRole("status", { name: "保存状態: 保存済み" })).toBeInTheDocument();
    addNodeAt(500, 400);
    expect(banner().getByRole("status", { name: "保存状態: 保存待ち" })).toBeInTheDocument();
    advance(100);

    await switchTo(user, "B");
    expect(currentMapName()).toHaveTextContent("マップ: B");
    expect(banner().getByRole("status", { name: "保存状態: 保存済み" })).toBeInTheDocument();
    await switchTo(user, "A");
    expect(currentMapName()).toHaveTextContent("マップ: A");
    expect(banner().getByRole("status", { name: "保存状態: 保存済み" })).toBeInTheDocument();
    expect(exportedLabels()).toHaveLength(2);
    addNodeAt(300, 400);
    advance(300);
    expect(banner().getByRole("status", { name: "保存状態: 保存済み" })).toBeInTheDocument();

    expect(bodyWriteNodeCounts(setItem, "a")).toEqual([2, 3]);
    expect(bodyLabels("a")).toHaveLength(3);
    advance(300);
    expect(bodyWriteNodeCounts(setItem, "a")).toEqual([2, 3]);
  });

  it("保存待ちを書けないと切り替えと新規作成を中止し、別のマップを削除すると保存して保存失敗の通知を消す", async () => {
    seedMapLibrary(window.localStorage, [
      { id: "a", name: "A", json: A_JSON, updatedAt: "2026-01-03T00:00:00.000Z" },
      { id: "b", name: "B", json: B_JSON, updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: "c", name: "C", json: v3Json([{ id: 1, label: "C1" }]), updatedAt: "2026-01-01T00:00:00.000Z" },
    ], { currentMapId: "a" });
    let failBodyA = true;
    failSetItemFor(mapBodyKey("a"), () => failBodyA);
    const user = setupUser();
    await renderPage();
    addNodeAt(500, 400);
    advance(300);
    expect(banner().getByText(AUTO_SAVE_FAILURE_MESSAGE)).toBeInTheDocument();
    expect(banner().getByRole("status", { name: "保存状態: 保存失敗" })).toBeInTheDocument();

    const list = await openList(user);
    await user.click(list.getByRole("button", { name: "B" }));
    nextFrame();

    const alert = dialog().getByRole("alert");
    expect(alert).toHaveTextContent(SWITCH_FLUSH_FAILURE);
    expect(dialog().getByRole("button", { name: "B" })).toHaveFocus();
    expect(currentMapName()).toHaveTextContent("マップ: A");
    expect(readMapIndex(window.localStorage)?.currentMapId).toBe("a");

    // 同じ失敗が続いても、同じ alert を一度空にしてから入れ直して読み上げ直させる
    await user.click(dialog().getByRole("button", { name: "B" }));
    expect(alert).toBeEmptyDOMElement();
    nextFrame();
    expect(alert).toHaveTextContent(SWITCH_FLUSH_FAILURE);
    expect(dialog().getByRole("alert")).toBe(alert);

    await user.click(dialog().getByRole("button", { name: "新しいマップ" }));
    await user.type(dialog().getByRole("textbox", { name: "マップ名" }), "旅行");
    await user.click(dialog().getByRole("button", { name: "作成" }));
    nextFrame();

    expect(dialog().getByRole("alert")).toHaveTextContent(CREATE_FLUSH_FAILURE);
    expect(dialog().getByRole("textbox", { name: "マップ名" })).toBeInTheDocument();
    expect(currentMapName()).toHaveTextContent("マップ: A");
    expect(readMapIndex(window.localStorage)?.maps).toHaveLength(3);

    await user.keyboard("{Escape}");
    failBodyA = false;
    await user.click(dialog().getByRole("button", { name: "削除: C" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));

    expect(readMapIndex(window.localStorage)?.maps.map((map) => map.id)).toEqual(["a", "b"]);
    expect(bodyLabels("a")).toHaveLength(2);
    expect(dialog().getByRole("alert")).toHaveTextContent("");
    expect(banner().queryByText(AUTO_SAVE_FAILURE_MESSAGE)).not.toBeInTheDocument();
    expect(banner().getByRole("status", { name: "保存状態: 保存済み" })).toBeInTheDocument();
    expect(currentMapName()).toHaveTextContent("マップ: A");
  });

  it("編集から300ms以内の切り替えで保存待ちを書けないと、ダイアログを閉じた後も操作通知バーに保存失敗の通知が残る", async () => {
    seedTwoMaps();
    failSetItemFor(mapBodyKey("a"), () => true);
    const user = setupUser();
    await renderPage();
    addNodeAt(500, 400);
    advance(100);
    // タイマーはまだ動いていないので、操作通知バーには何も出ていない
    expect(banner().queryByText(AUTO_SAVE_FAILURE_MESSAGE)).not.toBeInTheDocument();

    const list = await openList(user);
    await user.click(list.getByRole("button", { name: "B" }));
    nextFrame();
    expect(dialog().getByRole("alert")).toHaveTextContent(SWITCH_FLUSH_FAILURE);

    await user.click(dialog().getByRole("button", { name: "閉じる" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(currentMapName()).toHaveTextContent("マップ: A");
    expect(banner().getByText(AUTO_SAVE_FAILURE_MESSAGE)).toBeInTheDocument();
    expect(banner().getByRole("status", { name: "保存状態: 保存失敗" })).toBeInTheDocument();
  });

  it("切り替える前に始めた PNG 書き出しは、切り替えた後に終わってもダウンロードも通知もしない", async () => {
    seedTwoMaps();
    const raster = deferred<Blob>();
    mockRasterizeMapSvgToPng.mockReturnValueOnce(raster.promise);
    const user = setupUser();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "PNG書き出し" }));
    expect(mockRasterizeMapSvgToPng).toHaveBeenCalledTimes(1);

    await switchTo(user, "B");
    raster.resolve(new Blob(["png"], { type: "image/png" }));
    await settle();

    expect(mockDownloadMapImage).not.toHaveBeenCalled();
    expect(screen.queryByText("PNGファイルを書き出しました。")).not.toBeInTheDocument();
  });

  it("切り替える前に始めた JSON の読み込みは、切り替えた後に読めても切り替え先の内容と本体を変えない", async () => {
    seedTwoMaps();
    const text = deferred<string>();
    const user = setupUser();
    await renderPage();
    await user.upload(fileInput(), jsonFile(text.promise));

    await switchTo(user, "B");
    text.resolve(v3Json([{ id: 9, label: "読込" }]));
    await settle();
    advance(300);

    expect(exportedLabels()).toEqual(["B1"]);
    expect(window.localStorage.getItem(mapBodyKey("b"))).toBe(B_JSON);
    expect(window.localStorage.getItem(mapBodyKey("a"))).toBe(A_JSON);
    expect(screen.queryByText("マップを読み込みました。")).not.toBeInTheDocument();
  });

  it("陽性対照: 切り替えずに JSON の読み取りを解決すると、同じ待ち方で読み込んで通知する", async () => {
    seedTwoMaps();
    const text = deferred<string>();
    const user = setupUser();
    await renderPage();
    await user.upload(fileInput(), jsonFile(text.promise));

    text.resolve(v3Json([{ id: 9, label: "読込" }]));
    await settle();
    advance(300);

    expect(screen.getByText("マップを読み込みました。")).toBeInTheDocument();
    expect(exportedLabels()).toEqual(["読込"]);
  });

  it("コンテキストメニューを開いたままヘッダーから一覧を開くと、メニューを閉じる", async () => {
    seedTwoMaps();
    const user = setupUser();
    await renderPage();
    fireEvent.contextMenu(stageContainer(), { clientX: 150, clientY: 130 });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await openList(user);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("名前の変更と書き出しのファイル名", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
  });

  it("名前を「旅行/計画」に変えると、JSON・SVG・PNG のファイル名が「旅行_計画-」で始まる", async () => {
    seedTwoMaps();
    // JSON は実際のダウンロード処理を通し、a 要素の download 属性でファイル名を確かめる
    const actualJsonDownload = jest.requireActual<typeof import("@/services/persistence/mapJsonDownload")>(
      "@/services/persistence/mapJsonDownload",
    );
    mockDownloadMapJson.mockImplementation((json: string, mapName: string) => (
      actualJsonDownload.downloadMapJson(json, mapName)
    ));
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:map-json") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
    const jsonFileNames: string[] = [];
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      jsonFileNames.push(this.download);
    });
    const user = setupUser();
    await renderPage();

    const list = await openList(user);
    await user.click(list.getByRole("button", { name: "名前を変更: A" }));
    const input = dialog().getByRole("textbox", { name: "マップ名" });
    await user.clear(input);
    await user.type(input, "旅行/計画");
    await user.click(dialog().getByRole("button", { name: "変更" }));
    await user.click(dialog().getByRole("button", { name: "閉じる" }));
    expect(currentMapName()).toHaveTextContent("マップ: 旅行/計画");

    await user.click(screen.getByRole("button", { name: "JSON書き出し" }));
    await user.click(screen.getByRole("button", { name: "SVG書き出し" }));
    await user.click(screen.getByRole("button", { name: "PNG書き出し" }));
    await waitFor(() => expect(mockDownloadMapImage).toHaveBeenCalledTimes(2));

    expect(jsonFileNames).toHaveLength(1);
    expect(jsonFileNames[0]).toMatch(/^旅行_計画-\d{8}-\d{6}\.json$/);
    const imageFileNames = mockDownloadMapImage.mock.calls.map(([, fileName]) => fileName as string);
    expect(imageFileNames[0]).toMatch(/^旅行_計画-\d{8}-\d{6}\.svg$/);
    expect(imageFileNames[1]).toMatch(/^旅行_計画-\d{8}-\d{6}\.png$/);
  });
});

describe("移行と保護モード", () => {
  it("StrictMode で旧キーだけから起動すると、内容を表示し、旧キーはその起動では残る", async () => {
    window.localStorage.setItem(MAP_STORAGE_KEY, A_JSON);

    await renderPage(<StrictMode><Home /></StrictMode>);
    advance(300);

    expect(currentMapName()).toHaveTextContent("マップ: 無題のマップ");
    expect(exportedLabels()).toEqual(["A1"]);
    expect(readActiveMapJson(window.localStorage)).toBe(A_JSON);
    expect(window.localStorage.getItem(MAP_STORAGE_KEY)).toBe(A_JSON);
    expect(readMapIndex(window.localStorage)?.legacyCleanupPending).toBe(true);
  });

  it("旧キーが容量の約半分を超えていても、旧キーを消してから移行し、通常のモードで開く", async () => {
    const largeLabel = "大".repeat(3000);
    const largeJson = v3Json([{ id: 1, label: largeLabel }]);
    window.localStorage.setItem(MAP_STORAGE_KEY, largeJson);
    // 旧キーと本体の2つは入らないが、本体とインデックスは入る容量
    limitStorageCapacity(MAP_STORAGE_KEY.length + largeJson.length + 1000);

    await renderPage();
    advance(300);

    expect(currentMapName()).toHaveTextContent("マップ: 無題のマップ");
    expect(exportedLabels()).toEqual([largeLabel]);
    expect(window.localStorage.getItem(MAP_STORAGE_KEY)).toBeNull();
    expect(readActiveMapJson(window.localStorage)).toBe(largeJson);
    expect(readMapIndex(window.localStorage)?.legacyCleanupPending).toBe(false);
    expect(headerButton("マップ一覧")).toBeEnabled();
    expect(screen.getByTestId("map-library-notices").textContent).toBe("");
    expect(screen.queryByText(/保存できないため|移行できません/)).not.toBeInTheDocument();
  });

  it("旧キーの移行に失敗したら、旧キーの内容を保護モードで表示し、編集しても旧キーを変えない", async () => {
    window.localStorage.setItem(MAP_STORAGE_KEY, A_JSON);
    const original = Storage.prototype.setItem;
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith(mapBodyKey(""))) {
        throw new DOMException("blocked", "SecurityError");
      }
      original.call(this, key, value);
    });

    await renderPage();

    expect(exportedLabels()).toEqual(["A1"]);
    expect(headerButton("マップ一覧")).toBeDisabled();
    const notices = within(screen.getByTestId("map-library-notices"));
    await waitFor(() => expect(notices.getByRole("alert")).toHaveTextContent("新しい形式へ移行できませんでした"));

    setItem.mockClear();
    addNodeAt(500, 400);
    advance(300);

    expect(exportedLabels()).toHaveLength(2);
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(MAP_STORAGE_KEY)).toBe(A_JSON);
    expect(readMapIndex(window.localStorage)).toBeNull();
  });

  it("StrictMode で壊れた旧キーから起動すると、旧キーを残し、起動時の warning が消えずに残る", async () => {
    window.localStorage.setItem(MAP_STORAGE_KEY, "{");

    await renderPage(<StrictMode><Home /></StrictMode>);
    const notices = within(screen.getByTestId("map-library-notices"));
    await waitFor(() => expect(notices.getByRole("alert")).toHaveTextContent(LEGACY_CORRUPT_WARNING));
    advance(1000);

    expect(notices.getByRole("alert")).toHaveTextContent(LEGACY_CORRUPT_WARNING);
    expect(window.localStorage.getItem(MAP_STORAGE_KEY)).toBe("{");
    expect(exportedLabels()).toEqual([]);
  });

  it("localStorage プロパティの取得が例外を投げる保護モードでも、編集から300ms後に例外も保存失敗の通知も出さない", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    try {
      await renderPage();
      addNodeAt(500, 400);
      advance(300);

      expect(exportedLabels()).toHaveLength(1);
      expect(screen.queryByText(AUTO_SAVE_FAILURE_MESSAGE)).not.toBeInTheDocument();
      expect(banner().getByRole("status", { name: "保存状態: ブラウザへ保存できません" })).toBeInTheDocument();
    } finally {
      if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
    }
  });
});
