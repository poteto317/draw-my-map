import { createHash, randomBytes } from "node:crypto";
import { assertViewPermission } from "@/domain/share/assertViewPermission";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import { planPublishTransition } from "@/domain/share/planPublishTransition";
import { planShareLinkCreate } from "@/domain/share/planShareLinkCreate";
import type { CreateShareValue, ShareLinkIssued } from "@/domain/share/shareLink";
import type { ShareListItem } from "@/domain/share/shareLocalMetaProjection";
import type { ShareResult } from "@/domain/share/shareResult";
import { requireOwner, type ShareSession } from "@/domain/share/shareSession";
import type {
  ShareLinkRecord,
  SharedMapRecord,
  ShareStore,
} from "@/server/share/shareStore";

export type { ShareListItem };

export type ShareServiceDeps = {
  store: ShareStore;
  tokenSecret: string;
  publicOrigin: string;
  nowIso?: () => string;
  createId?: () => string;
  createToken?: () => string;
};

function defaultId(): string {
  return crypto.randomUUID();
}

function defaultToken(): string {
  return randomBytes(32).toString("base64url");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function revisionR2Key(sharedMapId: string, revisionId: string): string {
  return `shares/${sharedMapId}/${revisionId}.json`;
}

function buildViewUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/share/${token}`;
}

function toIssued(
  linkId: string,
  token: string,
  origin: string,
): ShareLinkIssued {
  return {
    linkId,
    url: buildViewUrl(origin, token),
    token,
  };
}

async function requireOwnedMap(
  store: ShareStore,
  session: ShareSession,
  mapId: string,
): Promise<ShareResult<SharedMapRecord>> {
  const owner = requireOwner(session);
  if (!owner.ok) return owner;
  const map = await store.getMap(mapId);
  if (!map || map.ownerUserId !== owner.value.userId) {
    return { ok: false, reason: "not-found" };
  }
  return { ok: true, value: map };
}

async function requireOwnedLink(
  store: ShareStore,
  session: ShareSession,
  linkId: string,
): Promise<ShareResult<{ link: ShareLinkRecord; map: SharedMapRecord }>> {
  const owner = requireOwner(session);
  if (!owner.ok) return owner;
  const link = await store.getLink(linkId);
  if (!link) return { ok: false, reason: "not-found" };
  const map = await store.getMap(link.sharedMapId);
  if (!map || map.ownerUserId !== owner.value.userId) {
    return { ok: false, reason: "not-found" };
  }
  return { ok: true, value: { link, map } };
}

function validateDocumentJson(documentJson: string): ShareResult<string> {
  const parsed = parseMapDocumentJson(documentJson);
  if (!parsed.ok) return { ok: false, reason: "invalid-document" };
  return { ok: true, value: documentJson };
}

export function createShareService(deps: ShareServiceDeps) {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const createId = deps.createId ?? defaultId;
  const createToken = deps.createToken ?? defaultToken;
  const { store, tokenSecret, publicOrigin } = deps;

  return {
    async listMaps(session: ShareSession): Promise<ShareResult<ShareListItem[]>> {
      const owner = requireOwner(session);
      if (!owner.ok) return owner;
      try {
        const maps = await store.listMapsByOwner(owner.value.userId);
        const items: ShareListItem[] = [];
        for (const map of maps) {
          const links = await store.listLinksByMap(map.id);
          items.push({
            id: map.id,
            localMapId: map.localMapId,
            title: map.title,
            currentRevisionId: map.currentRevisionId,
            createdAt: map.createdAt,
            updatedAt: map.updatedAt,
            links: links.map((link) => ({
              id: link.id,
              permission: link.permission,
              createdAt: link.createdAt,
              revokedAt: link.revokedAt,
              expiresAt: null,
            })),
          });
        }
        return { ok: true, value: items };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    async createShare(
      session: ShareSession,
      input: { localMapId: string; title: string; documentJson: string },
    ): Promise<ShareResult<CreateShareValue>> {
      const owner = requireOwner(session);
      if (!owner.ok) return owner;
      if (!isNonEmptyString(input.localMapId) || !isNonEmptyString(input.title)) {
        return { ok: false, reason: "invalid-request" };
      }
      const doc = validateDocumentJson(input.documentJson);
      if (!doc.ok) return doc;

      // 設計 §5.1: 所有者×ローカルマップは共有 1 行。二重作成で孤児リンクを残さない
      try {
        const existing = await store.findMapByOwnerAndLocalMapId(
          owner.value.userId,
          input.localMapId,
        );
        if (existing) {
          return { ok: false, reason: "already-exists" };
        }
      } catch {
        return { ok: false, reason: "storage-error" };
      }

      const sharedMapId = createId();
      const revisionId = createId();
      const linkId = createId();
      const token = createToken();
      const createdAt = nowIso();
      const r2Key = revisionR2Key(sharedMapId, revisionId);
      const body = new TextEncoder().encode(doc.value);
      const contentSha256 = createHash("sha256").update(body).digest("hex");
      const linkPlan = planShareLinkCreate({
        id: linkId,
        sharedMapId,
        token,
        secret: tokenSecret,
      });

      try {
        await store.insertMap({
          id: sharedMapId,
          ownerUserId: owner.value.userId,
          localMapId: input.localMapId,
          title: input.title,
          currentRevisionId: null,
          createdAt,
          updatedAt: createdAt,
        });

        try {
          await store.putDocument(r2Key, body);
          await store.insertRevision({
            id: revisionId,
            sharedMapId,
            r2Key,
            byteSize: body.byteLength,
            contentSha256,
            publishedAt: createdAt,
          });
          const transition = planPublishTransition({
            currentRevisionId: null,
            nextRevisionId: revisionId,
          });
          await store.setCurrentRevision(
            sharedMapId,
            transition.nextCurrentRevisionId,
            createdAt,
          );
          await store.insertLink({
            id: linkPlan.id,
            sharedMapId: linkPlan.sharedMapId,
            tokenHash: linkPlan.tokenHash,
            permission: linkPlan.permission,
            createdAt,
            revokedAt: null,
            expiresAt: linkPlan.expiresAt,
          });
        } catch {
          // 部分成功を成功扱いにしない: 先に current を null にして空公開相当を残さない
          try {
            await store.setCurrentRevision(sharedMapId, null, nowIso());
            await store.deleteLinksByMap(sharedMapId);
            await store.deleteRevisionsByMap(sharedMapId);
            await store.deleteDocument(r2Key).catch(() => undefined);
            await store.deleteMap(sharedMapId);
          } catch {
            // ロールバック失敗も呼び出し元には storage-error
          }
          return { ok: false, reason: "storage-error" };
        }

        return {
          ok: true,
          value: {
            sharedMapId,
            link: toIssued(linkId, token, publicOrigin),
          },
        };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    async publish(
      session: ShareSession,
      mapId: string,
      input: { documentJson: string },
    ): Promise<ShareResult<{ revisionId: string }>> {
      const owned = await requireOwnedMap(store, session, mapId);
      if (!owned.ok) return owned;
      const doc = validateDocumentJson(input.documentJson);
      if (!doc.ok) return doc;

      const revisionId = createId();
      const publishedAt = nowIso();
      const r2Key = revisionR2Key(mapId, revisionId);
      const body = new TextEncoder().encode(doc.value);
      const contentSha256 = createHash("sha256").update(body).digest("hex");
      const previousRevisionId = owned.value.currentRevisionId;

      try {
        await store.putDocument(r2Key, body);
        await store.insertRevision({
          id: revisionId,
          sharedMapId: mapId,
          r2Key,
          byteSize: body.byteLength,
          contentSha256,
          publishedAt,
        });
        const transition = planPublishTransition({
          currentRevisionId: previousRevisionId,
          nextRevisionId: revisionId,
        });
        await store.setCurrentRevision(
          mapId,
          transition.nextCurrentRevisionId,
          publishedAt,
        );
        return { ok: true, value: { revisionId } };
      } catch {
        // 途中失敗時は旧 current_revision_id のまま（空公開にしない）
        return { ok: false, reason: "storage-error" };
      }
    },

    async createLink(
      session: ShareSession,
      mapId: string,
      input: { permission?: string } = {},
    ): Promise<ShareResult<ShareLinkIssued>> {
      const owned = await requireOwnedMap(store, session, mapId);
      if (!owned.ok) return owned;
      if (owned.value.currentRevisionId === null) {
        return { ok: false, reason: "not-published" };
      }
      const permission = input.permission ?? "view";
      const permitted = assertViewPermission(permission);
      if (!permitted.ok) return permitted;

      const linkId = createId();
      const token = createToken();
      const createdAt = nowIso();
      const plan = planShareLinkCreate({
        id: linkId,
        sharedMapId: mapId,
        token,
        secret: tokenSecret,
      });

      try {
        await store.insertLink({
          id: plan.id,
          sharedMapId: plan.sharedMapId,
          tokenHash: plan.tokenHash,
          permission: plan.permission,
          createdAt,
          revokedAt: null,
          expiresAt: plan.expiresAt,
        });
        return { ok: true, value: toIssued(linkId, token, publicOrigin) };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    async revokeLink(
      session: ShareSession,
      linkId: string,
    ): Promise<ShareResult<{ linkId: string }>> {
      const owned = await requireOwnedLink(store, session, linkId);
      if (!owned.ok) return owned;
      try {
        await store.revokeLink(linkId, nowIso());
        return { ok: true, value: { linkId } };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    async reissueLink(
      session: ShareSession,
      linkId: string,
    ): Promise<ShareResult<ShareLinkIssued>> {
      const owned = await requireOwnedLink(store, session, linkId);
      if (!owned.ok) return owned;
      if (owned.value.map.currentRevisionId === null) {
        return { ok: false, reason: "not-published" };
      }
      if (owned.value.link.revokedAt !== null) {
        return { ok: false, reason: "not-found" };
      }

      const newLinkId = createId();
      const token = createToken();
      const createdAt = nowIso();
      const plan = planShareLinkCreate({
        id: newLinkId,
        sharedMapId: owned.value.map.id,
        token,
        secret: tokenSecret,
      });

      try {
        // 新リンク確定後に旧失効（insert 失敗時は旧を維持）
        await store.insertLink({
          id: plan.id,
          sharedMapId: plan.sharedMapId,
          tokenHash: plan.tokenHash,
          permission: plan.permission,
          createdAt,
          revokedAt: null,
          expiresAt: plan.expiresAt,
        });
      } catch {
        return { ok: false, reason: "storage-error" };
      }

      try {
        await store.revokeLink(linkId, createdAt);
      } catch {
        // 二重有効を防ぐ: 旧失効に失敗したら新リンクを削除して補償
        try {
          await store.deleteLink(newLinkId);
        } catch {
          // 補償失敗時も storage-error（新が残る可能性は残リスク）
        }
        return { ok: false, reason: "storage-error" };
      }

      return { ok: true, value: toIssued(newLinkId, token, publicOrigin) };
    },

    async deleteShare(
      session: ShareSession,
      mapId: string,
    ): Promise<ShareResult<{ sharedMapId: string }>> {
      const owned = await requireOwnedMap(store, session, mapId);
      if (!owned.ok) return owned;
      const revokedAt = nowIso();

      try {
        // 順序固定: 全リンク失効 → current null → 全 R2 削除 → DB 削除
        await store.revokeAllLinksByMap(mapId, revokedAt);
        await store.setCurrentRevision(mapId, null, revokedAt);
        const revisions = await store.listRevisionsByMap(mapId);
        for (const revision of revisions) {
          await store.deleteDocument(revision.r2Key);
        }
        await store.deleteLinksByMap(mapId);
        await store.deleteRevisionsByMap(mapId);
        await store.deleteMap(mapId);
        return { ok: true, value: { sharedMapId: mapId } };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    async viewByToken(
      token: string,
    ): Promise<ShareResult<{ documentJson: string }>> {
      if (!isNonEmptyString(token)) {
        return { ok: false, reason: "not-found" };
      }
      try {
        const hash = planShareLinkCreate({
          id: "probe",
          sharedMapId: "probe",
          token,
          secret: tokenSecret,
        }).tokenHash;
        const link = await store.findLinkByTokenHash(hash);
        if (!link || link.revokedAt !== null) {
          return { ok: false, reason: "not-found" };
        }
        const permitted = assertViewPermission(link.permission);
        if (!permitted.ok) return { ok: false, reason: "not-found" };

        const map = await store.getMap(link.sharedMapId);
        if (!map || map.currentRevisionId === null) {
          return { ok: false, reason: "not-found" };
        }
        const revision = await store.getRevision(map.currentRevisionId);
        if (!revision) return { ok: false, reason: "not-found" };
        const bytes = await store.getDocument(revision.r2Key);
        if (!bytes) return { ok: false, reason: "not-found" };
        // publish 時に保存した contentSha256 があれば取得バイト列と照合（改ざん・破損・取り違え）
        if (isNonEmptyString(revision.contentSha256)) {
          const actualSha256 = createHash("sha256").update(bytes).digest("hex");
          if (actualSha256 !== revision.contentSha256) {
            return { ok: false, reason: "storage-error" };
          }
        }
        return { ok: true, value: { documentJson: new TextDecoder().decode(bytes) } };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },
  };
}

export type ShareService = ReturnType<typeof createShareService>;
