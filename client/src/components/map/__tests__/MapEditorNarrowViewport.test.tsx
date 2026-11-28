import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createTestStorageSession, type TestStorageSession } from "@/testing/createTestStorageSession";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { MapLibraryOperationResult } from "@/hooks/useMapLibrary";
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

const baseNodesJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
  ],
});

type RenderEditorOptions = {
  storage?: TestStorageSession;
  mapId?: string;
  storageMode?: "persistent" | "protected";
  dialogMouseClickedAtRef?: RefObject<number | null>;
};

function buildEditorProps({
  storage = createTestStorageSession({ initialJson: baseNodesJson }),
  mapId = storage.session.mapId,
  storageMode = "persistent",
  dialogMouseClickedAtRef = { current: null },
}: RenderEditorOptions) {
  return {
    mapId,
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
    onMoveBranchToMap: (): MapLibraryOperationResult => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } }),
    onExtractBranchToNewMap: (): MapLibraryOperationResult => ({ ok: false, notice: { kind: "error", message: "切り出せません。" } }),
    mapName: "テストのマップ",
    storageSession: storage.session,
    storageMode,
    mapControls: null,
    shortcutsEnabled: true,
    dialogMouseClickedAtRef,
    onSaveCurrentAsNewMap: undefined,
    pendingNavigation: null,
    onConsumePendingNavigation: () => {},
    onSwitchToMapTarget: () => {},
    brokenLinksDialogRequest: 0,
    onBrokenLinksDialogClosed: () => {},
    shareSession: null,
    shareSessionStatus: "ready",
    shareDialogOpen: false,
    onShareDialogOpenChange: () => {},
    onShareRequest: () => {},
    onShareLogin: () => {},
  } as const;
}

async function renderEditor(options: RenderEditorOptions = {}) {
  return renderReady(<MapEditor {...buildEditorProps(options)} />);
}

beforeEach(() => {
  resetMapStageTestRuntime();
});

describe("MapEditor narrow viewport", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("狭幅で outline を既定にする（M1）", async () => {
    installNarrowViewportMatchMedia(true);
    await renderEditor();
    expect(screen.getByRole("button", { name: "アウトライン" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "アウトライン" })).toBeInTheDocument();
  });

  it("狭幅でユーザーがマップ選択後は再狭幅でも上書きしない（M2）", async () => {
    const media = installNarrowViewportMatchMedia(true);
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole("button", { name: "マップ" }));
    expect(screen.getByRole("button", { name: "マップ" })).toHaveAttribute("aria-pressed", "true");
    act(() => {
      media.setMatches(false);
      media.setMatches(true);
    });
    expect(screen.getByRole("button", { name: "マップ" })).toHaveAttribute("aria-pressed", "true");
  });

  it("狭→広で強制マップ復帰しない", async () => {
    const media = installNarrowViewportMatchMedia(true);
    await renderEditor();
    expect(screen.getByRole("button", { name: "アウトライン" })).toHaveAttribute("aria-pressed", "true");
    act(() => {
      media.setMatches(false);
    });
    expect(screen.getByRole("button", { name: "アウトライン" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "アウトライン" })).toBeInTheDocument();
  });

  it("mapId 変更で userChoseMapOnNarrow をリセットし outline 既定へ戻す", async () => {
    installNarrowViewportMatchMedia(true);
    const user = userEvent.setup();
    const storageA = createTestStorageSession({ initialJson: baseNodesJson, mapId: "narrow-map-a" });
    const storageB = createTestStorageSession({ initialJson: baseNodesJson, mapId: "narrow-map-b" });
    const { rerender } = await renderReady(<MapEditor {...buildEditorProps({ storage: storageA, mapId: storageA.session.mapId })} />);
    await user.click(screen.getByRole("button", { name: "マップ" }));
    expect(screen.getByRole("banner")).toHaveAttribute("data-user-chose-map-on-narrow", "true");
    rerender(<MapEditor {...buildEditorProps({ storage: storageB, mapId: storageB.session.mapId })} />);
    await waitFor(() => {
      expect(screen.getByRole("banner")).toHaveAttribute("data-user-chose-map-on-narrow", "false");
    });
    expect(screen.getByRole("button", { name: "アウトライン" })).toHaveAttribute("aria-pressed", "true");
  });

  it("保護モード再構築で userChoseMapOnNarrow をリセットする", async () => {
    installNarrowViewportMatchMedia(true);
    const user = userEvent.setup();
    const { rerender } = await renderEditor({ storageMode: "persistent" });
    await user.click(screen.getByRole("button", { name: "マップ" }));
    expect(screen.getByRole("banner")).toHaveAttribute("data-user-chose-map-on-narrow", "true");
    rerender(<MapEditor {...buildEditorProps({ storageMode: "protected" })} />);
    await waitFor(() => {
      expect(screen.getByRole("banner")).toHaveAttribute("data-user-chose-map-on-narrow", "false");
    });
    expect(screen.getByRole("button", { name: "アウトライン" })).toHaveAttribute("aria-pressed", "true");
  });

  it("狭幅でプレゼン自動マップ切替は userChoseMapOnNarrow を立てない（§5.2）", async () => {
    installNarrowViewportMatchMedia(true);
    const user = userEvent.setup();
    const base = JSON.parse(baseNodesJson) as Record<string, unknown>;
    const withTour = JSON.stringify({
      ...base,
      tour: {
        version: 1,
        title: "案内",
        steps: [{
          id: "step-1",
          snapshot: {
            viewport: { offsetX: 0, offsetY: 0, scale: 1 },
            selectedNodeId: null,
            selectedNodeIds: [],
            focusRootId: null,
            collapsedNodeIds: [],
            resolutionMode: "auto",
            autoResolutionLevel: "all",
          },
        }],
      },
    });
    await renderEditor({ storage: createTestStorageSession({ initialJson: withTour }) });
    expect(screen.getByRole("button", { name: "アウトライン" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "プレゼン開始" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "マップ" })).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.getByRole("banner")).toHaveAttribute("data-user-chose-map-on-narrow", "false");
  });

  it("L-060: Voice と Header に狭幅 props を配線する", async () => {
    installNarrowViewportMatchMedia(true);
    await renderEditor();
    const banner = screen.getByRole("banner");
    expect(banner).toHaveAttribute("data-narrow-viewport", "true");
    expect(banner).toHaveAttribute("data-user-chose-map-on-narrow", "false");
    const voiceHost = screen.getByTestId("voice-input-control-host");
    expect(voiceHost).toHaveAttribute("data-narrow-viewport", "true");
    expect(voiceHost).toHaveAttribute("data-user-chose-map-on-narrow", "false");
  });

  it("狭幅ヘッダーは横スクロールし先頭付近に表示モード・保存があり、音声は Dock（M3）", async () => {
    installNarrowViewportMatchMedia(true);
    await renderEditor();
    const primary = screen.getByTestId("header-primary");
    expect(primary).toHaveClass("overflow-x-auto");
    expect(primary).not.toHaveClass("flex-wrap");
    const viewControls = screen.getByRole("group", { name: "表示モード" });
    const voiceButton = screen.getByRole("button", { name: "音声入力" });
    const saveStatus = screen.getByRole("status", { name: "保存状態: 保存済み" });
    expect(primary).toContainElement(viewControls);
    expect(primary).toContainElement(saveStatus);
    expect(primary).not.toContainElement(voiceButton);
    expect(screen.getByTestId("editor-dock")).toContainElement(voiceButton);
    expect(viewControls.compareDocumentPosition(saveStatus)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});