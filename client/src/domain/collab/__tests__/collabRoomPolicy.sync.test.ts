/**
 * collab-worker/src/constants.ts の実値と domain / server 正本の一致。
 * コピー照合はしない。worker 側を変えたら対応する正本も同じ値に更新する。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { COLLAB_RECONNECT_GRACE_MS } from "@/domain/collab/collabConnectionTypes";
import {
  COLLAB_AWARENESS_UPDATE_LIMIT,
  COLLAB_DOC_UPDATE_LIMIT,
  COLLAB_EMPTY_ROOM_TTL_MS,
} from "@/domain/collab/collabRoomPolicy";
import { COLLAB_MAX_CONNECTIONS } from "@/server/collab/collabRoomClient";

const WORKER_CONSTANTS_PATH = path.resolve(
  __dirname,
  "../../../../../collab-worker/src/constants.ts",
);

function readWorkerExport(name: string): unknown {
  const source = readFileSync(WORKER_CONSTANTS_PATH, "utf8");
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*([^;]+);`));
  if (!match?.[1]) {
    throw new Error(`collab-worker constants に ${name} が無い: ${WORKER_CONSTANTS_PATH}`);
  }
  const expression = match[1].replace(/\s+as\s+const\s*$/, "").trim();
  return new Function(`"use strict"; return (${expression});`)();
}

describe("collabRoomPolicy sync with collab-worker", () => {
  it("EMPTY TTL / DOC・AWARENESS rate / grace / maxConnections が worker constants と一致する", () => {
    expect(COLLAB_EMPTY_ROOM_TTL_MS).toBe(readWorkerExport("COLLAB_EMPTY_ROOM_TTL_MS"));
    expect(COLLAB_DOC_UPDATE_LIMIT).toEqual(readWorkerExport("COLLAB_DOC_UPDATE_LIMIT"));
    expect(COLLAB_AWARENESS_UPDATE_LIMIT).toEqual(
      readWorkerExport("COLLAB_AWARENESS_UPDATE_LIMIT"),
    );
    expect(COLLAB_RECONNECT_GRACE_MS).toBe(readWorkerExport("COLLAB_RECONNECT_GRACE_MS"));
    expect(COLLAB_MAX_CONNECTIONS).toBe(readWorkerExport("COLLAB_MAX_CONNECTIONS"));
  });
});
