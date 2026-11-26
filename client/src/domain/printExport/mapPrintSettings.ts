export const MAP_PRINT_MARGIN_MIN_MM = 0;
export const MAP_PRINT_MARGIN_MAX_MM = 50;
export const MAP_PRINT_MARGIN_DECIMAL_PLACES = 1;
export const MAX_MAP_PRINT_PAGES = 100;
export const MAX_MAP_PRINT_SVG_MIB = 10;
export const MAX_MAP_PRINT_SVG_BYTES = MAX_MAP_PRINT_SVG_MIB * 1024 * 1024;

const MARGIN_SCALE = 10 ** MAP_PRINT_MARGIN_DECIMAL_PLACES;
export const MAP_PRINT_MARGIN_STEP_MM = 1 / MARGIN_SCALE;
const MARGIN_PATTERN = new RegExp(
  String.raw`^(?:\d+|\d*\.\d{1,${MAP_PRINT_MARGIN_DECIMAL_PLACES}})$`,
);

export function isValidMapPrintMargin(value: number): boolean {
  return Number.isFinite(value) &&
    value >= MAP_PRINT_MARGIN_MIN_MM &&
    value <= MAP_PRINT_MARGIN_MAX_MM &&
    Math.round(value * MARGIN_SCALE) / MARGIN_SCALE === value;
}

export function parseMapPrintMargin(value: string): number {
  // 数値に丸める前に、符号や指数のない10進表記と小数の桁数を検証する。
  if (!MARGIN_PATTERN.test(value)) return NaN;
  const margin = Number(value);
  return isValidMapPrintMargin(margin) ? margin : NaN;
}
