import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  dialog,
  type ExportedMap,
  type ExportedNode,
  renderPage,
  selectNode,
  stageContainer,
} from "@/app/testing/pageTestHelpers";
import {
  lastWorldContainer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { readActiveMapJson, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から MapEditor・ヘッダー・
// 箇条書きの取り込みのダイアログ・ショートカット・クリップボードのイベントまでは本物を通す
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

// 親（画面上の中心300,200）と子（中心450,200）の2ノード
function seedParentAndChild() {
  seedMapLibrary(window.localStorage, [{ json: `${JSON.stringify({
    version: 3,
    layoutMode: "manual",
    nodes: [
      { id: 1, parentId: null, label: "親", importance: "medium", x: 250, y: 170, width: 100, height: 60 },
      { id: 2, parentId: 1, label: "子", importance: "medium", x: 400, y: 170, width: 100, height: 60 },
    ],
  }, null, 2)}\n` }]);
}

function outlineButton(): HTMLElement {
  return within(screen.getByRole("banner")).getByRole("button", { name: "箇条書きから追加" });
}

function textarea(): HTMLTextAreaElement {
  return dialog().getByRole("textbox", { name: "テキスト" }) as HTMLTextAreaElement;
}

function previewRegion(): HTMLElement {
  return dialog().getByRole("region", { name: "変換結果のプレビュー" });
}

function editorRoot(): HTMLElement {
  return screen.getByRole("banner").closest<HTMLElement>("[data-map-id]")!;
}

// 側面のパネルの「対象ノード」に、選択中のノードの表示名が出る
function selectedLabel(): string | null {
  const panel = within(screen.getByRole("complementary", { name: "イラスト" }));
  if (panel.queryByText("ノードを選択してください") !== null) return null;
  return panel.getByText("対象ノード").nextElementSibling!.textContent;
}

function exportedNodes(): ExportedNode[] {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return (JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap).nodes;
}

function exportedLabels(): string[] {
  return exportedNodes().map((node) => node.label);
}

// OS のクリップボードの代わり。copy で書いた内容を paste で読める
function createClipboard() {
  const store = new Map<string, string>();
  return {
    store,
    data: {
      setData: jest.fn((format: string, text: string) => {
        store.set(format, text);
      }),
      getData: jest.fn((format: string) => store.get(format) ?? ""),
    },
  };
}

// ブラウザは、防がれなかったボタンの上の Enter で click を合成する。jsdom は合成しないので手で再現する
function pressEnterOnActiveElement(init: { repeat: boolean }) {
  const target = document.activeElement as HTMLElement;
  const notPrevented = fireEvent.keyDown(target, { key: "Enter", ...init });
  if (notPrevented && target instanceof HTMLButtonElement) fireEvent.click(target, { detail: 0 });
}

async function openPreview(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(outlineButton());
  fireEvent.change(textarea(), { target: { value: text } });
  await user.click(dialog().getByRole("button", { name: "プレビュー" }));
  expect(dialog().getByRole("heading", { name: "変換結果の確認" })).toBeInTheDocument();
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("箇条書きから追加のダイアログのキーボード操作", () => {
  describe("開いている間のショートカットの停止（L-173）", () => {
    // Undo で戻せる変更（空き領域のダブルクリックで追加したノード）と、専用形式の枝のデータを用意し、
    // 「親」を選択してからダイアログを開き、フォーカスを body に置く
    async function openWithBodyFocus(user: ReturnType<typeof userEvent.setup>) {
      seedParentAndChild();
      await renderPage();
      fireEvent.doubleClick(stageContainer(), { clientX: 600, clientY: 450 });
      expect(exportedLabels()).toEqual(["親", "子", ""]);
      selectNode(0, 3);
      expect(selectedLabel()).toBe("親");
      const branch = createClipboard();
      fireEvent.copy(document.body, { clipboardData: branch.data });
      expect(branch.store.get("text/plain")).toContain("\"nodes\"");

      await user.click(outlineButton());
      expect(editorRoot()).toHaveAttribute("inert");
      (document.activeElement as HTMLElement).blur();
      expect(document.activeElement).toBe(document.body);
      return branch;
    }

    it.each<[string, (branch: ReturnType<typeof createClipboard>, copied: ReturnType<typeof createClipboard>) => void]>([
      ["Ctrl+Z", () => fireEvent.keyDown(document.body, { key: "z", ctrlKey: true })],
      ["Cmd+Z", () => fireEvent.keyDown(document.body, { key: "z", metaKey: true })],
      ["Delete", () => fireEvent.keyDown(document.body, { key: "Delete" })],
      ["Tab", () => fireEvent.keyDown(document.body, { key: "Tab" })],
      ["Enter", () => fireEvent.keyDown(document.body, { key: "Enter" })],
      ["F", () => fireEvent.keyDown(document.body, { key: "f" })],
      ["copy", (_branch, copied) => fireEvent.copy(document.body, { clipboardData: copied.data })],
      ["paste", (branch) => fireEvent.paste(document.body, { clipboardData: branch.data })],
    ])("%s でマップ・選択・表示位置・クリップボードを変えない", async (_name, send) => {
      const user = userEvent.setup();
      const branch = await openWithBodyFocus(user);
      const before = exportedNodes();
      const world = lastWorldContainer()!;
      const positionCalls = world.position.set.mock.calls.length;
      const copied = createClipboard();

      send(branch, copied);

      expect(exportedNodes()).toEqual(before);
      expect(selectedLabel()).toBe("親");
      expect(world.position.set).toHaveBeenCalledTimes(positionCalls);
      expect(copied.data.setData).not.toHaveBeenCalled();
      expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // 保存された JSON も変わらない（300ms の自動保存の後に確かめる）
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      expect((JSON.parse(readActiveMapJson(window.localStorage)!) as ExportedMap).nodes).toEqual(before);
    });

    it("閉じると根の inert が外れ、Ctrl+Z が効く", async () => {
      const user = userEvent.setup();
      await openWithBodyFocus(user);

      await user.click(dialog().getByRole("button", { name: "キャンセル" }));

      expect(editorRoot()).not.toHaveAttribute("inert");
      fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
      expect(exportedLabels()).toEqual(["親", "子"]);
    });
  });

  describe("Escape と戻し先", () => {
    it("入力の画面の Escape で閉じ、フォーカスを「箇条書きから追加」へ戻す", async () => {
      const user = userEvent.setup();
      await renderPage();
      await user.click(outlineButton());

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(outlineButton()).toHaveFocus());
    });

    it("プレビューの画面の Escape で入力の画面へ戻り、テキストを残して入力欄へフォーカスを当てる", async () => {
      const user = userEvent.setup();
      await renderPage();
      await openPreview(user, "- A\n- B");

      await user.keyboard("{Escape}");

      expect(dialog().getByRole("heading", { name: "箇条書きのテキスト" })).toBeInTheDocument();
      await waitFor(() => expect(textarea()).toHaveFocus());
      expect(textarea()).toHaveValue("- A\n- B");
    });
  });

  it("開いたときは入力欄の末尾にカーソルを置き、プレビューへ進むとプレビューの領域へフォーカスを当てる", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(outlineButton());
    fireEvent.change(textarea(), { target: { value: "- 前回の入力" } });
    await user.click(dialog().getByRole("button", { name: "キャンセル" }));

    await user.click(outlineButton());

    await waitFor(() => expect(textarea()).toHaveFocus());
    expect(textarea().selectionStart).toBe("- 前回の入力".length);
    expect(textarea().selectionEnd).toBe("- 前回の入力".length);

    await user.click(dialog().getByRole("button", { name: "プレビュー" }));

    await waitFor(() => expect(previewRegion()).toHaveFocus());
  });

  it("入力欄の Tab はタブを入れずに次の要素へ移り、最後の要素の Tab で最初の要素へ戻る", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(outlineButton());
    await waitFor(() => expect(textarea()).toHaveFocus());
    fireEvent.change(textarea(), { target: { value: "- A" } });

    await user.tab();

    // 入力の画面の並びは、入力欄・「キャンセル」・「プレビュー」
    expect(dialog().getByRole("button", { name: "キャンセル" })).toHaveFocus();
    expect(textarea()).toHaveValue("- A");

    await user.tab();
    expect(dialog().getByRole("button", { name: "プレビュー" })).toHaveFocus();
    await user.tab();
    expect(textarea()).toHaveFocus();
    // 最初の要素の Shift+Tab で最後の要素へ戻る
    await user.tab({ shift: true });
    expect(dialog().getByRole("button", { name: "プレビュー" })).toHaveFocus();
  });

  it("プレビューの画面の Tab は、追加する位置のラジオのうち選ばれている1つにだけ止まる", async () => {
    const user = userEvent.setup();
    seedParentAndChild();
    await renderPage();
    selectNode(0, 2);
    expect(selectedLabel()).toBe("親");
    await openPreview(user, "- A");
    await waitFor(() => expect(previewRegion()).toHaveFocus());

    const radios = dialog().getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    const checked = radios.find((element) => element.checked)!;
    const unchecked = radios.find((element) => !element.checked)!;

    // 並びは、プレビューの領域・選ばれているラジオ・「戻る」・「マップに追加」
    const order = [
      previewRegion(),
      checked,
      dialog().getByRole("button", { name: "戻る" }),
      dialog().getByRole("button", { name: "マップに追加" }),
    ];
    for (const expected of [...order.slice(1), order[0]]) {
      await user.tab();
      expect(expected).toHaveFocus();
      expect(unchecked).not.toHaveFocus();
    }
    for (const expected of [...order].reverse()) {
      await user.tab({ shift: true });
      expect(expected).toHaveFocus();
    }

    // 選択を切り替えると、止まる先も切り替えたラジオになる
    await user.click(unchecked);
    expect(unchecked).toBeChecked();
    previewRegion().focus();
    await user.tab();
    expect(unchecked).toHaveFocus();
    await user.tab();
    expect(dialog().getByRole("button", { name: "戻る" })).toHaveFocus();
  });

  describe("押し続け（L-408）", () => {
    it("Escape で閉じた直後の「箇条書きから追加」に押し続けの Enter が届いても、開き直さない", async () => {
      const user = userEvent.setup();
      await renderPage();
      outlineButton().focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(outlineButton()).toHaveFocus());

      pressEnterOnActiveElement({ repeat: true });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // 押し直した Enter では開く
      pressEnterOnActiveElement({ repeat: false });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("「プレビュー」を Enter で押した直後の押し続けの Enter は、プレビューの領域に届き、「マップに追加」を押さない", async () => {
      const user = userEvent.setup();
      await renderPage();
      await user.click(outlineButton());
      fireEvent.change(textarea(), { target: { value: "- A" } });
      dialog().getByRole("button", { name: "プレビュー" }).focus();

      pressEnterOnActiveElement({ repeat: false });
      await waitFor(() => expect(previewRegion()).toHaveFocus());
      pressEnterOnActiveElement({ repeat: true });
      pressEnterOnActiveElement({ repeat: true });

      expect(dialog().getByRole("heading", { name: "変換結果の確認" })).toBeInTheDocument();
      expect(exportedLabels()).toEqual([]);
    });
  });

  describe("ダブルクリック（L-150）", () => {
    // 1回目のクリックで追加してダイアログが閉じるので、2回目のクリックは外された要素へ送られ、追加は1回になる。
    // 2回目が開いたままのダイアログへ届く場合の detail > 1 の判定は、次のテストで確かめる
    it("「マップに追加」をダブルクリックすると、1回目で閉じるので1回だけ追加する", async () => {
      const user = userEvent.setup();
      await renderPage();
      await openPreview(user, "- A");

      await user.dblClick(dialog().getByRole("button", { name: "マップに追加" }));

      expect(exportedLabels()).toEqual(["A"]);
    });

    it("「プレビュー」のダブルクリックの2回目が「マップに追加」に届いても追加しない", async () => {
      const user = userEvent.setup();
      await renderPage();
      await user.click(outlineButton());
      fireEvent.change(textarea(), { target: { value: "- A" } });

      fireEvent.click(dialog().getByRole("button", { name: "プレビュー" }), { detail: 1 });
      fireEvent.click(dialog().getByRole("button", { name: "マップに追加" }), { detail: 2 });

      expect(dialog().getByRole("heading", { name: "変換結果の確認" })).toBeInTheDocument();
      expect(exportedLabels()).toEqual([]);
    });

    it("ノードを選択して「プレビュー」をダブルクリックし、2回目が追加先のラベルに届いても、追加先は「新しいルート」のまま", async () => {
      seedParentAndChild();
      const user = userEvent.setup();
      await renderPage();
      selectNode(0, 2);
      await user.click(outlineButton());
      fireEvent.change(textarea(), { target: { value: "- A" } });

      fireEvent.click(dialog().getByRole("button", { name: "プレビュー" }), { detail: 1 });
      fireEvent.click(dialog().getByText("選択中のノード「親」の子として追加"), { detail: 2 });

      expect(dialog().getByRole("radio", { name: "新しいルートとして追加" })).toBeChecked();
      await user.click(dialog().getByRole("button", { name: "マップに追加" }));
      expect(exportedNodes().find((node) => node.label === "A")?.parentId).toBeNull();
    });

    it("「戻る」のダブルクリックの2回目が入力の画面の「キャンセル」に届いても閉じない", async () => {
      const user = userEvent.setup();
      await renderPage();
      await openPreview(user, "- A");

      fireEvent.click(dialog().getByRole("button", { name: "戻る" }), { detail: 1 });
      fireEvent.click(dialog().getByRole("button", { name: "キャンセル" }), { detail: 2 });

      expect(dialog().getByRole("heading", { name: "箇条書きのテキスト" })).toBeInTheDocument();
    });

    it("「マップに追加」の1回目のクリックで閉じた後、キャンバスへ届いた500ms以内の dblclick ではノードを追加しない", async () => {
      const user = userEvent.setup();
      const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
      await renderPage();
      await openPreview(user, "- A");

      // 開いた時刻と区別できるよう、時刻をずらしてから押す（「マップに追加」のクリックが時刻を記録したことを確かめる）
      now.mockReturnValue(10_200);
      fireEvent.click(dialog().getByRole("button", { name: "マップに追加" }), { detail: 1 });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      now.mockReturnValue(10_699);
      fireEvent.doubleClick(stageContainer(), { detail: 2, clientX: 600, clientY: 450 });
      expect(exportedLabels()).toEqual(["A"]);

      // 時間を置いたダブルクリックでは追加する（位置が空き領域であることの確認）
      now.mockReturnValue(10_700);
      fireEvent.doubleClick(stageContainer(), { detail: 2, clientX: 600, clientY: 450 });
      expect(exportedLabels()).toEqual(["A", ""]);
    });
  });

  it("ノードのラベルの編集中に「箇条書きから追加」を押すと、入力中のラベルを確定してから開く（L-473）", async () => {
    seedParentAndChild();
    const user = userEvent.setup();
    await renderPage();
    fireEvent.doubleClick(stageContainer(), { clientX: 300, clientY: 200 });
    const input = screen.getByTestId("node-label-input");
    await user.clear(input);
    await user.type(input, "変更後");

    await user.click(outlineButton());

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(exportedLabels()).toEqual(["変更後", "子"]);
    await waitFor(() => expect(textarea()).toHaveFocus());
  });
});
