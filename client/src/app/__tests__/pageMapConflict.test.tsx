import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { DEFAULT_MAP_NAME } from "@/domain/mapLibrary/mapName";
import {
  CONFLICT_NOTICE_MESSAGE,
  EXTERNALLY_DELETED_NOTICE_MESSAGE,
  EXTERNAL_UPDATE_NOTICE_MESSAGE,
  EXPORT_JSON_BUTTON_LABEL,
  RELOAD_CONFIRM_ACTION_LABEL,
  RELOAD_CONFIRM_CANCEL_LABEL,
  RELOAD_CONFIRM_TITLE,
  RELOAD_EXTERNAL_BUTTON_LABEL,
  RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL,
  RELOAD_SUCCESS_MESSAGE,
  SAVE_AS_COPY_BUTTON_LABEL,
} from "@/domain/mapLibrary/mapConflictMessages";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
import { emitStorageEventForTesting } from "@/services/persistence/storageEventHub";
import { readMapIndex } from "@/testing/mapLibraryTestStorage";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

const mockDownloadMapJson = jest.fn();
const mockExportPng = jest.fn();
const mockExportSvg = jest.fn();
const mockUseMapImageExport = jest.fn();
const mockGenerateIllustration = jest.fn();
const mockDismissGeneration = jest.fn();
const mockUseIllustrationGeneration = jest.fn();
let mockGeneration: IllustrationGenerationState = { status: "idle" };
let mockImageExportNotice: OperationNotice | null = null;
let mockIsExportingPng = false;
let mockMapStageProps: {
  nodes: Node[];
  onSelectNode: (id: number | null) => void;
} | null = null;

jest.mock("@/hooks/useIllustrationGeneration", () => ({
  useIllustrationGeneration: (nodes: readonly Node[], documentRevision: number) => {
    mockUseIllustrationGeneration(nodes, documentRevision);
    return {
      generation: mockGeneration,
      generateIllustration: mockGenerateIllustration,
      dismissGeneration: mockDismissGeneration,
    };
  },
}));

jest.mock("@/hooks/useMapImageExport", () => ({
  useMapImageExport: (options: { nodes: readonly Node[]; mapName?: string }) => {
    mockUseMapImageExport(options);
    return {
      exportPng: mockExportPng,
      exportSvg: mockExportSvg,
      isExportingPng: mockIsExportingPng,
      notice: mockImageExportNotice,
    };
  },
}));

jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return {
    ...actual,
    downloadMapJson: (json: string, mapName: string) => mockDownloadMapJson(json, mapName),
  };
});

jest.mock("@/components/map/MapStage", () => ({
  MapStage: ({
    nodes,
    selectedNodeId,
    onDoubleClick,
    onSelectNode,
  }: {
    nodes: Node[];
    selectedNodeId: number | null;
    onDoubleClick: (x: number, y: number) => void;
    onSelectNode: (id: number | null) => void;
  }) => (
    <div
      data-testid="map-stage"
      ref={() => {
        mockMapStageProps = { nodes, onSelectNode };
      }}
    >
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
      <output data-testid="selected-node-id">{selectedNodeId}</output>
      <button type="button" onClick={() => onDoubleClick(10, 20)}>
        テスト用ノード追加
      </button>
      <button type="button" onClick={() => onSelectNode(nodes[0]?.id ?? null)}>
        テスト用ノード選択
      </button>
    </div>
  ),
}));

const externalJson = `{
  "version": 3,
  "layoutMode": "manual",
  "nodes": [
    {
      "id": 999,
      "parentId": null,
      "x": 100,
      "y": 200,
      "width": 160,
      "height": 64,
      "label": "別タブのノード",
      "importance": "high"
    }
  ]
}\n`;

