import {
  isValidMapPrintMargin,
  MAX_MAP_PRINT_PAGES,
} from "@/domain/printExport/mapPrintSettings";
import type {
  MapPrintFailureReason,
  MapPrintLayout,
  MapPrintPage,
  MapPrintSettings,
} from "@/types/mapPrintExport";

const PAPER_SIZES_MM = {
  a4: [210, 297],
  a3: [297, 420],
  letter: [215.9, 279.4],
} as const;
const MM_PER_PX = 25.4 / 96;
const PAGE_COUNT_TOLERANCE = 1e-9;

export class MapPrintLayoutError extends RangeError {
  constructor(readonly reason: Extract<MapPrintFailureReason, "invalid-settings" | "page-limit">) {
    super(reason);
  }
}

function getPrintArea(settings: MapPrintSettings) {
  if (
    !Object.hasOwn(PAPER_SIZES_MM, settings.paperSize) ||
    (settings.orientation !== "portrait" && settings.orientation !== "landscape") ||
    (settings.pagination !== "fit" && settings.pagination !== "tile") ||
    !settings.margins
  ) {
    throw new MapPrintLayoutError("invalid-settings");
  }

  const { top, right, bottom, left } = settings.margins;
  if (![top, right, bottom, left].every(isValidMapPrintMargin)) {
    throw new MapPrintLayoutError("invalid-settings");
  }

  const [shortSide, longSide] = PAPER_SIZES_MM[settings.paperSize];
  const landscape = settings.orientation === "landscape";
  const paperWidthMm = landscape ? longSide : shortSide;
  const paperHeightMm = landscape ? shortSide : longSide;
  const contentWidthMm = paperWidthMm - left - right;
  const contentHeightMm = paperHeightMm - top - bottom;
  if (contentWidthMm < 1 || contentHeightMm < 1) {
    throw new MapPrintLayoutError("invalid-settings");
  }

  return { paperWidthMm, paperHeightMm, contentWidthMm, contentHeightMm };
}

export function validateMapPrintSettings(settings: MapPrintSettings): void {
  getPrintArea(settings);
}

function assertPositiveFinite(...values: number[]): void {
  if (!values.every((value) => Number.isFinite(value) && value > 0)) {
    throw new MapPrintLayoutError("invalid-settings");
  }
}

function countTiles(ratio: number): number {
  const nearestInteger = Math.round(ratio);
  if (nearestInteger > 0 && Math.abs(ratio - nearestInteger) <= PAGE_COUNT_TOLERANCE) {
    return nearestInteger;
  }
  return Math.ceil(ratio);
}

export function calculateMapPrintLayout(
  width: number,
  height: number,
  settings: MapPrintSettings,
): MapPrintLayout {
  const area = getPrintArea(settings);
  const { contentWidthMm, contentHeightMm } = area;
  assertPositiveFinite(width, height);
  const widthMm = width * MM_PER_PX;
  const heightMm = height * MM_PER_PX;
  assertPositiveFinite(widthMm, heightMm);

  if (settings.pagination === "fit") {
    const scaleX = contentWidthMm / widthMm;
    const scaleY = contentHeightMm / heightMm;
    assertPositiveFinite(scaleX, scaleY);
    const scale = Math.min(scaleX, scaleY);
    const fittedWidthMm = widthMm * scale;
    const fittedHeightMm = heightMm * scale;
    assertPositiveFinite(fittedWidthMm, fittedHeightMm);
    return {
      ...area,
      columns: 1,
      rows: 1,
      pages: [{
        leftMm: (contentWidthMm - fittedWidthMm) / 2,
        topMm: (contentHeightMm - fittedHeightMm) / 2,
        widthMm: fittedWidthMm,
        heightMm: fittedHeightMm,
      }],
    };
  }

  const widthRatio = widthMm / contentWidthMm;
  const heightRatio = heightMm / contentHeightMm;
  assertPositiveFinite(widthRatio, heightRatio);
  const columns = countTiles(widthRatio);
  const rows = countTiles(heightRatio);
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns * rows > MAX_MAP_PRINT_PAGES) {
    throw new MapPrintLayoutError("page-limit");
  }

  const pages: MapPrintPage[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      pages.push({
        leftMm: 0 - column * contentWidthMm,
        topMm: 0 - row * contentHeightMm,
        widthMm,
        heightMm,
      });
    }
  }
  return { ...area, columns, rows, pages };
}
