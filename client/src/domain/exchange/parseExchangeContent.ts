import { decodeCsv, defaultDelimiterFromFileName } from "@/domain/exchange/csvTsvCodec";
import {
  isExchangeItemCountTooLarge,
  isExchangeTextTooLong,
} from "@/domain/exchange/exchangeLimits";
import { decodeOpml } from "@/domain/exchange/opmlCodec";
import type { ForestItem } from "@/domain/nodes/nodeForestInsertion";

export type ExchangeFormatEntry = "opml" | "csv-tsv";

export type ParsedExchange = {
  items: ForestItem[];
  warnings: readonly string[];
  showOpmlLossyNotice: boolean;
};

export type ParseExchangeResult =
  | { ok: true; parsed: ParsedExchange }
  | { ok: false; reason: string };

export { defaultDelimiterFromFileName };

function rejectIfTooManyItems(items: readonly { label: string }[]): ParseExchangeResult | null {
  if (isExchangeItemCountTooLarge(items.length)) {
    return { ok: false, reason: `too-many-items:${items.length}` };
  }
  return null;
}

export function parseExchangeContent(
  text: string,
  entry: ExchangeFormatEntry,
  delimiter: "," | "\t",
): ParseExchangeResult {
  if (isExchangeTextTooLong(text)) {
    return { ok: false, reason: "too-long" };
  }

  if (entry === "opml") {
    const result = decodeOpml(text);
    if (!result.ok) return { ok: false, reason: result.reason };
    const tooMany = rejectIfTooManyItems(result.items);
    if (tooMany) return tooMany;
    return {
      ok: true,
      parsed: {
        items: result.items,
        warnings: [],
        showOpmlLossyNotice: true,
      },
    };
  }

  const result = decodeCsv(text, delimiter);
  if (!result.ok) return { ok: false, reason: result.reason };
  const tooMany = rejectIfTooManyItems(result.items);
  if (tooMany) return tooMany;
  return {
    ok: true,
    parsed: {
      items: result.items,
      warnings: result.warnings,
      showOpmlLossyNotice: false,
    },
  };
}