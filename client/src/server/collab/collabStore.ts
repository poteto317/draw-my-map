import type {
  CollabParticipantRow,
  CollabSessionRow,
  CollabSessionStatus,
} from "@/server/collab/collabTypes";
import type { D1Client } from "@/services/share/d1Client";
import type { R2Client } from "@/services/share/r2Client";

export type CollabStore = {
  insertSession(row: CollabSessionRow): Promise<void>;
  getSession(id: string): Promise<CollabSessionRow | null>;
  findActiveBySharedMapId(sharedMapId: string): Promise<CollabSessionRow | null>;
  /** creating / active を二重 start 排他の対象にする */
  findOpenByOwnerAndLocalMapId(
    ownerUserId: string,
    localMapId: string,
  ): Promise<CollabSessionRow | null>;
  /** 同一 owner+localMapId の最新 ended（artifact 取込用） */
  findLatestEndedWithArtifact(
    ownerUserId: string,
    localMapId: string,
  ): Promise<CollabSessionRow | null>;
  updateStatus(
    id: string,
    status: CollabSessionStatus,
    patch?: { endedAt?: string | null; artifactR2Key?: string | null },
  ): Promise<void>;
  addParticipant(row: CollabParticipantRow): Promise<void>;
  removeParticipant(sessionId: string, userId: string): Promise<void>;
  listParticipants(sessionId: string): Promise<CollabParticipantRow[]>;
  hasParticipant(sessionId: string, userId: string): Promise<boolean>;
  putArtifact(r2Key: string, body: Uint8Array): Promise<void>;
  getArtifact(r2Key: string): Promise<Uint8Array | null>;
};

type SessionRow = {
  id: string;
  owner_user_id: string;
  local_map_id: string;
  shared_map_id: string | null;
  status: string;
  artifact_r2_key: string | null;
  created_at: string;
  ended_at: string | null;
};

type ParticipantRow = {
  session_id: string;
  user_id: string;
  joined_at: string;
};

function isStatus(value: string): value is CollabSessionRow["status"] {
  return (
    value === "creating" ||
    value === "active" ||
    value === "ended" ||
    value === "failed"
  );
}

function sessionFromRow(row: SessionRow): CollabSessionRow {
  if (!isStatus(row.status)) {
    throw new Error("invalid-collab-session-status");
  }
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    localMapId: row.local_map_id,
    sharedMapId: row.shared_map_id,
    status: row.status,
    artifactR2Key: row.artifact_r2_key,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

function participantFromRow(row: ParticipantRow): CollabParticipantRow {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    joinedAt: row.joined_at,
  };
}

/** D1 + R2。DDL は docs/setup で別途（Task 7） */
export function createCloudflareCollabStore(d1: D1Client, r2: R2Client): CollabStore {
  return {
    async insertSession(row) {
      await d1.exec(
        `INSERT INTO collab_sessions
          (id, owner_user_id, local_map_id, shared_map_id, status, artifact_r2_key, created_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.ownerUserId,
          row.localMapId,
          row.sharedMapId,
          row.status,
          row.artifactR2Key,
          row.createdAt,
          row.endedAt,
        ],
      );
    },

    async getSession(id) {
      const result = await d1.exec(
        `SELECT id, owner_user_id, local_map_id, shared_map_id, status, artifact_r2_key, created_at, ended_at
         FROM collab_sessions WHERE id = ? LIMIT 1`,
        [id],
      );
      const row = result.results[0] as SessionRow | undefined;
      return row ? sessionFromRow(row) : null;
    },

    async findActiveBySharedMapId(sharedMapId) {
      const result = await d1.exec(
        `SELECT id, owner_user_id, local_map_id, shared_map_id, status, artifact_r2_key, created_at, ended_at
         FROM collab_sessions
         WHERE shared_map_id = ? AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [sharedMapId],
      );
      const row = result.results[0] as SessionRow | undefined;
      return row ? sessionFromRow(row) : null;
    },

    async findOpenByOwnerAndLocalMapId(ownerUserId, localMapId) {
      const result = await d1.exec(
        `SELECT id, owner_user_id, local_map_id, shared_map_id, status, artifact_r2_key, created_at, ended_at
         FROM collab_sessions
         WHERE owner_user_id = ? AND local_map_id = ?
           AND status IN ('creating', 'active')
         ORDER BY created_at DESC LIMIT 1`,
        [ownerUserId, localMapId],
      );
      const row = result.results[0] as SessionRow | undefined;
      return row ? sessionFromRow(row) : null;
    },

    async findLatestEndedWithArtifact(ownerUserId, localMapId) {
      const result = await d1.exec(
        `SELECT id, owner_user_id, local_map_id, shared_map_id, status, artifact_r2_key, created_at, ended_at
         FROM collab_sessions
         WHERE owner_user_id = ? AND local_map_id = ? AND status = 'ended'
           AND artifact_r2_key IS NOT NULL
         ORDER BY ended_at DESC LIMIT 1`,
        [ownerUserId, localMapId],
      );
      const row = result.results[0] as SessionRow | undefined;
      return row ? sessionFromRow(row) : null;
    },

    async updateStatus(id, status, patch = {}) {
      const endedAt = patch.endedAt === undefined ? undefined : patch.endedAt;
      const artifactR2Key =
        patch.artifactR2Key === undefined ? undefined : patch.artifactR2Key;

      if (endedAt !== undefined && artifactR2Key !== undefined) {
        await d1.exec(
          `UPDATE collab_sessions SET status = ?, ended_at = ?, artifact_r2_key = ? WHERE id = ?`,
          [status, endedAt, artifactR2Key, id],
        );
        return;
      }
      if (endedAt !== undefined) {
        await d1.exec(`UPDATE collab_sessions SET status = ?, ended_at = ? WHERE id = ?`, [
          status,
          endedAt,
          id,
        ]);
        return;
      }
      if (artifactR2Key !== undefined) {
        await d1.exec(
          `UPDATE collab_sessions SET status = ?, artifact_r2_key = ? WHERE id = ?`,
          [status, artifactR2Key, id],
        );
        return;
      }
      await d1.exec(`UPDATE collab_sessions SET status = ? WHERE id = ?`, [status, id]);
    },

    async addParticipant(row) {
      await d1.exec(
        `INSERT OR IGNORE INTO collab_participants (session_id, user_id, joined_at) VALUES (?, ?, ?)`,
        [row.sessionId, row.userId, row.joinedAt],
      );
    },

    async removeParticipant(sessionId, userId) {
      await d1.exec(
        `DELETE FROM collab_participants WHERE session_id = ? AND user_id = ?`,
        [sessionId, userId],
      );
    },

    async listParticipants(sessionId) {
      const result = await d1.exec(
        `SELECT session_id, user_id, joined_at FROM collab_participants
         WHERE session_id = ? ORDER BY joined_at ASC`,
        [sessionId],
      );
      return (result.results as ParticipantRow[]).map(participantFromRow);
    },

    async hasParticipant(sessionId, userId) {
      const result = await d1.exec(
        `SELECT 1 AS ok FROM collab_participants WHERE session_id = ? AND user_id = ? LIMIT 1`,
        [sessionId, userId],
      );
      return result.results.length > 0;
    },

    async putArtifact(r2Key, body) {
      await r2.putObject(r2Key, body, "application/octet-stream");
    },

    async getArtifact(r2Key) {
      return r2.getObject(r2Key);
    },
  };
}
