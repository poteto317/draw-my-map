import {
  MAP_PRINT_MARGIN_DECIMAL_PLACES,
  MAP_PRINT_MARGIN_MAX_MM,
  MAP_PRINT_MARGIN_MIN_MM,
  MAX_MAP_PRINT_PAGES,
  MAX_MAP_PRINT_SVG_MIB,
} from "@/domain/printExport/mapPrintSettings";
import type { MapPrintFailureReason } from "@/types/mapPrintExport";

export const EMPTY_MAP_PRINT_MESSAGE = "書き出すノードがありません。";

export const MAP_PRINT_FAILURE_MESSAGES: Record<MapPrintFailureReason, string> = {
  "invalid-settings": `印刷設定を確認してください。余白は${MAP_PRINT_MARGIN_MIN_MM}〜${MAP_PRINT_MARGIN_MAX_MM} mmの範囲で、小数第${MAP_PRINT_MARGIN_DECIMAL_PLACES}位まで入力できます。`,
  "page-limit": `${MAX_MAP_PRINT_PAGES}ページを超えています。用紙を大きくするか、「全体を1ページ」を選んでください。`,
  "size-limit": `印刷データが${MAX_MAP_PRINT_SVG_MIB} MiBを超えています。書き出し対象を減らしてください。`,
  preparation: "印刷の準備ができませんでした。設定を確認して再試行してください。",
};
