import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RefObject } from "react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createTestStorageSession, type TestStorageSession } from "@/testing/createTestStorageSession";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import type { BrowserSpeechRecognition } from "@/domain/voice/speechRecognitionAdapter";

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
  const recognitionRef: { current: (BrowserSpeechRecognition & { emitFinal: (t: string) => void }) | null } = { current: null };
  return {
    ...actual,
    __recognitionRef: recognitionRef,
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
          handlers.onend?.();
        }),
        stop: jest.fn(),
        abort: jest.fn(),
        get onresult() { return handlers.onresult; },
        set onresult(v) { handlers.onresult = v; },
        get onerror() { return null; },
        set onerror(_value) {},
        get onend() { return handlers.onend; },
        set onend(v) { handlers.onend = v; },
        emitFinal(text: string) {
          callbacks.onFinal(text);
        },
      };
      recognitionRef.current = recognition as typeof recognitionRef.current;
      handlers.onresult = (event: unknown) => {
        void event;
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
    { id: 1, parentId: null, label: "ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
  ],
});

type RenderEditorOptions = {
  storage?: TestStorageSession;
  dialogMouseClickedAtRef?: RefObject<number | null>;
};

async function renderEditor({
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
      storageMode="persistent"
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

function editorWorkspaceInert(): HTMLElement | null {
  return editorRoot().querySelector<HTMLElement>(":scope > div[inert]");
}

beforeEach(() => {
  resetMapStageTestRuntime();
});

describe("MapEditor voice input", () => {
  it("音声入力コントロールと interim 表示を配線する（L-060）", async () => {
    await renderEditor();
    expect(screen.getByRole("button", { name: "音声入力" })).toBeInTheDocument();
  });

  it("listening 中はヘッダーの停止が到達でき、編集本体だけ inert（inventory V2）", async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole("button", { name: "音声入力" }));
    const stopButton = screen.getByRole("button", { name: "音声入力を停止" });
    expect(stopButton).toBeInTheDocument();
    expect(editorRoot()).not.toHaveAttribute("inert");
    expect(editorWorkspaceInert()).toHaveAttribute("inert");
    await user.click(stopButton);
    expect(screen.getByRole("button", { name: "音声入力" })).toBeInTheDocument();
  });

  it("listening 中は構造編集の代表ボタンが無効", async () => {
    const user = userEvent.setup();
    await renderEditor();
    await user.click(screen.getByRole("button", { name: "音声入力" }));
    expect(screen.getByRole("button", { name: "枝を複製" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "選択中のノードだけ削除" })).toBeDisabled();
  });
});