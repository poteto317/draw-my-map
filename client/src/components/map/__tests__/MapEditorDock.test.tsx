import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import { createDefaultDockVisibleSlotIds } from "@/domain/dock/defaultDockLayout";
import { DOCK_SLOT_IDS } from "@/domain/dock/dockSlotCatalog";
import type { BrowserSpeechRecognition } from "@/domain/voice/speechRecognitionAdapter";
import { UI_PREFS_STORAGE_KEY } from "@/services/persistence/uiPrefsStorage";
import { createTestStorageSession, type TestStorageSession } from "@/testing/createTestStorageSession";
import {
  seedUiPrefsDockAllVisible,
  seedUiPrefsDockDefault,
} from "@/testing/seedUiPrefsDockSlots";
import { installNarrowViewportMatchMedia } from "@/testing/mockNarrowViewportMatchMedia";

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

jest.mock("@/domain/voice/speechRecognitionAdapter", () => {
  const actual = jest.requireActual("@/domain/voice/speechRecognitionAdapter");
  return {
    ...actual,
    createSpeechRecognitionAdapter: (callbacks: {
      onFinal: (text: string) => void;
    }) => {
      const handlers: { onresult: ((event: unknown) => void) | null; onend: (() => void) | null } = {
        onresult: null,
        onend: null,
      };
      const recognition = {
        lang: "",
        continuous: false,
        interimResults: false,
        start: jest.fn(() => {
          // listening を維持するため onend は即時に呼ばない
          void callbacks;
        }),
        stop: jest.fn(() => {
          handlers.onend?.();
        }),
        abort: jest.fn(),
        get onresult() { return handlers.onresult; },
        set onresult(v) { handlers.onresult = v; },
        get onerror() { return null; },
        set onerror(_value: unknown) {},
        get onend() { return handlers.onend; },
        set onend(v) { handlers.onend = v; },
      };
      return {
        start: () => recognition.start(),
        stop: () => recognition.stop(),
        dispose: () => recognition.abort(),
      };
    },
    resolveSpeechRecognitionConstructor: () => function MockRecognition(this: BrowserSpeechRecognition) {
      return {} as BrowserSpeechRecognition;
    },
  };
});

const baseNodesJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    {
      id: 1,
      parentId: null,
      label: "ルート",
      importance: "high",
      x: 100,
      y: 100,
      width: 100,
      height: 60,
    },
    {
      id: 2,
      parentId: 1,
      label: "子",
      importance: "low",
      x: 220,
      y: 100,
      width: 100,
      height: 60,
    },
  ],
});

type RenderEditorOptions = {
  storage?: TestStorageSession;
  dialogMouseClickedAtRef?: RefObject<number | null>;
};

function buildEditorProps({
  storage = createTestStorageSession({ initialJson: baseNodesJson }),
  dialogMouseClickedAtRef = { current: null },
}: RenderEditorOptions) {
  return {
    mapId: storage.session.mapId,
    exportButtonRef: { current: null },
    mapMoveTargets: [
      {
        id: storage.session.mapId,
        name: "テストのマップ",
        createdAt: "2026-10-31T00:00:00.000Z",
        updatedAt: "2026-10-31T00:00:00.000Z",
      },
    ],
    libraryMeta: createEmptyMapLibraryMeta(),
    onMoveBranchToMap: () => ({
      ok: false as const,
      notice: { kind: "error" as const, message: "移動先がありません。" },
    }),
    onExtractBranchToNewMap: () => ({
      ok: false as const,
      notice: { kind: "error" as const, message: "切り出せません。" },
    }),
    mapName: "テストのマップ",
    storageSession: storage.session,
    storageMode: "persistent" as const,
    mapControls: null,
    shortcutsEnabled: true,
    dialogMouseClickedAtRef,
    pendingNavigation: null,
    onConsumePendingNavigation: () => {},
    onSwitchToMapTarget: () => {},
    brokenLinksDialogRequest: 0,
    onBrokenLinksDialogClosed: () => {},
    shareSession: null,
    shareSessionStatus: "ready" as const,
    shareDialogOpen: false,
    onShareDialogOpenChange: () => {},
    onShareRequest: () => {},
    onShareLogin: () => {},
  };
}

