import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import {
  lastWorldContainer,
  mockNodePointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { readActiveMapJson, seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から MapEditor・ヘッダー・
// 箇条書きの取り込みのダイアログ・useNodes・履歴・保存までは本物を通す
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

jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: jest.fn(),
}));

jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: jest.fn(),
}));

type ExportedNode = {
  id: number;
  parentId: number | null;
  label: string;
  importance: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
type ExportedMap = { version: number; layoutMode: string; nodes: ExportedNode[] };

const SUCCESS_MESSAGE_TAIL = "件のノードを追加しました。Fキーで選択ノードへ移動できます。";

function v3Json(
  nodes: Array<Partial<ExportedNode> & { id: number }>,
  layoutMode: "manual" | "auto" = "manual",
): string {
  return `${JSON.stringify({
    version: 3,
    layoutMode,
    nodes: nodes.map((node) => ({
      parentId: null,
      x: 250,
      y: 170,
      width: 100,
      height: 60,
      label: "",
      importance: "medium",
      ...node,
    })),
  }, null, 2)}\n`;
}

// 旅行（子: 準備）と仕事の2本の木
const TRAVEL_MAP = [
  { id: 1, label: "旅行" },
  { id: 2, parentId: 1, label: "準備", x: 400 },
  { id: 3, label: "仕事", y: 300 },
];

function seed(nodes: Array<Partial<ExportedNode> & { id: number }>, layoutMode: "manual" | "auto" = "manual") {
  seedMapLibrary(window.localStorage, [{ json: v3Json(nodes, layoutMode) }]);
}

function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

async function renderHome() {
  const rendered = await renderReady(<Home />);
  mockStageBounds(stageContainer());
  return rendered;
}

function outlineButton(): HTMLElement {
  return within(screen.getByRole("banner")).getByRole("button", { name: "箇条書きから追加" });
}

function dialog() {
  return within(screen.getByRole("dialog"));
}

function textarea(): HTMLTextAreaElement {
  return dialog().getByRole("textbox", { name: "テキスト" }) as HTMLTextAreaElement;
}

// 入力の画面には role="alert" が2つ（入力のエラーとダイアログの通知）あるので、入力欄の説明から引く
function inputError(): HTMLElement {
  const ids = textarea().getAttribute("aria-describedby")!.split(" ");
  const errorId = ids.find((id) => document.getElementById(id)?.getAttribute("role") === "alert")!;
  return document.getElementById(errorId)!;
}

function previewRegion(): HTMLElement {
  return dialog().getByRole("region", { name: "変換結果のプレビュー" });
}

function undoButton() {
  return screen.getByRole("button", { name: "元に戻す" });
}

function redoButton() {
  return screen.getByRole("button", { name: "やり直す" });
}

function operationNotices() {
  return screen.queryByTestId("operation-notices");
}

async function openWithText(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(outlineButton());
  fireEvent.change(textarea(), { target: { value: text } });
}

async function openPreview(user: ReturnType<typeof userEvent.setup>, text: string) {
  await openWithText(user, text);
  await user.click(dialog().getByRole("button", { name: "プレビュー" }));
  expect(dialog().getByRole("heading", { name: "変換結果の確認" })).toBeInTheDocument();
}

// 直近の描画で登録されたノードの pointerdown で選択し、同じ pointer で離す（index は nodes 配列の順）
function selectNode(index: number, nodeCount: number) {
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(0, 0));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}

// 側面のパネルの「対象ノード」に、選択中のノードの表示名が出る
function selectedLabel(): string | null {
  const panel = within(screen.getByRole("complementary", { name: "イラスト" }));
  if (panel.queryByText("ノードを選択してください") !== null) return null;
  return panel.getByText("対象ノード").nextElementSibling!.textContent;
}

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

function storedMap(): ExportedMap | null {
  const stored = readActiveMapJson(window.localStorage);
  return stored === null ? null : JSON.parse(stored) as ExportedMap;
}

