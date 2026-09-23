type MapImageExportControlsProps = {
  onExportPng: () => void;
  onExportSvg: () => void;
  isExportingPng: boolean;
};

export function MapImageExportControls({
  onExportPng,
  onExportSvg,
  isExportingPng,
}: MapImageExportControlsProps) {
  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        className="rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:cursor-wait disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200"
        onClick={onExportPng}
        disabled={isExportingPng}
      >
        PNG書き出し
      </button>
      <button
        type="button"
        className="rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors dark:bg-zinc-700 dark:text-zinc-200"
        onClick={onExportSvg}
      >
        SVG書き出し
      </button>
    </div>
  );
}
