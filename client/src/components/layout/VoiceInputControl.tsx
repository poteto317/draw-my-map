import type { Ref } from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

export type VoiceInputControlProps = {
  readonly voiceListening: boolean;
  readonly interimTranscript: string;
  readonly onVoiceToggle: () => void;
  readonly disabled: boolean;
  readonly isNarrowViewport: boolean;
  readonly userChoseMapOnNarrow: boolean;
  readonly buttonRef?: Ref<HTMLButtonElement>;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function VoiceInputControl({
  voiceListening,
  interimTranscript,
  onVoiceToggle,
  disabled,
  isNarrowViewport,
  userChoseMapOnNarrow,
  buttonRef,
}: VoiceInputControlProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-2"
      data-testid="voice-input-control-host"
      data-narrow-viewport={isNarrowViewport}
      data-user-chose-map-on-narrow={userChoseMapOnNarrow}
    >
    <button
      ref={buttonRef}
      type="button"
      className={buttonClassName}
      disabled={disabled && !voiceListening}
      onClick={onVoiceToggle}
      onKeyDown={preventRepeatedActivationClick}
      aria-pressed={voiceListening}
    >
      {voiceListening ? "音声入力を停止" : "音声入力"}
    </button>
    {interimTranscript !== "" && (
      <span
        className="max-w-48 truncate text-sm text-zinc-600 dark:text-zinc-300"
        aria-live="polite"
        data-testid="voice-interim-transcript"
      >
        {interimTranscript}
      </span>
    )}
    </div>
  );
}