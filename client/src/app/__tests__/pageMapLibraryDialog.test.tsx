import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  dialog,
  type ExportedMap,
  headerButton,
  renderPage,
  selectNode,
  stageContainer,
  v3JsonFromLabels,
} from "@/app/testing/pageTestHelpers";
import {
  lastWorldContainer,
  mockStageBounds,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { readMapIndex, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

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

jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: jest.fn(),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

// 表示順（更新日時の新しい順）は A, B, C
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

async function openList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(headerButton("マップ一覧"));
  return dialog();
}

function exportedLabels(): string[] {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  const map = JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
  return map.nodes.map((node) => node.label);
}

function editorRoot(): HTMLElement {
  return screen.getByRole("banner").closest<HTMLElement>("[data-map-id]")!;
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("マップの一覧のダイアログのキーボード操作", () => {
  describe("各画面の最初のフォーカス", () => {
    it("一覧は開いているマップの「開く」、作成・名前変更は入力欄、削除の確認は「キャンセル」", async () => {
      seedThreeMaps();
      const user = userEvent.setup();
      await renderPage();

      const list = await openList(user);
      await waitFor(() => expect(list.getByRole("button", { name: "A（開いています）" })).toHaveFocus());

      await user.click(list.getByRole("button", { name: "新しいマップ" }));
      await waitFor(() => expect(dialog().getByRole("textbox", { name: "マップ名" })).toHaveFocus());
      await user.keyboard("{Escape}");

      await user.click(dialog().getByRole("button", { name: "名前を変更: B" }));
      await waitFor(() => expect(dialog().getByRole("textbox", { name: "マップ名" })).toHaveFocus());
      await user.keyboard("{Escape}");

      await user.click(dialog().getByRole("button", { name: "削除: B" }));
      await waitFor(() => expect(dialog().getByRole("button", { name: "キャンセル" })).toHaveFocus());
    });

    it("ヘッダーの「新しいマップ」から開いた作成は入力欄", async () => {
      const user = userEvent.setup();
      await renderPage();

      await user.click(headerButton("新しいマップ"));

      await waitFor(() => expect(dialog().getByRole("textbox", { name: "マップ名" })).toHaveFocus());
    });
  });

  describe("Escape の戻り先", () => {
    it("一覧はヘッダーの「マップ一覧」へ戻す", async () => {
      seedThreeMaps();
      const user = userEvent.setup();
      await renderPage();
      await openList(user);

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(headerButton("マップ一覧")).toHaveFocus());
    });

    it("ヘッダーから開いた作成はヘッダーの「新しいマップ」へ戻す", async () => {
      seedThreeMaps();
      const user = userEvent.setup();
      await renderPage();
      await user.click(headerButton("新しいマップ"));

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(headerButton("新しいマップ")).toHaveFocus());
    });

    it("一覧から開いた作成・名前変更・削除は、一覧の元のボタンへ戻す", async () => {
      seedThreeMaps();
      const user = userEvent.setup();
      await renderPage();
      const list = await openList(user);

      await user.click(list.getByRole("button", { name: "新しいマップ" }));
      await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog().getByRole("button", { name: "新しいマップ" })).toHaveFocus());

      await user.click(dialog().getByRole("button", { name: "名前を変更: B" }));
      await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog().getByRole("button", { name: "名前を変更: B" })).toHaveFocus());

      await user.click(dialog().getByRole("button", { name: "削除: C" }));
      await user.keyboard("{Escape}");
      await waitFor(() => expect(dialog().getByRole("button", { name: "削除: C" })).toHaveFocus());
      expect(readMapIndex(window.localStorage)?.maps).toHaveLength(3);
    });
  });

  it("Tab は中で循環し、ダイアログの外へ出たフォーカスは中へ戻る", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();
    const list = await openList(user);
    const create = list.getByRole("button", { name: "新しいマップ" });
    const close = list.getByRole("button", { name: "閉じる" });

    close.focus();
    await user.tab();
    expect(create).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();

    // jsdom は inert でフォーカスを止めないので、外の要素へ直接フォーカスして戻ることを確かめる
    headerButton("マップ一覧").focus();
    expect(close).toHaveFocus();
    // いったん body へフォーカスを出してから focusin を送り、中へ戻すことを確かめる
    close.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.focusIn(document.body);
    expect(close).toHaveFocus();
  });

  it("ダイアログの表示中はショートカットが動かず、エディタの根が inert になり、閉じると元どおり動く", async () => {
    seedMapLibrary(window.localStorage, [{ id: "a", name: "A", json: v3JsonFromLabels(["A1"]) }]);
    const user = userEvent.setup();
    await renderPage();
    fireEvent.doubleClick(stageContainer(), { clientX: 500, clientY: 400 });
    selectNode(0, 2);
    const world = lastWorldContainer()!;
    const positionCalls = world.position.set.mock.calls.length;
    const clipboardData = { setData: jest.fn(), getData: jest.fn(() => "") };

    await openList(user);
    expect(editorRoot()).toHaveAttribute("inert");
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    fireEvent.keyDown(document.body, { key: "Delete" });
    fireEvent.keyDown(document.body, { key: "f" });
    fireEvent.copy(document.body, { clipboardData });

    expect(exportedLabels()).toEqual(["A1", ""]);
    expect(world.position.set).toHaveBeenCalledTimes(positionCalls);
    expect(clipboardData.setData).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(editorRoot()).not.toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "f" });
    expect(world.position.set.mock.calls.length).toBeGreaterThan(positionCalls);
    fireEvent.copy(document.body, { clipboardData });
    expect(clipboardData.setData).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(exportedLabels()).toEqual([""]);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(exportedLabels()).toEqual(["A1", ""]);
  });

  it("開いていないマップを削除すると、次の行の「開く」へフォーカスを移す", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();
    const list = await openList(user);

    await user.click(list.getByRole("button", { name: "削除: B" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));

    expect(dialog().queryByRole("button", { name: "B" })).not.toBeInTheDocument();
    await waitFor(() => expect(dialog().getByRole("button", { name: "C" })).toHaveFocus());
  });

  it("開いているマップの削除の確認が示すマップと、削除の後に実際に開くマップが一致する", async () => {
    // 配列の順（C, A, B）と表示順（B, C, A）を変え、配列の順で次を選ぶ誤りを見分ける（L-170）
    seedMapLibrary(window.localStorage, [
      { id: "c", name: "C", json: v3JsonFromLabels(["C1"]), updatedAt: "2026-01-01T02:00:00.000Z" },
      { id: "a", name: "A", json: v3JsonFromLabels(["A1"]), updatedAt: "2026-01-01T01:00:00.000Z" },
      { id: "b", name: "B", json: v3JsonFromLabels(["B1"]), updatedAt: "2026-01-01T03:00:00.000Z" },
    ], { currentMapId: "a" });
    const user = userEvent.setup();
    await renderPage();
    const list = await openList(user);

    await user.click(list.getByRole("button", { name: "削除: A" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("削除すると「B」を開きます。");
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));

    expect(currentMapName()).toHaveTextContent("マップ: B");
    expect(exportedLabels()).toEqual(["B1"]);
    await waitFor(() => expect(shellNotices().getByRole("status"))
      .toHaveTextContent("マップ「A」をゴミ箱に移動し、「B」を開きました。"));
  });

  // user-event は KeyboardEvent の repeat を立てないので、このテストは押し続け（repeat）を再現しない。
  // Enter を続けて押すと、削除の確認（「キャンセル」にフォーカス）と一覧を行き来するだけで削除しないことを確かめる。
  // repeat のガード自体は MapLibraryDeleteConfirm.test.tsx と MapLibraryControls.test.tsx の
  // fireEvent.keyDown(..., { repeat: true }) で固定している
  it("削除の確認は「キャンセル」に最初のフォーカスが当たり、一覧の「削除」で Enter を続けて押しても削除されない", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();
    const list = await openList(user);
    list.getByRole("button", { name: "削除: B" }).focus();

    await user.keyboard("{Enter>5}{/Enter}");

    expect(dialog().getByRole("heading", { name: "マップを削除" })).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "キャンセル" })).toHaveFocus();
    expect(readMapIndex(window.localStorage)?.maps.map((map) => map.id)).toEqual(["a", "b", "c"]);
    expect(currentMapName()).toHaveTextContent("マップ: A");
  });
});

