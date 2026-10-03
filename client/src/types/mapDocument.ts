import type { NodeMapState } from "@/types/nodeMapState";
import type { Node } from "@/types/node";

type MapDocumentV1Node = Pick<
  Node,
  "id" | "parentId" | "x" | "y" | "width" | "height" | "label"
>;

export type MapDocumentV1 = {
  version: 1;
  layoutMode: NodeMapState["layoutMode"];
  nodes: MapDocumentV1Node[];
};

export type MapDocumentVersion = 1 | 2 | 3;

export type MapDocumentV3 = NodeMapState & { version: 3 };

export type MapDocument = MapDocumentV3;

export type MapDocumentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
