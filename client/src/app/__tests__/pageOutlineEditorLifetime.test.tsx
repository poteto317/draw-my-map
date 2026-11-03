import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { exportedMap, headerButton, renderPage, selectNode, undoButton, v3Json } from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

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


function exported() { return exportedMap(mockDownloadMapJson); }
function button(name: string) { return screen.getByRole("button", { name }); }
function row(label: string, depth = 1) { return button(`階層${depth}・${label}`); }
function textarea() { return screen.getByRole("textbox", { name: "ラベル編集" }); }
beforeEach(() => { resetMapStageTestRuntime(); window.localStorage.clear(); mockDownloadMapJson.mockReset(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

import { mapBodyKey, MAP_INDEX_STORAGE_KEY } from "@/services/persistence/mapLibraryStorage";
import { AUTO_SAVE_FAILURE_MESSAGE } from "@/domain/mapLibrary/mapLibraryMessages";
import { generateIllustrationThumbnail } from "@/services/illustration/illustrationGeneration";
import { createJpegDataUrl } from "@/testing/jpegFixture";

const INITIAL = v3Json([{ id: 1, label: "A", importance: "high" }, { id: 2, label: "B" }]);
async function openOutline() {
  seedMapLibrary(window.localStorage, [
    { id: "a", name: "Aマップ", json: INITIAL },
    { id: "b", name: "Bマップ", json: v3Json([{ id: 1, label: "別マップ" }]) },
  ]);
  const rendered = await renderPage();
  const user = userEvent.setup(); await user.click(button("アウトライン"));
  return { ...rendered, user };
}
async function draft(user: ReturnType<typeof userEvent.setup>, label = "A") {
  await user.dblClick(row(label));
  const input = textarea();
  await user.clear(input); await user.type(input, "古いdraft");
  return input;
}
function importJson(json: string) {
  const file = new File([json], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => json });
  fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [file] } });
}
// 通常clickとは分け、focus/blurを起こさないプログラムからの先行操作を再現する。
it.each(["元に戻す", "やり直す"])("先行するプログラム%sでrevisionが進むと古いblurは書かない", async name => {
  const { user } = await openOutline();
  await user.click(row("B")); await user.click(button("1つ上"));
  if (name === "やり直す") await user.click(undoButton());
  const input = await draft(user);
  fireEvent.click(button(name));
  const after = exported();
  expect(after.nodes.map(node => node.label)).not.toContain("古いdraft");
  expect(screen.queryByRole("textbox", { name: "ラベル編集" })).not.toBeInTheDocument();
  fireEvent.blur(input);
  expect(exported()).toEqual(after);
});
it.each(["元に戻す", "やり直す"])("履歴なしのdisabled%sボタン操作はdraftを妨げず、続くblurで確定できる", async name => {
  const { user } = await openOutline(); const input = await draft(user);
  expect(button(name)).toBeDisabled(); fireEvent.click(button(name));
  expect(input).toHaveValue("古いdraft");
  await user.click(document.body);
  expect(exported().nodes[0].label).toBe("古いdraft");
  await user.click(undoButton()); expect(exported()).toEqual(JSON.parse(INITIAL)); expect(undoButton()).toBeDisabled();
});
it("同IDのJSON全置換はmodeを保ち、元ラベルが同じでも古いdraftを失効させる", async () => {
  const { user } = await openOutline(); const input = await draft(user);
  const replaced = v3Json([{ id: 1, label: "A", importance: "low", x: 888 }, { id: 3, label: "新規" }]);
  importJson(replaced);
  await waitFor(() => expect(row("新規")).toBeInTheDocument());
  fireEvent.blur(input);
  expect(exported()).toEqual(JSON.parse(replaced)); expect(button("アウトライン")).toHaveAttribute("aria-pressed", "true");
  expect(undoButton()).toBeDisabled();
});
it("対象削除がblurより先なら古いdraftを適用せず選択nullのまま", async () => {
  const { user } = await openOutline(); const input = await draft(user);
  fireEvent.click(button("ノードだけ削除"));
  fireEvent.blur(input);
  expect(exported().nodes).toEqual([JSON.parse(INITIAL).nodes[1]]);
  expect(button("ノードだけ削除")).toBeDisabled(); expect(row("B")).toHaveFocus();
  await user.click(undoButton()); expect(exported()).toEqual(JSON.parse(INITIAL)); expect(undoButton()).toBeDisabled();
});
it.each(["マップ一覧", "箇条書きから追加"])("外側の%sが先行して開くとinertでdraftを失効し後着blurは書かない", async name => {
  const { user } = await openOutline(); const input = await draft(user);
  fireEvent.click(button(name));
  expect(document.querySelector("[data-map-id]")).toHaveAttribute("inert");
  expect(row("A")).toBeDisabled(); expect(button("ルート追加")).toBeDisabled();
  fireEvent.blur(input); fireEvent.click(row("A"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: name === "マップ一覧" ? "閉じる" : "キャンセル" }));
  expect(exported()).toEqual(JSON.parse(INITIAL)); expect(undoButton()).toBeDisabled();
});
it("別mapへの切替でeditor寿命を終え、古いイベントは同IDの新mapを上書きしない", async () => {
  const { user } = await openOutline(); const input = await draft(user);
  fireEvent.click(button("マップ一覧"));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Bマップ" }));
  await waitFor(() => expect(button("マップ")).toHaveAttribute("aria-pressed", "true"));
  fireEvent.blur(input); fireEvent.keyDown(input, { key: "Enter" });
  expect(exported().nodes[0].label).toBe("別マップ");
  expect(window.localStorage.getItem(mapBodyKey("a"))).toBe(INITIAL);
  expect(undoButton()).toBeDisabled();
});
it("unmount後のイベントは保存待ちも履歴も作らない", async () => {
  const { user, unmount } = await openOutline(); const input = await draft(user);
  const write = jest.spyOn(Storage.prototype, "setItem");
  unmount(); fireEvent.blur(input); fireEvent.keyDown(input, { key: "Enter" });
  await act(async () => { await Promise.resolve(); });
  expect(write).not.toHaveBeenCalled();
  expect(window.localStorage.getItem(mapBodyKey("a"))).toBe(INITIAL);
});
it("保存失敗はoutline編集を保持し、Homeのflush失敗で切替を止めJSONで救出する", async () => {
  const { user } = await openOutline();
  const original = Storage.prototype.setItem;
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === mapBodyKey("a")) throw new DOMException("full", "QuotaExceededError");
    original.call(this, key, value);
  });
  await draft(user); await user.keyboard("{Enter}");
  const edited = exported(); expect(edited.nodes[0].label).toBe("古いdraft");
  await waitFor(() => expect(within(screen.getByRole("banner")).getByText(AUTO_SAVE_FAILURE_MESSAGE)).toBeInTheDocument());
  await user.click(button("マップ一覧")); await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Bマップ" }));
  await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("マップを切り替えませんでした"));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "閉じる" }));
  expect(exported()).toEqual(edited);
  expect(window.localStorage.getItem(mapBodyKey("a"))).toBe(INITIAL);
  expect(JSON.parse(window.localStorage.getItem(MAP_INDEX_STORAGE_KEY)!).currentMapId).toBe("a");
});
it("outlineのラベル変更後に届いた古い生成画像はattachできない", async () => {
  const { user } = await openOutline();
  let resolve!: (value: string) => void;
  jest.mocked(generateIllustrationThumbnail).mockReturnValueOnce(new Promise<string>(done => { resolve = done; }));
  await user.click(row("A")); await user.click(button("イラストを生成"));
  await user.dblClick(row("A")); await user.clear(textarea()); await user.type(textarea(), "新ラベル{Enter}");
  await act(async () => { resolve(createJpegDataUrl(128,128)); });
  expect(screen.queryByRole("button", { name: "ノードに設定" })).not.toBeInTheDocument();
  expect(exported().nodes[0]).toMatchObject({ label: "新ラベル" }); expect(exported().nodes[0].illustration).toBeUndefined();
});

