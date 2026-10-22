import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import Home from "@/app/page";
import {
  mockStageBounds,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import type { MapIndexV1 } from "@/domain/mapLibrary/mapIndex";
import {
  MAP_INDEX_BACKUP_STORAGE_KEY,
  MAP_INDEX_STORAGE_KEY,
  mapBodyKey,
} from "@/services/persistence/mapLibraryStorage";
import { readActiveMapJson, readMapIndex, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から useMapLibrary・MapEditor・
// ヘッダー・ダイアログ・通知領域までは本物を通す
jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

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

jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));

const mockDownloadMapImage = jest.fn();
jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: (blob: Blob, fileName: string) => mockDownloadMapImage(blob, fileName),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

type ExportedMap = { nodes: Array<{ label: string }> };

const UNAVAILABLE_WARNING =
  "ブラウザの保存領域を使えないため、このマップは保存されません。必要な場合はJSONで書き出してください。";
const REBUILD_WARNING =
  "マップの一覧を読み取れなかったため、保存済みのマップから一覧を作り直しました。マップ名は「復元したマップ」になっています。";

function v3Json(labels: readonly string[]): string {
  return `${JSON.stringify({
    version: 3,
    layoutMode: "manual",
    nodes: labels.map((label, i) => ({
      id: i + 1,
      parentId: null,
      x: 100 + i * 200,
      y: 100,
      width: 100,
      height: 60,
      label,
      importance: "medium",
    })),
  }, null, 2)}\n`;
}

function seedTwoMaps() {
  return seedMapLibrary(window.localStorage, [
    { id: "a", name: "A", json: v3Json(["A1"]), updatedAt: "2026-01-02T00:00:00.000Z" },
    { id: "b", name: "B", json: v3Json(["B1"]), updatedAt: "2026-01-01T00:00:00.000Z" },
  ], { currentMapId: "a" });
}

function readIndex(): MapIndexV1 {
  const index = readMapIndex(window.localStorage);
  if (index === null) throw new Error("インデックスを読めません。");
  return index;
}

async function renderHome() {
  const rendered = await renderReady(<Home />);
  const stage = document.querySelector<HTMLElement>(".cursor-crosshair");
  if (stage !== null) mockStageBounds(stage);
  return rendered;
}

function currentMapName(): HTMLElement {
  return screen.getByTestId("current-map-name");
}

function shellNotices() {
  return within(screen.getByTestId("map-library-notices"));
}

function headerButton(name: "マップ一覧" | "新しいマップ"): HTMLElement {
  return within(screen.getByRole("banner")).getByRole("button", { name });
}

function exportedLabels(): string[] {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  const map = JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
  return map.nodes.map((node) => node.label);
}

function dialog() {
  return within(screen.getByRole("dialog"));
}

async function openList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(headerButton("マップ一覧"));
  return dialog();
}

// 空き領域のダブルクリックでノードを追加し、元に戻せる状態にする
function addNodeByDoubleClick() {
  const stage = document.querySelector<HTMLElement>(".cursor-crosshair")!;
  fireEvent.doubleClick(stage, { clientX: 600, clientY: 400 });
}

function undoButton(): HTMLElement {
  return screen.getByRole("button", { name: "元に戻す" });
}

