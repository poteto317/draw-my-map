import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  exportedMap,
  type ExportedNode,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  stageContainer,
  storedMap,
  undoButton,
  v3Json,
  type V3LayoutMode,
  type V3SeedNode,
} from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

// Pixi・イラスト生成・ダウンロード・画像化だけを差し替え、Home から MapEditor・ヘッダー・
// MapStage のショートカット・useNodes・折りたたみ・履歴・保存までは本物を通す
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

// jsdomはcanvasの2D contextを持たないため、文字幅の測定・PNG化・ダウンロードだけを差し替える
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

const INSERT_BUTTON_NAME = "選択中のノードに親を挿入";
const INSERT_FAILED_MESSAGE = "親ノードを挿入できませんでした。";
const B_MOVED_UP_MESSAGE = "枝を上へ移動しました（見えている兄弟の3件中1番目）。";
const BASIC_IDS = [1, 2, 3, 4, 5];

// R の子 A・B・C と、C の子 C1。中心は R (50, 230)、A (270, 30)、B (270, 230)、C (270, 430)、C1 (490, 430)
const BASIC_NODES: V3SeedNode[] = [
  { id: 1, label: "R", x: 0, y: 200 },
  { id: 2, parentId: 1, label: "A", x: 220, y: 0 },
  { id: 3, parentId: 1, label: "B", x: 220, y: 200 },
  { id: 4, parentId: 1, label: "C", x: 220, y: 400 },
  { id: 5, parentId: 4, label: "C1", x: 440, y: 400 },
];

function storeMap(nodes: readonly V3SeedNode[], layoutMode: V3LayoutMode = "manual") {
  seedMapLibrary(window.localStorage, [{ json: v3Json(nodes, layoutMode) }]);
}

function storeBasicMap() {
  storeMap(BASIC_NODES);
}

function insertButton() {
  return headerButton(INSERT_BUTTON_NAME);
}

function selectBasicB() {
  selectNode(2, 5, 270, 230);
}

function pressAltEnter(target: Element = document.body) {
  return fireEvent.keyDown(target, { key: "Enter", altKey: true });
}

// ブラウザはボタンの Enter（既定動作が止められていないとき）で click を合成する。それを再現する
function pressEnterOnActiveElement(init: { repeat: boolean }) {
  const target = document.activeElement as HTMLElement;
  const notPrevented = fireEvent.keyDown(target, { key: "Enter", ...init });
  if (notPrevented && target instanceof HTMLButtonElement) fireEvent.click(target, { detail: 0 });
}

function labelInput(): HTMLInputElement {
  return screen.getByTestId("node-label-input");
}

function expectLabelInputFocused() {
  expect(document.activeElement?.getAttribute("data-testid")).toBe("node-label-input");
}

function exportedNodeCount(): number {
  return exportedMap(mockDownloadMapJson).nodes.length;
}

function storedNode(id: number): ExportedNode | undefined {
  return storedMap()?.nodes.find((node) => node.id === id);
}

// 300ms の自動保存を待ち、保存された本体の nodes の [id, parentId] の並びを確かめる。
// 新しいノードの ID は採番器が決めるので、既存の ID でないものを "new" として比べる
async function expectStoredParents(
  knownIds: readonly number[],
  parents: Array<[number | "new", number | null | "new"]>,
) {
  await waitFor(() => {
    const nodes = storedMap()?.nodes ?? [];
    const newIds = nodes.filter((node) => !knownIds.includes(node.id)).map((node) => node.id);
    const describe = (id: number | null) => (id !== null && newIds.includes(id) ? "new" : id);
    expect(nodes.map((node) => [describe(node.id), describe(node.parentId)])).toEqual(parents);
  }, { timeout: 3000 });
}

// 保存されたマップから、既存の ID でないノードを並びの順に返す
function storedNewNodes(knownIds: readonly number[]): ExportedNode[] {
  return (storedMap()?.nodes ?? []).filter((node) => !knownIds.includes(node.id));
}

