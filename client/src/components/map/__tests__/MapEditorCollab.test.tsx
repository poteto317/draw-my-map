import { screen, waitFor } from "@testing-library/react";
import type { ComponentProps, RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { ShareSession } from "@/domain/share/shareSession";
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

const baseNodesJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
  ],
});

type EditorProps = ComponentProps<typeof MapEditor>;

type RenderOptions = {
  storage?: TestStorageSession;
  shareSession?: ShareSession;
  dialogMouseClickedAtRef?: RefObject<number | null>;
};

function editorProps({
  storage = createTestStorageSession({ initialJson: baseNodesJson }),
  shareSession = { userId: "u1", email: "a@example.com" , displayName: null },
  dialogMouseClickedAtRef = { current: null },
}: RenderOptions = {}): EditorProps {
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
    shareSession,
    shareSessionStatus: "ready",
    shareDialogOpen: false,
    onShareDialogOpenChange: () => {},
    onShareRequest: () => {},
    onShareLogin: () => {},
  };
}

async function renderEditor(options?: RenderOptions) {
  const props = editorProps(options);
  await renderReady(<MapEditor {...props} />);
  return props;
}

beforeEach(() => {
  resetMapStageTestRuntime();
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

describe("MapEditor の共同編集配線（Phase 39・L-060）", () => {
  it("ヘッダーに CollabControl 必須 props を配線する", async () => {
    await renderEditor();
    await waitFor(() => {
      expect(screen.getByTestId("collab-control")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: COLLAB_MESSAGES.start })).toBeInTheDocument();
    expect(screen.getByTestId("collab-participants")).toHaveAttribute(
      "data-participants-state",
      "ready",
    );
  });

  it("未ログインでは開始を disabled にする", async () => {
    await renderEditor({ shareSession: null });
    expect(
      screen.getByRole("button", { name: new RegExp(COLLAB_MESSAGES.start) }),
    ).toBeDisabled();
  });

  it("presence 必須 props を PresenceLayer へ配線する（空 Map = 誰も選んでいない）", async () => {
    await renderEditor();
    await waitFor(() => {
      expect(screen.getByTestId("presence-layer")).toBeInTheDocument();
    });
    const layer = screen.getByTestId("presence-layer");
    expect(layer).toHaveAttribute("data-remote-selections-size", "0");
    expect(layer).toHaveAttribute("data-remote-viewports-size", "0");
  });

  it("L-060 外し変異: Control + Presence 必須配線が揃っている（片側だけ成功に倒さない）", async () => {
    await renderEditor();
    await waitFor(() => {
      expect(screen.getByTestId("collab-control")).toBeInTheDocument();
      expect(screen.getByTestId("presence-layer")).toBeInTheDocument();
    });
    // Control 面
    expect(screen.getByTestId("collab-control")).toHaveAttribute("data-collab-status", "idle");
    expect(screen.getByTestId("collab-participants")).toHaveAttribute("data-participants-state");
    // Presence 面（サイズ属性が無い = Maps 未配線）
    const layer = screen.getByTestId("presence-layer");
    expect(layer.getAttribute("data-remote-selections-size")).not.toBeNull();
    expect(layer.getAttribute("data-remote-viewports-size")).not.toBeNull();
  });
});