async function createFromHeader(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(headerButton("新しいマップ"));
  const input = dialog().getByRole("textbox", { name: "マップ名" });
  if (name !== "") await user.type(input, name);
  await user.click(dialog().getByRole("button", { name: "作成" }));
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
  mockDownloadMapImage.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Home とマップの一覧の結合", () => {
  it("起動の結果が出るまでは読み込み中の status を出し、エディタを描画しない", () => {
    // サーバー描画は effect を走らせないので、起動前の描画をそのまま確かめられる
    const html = renderToString(<Home />);

    expect(html).toContain("マップを読み込んでいます…");
    expect(html).not.toContain("JSON書き出し");
    expect(html).toContain('data-testid="map-library-notices"');
  });

  it("空の localStorage で起動すると「無題のマップ」を開き、インデックスを作る", async () => {
    await renderHome();

    expect(currentMapName()).toHaveTextContent("マップ: 無題のマップ");
    const index = readIndex();
    expect(index.maps).toHaveLength(1);
    expect(index.maps[0]).toMatchObject({ id: index.currentMapId, name: "無題のマップ" });
    expect(screen.queryByText("マップを読み込んでいます…")).not.toBeInTheDocument();
  });

  describe("新規作成", () => {
    it("名前を入れて作成すると空のマップに切り替わり、シェルに通知してヘッダーの「マップ一覧」へフォーカスを戻す", async () => {
      seedTwoMaps();
      const user = userEvent.setup();
      await renderHome();
      expect(exportedLabels()).toEqual(["A1"]);

      await createFromHeader(user, "旅行");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(currentMapName()).toHaveTextContent("マップ: 旅行");
      expect(exportedLabels()).toEqual([]);
      await waitFor(() => expect(shellNotices().getByRole("status"))
        .toHaveTextContent("マップ「旅行」を作成しました。"));
      await waitFor(() => expect(headerButton("マップ一覧")).toHaveFocus());
      const index = readIndex();
      expect(index.maps.map((map) => map.name).sort()).toEqual(["A", "B", "旅行"]);
      expect(index.maps.find((map) => map.id === index.currentMapId)?.name).toBe("旅行");
    });

    it("空欄で作成すると「無題のマップ」になる", async () => {
      seedTwoMaps();
      const user = userEvent.setup();
      await renderHome();

      await createFromHeader(user, "");

      expect(currentMapName()).toHaveTextContent("マップ: 無題のマップ");
      expect(readIndex().maps).toHaveLength(3);
    });

    it("51文字ではエラーを出して作成しない", async () => {
      seedTwoMaps();
      const user = userEvent.setup();
      await renderHome();

      await createFromHeader(user, "あ".repeat(51));

      expect(dialog().getByText("マップ名は50文字以内で入力してください。（現在 51 文字）"))
        .toHaveAttribute("role", "alert");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(currentMapName()).toHaveTextContent("マップ: A");
      expect(readIndex().maps).toHaveLength(2);
    });

    it("同じ名前のマップを2つ作れる", async () => {
      const user = userEvent.setup();
      await renderHome();

      await createFromHeader(user, "旅行");
      await createFromHeader(user, "旅行");

      const names = readIndex().maps.map((map) => map.name);
      expect(names.filter((name) => name === "旅行")).toHaveLength(2);
    });
  });

  it("一覧から別のマップを開くと、そのマップの内容に切り替わり、インデックスの現在のマップも変わる", async () => {
    seedTwoMaps();
    const user = userEvent.setup();
    await renderHome();
    expect(exportedLabels()).toEqual(["A1"]);

    const list = await openList(user);
    await user.click(list.getByRole("button", { name: "B" }));

    expect(currentMapName()).toHaveTextContent("マップ: B");
    expect(exportedLabels()).toEqual(["B1"]);
    expect(readIndex().currentMapId).toBe("b");
    expect(readActiveMapJson(window.localStorage)).toBe(v3Json(["B1"]));
  });

  describe("名前の変更", () => {
    it("一覧とヘッダーに反映し、ダイアログに通知して行の「名前を変更」へフォーカスを戻す。本体と更新日時は変えない", async () => {
      const seeded = seedTwoMaps();
      const user = userEvent.setup();
      const { unmount } = await renderHome();

      const list = await openList(user);
      await user.click(list.getByRole("button", { name: "名前を変更: A" }));
      const input = dialog().getByRole("textbox", { name: "マップ名" });
      await user.clear(input);
      await user.type(input, "新A");
      await user.click(dialog().getByRole("button", { name: "変更" }));

      expect(dialog().getByRole("button", { name: "新A（開いています）" })).toBeInTheDocument();
      expect(currentMapName()).toHaveTextContent("マップ: 新A");
      await waitFor(() => expect(dialog().getByRole("status")).toHaveTextContent("マップの名前を「新A」に変更しました。"));
      await waitFor(() => expect(dialog().getByRole("button", { name: "名前を変更: 新A" })).toHaveFocus());
      const renamed = readIndex().maps.find((map) => map.id === "a");
      expect(renamed).toEqual({ ...seeded.maps[0], name: "新A" });
      expect(window.localStorage.getItem(mapBodyKey("a"))).toBe(v3Json(["A1"]));

      unmount();
      await renderHome();
      expect(currentMapName()).toHaveTextContent("マップ: 新A");
    });

    it("書き出す JSON と画像のファイル名に、変更後の名前を使う", async () => {
      seedTwoMaps();
      const user = userEvent.setup();
      await renderHome();

      const list = await openList(user);
      await user.click(list.getByRole("button", { name: "名前を変更: A" }));
      const input = dialog().getByRole("textbox", { name: "マップ名" });
      await user.clear(input);
      await user.type(input, "新A");
      await user.click(dialog().getByRole("button", { name: "変更" }));
      await user.click(dialog().getByRole("button", { name: "閉じる" }));

      await user.click(screen.getByRole("button", { name: "JSON書き出し" }));
      expect(mockDownloadMapJson).toHaveBeenLastCalledWith(v3Json(["A1"]), "新A");
      await user.click(screen.getByRole("button", { name: "SVG書き出し" }));
      await waitFor(() => expect(mockDownloadMapImage).toHaveBeenCalledTimes(1));
      expect(mockDownloadMapImage.mock.lastCall![1]).toMatch(/^新A-\d{8}-\d{6}\.svg$/);
    });

    it("開いているマップの名前を変えても、エディタを作り直さず、元に戻す履歴が残る", async () => {
      seedTwoMaps();
      const user = userEvent.setup();
      await renderHome();
      addNodeByDoubleClick();
      expect(exportedLabels()).toHaveLength(2);
      expect(undoButton()).toBeEnabled();

      const list = await openList(user);
      await user.click(list.getByRole("button", { name: "名前を変更: A" }));
      const input = dialog().getByRole("textbox", { name: "マップ名" });
      await user.clear(input);
      await user.type(input, "新A");
      await user.click(dialog().getByRole("button", { name: "変更" }));
      await user.click(dialog().getByRole("button", { name: "閉じる" }));

      expect(currentMapName()).toHaveTextContent("マップ: 新A");
      expect(undoButton()).toBeEnabled();
      await user.click(undoButton());
      expect(exportedLabels()).toEqual(["A1"]);
    });
  });

  describe("削除", () => {
    async function deleteFromList(user: ReturnType<typeof userEvent.setup>, name: string) {
      const list = await openList(user);
      await user.click(list.getByRole("button", { name: `削除: ${name}` }));
      await user.click(dialog().getByRole("button", { name: "このマップを削除" }));
    }

    it("開いていないマップは一覧から消え、開いているマップはそのまま", async () => {
      seedTwoMaps();
      const user = userEvent.setup();
      await renderHome();

      await deleteFromList(user, "B");

      expect(dialog().queryByRole("button", { name: "B" })).not.toBeInTheDocument();
      expect(currentMapName()).toHaveTextContent("マップ: A");
      expect(readIndex().maps.map((map) => map.id)).toEqual(["a"]);
      expect(window.localStorage.getItem(mapBodyKey("b"))).toBeNull();
      await user.click(dialog().getByRole("button", { name: "閉じる" }));
      expect(exportedLabels()).toEqual(["A1"]);
    });

    it("開いていないマップを消しても、エディタを作り直さず、元に戻す履歴が残る", async () => {
      seedTwoMaps();
      const user = userEvent.setup();
      await renderHome();
      addNodeByDoubleClick();
      expect(exportedLabels()).toHaveLength(2);
      expect(undoButton()).toBeEnabled();

      await deleteFromList(user, "B");
      await user.click(dialog().getByRole("button", { name: "閉じる" }));

      expect(currentMapName()).toHaveTextContent("マップ: A");
      expect(undoButton()).toBeEnabled();
      await user.click(undoButton());
      expect(exportedLabels()).toEqual(["A1"]);
    });

    it("開いているマップを消すと、最後に更新した別のマップを開く", async () => {
      seedMapLibrary(window.localStorage, [
        { id: "a", name: "A", json: v3Json(["A1"]), updatedAt: "2026-01-03T00:00:00.000Z" },
        { id: "b", name: "B", json: v3Json(["B1"]), updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "c", name: "C", json: v3Json(["C1"]), updatedAt: "2026-01-02T00:00:00.000Z" },
      ], { currentMapId: "a" });
      const user = userEvent.setup();
      await renderHome();

      await deleteFromList(user, "A");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(currentMapName()).toHaveTextContent("マップ: C");
      expect(exportedLabels()).toEqual(["C1"]);
      expect(readIndex().currentMapId).toBe("c");
      expect(window.localStorage.getItem(mapBodyKey("a"))).toBeNull();
    });

    it("最後の1つを消すと、新しい「無題のマップ」を開く", async () => {
      seedMapLibrary(window.localStorage, [{ id: "a", name: "A", json: v3Json(["A1"]) }]);
      const user = userEvent.setup();
      await renderHome();

      await deleteFromList(user, "A");

      expect(currentMapName()).toHaveTextContent("マップ: 無題のマップ");
      expect(exportedLabels()).toEqual([]);
      const index = readIndex();
      expect(index.maps).toHaveLength(1);
      expect(index.maps[0]).toMatchObject({ name: "無題のマップ" });
      expect(index.currentMapId).not.toBe("a");
      expect(window.localStorage.getItem(mapBodyKey("a"))).toBeNull();
    });

    it("確認の「キャンセル」では何も変えない", async () => {
      const seeded = seedTwoMaps();
      const user = userEvent.setup();
      await renderHome();

      const list = await openList(user);
      await user.click(list.getByRole("button", { name: "削除: B" }));
      await user.click(dialog().getByRole("button", { name: "キャンセル" }));

      expect(dialog().getByRole("button", { name: "B" })).toBeInTheDocument();
      expect(readIndex()).toEqual(seeded);
      expect(window.localStorage.getItem(mapBodyKey("b"))).toBe(v3Json(["B1"]));
    });
  });

  it("切り替えた後に再読み込みすると、切り替えたマップを開く", async () => {
    seedTwoMaps();
    const user = userEvent.setup();
    const { unmount } = await renderHome();

    const list = await openList(user);
    await user.click(list.getByRole("button", { name: "B" }));
    unmount();
    await renderHome();

    expect(currentMapName()).toHaveTextContent("マップ: B");
    expect(exportedLabels()).toEqual(["B1"]);
  });

  it("保存領域を読めないときは起動時の警告を出し、「マップ一覧」「新しいマップ」を理由つきで無効にする", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    await renderHome();

    await waitFor(() => expect(shellNotices().getByRole("alert")).toHaveTextContent(UNAVAILABLE_WARNING));
    expect(headerButton("マップ一覧")).toBeDisabled();
    expect(headerButton("新しいマップ")).toBeDisabled();
    expect(screen.getByText("保存できないため、マップの切り替えは使えません。")).toBeInTheDocument();
  });

  it("localStorage プロパティの取得が例外を投げても、起動時の警告を出して保存しないマップで開く", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    try {
      await renderHome();

      await waitFor(() => expect(shellNotices().getByRole("alert")).toHaveTextContent(UNAVAILABLE_WARNING));
      expect(currentMapName()).toHaveTextContent("マップ: 無題のマップ");
      expect(headerButton("マップ一覧")).toBeDisabled();
    } finally {
      if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
    }
  });

  it("壊れたインデックスは退避して作り直し、起動時の警告をシェルに出す", async () => {
    window.localStorage.setItem(MAP_INDEX_STORAGE_KEY, "{");
    window.localStorage.setItem(mapBodyKey("a"), v3Json(["A1"]));
    await renderHome();

    await waitFor(() => expect(shellNotices().getByRole("alert")).toHaveTextContent(REBUILD_WARNING));
    expect(window.localStorage.getItem(MAP_INDEX_BACKUP_STORAGE_KEY)).toBe("{");
    expect(currentMapName()).toHaveTextContent("マップ: 復元したマップ 1");
    expect(exportedLabels()).toEqual(["A1"]);
  });
});