function noticeBar() {
  return screen.getByTestId("operation-notices");
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ページの親の挿入（ボタン）", () => {
  it("B と R の間に空の親を入れて入力欄へ移り、確定後にもう一度押すと続けて親を入れる", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    selectBasicB();

    await user.click(insertButton());

    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], ["new", 1], [3, "new"], [4, 1], [5, 4]]);
    const [inserted] = storedNewNodes(BASIC_IDS);
    expect(storedMap()!.nodes.map((node) => node.id)).toEqual([1, 2, inserted.id, 3, 4, 5]);
    expect(inserted).toMatchObject({
      parentId: 1, x: 220, y: 200, importance: "medium", label: "",
    });
    expect(storedNode(3)).toMatchObject({ parentId: inserted.id, x: 440, y: 200 });
    expectLabelInputFocused();
    expect(labelInput().value).toBe("");
    expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
    // JSON 書き出しの nodes の順も保存と同じ（書き出しは別の枠に通知を出すので、通知バーを確かめた後に行う）
    expect(exportedMap(mockDownloadMapJson).nodes.map((node) => node.id)).toEqual([1, 2, inserted.id, 3, 4, 5]);

    const input = labelInput();
    fireEvent.change(input, { target: { value: "分類" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
    await waitFor(() => expect(storedNode(inserted.id)?.label).toBe("分類"), { timeout: 3000 });

    // 新しいノードが選択されたまま、もう一度押す（L-617）
    await user.click(insertButton());

    expectLabelInputFocused();
    const knownIds = [...BASIC_IDS, inserted.id];
    await expectStoredParents(knownIds, [
      [1, null], [2, 1], ["new", 1], [inserted.id, "new"], [3, inserted.id], [4, 1], [5, 4],
    ]);
    expect(storedMap()!.nodes).toHaveLength(7);
  });

  it("ラベルを確定した後は、1回目の「元に戻す」でラベル、2回目で挿入が戻り、「やり直す」で同じ木に戻る", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    selectBasicB();
    await user.click(insertButton());
    const input = labelInput();
    fireEvent.change(input, { target: { value: "分類" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], ["new", 1], [3, "new"], [4, 1], [5, 4]]);
    const [inserted] = storedNewNodes(BASIC_IDS);

    await user.click(undoButton());
    expect(exportedMap(mockDownloadMapJson).nodes.find((node) => node.id === inserted.id)?.label).toBe("");

    await user.click(undoButton());
    const undone = exportedMap(mockDownloadMapJson).nodes;
    expect(undone).toHaveLength(5);
    expect(undone.find((node) => node.id === 3)).toMatchObject({ parentId: 1, x: 220, y: 200 });
    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], [3, 1], [4, 1], [5, 4]]);

    await user.click(redoButton());
    await user.click(redoButton());
    expect(screen.queryByTestId("node-label-input")).toBeNull();
    const redone = exportedMap(mockDownloadMapJson).nodes;
    expect(redone.find((node) => node.id === inserted.id)).toMatchObject({ parentId: 1, label: "分類" });
    expect(redone.find((node) => node.id === 3)).toMatchObject({ parentId: inserted.id, x: 440, y: 200 });
    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], ["new", 1], [3, "new"], [4, 1], [5, 4]]);
  });

  it("ボタンの Enter の押し続けでは1つだけ挿入し、入力欄が開いたまま残る（L-408）", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();
    insertButton().focus();

    pressEnterOnActiveElement({ repeat: false });
    expectLabelInputFocused();

    pressEnterOnActiveElement({ repeat: true });
    pressEnterOnActiveElement({ repeat: true });

    expectLabelInputFocused();
    expect(exportedNodeCount()).toBe(6);
    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], ["new", 1], [3, "new"], [4, 1], [5, 4]]);
  });

  it("ラベル編集中に押すと、編集中のラベルを確定してから親を入れ、新しい入力欄へ移る", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    // ダブルクリックでは選択されないので、先に A を選ぶ
    selectNode(1, 5, 270, 30);
    fireEvent.doubleClick(stageContainer(), { clientX: 270, clientY: 30 });
    fireEvent.change(labelInput(), { target: { value: "A改" } });

    await user.click(insertButton());

    await expectStoredParents(BASIC_IDS, [[1, null], ["new", 1], [2, "new"], [3, 1], [4, 1], [5, 4]]);
    const [inserted] = storedNewNodes(BASIC_IDS);
    expect(storedNode(2)).toMatchObject({ label: "A改", parentId: inserted.id });
    expectLabelInputFocused();
    expect(labelInput().value).toBe("");
  });
});

