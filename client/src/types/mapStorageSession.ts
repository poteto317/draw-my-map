import type { MapDocumentResult } from "@/types/mapDocument";

export type MapBodyWriteResult =
  | { status: "saved" }
  | { status: "failed"; error: string }
  | { status: "inactive" };

export type MapFlushResult =
  | { status: "saved" }
  | { status: "unchanged" }
  | { status: "failed"; error: string };

export type MapStorageSession = {
  mapId: string;
  readBody: () => MapDocumentResult<string | null>;
  writeBody: (json: string) => MapBodyWriteResult;
  registerFlush: (flush: () => MapFlushResult) => () => void;
};
