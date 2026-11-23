import { normalizeNodeIcon } from "@/domain/nodes/nodeIcon";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";

export function normalizeMapDocumentNodeIcon(
  raw: unknown,
  _index: number,
  version: MapDocumentVersion,
): MapDocumentResult<string | undefined> {
  if (version !== 3 || raw === undefined) {
    return { ok: true, value: undefined };
  }
  return { ok: true, value: normalizeNodeIcon(raw) };
}