describe("ページの親の挿入（ショートカット）", () => {
  it("Alt+Enter でボタンと同じく親を入れ、Enter は今までどおり兄弟を足し、Ctrl+Alt+Enter は何もしない", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();

    pressAltEnter();

    expect(exportedNodeCount()).toBe(6);
    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], ["new", 1], [3, "new"], [4, 1], [5, 4]]);
    const [inserted] = storedNewNodes(BASIC_IDS);
    expect(inserted).toMatchObject({ parentId: 1, x: 220, y: 200 });
    expect(storedNode(3)).toMatchObject({ x: 440, y: 200 });
    fireEvent.keyDown(labelInput(), { key: "Escape" });

    // 配列は [R, A, N, B, C, C1]。B の中心は (490, 230)
    selectNode(3, 6, 490, 230);
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(exportedNodeCount()).toBe(7);
    const knownIds = [...BASIC_IDS, inserted.id];
    await waitFor(() => expect(storedNewNodes(knownIds)).toHaveLength(1), { timeout: 3000 });
    expect(storedNewNodes(knownIds)[0].parentId).toBe(inserted.id);
    expect(screen.getByTestId("node-label-input")).toBeInTheDocument();
    fireEvent.keyDown(labelInput(), { key: "Escape" });

    // 兄弟 S は配列の末尾に入るので、B は [R, A, N, B, C, C1, S] の4番目
    selectNode(3, 7, 490, 230);
    fireEvent.keyDown(document.body, { key: "Enter", altKey: true, ctrlKey: true });

    expect(exportedNodeCount()).toBe(7);
    expect(screen.queryByTestId("node-label-input")).toBeNull();
  });

  it("Alt+Enter の直後に入力欄へ届く押し続けの Alt+Enter では、確定も挿入もしない（L-408）", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();

    pressAltEnter();
    fireEvent.keyDown(labelInput(), { key: "Enter", altKey: true, repeat: true });

    expect(screen.getByTestId("node-label-input")).toBeInTheDocument();
    expect(exportedNodeCount()).toBe(6);
  });

  it("Enter の直後に入力欄へ届く押し続けの Enter では、確定も追加もしない（L-408）", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();

    fireEvent.keyDown(document.body, { key: "Enter" });
    fireEvent.keyDown(labelInput(), { key: "Enter", repeat: true });

    expect(screen.getByTestId("node-label-input")).toBeInTheDocument();
    expect(exportedNodeCount()).toBe(6);
  });
});

describe("ページの親の挿入（止まる場面。L-061）", () => {
  it("ラベル編集中の入力欄への Alt+Enter では挿入しない", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();
    fireEvent.doubleClick(stageContainer(), { clientX: 270, clientY: 230 });

    pressAltEnter(labelInput());

    expect(exportedNodeCount()).toBe(5);
    expect(exportedMap(mockDownloadMapJson).nodes.find((node) => node.id === 3)?.parentId).toBe(1);
  });

  it("検索の入力欄への Alt+Enter では挿入しない", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();
    const search = screen.getByRole("combobox", { name: "ノードを検索" });
    search.focus();

    pressAltEnter(search);

    expect(exportedNodeCount()).toBe(5);
  });

  it("「枝を複製」のボタンにフォーカスがあるときの Alt+Enter では挿入しない", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();
    const duplicate = headerButton("枝を複製");
    duplicate.focus();

    pressAltEnter(duplicate);

    expect(exportedNodeCount()).toBe(5);
  });

  it("箇条書きのダイアログを開いている間は、body への Alt+Enter で挿入しない", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    // 未選択では抑止が無くても変わらないので、必ず選択してから開く
    selectBasicB();
    await user.click(headerButton("箇条書きから追加"));
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    pressAltEnter();

    expect(exportedNodeCount()).toBe(5);
  });
});

describe("ページの親の挿入（目印の共有。L-522）", () => {
  it("「上へ」にフォーカスがあるときの Alt+Enter で親を入れる", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();
    const up = headerButton("枝を上へ移動");
    up.focus();

    pressAltEnter(up);

    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], ["new", 1], [3, "new"], [4, 1], [5, 4]]);
  });

  it("「階層を下げる」にフォーカスがあるときの Alt+Enter で親を入れる", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();
    const indent = headerButton("枝の階層を下げる");
    indent.focus();

    pressAltEnter(indent);

    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], ["new", 1], [3, "new"], [4, 1], [5, 4]]);
  });

  it("「親を挿入」にフォーカスがあるときの Alt+→ で階層を下げる", async () => {
    storeBasicMap();
    await renderPage();
    selectBasicB();
    const insert = insertButton();
    insert.focus();

    fireEvent.keyDown(insert, { key: "ArrowRight", altKey: true });

    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], [3, 2], [4, 1], [5, 4]]);
  });
});

