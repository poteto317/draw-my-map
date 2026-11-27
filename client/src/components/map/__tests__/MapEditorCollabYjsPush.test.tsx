import { act, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapDocumentV3 } from "@/types/mapDocument";
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

const mockPushLocalDocumentJson = jest.fn(() => true);
let capturedOnYjsDocument: ((document: MapDocumentV3) => void) | undefined;

jest.mock("@/hooks/useMapEditorCollab", () => ({
  useMapEditorCollab: (options: {
    onYjsDocument?: (document: MapDocumentV3) => void;
  }) => {
    capturedOnYjsDocument = options.onYjsDocument;
    return {
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
    };
  },
}));

const baseNodesJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
  ],
});

type EditorProps = ComponentProps<typeof MapEditor>;

function editorProps(
  dialogMouseClickedAtRef: RefObject<number | null> = { current: null },
): EditorProps {
  const storage = createTestStorageSession({ initialJson: baseNodesJson });
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
    shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
    shareSessionStatus: "ready",
    shareDialogOpen: false,
    onShareDialogOpenChange: () => {},
    onShareRequest: () => {},
    onShareLogin: () => {},
  };
}

beforeEach(() => {
  resetMapStageTestRuntime();
  mockPushLocalDocumentJson.mockClear();
  capturedOnYjsDocument = undefined;
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

describe("MapEditor Yjs 投影 → local push 抑止", () => {
  const projected: MapDocumentV3 = {
    version: 3,
    layoutMode: "manual",
    nodes: [
      {
        id: 1,
        parentId: null,
        label: "リモート更新",
        importance: "high",
        x: 120,
        y: 140,
        width: 100,
        height: 60,
      },
    ],
  };

  it("リモート／Undo 投影では pushLocalDocumentJson しない（COLLAB_LOCAL_ORIGIN 再書込防止）", async () => {
    await renderReady(<MapEditor {...editorProps()} />);
    await waitFor(() => {
      expect(screen.getByTestId("collab-control")).toBeInTheDocument();
    });
    expect(typeof capturedOnYjsDocument).toBe("function");
    mockPushLocalDocumentJson.mockClear();

    act(() => {
      capturedOnYjsDocument?.(projected);
    });

    // 投影由来の revision 同期 effect が走っても push しない
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPushLocalDocumentJson).not.toHaveBeenCalled();
  });

  it("投影後に effect が再走しても snapshot 一致のまま push しない（Strict／deps 再走）", async () => {
    const { rerender } = await renderReady(<MapEditor {...editorProps()} />);
    await waitFor(() => {
      expect(screen.getByTestId("collab-control")).toBeInTheDocument();
    });
    mockPushLocalDocumentJson.mockClear();

    act(() => {
      capturedOnYjsDocument?.(projected);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockPushLocalDocumentJson).not.toHaveBeenCalled();

    // 同じ props で再レンダー → push effect の deps 再評価相当
    await act(async () => {
      rerender(<MapEditor {...editorProps()} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPushLocalDocumentJson).not.toHaveBeenCalled();
  });
});
