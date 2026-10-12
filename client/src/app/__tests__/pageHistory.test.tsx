import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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

// Pixiだけを差し替え、MapStage・NodeLabelEditor・useNodes・履歴・保存hookは本物を通す
jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

const mockGenerateIllustrationThumbnail = jest.fn();
jest.mock("@/services/illustration/illustrationGeneration", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationGeneration");
  return {
    ...actual,
    generateIllustrationThumbnail: (label: string, options: { signal?: AbortSignal }) => (
      mockGenerateIllustrationThumbnail(label, options)
    ),
  };
});

const mockDownloadMapJson = jest.fn();
jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return {
    ...actual,
    downloadMapJson: (json: string) => mockDownloadMapJson(json),
  };
});

// jsdomはcanvasの2D contextを持たないため、文字幅の測定・PNG化・ダウンロードだけを差し替える
jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));

const mockDownloadMapImage = jest.fn();
jest.mock("@/services/imageExport/mapImageDownload", () => ({
  downloadMapImage: (blob: Blob, fileName: string) => mockDownloadMapImage(blob, fileName),
}));

const mockRasterizeMapSvgToPng = jest.fn();
jest.mock("@/services/imageExport/mapPngRasterizer", () => ({
  rasterizeMapSvgToPng: (svg: string, width: number, height: number) => (
    mockRasterizeMapSvgToPng(svg, width, height)
  ),
}));

const STORAGE_KEY = "draw-my-map.map.v1";
const OLD_IMAGE = "data:image/jpeg;base64,T0xE";
const NEW_IMAGE = "data:image/jpeg;base64,TkVX";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

type ExportedNode = { id: number; label: string; x: number; y: number; illustration?: string };
type ExportedMap = { version: number; layoutMode: string; nodes: ExportedNode[] };

