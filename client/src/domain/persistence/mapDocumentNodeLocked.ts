import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

export function normalizeMapDocumentNodeLocked(
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

export function projectMapDocumentNodeLocked(
  locked: true | undefined,
): { locked?: true } {
  if (locked === true) {
    return { locked: true };
  }
  return {};
}