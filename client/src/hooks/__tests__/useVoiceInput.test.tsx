import { act, renderHook } from "@testing-library/react";
import type { InsertForestResult } from "@/hooks/useNodes";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import type { BrowserSpeechRecognition } from "@/domain/voice/speechRecognitionAdapter";

function createRecognitionMock() {
  const handlers: {
    onresult: ((event: unknown) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
  } = { onresult: null, onerror: null, onend: null };
  const recognition: BrowserSpeechRecognition & {
    emitFinal: (text: string) => void;
    emitEnd: () => void;
  } = {
    lang: "",
    continuous: false,
    interimResults: false,
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    get onresult() { return handlers.onresult; },
    set onresult(v) { handlers.onresult = v; },
    get onerror() { return handlers.onerror; },
    set onerror(v) { handlers.onerror = v; },
    get onend() { return handlers.onend; },
    set onend(v) { handlers.onend = v; },
    emitFinal(text: string) {
      handlers.onresult?.({
        results: { length: 1, 0: { isFinal: true, 0: { transcript: text } } },
      });
    },
    emitEnd() {
      handlers.onend?.();
    },
  };
  return recognition;
}

describe("useVoiceInput", () => {
  it("確定テキストで insertForest を呼び、空 final はスキップする", () => {
    const recognition = createRecognitionMock();
    const insertForest = jest.fn<InsertForestResult, unknown[]>(() => ({ ok: true, rootId: 9, count: 1 }));
    const selectNode = jest.fn();
    const { result } = renderHook(() => useVoiceInput({
      selectedNodeId: null,
      selectedNodeIds: [],
      insertForest: insertForest as never,
      selectNode,
      adapterOptions: { createInstance: () => recognition },
    }));
    act(() => {
      result.current.start();
    });
    act(() => {
      recognition.emitFinal("   ");
      recognition.emitFinal("子ノード");
    });
    expect(insertForest).toHaveBeenCalledTimes(1);
    expect(insertForest).toHaveBeenCalledWith(
      [{ label: "子ノード", parentIndex: null }],
      { kind: "root" },
    );
    expect(selectNode).toHaveBeenCalledWith(9);
  });

  it("listening 開始後の選択変更が insert 先へ反映される", () => {
    const recognition = createRecognitionMock();
    const insertForest = jest.fn<InsertForestResult, unknown[]>(() => ({ ok: true, rootId: 2, count: 1 }));
    const selectNode = jest.fn();
    const { result, rerender } = renderHook(
      (props: { selectedNodeId: number | null; selectedNodeIds: readonly number[] }) => useVoiceInput({
        selectedNodeId: props.selectedNodeId,
        selectedNodeIds: props.selectedNodeIds,
        insertForest: insertForest as never,
        selectNode,
        adapterOptions: { createInstance: () => recognition },
      }),
      {
        initialProps: {
          selectedNodeId: null as number | null,
          selectedNodeIds: [] as readonly number[],
        },
      },
    );
    act(() => {
      result.current.start();
    });
    rerender({ selectedNodeId: 1, selectedNodeIds: [1] });
    act(() => {
      recognition.emitFinal("子");
    });
    expect(insertForest).toHaveBeenCalledWith(
      [{ label: "子", parentIndex: null }],
      { kind: "child", parentId: 1 },
    );
  });

  it("listening 中の再 start は no-op", () => {
    const recognition = createRecognitionMock();
    const { result } = renderHook(() => useVoiceInput({
      selectedNodeId: 1,
      selectedNodeIds: [1],
      insertForest: jest.fn(() => ({ ok: true, rootId: 2, count: 1 })) as never,
      selectNode: jest.fn(),
      adapterOptions: { createInstance: () => recognition },
    }));
    act(() => {
      expect(result.current.start()).toBe(true);
      expect(result.current.start()).toBe(false);
    });
  });
});