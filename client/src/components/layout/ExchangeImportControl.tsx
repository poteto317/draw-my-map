import type { KeyboardEvent, Ref } from "react";
import type { ExchangeFormatEntry } from "@/domain/exchange/parseExchangeContent";

type ExchangeImportControlProps = {
  opmlExpanded: boolean;
  csvExpanded: boolean;
  disabled?: boolean;
  onOpen: (entry: ExchangeFormatEntry) => void;
  opmlButtonRef: Ref<HTMLButtonElement>;
  csvButtonRef: Ref<HTMLButtonElement>;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if ((event.key === "Enter" || event.key === " ") && event.repeat) {
    event.preventDefault();
  }
}

export function ExchangeImportControl({
  opmlExpanded,
  csvExpanded,
  disabled = false,
  onOpen,
  opmlButtonRef,
  csvButtonRef,
}: ExchangeImportControlProps) {
  return (
    <div className="flex shrink-0 gap-2" aria-label="取り込み">
      <button
        ref={opmlButtonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="dialog"
        aria-expanded={opmlExpanded}
        disabled={disabled}
        onClick={() => onOpen("opml")}
        onKeyDown={handleKeyDown}
      >
        OPML取り込み
      </button>
      <button
        ref={csvButtonRef}
        type="button"
        className={buttonClassName}
        aria-haspopup="dialog"
        aria-expanded={csvExpanded}
        disabled={disabled}
        onClick={() => onOpen("csv-tsv")}
        onKeyDown={handleKeyDown}
      >
        CSV/TSV取り込み
      </button>
    </div>
  );
}