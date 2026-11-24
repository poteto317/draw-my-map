type ExchangeExportControlsProps = {
  onExportOpml: () => void;
  onExportCsv: () => void;
  onExportTsv: () => void;
  opmlEnabled?: boolean;
  csvEnabled?: boolean;
  tsvEnabled?: boolean;
  opmlDisabledReason?: string;
  csvDisabledReason?: string;
  tsvDisabledReason?: string;
};

const buttonClassName =
  "rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

function exportLabel(
  defaultLabel: string,
  enabled: boolean,
  disabledReason: string | undefined,
): string {
  return !enabled && disabledReason ? `${defaultLabel}（${disabledReason}）` : defaultLabel;
}

export function ExchangeExportControls({
  onExportOpml,
  onExportCsv,
  onExportTsv,
  opmlEnabled = true,
  csvEnabled = true,
  tsvEnabled = true,
  opmlDisabledReason,
  csvDisabledReason,
  tsvDisabledReason,
}: ExchangeExportControlsProps) {
  const opmlLabel = exportLabel("OPML書き出し", opmlEnabled, opmlDisabledReason);
  const csvLabel = exportLabel("CSV書き出し", csvEnabled, csvDisabledReason);
  const tsvLabel = exportLabel("TSV書き出し", tsvEnabled, tsvDisabledReason);

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        className={buttonClassName}
        onClick={onExportOpml}
        disabled={!opmlEnabled}
        aria-label={opmlLabel}
        title={!opmlEnabled ? opmlDisabledReason : undefined}
      >
        OPML書き出し
      </button>
      <button
        type="button"
        className={buttonClassName}
        onClick={onExportCsv}
        disabled={!csvEnabled}
        aria-label={csvLabel}
        title={!csvEnabled ? csvDisabledReason : undefined}
      >
        CSV書き出し
      </button>
      <button
        type="button"
        className={buttonClassName}
        onClick={onExportTsv}
        disabled={!tsvEnabled}
        aria-label={tsvLabel}
        title={!tsvEnabled ? tsvDisabledReason : undefined}
      >
        TSV書き出し
      </button>
    </div>
  );
}