import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  dialog,
  exportedMap,
  headerButton,
  redoButton,
  renderPage,
  selectNode,
  undoButton,
  v3Json,
} from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
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

const mockDownloadLibraryBackup = jest.fn();
jest.mock("@/services/persistence/libraryBackupFile", () => {
  const actual = jest.requireActual("@/services/persistence/libraryBackupFile");
  return {
    ...actual,
    downloadLibraryBackup: (json: string, date: Date) => mockDownloadLibraryBackup(json, date),
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
  mockDownloadLibraryBackup.mockReset();
});

afterEach(() => jest.restoreAllMocks());

function mapLinksRegion(): HTMLElement {
  return screen.getByRole("region", { name: "マップ間リンク" });
}

function backlinksRegion(): HTMLElement {
  return screen.getByRole("region", { name: "被リンク" });
}

function currentMapName(): HTMLElement {
  return screen.getByTestId("current-map-name");
}

function backupFile(json: string): File {
  const file = new File([json], "library.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: jest.fn().mockResolvedValue(json) });
  return file;
}

describe("マップ間リンク・被リンク・リンク切れ検出（ページ統合）", () => {
  it("マップ間リンクの追加（Undo/Redo 含む）、詳細メモ未確定下書きの blur→flush 保存付き他マップジャンプ、被リンク逆ジャンプが連動する（L-397）", async () => {
    seedMapLibrary(
      window.localStorage,
      [
        {
          id: "map-a",
          name: "マップA",
          updatedAt: "2026-11-19T10:00:00.000Z",
          json: v3Json([
            { id: 1, parentId: null, label: "出発ノード", importance: "high", x: 100, y: 100 },
          ]),
        },
        {
          id: "map-b",
          name: "マップB",
          updatedAt: "2026-11-19T09:00:00.000Z",
          json: v3Json([
            { id: 10, parentId: null, label: "到着ルート", importance: "high", x: 100, y: 100 },
            { id: 20, parentId: 10, label: "到着ノード", importance: "medium", note: "到着先のメモ", x: 300, y: 100 },
          ]),
        },
      ],
      { currentMapId: "map-a" },
    );

    const user = userEvent.setup();
    await renderPage();
    selectNode(0, 1);

    // マップ間リンクを追加して Undo/Redo を検証
    await user.selectOptions(within(mapLinksRegion()).getByRole("combobox", { name: "対象マップ" }), "map-b");
    await user.selectOptions(within(mapLinksRegion()).getByRole("combobox", { name: "対象ノード（任意）" }), "20");
    await user.click(within(mapLinksRegion()).getByRole("button", { name: "追加" }));

    expect(within(mapLinksRegion()).getByRole("button", { name: "マップB / 到着ノード" })).toBeInTheDocument();
    expect(exportedMap(mockDownloadMapJson).nodes[0].mapLinks).toEqual([
      { targetMapId: "map-b", targetNodeId: 20 },
    ]);

    await user.click(undoButton());
    selectNode(0, 1);
    expect(within(mapLinksRegion()).getByText("マップ間リンクはありません")).toBeInTheDocument();
    await user.click(redoButton());
    selectNode(0, 1);
    expect(within(mapLinksRegion()).getByRole("button", { name: "マップB / 到着ノード" })).toBeInTheDocument();

    // 詳細メモに未確定下書きを入力したまま（300ms 未満・blur 前）マップ間リンクをクリックしてジャンプ
    const noteBox = screen.getByRole("textbox", { name: "詳細メモ" });
    await user.click(noteBox);
    fireEvent.change(noteBox, { target: { value: "移動直前の未確定メモ" } });

    await user.click(within(mapLinksRegion()).getByRole("button", { name: "マップB / 到着ノード" }));

    // マップ B の到着ノード（id: 20）へ移動して選択・フォーカスされる
    expect(currentMapName()).toHaveTextContent("マップ: マップB");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "詳細メモ" })).toHaveValue("到着先のメモ");
    });

    // 元マップ A の未確定メモが blur→flush で保存されている
    const savedA = JSON.parse(window.localStorage.getItem(mapBodyKey("map-a"))!) as {
      nodes: Array<{ id: number; note?: string }>;
    };
    expect(savedA.nodes.find((n) => n.id === 1)?.note).toBe("移動直前の未確定メモ");

    // 到着ノードの「被リンク」にマップ A / 出発ノードが表示され、クリックで逆ジャンプできる
    const backlinkBtn = within(backlinksRegion()).getByRole("button", { name: /出発ノード/ });
    expect(backlinkBtn).toHaveTextContent("マップA");
    expect(backlinkBtn).toHaveTextContent("このノードへ");

    await user.click(backlinkBtn);
    expect(currentMapName()).toHaveTextContent("マップ: マップA");
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "詳細メモ" })).toHaveValue("移動直前の未確定メモ");
    });
  });

  it("リンク切れ検出ダイアログを一覧から開き、閉鎖時にマップ一覧ボタンへフォーカス復帰・参照元へ移動・現在マップのリンク削除ができる（L-035・L-397）", async () => {
    seedMapLibrary(
      window.localStorage,
      [
        {
          id: "map-a",
          name: "マップA",
          updatedAt: "2026-11-19T10:00:00.000Z",
          json: v3Json([
            {
              id: 1,
              parentId: null,
              label: "リンク元A",
              importance: "high",
              x: 100,
              y: 100,
              mapLinks: [
                { targetMapId: "map-b", targetNodeId: 999 }, // ノードなし
                { targetMapId: "map-c" }, // 後で map-c をゴミ箱移動してマップなしにする
              ],
            },
          ]),
        },
        {
          id: "map-b",
          name: "マップB",
          updatedAt: "2026-11-19T09:00:00.000Z",
          json: v3Json([
            {
              id: 10,
              parentId: null,
              label: "リンク元B",
              importance: "high",
              x: 100,
              y: 100,
              mapLinks: [{ targetMapId: "deleted-map" }],
            },
          ]),
        },
        {
          id: "map-c",
          name: "マップC",
          updatedAt: "2026-11-19T08:00:00.000Z",
          json: v3Json([{ id: 30, parentId: null, label: "Cノード", importance: "medium", x: 100, y: 100 }]),
        },
      ],
      { currentMapId: "map-a" },
    );

    const user = userEvent.setup();
    await renderPage();

    // まずマップ C を削除（ゴミ箱移動）する
    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "削除: マップC" }));
    await user.click(dialog().getByRole("button", { name: "このマップを削除" }));

    // 一覧画面の「リンク切れを確認」を押すと一覧が閉じて BrokenMapLinksDialog が開く
    await user.click(dialog().getByRole("button", { name: "リンク切れを確認" }));
    const brokenDlg = screen.getByRole("dialog", { name: "リンク切れの確認" });
    expect(within(brokenDlg).getByRole("status")).toHaveTextContent("3 件のリンク切れが見つかりました");
    expect(within(brokenDlg).getByText("ノードなし")).toBeInTheDocument();
    expect(within(brokenDlg).getAllByText("マップなし")).toHaveLength(2);

    // 現在マップの 2 件には「このリンクを削除」があり、他マップ（マップB）には無い
    expect(within(brokenDlg).getAllByRole("button", { name: "このリンクを削除" })).toHaveLength(2);

    // 閉じる（Escape）でヘッダーの「マップ一覧」ボタンへフォーカスが戻る
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(headerButton("マップ一覧")).toHaveFocus());

    // もう一度開いて現在マップのリンク切れ 1 件を削除する（Undo/Redo 可）
    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "リンク切れを確認" }));
    const brokenDlg2 = screen.getByRole("dialog", { name: "リンク切れの確認" });
    await user.click(within(brokenDlg2).getAllByRole("button", { name: "このリンクを削除" })[0]);
    expect(within(brokenDlg2).getByRole("status")).toHaveTextContent("2 件のリンク切れが見つかりました");

    // 他マップ（マップB）の参照元へ移動ボタンでマップ B へジャンプできる
    const rows = within(brokenDlg2).getAllByRole("listitem");
    const mapBRow = rows.find((row) => row.textContent?.includes("リンク元B"))!;
    await user.click(within(mapBRow).getByRole("button", { name: "参照元へ移動" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(currentMapName()).toHaveTextContent("マップ: マップB");
  });

  it("一括バックアップ＆追加復元後に復元マップの mapLinks.targetMapId が新マップ ID へリマップされる", async () => {
    seedMapLibrary(
      window.localStorage,
      [
        {
          id: "orig-a",
          name: "元マップA",
          updatedAt: "2026-11-19T10:00:00.000Z",
          json: v3Json([
            {
              id: 1,
              parentId: null,
              label: "元Aノード",
              importance: "high",
              x: 100,
              y: 100,
              mapLinks: [{ targetMapId: "orig-b", targetNodeId: 2 }],
            },
          ]),
        },
        {
          id: "orig-b",
          name: "元マップB",
          updatedAt: "2026-11-19T09:00:00.000Z",
          json: v3Json([
            { id: 2, parentId: null, label: "元Bノード", importance: "high", x: 100, y: 100 },
          ]),
        },
      ],
      { currentMapId: "orig-a" },
    );

    const user = userEvent.setup();
    await renderPage();

    // 一括バックアップを実行
    await user.click(headerButton("マップ一覧"));
    await user.click(dialog().getByRole("button", { name: "全マップをバックアップ" }));
    await user.click(dialog().getByRole("button", { name: "ダウンロードを開始" }));
    expect(mockDownloadLibraryBackup).toHaveBeenCalledTimes(1);
    const backupJson = mockDownloadLibraryBackup.mock.lastCall![0] as string;

    // そのまま追加復元
    const input = dialog().getByLabelText("バックアップファイル", { selector: "input" }) as HTMLInputElement;
    await user.upload(input, backupFile(backupJson));
    await waitFor(() => expect(dialog().getByRole("group", { name: "復元を確認" })).toBeInTheDocument());
    await user.click(dialog().getByRole("button", { name: "マップを追加" }));
    await waitFor(() => expect(dialog().getByRole("status")).toHaveTextContent("追加しました"));

    // 新規採番された 2 マップを確認し、復元された A の mapLinks.targetMapId が復元された B の新 ID を指していることを検証
    const index = readMapIndex(window.localStorage)!;
    expect(index.maps).toHaveLength(4);
    const restoredA = index.maps.find((m) => m.id !== "orig-a" && m.name === "元マップA")!;
    const restoredB = index.maps.find((m) => m.id !== "orig-b" && m.name === "元マップB")!;
    expect(restoredA).toBeDefined();
    expect(restoredB).toBeDefined();

    const restoredABody = JSON.parse(window.localStorage.getItem(mapBodyKey(restoredA.id))!) as {
      nodes: Array<{ id: number; mapLinks?: Array<{ targetMapId: string; targetNodeId?: number }> }>;
    };
    expect(restoredABody.nodes[0].mapLinks).toEqual([
      { targetMapId: restoredB.id, targetNodeId: 2 },
    ]);

    // リンク切れ検出を開いても 0 件であること
    await user.click(dialog().getByRole("button", { name: "リンク切れを確認" }));
    const brokenDlg = screen.getByRole("dialog", { name: "リンク切れの確認" });
    expect(within(brokenDlg).getByRole("status")).toHaveTextContent("リンク切れは見つかりませんでした");
    await act(async () => {
      await user.click(within(brokenDlg).getByRole("button", { name: "閉じる" }));
    });
  });
});
