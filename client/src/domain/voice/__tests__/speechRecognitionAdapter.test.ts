import {
  SPEECH_RECOGNITION_LANG,
  createSpeechRecognitionAdapter,
} from "@/domain/voice/speechRecognitionAdapter";
import type { BrowserSpeechRecognition } from "@/domain/voice/speechRecognitionAdapter";

function createMockRecognition(): BrowserSpeechRecognition & {
  triggerResult: (transcript: string, isFinal: boolean) => void;
  triggerEnd: () => void;
} {
  const listeners: {
    onresult: ((event: unknown) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
  } = { onresult: null, onerror: null, onend: null };
  return {
    lang: "",
    continuous: false,
    interimResults: false,
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    get onresult() {
      return listeners.onresult;
    },
    set onresult(handler) {
      listeners.onresult = handler;
    },
    get onerror() {
      return listeners.onerror;
    },
    set onerror(handler) {
      listeners.onerror = handler;
    },
    get onend() {
      return listeners.onend;
    },
    set onend(handler) {
      listeners.onend = handler;
    },
    triggerResult(transcript: string, isFinal: boolean) {
      listeners.onresult?.({
        results: {
          length: 1,
          0: {
            isFinal,
            0: { transcript },
          },
        },
      });
    },
    triggerEnd() {
      listeners.onend?.();
    },
  };
}

describe("speechRecognitionAdapter", () => {
  it("ja-JP で continuous:false・interimResults:true を設定する", () => {
    const recognition = createMockRecognition();
    const adapter = createSpeechRecognitionAdapter({
      onInterim: jest.fn(),
      onFinal: jest.fn(),
      onError: jest.fn(),
      onEnd: jest.fn(),
    }, { createInstance: () => recognition });
    expect(adapter).not.toBeNull();
    expect(recognition.lang).toBe(SPEECH_RECOGNITION_LANG);
    expect(recognition.continuous).toBe(false);
    expect(recognition.interimResults).toBe(true);
    adapter?.dispose();
  });

  it("factory が null のときアダプタを作らない", () => {
    expect(createSpeechRecognitionAdapter({
      onInterim: jest.fn(),
      onFinal: jest.fn(),
      onError: jest.fn(),
      onEnd: jest.fn(),
    }, { createInstance: () => null })).toBeNull();
  });

  it("final と interim をコールバックへ渡す", () => {
    const recognition = createMockRecognition();
    const onInterim = jest.fn();
    const onFinal = jest.fn();
    const adapter = createSpeechRecognitionAdapter({
      onInterim,
      onFinal,
      onError: jest.fn(),
      onEnd: jest.fn(),
    }, { createInstance: () => recognition });
    adapter?.start();
    recognition.triggerResult("途中", false);
    recognition.triggerResult("確定", true);
    expect(onInterim).toHaveBeenCalledWith("途中");
    expect(onFinal).toHaveBeenCalledWith("確定");
    adapter?.dispose();
  });
});