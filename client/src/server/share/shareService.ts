import { createHash, randomBytes } from "node:crypto";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import { planPublishTransition } from "@/domain/share/planPublishTransition";
import { planShareLinkCreate } from "@/domain/share/planShareLinkCreate";
import type { CreateShareValue, ShareLinkIssued } from "@/domain/share/shareLink";
import {
  assertIssuableLinkPermission,
  linkPermissionAllowsShareView,
  parseShareLinkPermission,
  type ShareLinkPermission,
} from "@/domain/share/shareLinkPermission";
import type { ShareListItem } from "@/domain/share/shareLocalMetaProjection";
import type { ShareResult } from "@/domain/share/shareResult";
import { requireOwner, type ShareSession } from "@/domain/share/shareSession";
import { loadCurrentShareDocument } from "@/server/share/loadCurrentShareDocument";
import { resolveShareLinkByToken } from "@/server/share/resolveShareLinkByToken";
import type { ShareCommentStore } from "@/server/share/shareCommentStore";
import type {
  ShareLinkRecord,
  SharedMapRecord,
  ShareStore,
} from "@/server/share/shareStore";
import { isD1MissingTableError } from "@/services/share/d1Client";

export type { ShareListItem };

export type ShareServiceDeps = {
  store: ShareStore;
  commentStore: ShareCommentStore;
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

/** view/comment は /share、edit は /collab（参加入口を分離） */
function buildLinkUrl(origin: string, token: string, permission: ShareLinkPermission): string {
  const path = permission === "edit" ? "collab" : "share";
  return `${origin.replace(/\/$/, "")}/${path}/${token}`;
}

function toIssued(
  linkId: string,
  token: string,
  origin: string,
  permission: ShareLinkPermission,
): ShareLinkIssued {
  return {
    linkId,
    url: buildLinkUrl(origin, token, permission),
    token,
    permission,
  };
}

export async function requireOwnedMap(
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

/** Phase 38 の DDL 未実行（コメントの表が無い）だけは許容し、それ以外の失敗は投げ直す */
async function ignoreMissingCommentTables(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!isD1MissingTableError(error)) throw error;
  }
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
  const { store, commentStore, tokenSecret, publicOrigin } = deps;

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
        permission: "view",
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
            link: toIssued(linkId, token, publicOrigin, linkPlan.permission),
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
      const permitted = assertIssuableLinkPermission(input.permission ?? "view");
      if (!permitted.ok) return permitted;

      const linkId = createId();
      const token = createToken();
      const createdAt = nowIso();
      const plan = planShareLinkCreate({
        id: linkId,
        sharedMapId: mapId,
        token,
        secret: tokenSecret,
        permission: permitted.value,
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
        return { ok: true, value: toIssued(linkId, token, publicOrigin, plan.permission) };
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
      // 旧リンクの権限を引き継ぐ。解釈できない権限のリンクは存在しないものとして扱う
      const permission = parseShareLinkPermission(owned.value.link.permission);
      if (permission === null) {
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
        permission,
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

      return { ok: true, value: toIssued(newLinkId, token, publicOrigin, plan.permission) };
    },

    async deleteShare(
      session: ShareSession,
      mapId: string,
    ): Promise<ShareResult<{ sharedMapId: string }>> {
      const owned = await requireOwnedMap(store, session, mapId);
      if (!owned.ok) return owned;
      const revokedAt = nowIso();

      try {
        // 順序固定: 全リンク失効 → current null → 全 R2 削除 → DB 削除（リンク・リビジョン・コメント・スレッド・マップ）
        await store.revokeAllLinksByMap(mapId, revokedAt);
        await store.setCurrentRevision(mapId, null, revokedAt);
        const revisions = await store.listRevisionsByMap(mapId);
        for (const revision of revisions) {
          await store.deleteDocument(revision.r2Key);
        }
        await store.deleteLinksByMap(mapId);
        await store.deleteRevisionsByMap(mapId);
        await ignoreMissingCommentTables(() => commentStore.deleteCommentsByMap(mapId));
        await ignoreMissingCommentTables(() => commentStore.deleteThreadsByMap(mapId));
        await store.deleteMap(mapId);
        return { ok: true, value: { sharedMapId: mapId } };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    async viewByToken(
      token: string,
    ): Promise<ShareResult<{ documentJson: string; permission: ShareLinkPermission }>> {
      const resolved = await resolveShareLinkByToken(store, token, tokenSecret);
      if (!resolved.ok) return resolved;
      // edit は /collab 専用。閲覧 API では存在を漏らさず not-found
      if (!linkPermissionAllowsShareView(resolved.value.permission)) {
        return { ok: false, reason: "not-found" };
      }
      const loaded = await loadCurrentShareDocument(store, resolved.value.map);
      if (!loaded.ok) return loaded;
      return {
        ok: true,
        value: {
          documentJson: loaded.value.documentJson,
          permission: resolved.value.permission,
        },
      };
    },
  };
}

export type ShareService = ReturnType<typeof createShareService>;
