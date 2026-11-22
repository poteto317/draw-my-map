type MapImageExportControlsProps = {
  onExportPng: () => void;
  onExportSvg: () => void;
  isExportingPng: boolean;
  pngEnabled?: boolean;
  svgEnabled?: boolean;
  pngDisabledReason?: string;
  svgDisabledReason?: string;
};

const buttonClassName =
  "rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

export function MapImageExportControls({
  onExportPng,
  onExportSvg,
  isExportingPng,
  pngEnabled = true,
  svgEnabled = true,
  pngDisabledReason,
  svgDisabledReason,
}: MapImageExportControlsProps) {
  const pngDisabled = !pngEnabled || isExportingPng;
  const pngLabel = !pngEnabled && pngDisabledReason
    ? `PNG書き出し（${pngDisabledReason}）`
    : "PNG書き出し";
  const svgLabel = !svgEnabled && svgDisabledReason
    ? `SVG書き出し（${svgDisabledReason}）`
    : "SVG書き出し";

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        className={`${buttonClassName}${isExportingPng ? " disabled:cursor-wait" : ""}`}
        onClick={onExportPng}
        disabled={pngDisabled}
        aria-label={pngLabel}
        title={!pngEnabled ? pngDisabledReason : undefined}
      >
        PNG書き出し
      </button>
      <button
        type="button"
        className={buttonClassName}
        onClick={onExportSvg}
        disabled={!svgEnabled}
        aria-label={svgLabel}
        title={!svgEnabled ? svgDisabledReason : undefined}
      >
        SVG書き出し
      </button>
    </div>
  );
}
