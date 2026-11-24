import { createMapFileName } from "@/domain/mapLibrary/mapFileName";
import type { ExchangeExportFormat } from "@/domain/exchange/exchangeExportFormat";

const MIME_BY_FORMAT: Record<ExchangeExportFormat, string> = {
  opml: "application/xml;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  tsv: "text/tab-separated-values;charset=utf-8",
};

export function downloadExchangeText(
  text: string,
  mapName: string,
  format: ExchangeExportFormat,
  now = new Date(),
): void {
  const blob = new Blob([text], { type: MIME_BY_FORMAT[format] });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = createMapFileName(mapName, format, now);
    anchor.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}