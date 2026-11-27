import type { CollabStore } from "@/server/collab/collabStore";
import type {
  CollabParticipantRow,
  CollabSessionRow,
} from "@/server/collab/collabTypes";

/** API 契約テスト用のインメモリ CollabStore */
export function createMemoryCollabStore(): CollabStore {
  const sessions = new Map<string, CollabSessionRow>();
  const participants = new Map<string, CollabParticipantRow>();
  const artifacts = new Map<string, Uint8Array>();

  function participantKey(sessionId: string, userId: string): string {
    return `${sessionId}:${userId}`;
  }

  return {
    async insertSession(row) {
      sessions.set(row.id, { ...row });
    },
    async getSession(id) {
      const row = sessions.get(id);
      return row ? { ...row } : null;
    },
    async findActiveBySharedMapId(sharedMapId) {
      const matches = [...sessions.values()]
        .filter((s) => s.sharedMapId === sharedMapId && s.status === "active")
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return matches[0] ? { ...matches[0] } : null;
    },
    async findOpenByOwnerAndLocalMapId(ownerUserId, localMapId) {
      const matches = [...sessions.values()]
        .filter(
          (s) =>
            s.ownerUserId === ownerUserId &&
            s.localMapId === localMapId &&
            (s.status === "creating" || s.status === "active"),
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return matches[0] ? { ...matches[0] } : null;
    },
    async findLatestEndedWithArtifact(ownerUserId, localMapId) {
      const matches = [...sessions.values()]
        .filter(
          (s) =>
            s.ownerUserId === ownerUserId &&
            s.localMapId === localMapId &&
            s.status === "ended" &&
            s.artifactR2Key !== null,
        )
        .sort((a, b) => {
          const aEnd = a.endedAt ?? "";
          const bEnd = b.endedAt ?? "";
          return aEnd < bEnd ? 1 : -1;
        });
      return matches[0] ? { ...matches[0] } : null;
    },
    async updateStatus(id, status, patch = {}) {
      const current = sessions.get(id);
      if (!current) throw new Error("missing-session");
      sessions.set(id, {
        ...current,
        status,
        endedAt: patch.endedAt !== undefined ? patch.endedAt : current.endedAt,
        artifactR2Key:
          patch.artifactR2Key !== undefined ? patch.artifactR2Key : current.artifactR2Key,
      });
    },
    async addParticipant(row) {
      const key = participantKey(row.sessionId, row.userId);
      if (participants.has(key)) return;
      participants.set(key, { ...row });
    },
    async removeParticipant(sessionId, userId) {
      participants.delete(participantKey(sessionId, userId));
    },
    async listParticipants(sessionId) {
      return [...participants.values()]
        .filter((p) => p.sessionId === sessionId)
        .sort((a, b) => (a.joinedAt < b.joinedAt ? -1 : 1))
        .map((p) => ({ ...p }));
    },
    async hasParticipant(sessionId, userId) {
      return participants.has(participantKey(sessionId, userId));
    },
    async putArtifact(r2Key, body) {
      artifacts.set(r2Key, body);
    },
    async getArtifact(r2Key) {
      return artifacts.get(r2Key) ?? null;
    },
  };
}
