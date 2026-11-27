import { isCollabJoinAtCapacity } from "@/domain/collab/collabJoinAdmission";
import type { ShareResult } from "@/domain/share/shareResult";
import { requireOwner, type ShareSession } from "@/domain/share/shareSession";
import { tokenHash } from "@/domain/share/tokenHash";
import {
  decodeYjsUpdate,
  encodeDocumentJson,
} from "@/server/collab/collabDocumentCodec";
import {
  COLLAB_MAX_CONNECTIONS,
  type CollabRoomClient,
} from "@/server/collab/collabRoomClient";
import type { CollabStore } from "@/server/collab/collabStore";
import { issueCollabTicket } from "@/server/collab/collabTicket";
import type {
  CollabSessionEndValue,
  CollabSessionGetValue,
  CollabSessionStartValue,
} from "@/server/collab/collabTypes";
import type { ShareStore } from "@/server/share/shareStore";

export type CollabServiceDeps = {
  store: CollabStore;
  shareStore: ShareStore;
  room: CollabRoomClient;
  tokenSecret: string;
  ticketSecret: string;
  wsOrigin: string;
  nowIso?: () => string;
  nowMs?: () => number;
  createId?: () => string;
};

function defaultId(): string {
  return crypto.randomUUID();
}

function buildWsUrl(origin: string, sessionId: string): string {
  return `${origin.replace(/\/$/, "")}/collab/${sessionId}`;
}

function artifactR2Key(sessionId: string): string {
  return `collab/${sessionId}/artifact.ydoc`;
}

function toStartValue(
  sessionId: string,
  ticket: string,
  wsOrigin: string,
): CollabSessionStartValue {
  return {
    sessionId,
    ticket,
    wsUrl: buildWsUrl(wsOrigin, sessionId),
  };
}

function toGetValue(row: {
  id: string;
  localMapId: string;
  sharedMapId: string | null;
  status: CollabSessionGetValue["status"];
  artifactR2Key: string | null;
  createdAt: string;
  endedAt: string | null;
}): CollabSessionGetValue {
  return {
    id: row.id,
    localMapId: row.localMapId,
    sharedMapId: row.sharedMapId,
    status: row.status,
    hasArtifact: row.artifactR2Key !== null,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
  };
}

/**
 * edit 共有トークンのみ解決する。view/comment・失効・不明は not-found（存在非漏洩）。
 * permission=edit の発行 API 拡張は Task 6。ここでは行の permission 文字列を見る。
 */
async function resolveEditLink(
  shareStore: ShareStore,
  token: string,
  tokenSecret: string,
): Promise<ShareResult<{ sharedMapId: string }>> {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "not-found" };
  }
  try {
    const link = await shareStore.findLinkByTokenHash(tokenHash(token, tokenSecret));
    if (!link || link.revokedAt !== null) {
      return { ok: false, reason: "not-found" };
    }
    if (link.permission !== "edit") {
      return { ok: false, reason: "not-found" };
    }
    const map = await shareStore.getMap(link.sharedMapId);
    if (!map) {
      return { ok: false, reason: "not-found" };
    }
    return { ok: true, value: { sharedMapId: map.id } };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}

