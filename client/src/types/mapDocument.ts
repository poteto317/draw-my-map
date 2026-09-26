import type { NodeMapState } from "@/types/nodeMapState";
import type { Node } from "@/types/node";

type MapDocumentV1Node = Omit<Node, "importance">;

export type MapDocumentV1 = {
  version: 1;
  layoutMode: NodeMapState["layoutMode"];
  nodes: MapDocumentV1Node[];
};

export type MapDocumentV2 = NodeMapState & { version: 2 };

export type MapDocument = MapDocumentV2;

export type MapDocumentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
