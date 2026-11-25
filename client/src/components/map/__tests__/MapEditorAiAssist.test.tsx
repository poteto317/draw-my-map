import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MapEditor } from "@/components/map/MapEditor";
import {
  mockGraphicsPointerHandlers,
  mockNodePointerHandlers,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import { createTestStorageSession } from "@/testing/createTestStorageSession";

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

jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));

// 1: ルート（high）、2: 子A（low）、3: 子B（medium）。座標は MapEditorCommandPalette.test.tsx の seedJson と同じ考え方
const seedJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
    { id: 2, parentId: 1, label: "子A", importance: "low", x: 220, y: 180, width: 100, height: 60 },
    { id: 3, parentId: 1, label: "子B", importance: "medium", x: 220, y: 260, width: 100, height: 60 },
  ],
});

function seedWithTour(): string {
  const base = JSON.parse(seedJson) as Record<string, unknown>;
  return JSON.stringify({
    ...base,
    tour: {
      version: 1,
      title: "案内",
      steps: [{
        id: "step-1",
        snapshot: {
          viewport: { offsetX: 0, offsetY: 0, scale: 1 },
          selectedNodeId: 1, selectedNodeIds: [1], focusRootId: null, collapsedNodeIds: [],
          resolutionMode: "auto", autoResolutionLevel: "all",
        },
      }],
    },
  });
}

const STATUS = { available: true, provider: "anthropic", providerLabel: "Anthropic（Claude API）", model: "claude-opus-5-5" };

const viewNavigationJsonWithRelation = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "親ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
    { id: 2, parentId: 1, label: "子", importance: "low", x: 220, y: 100, width: 100, height: 60 },
  ],
  relations: [{ id: 10, fromId: 1, toId: 2, kind: "related", directed: false }],
});

// jest の jsdom 環境には Response が無いため、aiAssistClient が使う ok・status・text だけを持つ値を返す
// （クライアントは response.text() と JSON.parse で読む）
type FakeReply = { status: number; body: unknown };
const mockFetch = jest.fn();
const originalFetch = globalThis.fetch;

function routeFetch(replies: Record<string, FakeReply>) {
  mockFetch.mockImplementation(async (input: unknown) => {
    const reply = replies[String(input)];
    if (reply === undefined) throw new TypeError("unexpected request");
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, text: async () => JSON.stringify(reply.body) };
  });
}

function requestBodyOf(path: string): unknown {
  const call = mockFetch.mock.calls.find(([input]) => String(input) === path);
  return JSON.parse(String(call?.[1]?.body));
}

async function renderEditor(storageMode: "persistent" | "protected" = "persistent", initialJson = seedJson) {
  const storage = createTestStorageSession({ initialJson });
  return renderReady(
    <MapEditor
      mapId={storage.session.mapId}
      exportButtonRef={{ current: null }}
      mapMoveTargets={[{ id: storage.session.mapId, name: "テストのマップ", createdAt: "2026-11-25T00:00:00.000Z", updatedAt: "2026-11-25T00:00:00.000Z" }]}
      libraryMeta={createEmptyMapLibraryMeta()}
      onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
      onExtractBranchToNewMap={() => ({ ok: false, notice: { kind: "error", message: "切り出せません。" } })}
      mapName="テストのマップ"
      storageSession={storage.session}
      storageMode={storageMode}
      mapControls={null}
      shortcutsEnabled
      dialogMouseClickedAtRef={{ current: null }}
      onSaveCurrentAsNewMap={undefined}
      pendingNavigation={null}
      onConsumePendingNavigation={() => {}}
      onSwitchToMapTarget={() => {}}
      brokenLinksDialogRequest={0}
      onBrokenLinksDialogClosed={() => {}}
    />,
  );
}

function editorRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-map-id]")!;
}

async function selectBySearch(user: ReturnType<typeof userEvent.setup>, label: string) {
  const search = screen.getByRole("combobox", { name: "ノードを検索" });
  await user.clear(search);
  await user.type(search, label);
  await user.keyboard("{ArrowDown}{Enter}");
}