describe("ページの親の挿入（折りたたみ・表示レベル・重要度）", () => {
  it("閉じた C に挿入すると C は閉じたまま、新しいノードは開いていて、C の子孫も右へ動く", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    selectNode(3, 5, 270, 430);
    await user.click(headerButton("枝を折りたたむ"));

    await user.click(insertButton());
    fireEvent.keyDown(labelInput(), { key: "Escape" });

    // 配列は [R, A, B, N, C, C1]。C の中心は (490, 430)
    selectNode(4, 6, 490, 430);
    expect(headerButton("枝を展開")).toBeEnabled();
    selectNode(3, 6, 270, 430);
    expect(headerButton("枝を折りたたむ")).toBeEnabled();

    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], [3, 1], ["new", 1], [4, "new"], [5, 4]]);
    expect(storedNode(4)).toMatchObject({ x: 440, y: 400 });
    expect(storedNode(5)).toMatchObject({ parentId: 4, x: 660, y: 400 });
  });

  it("新しいノードは選択中のノードの重要度を引き継ぐ", async () => {
    const user = userEvent.setup();
    storeMap(BASIC_NODES.map((node) => (node.id === 3 ? { ...node, importance: "high" } : node)));
    await renderPage();
    selectBasicB();

    await user.click(insertButton());

    expect(screen.getByRole("button", { name: "重要度 高" })).toHaveAttribute("aria-pressed", "true");
    await expectStoredParents(BASIC_IDS, [[1, null], [2, 1], ["new", 1], [3, "new"], [4, 1], [5, 4]]);
    expect(storedNewNodes(BASIC_IDS)[0].importance).toBe("high");
  });

  it("表示レベルで選択中のノードが隠れると、選択が外れてボタンが無効になる", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    selectBasicB();
    expect(insertButton()).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "表示 高のみ" }));

    expect(insertButton()).toBeDisabled();
    fireEvent.click(insertButton());
    expect(exportedNodeCount()).toBe(5);
  });
});

describe("ページの親の挿入（自動配置）", () => {
  it("先頭のルートに挿入すると、新しいノードがそのルートの位置に来る", async () => {
    storeMap([
      { id: 1, label: "一", x: 30, y: 40 },
      { id: 2, label: "二", x: 600, y: 500 },
    ], "auto");
    await renderPage();
    const first = exportedMap(mockDownloadMapJson).nodes.find((node) => node.id === 1)!;
    selectNode(0, 2, first.x + 50, first.y + 30);

    pressAltEnter();

    await expectStoredParents([1, 2], [["new", null], [1, "new"], [2, null]]);
    const [inserted] = storedNewNodes([1, 2]);
    expect(inserted).toMatchObject({ x: first.x, y: first.y });
  });
});

describe("ページの親の挿入（失敗と通知の枠。L-001、L-166）", () => {
  it("失敗すると何も変えずに通知を出し、次の成功で通知の枠を空にする", async () => {
    const user = userEvent.setup();
    storeMap([...BASIC_NODES, { id: 9, label: "Z", x: 1e19, y: 0 }]);
    await renderPage();
    // ポインタを動かさないので、座標は選択に影響しない
    selectNode(5, 6, 0, 0);

    await user.click(insertButton());

    expect(exportedNodeCount()).toBe(6);
    expect(within(noticeBar()).getByText(INSERT_FAILED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();

    selectNode(2, 6, 270, 230);
    await user.click(insertButton());

    expect(screen.queryByText(INSERT_FAILED_MESSAGE)).toBeNull();
    await expectStoredParents([...BASIC_IDS, 9], [
      [1, null], [2, 1], ["new", 1], [3, "new"], [4, 1], [5, 4], [9, null],
    ]);
  });

  it("並べ替えの通知の枠を共有し、挿入に成功するとその通知を消す", async () => {
    const user = userEvent.setup();
    storeBasicMap();
    await renderPage();
    selectBasicB();
    await user.click(headerButton("枝を上へ移動"));
    expect(within(noticeBar()).getByText(B_MOVED_UP_MESSAGE)).toBeInTheDocument();

    await user.click(insertButton());

    expect(screen.queryByText(B_MOVED_UP_MESSAGE)).not.toBeInTheDocument();
    await expectStoredParents(BASIC_IDS, [[1, null], ["new", 1], [3, "new"], [2, 1], [4, 1], [5, 4]]);
  });
});