describe("ダイアログを閉じる操作の続きの入力", () => {
  it("ヘッダーの「新しいマップ」を Enter で開いた直後に、入力欄へ押し続けの Enter が届いても作成せず、押し直した Enter では作成する", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();
    headerButton("新しいマップ").focus();
    await user.keyboard("{Enter}");
    const input = dialog().getByRole("textbox", { name: "マップ名" });
    expect(input).toHaveFocus();

    // ブラウザは防がれなかった入力欄の Enter で form を送信する。jsdom は送信しないので、既定の動作を手で再現する
    const notPrevented = fireEvent.keyDown(input, { key: "Enter", repeat: true });
    if (notPrevented) fireEvent.submit(input.closest("form")!);

    expect(dialog().getByRole("heading", { name: "新しいマップ" })).toBeInTheDocument();
    expect(readMapIndex(window.localStorage)?.maps).toHaveLength(3);
    expect(currentMapName()).toHaveTextContent("マップ: A");

    await user.keyboard("{Enter}");
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readMapIndex(window.localStorage)?.maps).toHaveLength(4);
    expect(currentMapName()).toHaveTextContent("マップ: 無題のマップ");
  });

  // ブラウザのダブルクリックを再現する。1回目のクリックでダイアログが閉じ、2回目のクリックと dblclick は
  // 同じ位置にある閉じた後のキャンバスへ届く（user.dblClick は2回とも同じ要素へ送るので使わない）
  async function doubleClickThroughDialog(button: HTMLElement, x: number, y: number) {
    fireEvent.mouseDown(button, { detail: 1 });
    fireEvent.mouseUp(button, { detail: 1 });
    fireEvent.click(button, { detail: 1 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // 切り替え・作成で再マウントした MapStage の Pixi の初期化を済ませる
    await act(async () => {});
    const stage = stageContainer();
    mockStageBounds(stage);
    const init = { detail: 2, clientX: x, clientY: y };
    fireEvent.mouseDown(stage, init);
    fireEvent.mouseUp(stage, init);
    fireEvent.click(stage, init);
    fireEvent.doubleClick(stage, init);
  }

  async function openCreateFromHeader(user: ReturnType<typeof userEvent.setup>) {
    await user.click(headerButton("新しいマップ"));
    return dialog();
  }

  it.each([
    {
      name: "一覧の開いていないマップの名前",
      press: async (user: ReturnType<typeof userEvent.setup>) =>
        (await openList(user)).getByRole("button", { name: "B" }),
      mapName: "マップ: B",
      labels: ["B1"],
    },
    {
      name: "「作成」",
      press: async (user: ReturnType<typeof userEvent.setup>) =>
        (await openCreateFromHeader(user)).getByRole("button", { name: "作成" }),
      mapName: "マップ: 無題のマップ",
      labels: [],
    },
    {
      name: "開いているマップの「このマップを削除」",
      press: async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click((await openList(user)).getByRole("button", { name: "削除: A" }));
        return dialog().getByRole("button", { name: "このマップを削除" });
      },
      mapName: "マップ: B",
      labels: ["B1"],
    },
    {
      name: "「閉じる」",
      press: async (user: ReturnType<typeof userEvent.setup>) =>
        (await openList(user)).getByRole("button", { name: "閉じる" }),
      mapName: "マップ: A",
      labels: ["A1"],
    },
  ])("$name をダブルクリックしても、閉じた後のキャンバスの空き領域にノードを追加しない", async ({ press, mapName, labels }) => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();
    const button = await press(user);

    await doubleClickThroughDialog(button, 500, 400);

    expect(currentMapName()).toHaveTextContent(mapName);
    expect(exportedLabels()).toEqual(labels);
  });

  it("一覧の名前をダブルクリックしても、閉じた後のキャンバスのノードのラベル編集を始めない", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    await renderPage();
    const list = await openList(user);

    await doubleClickThroughDialog(list.getByRole("button", { name: "B" }), 110, 110);

    expect(currentMapName()).toHaveTextContent("マップ: B");
    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
    // 同じ位置の、時間を置いたダブルクリックではラベル編集が始まる（位置がノードの上であることの確認）
    const now = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 1_000);
    try {
      fireEvent.doubleClick(stageContainer(), { detail: 2, clientX: 110, clientY: 110 });
      expect(screen.getByTestId("node-label-input")).toBeInTheDocument();
    } finally {
      now.mockRestore();
    }
  });

  it("閉じてから時間を置いたキャンバスのダブルクリックでは、ノードを追加する", async () => {
    seedThreeMaps();
    const user = userEvent.setup();
    const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
    try {
      await renderPage();
      const list = await openList(user);
      fireEvent.click(list.getByRole("button", { name: "閉じる" }), { detail: 1 });

      now.mockReturnValue(10_499);
      fireEvent.doubleClick(stageContainer(), { detail: 2, clientX: 500, clientY: 400 });
      expect(exportedLabels()).toEqual(["A1"]);

      now.mockReturnValue(10_500);
      fireEvent.doubleClick(stageContainer(), { detail: 2, clientX: 500, clientY: 400 });
      expect(exportedLabels()).toEqual(["A1", ""]);
    } finally {
      now.mockRestore();
    }
  });
});
