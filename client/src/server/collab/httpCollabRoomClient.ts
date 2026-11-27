import type {
  CollabConnectionCountResult,
  CollabRoomClient,
  CollabRoomExportResult,
} from "@/server/collab/collabRoomClient";

export type HttpCollabRoomClientOptions = {
  /** CF_COLLAB_WS_ORIGIN と同じ origin（wss/https どちらでも可） */
  origin: string;
  /** Next → Worker 管理 API 用共有秘密（ticket ではない） */
  serviceSecret: string;
  fetchImpl?: typeof fetch;
};

function toHttpOrigin(origin: string): string {
  const trimmed = origin.replace(/\/$/, "");
  if (trimmed.startsWith("wss://")) return `https://${trimmed.slice("wss://".length)}`;
  if (trimmed.startsWith("ws://")) return `http://${trimmed.slice("ws://".length)}`;
  return trimmed;
}

function authHeaders(serviceSecret: string): Record<string, string> {
  return { Authorization: `Bearer ${serviceSecret}` };
}

/**
 * Durable Object Worker の管理 HTTP へ seed / export / connections を委譲する。
 * ticket 平文は送らない（service secret のみ）。
 */
export function createHttpCollabRoomClient(
  options: HttpCollabRoomClientOptions,
): CollabRoomClient {
  const base = toHttpOrigin(options.origin);
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async seed(sessionId, yjsUpdate) {
      try {
        const response = await fetchImpl(`${base}/rooms/${encodeURIComponent(sessionId)}/seed`, {
          method: "POST",
          headers: {
            ...authHeaders(options.serviceSecret),
            "content-type": "application/octet-stream",
          },
          body: Buffer.from(yjsUpdate),
        });
        if (!response.ok) return { ok: false, reason: "seed-failed" };
        return { ok: true };
      } catch {
        return { ok: false, reason: "seed-failed" };
      }
    },

    async exportYjsUpdate(sessionId): Promise<CollabRoomExportResult> {
      try {
        const response = await fetchImpl(
          `${base}/rooms/${encodeURIComponent(sessionId)}/export`,
          {
            method: "GET",
            headers: authHeaders(options.serviceSecret),
          },
        );
        if (response.status === 404) {
          return { ok: false, reason: "export-empty" };
        }
        if (!response.ok) {
          return { ok: false, reason: "export-failed" };
        }
        const buffer = new Uint8Array(await response.arrayBuffer());
        if (buffer.byteLength === 0) {
          return { ok: false, reason: "export-empty" };
        }
        return { ok: true, value: buffer };
      } catch {
        return { ok: false, reason: "export-failed" };
      }
    },

    async getConnectionCount(sessionId): Promise<CollabConnectionCountResult> {
      try {
        const response = await fetchImpl(
          `${base}/rooms/${encodeURIComponent(sessionId)}/connections`,
          {
            method: "GET",
            headers: authHeaders(options.serviceSecret),
          },
        );
        if (!response.ok) {
          return { ok: false, reason: "connection-count-failed" };
        }
        const body: unknown = await response.json().catch(() => null);
        if (
          typeof body === "object" &&
          body !== null &&
          typeof (body as { count?: unknown }).count === "number" &&
          Number.isFinite((body as { count: number }).count)
        ) {
          return { ok: true, value: (body as { count: number }).count };
        }
        return { ok: false, reason: "connection-count-failed" };
      } catch {
        return { ok: false, reason: "connection-count-failed" };
      }
    },

    async destroy(sessionId) {
      try {
        await fetchImpl(`${base}/rooms/${encodeURIComponent(sessionId)}/destroy`, {
          method: "POST",
          headers: authHeaders(options.serviceSecret),
        });
      } catch {
        /* end 後の best-effort。D1 は ended 済み */
      }
    },
  };
}