describe("Home 複数タブ競合結合テスト", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockDownloadMapJson.mockClear();
    mockExportPng.mockClear();
    mockExportSvg.mockClear();
    mockUseMapImageExport.mockClear();
    mockGenerateIllustration.mockClear();
    mockDismissGeneration.mockClear();
    mockUseIllustrationGeneration.mockClear();
    mockGeneration = { status: "idle" };
    mockImageExportNotice = null;
    mockIsExportingPng = false;
    mockMapStageProps = null;
  });

  afterEach(() => {
    // 知見 L-643, L-560: タイマーとスパイの完全復元
    jest.useRealTimers();
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  it("1. 別タブ更新＋未保存編集シナリオ: 自動保存が停止し競合通知バーとバッジが表示される", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<Home />);

    // 初期状態のマップIDを取得
    const indexBefore = readMapIndex(window.localStorage);
    expect(indexBefore).not.toBeNull();
    const currentMapId = indexBefore!.currentMapId;

    // 自タブでノードを追加（未保存編集状態: hasPendingEdits = true）
    await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
    expect(mockMapStageProps?.nodes).toHaveLength(1);

    // 別タブを模してストレージを更新し、storage イベントを発行
    window.localStorage.setItem(mapBodyKey(currentMapId), externalJson);
    act(() => {
      emitStorageEventForTesting(
        new StorageEvent("storage", {
          key: mapBodyKey(currentMapId),
          newValue: externalJson,
        }),
      );
    });

    // 自動保存タイマー（300ms）を進める
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // 自タブによる上書き保存が行われず、別タブの内容が維持されていること
    expect(window.localStorage.getItem(mapBodyKey(currentMapId))).toBe(externalJson);

    // 保存状態バッジが「競合が発生しました」になること
    expect(screen.getByText("競合が発生しました")).toBeInTheDocument();

    // 競合通知バーが表示され、警告メッセージと3つのボタンが表示されること
    expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);
    const noticeBanner = screen.getByTestId("map-conflict-notice");
    expect(within(noticeBanner).getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL })).toBeInTheDocument();
    expect(within(noticeBanner).getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL })).toBeInTheDocument();
    expect(within(noticeBanner).getByRole("button", { name: EXPORT_JSON_BUTTON_LABEL })).toBeInTheDocument();
  });

  it("2. 別名で保存による救出シナリオ: 新マップへ安全に切り替わり元マップの更新が保持される", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<Home />);

    const indexBefore = readMapIndex(window.localStorage);
    const originalMapId = indexBefore!.currentMapId;

    // 自タブでノードを追加
    await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
    const myAddedNode = mockMapStageProps!.nodes[0];

    // 別タブで更新
    window.localStorage.setItem(mapBodyKey(originalMapId), externalJson);
    act(() => {
      emitStorageEventForTesting(
        new StorageEvent("storage", {
          key: mapBodyKey(originalMapId),
          newValue: externalJson,
        }),
      );
    });

    // 競合通知が表示されていることを確認
    expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);

    // 「別名で保存」ボタンをクリックして救出
    const noticeBanner = screen.getByTestId("map-conflict-notice");
    await user.click(within(noticeBanner).getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL }));

    // インデックスを確認: 新マップが作成され、currentMapId が切り替わっていること
    const indexAfter = readMapIndex(window.localStorage);
    expect(indexAfter).not.toBeNull();
    expect(indexAfter!.currentMapId).not.toBe(originalMapId);

    const newMapEntry = indexAfter!.maps.find((m) => m.id === indexAfter!.currentMapId);
    expect(newMapEntry).toBeDefined();
    expect(newMapEntry!.name).toBe(`${DEFAULT_MAP_NAME}（退避）`);

    // 元のマップのストレージ内容が別タブの更新のまま保持されていること
    expect(window.localStorage.getItem(mapBodyKey(originalMapId))).toBe(externalJson);

    // 新マップのストレージ内容に自タブで編集したノードが含まれていること
    const newMapBody = window.localStorage.getItem(mapBodyKey(newMapEntry!.id));
    expect(newMapBody).not.toBeNull();
    const parsedNewMap = JSON.parse(newMapBody!);
    expect(parsedNewMap.nodes).toHaveLength(1);
    expect(parsedNewMap.nodes[0].id).toBe(myAddedNode.id);

    // 競合通知が消え、通常状態に戻っていること
    expect(screen.queryByText(CONFLICT_NOTICE_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText("競合が発生しました")).not.toBeInTheDocument();
  });

  it("3. 未保存編集なし時の最新読込シナリオ: 確認ダイアログなしで最新ノードへ即座に更新される", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const indexBefore = readMapIndex(window.localStorage);
    const currentMapId = indexBefore!.currentMapId;

    // 自タブでは未編集のまま、別タブで更新が発生
    window.localStorage.setItem(mapBodyKey(currentMapId), externalJson);
    act(() => {
      emitStorageEventForTesting(
        new StorageEvent("storage", {
          key: mapBodyKey(currentMapId),
          newValue: externalJson,
        }),
      );
    });

    // 「別タブでこのマップが更新されました」と「最新の内容を読み込む」ボタンが表示されること
    expect(screen.getAllByText(EXTERNAL_UPDATE_NOTICE_MESSAGE).length).toBeGreaterThan(0);
    const noticeBanner = screen.getByTestId("map-conflict-notice");
    const reloadButton = within(noticeBanner).getByRole("button", { name: RELOAD_EXTERNAL_CONTENT_BUTTON_LABEL });
    expect(reloadButton).toBeInTheDocument();

    // ボタンをクリック
    await user.click(reloadButton);

    // 確認ダイアログ（role="dialog"）が表示されず、即座に更新されること
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // stage 上のノードが別タブのノードに更新されていること
    expect(screen.getByTestId("node-state")).toHaveTextContent("別タブのノード");
    expect(screen.getByTestId("node-state")).toHaveTextContent("999");

    // 完了通知が表示されること
    expect(screen.getByText(RELOAD_SUCCESS_MESSAGE)).toBeInTheDocument();

    // 更新通知バーが消えていること
    expect(screen.queryByText(EXTERNAL_UPDATE_NOTICE_MESSAGE)).not.toBeInTheDocument();
  });

  it("4. 別タブ削除シナリオ: 保存バッジが「削除されました」になりメモリ上データから救出できる", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const indexBefore = readMapIndex(window.localStorage);
    const currentMapId = indexBefore!.currentMapId;

    // 自タブでノードを追加
    await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
    expect(mockMapStageProps?.nodes).toHaveLength(1);

    // 別タブでマップ本体が削除されたイベントを発行
    window.localStorage.removeItem(mapBodyKey(currentMapId));
    act(() => {
      emitStorageEventForTesting(
        new StorageEvent("storage", {
          key: mapBodyKey(currentMapId),
          newValue: null,
        }),
      );
    });

    // 保存状態バッジが「削除されました」になること
    expect(screen.getByText("削除されました")).toBeInTheDocument();

    // 削除通知バーが表示されること
    expect(screen.getAllByText(EXTERNALLY_DELETED_NOTICE_MESSAGE).length).toBeGreaterThan(0);
    const noticeBanner = screen.getByTestId("map-conflict-notice");
    expect(within(noticeBanner).getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL })).toBeInTheDocument();
    expect(within(noticeBanner).getByRole("button", { name: EXPORT_JSON_BUTTON_LABEL })).toBeInTheDocument();
    // 削除されているため「最新を読み込む」ボタンは出ない
    expect(within(noticeBanner).queryByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL })).not.toBeInTheDocument();

    // メモリ上のノードデータは維持されていること
    expect(mockMapStageProps?.nodes).toHaveLength(1);

    // 通知バーの「JSON書き出し」による救出が行えること
    await user.click(within(noticeBanner).getByRole("button", { name: EXPORT_JSON_BUTTON_LABEL }));
    expect(mockDownloadMapJson).toHaveBeenCalledTimes(1);
    const downloadedJson = mockDownloadMapJson.mock.calls[0][0];
    expect(JSON.parse(downloadedJson).nodes).toHaveLength(1);

    // 通知バーの「別名で保存」による救出が行え、新マップへ切り替わること
    await user.click(within(noticeBanner).getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL }));
    const indexAfter = readMapIndex(window.localStorage);
    expect(indexAfter).not.toBeNull();
    expect(indexAfter!.currentMapId).not.toBe(currentMapId);
    const rescuedEntry = indexAfter!.maps.find((m) => m.id === indexAfter!.currentMapId);
    expect(rescuedEntry).toBeDefined();
    expect(rescuedEntry!.name).toBe(`${DEFAULT_MAP_NAME}（退避）`);
    const rescuedBody = window.localStorage.getItem(mapBodyKey(rescuedEntry!.id));
    expect(rescuedBody).not.toBeNull();
    expect(JSON.parse(rescuedBody!).nodes).toHaveLength(1);
  });

  it("5. 楽観ロック検証シナリオ: storageイベント未配信でもwriteBody直前の照合で競合を検知する", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<Home />);

    const indexBefore = readMapIndex(window.localStorage);
    const currentMapId = indexBefore!.currentMapId;

    // 自タブでノードを追加
    await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));

    // storage イベントは一切発行せず、ストレージ本体のみを直接別タブによって書き換える
    window.localStorage.setItem(mapBodyKey(currentMapId), externalJson);

    // 自動保存タイマー（300ms）を進めて writeBody を実行させる
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // writeBody 直前の楽観ロック照合により競合が検知され、上書きが阻止されること
    expect(window.localStorage.getItem(mapBodyKey(currentMapId))).toBe(externalJson);

    // 保存状態バッジが「競合が発生しました」になること
    expect(screen.getByText("競合が発生しました")).toBeInTheDocument();

    // 競合通知バーが表示されること
    expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);
    const noticeBanner = screen.getByTestId("map-conflict-notice");
    expect(within(noticeBanner).getByRole("button", { name: SAVE_AS_COPY_BUTTON_LABEL })).toBeInTheDocument();
  });

  it("6. 未保存編集あり時の最新読込（確認ダイアログ・キャンセル・確定置換）シナリオ (Z-04)", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<Home />);

    const indexBefore = readMapIndex(window.localStorage);
    const currentMapId = indexBefore!.currentMapId;

    // 1. 自タブで編集（未保存）
    await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
    expect(mockMapStageProps?.nodes).toHaveLength(1);
    const localNodeId = mockMapStageProps!.nodes[0].id;

    // 2. 別タブ更新イベントを発行 ⇒ 競合状態（conflict）
    window.localStorage.setItem(mapBodyKey(currentMapId), externalJson);
    act(() => {
      emitStorageEventForTesting(
        new StorageEvent("storage", {
          key: mapBodyKey(currentMapId),
          newValue: externalJson,
        }),
      );
    });

    expect(screen.getByText("競合が発生しました")).toBeInTheDocument();
    expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);
    const noticeBanner = screen.getByTestId("map-conflict-notice");
    const reloadBtn = within(noticeBanner).getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL });
    expect(reloadBtn).toBeInTheDocument();

    // 3. 「最新を読み込む」クリック ⇒ 確認モーダル（role="dialog"）表示
    await user.click(reloadBtn);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: RELOAD_CONFIRM_TITLE })).toBeInTheDocument();

    // 4. 「キャンセル」クリック ⇒ モーダル閉じ、自タブの編集と競合状態維持
    const cancelBtn = within(dialog).getByRole("button", { name: RELOAD_CONFIRM_CANCEL_LABEL });
    await user.click(cancelBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockMapStageProps?.nodes[0].id).toBe(localNodeId);
    expect(screen.getByText("競合が発生しました")).toBeInTheDocument();
    expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);

    // 5. 再度「最新を読み込む」→「最新の内容を読み込む（確定）」クリック ⇒ 外部最新ノードへ置換、競合通知消去、完了通知表示
    const noticeBanner2 = screen.getByTestId("map-conflict-notice");
    await user.click(within(noticeBanner2).getByRole("button", { name: RELOAD_EXTERNAL_BUTTON_LABEL }));
    const confirmDialog = screen.getByRole("dialog");
    const confirmBtn = within(confirmDialog).getByRole("button", { name: RELOAD_CONFIRM_ACTION_LABEL });
    await user.click(confirmBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("node-state")).toHaveTextContent("別タブのノード");
    expect(screen.getByTestId("node-state")).toHaveTextContent("999");
    expect(screen.queryByTestId("map-conflict-notice")).not.toBeInTheDocument();
    expect(screen.getByText(RELOAD_SUCCESS_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("保存済み")).toBeInTheDocument();

    // 6. 最新置換後に自タブで再度ノード編集 ⇒ 自動保存タイマーを進めると、正常に保存され（OCC baseline 再同期確認）、保存済みバッジになることを検証
    await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByText("保存済み")).toBeInTheDocument();
    const savedBody = window.localStorage.getItem(mapBodyKey(currentMapId));
    expect(savedBody).not.toBeNull();
    const parsedBody = JSON.parse(savedBody!);
    // 外部ノード(999) + 新規追加ノード の合計2ノードが正常に保存されていること
    expect(parsedBody.nodes).toHaveLength(2);
    expect(parsedBody.nodes.some((n: { id: number }) => n.id === 999)).toBe(true);
  });
});
