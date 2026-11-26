import type { CreateShareValue, ShareLinkIssued } from "@/domain/share/shareLink";
import type { ShareListItem } from "@/domain/share/shareLocalMetaProjection";
import type { ShareResult } from "@/domain/share/shareResult";

/** API client 側の別名（正本は domain ShareListItem） */
export type ShareListItemClient = ShareListItem;

type FetchLike = typeof fetch;

async function parseShareResult<T>(response: Response): Promise<ShareResult<T>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "invalid-response" };
  }
  if (
    typeof body !== "object"
    || body === null
    || !("ok" in body)
    || typeof (body as { ok: unknown }).ok !== "boolean"
  ) {
    return { ok: false, reason: "invalid-response" };
  }
  const result = body as ShareResult<T>;
  if (result.ok) {
    return result;
  }
  return {
    ok: false,
    reason: typeof result.reason === "string" ? result.reason : "unknown",
  };
}

export type ShareApiClient = {
  listMaps: () => Promise<ShareResult<ShareListItemClient[]>>;
  createShare: (input: {
    localMapId: string;
    title: string;
    documentJson: string;
  }) => Promise<ShareResult<CreateShareValue>>;
  publish: (
    sharedMapId: string,
    input: { documentJson: string },
  ) => Promise<ShareResult<{ revisionId: string }>>;
  createLink: (sharedMapId: string) => Promise<ShareResult<ShareLinkIssued>>;
  revokeLink: (linkId: string) => Promise<ShareResult<void>>;
  reissueLink: (linkId: string) => Promise<ShareResult<ShareLinkIssued>>;
  deleteShare: (sharedMapId: string) => Promise<ShareResult<void>>;
  viewByToken: (token: string) => Promise<ShareResult<{ documentJson: string }>>;
};

function resolveFetch(fetchImpl: FetchLike | undefined): FetchLike {
  if (fetchImpl) return fetchImpl;
  const globalFetch = globalThis.fetch;
  if (typeof globalFetch !== "function") {
    throw new Error("fetch is not available");
  }
  return globalFetch.bind(globalThis);
}

export function createShareApiClient(fetchImpl?: FetchLike): ShareApiClient {
  const doFetch = resolveFetch(fetchImpl);
  return {
    async listMaps() {
      const response = await doFetch("/api/share/maps", { method: "GET" });
      return parseShareResult<ShareListItemClient[]>(response);
    },
    async createShare(input) {
      const response = await doFetch("/api/share/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return parseShareResult<CreateShareValue>(response);
    },
    async publish(sharedMapId, input) {
      const response = await doFetch(`/api/share/maps/${encodeURIComponent(sharedMapId)}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return parseShareResult<{ revisionId: string }>(response);
    },
    async createLink(sharedMapId) {
      const response = await doFetch(`/api/share/maps/${encodeURIComponent(sharedMapId)}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission: "view" }),
      });
      return parseShareResult<ShareLinkIssued>(response);
    },
    async revokeLink(linkId) {
      const response = await doFetch(`/api/share/links/${encodeURIComponent(linkId)}/revoke`, {
        method: "POST",
      });
      return parseShareResult<void>(response);
    },
    async reissueLink(linkId) {
      const response = await doFetch(`/api/share/links/${encodeURIComponent(linkId)}/reissue`, {
        method: "POST",
      });
      return parseShareResult<ShareLinkIssued>(response);
    },
    async deleteShare(sharedMapId) {
      const response = await doFetch(`/api/share/maps/${encodeURIComponent(sharedMapId)}`, {
        method: "DELETE",
      });
      return parseShareResult<void>(response);
    },
    async viewByToken(token) {
      try {
        const response = await doFetch(`/api/share/view/${encodeURIComponent(token)}`, {
          method: "GET",
        });
        return await parseShareResult<{ documentJson: string }>(response);
      } catch {
        return { ok: false, reason: "network-error" };
      }
    },
  };
}
