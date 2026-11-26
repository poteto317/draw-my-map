import type { D1Client } from "@/services/share/d1Client";
import type { R2Client } from "@/services/share/r2Client";

export type SharedMapRecord = {
  id: string;
  ownerUserId: string;
  localMapId: string;
  title: string;
  currentRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShareRevisionRecord = {
  id: string;
  sharedMapId: string;
  r2Key: string;
  byteSize: number;
  contentSha256: string;
  publishedAt: string;
};

export type ShareLinkRecord = {
  id: string;
  sharedMapId: string;
  tokenHash: string;
  permission: string;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: null;
};

export type ShareStore = {
  listMapsByOwner(ownerUserId: string): Promise<SharedMapRecord[]>;
  getMap(id: string): Promise<SharedMapRecord | null>;
  /** 所有者×ローカルマップ ID で既存共有を探す（二重作成防止） */
  findMapByOwnerAndLocalMapId(
    ownerUserId: string,
    localMapId: string,
  ): Promise<SharedMapRecord | null>;
  insertMap(row: SharedMapRecord): Promise<void>;
  setCurrentRevision(mapId: string, revisionId: string | null, updatedAt: string): Promise<void>;
  deleteMap(id: string): Promise<void>;

  insertRevision(row: ShareRevisionRecord): Promise<void>;
  listRevisionsByMap(sharedMapId: string): Promise<ShareRevisionRecord[]>;
  getRevision(id: string): Promise<ShareRevisionRecord | null>;
  deleteRevisionsByMap(sharedMapId: string): Promise<void>;

  insertLink(row: ShareLinkRecord): Promise<void>;
  getLink(id: string): Promise<ShareLinkRecord | null>;
  listLinksByMap(sharedMapId: string): Promise<ShareLinkRecord[]>;
  findLinkByTokenHash(tokenHash: string): Promise<ShareLinkRecord | null>;
  revokeLink(id: string, revokedAt: string): Promise<void>;
  revokeAllLinksByMap(sharedMapId: string, revokedAt: string): Promise<void>;
  deleteLink(id: string): Promise<void>;
  deleteLinksByMap(sharedMapId: string): Promise<void>;

  putDocument(r2Key: string, body: Uint8Array): Promise<void>;
  getDocument(r2Key: string): Promise<Uint8Array | null>;
  deleteDocument(r2Key: string): Promise<void>;
};

type MapRow = {
  id: string;
  owner_user_id: string;
  local_map_id: string;
  title: string;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
};

type RevisionRow = {
  id: string;
  shared_map_id: string;
  r2_key: string;
  byte_size: number;
  content_sha256: string;
  published_at: string;
};

type LinkRow = {
  id: string;
  shared_map_id: string;
  token_hash: string;
  permission: string;
  created_at: string;
  revoked_at: string | null;
  expires_at: string | null;
};

function mapFromRow(row: MapRow): SharedMapRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    localMapId: row.local_map_id,
    title: row.title,
    currentRevisionId: row.current_revision_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function revisionFromRow(row: RevisionRow): ShareRevisionRecord {
  return {
    id: row.id,
    sharedMapId: row.shared_map_id,
    r2Key: row.r2_key,
    byteSize: row.byte_size,
    contentSha256: row.content_sha256,
    publishedAt: row.published_at,
  };
}

function linkFromRow(row: LinkRow): ShareLinkRecord {
  return {
    id: row.id,
    sharedMapId: row.shared_map_id,
    tokenHash: row.token_hash,
    permission: row.permission,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    expiresAt: null,
  };
}

/** D1 REST + R2 を束ねた永続化（秘密はクライアント生成時に閉じる） */
export function createCloudflareShareStore(d1: D1Client, r2: R2Client): ShareStore {
  return {
    async listMapsByOwner(ownerUserId) {
      const result = await d1.exec(
        "SELECT id, owner_user_id, local_map_id, title, current_revision_id, created_at, updated_at FROM shared_maps WHERE owner_user_id = ? ORDER BY updated_at DESC",
        [ownerUserId],
      );
      return (result.results as MapRow[]).map(mapFromRow);
    },

    async getMap(id) {
      const result = await d1.exec(
        "SELECT id, owner_user_id, local_map_id, title, current_revision_id, created_at, updated_at FROM shared_maps WHERE id = ? LIMIT 1",
        [id],
      );
      const row = result.results[0] as MapRow | undefined;
      return row ? mapFromRow(row) : null;
    },

    async findMapByOwnerAndLocalMapId(ownerUserId, localMapId) {
      const result = await d1.exec(
        "SELECT id, owner_user_id, local_map_id, title, current_revision_id, created_at, updated_at FROM shared_maps WHERE owner_user_id = ? AND local_map_id = ? LIMIT 1",
        [ownerUserId, localMapId],
      );
      const row = result.results[0] as MapRow | undefined;
      return row ? mapFromRow(row) : null;
    },

    async insertMap(row) {
      await d1.exec(
        "INSERT INTO shared_maps (id, owner_user_id, local_map_id, title, current_revision_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          row.id,
          row.ownerUserId,
          row.localMapId,
          row.title,
          row.currentRevisionId,
          row.createdAt,
          row.updatedAt,
        ],
      );
    },

    async setCurrentRevision(mapId, revisionId, updatedAt) {
      await d1.exec(
        "UPDATE shared_maps SET current_revision_id = ?, updated_at = ? WHERE id = ?",
        [revisionId, updatedAt, mapId],
      );
    },

    async deleteMap(id) {
      await d1.exec("DELETE FROM shared_maps WHERE id = ?", [id]);
    },

    async insertRevision(row) {
      await d1.exec(
        "INSERT INTO share_revisions (id, shared_map_id, r2_key, byte_size, content_sha256, published_at) VALUES (?, ?, ?, ?, ?, ?)",
        [row.id, row.sharedMapId, row.r2Key, row.byteSize, row.contentSha256, row.publishedAt],
      );
    },

    async listRevisionsByMap(sharedMapId) {
      const result = await d1.exec(
        "SELECT id, shared_map_id, r2_key, byte_size, content_sha256, published_at FROM share_revisions WHERE shared_map_id = ?",
        [sharedMapId],
      );
      return (result.results as RevisionRow[]).map(revisionFromRow);
    },

    async getRevision(id) {
      const result = await d1.exec(
        "SELECT id, shared_map_id, r2_key, byte_size, content_sha256, published_at FROM share_revisions WHERE id = ? LIMIT 1",
        [id],
      );
      const row = result.results[0] as RevisionRow | undefined;
      return row ? revisionFromRow(row) : null;
    },

    async deleteRevisionsByMap(sharedMapId) {
      await d1.exec("DELETE FROM share_revisions WHERE shared_map_id = ?", [sharedMapId]);
    },

    async insertLink(row) {
      await d1.exec(
        "INSERT INTO share_links (id, shared_map_id, token_hash, permission, created_at, revoked_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          row.id,
          row.sharedMapId,
          row.tokenHash,
          row.permission,
          row.createdAt,
          row.revokedAt,
          row.expiresAt,
        ],
      );
    },

    async getLink(id) {
      const result = await d1.exec(
        "SELECT id, shared_map_id, token_hash, permission, created_at, revoked_at, expires_at FROM share_links WHERE id = ? LIMIT 1",
        [id],
      );
      const row = result.results[0] as LinkRow | undefined;
      return row ? linkFromRow(row) : null;
    },

    async listLinksByMap(sharedMapId) {
      const result = await d1.exec(
        "SELECT id, shared_map_id, token_hash, permission, created_at, revoked_at, expires_at FROM share_links WHERE shared_map_id = ? ORDER BY created_at ASC",
        [sharedMapId],
      );
      return (result.results as LinkRow[]).map(linkFromRow);
    },

    async findLinkByTokenHash(tokenHash) {
      const result = await d1.exec(
        "SELECT id, shared_map_id, token_hash, permission, created_at, revoked_at, expires_at FROM share_links WHERE token_hash = ? LIMIT 1",
        [tokenHash],
      );
      const row = result.results[0] as LinkRow | undefined;
      return row ? linkFromRow(row) : null;
    },

    async revokeLink(id, revokedAt) {
      await d1.exec("UPDATE share_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [
        revokedAt,
        id,
      ]);
    },

    async revokeAllLinksByMap(sharedMapId, revokedAt) {
      await d1.exec(
        "UPDATE share_links SET revoked_at = ? WHERE shared_map_id = ? AND revoked_at IS NULL",
        [revokedAt, sharedMapId],
      );
    },

    async deleteLink(id) {
      await d1.exec("DELETE FROM share_links WHERE id = ?", [id]);
    },

    async deleteLinksByMap(sharedMapId) {
      await d1.exec("DELETE FROM share_links WHERE shared_map_id = ?", [sharedMapId]);
    },

    async putDocument(r2Key, body) {
      await r2.putObject(r2Key, body, "application/json");
    },

    async getDocument(r2Key) {
      return r2.getObject(r2Key);
    },

    async deleteDocument(r2Key) {
      await r2.deleteObject(r2Key);
    },
  };
}
