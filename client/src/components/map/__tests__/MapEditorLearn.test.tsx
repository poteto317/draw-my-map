import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createTestStorageSession, type TestStorageSession } from "@/testing/createTestStorageSession";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";

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
    { id: 2, parentId: 1, label: "子", importance: "low", x: 220, y: 100, width: 100, height: 60 },
  ],
});

function jsonWithTour(offsets: number[]) {
  const base = JSON.parse(baseNodesJson) as Record<string, unknown>;
  return JSON.stringify({
    ...base,
    tour: {
      version: 1,
      title: "案内",
      steps: offsets.map((offsetX, index) => ({
        id: `step-${index + 1}`,
        snapshot: {
          viewport: { offsetX, offsetY: 0, scale: 1 },
          selectedNodeId: 1,
          selectedNodeIds: [1],
          focusRootId: null,
          collapsedNodeIds: [],
          resolutionMode: "auto",
          autoResolutionLevel: "all",
        },
      })),
    },
  });
}

type RenderEditorOptions = {
  storageMode?: "persistent" | "protected";
  storage?: TestStorageSession;
  dialogMouseClickedAtRef?: RefObject<number | null>;
};

async function renderEditor({
  storageMode = "persistent",
  storage = createTestStorageSession({ initialJson: baseNodesJson }),
  dialogMouseClickedAtRef = { current: null },
}: RenderEditorOptions = {}) {
  return renderReady(
    <MapEditor
      mapId={storage.session.mapId}
      exportButtonRef={{ current: null }}
      mapMoveTargets={[
        {
          id: storage.session.mapId,
          name: "テストのマップ",
          createdAt: "2026-10-31T00:00:00.000Z",
          updatedAt: "2026-10-31T00:00:00.000Z",
        },
      ]}
      libraryMeta={createEmptyMapLibraryMeta()}
      onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
      onExtractBranchToNewMap={() => ({ ok: false, notice: { kind: "error", message: "切り出せません。" } })}
      mapName="テストのマップ"
      storageSession={storage.session}
      storageMode={storageMode}
      mapControls={null}
      shortcutsEnabled
      dialogMouseClickedAtRef={dialogMouseClickedAtRef}
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

function learnButton(): HTMLElement {
  return screen.getByRole("button", { name: "学習を開始" });
}

function presentationStartButton(): HTMLElement {
  return screen.getAllByRole("button", { name: "プレゼン開始" })[0]!;
}

beforeEach(() => {
  resetMapStageTestRuntime();
});

describe("MapEditor learn mode", () => {
  it("学習開始後は根 inert なし・終了で戻る（inventory §0）", async () => {
    await renderEditor();
    const user = userEvent.setup();
    await user.click(learnButton());
    expect(screen.getByRole("button", { name: "学習を終了" })).toBeInTheDocument();
    expect(editorRoot()).not.toHaveAttribute("inert");
    await user.click(screen.getByRole("button", { name: "学習を終了" }));
    expect(learnButton()).toBeInTheDocument();
  });

  it("学習中はプレゼン開始不可、プレゼン中は学習開始不可（L1 相互排他）", async () => {
    const user = userEvent.setup();
    const storage = createTestStorageSession({ initialJson: jsonWithTour([0]) });
    await renderEditor({ storage });
    await user.click(learnButton());
    expect(presentationStartButton()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "学習を終了" }));
    await user.click(presentationStartButton());
    expect(learnButton()).toBeDisabled();
  });

  it("学習中は構造編集の代表ボタンが無効", async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(learnButton());
    expect(screen.getByRole("button", { name: "枝の階層を下げる" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "選択中のノードだけ削除" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "元に戻す" })).toBeDisabled();
  });

  it("保護中は進捗リセット不可", async () => {
    const user = userEvent.setup();
    await renderEditor({ storageMode: "protected" });
    await user.click(learnButton());
    const reset = screen.getByRole("button", { name: "進捗をリセット" });
    expect(reset).toBeDisabled();
  });
});