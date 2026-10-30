import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
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

function findLastNonWhitespaceIndex(codePoints: string[]): number {
  for (let index = codePoints.length - 1; index >= 0; index -= 1) {
    if (/\S/u.test(codePoints[index])) return index;
  }
  return -1;
}

function findWhitespaceRunEnd(codePoints: string[], start: number): number {
  let end = start;
  while (end < codePoints.length && /\s/u.test(codePoints[end])) end += 1;
  return end;
}

function isBreakableWhitespace(
  codePoints: string[],
  index: number,
  lastNonWhitespaceIndex: number,
  consumedWhitespaceRunEnd: number,
): boolean {
  return (
    /\s/u.test(codePoints[index]) &&
    index < lastNonWhitespaceIndex &&
    index >= consumedWhitespaceRunEnd
  );
}

function findLastBreakableIndex(
  codePoints: string[],
  start: number,
  fittingLength: number,
  lastNonWhitespaceIndex: number,
  consumedWhitespaceRunEnd: number,
): number {
  let breakAt = -1;
  for (let index = start; index < start + fittingLength; index += 1) {
    if (
      isBreakableWhitespace(
        codePoints,
        index,
        lastNonWhitespaceIndex,
        consumedWhitespaceRunEnd,
      )
    ) {
      breakAt = index;
    }
  }
  return breakAt;
}

function wrapExplicitLine(
  explicitLine: string,
  maxWidth: number,
  measureText: MeasureMapText,
): string[] {
  const codePoints = Array.from(explicitLine);

  if (codePoints.length === 0) return [""];
  if (maxWidth <= 0) return codePoints;

  const lastNonWhitespaceIndex = findLastNonWhitespaceIndex(codePoints);
  const wrappedLines: string[] = [];
  let start = 0;
  let consumedWhitespaceRunEnd = -1;

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

    const breakAt = findLastBreakableIndex(
      codePoints,
      start,
      fittingLength,
      lastNonWhitespaceIndex,
      consumedWhitespaceRunEnd,
    );

    if (breakAt >= 0 && (breakAt > start || start === 0)) {
      const lineBeforeBreak = codePoints.slice(start, breakAt).join("");
      if (lineBeforeBreak.length > 0) wrappedLines.push(lineBeforeBreak);
      consumedWhitespaceRunEnd = findWhitespaceRunEnd(codePoints, breakAt);
      start = breakAt + 1;
    } else {
      const fittedLine = codePoints
        .slice(start, start + fittingLength)
        .join("");
      wrappedLines.push(fittedLine);
      start += fittingLength;
      if (
        /\S/u.test(fittedLine) &&
        start < codePoints.length &&
        isBreakableWhitespace(
          codePoints,
          start,
          lastNonWhitespaceIndex,
          consumedWhitespaceRunEnd,
        )
      ) {
        consumedWhitespaceRunEnd = findWhitespaceRunEnd(codePoints, start);
        start += 1;
      }
    }
  }

  return wrappedLines;
}

export function getMapExportLabel(label: string): string {
  return normalizeMapXmlText(getNodeDisplayLabel(label));
}

export function wrapMapExportText(
  label: string,
  maxWidth: number,
  measureText: MeasureMapText,
): string[] {
  return normalizeMapXmlText(label)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((explicitLine) => wrapExplicitLine(
      explicitLine,
      maxWidth,
      measureText,
    ));
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