export function createCollabService(deps: CollabServiceDeps) {
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const nowMs = deps.nowMs ?? Date.now;
  const createId = deps.createId ?? defaultId;
  const { store, shareStore, room, tokenSecret, ticketSecret, wsOrigin } = deps;

  return {
    async startSession(
      session: ShareSession,
      input: {
        localMapId: string;
        sharedMapId?: string;
        documentJson?: string;
        /** 前回 ended の artifact を seed に使う。空なら失敗（上書きしない） */
        seedFromArtifact?: boolean;
      },
    ): Promise<ShareResult<CollabSessionStartValue>> {
      const owner = requireOwner(session);
      if (!owner.ok) return owner;

      if (typeof input.localMapId !== "string" || input.localMapId.length === 0) {
        return { ok: false, reason: "invalid-request" };
      }

      try {
        // creating 中も二重 start を拒否（L-003 途中行の競合防止）
        const existing = await store.findOpenByOwnerAndLocalMapId(
          owner.value.userId,
          input.localMapId,
        );
        if (existing) {
          return { ok: false, reason: "already-exists" };
        }

        let sharedMapId: string | null = null;
        if (input.sharedMapId !== undefined) {
          if (typeof input.sharedMapId !== "string" || input.sharedMapId.length === 0) {
            return { ok: false, reason: "invalid-request" };
          }
          const map = await shareStore.getMap(input.sharedMapId);
          if (!map || map.ownerUserId !== owner.value.userId) {
            return { ok: false, reason: "not-found" };
          }
          if (map.localMapId !== input.localMapId) {
            return { ok: false, reason: "invalid-request" };
          }
          sharedMapId = map.id;
        }

        let yjsUpdate: Uint8Array;
        if (input.seedFromArtifact) {
          const previous = await store.findLatestEndedWithArtifact(
            owner.value.userId,
            input.localMapId,
          );
          if (!previous?.artifactR2Key) {
            return { ok: false, reason: "export-empty" };
          }
          const artifact = await store.getArtifact(previous.artifactR2Key);
          if (!artifact || artifact.byteLength === 0) {
            // 空で上書きしない
            return { ok: false, reason: "export-empty" };
          }
          yjsUpdate = artifact;
        } else {
          if (typeof input.documentJson !== "string") {
            return { ok: false, reason: "invalid-request" };
          }
          const encoded = encodeDocumentJson(input.documentJson);
          if (!encoded.ok) return encoded;
          yjsUpdate = encoded.value;
        }

        // L-003: creating → DO seed → active。失敗時は failed（active にしない）
        const sessionId = createId();
        const createdAt = nowIso();
        await store.insertSession({
          id: sessionId,
          ownerUserId: owner.value.userId,
          localMapId: input.localMapId,
          sharedMapId,
          status: "creating",
          artifactR2Key: null,
          createdAt,
          endedAt: null,
        });

        const seeded = await room.seed(sessionId, yjsUpdate);
        if (!seeded.ok) {
          await store.updateStatus(sessionId, "failed");
          return { ok: false, reason: "seed-failed" };
        }

        await store.updateStatus(sessionId, "active");
        await store.addParticipant({
          sessionId,
          userId: owner.value.userId,
          joinedAt: createdAt,
        });

        const ticket = issueCollabTicket(
          { sessionId, userId: owner.value.userId },
          ticketSecret,
          nowMs(),
        );
        return { ok: true, value: toStartValue(sessionId, ticket, wsOrigin) };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    async joinSession(
      session: ShareSession,
      input: { token: string },
    ): Promise<ShareResult<CollabSessionStartValue>> {
      const owner = requireOwner(session);
      if (!owner.ok) return owner;

      const resolved = await resolveEditLink(shareStore, input.token, tokenSecret);
      if (!resolved.ok) return resolved;

      try {
        const active = await store.findActiveBySharedMapId(resolved.value.sharedMapId);
        if (!active) {
          return { ok: false, reason: "no-active-session" };
        }

        const already = await store.hasParticipant(active.id, owner.value.userId);
        if (!already) {
          const countResult = await room.getConnectionCount(active.id);
          if (!countResult.ok) {
            // Worker 障害時は上限を迂回しない（fail-closed）
            return { ok: false, reason: "connection-limit" };
          }
          const participants = await store.listParticipants(active.id);
          if (
            isCollabJoinAtCapacity({
              connectionCount: countResult.value,
              participantCount: participants.length,
              maxConnections: COLLAB_MAX_CONNECTIONS,
            })
          ) {
            return { ok: false, reason: "connection-limit" };
          }
          await store.addParticipant({
            sessionId: active.id,
            userId: owner.value.userId,
            joinedAt: nowIso(),
          });
        }

        const ticket = issueCollabTicket(
          { sessionId: active.id, userId: owner.value.userId },
          ticketSecret,
          nowMs(),
        );
        return { ok: true, value: toStartValue(active.id, ticket, wsOrigin) };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    async endSession(
      session: ShareSession,
      sessionId: string,
    ): Promise<ShareResult<CollabSessionEndValue>> {
      const owner = requireOwner(session);
      if (!owner.ok) return owner;

      try {
        const row = await store.getSession(sessionId);
        if (!row || row.ownerUserId !== owner.value.userId) {
          return { ok: false, reason: "not-found" };
        }
        if (row.status !== "active") {
          return { ok: false, reason: "not-found" };
        }

        // L-003: 先に DO export 確定。失敗なら active のまま
        const exported = await room.exportYjsUpdate(sessionId);
        if (!exported.ok) {
          return { ok: false, reason: exported.reason };
        }

        const documentJson = decodeYjsUpdate(exported.value);
        if (!documentJson.ok) {
          return documentJson;
        }

        const r2Key = artifactR2Key(sessionId);
        await store.putArtifact(r2Key, exported.value);
        await store.updateStatus(sessionId, "ended", {
          endedAt: nowIso(),
          artifactR2Key: r2Key,
        });

        // ended 後は DO/WS を破棄（残留編集・ticket 再接続を防ぐ）
        await room.destroy(sessionId);

        return { ok: true, value: { documentJson: documentJson.value } };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    /**
     * 退出: D1 参加者行を削除して枠を解放。ルームは存続（他者継続）。
     * 所有者も参加者行があれば削除（reissue は owner 判定で可）。
     */
    async leaveSession(
      session: ShareSession,
      sessionId: string,
    ): Promise<ShareResult<void>> {
      const owner = requireOwner(session);
      if (!owner.ok) return owner;

      try {
        const row = await store.getSession(sessionId);
        if (!row || row.status !== "active") {
          return { ok: false, reason: "not-found" };
        }
        const isOwner = row.ownerUserId === owner.value.userId;
        const isParticipant = await store.hasParticipant(sessionId, owner.value.userId);
        if (!isOwner && !isParticipant) {
          return { ok: false, reason: "not-found" };
        }

        await store.removeParticipant(sessionId, owner.value.userId);
        return { ok: true, value: undefined };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    /**
     * TTL 退避 ingest（Worker → Next、service secret）。
     * 空 body は拒否（空文書で上書きしない）。既に ended+artifact なら冪等成功。
     */
    async ingestEvacuate(
      sessionId: string,
      yjsUpdate: Uint8Array,
    ): Promise<ShareResult<void>> {
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        return { ok: false, reason: "invalid-request" };
      }
      if (yjsUpdate.byteLength === 0) {
        return { ok: false, reason: "export-empty" };
      }

      try {
        const row = await store.getSession(sessionId);
        if (!row) {
          return { ok: false, reason: "not-found" };
        }
        if (row.status === "ended" && row.artifactR2Key !== null) {
          return { ok: true, value: undefined };
        }
        if (row.status !== "active" && row.status !== "ended") {
          return { ok: false, reason: "not-found" };
        }

        const r2Key = row.artifactR2Key ?? artifactR2Key(sessionId);
        await store.putArtifact(r2Key, yjsUpdate);
        await store.updateStatus(sessionId, "ended", {
          endedAt: row.endedAt ?? nowIso(),
          artifactR2Key: r2Key,
        });
        return { ok: true, value: undefined };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    async getSession(
      session: ShareSession,
      sessionId: string,
    ): Promise<ShareResult<CollabSessionGetValue>> {
      const owner = requireOwner(session);
      if (!owner.ok) return owner;

      try {
        const row = await store.getSession(sessionId);
        if (!row) {
          return { ok: false, reason: "not-found" };
        }
        const isOwner = row.ownerUserId === owner.value.userId;
        const isParticipant = await store.hasParticipant(sessionId, owner.value.userId);
        if (!isOwner && !isParticipant) {
          return { ok: false, reason: "not-found" };
        }
        // creating / failed は所有者以外に見せない
        if (!isOwner && row.status !== "active" && row.status !== "ended") {
          return { ok: false, reason: "not-found" };
        }
        return { ok: true, value: toGetValue(row) };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },

    /**
     * reconnecting 用の短命 ticket 再発行（60 秒）。
     * 所有者または当該セッション参加者。active のみ。
     */
    async reissueTicket(
      session: ShareSession,
      sessionId: string,
    ): Promise<ShareResult<CollabSessionStartValue>> {
      const owner = requireOwner(session);
      if (!owner.ok) return owner;

      try {
        const row = await store.getSession(sessionId);
        if (!row || row.status !== "active") {
          return { ok: false, reason: "not-found" };
        }
        const isOwner = row.ownerUserId === owner.value.userId;
        const isParticipant = await store.hasParticipant(sessionId, owner.value.userId);
        if (!isOwner && !isParticipant) {
          return { ok: false, reason: "not-found" };
        }

        const ticket = issueCollabTicket(
          { sessionId: row.id, userId: owner.value.userId },
          ticketSecret,
          nowMs(),
        );
        return { ok: true, value: toStartValue(row.id, ticket, wsOrigin) };
      } catch {
        return { ok: false, reason: "storage-error" };
      }
    },
  };
}

export type CollabService = ReturnType<typeof createCollabService>;