async function renderEditor(options: RenderEditorOptions = {}) {
  return renderReady(<MapEditor {...buildEditorProps(options)} />);
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  jest.restoreAllMocks();
  // 狭幅テストの matchMedia モックが後続へ残らないように戻す
  installNarrowViewportMatchMedia(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapEditor Dock 配線", () => {
  it("Undo・コマンドが editor-dock にあり、縦 flex 末尾に Dock がある", async () => {
    seedUiPrefsDockDefault();
    await renderEditor();

    const dock = screen.getByTestId("editor-dock");
    expect(dock).toContainElement(screen.getByRole("button", { name: "元に戻す" }));
    expect(dock).toContainElement(screen.getByRole("button", { name: "コマンド" }));
    expect(screen.queryByTestId("header-operations-scroll")).not.toBeInTheDocument();

    const root = document.querySelector<HTMLElement>("[data-map-id]")!;
    const primary = screen.getByTestId("header-primary");
    const workspace = screen.getByRole("main");
    expect(primary.compareDocumentPosition(workspace)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(workspace.compareDocumentPosition(dock)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(root).toContainElement(dock);
  });

  it("既定 visible 以外のスロット（音声・ツアー等）は出ない", async () => {
    seedUiPrefsDockDefault();
    await renderEditor();

    const defaults = new Set(createDefaultDockVisibleSlotIds());
    expect(defaults.has("voiceInput")).toBe(false);
    expect(screen.queryByRole("button", { name: "音声入力" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ツアー" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "JSON書き出し" })).not.toBeInTheDocument();
  });

  it("カスタマイズ open 中は根を inert にして Ctrl+Z・Delete・Ctrl+K がマップを変えない", async () => {
    installNarrowViewportMatchMedia(false);
    seedUiPrefsDockDefault();
    const user = userEvent.setup();
    await renderEditor();

    const search = screen.getByRole("combobox", { name: "ノードを検索" });
    fireEvent.change(search, { target: { value: "子" } });
    fireEvent.focus(search);
    fireEvent.keyDown(search, { key: "Enter" });
    await user.click(screen.getByRole("button", { name: "重要度 高" }));
    expect(screen.getByRole("button", { name: "重要度 高" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "カスタマイズ" }));
    const dialog = screen.getByTestId("dock-customize-dialog");
    const root = document.querySelector<HTMLElement>("[data-map-id]")!;
    // jsdom は inert でイベントを止めないため、属性とショートカット停止を分けて確かめる
    expect(root).toHaveAttribute("inert");
    expect(root.contains(dialog)).toBe(false);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByTestId("dock-customize-dialog")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(root).not.toHaveAttribute("inert");
    // open 中の Undo／Delete が効いていない（重要度は高のまま・履歴も消費されていない）
    expect(screen.getByRole("button", { name: "重要度 高" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeEnabled();
  });

  it("アウトラインではマップ専用（wheelZoom 等）を非マウント", async () => {
    seedUiPrefsDockAllVisible();
    const user = userEvent.setup();
    await renderEditor();

    expect(screen.getByLabelText("ズーム感度")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "アウトライン" }));

    expect(screen.getByTestId("editor-dock")).toBeInTheDocument();
    expect(screen.queryByLabelText("ズーム感度")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "枝を折りたたむ" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "コマンド" })).toBeInTheDocument();
  });

  it("狭幅でも voice は primary に出ず Dock にある", async () => {
    installNarrowViewportMatchMedia(true);
    seedUiPrefsDockAllVisible();
    await renderEditor();

    const primary = screen.getByTestId("header-primary");
    const voice = screen.getByRole("button", { name: "音声入力" });
    expect(primary).not.toContainElement(voice);
    expect(screen.getByTestId("editor-dock")).toContainElement(voice);
  });

  it("カスタマイズ適用 → prefs 再読込で visible／並びが復元される", async () => {
    seedUiPrefsDockDefault();
    const user = userEvent.setup();
    const { unmount } = await renderEditor();

    await user.click(screen.getByRole("button", { name: "カスタマイズ" }));
    const dialog = screen.getByTestId("dock-customize-dialog");
    const voiceCheckbox = within(dialog).getByRole("checkbox", { name: "音声入力" });
    await user.click(voiceCheckbox);
    await user.click(within(dialog).getByRole("button", { name: "適用" }));
    expect(screen.queryByTestId("dock-customize-dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "音声入力" })).toBeInTheDocument();

    const stored = JSON.parse(
      window.localStorage.getItem(UI_PREFS_STORAGE_KEY)!,
    ) as { dockLayout: { visibleSlotIds: string[] } };
    expect(stored.dockLayout.visibleSlotIds).toContain("voiceInput");

    unmount();
    await renderEditor();
    expect(screen.getByRole("button", { name: "音声入力" })).toBeInTheDocument();
  });

  it("DockCustomizeDialog に dialogMouseClickedAtRef を配線する（L-408/L-060）", async () => {
    seedUiPrefsDockDefault();
    const dialogMouseClickedAtRef: RefObject<number | null> = { current: null };
    const user = userEvent.setup();
    await renderEditor({ dialogMouseClickedAtRef });

    await user.click(screen.getByRole("button", { name: "カスタマイズ" }));
    expect(dialogMouseClickedAtRef.current).toBeNull();
    fireEvent.click(screen.getByTestId("dock-customize-dialog"), { detail: 1 });
    expect(dialogMouseClickedAtRef.current).not.toBeNull();
  });

  it("未選択時 Undo は実 disabled（L-058）", async () => {
    seedUiPrefsDockDefault();
    await renderEditor();
    const undo = screen.getByRole("button", { name: "元に戻す" });
    expect(undo).toBeDisabled();
    expect(undo).toHaveAttribute("disabled");
  });

  it("learnMode 付随3ボタンは learningActive のときだけ（§6）", async () => {
    seedUiPrefsDockAllVisible();
    const user = userEvent.setup();
    await renderEditor();

    expect(screen.queryByRole("button", { name: "復習カードを生成" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "復習カード" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "進捗をリセット" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "学習を開始" }));
    expect(screen.getByRole("button", { name: "復習カードを生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "復習カード" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "進捗をリセット" })).toBeInTheDocument();
  });

  it("L-522: Dock フォーカス時 Delete 非発火、コマンド入口上で Ctrl+K 有効", async () => {
    seedUiPrefsDockDefault();
    await renderEditor();

    const cmd = screen.getByRole("button", { name: "コマンド" });
    cmd.focus();
    expect(cmd).toHaveFocus();

    fireEvent.keyDown(cmd, { key: "Delete", bubbles: true });
    // ノードが消えていない（Delete がキャンバスへ届いていない）
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();

    fireEvent.keyDown(cmd, { key: "k", ctrlKey: true, bubbles: true });
    expect(screen.getByRole("dialog", { name: "コマンドパレット" })).toBeInTheDocument();
  });

  it("常時ヒント・コピー案内・折りたたみ補足が編集画面に無い", async () => {
    seedUiPrefsDockAllVisible();
    await renderEditor();

    expect(screen.queryByText(/ノードドラッグで移動/)).not.toBeInTheDocument();
    expect(screen.queryByText(/空白ダブルクリックで追加/)).not.toBeInTheDocument();
    expect(
      screen.queryByText((c) => c.startsWith("枝をコピー: Ctrl/Cmd+C")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("折りたたみは保存・画像出力に反映されません。"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("手動配置へ戻すと元の座標に戻ります。"),
    ).not.toBeInTheDocument();
  });

  it("全 visible 時に代表スロット（既定外含む）が Dock に配線される", async () => {
    seedUiPrefsDockAllVisible();
    const user = userEvent.setup();
    await renderEditor();

    const mapToggle = screen.getByRole("button", { name: "マップ" });
    if (mapToggle.getAttribute("aria-pressed") !== "true") {
      await user.click(mapToggle);
    }

    const dock = screen.getByTestId("editor-dock");
    // overflow していても data-slot-id は primary／その他の両方に付く（開いてから確認）
    const overflow = dock.querySelector<HTMLButtonElement>(
      ".editor-dock__overflow-trigger:not(.editor-dock__overflow-trigger--measure)",
    );
    if (overflow !== null) {
      await user.click(overflow);
    }
    for (const id of [
      "undoRedo",
      "wheelZoom",
      "voiceInput",
      "exportJson",
      "collab",
      "learnMode",
    ] as const) {
      expect(dock.querySelector(`[data-slot-id="${id}"]`)).not.toBeNull();
    }
    expect(DOCK_SLOT_IDS.length).toBe(34);
  });
});

describe("MapEditor Dock listening", () => {
  it("listening 中も Dock の音声停止は到達できる", async () => {
    seedUiPrefsDockAllVisible();
    const user = userEvent.setup();
    await renderEditor();

    await user.click(screen.getByRole("button", { name: "音声入力" }));
    const stop = screen.getByRole("button", { name: "音声入力を停止" });
    expect(stop).toBeInTheDocument();
    const root = document.querySelector<HTMLElement>("[data-map-id]")!;
    expect(root).not.toHaveAttribute("inert");
    expect(root.querySelector(":scope > div[inert]")).toHaveAttribute("inert");
    expect(screen.getByTestId("editor-dock").closest("[inert]")).toBeNull();
    await user.click(stop);
    expect(screen.getByRole("button", { name: "音声入力" })).toBeInTheDocument();
  });
});
