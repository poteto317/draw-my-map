import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

export function normalizeMapDocumentNodeLayoutPinned(
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

export function projectMapDocumentNodeLayoutPinned(
  layoutPinned: true | undefined,
): { layoutPinned?: true } {
  if (layoutPinned === true) {
    return { layoutPinned: true };
  }
  return {};
}