function summaryButton(): HTMLElement {
  return screen.getByRole("button", { name: "枝を要約してメモに入れる…" });
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("MapEditor の AI 支援（Phase 32）", () => {
  it("右パネルから要約を作り、採用して適用すると 1 回の Undo で戻る。表示中は根が inert でショートカットも止まる", async () => {
    routeFetch({
      "/api/ai-assist/status": { status: 200, body: STATUS },
      "/api/ai-assist/branch-summary": { status: 200, body: { summary: "子Aと子Bの要約" } },
    });
    await renderEditor();
    const user = userEvent.setup();
    await selectBySearch(user, "ルート");

    await user.click(summaryButton());
    const dialog = await screen.findByRole("dialog", { name: "枝を要約してメモに入れる" });
    await within(dialog).findByText("Anthropic（Claude API）（claude-opus-5-5）");
    expect(editorRoot()).toHaveAttribute("inert");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "送信して提案を作る" }));
    const list = await within(dialog).findByRole("list", { name: "AIの提案" });
    expect(requestBodyOf("/api/ai-assist/branch-summary")).toMatchObject({ branch: { rootId: 1 } });
    expect(within(dialog).getByRole("button", { name: "採用した 0 件を適用" })).toBeDisabled();

    await user.click(within(list).getByRole("radio", { name: "採用" }));
    await user.click(within(dialog).getByRole("button", { name: "採用した 1 件を適用" }));

    expect(screen.queryByRole("dialog", { name: "枝を要約してメモに入れる" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "詳細メモ" })).toHaveValue("子Aと子Bの要約");
    expect(screen.getByText("AIの提案を 1 件適用しました。元に戻すで取り消せます。", { selector: '[role="status"]' })).toBeInTheDocument();
    expect(summaryButton()).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(screen.getByRole("textbox", { name: "詳細メモ" })).toHaveValue("");
  });

  it("コマンドパレットから重要度を提案し、変わるものだけを採用して適用する", async () => {
    routeFetch({
      "/api/ai-assist/status": { status: 200, body: STATUS },
      "/api/ai-assist/importance": {
        status: 200,
        body: { suggestions: [{ id: 2, importance: "high", reason: "主要" }, { id: 3, importance: "medium", reason: "" }] },
      },
    });
    await renderEditor();
    const user = userEvent.setup();
    await selectBySearch(user, "ルート");

    await user.click(screen.getByRole("button", { name: "コマンド" }));
    const input = within(screen.getByRole("dialog", { name: "コマンドパレット" })).getByRole("combobox", { name: "コマンドを検索" });
    fireEvent.change(input, { target: { value: "重要度を提案（AI）" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const dialog = await screen.findByRole("dialog", { name: "重要度を提案" });
    await within(dialog).findByText("Anthropic（Claude API）（claude-opus-5-5）");
    await user.click(within(dialog).getByRole("button", { name: "送信して提案を作る" }));
    const list = await within(dialog).findByRole("list", { name: "AIの提案" });
    expect(requestBodyOf("/api/ai-assist/importance")).toMatchObject({ targetIds: [1, 2, 3] });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("低 → 高")).toBeInTheDocument();

    await user.click(within(list).getByRole("radio", { name: "採用" }));
    await user.click(within(dialog).getByRole("button", { name: "採用した 1 件を適用" }));

    await selectBySearch(user, "子A");
    expect(screen.getByRole("button", { name: "重要度 高" })).toHaveAttribute("aria-pressed", "true");
  });

  it("子を折りたたんでいても、要約には枝の全ノードを送る", async () => {
    routeFetch({
      "/api/ai-assist/status": { status: 200, body: STATUS },
      "/api/ai-assist/branch-summary": { status: 200, body: { summary: "要約" } },
    });
    await renderEditor();
    const user = userEvent.setup();
    await selectBySearch(user, "ルート");
    await user.click(screen.getByRole("button", { name: "コマンド" }));
    const paletteInput = within(screen.getByRole("dialog", { name: "コマンドパレット" })).getByRole("combobox", { name: "コマンドを検索" });
    fireEvent.change(paletteInput, { target: { value: "枝を一括折りたたみ" } });
    fireEvent.keyDown(paletteInput, { key: "Enter" });
    expect(screen.getByRole("button", { name: "枝を一括展開" })).toBeEnabled();

    await user.click(summaryButton());
    const dialog = await screen.findByRole("dialog", { name: "枝を要約してメモに入れる" });
    await user.click(await within(dialog).findByRole("button", { name: "送信して提案を作る" }));
    await within(dialog).findByRole("list", { name: "AIの提案" });
    expect((requestBodyOf("/api/ai-assist/branch-summary") as { branch: { nodes: Array<{ id: number }> } })
      .branch.nodes.map((node) => node.id)).toEqual([1, 2, 3]);
  });

  it("ダイアログ表示中の Ctrl+Z では内容が変わらない", async () => {
    routeFetch({ "/api/ai-assist/status": { status: 200, body: STATUS } });
    await renderEditor();
    const user = userEvent.setup();
    await selectBySearch(user, "ルート");
    await user.click(screen.getByRole("button", { name: "重要度 低" }));
    expect(screen.getByRole("button", { name: "重要度 低" })).toHaveAttribute("aria-pressed", "true");

    await user.click(summaryButton());
    const dialog = await screen.findByRole("dialog", { name: "枝を要約してメモに入れる" });
    await within(dialog).findByText("Anthropic（Claude API）（claude-opus-5-5）");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    expect(screen.getByRole("button", { name: "重要度 低" })).toHaveAttribute("aria-pressed", "true");
  });

  it("コマンドパレットから開いて閉じると、キャンバスのコンテナへフォーカスを戻す", async () => {
    routeFetch({ "/api/ai-assist/status": { status: 200, body: STATUS } });
    await renderEditor();
    const user = userEvent.setup();
    await selectBySearch(user, "ルート");
    await user.click(screen.getByRole("button", { name: "コマンド" }));
    const paletteInput = within(screen.getByRole("dialog", { name: "コマンドパレット" })).getByRole("combobox", { name: "コマンドを検索" });
    fireEvent.change(paletteInput, { target: { value: "枝を要約してメモに入れる（AI）" } });
    fireEvent.keyDown(paletteInput, { key: "Enter" });

    const dialog = await screen.findByRole("dialog", { name: "枝を要約してメモに入れる" });
    await within(dialog).findByText("Anthropic（Claude API）（claude-opus-5-5）");
    await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    expect(document.querySelector('[aria-label="マップキャンバス"]')).toHaveFocus();
  });

  it("設定が無ければ案内と閉じるだけを出す", async () => {
    routeFetch({ "/api/ai-assist/status": { status: 200, body: { available: false } } });
    await renderEditor();
    const user = userEvent.setup();
    await selectBySearch(user, "ルート");

    await user.click(summaryButton());
    const dialog = await screen.findByRole("dialog", { name: "枝を要約してメモに入れる" });
    await within(dialog).findByText(/ANTHROPIC_API_KEY または OPENAI_API_KEY を設定し/);
    expect(within(dialog).getAllByRole("button").map((button) => button.textContent)).toEqual(["閉じる"]);
  });

  it("保護モードでは入口を無効にし、理由を示す", async () => {
    await renderEditor("protected");
    const user = userEvent.setup();
    await selectBySearch(user, "ルート");
    expect(summaryButton()).toBeDisabled();
    expect(summaryButton()).toHaveAccessibleDescription("保護モードのため実行できません");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("複数選択では入口を無効にする", async () => {
    await renderEditor();
    act(() => {
      mockNodePointerHandlers.at(0)?.pointerdown?.(pointer(120, 120));
      mockStageHandlers.pointerup?.(pointer(120, 120));
      mockNodePointerHandlers.at(1)?.pointerdown?.(pointer(240, 200, { ctrlKey: true }));
      mockStageHandlers.pointerup?.(pointer(240, 200, { ctrlKey: true }));
    });
    expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
    expect(summaryButton()).toBeDisabled();
    expect(summaryButton()).toHaveAccessibleDescription("1 件のノードを選んでください");
  });

  it("プレゼン再生中は入口を無効にする", async () => {
    await renderEditor("persistent", seedWithTour());
    fireEvent.click(screen.getAllByRole("button", { name: "プレゼン開始" })[0]!);
    await waitFor(() => expect(summaryButton()).toBeDisabled());
    expect(summaryButton()).toHaveAccessibleDescription("プレゼン再生中は使えません");
  });
});

describe("MapEditor の AI 構造支援（Phase 33・078–081）", () => {
  it("右パネルに 078–081 の 4 ボタンがあり、子候補ダイアログを開ける", async () => {
    routeFetch({
      "/api/ai-assist/status": { status: 200, body: STATUS },
      "/api/ai-assist/child-candidates": { status: 200, body: { candidates: [{ label: "新子" }] } },
    });
    await renderEditor();
    const user = userEvent.setup();
    await selectBySearch(user, "ルート");

    expect(screen.getByRole("button", { name: "子の候補を提案…" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "分類・並べ替えを提案…" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "重複・類似を検出…" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "不足観点を提案…" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "子の候補を提案…" }));
    const dialog = await screen.findByRole("dialog", { name: "子の候補を提案" });
    await user.click(within(dialog).getByRole("button", { name: "送信して提案を作る" }));
    await within(dialog).findByText(/新子/);
  });

  it("関連線選択中は AI 支援の節を出さない", async () => {
    const storage = createTestStorageSession({ initialJson: viewNavigationJsonWithRelation });
    await renderReady(
      <MapEditor
        mapId={storage.session.mapId}
        exportButtonRef={{ current: null }}
        mapMoveTargets={[{ id: storage.session.mapId, name: "テストのマップ", createdAt: "2026-11-25T00:00:00.000Z", updatedAt: "2026-11-25T00:00:00.000Z" }]}
        libraryMeta={createEmptyMapLibraryMeta()}
        onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
        onExtractBranchToNewMap={() => ({ ok: false, notice: { kind: "error", message: "切り出せません。" } })}
        mapName="テストのマップ"
        storageSession={storage.session}
        storageMode="persistent"
        mapControls={null}
        shortcutsEnabled
        dialogMouseClickedAtRef={{ current: null }}
        onSaveCurrentAsNewMap={undefined}
        pendingNavigation={null}
        onConsumePendingNavigation={() => {}}
        onSwitchToMapTarget={() => {}}
        brokenLinksDialogRequest={0}
        onBrokenLinksDialogClosed={() => {}}
      />,
    );
    const relationHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    act(() => relationHandler?.(pointer(150, 80)));
    expect(screen.getByRole("heading", { name: "関連線" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "子の候補を提案…" })).not.toBeInTheDocument();
  });
});
