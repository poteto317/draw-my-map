export const SPEECH_RECOGNITION_LANG = "ja-JP";

export type SpeechRecognitionResultEvent = {
  readonly results: {
    readonly length: number;
    readonly [index: number]: {
      readonly isFinal: boolean;
      readonly [altIndex: number]: { readonly transcript: string };
    };
  };
};

export type SpeechRecognitionErrorCode = string;

export type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: SpeechRecognitionErrorCode }) => void) | null;
  onend: (() => void) | null;
};

export type SpeechRecognitionAdapterCallbacks = {
  readonly onInterim: (transcript: string) => void;
  readonly onFinal: (transcript: string) => void;
  readonly onError: (code: SpeechRecognitionErrorCode) => void;
  readonly onEnd: () => void;
};

export type SpeechRecognitionAdapter = {
  start: () => void;
  stop: () => void;
  dispose: () => void;
};

export type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export type CreateSpeechRecognitionAdapterOptions = {
  readonly createInstance?: () => BrowserSpeechRecognition | null;
};

function readTranscript(event: SpeechRecognitionResultEvent): { interim: string; finals: readonly string[] } {
  const finals: string[] = [];
  let interim = "";
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const text = result[0]?.transcript ?? "";
    if (result.isFinal) finals.push(text);
    else interim = text;
  }
  return { interim, finals };
}

export function resolveSpeechRecognitionConstructor(
  scope: { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor } = globalThis as typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  },
): SpeechRecognitionConstructor | null {
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function createSpeechRecognitionAdapter(
  callbacks: SpeechRecognitionAdapterCallbacks,
  options: CreateSpeechRecognitionAdapterOptions = {},
): SpeechRecognitionAdapter | null {
  const recognition = options.createInstance?.()
    ?? (() => {
      const Ctor = resolveSpeechRecognitionConstructor();
      return Ctor === null ? null : new Ctor();
    })();
  if (recognition === null) return null;

  recognition.lang = SPEECH_RECOGNITION_LANG;
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    const { interim, finals } = readTranscript(event);
    if (interim !== "") callbacks.onInterim(interim);
    for (const finalText of finals) {
      if (finalText.trim() !== "") callbacks.onFinal(finalText);
    }
  };
  recognition.onerror = (event) => {
    callbacks.onError(event.error);
  };
  recognition.onend = () => {
    callbacks.onEnd();
  };

  return {
    start: () => {
      recognition.start();
    },
    stop: () => {
      recognition.stop();
    },
    dispose: () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    },
  };
}