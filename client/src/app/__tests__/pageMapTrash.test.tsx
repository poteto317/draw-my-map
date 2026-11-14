import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  dialog,
  type ExportedMap,
  headerButton,
  renderPage,
  v3JsonFromLabels,
} from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import {
  MAP_TRASH_INDEX_KEY,
  mapTrashBodyKey,
} from "@/services/persistence/mapTrashStorage";
import { readMapIndex, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

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

function seedTwoMaps() {
  return seedMapLibrary(window.localStorage, [
    { id: "a", name: "A", json: v3JsonFromLabels(["A1"]), updatedAt: "2026-01-02T00:00:00.000Z" },
    { id: "b", name: "B", json: v3JsonFromLabels(["B1"]), updatedAt: "2026-01-01T00:00:00.000Z" },
  ], { currentMapId: "a" });
}

function seedThreeMaps() {
  return seedMapLibrary(window.localStorage, [
    { id: "a", name: "A", json: v3JsonFromLabels(["A1"]), updatedAt: "2026-01-03T00:00:00.000Z" },
    { id: "b", name: "B", json: v3JsonFromLabels(["B1"]), updatedAt: "2026-01-02T00:00:00.000Z" },
    { id: "c", name: "C", json: v3JsonFromLabels(["C1"]), updatedAt: "2026-01-01T00:00:00.000Z" },
  ], { currentMapId: "a" });
}

function currentMapName(): HTMLElement {
  return screen.getByTestId("current-map-name");
}

function shellNotices() {
  return within(screen.getByTestId("map-library-notices"));
}

function exportedLabels(): string[] {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  const map = JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
  return map.nodes.map((node) => node.label);
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("削除マップのゴミ箱の結合テスト", () => {
  it("開いていないマップを削除してゴミ箱へ移動し、ゴミ箱画面から復元して切り替えられる", async () => {
    seedTwoMaps();
    const user = userEvent.setup();
    await renderPage();

    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "削除: B" }));
    expect(dialog().getByRole("group", { name: "マップを削除" })).toHaveTextContent(
      "マップ「B」をゴミ箱に移動します。ゴミ箱から 30 日間復元できます。",
    );

    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));

    await waitFor(() =>
      expect(dialog().getByRole("status")).toHaveTextContent("マップ「B」をゴミ箱に移動しました。"),
    );
    expect(window.localStorage.getItem(mapTrashBodyKey("b"))).not.toBeNull();
    expect(readMapIndex(window.localStorage)?.maps.map((m) => m.id)).toEqual(["a"]);

    const trashButton = dialog().getByRole("button", { name: "ゴミ箱（1）" });
    await user.click(trashButton);

    const trashGroup = dialog().getByRole("group", { name: "ゴミ箱" });
    expect(trashGroup).toHaveTextContent("B");
    expect(trashGroup).toHaveTextContent("あと 30 日");

    await user.click(within(trashGroup).getByRole("button", { name: "復元: B" }));
    await waitFor(() =>
      expect(dialog().getByRole("status")).toHaveTextContent("マップ「B」をマップ一覧に復元しました。"),
    );
    expect(trashGroup).toHaveTextContent("ゴミ箱は空です。");
    expect(window.localStorage.getItem(MAP_TRASH_INDEX_KEY)).toBeNull();
    expect(window.localStorage.getItem(mapTrashBodyKey("b"))).toBeNull();

    // 現在のマップ A は維持されている
    expect(currentMapName()).toHaveTextContent("マップ: A");

    await user.click(dialog().getByRole("button", { name: "一覧に戻る" }));
    expect(dialog().getByRole("button", { name: "ゴミ箱" })).toBeInTheDocument();

    await user.click(dialog().getByRole("button", { name: "B" }));
    expect(currentMapName()).toHaveTextContent("マップ: B");
    expect(exportedLabels()).toEqual(["B1"]);
  });

  it("開いているマップを削除すると次のマップへ切り替わり、その後ゴミ箱から復元できる", async () => {
    seedTwoMaps();
    const user = userEvent.setup();
    await renderPage();

    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "削除: A" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));

    expect(currentMapName()).toHaveTextContent("マップ: B");
    await waitFor(() =>
      expect(shellNotices().getByRole("status")).toHaveTextContent(
        "マップ「A」をゴミ箱に移動し、「B」を開きました。",
      ),
    );

    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "ゴミ箱（1）" }));
    await user.click(dialog().getByRole("button", { name: "復元: A" }));
    await waitFor(() =>
      expect(dialog().getByRole("status")).toHaveTextContent("マップ「A」をマップ一覧に復元しました。"),
    );
    expect(currentMapName()).toHaveTextContent("マップ: B");

    await user.click(dialog().getByRole("button", { name: "一覧に戻る" }));
    await user.click(dialog().getByRole("button", { name: "A" }));
    expect(currentMapName()).toHaveTextContent("マップ: A");
    expect(exportedLabels()).toEqual(["A1"]);
  });

  it("ゴミ箱から個別完全削除（2階層確認）と「ゴミ箱を空にする」ができる", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();

    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "削除: B" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));
    await user.click(dialog().getByRole("button", { name: "削除: C" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));

    await user.click(dialog().getByRole("button", { name: "ゴミ箱（2）" }));

    // キャンセルでゴミ箱へ戻る
    await user.click(dialog().getByRole("button", { name: "完全に削除: B" }));
    expect(dialog().getByRole("group", { name: "完全に削除" })).toHaveTextContent(
      "ゴミ箱からマップ「B」を完全に削除します。この操作は元に戻せません。",
    );
    await user.click(dialog().getByRole("button", { name: "キャンセル" }));
    expect(dialog().getByRole("group", { name: "ゴミ箱" })).toHaveTextContent("B");

    // 確定で個別完全削除
    await user.click(dialog().getByRole("button", { name: "完全に削除: B" }));
    await user.click(dialog().getByRole("button", { name: "完全に削除" }));
    await waitFor(() =>
      expect(dialog().getByRole("status")).toHaveTextContent("マップ「B」を完全に削除しました。"),
    );
    expect(window.localStorage.getItem(mapTrashBodyKey("b"))).toBeNull();
    expect(dialog().queryByText("B")).not.toBeInTheDocument();

    // ゴミ箱を空にする
    await user.click(dialog().getByRole("button", { name: "ゴミ箱を空にする" }));
    expect(dialog().getByRole("group", { name: "ゴミ箱を空にする" })).toHaveTextContent(
      "ゴミ箱内の 1 件のマップをすべて完全に削除します。この操作は元に戻せません。",
    );
    await user.click(dialog().getByRole("button", { name: "ゴミ箱を空にする" }));

    await waitFor(() =>
      expect(dialog().getByRole("status")).toHaveTextContent("ゴミ箱を空にしました。"),
    );
    expect(dialog().getByRole("group", { name: "ゴミ箱" })).toHaveTextContent("ゴミ箱は空です。");
    expect(window.localStorage.getItem(MAP_TRASH_INDEX_KEY)).toBeNull();
    expect(window.localStorage.getItem(mapTrashBodyKey("c"))).toBeNull();
  });

  it("起動時に期限切れのゴミ箱エントリと本体を自動消去する", async () => {
    seedTwoMaps();
    window.localStorage.setItem(mapTrashBodyKey("old"), v3JsonFromLabels(["OLD"]));
    window.localStorage.setItem(
      MAP_TRASH_INDEX_KEY,
      JSON.stringify({
        version: 1,
        items: [
          {
            id: "old",
            originalMapId: "old",
            name: "期限切れマップ",
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
            deletedAt: "2025-01-02T00:00:00.000Z",
            expiresAt: "2025-02-01T00:00:00.000Z",
            hasBody: true,
          },
        ],
      }),
    );

    const user = userEvent.setup();
    await renderPage();

    expect(window.localStorage.getItem(MAP_TRASH_INDEX_KEY)).toBeNull();
    expect(window.localStorage.getItem(mapTrashBodyKey("old"))).toBeNull();

    await user.click(headerButton("マップ一覧"));
    expect(dialog().getByRole("button", { name: "ゴミ箱" })).toBeInTheDocument();
  });

  it("ゴミ箱インデックスが破損していても保護モードに落ちず、完全削除フォールバックと「ゴミ箱を空にする」で回復できる", async () => {
    seedThreeMaps();
    window.localStorage.setItem(MAP_TRASH_INDEX_KEY, "{broken-json");
    window.localStorage.setItem(mapTrashBodyKey("orphan"), v3JsonFromLabels(["ORPHAN"]));

    const user = userEvent.setup();
    await renderPage();

    // 通常編集モードのまま
    expect(headerButton("マップ一覧")).not.toBeDisabled();

    await user.click(headerButton("マップ一覧"));
    expect(dialog().getByRole("button", { name: "ゴミ箱（要確認）" })).toBeInTheDocument();

    // 破損時はゴミ箱移動が失敗し、「ゴミ箱に入れずに完全に削除」を提示する
    await user.click(dialog().getByRole("button", { name: "削除: C" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));
    await waitFor(() =>
      expect(dialog().getByRole("alert")).toHaveTextContent("ゴミ箱のデータが破損しているため"),
    );

    await user.click(dialog().getByRole("button", { name: "ゴミ箱に入れずに完全に削除" }));
    await waitFor(() =>
      expect(dialog().getByRole("status")).toHaveTextContent("マップ「C」を完全に削除しました。"),
    );
    expect(readMapIndex(window.localStorage)?.maps.map((m) => m.id)).toEqual(["a", "b"]);

    // ゴミ箱を空にして破損状態から回復する
    await user.click(dialog().getByRole("button", { name: "ゴミ箱（要確認）" }));
    expect(dialog().getByRole("group", { name: "ゴミ箱" })).toHaveTextContent(
      "ゴミ箱の読み込みに失敗しました。",
    );
    await user.click(dialog().getByRole("button", { name: "ゴミ箱を空にする" }));
    await user.click(dialog().getByRole("button", { name: "ゴミ箱を空にする" }));

    await waitFor(() =>
      expect(dialog().getByRole("status")).toHaveTextContent("壊れたゴミ箱のデータを初期化しました。"),
    );
    expect(window.localStorage.getItem(MAP_TRASH_INDEX_KEY)).toBeNull();
    expect(window.localStorage.getItem(mapTrashBodyKey("orphan"))).toBeNull();

    // 回復後は通常どおりゴミ箱へ移動できる
    await user.click(dialog().getByRole("button", { name: "一覧に戻る" }));
    await user.click(dialog().getByRole("button", { name: "削除: B" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));
    await waitFor(() =>
      expect(dialog().getByRole("status")).toHaveTextContent("マップ「B」をゴミ箱に移動しました。"),
    );
    expect(dialog().getByRole("button", { name: "ゴミ箱（1）" })).toBeInTheDocument();
  });

  it("容量不足でゴミ箱へ移動できないとき、「ゴミ箱に入れずに完全に削除」で削除できる", async () => {
    seedTwoMaps();
    const user = userEvent.setup();
    await renderPage();

    const originalSetItem = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === mapTrashBodyKey("b")) {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });

    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "削除: B" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));

    await waitFor(() =>
      expect(dialog().getByRole("alert")).toHaveTextContent("保存容量が不足しているため"),
    );

    await user.click(dialog().getByRole("button", { name: "ゴミ箱に入れずに完全に削除" }));
    await waitFor(() =>
      expect(dialog().getByRole("status")).toHaveTextContent("マップ「B」を完全に削除しました。"),
    );
    expect(readMapIndex(window.localStorage)?.maps.map((m) => m.id)).toEqual(["a"]);
  });

  it("X の復元が失敗するとフォーカスは X の「復元」に残り、続けて Enter を押しても Y を復元しない", async () => {
    seedTwoMaps();
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    const item = (id: string, name: string, deletedMs: number) => ({
      id,
      originalMapId: id,
      name,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: iso(deletedMs),
      expiresAt: iso(deletedMs + 30 * 86_400_000),
      hasBody: true,
    });
    // X は本体が無いので復元に失敗する。Y は本体があり、復元できる
    window.localStorage.setItem(MAP_TRASH_INDEX_KEY, JSON.stringify({
      version: 1,
      items: [item("tx", "X", now - 1000), item("ty", "Y", now - 2000)],
    }));
    window.localStorage.setItem(mapTrashBodyKey("ty"), v3JsonFromLabels(["Y1"]));
    const user = userEvent.setup();
    await renderPage();
    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "ゴミ箱（2）" }));

    const restoreX = dialog().getByRole("button", { name: "復元: X" });
    restoreX.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(dialog().getByRole("alert")).toHaveTextContent("ゴミ箱のマップ本体が見つからない"),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(dialog().getByRole("button", { name: "復元: X" })),
    );

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(dialog().getByRole("alert")).toHaveTextContent("ゴミ箱のマップ本体が見つからない"),
    );
    expect(readMapIndex(window.localStorage)?.maps.map((m) => m.name)).toEqual(["A", "B"]);
    expect(dialog().getByRole("button", { name: "復元: Y" })).toBeInTheDocument();
    expect(window.localStorage.getItem(mapTrashBodyKey("ty"))).not.toBeNull();
  });
});
