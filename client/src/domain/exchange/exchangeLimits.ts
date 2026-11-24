import {
  OUTLINE_MAX_ITEMS,
  OUTLINE_MAX_TEXT_LENGTH,
  isOutlineLineCountTooLarge,
  isOutlineTextTooLong,
} from "@/domain/outline/outlineLimits";

// 交換ファイル取り込みの上限。箇条書き取り込みと同値（outlineLimits を正本とする）。
export const EXCHANGE_MAX_TEXT_LENGTH = OUTLINE_MAX_TEXT_LENGTH;
export const EXCHANGE_MAX_ITEMS = OUTLINE_MAX_ITEMS;
export const isExchangeTextTooLong = isOutlineTextTooLong;
export const isExchangeItemCountTooLarge = isOutlineLineCountTooLarge;

// readAsText の前に File.size で判定する。UTF-8 でも EXCHANGE_MAX_TEXT_LENGTH 文字を超えない余裕。
export const EXCHANGE_MAX_FILE_BYTES = EXCHANGE_MAX_TEXT_LENGTH * 4;