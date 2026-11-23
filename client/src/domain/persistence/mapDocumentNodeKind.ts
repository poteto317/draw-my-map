import { normalizeNodeKind } from "@/domain/nodes/nodeKindUpdate";
import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";
import type { NodeKind } from "@/types/nodeKind";

export function normalizeMapDocumentNodeKind(
  raw: unknown,
  _index: number,
  version: MapDocumentVersion,
): MapDocumentResult<NodeKind | undefined> {
  if (version !== 3 || raw === undefined) {
    return { ok: true, value: undefined };
  }
  return { ok: true, value: normalizeNodeKind(raw) };
}
