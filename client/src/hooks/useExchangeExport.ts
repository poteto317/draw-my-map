"use client";

import { useState } from "react";
import { encodeExchangeExport } from "@/domain/exchange/encodeExchangeExport";
import type { ExchangeExportFormat } from "@/domain/exchange/exchangeExportFormat";
import { downloadExchangeText } from "@/services/exchange/exchangeTextDownload";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

type UseExchangeExportOptions = {
  closedNodes: readonly Node[];
  mapName: string;
  downloadText?: (text: string, mapName: string, format: ExchangeExportFormat) => void;
};

type UseExchangeExportResult = {
  exportOpml: () => void;
  exportCsv: () => void;
  exportTsv: () => void;
  notice: OperationNotice | null;
};

const FORMAT_LABELS: Record<ExchangeExportFormat, string> = {
  opml: "OPML",
  csv: "CSV",
  tsv: "TSV",
};

export function useExchangeExport({
  closedNodes,
  mapName,
  downloadText = downloadExchangeText,
}: UseExchangeExportOptions): UseExchangeExportResult {
  const [notice, setNotice] = useState<OperationNotice | null>(null);

  function exportFormat(format: ExchangeExportFormat) {
    const label = FORMAT_LABELS[format];
    try {
      const text = encodeExchangeExport(closedNodes, format);
      downloadText(text, mapName, format);
      setNotice({ kind: "status", message: `${label}ファイルを書き出しました。` });
    } catch {
      setNotice({ kind: "error", message: `${label}ファイルを書き出せませんでした。` });
    }
  }

  return {
    exportOpml: () => exportFormat("opml"),
    exportCsv: () => exportFormat("csv"),
    exportTsv: () => exportFormat("tsv"),
    notice,
  };
}