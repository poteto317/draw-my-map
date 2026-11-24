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

// readAsText の前に File.size で判定する。
// EXCHANGE_MAX_TEXT_LENGTH は UTF-16 コード単位。UTF-8 の BMP 文字は最大 3 バイト/単位のため、
// 文字数上限を満たす本文でもファイルはおおよそ 3 倍のバイトになり得る。旧係数 *4 だと ASCII 主体の
// 悪意あるファイルで readAsText が文字数チェックの約 4 倍までメモリを確保する余地があり、*3 に抑える。
export const EXCHANGE_MAX_FILE_BYTES = EXCHANGE_MAX_TEXT_LENGTH * 3;