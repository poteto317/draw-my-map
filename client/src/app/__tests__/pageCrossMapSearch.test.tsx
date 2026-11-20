import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  dialog,
  headerButton,
  renderPage,
  selectNode,
  stageContainer,
  v3Json,
} from "@/app/testing/pageTestHelpers";
import {
  lastWorldContainer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { CONFLICT_SWITCH_MAP_REJECTED_MESSAGE } from "@/domain/mapLibrary/mapConflictMessages";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
import { emitStorageEventForTesting } from "@/services/persistence/storageEventHub";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

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

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  mockDownloadMapJson.mockReset();
});

afterEach(() => jest.restoreAllMocks());

function seedMaps() {
  seedMapLibrary(
    window.localStorage,
    [
      {
        id: "map-a",
        name: "企画マップ",
        updatedAt: "2026-11-19T10:00:00.000Z",
        json: v3Json([
          {
            id: 1,
            parentId: null,
            label: "企画ルート",
            importance: "high",
            x: 100,
            y: 100,
          },
          {
            id: 2,
            parentId: 1,
            label: "隠し子ノード",
            importance: "low",
            note: "企画の詳細なメモキーワード",
            x: 400,
            y: 270,
          },
        ]),
      },
      {
        id: "map-b",
        name: "技術調査",
        updatedAt: "2026-11-19T09:00:00.000Z",
        json: v3Json([
          {
            id: 10,
            parentId: null,
            label: "アーキテクチャ",
            importance: "high",
            tags: ["横断タグ候補"],
            links: ["https://example.com/cross-search-url"],
            x: 120,
            y: 120,
          },
          {
            id: 20,
            parentId: 10,
            label: "データベース設計",
            importance: "low",
            note: "インデックス最適化の記録",
            sources: [{ title: "分散システム出典", page: "42" }],
            x: 400,
            y: 270,
          },
        ]),
      },
    ],
    { currentMapId: "map-a" },
  );
}

function currentMapName(): HTMLElement {
  return screen.getByTestId("current-map-name");
}

function shellNotices() {
  return within(screen.getByTestId("map-library-notices"));
}

