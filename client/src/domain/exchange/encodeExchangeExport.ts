import { encodeCsv } from "@/domain/exchange/csvTsvCodec";
import type { ExchangeExportFormat } from "@/domain/exchange/exchangeExportFormat";
import { encodeOpml } from "@/domain/exchange/opmlCodec";
import type { Node } from "@/types/node";

export function encodeExchangeExport(
  nodes: readonly Node[],
  format: ExchangeExportFormat,
): string {
  if (format === "opml") return encodeOpml(nodes);
  return encodeCsv(nodes, format === "tsv" ? "\t" : ",");
}