import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Text } from "pixi.js";
import type { ComponentProps, RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  mockNodePointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import { CONFLICT_NOTICE_MESSAGE } from "@/domain/mapLibrary/mapConflictMessages";
import type { ShareCommentListValue, ShareCommentThreadView } from "@/domain/share/shareComment";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import type { ShareSession } from "@/domain/share/shareSession";
import type { BrowserSpeechRecognition } from "@/domain/voice/speechRecognitionAdapter";
import { mapBodyKey } from "@/services/persistence/mapLibraryStorage";
import { writeShareLocalMetaForMap } from "@/services/persistence/shareLocalMetaStorage";
import { createTestStorageSession, type TestStorageSession } from "@/testing/createTestStorageSession";

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

// listening のまま止まる音声入力（MapEditorVoice.test と同じ差し替え）
jest.mock("@/domain/voice/speechRecognitionAdapter", () => {
  const actual = jest.requireActual("@/domain/voice/speechRecognitionAdapter");
  return {
    ...actual,
    createSpeechRecognitionAdapter: () => ({
      start: jest.fn(),
      stop: jest.fn(),
      dispose: jest.fn(),
    }),
    resolveSpeechRecognitionConstructor: () => function MockRecognition(this: BrowserSpeechRecognition) {
      return {} as BrowserSpeechRecognition;
    },
  };
});

const SHARED_MAP_ID = "sm-1";
const OWNER: ShareSession = { userId: "u1", email: "a@example.com", displayName: null };
const COMMENTS_URL = `/api/share/maps/${SHARED_MAP_ID}/comment-threads`;

const baseNodesJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
  ],
});

function jsonWithTour(): string {
  const base = JSON.parse(baseNodesJson) as Record<string, unknown>;
  return JSON.stringify({
    ...base,
    tour: {
      version: 1,
      title: "案内",
      steps: [{
        id: "step-1",
        snapshot: {
          viewport: { offsetX: 0, offsetY: 0, scale: 1 },
          selectedNodeId: 1,
          selectedNodeIds: [1],
          focusRootId: null,
          collapsedNodeIds: [],
          resolutionMode: "auto",
          autoResolutionLevel: "all",
        },
      }],
    },
  });
}

function openThread(nodeId: number): ShareCommentThreadView {
  return {
    id: `t-${nodeId}`,
    nodeId,
    nodeLabelSnapshot: "ルート",
    status: "open",
    resolvedByName: null,
    resolvedAt: null,
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
    canResolve: true,
    comments: [{
      id: `c-${nodeId}`,
      authorName: "所有者",
      body: "確認してください",
      createdAt: "2026-11-27T00:00:00.000Z",
      canDelete: true,
    }],
  };
}

function listValue(threads: readonly ShareCommentThreadView[]): ShareCommentListValue {
  return { threads, viewer: { signedIn: true, canPost: true, isOwner: true } };
}

type ListResponse = { status: number; body: unknown };

let listResponse: ListResponse;
let fetchMock: jest.Mock;

function respondList(threads: readonly ShareCommentThreadView[]) {
  listResponse = { status: 200, body: { ok: true, value: listValue(threads) } };
}

function markShared(mapId: string) {
  writeShareLocalMetaForMap(window.localStorage, mapId, {
    sharedMapId: SHARED_MAP_ID,
    lastPublishedAt: "2026-11-27T00:00:00.000Z",
    linkActive: true,
  });
}

type EditorProps = ComponentProps<typeof MapEditor>;

type RenderOptions = {
  storage?: TestStorageSession;
  storageMode?: "persistent" | "protected";
  shareSession?: ShareSession;
  shareSessionStatus?: "loading" | "ready";
  onShareLogin?: () => void;
  dialogMouseClickedAtRef?: RefObject<number | null>;
};

function editorProps({
  storage = createTestStorageSession({ initialJson: baseNodesJson }),
  storageMode = "persistent",
  shareSession = OWNER,
  shareSessionStatus = "ready",
  onShareLogin = jest.fn(),
  dialogMouseClickedAtRef = { current: null },
}: RenderOptions = {}): EditorProps {
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
    onMoveBranchToMap: () => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } }),
    onExtractBranchToNewMap: () => ({ ok: false, notice: { kind: "error", message: "切り出せません。" } }),
    mapName: "テストのマップ",
    storageSession: storage.session,
    storageMode,
    mapControls: null,
    shortcutsEnabled: true,
    dialogMouseClickedAtRef,
    pendingNavigation: null,
    onConsumePendingNavigation: () => {},
    onSwitchToMapTarget: () => {},
    brokenLinksDialogRequest: 0,
    onBrokenLinksDialogClosed: () => {},
    shareSession,
    shareSessionStatus,
    shareDialogOpen: false,
    onShareDialogOpenChange: () => {},
    onShareRequest: () => {},
    onShareLogin,
  };
}

