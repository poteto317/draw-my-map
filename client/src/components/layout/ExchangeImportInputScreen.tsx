"use client";

import { useId, type ChangeEvent, type KeyboardEvent, type Ref } from "react";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import { formatExchangeDecodeError } from "@/domain/exchange/exchangeMessages";
import type { ExchangeFormatEntry } from "@/domain/exchange/parseExchangeContent";
import type { ExchangeInputError } from "@/hooks/useExchangeImport";
import {
  ExchangeFileReadError,
  readExchangeFileText,
} from "@/services/exchange/readExchangeFileText";

type ExchangeImportInputScreenProps = {
  headingId: string;
  entry: ExchangeFormatEntry;
  fileName: string | null;
  delimiter: "," | "\t";
  inputError: ExchangeInputError;
  onFileLoad: (fileName: string, text: string) => void;
  onDelimiterChange: (delimiter: "," | "\t") => void;
  onPreview: () => void;
  onCancel: () => void;
  onLoadError: (message: string) => void;
  fileInputRef: Ref<HTMLInputElement>;
};

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

const OPML_DESCRIPTION =
  "OPML ファイル（.opml / .xml）からノードの階層を追加します。tags や座標などは取り込まれません。";

const CSV_DESCRIPTION =
  "CSV または TSV ファイルからノードを追加します。1行目は id, parentId, label, importance, note, tags のヘッダーが必要です。";

function handlePreviewKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if ((event.key === "Enter" || event.key === " ") && event.repeat) {
    event.preventDefault();
  }
}

export function ExchangeImportInputScreen({
  headingId,
  entry,
  fileName,
  delimiter,
  inputError,
  onFileLoad,
  onDelimiterChange,
  onPreview,
  onCancel,
  onLoadError,
  fileInputRef,
}: ExchangeImportInputScreenProps) {
  const fileInputId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const delimiterGroupId = useId();
  const shownError = useReannouncedNotice(inputError.sequence, inputError.message);
  const hasError = inputError.message !== null;
  const describedBy = hasError ? `${descriptionId} ${errorId}` : descriptionId;
  const description = entry === "opml" ? OPML_DESCRIPTION : CSV_DESCRIPTION;
  const accept = entry === "opml" ? ".opml,.xml,text/xml" : ".csv,.tsv,text/csv,text/tab-separated-values";

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readExchangeFileText(file);
      onFileLoad(file.name, text);
    } catch (error) {
      const reason =
        error instanceof ExchangeFileReadError && error.reason === "file-too-large"
          ? "file-too-large"
          : "読み込みに失敗しました";
      onLoadError(formatExchangeDecodeError(reason));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        {entry === "opml" ? "OPML ファイル" : "CSV/TSV ファイル"}
      </h2>
      <p id={descriptionId} className="text-sm">
        {description}
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={fileInputId} className="text-sm font-medium">
          ファイル
        </label>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept={accept}
          aria-invalid={hasError ? "true" : undefined}
          aria-describedby={describedBy}
          className="w-full text-sm"
          onChange={handleFileChange}
        />
        {fileName !== null && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">選択中: {fileName}</p>
        )}
        <p
          id={errorId}
          role="alert"
          aria-live="assertive"
          className="text-sm break-words text-red-700 [overflow-wrap:anywhere] dark:text-red-300"
        >
          {shownError}
        </p>
      </div>
      {entry === "csv-tsv" && (
        <fieldset className="flex flex-col gap-1 text-sm" aria-labelledby={delimiterGroupId}>
          <legend id={delimiterGroupId} className="mb-1 font-medium">
            区切り文字
          </legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="exchange-delimiter"
              checked={delimiter === ","}
              onChange={() => onDelimiterChange(",")}
            />
            カンマ（CSV）
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="exchange-delimiter"
              checked={delimiter === "\t"}
              onChange={() => onDelimiterChange("\t")}
            />
            タブ（TSV）
          </label>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClassName} onClick={onCancel}>
          キャンセル
        </button>
        <button
          type="button"
          className={buttonClassName}
          onClick={onPreview}
          onKeyDown={handlePreviewKeyDown}
        >
          プレビュー
        </button>
      </div>
    </div>
  );
}