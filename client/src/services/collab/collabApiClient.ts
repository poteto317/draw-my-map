import type {
  CollabSessionEndValue,
  CollabSessionGetValue,
  CollabSessionStartValue,
} from "@/domain/collab/collabApiDto";
import type { ShareResult } from "@/domain/share/shareResult";
import { parseShareResult, resolveFetch } from "@/services/share/shareApiClient";

type FetchLike = typeof fetch;

export type CollabApiClient = {
  startSession: (input: {
    localMapId: string;
    sharedMapId?: string;
    documentJson?: string;
    seedFromArtifact?: boolean;
  }) => Promise<ShareResult<CollabSessionStartValue>>;
  joinSession: (input: {
    token: string;
  }) => Promise<ShareResult<CollabSessionStartValue>>;
  endSession: (sessionId: string) => Promise<ShareResult<CollabSessionEndValue>>;
  /** 退出。D1 参加者削除（枠解放）。ルームは存続 */
  leaveSession: (sessionId: string) => Promise<ShareResult<void>>;
  getSession: (sessionId: string) => Promise<ShareResult<CollabSessionGetValue>>;
  /** reconnecting 用。短命 ticket（60 秒）を取り直す */
  reissueTicket: (sessionId: string) => Promise<ShareResult<CollabSessionStartValue>>;
};

export function createCollabApiClient(fetchImpl?: FetchLike): CollabApiClient {
  const fetchFn = resolveFetch(fetchImpl);

  return {
    async startSession(input) {
      const response = await fetchFn("/api/collab/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return parseShareResult<CollabSessionStartValue>(response);
    },

    async joinSession(input) {
      const response = await fetchFn("/api/collab/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return parseShareResult<CollabSessionStartValue>(response);
    },

    async endSession(sessionId) {
      const response = await fetchFn(
        `/api/collab/sessions/${encodeURIComponent(sessionId)}/end`,
        { method: "POST" },
      );
      return parseShareResult<CollabSessionEndValue>(response);
    },

    async leaveSession(sessionId) {
      const response = await fetchFn(
        `/api/collab/sessions/${encodeURIComponent(sessionId)}/leave`,
        { method: "POST" },
      );
      return parseShareResult<void>(response);
    },

    async getSession(sessionId) {
      const response = await fetchFn(
        `/api/collab/sessions/${encodeURIComponent(sessionId)}`,
        { method: "GET" },
      );
      return parseShareResult<CollabSessionGetValue>(response);
    },

    async reissueTicket(sessionId) {
      const response = await fetchFn(
        `/api/collab/sessions/${encodeURIComponent(sessionId)}/ticket`,
        { method: "POST" },
      );
      return parseShareResult<CollabSessionStartValue>(response);
    },
  };
}
