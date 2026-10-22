// 箇条書きの取り込みの上限。解析（parseOutlineText）は費用の安い順に判定する。
// 文字数の判定は、入力中のエラー（useOutlineImport）と現在の文字数の表示（入力の画面）も使う。

// 文字数の上限。バイト数ではなく UTF-16 コード単位（text.length）で数える。
// クリップボードの上限と同じ単位で、BOM と改行も含む。
export const OUTLINE_MAX_TEXT_LENGTH = 1_000_000;
// 空行でない行の数の上限。記号だけの行は数え、空白・制御文字だけの行は数えない。
export const OUTLINE_MAX_ITEMS = 10_000;
// 長いラベルの警告の閾値（コードポイント数）。
export const OUTLINE_LONG_LABEL_THRESHOLD = 200;

// 文字数（text.length）が上限を超えているか。入力欄の現在の文字数の表示もこの判定に合わせる。
export function isOutlineTextLengthTooLong(length: number): boolean {
  return length > OUTLINE_MAX_TEXT_LENGTH;
}

// 行の分割の前に判定する。O(1)。
export function isOutlineTextTooLong(text: string): boolean {
  return isOutlineTextLengthTooLong(text.length);
}

// 行の分割の後に判定する。
export function isOutlineLineCountTooLarge(count: number): boolean {
  return count > OUTLINE_MAX_ITEMS;
}