function byLabel(nodes: readonly ExportedNode[], label: string): ExportedNode {
  const found = nodes.filter((node) => node.label === label);
  expect(found).toHaveLength(1);
  return found[0];
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ページの箇条書きから追加", () => {
  it("手動配置のマップで、プレビューしてから新しいルートとしてマップの下へ追加し、保存する", async () => {
    seed([{ id: 1, label: "既存" }]);
    const user = userEvent.setup();
    await renderHome();

    await user.click(outlineButton());
    await user.type(textarea(), "- 果物\n  - りんご\n  - みかん\n- 野菜");
    await user.click(dialog().getByRole("button", { name: "プレビュー" }));

    expect(dialog().getByText("追加するノード: 4件（一番上の階層: 2件、最も深い階層: 2段目）")).toBeInTheDocument();
    expect(within(previewRegion()).getAllByRole("listitem").map((item) => item.firstChild?.textContent))
      .toEqual(["果物", "りんご", "みかん", "野菜"]);
    expect(dialog().getByText("新しいルートとして追加します。")).toBeInTheDocument();

    await user.click(dialog().getByRole("button", { name: "マップに追加" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(operationNotices()).toHaveTextContent(`4${SUCCESS_MESSAGE_TAIL}`);
    await waitFor(() => expect(outlineButton()).toHaveFocus());
    // 300ms の自動保存を待つ
    await waitFor(() => expect(storedMap()?.nodes).toHaveLength(5), { timeout: 3000 });
    const nodes = storedMap()!.nodes;
    const imported = nodes.slice(1);
    expect(imported.map((node) => node.label)).toEqual(["果物", "りんご", "みかん", "野菜"]);
    expect(imported.every((node) => node.importance === "medium")).toBe(true);
    expect(imported.every((node) => node.width === 100 && node.height === 60)).toBe(true);
    const fruit = byLabel(nodes, "果物");
    expect(byLabel(nodes, "りんご").parentId).toBe(fruit.id);
    expect(byLabel(nodes, "みかん").parentId).toBe(fruit.id);
    expect(fruit.parentId).toBeNull();
    expect(byLabel(nodes, "野菜").parentId).toBeNull();
    // 親は子の範囲の中央に置かれるので、木の上端は果物ではなくりんご。マップの下端 230 から 40 空ける
    expect(Math.min(...imported.map((node) => node.y))).toBe(270);
    expect(byLabel(nodes, "りんご").y).toBe(270);
    expect(fruit.y).toBe(320);
    expect(fruit.x).toBe(250);

    // 先頭のルート（果物）を選択しているので、F キーで表示位置を動かせる
    const world = lastWorldContainer()!;
    const positionCalls = world.position.set.mock.calls.length;
    await user.keyboard("f");
    expect(world.position.set.mock.calls.length).toBeGreaterThan(positionCalls);
  });

  it("追加の直後は先頭のルートを選択し、「枝を複製」でその枝を複製する（L-170）", async () => {
    seed([{ id: 1, label: "既存" }]);
    const user = userEvent.setup();
    await renderHome();
    await openPreview(user, "- 果物\n  - りんご\n  - みかん\n- 野菜");
    await user.click(dialog().getByRole("button", { name: "マップに追加" }));

    const duplicate = screen.getByRole("button", { name: "枝を複製" });
    expect(duplicate).toBeEnabled();
    await user.click(duplicate);

    const nodes = exportedMap().nodes;
    expect(nodes.map((node) => node.label)).toEqual([
      "既存", "果物", "りんご", "みかん", "野菜", "果物", "りんご", "みかん",
    ]);
    const copiedRoot = nodes[5];
    expect(copiedRoot.parentId).toBeNull();
    expect(nodes[6].parentId).toBe(copiedRoot.id);
    expect(nodes[7].parentId).toBe(copiedRoot.id);
  });

  it("自動配置のマップでは、取り込んだ森を既存の木の下に入力の順で並べる", async () => {
    seed([
      { id: 1, label: "A" },
      { id: 2, parentId: 1, label: "A1" },
      { id: 3, label: "B" },
    ], "auto");
    const user = userEvent.setup();
    await renderHome();
    await openPreview(user, "- X\n- Y\n  - Y1\n- Z");

    await user.click(dialog().getByRole("button", { name: "マップに追加" }));

    const nodes = exportedMap().nodes;
    expect(nodes).toHaveLength(7);
    const existingMaxY = Math.max(...nodes.slice(0, 3).map((node) => node.y));
    const imported = nodes.slice(3);
    expect(imported.every((node) => node.y > existingMaxY)).toBe(true);
    const roots = ["X", "Y", "Z"].map((label) => byLabel(nodes, label).y);
    expect(roots[0]).toBeLessThan(roots[1]);
    expect(roots[1]).toBeLessThan(roots[2]);
  });

  describe("追加先", () => {
    it("ノードを選択して開くと、選んだノードの子として追加でき、深さ0の項目がすべてその子になる", async () => {
      seed(TRAVEL_MAP);
      const user = userEvent.setup();
      await renderHome();
      selectNode(0, 3);
      await openPreview(user, "- 京都\n  - 清水寺\n- 大阪");

      const asChild = dialog().getByRole("radio", { name: "選択中のノード「旅行」の子として追加" });
      expect(dialog().getByRole("radio", { name: "新しいルートとして追加" })).toBeChecked();
      await user.click(asChild);
      await user.click(dialog().getByRole("button", { name: "マップに追加" }));

      const nodes = exportedMap().nodes;
      expect(nodes).toHaveLength(6);
      expect(byLabel(nodes, "京都").parentId).toBe(1);
      expect(byLabel(nodes, "大阪").parentId).toBe(1);
      expect(byLabel(nodes, "清水寺").parentId).toBe(byLabel(nodes, "京都").id);
    });

    it("選択していないときは選択肢を出さず、新しいルートとして追加すると伝える", async () => {
      seed(TRAVEL_MAP);
      const user = userEvent.setup();
      await renderHome();

      await openPreview(user, "- 京都");

      expect(dialog().queryAllByRole("radio")).toHaveLength(0);
      expect(dialog().getByText("新しいルートとして追加します。")).toBeInTheDocument();
    });

    it("折りたたんだノードの子として追加すると、そのノードを展開する", async () => {
      seed(TRAVEL_MAP);
      const user = userEvent.setup();
      await renderHome();
      selectNode(0, 3);
      await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
      expect(screen.getByRole("button", { name: "枝を展開" })).toHaveAttribute("aria-expanded", "false");

      await openPreview(user, "- 京都");
      await user.click(dialog().getByRole("radio", { name: "選択中のノード「旅行」の子として追加" }));
      await user.click(dialog().getByRole("button", { name: "マップに追加" }));
      expect(byLabel(exportedMap().nodes, "京都").parentId).toBe(1);
      // 追加の後は取り込んだ先頭のノードが選択されるので、旅行を選び直して確かめる
      selectNode(0, 4);

      expect(screen.getByRole("button", { name: "枝を折りたたむ" })).toHaveAttribute("aria-expanded", "true");
    });
  });

  it("1回の Undo で取り込んだノードがすべて消えて既存の座標も戻り、Redo で同じ ID・座標で戻る（L-063）", async () => {
    seed([
      { id: 1, label: "A" },
      { id: 2, parentId: 1, label: "A1" },
      { id: 3, label: "B" },
    ], "auto");
    const user = userEvent.setup();
    await renderHome();
    const before = exportedMap().nodes;
    await openPreview(user, "- X\n  - X1\n- Y");
    await user.click(dialog().getByRole("button", { name: "マップに追加" }));
    const after = exportedMap().nodes;
    expect(after).toHaveLength(6);
    // 自動配置の全体の再配置で既存のノードも動く。Undo でその移動も戻ることを確かめるための前提
    expect(after.slice(0, 3)).not.toEqual(before);
    expect(operationNotices()).toHaveTextContent(`3${SUCCESS_MESSAGE_TAIL}`);

    await user.click(undoButton());

    expect(exportedMap().nodes).toEqual(before);
    expect(screen.queryByText(new RegExp(SUCCESS_MESSAGE_TAIL))).not.toBeInTheDocument();

    await user.click(redoButton());

    expect(exportedMap().nodes).toEqual(after);
  });

  it("キャンセルで閉じてもテキストを残し、追加に成功した後は空にする", async () => {
    seed([{ id: 1, label: "既存" }]);
    const user = userEvent.setup();
    await renderHome();
    await openWithText(user, "- 残す");
    await user.click(dialog().getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(outlineButton());
    expect(textarea()).toHaveValue("- 残す");
    await user.click(dialog().getByRole("button", { name: "プレビュー" }));
    await user.click(dialog().getByRole("button", { name: "マップに追加" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(outlineButton());
    expect(textarea()).toHaveValue("");
  });

  it("開いた後にマップが置き換わって選択していたノードが無くなると、追加せずダイアログ内で知らせる（L-002・L-037）", async () => {
    seed([{ id: 1, label: "旅行" }]);
    const user = userEvent.setup();
    await renderHome();
    let resolveText!: (text: string) => void;
    const file = new File(["{}"], "map.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      configurable: true,
      value: () => new Promise<string>((resolve) => {
        resolveText = resolve;
      }),
    });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [file] } });
    selectNode(0, 1);
    await openPreview(user, "- 京都");
    await user.click(dialog().getByRole("radio", { name: "選択中のノード「旅行」の子として追加" }));

    // 選択していたノードの ID（1）を含まないマップに置き換える
    await act(async () => {
      resolveText(v3Json([{ id: 10, label: "別1" }, { id: 11, label: "別2", x: 400 }]));
    });
    await waitFor(() => expect(screen.getByText("マップを読み込みました。")).toBeInTheDocument());
    const replaced = exportedMap().nodes;
    expect(replaced.map((node) => node.label)).toEqual(["別1", "別2"]);
    // 置き換えで外れた選択を、置き換わったマップのノードで選び直しておく
    selectNode(0, 2);
    expect(selectedLabel()).toBe("別1");
    const asMissing = dialog().getByRole("radio", { name: "選択していたノードの子として追加" });
    expect(asMissing).toBeChecked();
    const undoDisabled = (undoButton() as HTMLButtonElement).disabled;

    await user.click(dialog().getByRole("button", { name: "マップに追加" }));

    await waitFor(() => expect(dialog().getByRole("alert")).toHaveTextContent(
      "選択していたノードが見つからないため、追加できませんでした。「新しいルートとして追加」を選び直してください。",
    ));
    expect(dialog().getByRole("heading", { name: "変換結果の確認" })).toBeInTheDocument();
    expect(exportedMap().nodes).toEqual(replaced);
    expect((undoButton() as HTMLButtonElement).disabled).toBe(undoDisabled);
    expect(selectedLabel()).toBe("別1");
  });

  describe("入力のエラー", () => {
    it("空のまま「プレビュー」を押すと、入力欄にエラーを出してプレビューへ進まない", async () => {
      const user = userEvent.setup();
      await renderHome();
      await user.click(outlineButton());

      await user.click(dialog().getByRole("button", { name: "プレビュー" }));

      await waitFor(() => expect(inputError()).toHaveTextContent(
        "取り込める行がありません。空行と記号だけの行は取り込みません。",
      ));
      expect(textarea()).toHaveAttribute("aria-invalid", "true");
      expect(dialog().queryByRole("heading", { name: "変換結果の確認" })).not.toBeInTheDocument();
    });

    it("空行を除いて10,001行ならエラーでプレビューへ進まず、10,000行ならプレビューの先頭200件を表示する", async () => {
      const user = userEvent.setup();
      await renderHome();
      await openWithText(user, "A\n".repeat(10_001));

      await user.click(dialog().getByRole("button", { name: "プレビュー" }));

      await waitFor(() => expect(inputError()).toHaveTextContent(
        "行が多すぎます（空行を除いて10,000行以内）。現在 10,001 行です。",
      ));
      expect(dialog().queryByRole("heading", { name: "変換結果の確認" })).not.toBeInTheDocument();

      fireEvent.change(textarea(), { target: { value: "A\n".repeat(10_000) } });
      await user.click(dialog().getByRole("button", { name: "プレビュー" }));

      expect(dialog().getByRole("heading", { name: "変換結果の確認" })).toBeInTheDocument();
      expect(within(previewRegion()).getAllByRole("listitem")).toHaveLength(200);
      expect(dialog().getByText("先頭の200件を表示しています（全10,000件）。")).toBeInTheDocument();
    });
  });
});
