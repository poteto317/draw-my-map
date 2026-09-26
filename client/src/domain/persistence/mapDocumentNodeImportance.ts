import { DEFAULT_NODE_IMPORTANCE } from "@/domain/nodes/nodeImportance";
import type { MapDocumentResult } from "@/types/mapDocument";
import type { NodeImportance } from "@/types/nodeImportance";

export function normalizeMapDocumentNodeImportance(
  importance: unknown,
  index: number,
  version: 1 | 2,
): MapDocumentResult<NodeImportance> {
  if (version === 1) {
    return { ok: true, value: DEFAULT_NODE_IMPORTANCE };
  }

  if (importance !== "high" && importance !== "medium" && importance !== "low") {
    return {
      ok: false,
      error: `node[${index}].importanceはhigh、medium、lowのいずれかである必要があります。`,
    };
  }

  return { ok: true, value: importance };
}
