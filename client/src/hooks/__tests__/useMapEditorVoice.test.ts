import { act, renderHook, waitFor } from "@testing-library/react";
import type { InsertForestResult } from "@/hooks/useNodes";
import { useMapEditorVoice } from "@/hooks/useMapEditorVoice";
import { MAP_VOICE_MESSAGES } from "@/domain/map/mapVoiceGuards";
import { nodesSelection } from "@/domain/map/mapCanvasSelectionGuards";
import type { BrowserSpeechRecognition } from "@/domain/voice/speechRecognitionAdapter";

function createRecognitionMock() {
  const handlers: { onresult: ((event: unknown) => void) | null; onend: (() => void) | null } = {
    onresult: null,
    onend: null,
  };
  const recognition: BrowserSpeechRecognition & { emitFinal: (text: string) => void } = {
    lang: "",
    continuous: false,
    interimResults: false,
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    get onresult() { return handlers.onresult; },
    set onresult(v) { handlers.onresult = v; },
    get onerror() { return null; },
    set onerror(_value) {},
    get onend() { return handlers.onend; },
    set onend(v) { handlers.onend = v; },
    emitFinal(text: string) {
      handlers.onresult?.({
        results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } },
      });
    },
  };
  return recognition;
}

const baseStartGuard = {
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
  learningActive: false,
  playingPresentation: false,
  modalBlockingVoiceStart: false,
  canvasSelection: nodesSelection([]),
  relationPartnerOpen: false,
};

describe("useMapEditorVoice", () => {
  it("排他入室で stopForExclusive を呼び通知する", async () => {
    const recognition = createRecognitionMock();
    const { result, rerender } = renderHook(
      (exclusiveStopRequested: boolean) => useMapEditorVoice({
        mapId: "map-1",
        documentRevision: 1,
        insertForest: jest.fn(() => ({ ok: true, rootId: 1, count: 1 })) as never,
        selectNode: jest.fn(),
        selectedNodeId: null,
        selectedNodeIds: [],
        startGuard: baseStartGuard,
        exclusiveStopRequested,
        adapterOptions: { createInstance: () => recognition },
      }),
      { initialProps: false },
    );
    act(() => {
      expect(result.current.startVoiceFromPalette()).toBe(true);
    });
    act(() => {
      rerender(true);
    });
    await waitFor(() => {
      expect(result.current.listening).toBe(false);
      expect(result.current.voiceNotice?.message).toBe(MAP_VOICE_MESSAGES.stoppedExclusive);
    });
  });

  it("insert 失敗時は formatOutlineInsertFailure の文言を出す", () => {
    const recognition = createRecognitionMock();
    const insertForest = jest.fn<InsertForestResult, unknown[]>(() => ({
      ok: false,
      reason: "parent-missing",
    }));
    const { result } = renderHook(() => useMapEditorVoice({
      mapId: "map-1",
      documentRevision: 1,
      insertForest: insertForest as never,
      selectNode: jest.fn(),
      selectedNodeId: 1,
      selectedNodeIds: [1],
      startGuard: baseStartGuard,
      exclusiveStopRequested: false,
      adapterOptions: { createInstance: () => recognition },
    }));
    act(() => {
      result.current.startVoiceFromPalette();
    });
    act(() => {
      recognition.emitFinal("子ノード");
    });
    expect(result.current.voiceNotice?.kind).toBe("error");
    expect(result.current.voiceNotice?.message).toContain("追加できません");
  });
});