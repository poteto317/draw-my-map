type OutlineExportControlsProps = {
  onExportMarkdown: () => void;
  onExportPlainText: () => void;
};

export function OutlineExportControls({ onExportMarkdown, onExportPlainText }: OutlineExportControlsProps) {
  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        className="rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors dark:bg-zinc-700 dark:text-zinc-200"
        onClick={onExportMarkdown}
      >
        Markdown書き出し
      </button>
      <button
        type="button"
        className="rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors dark:bg-zinc-700 dark:text-zinc-200"
        onClick={onExportPlainText}
      >
        箇条書き書き出し
      </button>
    </div>
  );
}