async function renderEditor(options: RenderOptions = {}) {
  const storage = options.storage ?? createTestStorageSession({ initialJson: baseNodesJson });
  const props = editorProps({ ...options, storage });
  const rendered = await renderReady(<MapEditor {...props} />);
  mockStageBounds(document.querySelector<HTMLElement>(".cursor-crosshair")!);
  return { ...rendered, props, storage };
}

function commentsButton(): HTMLElement {
  return screen.getByRole("button", { name: /^コメント(（.*）)?$/ });
}

function commentsDialog(): HTMLElement {
  return screen.getByTestId("map-comments-dialog");
}

function selectRootNode() {
  act(() => {
    mockNodePointerHandlers.at(0)?.pointerdown?.(pointer(120, 120));
    mockStageHandlers.pointerup?.(pointer(120, 120));
  });
}

function openNodeCommentsButton(): HTMLElement {
  return screen.getByRole("button", { name: /^コメントを開く/ });
}

/** コメント件数バッジ（白・fontSize 9 の Text）として描いた文字列 */
function commentBadgeTexts(): string[] {
  const calls = (Text as unknown as jest.Mock).mock.calls as Array<
    [{ text?: string; style?: { fontSize?: number; fill?: number } } | undefined]
  >;
  return calls
    .map(([options]) => options)
    .filter((options) => options?.style?.fontSize === 9 && options.style.fill === 0xffffff)
    .map((options) => String(options?.text));
}

function commentListCalls(): number {
  return fetchMock.mock.calls.filter(([input, init]) =>
    String(input) === COMMENTS_URL && (init as RequestInit | undefined)?.method === "GET").length;
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
  respondList([]);
  fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === COMMENTS_URL) {
      return { ok: listResponse.status < 400, status: listResponse.status, json: async () => listResponse.body };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, value: [] }) };
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  window.localStorage.clear();
  delete (globalThis as { fetch?: typeof fetch }).fetch;
});

