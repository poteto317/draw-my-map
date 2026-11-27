import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  mockNodePointerHandlers,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapDocumentV3 } from "@/types/mapDocument";
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

const mockPushLocalDocumentJson = jest.fn(() => true);

jest.mock("@/hooks/useMapEditorCollab", () => ({
  useMapEditorCollab: () => ({
    collabSession: { status: "active" as const, sessionId: "s1", role: "owner" as const },
    participants: [],
    participantsState: "ready" as const,
    remoteSelections: new Map<string, readonly number[]>(),
    remoteViewports: new Map<string, { x: number; y: number }>(),
    notice: null,
    noticeSequence: 0,
    startDisabledReason: null,
    canYjsUndo: false,
    canYjsRedo: false,
    yjsUndo: () => false,
    yjsRedo: () => false,
    pushLocalDocumentJson: mockPushLocalDocumentJson,
    onStartCollab: async () => ({ ok: true as const, value: { sessionId: "s1" } }),
    onLeaveCollab: async () => ({ ok: true as const, value: undefined }),
    onEndCollab: async () => ({ ok: true as const, value: undefined }),
    onRetryCollab: async () => ({ ok: true as const, value: { sessionId: "s1" } }),
    clearNotice: jest.fn(),
  }),
}));

const seedJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
    { id: 2, parentId: 1, label: "子", importance: "medium", x: 300, y: 100, width: 100, height: 60 },
  ],
} satisfies MapDocumentV3);

type EditorProps = ComponentProps<typeof MapEditor>;

function editorProps(
  storage: TestStorageSession,
  dialogMouseClickedAtRef: RefObject<number | null> = { current: null },
): EditorProps {
  return {
    mapId: storage.session.mapId,
    mapName: "テスト",
    storageSession: storage.session,
    storageMode: "persistent",
    mapControls: null,
    exportButtonRef: { current: null },
    mapMoveTargets: [],
    libraryMeta: createEmptyMapLibraryMeta(),
    onMoveBranchToMap: () => ({
      ok: true,
      remounted: false,
      notice: null,
      saveRetryNotice: null,
    }),
    onExtractBranchToNewMap: () => ({
      ok: true,
      remounted: false,
      notice: null,
      saveRetryNotice: null,
    }),
    shortcutsEnabled: true,
    dialogMouseClickedAtRef,
    pendingNavigation: null,
    onConsumePendingNavigation: () => {},
    onSwitchToMapTarget: () => {},
    brokenLinksDialogRequest: 0,
    onBrokenLinksDialogClosed: () => {},
    shareSession: { userId: "u1", email: "a@example.com", displayName: null },
    shareSessionStatus: "ready",
    shareDialogOpen: false,
    onShareDialogOpenChange: () => {},
    onShareRequest: () => {},
    onShareLogin: () => {},
  };
}

function selectNode(indexFromEnd: number) {
  act(() => {
    mockNodePointerHandlers.at(indexFromEnd)?.pointerdown?.(pointer(300, 200));
    mockStageHandlers.pointerup?.(pointer(300, 200));
  });
}

function paletteDialog(): HTMLElement {
  return screen.getByRole("dialog", { name: "コマンドパレット" });
}

async function openPalette() {
  fireEvent.click(screen.getByRole("button", { name: "コマンド" }));
  await waitFor(() => {
    expect(paletteDialog()).toBeInTheDocument();
  });
}

function paletteInput(): HTMLElement {
  return within(paletteDialog()).getByRole("combobox", { name: "コマンドを検索" });
}

beforeEach(() => {
  resetMapStageTestRuntime();
  mockPushLocalDocumentJson.mockClear();
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, value: [] }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete (globalThis as { fetch?: typeof fetch }).fetch;
});

describe("MapEditor P36-E18 / E18b パレット MUTATING 配線", () => {
  it("P36-E18: 共同編集中の単発 MUTATING は Yjs 経由（pushLocalDocumentJson）で localStorage 直書きしない", async () => {
    const storage = createTestStorageSession({ initialJson: seedJson });
    await renderReady(<MapEditor {...editorProps(storage)} />);
    await waitFor(() => {
      expect(screen.getByTestId("collab-control")).toBeInTheDocument();
    });

    storage.writes.length = 0;
    mockPushLocalDocumentJson.mockClear();
    selectNode(-2); // ルート

    fireEvent.click(screen.getByRole("button", { name: "枝を複製" }));

    await waitFor(() => {
      expect(mockPushLocalDocumentJson).toHaveBeenCalled();
    });
    expect(storage.writes).toEqual([]);
  });

  it("P36-E18b: 共同編集中はパレット MUTATING 一括入口を拒否する", async () => {
    const storage = createTestStorageSession({ initialJson: seedJson });
    await renderReady(<MapEditor {...editorProps(storage)} />);
    await waitFor(() => {
      expect(screen.getByTestId("collab-control")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "一括置換" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "枝を移動" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ノードを分割" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ノードを統合" })).toBeDisabled();

    await openPalette();
    const input = paletteInput();
    fireEvent.change(input, { target: { value: "ラベルを一括置換" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(paletteDialog()).toBeInTheDocument();
      expect(within(paletteDialog()).getByRole("status")).toHaveTextContent(
        COLLAB_MESSAGES.blockedByCollab,
      );
    });
    expect(screen.queryByRole("dialog", { name: "一括置換" })).not.toBeInTheDocument();
  });
});
