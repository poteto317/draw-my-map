import type {
  ShareLinkRecord,
  ShareRevisionRecord,
  ShareStore,
  SharedMapRecord,
} from "@/server/share/shareStore";

/** API 契約テスト用のインメモリ Store */
export function createMemoryShareStore(): ShareStore {
  const maps = new Map<string, SharedMapRecord>();
  const revisions = new Map<string, ShareRevisionRecord>();
  const links = new Map<string, ShareLinkRecord>();
  const objects = new Map<string, Uint8Array>();

  return {
    async listMapsByOwner(ownerUserId) {
      return [...maps.values()]
        .filter((m) => m.ownerUserId === ownerUserId)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    async getMap(id) {
      return maps.get(id) ?? null;
    },
    async findMapByOwnerAndLocalMapId(ownerUserId, localMapId) {
      return (
        [...maps.values()].find(
          (m) => m.ownerUserId === ownerUserId && m.localMapId === localMapId,
        ) ?? null
      );
    },
    async insertMap(row) {
      maps.set(row.id, { ...row });
    },
    async setCurrentRevision(mapId, revisionId, updatedAt) {
      const map = maps.get(mapId);
      if (!map) throw new Error("missing-map");
      maps.set(mapId, { ...map, currentRevisionId: revisionId, updatedAt });
    },
    async deleteMap(id) {
      maps.delete(id);
    },
    async insertRevision(row) {
      revisions.set(row.id, { ...row });
    },
    async listRevisionsByMap(sharedMapId) {
      return [...revisions.values()].filter((r) => r.sharedMapId === sharedMapId);
    },
    async getRevision(id) {
      return revisions.get(id) ?? null;
    },
    async deleteRevisionsByMap(sharedMapId) {
      for (const [id, row] of revisions) {
        if (row.sharedMapId === sharedMapId) revisions.delete(id);
      }
    },
    async insertLink(row) {
      links.set(row.id, { ...row, expiresAt: null });
    },
    async getLink(id) {
      return links.get(id) ?? null;
    },
    async listLinksByMap(sharedMapId) {
      return [...links.values()]
        .filter((l) => l.sharedMapId === sharedMapId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    },
    async findLinkByTokenHash(tokenHash) {
      return [...links.values()].find((l) => l.tokenHash === tokenHash) ?? null;
    },
    async revokeLink(id, revokedAt) {
      const link = links.get(id);
      if (!link || link.revokedAt !== null) return;
      links.set(id, { ...link, revokedAt });
    },
    async revokeAllLinksByMap(sharedMapId, revokedAt) {
      for (const [id, link] of links) {
        if (link.sharedMapId === sharedMapId && link.revokedAt === null) {
          links.set(id, { ...link, revokedAt });
        }
      }
    },
    async deleteLink(id) {
      links.delete(id);
    },
    async deleteLinksByMap(sharedMapId) {
      for (const [id, link] of links) {
        if (link.sharedMapId === sharedMapId) links.delete(id);
      }
    },
    async putDocument(r2Key, body) {
      objects.set(r2Key, body);
    },
    async getDocument(r2Key) {
      return objects.get(r2Key) ?? null;
    },
    async deleteDocument(r2Key) {
      objects.delete(r2Key);
    },
  };
}

/** Jest 用のダミー D1/R2（store を直接渡すとき用） */
export function unusedClients(): {
  d1: { exec: jest.Mock };
  r2: { putObject: jest.Mock; getObject: jest.Mock; deleteObject: jest.Mock };
} {
  return {
    d1: { exec: jest.fn() },
    r2: {
      putObject: jest.fn(),
      getObject: jest.fn(),
      deleteObject: jest.fn(),
    },
  };
}
