import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { Node } from "@/types/node";

export type MapDocumentV1 = {
  version: 1;
  layoutMode: NodeLayoutMode;
  nodes: Node[];
};

export type MapDocumentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