it("枝移動dialog中はinert、復元失敗の保護modeでeditorを再生成し古いoutlineイベントを無効にする", async () => {
  const { user } = await openOutline(); const input = await draft(user);
  // blurを起こさない先行モード変更。draftを確定せずmapへ移る。
  fireEvent.click(button("マップ"));
  await waitFor(() => expect(document.querySelector("canvas")).toBeInTheDocument());
  selectNode(0, 2);
  await user.click(headerButton("枝を移動"));
  expect(document.querySelector("[data-map-id]")).toHaveAttribute("inert");
  fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("移動先マップ"), { target: { value: "b" } });
  const setItem = Storage.prototype.setItem;
  const removeItem = Storage.prototype.removeItem;
  let failed = false;
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
    if (key === "draw-my-map.branch-move.v1") { failed = true; throw new DOMException("blocked", "SecurityError"); }
    removeItem.call(this, key);
  });
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (failed) throw new DOMException("blocked", "SecurityError");
    setItem.call(this, key, value);
  });
  fireEvent.blur(input);
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "移動する" }));
  await waitFor(() => expect(headerButton("マップ一覧")).toBeDisabled());
  expect(button("マップ")).toHaveAttribute("aria-pressed", "true");
  fireEvent.blur(input); fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(screen.getByTestId("map-library-notices")).toHaveTextContent("ページを閉じる前にJSONで書き出してください。"));
  expect(exported()).toEqual(JSON.parse(INITIAL));
  expect(undoButton()).toBeDisabled();
  await user.click(button("アウトライン"));
  expect(row("A")).toBeInTheDocument(); expect(screen.queryByRole("textbox", { name: "ラベル編集" })).not.toBeInTheDocument();
});
