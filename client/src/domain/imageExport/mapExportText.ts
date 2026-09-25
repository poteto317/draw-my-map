import { normalizeMapXmlText } from "@/domain/imageExport/mapXmlText";

export type MeasureMapText = (text: string) => number;

export type MapExportTextLayout = {
  lines: string[];
  firstBaseline: number;
  top: number;
  bottom: number;
  width: number;
};

export const MAP_EXPORT_FONT_SIZE = 14;
export const MAP_EXPORT_LINE_HEIGHT = 18;
export const MAP_EXPORT_HORIZONTAL_INSET = 8;

const FALLBACK_MAP_EXPORT_LABEL = "新しいノード";

function measureCodePointRange(
  codePoints: string[],
  start: number,
  length: number,
  measureText: MeasureMapText,
): number {
  return measureText(codePoints.slice(start, start + length).join(""));
}

function findFittingLength(
  codePoints: string[],
  start: number,
  maxWidth: number,
  measureText: MeasureMapText,
): number {
  const remainingLength = codePoints.length - start;
  if (
    remainingLength === 0 ||
    measureCodePointRange(codePoints, start, 1, measureText) > maxWidth
  ) {
    return 0;
  }

  let fittingLength = 1;
  let candidateLength = 2;

  while (candidateLength <= remainingLength) {
    if (
      measureCodePointRange(codePoints, start, candidateLength, measureText) >
      maxWidth
    ) {
      break;
    }

    fittingLength = candidateLength;
    if (fittingLength === remainingLength) return fittingLength;
    candidateLength = Math.min(remainingLength, candidateLength * 2);
  }

  let lowerBound = fittingLength + 1;
  let upperBound = Math.min(candidateLength - 1, remainingLength);

  while (lowerBound <= upperBound) {
    const middle = Math.floor((lowerBound + upperBound) / 2);
    if (
      measureCodePointRange(codePoints, start, middle, measureText) <= maxWidth
    ) {
      fittingLength = middle;
      lowerBound = middle + 1;
    } else {
      upperBound = middle - 1;
    }
  }

  return fittingLength;
}

export function getMapExportLabel(label: string): string {
  return normalizeMapXmlText(label || FALLBACK_MAP_EXPORT_LABEL);
}

export function wrapMapExportText(
  label: string,
  maxWidth: number,
  measureText: MeasureMapText,
): string[] {
  const explicitLines = label.replace(/\r\n?/g, "\n").split("\n");
  const wrappedLines: string[] = [];

  for (const explicitLine of explicitLines) {
    const codePoints = Array.from(explicitLine);

    if (codePoints.length === 0) {
      wrappedLines.push("");
      continue;
    }

    if (maxWidth <= 0) {
      for (const codePoint of codePoints) wrappedLines.push(codePoint);
      continue;
    }

    let start = 0;
    while (start < codePoints.length) {
      const fittingLength = findFittingLength(
        codePoints,
        start,
        maxWidth,
        measureText,
      );

      if (fittingLength === 0) {
        // A single code point wider than the limit still needs to make progress.
        wrappedLines.push(codePoints[start]);
        start += 1;
        continue;
      }

      if (fittingLength === codePoints.length - start) {
        wrappedLines.push(codePoints.slice(start).join(""));
        break;
      }

      let breakAt = -1;
      for (let index = start; index < start + fittingLength; index += 1) {
        if (/\s/u.test(codePoints[index])) breakAt = index;
      }

      if (breakAt >= 0) {
        const lineBeforeBreak = codePoints.slice(start, breakAt).join("");
        if (lineBeforeBreak.length > 0) wrappedLines.push(lineBeforeBreak);
        start = breakAt + 1;
      } else {
        wrappedLines.push(codePoints.slice(start, start + fittingLength).join(""));
        start += fittingLength;
      }
    }
  }

  return wrappedLines;
}

export function getMapExportTextLayout(
  label: string,
  maxWidth: number,
  centerY: number,
  measureText: MeasureMapText,
): MapExportTextLayout {
  const lines = wrapMapExportText(
    getMapExportLabel(label),
    maxWidth,
    measureText,
  );
  const blockHeight = lines.length * MAP_EXPORT_LINE_HEIGHT;

  return {
    lines,
    firstBaseline: centerY
      - ((lines.length - 1) * MAP_EXPORT_LINE_HEIGHT) / 2
      + MAP_EXPORT_FONT_SIZE / 3,
    top: centerY - blockHeight / 2,
    bottom: centerY + blockHeight / 2,
    width: lines.reduce(
      (widest, line) => Math.max(widest, measureText(line)),
      0,
    ),
  };
}
