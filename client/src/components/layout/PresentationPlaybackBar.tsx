import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

type PresentationPlaybackBarProps = {
  stepIndex: number;
  stepCount: number;
  caption: string | undefined;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onEnd: () => void;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function PresentationPlaybackBar({
  stepIndex,
  stepCount,
  caption,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onEnd,
}: PresentationPlaybackBarProps) {
  return (
    <div
      role="region"
      aria-label="プレゼン再生"
      className="pointer-events-auto absolute inset-x-0 bottom-3 z-20 mx-auto flex w-fit max-w-[min(100%,40rem)] flex-col items-center gap-2 rounded-lg border border-zinc-300 bg-white/95 px-4 py-3 shadow-md dark:border-zinc-600 dark:bg-zinc-900/95"
    >
      <PlaybackControlsRow
        stepIndex={stepIndex}
        stepCount={stepCount}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={onBack}
        onForward={onForward}
        onEnd={onEnd}
      />
      {caption !== undefined && caption.length > 0 && (
        <p className="max-w-full text-center text-sm text-zinc-700 dark:text-zinc-200">{caption}</p>
      )}
    </div>
  );
}

function PlaybackControlsRow({
  stepIndex,
  stepCount,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onEnd,
}: Omit<PresentationPlaybackBarProps, "caption">) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
      <span aria-live="polite">{stepIndex + 1} / {stepCount}</span>
      <button
        type="button"
        className={buttonClassName}
        disabled={!canGoBack}
        onClick={onBack}
        onKeyDown={preventRepeatedActivationClick}
      >
        戻る
      </button>
      <button
        type="button"
        className={buttonClassName}
        disabled={!canGoForward}
        onClick={onForward}
        onKeyDown={preventRepeatedActivationClick}
      >
        次へ
      </button>
      <button
        type="button"
        className={buttonClassName}
        onClick={onEnd}
        onKeyDown={preventRepeatedActivationClick}
      >
        終了
      </button>
    </div>
  );
}