describe("MapEditor のコメント配線（Phase 38・L-060）", () => {
  it("未共有では「コメント」を未共有の理由で無効にし、一覧を取得しない", async () => {
    await renderEditor();
    const button = commentsButton();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", SHARE_COMMENT_MESSAGES.notSharedDisabled);
    expect(button).toHaveAccessibleName(`コメント（${SHARE_COMMENT_MESSAGES.notSharedDisabled}）`);
    expect(commentListCalls()).toBe(0);
  });

  it("未ログインかつ未共有では、未共有の理由を優先して無効にする", async () => {
    await renderEditor({ shareSession: null });
    expect(commentsButton()).toBeDisabled();
    expect(commentsButton()).toHaveAttribute("title", SHARE_COMMENT_MESSAGES.notSharedDisabled);
  });

  it("未ログインかつ共有中なら有効で、ダイアログ内のログイン導線から onShareLogin を呼ぶ", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    const onShareLogin = jest.fn();
    await renderEditor({ storage, shareSession: null, onShareLogin });
    expect(commentsButton()).toBeEnabled();
    await user.click(commentsButton());
    const dialog = commentsDialog();
    expect(within(dialog).getByText(SHARE_COMMENT_MESSAGES.loginRequired)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: SHARE_COMMENT_MESSAGES.loginButton }));
    expect(onShareLogin).toHaveBeenCalledTimes(1);
    expect(commentListCalls()).toBe(0);
  });

  it("共有中なら有効で、ヘッダーから開くと絞り込みは「すべて」", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    expect(commentsButton()).toBeEnabled();
    expect(commentsButton()).toHaveAttribute("aria-expanded", "false");
    await user.click(commentsButton());
    const dialog = commentsDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("radio", { name: SHARE_COMMENT_MESSAGES.filterAll })).toBeChecked();
    expect(commentsButton()).toHaveAttribute("aria-expanded", "true");
  });

  it("一覧 ready・0 件でも右パネルに節と「コメントを開く」を出し、開くと絞り込みは「選択中のノード」", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    selectRootNode();
    const section = await screen.findByRole("region", { name: SHARE_COMMENT_MESSAGES.title });
    expect(section).toHaveTextContent("コメント: 未解決 0 / 解決済み 0");
    await user.click(within(section).getByRole("button", { name: SHARE_COMMENT_MESSAGES.openComments }));
    const dialog = commentsDialog();
    expect(within(dialog).getByRole("radio", { name: SHARE_COMMENT_MESSAGES.filterSelected })).toBeChecked();
  });

  it("学習中はヘッダーと右パネルの入口を理由付きで無効にする", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    selectRootNode();
    await screen.findByRole("region", { name: SHARE_COMMENT_MESSAGES.title });
    await user.click(screen.getByRole("button", { name: "学習を開始" }));
    const reason = "学習モード中はコメントを開けません。";
    expect(commentsButton()).toBeDisabled();
    expect(commentsButton()).toHaveAttribute("title", reason);
    expect(openNodeCommentsButton()).toBeDisabled();
    expect(openNodeCommentsButton()).toHaveAttribute("title", reason);
  });

  it("プレゼン再生中はヘッダーと右パネルの入口を理由付きで無効にする", async () => {
    const storage = createTestStorageSession({ initialJson: jsonWithTour() });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    selectRootNode();
    await screen.findByRole("region", { name: SHARE_COMMENT_MESSAGES.title });
    fireEvent.click(screen.getAllByRole("button", { name: "プレゼン開始" })[0]!);
    const reason = "プレゼン再生中はコメントを開けません。";
    await waitFor(() => expect(commentsButton()).toBeDisabled());
    expect(commentsButton()).toHaveAttribute("title", reason);
    expect(openNodeCommentsButton()).toBeDisabled();
    expect(openNodeCommentsButton()).toHaveAttribute("title", reason);
  });

  it("保護モードでも開ける", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage, storageMode: "protected" });
    expect(commentsButton()).toBeEnabled();
    await user.click(commentsButton());
    expect(commentsDialog()).toBeInTheDocument();
  });

  it("競合中でも開ける", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    fireEvent.doubleClick(document.querySelector<HTMLElement>(".cursor-crosshair")!, { clientX: 300, clientY: 200 });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: mapBodyKey(storage.session.mapId),
        newValue: "{}\n",
      }));
    });
    expect(screen.getAllByText(CONFLICT_NOTICE_MESSAGE).length).toBeGreaterThan(0);
    expect(commentsButton()).toBeEnabled();
    await user.click(commentsButton());
    expect(commentsDialog()).toBeInTheDocument();
  });

  it("listening 中に開くと音声入力を止める", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    await user.click(screen.getByRole("button", { name: "音声入力" }));
    expect(screen.getByRole("button", { name: "音声入力を停止" })).toBeInTheDocument();
    await user.click(commentsButton());
    expect(commentsDialog()).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "音声入力を停止" })).not.toBeInTheDocument();
    });
  });

  it("ダイアログ表示中は編集ショートカット（Tab で子追加）が効かない", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    selectRootNode();
    await user.click(commentsButton());
    expect(commentsDialog()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Tab" });
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("map-comments-dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
    // 対照: ダイアログが無ければ同じ操作で子が追加される
    selectRootNode();
    fireEvent.keyDown(window, { key: "Tab" });
    await waitFor(() => expect(screen.getByRole("button", { name: "元に戻す" })).toBeEnabled());
  });

  it("一覧 ready で未解決件数のバッジを MapStage に渡す", async () => {
    respondList([openThread(1)]);
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    await waitFor(() => expect(commentBadgeTexts()).toContain("1"));
  });

  it("一覧 error ではバッジも右パネルの節も出さない", async () => {
    listResponse = { status: 404, body: { ok: false, reason: "not-found" } };
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    await waitFor(() => expect(commentListCalls()).toBeGreaterThan(0));
    selectRootNode();
    await act(async () => {
      await Promise.resolve();
    });
    expect(commentBadgeTexts()).toEqual([]);
    expect(screen.queryByRole("region", { name: SHARE_COMMENT_MESSAGES.title })).not.toBeInTheDocument();
  });

  it("mapId を切り替えるとダイアログを閉じる", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    const { props, rerender } = await renderEditor({ storage });
    await user.click(commentsButton());
    expect(commentsDialog()).toBeInTheDocument();
    const nextStorage = createTestStorageSession({ mapId: "other-map", initialJson: baseNodesJson });
    await act(async () => {
      rerender(
        <MapEditor
          {...props}
          mapId={nextStorage.session.mapId}
          storageSession={nextStorage.session}
        />,
      );
      await Promise.resolve();
    });
    expect(screen.queryByTestId("map-comments-dialog")).not.toBeInTheDocument();
  });

  it("閉じるとフォーカスを「コメント」ボタンへ戻す", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: baseNodesJson });
    markShared(storage.session.mapId);
    await renderEditor({ storage });
    await user.click(commentsButton());
    expect(commentsDialog()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("map-comments-dialog")).not.toBeInTheDocument();
    expect(commentsButton()).toHaveFocus();
  });
});
