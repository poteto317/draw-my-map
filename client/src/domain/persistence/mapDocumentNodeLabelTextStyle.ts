import { isLabelFontSize, type LabelFontSize } from "@/domain/nodes/labelTextStyle";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

export function normalizeMapDocumentNodeLabelFontSize(
  raw: unknown,
  _index: number,
  version: MapDocumentVersion,
): MapDocumentResult<LabelFontSize | undefined> {
  if (version !== 3 || raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (isLabelFontSize(raw)) {
    return { ok: true, value: raw };
  }
  return { ok: true, value: undefined };
}

export function normalizeMapDocumentNodeLabelBold(
  raw: unknown,
  _index: number,
  version: MapDocumentVersion,
): MapDocumentResult<true | undefined> {
  if (version !== 3 || raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (raw === true) {
    return { ok: true, value: true };
  }
  return { ok: true, value: undefined };
}

export function normalizeMapDocumentNodeLabelUnderline(
  raw: unknown,
  _index: number,
  version: MapDocumentVersion,
): MapDocumentResult<true | undefined> {
  if (version !== 3 || raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (raw === true) {
    return { ok: true, value: true };
  }
  return { ok: true, value: undefined };
}