describe("全マップ横断検索（ページ統合）", () => {
  it("ラベル・メモ・タグ・URL・出典を横断検索し、他マップのノード選択でマップ切替と選択・フォーカスを実行する", async () => {
    seedMaps();
    // マップ切替で再マウントされる MapStage にも 800x600 の画面サイズを返す
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("cursor-crosshair")) {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 800,
          bottom: 600,
          width: 800,
          height: 600,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalRect.call(this);
    });
    const user = userEvent.setup();
    await renderPage();

    await user.click(headerButton("全マップ検索"));
    const dlg = dialog();
    const input = dlg.getByRole("combobox", { name: "全マップを検索" });
    expect(input).toHaveFocus();

    // メモ一致（現在マップ）
    await user.type(input, "メモキーワード");
    expect(dlg.getByRole("option", { name: /隠し子ノード/ })).toHaveTextContent("メモ");

    // タグ一致（他マップ）
    await user.clear(input);
    await user.type(input, "横断タグ候補");
    expect(dlg.getByRole("option", { name: /アーキテクチャ/ })).toHaveTextContent("タグ");

    // URL 一致（他マップ）
    await user.clear(input);
    await user.type(input, "cross-search-url");
    expect(dlg.getByRole("option", { name: /アーキテクチャ/ })).toHaveTextContent("リンク");

    // 出典一致（他マップ）→ クリックで他マップの特定ノードへ移動
    await user.clear(input);
    await user.type(input, "分散システム出典");
    const matchButton = dlg.getByRole("option", { name: /データベース設計/ });
    expect(matchButton).toHaveTextContent("出典");
    await user.click(matchButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(currentMapName()).toHaveTextContent("マップ: 技術調査");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "詳細メモ" })).toHaveValue("インデックス最適化の記録");
    });
    expect(screen.getByRole("button", { name: "重要度 低" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(-50, 0);
    });
  });

  it("↑/↓ で選んだ候補を aria-activedescendant と aria-selected で伝え、Enter でその候補（他マップのノード）へ移動する", async () => {
    seedMaps();
    const user = userEvent.setup();
    await renderPage();

    await user.click(headerButton("全マップ検索"));
    const input = dialog().getByRole("combobox", { name: "全マップを検索" });
    await user.type(input, "ー");
    const options = () => within(dialog().getByRole("listbox", { name: "検索結果" })).getAllByRole("option");
    const targetIndex = options().findIndex((option) => option.textContent?.includes("データベース設計"));
    expect(targetIndex).toBeGreaterThan(0);
    expect(input).toHaveAttribute("aria-activedescendant", options()[0].id);

    for (let step = 0; step < targetIndex; step += 1) {
      await user.keyboard("{ArrowDown}");
    }
    expect(options()[targetIndex]).toHaveAttribute("aria-selected", "true");
    expect(options()[0]).toHaveAttribute("aria-selected", "false");
    expect(input).toHaveAttribute("aria-activedescendant", options()[targetIndex].id);

    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options()[targetIndex - 1].id);
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(currentMapName()).toHaveTextContent("マップ: 技術調査");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "詳細メモ" })).toHaveValue("インデックス最適化の記録");
    });
  });

  it("現在マップの折りたたみ内・解像度非表示ノードを横断検索で選ぶと自動展開・解像度切替・選択・フォーカスを行う", async () => {
    seedMaps();
    const user = userEvent.setup();
    await renderPage();

    // 親ノードを選んで折りたたみ、表示を高のみにする
    const localSearch = screen.getByRole("combobox", { name: "ノードを検索" });
    await user.type(localSearch, "企画ルート");
    await user.click(screen.getByRole("option", { name: "企画ルート（ルート）" }));
    await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
    await user.click(screen.getByRole("button", { name: "表示 高のみ" }));

    await user.click(headerButton("全マップ検索"));
    const input = dialog().getByRole("combobox", { name: "全マップを検索" });
    await user.type(input, "隠し子ノード");
    await user.click(dialog().getByRole("option", { name: /隠し子ノード/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "表示 すべて" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "重要度 低" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("operation-notices")).toHaveTextContent("祖先の枝を展開しました");
    expect(screen.getByTestId("operation-notices")).toHaveTextContent("表示を『すべて』に切り替えました");
    expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(-50, 0);
  });

  it("アウトライン表示中から横断検索で折りたたみ・解像度非表示の子ノードへ直接ジャンプできる（L-453）", async () => {
    seedMaps();
    const user = userEvent.setup();
    await renderPage();

    // 親を折りたたんで「表示 高のみ」にし、アウトラインへ切り替える（アウトラインでは親を選択したまま）
    const localSearch = screen.getByRole("combobox", { name: "ノードを検索" });
    await user.type(localSearch, "企画ルート");
    await user.click(screen.getByRole("option", { name: "企画ルート（ルート）" }));
    await user.click(screen.getByRole("button", { name: "枝を折りたたむ" }));
    await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
    await user.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.queryByRole("combobox", { name: "ノードを検索" })).not.toBeInTheDocument();

    // アウトライン表示中でも「全マップ検索」から子ノードへ直接ジャンプできる
    await user.click(headerButton("全マップ検索"));
    const input = dialog().getByRole("combobox", { name: "全マップを検索" });
    await user.type(input, "隠し子ノード");
    await user.click(dialog().getByRole("option", { name: /隠し子ノード/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "マップ" })).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.getByRole("button", { name: "表示 すべて" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "重要度 低" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "詳細メモ" })).toHaveValue("企画の詳細なメモキーワード");
    expect(screen.getByTestId("operation-notices")).toHaveTextContent("祖先の枝を展開しました");
  });

  it("Cmd/Ctrl+Shift+F で開き、入力欄や repeat/IME では開かず、閉じるとヘッダーのボタンへフォーカスを戻す（L-397・L-408・L-474・L-522）", async () => {
    seedMaps();
    const user = userEvent.setup();
    await renderPage();

    // repeat / IME では開かない
    fireEvent.keyDown(window, { key: "f", ctrlKey: true, shiftKey: true, repeat: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true, shiftKey: true, isComposing: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // テキスト入力欄では開かない
    const localSearch = screen.getByRole("combobox", { name: "ノードを検索" });
    localSearch.focus();
    fireEvent.keyDown(localSearch, { key: "f", ctrlKey: true, shiftKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // 通常ショートカットで開く
    fireEvent.keyDown(document.body, { key: "F", metaKey: true, shiftKey: true });
    expect(screen.getByRole("dialog", { name: "全マップ検索" })).toBeInTheDocument();
    expect(headerButton("全マップ検索")).toHaveAttribute("aria-expanded", "true");
    // ほかのヘッダーのダイアログを開くボタンと同じく aria-haspopup="dialog" と aria-expanded の組
    expect(headerButton("全マップ検索")).toHaveAttribute("aria-haspopup", "dialog");

    // Escape で閉じてヘッダーボタンへフォーカス復帰
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(headerButton("全マップ検索")).toHaveFocus());
    expect(headerButton("全マップ検索")).toHaveAttribute("aria-expanded", "false");
  });

  it("切替先の対象ノードが既に消えていた場合は alert を出し、pendingNavigation を 1 回限り消費する（L-037）", async () => {
    seedMaps();
    const user = userEvent.setup();
    await renderPage();

    await user.click(headerButton("全マップ検索"));
    const input = dialog().getByRole("combobox", { name: "全マップを検索" });
    await user.type(input, "データベース設計");
    expect(dialog().getByRole("option", { name: /データベース設計/ })).toBeInTheDocument();

    // 検索ダイアログを開いた直後に他タブ等で map-b のノード 20 が消された状況を再現
    window.localStorage.setItem(
      mapBodyKey("map-b"),
      v3Json([{ id: 10, parentId: null, label: "アーキテクチャ", importance: "high", x: 120, y: 120 }]),
    );

    await user.click(dialog().getByRole("option", { name: /データベース設計/ }));

    expect(currentMapName()).toHaveTextContent("マップ: 技術調査");
    await waitFor(() => {
      expect(within(screen.getByTestId("operation-notices")).getByRole("alert")).toHaveTextContent(
        "移動先のノードが見つかりませんでした",
      );
    });

    // その後 JSON 読み込みでノード 20 が再登場しても、pendingNavigation は 1 回限り消費済みのため自動選択されず、古い alert も消える
    const importedJson = v3Json([
      { id: 10, parentId: null, label: "アーキテクチャ", importance: "high", x: 120, y: 120 },
      { id: 20, parentId: 10, label: "再登場したノード", importance: "low", note: "再登場メモ", x: 400, y: 270 },
    ]);
    const file = new File([importedJson], "map.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve(importedJson) });
    await act(async () => {
      fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.queryByText("移動先のノードが見つかりませんでした")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("textbox", { name: "詳細メモ" })).toBeDisabled();
  });

  it("保護モード時は現在マップ限定の案内を出し、現在マップ内のノードのみ検索・移動できる（L-002）", async () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const user = userEvent.setup();
    await renderPage();

    // ノードを追加して詳細メモに検索対象キーワードを書く
    fireEvent.doubleClick(stageContainer(), { clientX: 300, clientY: 200 });
    selectNode(0, 1);
    const noteBox = screen.getByRole("textbox", { name: "詳細メモ" });
    await user.click(noteBox);
    fireEvent.change(noteBox, { target: { value: "保護モード限定のメモ" } });
    fireEvent.blur(noteBox);

    expect(headerButton("マップ一覧")).toBeDisabled();
    expect(headerButton("全マップ検索")).toBeEnabled();

    await user.click(headerButton("全マップ検索"));
    const dlg = dialog();
    expect(dlg.getByText("保護モードのため現在開いているマップのみ検索しています")).toBeInTheDocument();

    await user.type(dlg.getByRole("combobox", { name: "全マップを検索" }), "保護モード限定のメモ");
    await user.click(dlg.getByRole("option", { name: /保護モード限定のメモ/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重要度 中" })).toHaveAttribute("aria-pressed", "true");
  });

  it("複数タブ編集競合中に他マップの検索結果を選ぶと切替を拒否し、shellNotice に alert を出して現在マップに留まる（L-001）", async () => {
    seedMaps();
    const user = userEvent.setup();
    await renderPage();

    // 未保存編集を作り、別タブ更新の storage イベントで競合状態へ入れる
    fireEvent.doubleClick(stageContainer(), { clientX: 500, clientY: 350 });
    const externalBody = v3Json([{ id: 99, parentId: null, label: "別タブ更新", importance: "high", x: 100, y: 100 }]);
    window.localStorage.setItem(mapBodyKey("map-a"), externalBody);
    act(() => {
      emitStorageEventForTesting(
        new StorageEvent("storage", {
          key: mapBodyKey("map-a"),
          newValue: externalBody,
        }),
      );
    });

    await user.click(headerButton("全マップ検索"));
    const input = dialog().getByRole("combobox", { name: "全マップを検索" });
    await user.type(input, "データベース設計");
    await user.click(dialog().getByRole("option", { name: /データベース設計/ }));

    // マップは切り替わらず、シェル通知に alert が出る
    expect(currentMapName()).toHaveTextContent("マップ: 企画マップ");
    await waitFor(() => {
      expect(shellNotices().getByRole("alert")).toHaveTextContent(CONFLICT_SWITCH_MAP_REJECTED_MESSAGE);
    });
  });
});
