import type { NodeMapState } from "@/types/nodeMapState";

export type MapDocumentV1 = NodeMapState & {
  version: 1;
};

export type MapDocumentResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