function v3Json(nodes: Array<Partial<ExportedNode> & { id: number }>): string {
  return `${JSON.stringify({
    version: 3,
    layoutMode: "manual",
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

function jsonFile(text: Promise<string> | string): File {
  const file = new File(["{}"], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: jest.fn(() => Promise.resolve(text)),
  });
  return file;
}

function failingFile(): File {
  const file = new File(["{}"], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: jest.fn().mockRejectedValue(new Error("read failed")),
  });
  return file;
}

function stageContainer(): HTMLElement {
  return document.querySelector<HTMLElement>(".cursor-crosshair")!;
}

async function renderPage() {
  const rendered = await renderReady(<Home />);
  mockStageBounds(stageContainer());
  return rendered;
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[type="file"]')!;
}

function undoButton() {
  return screen.getByRole("button", { name: "元に戻す" });
}

function redoButton() {
  return screen.getByRole("button", { name: "やり直す" });
}

// 空き領域のダブルクリックで、その位置を中心にノードを追加する
function addNodeAt(x: number, y: number) {
  fireEvent.doubleClick(stageContainer(), { clientX: x, clientY: y });
}

// ノード上のダブルクリックで、本物のNodeLabelEditorを開く
function openLabelEditor(x: number, y: number): HTMLInputElement {
  fireEvent.doubleClick(stageContainer(), { clientX: x, clientY: y });
  return screen.getByTestId("node-label-input") as HTMLInputElement;
}

// Pixiのノードpointerdownで選択し、同じpointerで離す
function selectNodeAt(x: number, y: number) {
  act(() => {
    mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(x, y));
    mockStageHandlers.pointerup?.(pointer(x, y));
  });
}

function exportedMap(): ExportedMap {
  fireEvent.click(screen.getByRole("button", { name: "JSON書き出し" }));
  return JSON.parse(mockDownloadMapJson.mock.lastCall![0] as string) as ExportedMap;
}

function storedMap(): ExportedMap | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? null : JSON.parse(stored) as ExportedMap;
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockGenerateIllustrationThumbnail.mockReset();
  mockDownloadMapJson.mockReset();
  mockDownloadMapImage.mockReset();
  mockRasterizeMapSvgToPng.mockReset();
  mockRasterizeMapSvgToPng.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("ページの元に戻す・やり直す", () => {
  it("ノード作成をボタンで戻し、ショートカットで同じIDのまま戻す", async () => {
    const user = userEvent.setup();
    await renderPage();
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();

    addNodeAt(300, 200);
    const [created] = exportedMap().nodes;
    expect(undoButton()).toBeEnabled();
    expect(redoButton()).toBeDisabled();

    await user.click(undoButton());
    expect(exportedMap().nodes).toEqual([]);
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeEnabled();

    await user.keyboard("{Control>}y{/Control}");
    expect(exportedMap().nodes).toEqual([created]);
    expect(undoButton()).toBeEnabled();
    expect(redoButton()).toBeDisabled();

    await user.keyboard("{Meta>}z{/Meta}");
    expect(exportedMap().nodes).toEqual([]);

    await user.click(redoButton());
    expect(exportedMap().nodes).toEqual([created]);

    await user.keyboard("{Control>}z{/Control}");
    expect(exportedMap().nodes).toEqual([]);
    await user.keyboard("{Control>}{Shift>}Z{/Shift}{/Control}");
    expect(exportedMap().nodes).toEqual([created]);
  });

  it("ヘッダーのボタンにフォーカスがあってもショートカットでUndoできる", async () => {
    const user = userEvent.setup();
    await renderPage();
    addNodeAt(300, 200);

    screen.getByRole("button", { name: "JSON書き出し" }).focus();
    await user.keyboard("{Control>}z{/Control}");

    expect(exportedMap().nodes).toEqual([]);
  });

  it("空履歴の対象キーは既定動作を止めるが、マップを変えない", async () => {
    await renderPage();

    const allowed = fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });

    expect(allowed).toBe(false);
    expect(exportedMap().nodes).toEqual([]);
    expect(undoButton()).toBeDisabled();
  });

  it("表示フィルターを手動に設定してからUndo／Redoしても、フィルター設定とviewportを維持する", async () => {
    const user = userEvent.setup();
    await renderPage();
    addNodeAt(300, 200);
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
    await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
    const world = lastWorldContainer();
    const transform = {
      position: world?.position.set.mock.lastCall,
      scale: world?.scale.set.mock.lastCall,
    };
    expect(transform.scale).toEqual([Math.exp(0.1)]);

    await user.click(undoButton());
    await user.click(redoButton());

    expect(screen.getByRole("button", { name: "表示 高のみ" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "表示 自動" })).toHaveAttribute("aria-pressed", "false");
    const restoredWorld = lastWorldContainer();
    expect({
      position: restoredWorld?.position.set.mock.lastCall,
      scale: restoredWorld?.scale.set.mock.lastCall,
    }).toEqual(transform);
  });
});

describe("ラベル編集と履歴ボタン", () => {
  it("編集中に有効なUndoボタンを押すと、blurで確定した編集を戻す", async () => {
    const user = userEvent.setup();
    await renderPage();
    addNodeAt(300, 200);
    const input = openLabelEditor(300, 200);
    await user.clear(input);
    await user.type(input, "確定前");

    await user.click(undoButton());

    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
    const nodes = exportedMap().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe("");
    expect(redoButton()).toBeEnabled();

    await user.click(undoButton());
    expect(exportedMap().nodes).toEqual([]);
  });

  it("入力中のCtrl+Zはブラウザに任せ、マップを戻さない", async () => {
    const user = userEvent.setup();
    await renderPage();
    addNodeAt(300, 200);
    const input = openLabelEditor(300, 200);
    await user.type(input, "入力中");

    const allowed = fireEvent.keyDown(input, { key: "z", ctrlKey: true });
    await user.keyboard("{Control>}z{/Control}");

    expect(allowed).toBe(true);
    expect(screen.getByTestId("node-label-input")).toHaveFocus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(exportedMap().nodes).toHaveLength(1);
  });

  it("Redoがあっても、blurで実変更を確定するとRedoは何もしない", async () => {
    const user = userEvent.setup();
    await renderPage();
    addNodeAt(300, 200);
    await user.type(openLabelEditor(300, 200), "最初{Enter}");
    await user.click(undoButton());
    expect(redoButton()).toBeEnabled();

    const input = openLabelEditor(300, 200);
    await user.clear(input);
    await user.type(input, "上書き");
    await user.click(redoButton());

    expect(exportedMap().nodes[0].label).toBe("上書き");
    expect(redoButton()).toBeDisabled();
    await user.click(undoButton());
    expect(exportedMap().nodes[0].label).toBe("");
  });

  it("blurで変更がなければ、既存のRedoを実行できる", async () => {
    const user = userEvent.setup();
    await renderPage();
    addNodeAt(300, 200);
    await user.type(openLabelEditor(300, 200), "最初{Enter}");
    await user.click(undoButton());

    openLabelEditor(300, 200);
    await user.click(redoButton());

    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(exportedMap().nodes[0].label).toBe("最初");
  });

  it.each([
    { name: "Enter", commit: async (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Enter}") },
    { name: "別の場所へのblur", commit: async (user: ReturnType<typeof userEvent.setup>) => user.click(document.body) },
  ])("履歴が空でdisabledのときは、$nameで先に確定してからUndoする", async ({ commit }) => {
    window.localStorage.setItem(STORAGE_KEY, v3Json([{ id: 7, label: "保存済み" }]));
    const user = userEvent.setup();
    await renderPage();
    expect(undoButton()).toBeDisabled();
    const input = openLabelEditor(300, 200);
    await user.clear(input);
    await user.type(input, "変更後");
    expect(undoButton()).toBeDisabled();

    await commit(user);
    expect(screen.queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(exportedMap().nodes[0].label).toBe("変更後");
    expect(undoButton()).toBeEnabled();

    await user.click(undoButton());
    expect(exportedMap().nodes[0].label).toBe("保存済み");
    expect(undoButton()).toBeDisabled();
  });
});

describe("保存・出力と履歴", () => {
  it("編集後300ms未満にUndoすると、localStorageには復元値だけが残る", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    await renderPage();
    addNodeAt(300, 200);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(storedMap()?.nodes).toHaveLength(1);

    const input = openLabelEditor(300, 200);
    await user.type(input, "保存前{Enter}");
    act(() => {
      jest.advanceTimersByTime(100);
    });
    await user.keyboard("{Control>}z{/Control}");
    act(() => {
      jest.advanceTimersByTime(300);
    });

    const stored = storedMap()!;
    expect(Object.keys(stored).sort()).toEqual(["layoutMode", "nodes", "version"]);
    expect(stored.nodes).toHaveLength(1);
    expect(stored.nodes[0].label).toBe("");
    expect(setItem.mock.calls.some(([, value]) => String(value).includes("保存前"))).toBe(false);
  });

  it("復元前の保存待ちが、Undo後の値を上書きしない", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    await renderPage();
    addNodeAt(300, 200);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    await user.keyboard("{Control>}z{/Control}");
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(storedMap()?.nodes ?? []).toEqual([]);
    const writtenNodeCounts = setItem.mock.calls
      .filter(([key]) => key === STORAGE_KEY)
      .map(([, value]) => (JSON.parse(String(value)) as ExportedMap).nodes.length);
    expect(writtenNodeCounts).not.toContain(1);
  });

  it("JSON・画像出力はUndo後の現在値を使い、履歴を出力しない", async () => {
    const user = userEvent.setup();
    await renderPage();
    addNodeAt(300, 200);
    await user.type(openLabelEditor(300, 200), "現在値{Enter}");
    const input = openLabelEditor(300, 200);
    await user.clear(input);
    await user.type(input, "取り消す値{Enter}");
    expect(exportedMap().nodes[0].label).toBe("取り消す値");

    await user.click(undoButton());

    const json = exportedMap();
    expect(Object.keys(json).sort()).toEqual(["layoutMode", "nodes", "version"]);
    expect(json.nodes.map((node) => node.label)).toEqual(["現在値"]);
    expect(mockDownloadMapJson.mock.lastCall![0]).not.toContain("取り消す値");

    await user.click(screen.getByRole("button", { name: "SVG書き出し" }));
    const [svgBlob] = mockDownloadMapImage.mock.lastCall! as [Blob, string];
    const svg = await readBlobText(svgBlob);
    expect(svg).toContain("現在値");
    expect(svg).not.toContain("取り消す値");

    await user.click(screen.getByRole("button", { name: "PNG書き出し" }));
    await waitFor(() => expect(mockRasterizeMapSvgToPng).toHaveBeenCalledTimes(1));
    const [pngSourceSvg] = mockRasterizeMapSvgToPng.mock.lastCall! as [string];
    expect(pngSourceSvg).toContain("現在値");
    expect(pngSourceSvg).not.toContain("取り消す値");
  });
});

describe("イラスト生成と履歴", () => {
  async function prepareLabeledNode(user: ReturnType<typeof userEvent.setup>) {
    await renderPage();
    addNodeAt(300, 200);
    await user.type(openLabelEditor(300, 200), "りんご{Enter}");
    selectNodeAt(300, 200);
  }

  it("生成中にUndo→Redoしても旧応答のプレビューを出さず、新しい生成は成功する", async () => {
    const user = userEvent.setup();
    const oldRequest = deferred<string>();
    const newRequest = deferred<string>();
    mockGenerateIllustrationThumbnail
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    await prepareLabeledNode(user);

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));
    expect(mockGenerateIllustrationThumbnail).toHaveBeenCalledWith("りんご", expect.anything());
    const [, { signal }] = mockGenerateIllustrationThumbnail.mock.lastCall! as [string, { signal: AbortSignal }];
    expect(screen.getByRole("status")).toHaveTextContent("生成中です");

    await user.click(undoButton());
    await user.click(redoButton());
    expect(signal.aborted).toBe(true);
    selectNodeAt(300, 200);
    oldRequest.resolve(OLD_IMAGE);
    await flushPromises();

    expect(screen.queryByRole("button", { name: "ノードに設定" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "イラストを生成" }));
    newRequest.resolve(NEW_IMAGE);
    await flushPromises();

    expect(screen.getByRole("img")).toHaveAttribute("src", NEW_IMAGE);
    expect(screen.getByRole("button", { name: "ノードに設定" })).toBeInTheDocument();
  });

  it("成功済みのプレビューもUndoで消え、同じIDとラベルへ戻しても復活しない", async () => {
    const user = userEvent.setup();
    mockGenerateIllustrationThumbnail.mockResolvedValueOnce(OLD_IMAGE);
    await prepareLabeledNode(user);
    await user.click(screen.getByRole("button", { name: "イラストを生成" }));
    await flushPromises();
    expect(screen.getByRole("img")).toHaveAttribute("src", OLD_IMAGE);

    await user.click(undoButton());
    await user.click(redoButton());
    selectNodeAt(300, 200);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ノードに設定" })).not.toBeInTheDocument();
  });

  it("設定済みと同じ画像の再設定に成功するとプレビューを閉じる", async () => {
    const user = userEvent.setup();
    mockGenerateIllustrationThumbnail
      .mockResolvedValueOnce(OLD_IMAGE)
      .mockResolvedValueOnce(OLD_IMAGE);
    await prepareLabeledNode(user);
    await user.click(screen.getByRole("button", { name: "イラストを生成" }));
    await flushPromises();
    await user.click(screen.getByRole("button", { name: "ノードに設定" }));
    expect(screen.getByText("設定済みのイラスト")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "イラストを再生成" }));
    await flushPromises();
    expect(screen.getByRole("button", { name: "ノードに設定" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ノードに設定" }));

    expect(screen.queryByRole("button", { name: "ノードに設定" })).not.toBeInTheDocument();
    expect(exportedMap().nodes[0].illustration).toBe(OLD_IMAGE);
  });
});

describe("マップの置換と履歴", () => {
  it("V3の初回復元後はUndo／Redoできない", async () => {
    window.localStorage.setItem(STORAGE_KEY, v3Json([{ id: 7, label: "保存済み" }]));
    const user = userEvent.setup();
    await renderPage();

    expect(exportedMap().nodes.map((node) => node.label)).toEqual(["保存済み"]);
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
    await user.keyboard("{Control>}z{/Control}");
    expect(exportedMap().nodes.map((node) => node.label)).toEqual(["保存済み"]);
  });

  it("V3の読み込みに成功すると、過去と未来の履歴を消す", async () => {
    const user = userEvent.setup();
    const { container } = await renderPage();
    addNodeAt(300, 200);
    addNodeAt(500, 400);
    await user.click(undoButton());
    expect(undoButton()).toBeEnabled();
    expect(redoButton()).toBeEnabled();

    await user.upload(fileInput(container), jsonFile(v3Json([{ id: 9, label: "読込" }])));

    await waitFor(() => expect(screen.getByText("マップを読み込みました。")).toBeInTheDocument());
    expect(exportedMap().nodes.map((node) => node.id)).toEqual([9]);
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
  });

  it.each([
    { name: "不正JSON", file: () => jsonFile("{broken") },
    { name: "read失敗", file: failingFile },
  ])("$nameの読み込み後は、現在値と両方の履歴を保つ", async ({ file }) => {
    const user = userEvent.setup();
    const { container } = await renderPage();
    addNodeAt(300, 200);
    addNodeAt(500, 400);
    await user.click(undoButton());
    const before = exportedMap();

    await user.upload(fileInput(container), file());

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("現在のマップは変更されていません。"));
    expect(exportedMap()).toEqual(before);
    expect(undoButton()).toBeEnabled();
    expect(redoButton()).toBeEnabled();
    await user.click(redoButton());
    expect(exportedMap().nodes).toHaveLength(2);
    await user.click(undoButton());
    await user.click(undoButton());
    expect(exportedMap().nodes).toEqual([]);
  });

  it("読み込み待ち中にUndoしても、最新の読み込みが成功すればそれが新しい起点になる", async () => {
    const user = userEvent.setup();
    const { container } = await renderPage();
    addNodeAt(300, 200);
    addNodeAt(500, 400);
    const pendingText = deferred<string>();

    await user.upload(fileInput(container), jsonFile(pendingText.promise));
    await user.click(undoButton());
    expect(exportedMap().nodes).toHaveLength(1);
    expect(redoButton()).toBeEnabled();

    pendingText.resolve(v3Json([{ id: 9, label: "読込" }]));
    await waitFor(() => expect(screen.getByText("マップを読み込みました。")).toBeInTheDocument());

    expect(exportedMap().nodes.map((node) => node.id)).toEqual([9]);
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
  });
});
