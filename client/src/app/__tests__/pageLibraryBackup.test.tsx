import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dialog, exportedMap, headerButton, renderPage, selectNode, stageContainer, undoButton, v3Json, v3JsonFromLabels } from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { readMapIndex, seedMapLibrary } from "@/testing/mapLibraryTestStorage";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
import { LIBRARY_RESTORE_JOURNAL_KEY } from "@/services/persistence/libraryRestoreJournal";
import { createJpegDataUrl } from "@/testing/jpegFixture";

jest.mock("pixi.js", () => jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks").createPagePixiModuleMock());
jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return { ...actual, generateIllustrationThumbnail: jest.fn() };
});
jest.mock("@/services/imageExport/mapTextMeasurement", () => jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks").createMapTextMeasurementModuleMock());
jest.mock("@/services/imageExport/mapImageDownload", () => ({ downloadMapImage: jest.fn() }));
jest.mock("@/services/imageExport/mapPngRasterizer", () => ({ rasterizeMapSvgToPng: jest.fn() }));
const mockDownloadMapJson = jest.fn();
jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return { ...actual, downloadMapJson: (json: string, name: string) => mockDownloadMapJson(json, name) };
});
const mockDownloadLibraryBackup = jest.fn();
jest.mock("@/services/persistence/libraryBackupFile", () => {
  const actual = jest.requireActual("@/services/persistence/libraryBackupFile");
  return { ...actual, downloadLibraryBackup: (json: string, date: Date) => mockDownloadLibraryBackup(json, date) };
});

function backupFile(json: string): File {
  const file = new File([json], "library.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: jest.fn().mockResolvedValue(json) });
  return file;
}
function editorRoot() { return screen.getByRole("banner").closest<HTMLElement>("[data-map-id]")!; }
beforeEach(() => { resetMapStageTestRuntime(); window.localStorage.clear(); mockDownloadMapJson.mockReset(); mockDownloadLibraryBackup.mockReset(); });
afterEach(() => jest.restoreAllMocks());

it("実Homeから空本体を名前確認して書き出し、追加復元しても現在editor・選択・履歴・既存本体を保つ", async () => {
  seedMapLibrary(window.localStorage, [
    { id: "a", name: "A", json: v3JsonFromLabels(["A1"]) },
    { id: "b", name: "B", json: null },
  ], { currentMapId: "a" });
  const user = userEvent.setup();
  await renderPage();
  fireEvent.doubleClick(stageContainer(), { clientX: 600, clientY: 400 });
  selectNode(0, 2);
  expect(undoButton()).toBeEnabled();
  expect(screen.getByRole("button", { name: "重要度 高" })).toBeEnabled();
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem(mapBodyKey("a"))!).nodes).toHaveLength(2));
  const beforeA = window.localStorage.getItem(mapBodyKey("a"));
  const root = editorRoot();
  await user.click(headerButton("マップ一覧"));
  await user.click(dialog().getByRole("button", { name: "全マップをバックアップ" }));
  expect(dialog().getByRole("group", { name: "バックアップを確認" })).toHaveTextContent("B");
  await user.click(dialog().getByRole("button", { name: "キャンセル" }));
  expect(dialog().getByRole("button", { name: "全マップをバックアップ" })).toHaveFocus();
  expect(mockDownloadLibraryBackup).not.toHaveBeenCalled();
  await user.click(dialog().getByRole("button", { name: "全マップをバックアップ" }));
  await user.click(dialog().getByRole("button", { name: "ダウンロードを開始" }));
  expect(mockDownloadLibraryBackup).toHaveBeenCalledTimes(1);
  const json = mockDownloadLibraryBackup.mock.lastCall![0] as string;
  const file = JSON.parse(json);
  expect(file.maps).toHaveLength(2);
  expect(file.maps.find((map: { name: string }) => map.name === "A").document.nodes).toHaveLength(2);
  expect(file.maps.find((map: { name: string }) => map.name === "B").document.nodes).toHaveLength(0);
  await waitFor(() => expect(dialog().getByRole("status")).toHaveTextContent("ダウンロードを開始しました"));
  const input = dialog().getByLabelText("バックアップファイル", { selector: "input" }) as HTMLInputElement;
  await user.upload(input, backupFile(json));
  await waitFor(() => expect(dialog().getByRole("group", { name: "復元を確認" })).toBeInTheDocument());
  await user.click(dialog().getByRole("button", { name: "キャンセル" }));
  expect(dialog().getByRole("button", { name: "バックアップから復元" })).toHaveFocus();
  await user.upload(dialog().getByLabelText("バックアップファイル", { selector: "input" }), backupFile(json));
  await waitFor(() => expect(dialog().getByRole("group", { name: "復元を確認" })).toBeInTheDocument());
  await user.click(dialog().getByRole("button", { name: "マップを追加" }));
  await waitFor(() => expect(dialog().getByRole("status")).toHaveTextContent("追加しました"));
  expect(readMapIndex(window.localStorage)?.maps).toHaveLength(4);
  expect(readMapIndex(window.localStorage)?.currentMapId).toBe("a");
  expect(window.localStorage.getItem(mapBodyKey("b"))).toBeNull();
  expect(window.localStorage.getItem(mapBodyKey("a"))).toBe(beforeA);
  expect(editorRoot()).toBe(root);
  expect(undoButton()).toBeEnabled();
  expect(screen.getByRole("button", { name: "重要度 高" })).toBeEnabled();
  await user.click(dialog().getByRole("button", { name: "閉じる" }));
  expect(exportedMap(mockDownloadMapJson).nodes).toHaveLength(2);
});

