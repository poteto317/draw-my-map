type OutlineExportControlsProps = {
  onExportMarkdown: () => void;
  onExportPlainText: () => void;
  markdownEnabled?: boolean;
  plainTextEnabled?: boolean;
  markdownDisabledReason?: string;
  plainTextDisabledReason?: string;
};

const buttonClassName =
  "rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function OutlineExportControls({
  onExportMarkdown,
  onExportPlainText,
  markdownEnabled = true,
  plainTextEnabled = true,
  markdownDisabledReason,
  plainTextDisabledReason,
}: OutlineExportControlsProps) {
  const markdownLabel = !markdownEnabled && markdownDisabledReason
    ? `Markdown書き出し（${markdownDisabledReason}）`
    : "Markdown書き出し";
  const plainTextLabel = !plainTextEnabled && plainTextDisabledReason
    ? `箇条書き書き出し（${plainTextDisabledReason}）`
    : "箇条書き書き出し";

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        className={buttonClassName}
        onClick={onExportMarkdown}
        disabled={!markdownEnabled}
        aria-label={markdownLabel}
        title={!markdownEnabled ? markdownDisabledReason : undefined}
      >
        Markdown書き出し
      </button>
      <button
        type="button"
        className={buttonClassName}
        onClick={onExportPlainText}
        disabled={!plainTextEnabled}
        aria-label={plainTextLabel}
        title={!plainTextEnabled ? plainTextDisabledReason : undefined}
      >
        箇条書き書き出し
      </button>
    </div>
  );
}
