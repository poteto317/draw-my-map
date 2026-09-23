export type MeasureMapText = (text: string) => number;

const FALLBACK_MAP_EXPORT_LABEL = "新しいノード";

export function getMapExportLabel(label: string): string {
  return label || FALLBACK_MAP_EXPORT_LABEL;
}

export function wrapMapExportText(
  label: string,
  maxWidth: number,
  measureText: MeasureMapText,
): string[] {
  const explicitLines = label.replace(/\r\n?/g, "\n").split("\n");
  const wrappedLines: string[] = [];

  for (const explicitLine of explicitLines) {
    let remaining = Array.from(explicitLine);

    if (remaining.length === 0) {
      wrappedLines.push("");
      continue;
    }

    if (maxWidth <= 0) {
      for (const character of remaining) wrappedLines.push(character);
      continue;
    }

    while (remaining.length > 0 && measureText(remaining.join("")) > maxWidth) {
      let fittingLength = 0;
      while (
        fittingLength < remaining.length &&
        measureText(remaining.slice(0, fittingLength + 1).join("")) <= maxWidth
      ) {
        fittingLength += 1;
      }

      if (fittingLength === 0) {
        // A single code point wider than the limit still needs to make progress.
        wrappedLines.push(remaining.shift() ?? "");
        continue;
      }

      let breakAt = -1;
      for (let index = 0; index < fittingLength; index += 1) {
        if (/\s/u.test(remaining[index])) breakAt = index;
      }

      if (breakAt >= 0) {
        const lineBeforeBreak = remaining.slice(0, breakAt).join("").trimEnd();
        if (lineBeforeBreak.length > 0) wrappedLines.push(lineBeforeBreak);
        remaining = remaining.slice(breakAt + 1);
        while (remaining.length > 0 && /\s/u.test(remaining[0])) remaining.shift();
      } else {
        wrappedLines.push(remaining.slice(0, fittingLength).join(""));
        remaining = remaining.slice(fittingLength);
      }
    }

    if (remaining.length > 0) wrappedLines.push(remaining.join(""));
  }

  return wrappedLines;
}