it("復元の戻し失敗では保護モードへ再マウントしても nodes・layoutMode・illustration を個別JSONで救出できる", async () => {
  const illustration = createJpegDataUrl(128, 128);
  seedMapLibrary(window.localStorage, [{ id: "a", name: "A", json: v3Json([
    { id: 1, label: "救出するノード", importance: "high", height: 140, illustration },
  ], "auto") }], { currentMapId: "a" });
  const user = userEvent.setup();
  await renderPage();
  const root = editorRoot();
  await user.click(headerButton("マップ一覧"));
  await user.click(dialog().getByRole("button", { name: "全マップをバックアップ" }));
  await user.click(dialog().getByRole("button", { name: "ダウンロードを開始" }));
  const json = mockDownloadLibraryBackup.mock.lastCall![0] as string;
  await user.upload(dialog().getByLabelText("バックアップファイル", { selector: "input" }), backupFile(json));
  await waitFor(() => expect(dialog().getByRole("group", { name: "復元を確認" })).toBeInTheDocument());
  const originalRemove = Storage.prototype.removeItem;
  const remove = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key) {
    if (key === LIBRARY_RESTORE_JOURNAL_KEY) throw new Error("容量不足");
    return originalRemove.call(this, key);
  });
  await user.click(dialog().getByRole("button", { name: "マップを追加" }));
  remove.mockRestore();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(editorRoot()).not.toBe(root);
  expect(headerButton("マップ一覧")).toBeDisabled();
  const rescued = exportedMap(mockDownloadMapJson);
  expect(rescued.nodes).toHaveLength(1);
  expect(rescued.nodes[0]).toMatchObject({ label: "救出するノード", importance: "high", illustration });
  expect(rescued.layoutMode).toBe("auto");
});

it("確認後の flush が一覧を更新した場合は再確認を要求し、同じファイルの再選択後に追加できる", async () => {
  seedMapLibrary(window.localStorage, [{ id: "a", name: "A", json: v3JsonFromLabels(["A1"]) }], { currentMapId: "a" });
  await renderPage();
  const backup = JSON.stringify({
    format: "draw-my-map-library-backup", version: 1, exportedAt: "2026-11-08T00:00:00.000Z", currentMapId: "c",
    maps: [{ id: "c", name: "C", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", document: JSON.parse(v3JsonFromLabels(["C1"])) }],
  });
  const file = backupFile(backup);
  jest.useFakeTimers();
  try {
    fireEvent.doubleClick(stageContainer(), { clientX: 600, clientY: 400 });
    expect(undoButton()).toBeEnabled();
    fireEvent.click(headerButton("マップ一覧"));
    const select = async () => {
      await act(async () => {
        fireEvent.change(dialog().getByLabelText("バックアップファイル", { selector: "input" }), { target: { files: [file] } });
      });
      expect(dialog().getByRole("group", { name: "復元を確認" })).toBeInTheDocument();
    };
    await select();
    fireEvent.click(dialog().getByRole("button", { name: "マップを追加" }));
    act(() => jest.advanceTimersToNextFrame());
    expect(dialog().getByRole("alert")).toHaveTextContent("確認し直してください");
    expect(readMapIndex(window.localStorage)?.maps).toHaveLength(1);
    await select();
    fireEvent.click(dialog().getByRole("button", { name: "マップを追加" }));
    expect(readMapIndex(window.localStorage)?.maps).toHaveLength(2);
    expect(readMapIndex(window.localStorage)?.currentMapId).toBe("a");
  } finally {
    jest.useRealTimers();
  }
});
