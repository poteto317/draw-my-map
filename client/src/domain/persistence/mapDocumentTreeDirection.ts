import type { MapDocumentResult, MapDocumentVersion } from "@/types/mapDocument";
import type { TreeDirection } from "@/types/treeDirection";

export function normalizeMapDocumentTreeDirection(
  raw: unknown,
  version: MapDocumentVersion,
): MapDocumentResult<TreeDirection> {
  if (version !== 3) {
    return { ok: true, value: "lr" };
  }
  if (raw === undefined) {
    return { ok: true, value: "lr" };
  }
  if (raw === "lr" || raw === "tb") {
    return { ok: true, value: raw };
  }
  return { ok: false, error: "treeDirectionはlrまたはtbである必要があります。" };
}

export function projectMapDocumentTreeDirection(
  direction: TreeDirection | undefined,
): { treeDirection?: TreeDirection } {
  if (direction === "tb") {
    return { treeDirection: "tb" };
  }
  return {};
}