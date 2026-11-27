import {
  applyMapDocumentToYDoc,
  yDocToMapDocument,
} from "@/domain/collab/mapDocumentYjs";
import {
  collabParticipantsFromAwarenessStates,
  type CollabAwarenessFields,
} from "@/domain/collab/collabAwarenessParticipants";
import { collabParticipantColor } from "@/domain/collab/collabParticipantColor";
import {
  buildPresenceMaps,
  remotePresencesFromAwarenessStates,
  type PresenceMaps,
} from "@/domain/collab/collabRemotePresence";
import type { CollabParticipant } from "@/domain/collab/collabSessionUi";
import {
  COLLAB_LOCAL_ORIGIN,
  createCollabUndoManager,
  type CollabUndoManager,
} from "@/domain/collab/collabUndoManager";
import type { MapDocumentV3 } from "@/types/mapDocument";
import {
  classifyCollabMessage,
  COLLAB_REMOTE_WS_ORIGIN,
  createCollabAwareness,
  encodeCollabAwarenessUpdate,
  encodeSyncUpdate,
  handleCollabAwarenessMessage,
  handleCollabSyncMessage,
  Y,
} from "@/services/collab/collabYjsProtocol";

export type CollabLocalAwarenessInput = {
  userId: string;
  displayName: string;
  selectedNodeIds: readonly number[];
  viewportCenter: { x: number; y: number };
};

export type CollabDocumentSession = {
  readonly doc: Y.Doc;
  readonly undo: CollabUndoManager;
  /** WS 受信バイナリを処理。応答は send へ */
  handleMessage: (data: Uint8Array, send: (data: Uint8Array) => void) => void;
  /** ローカル MapDocument を Yjs 正本へ（自操作 Undo 対象） */
  pushLocalDocument: (document: MapDocumentV3) => boolean;
  /** Yjs → MapDocument。失敗時 null（空成功に倒さない） */
  readDocument: () => MapDocumentV3 | null;
  setLocalAwareness: (input: CollabLocalAwarenessInput) => void;
  readParticipants: () => readonly CollabParticipant[];
  /** 他者 presence Maps。excludeUserId で自分を除外（L-002: 欠落は載せない） */
  readPresenceMaps: (excludeUserId?: string) => PresenceMaps;
  /** リモート／Undo 反映後の投影用。local push では呼ばない */
  onRemoteOrUndoDocument: (listener: (doc: MapDocumentV3) => void) => () => void;
  destroy: () => void;
};

export type CreateCollabDocumentSessionOptions = {
  /** ローカル Y.Doc 更新を WS へ送る */
  send: (data: Uint8Array) => void;
};

/**
 * 共同編集中の Y.Doc + awareness + UndoManager。
 * sync / awareness プロトコルとローカル編集の正本切替を閉じる。
 */
export function createCollabDocumentSession(
  options: CreateCollabDocumentSessionOptions,
): CollabDocumentSession {
  const doc = new Y.Doc();
  const awareness = createCollabAwareness(doc);
  const undo = createCollabUndoManager(doc);
  const remoteListeners = new Set<(document: MapDocumentV3) => void>();
  let destroyed = false;
  /** pushLocalDocument 中は observer から投影しない（既に UI が正） */
  let pushingLocal = false;

  const notifyProjection = () => {
    if (pushingLocal || destroyed) return;
    const projected = yDocToMapDocument(doc);
    if (!projected.ok) return;
    for (const listener of remoteListeners) {
      listener(projected.value);
    }
  };

  const onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (destroyed) return;
    if (origin === COLLAB_REMOTE_WS_ORIGIN) {
      notifyProjection();
      return;
    }
    // ローカル編集・Undo/Redo → 他者へ配信
    options.send(encodeSyncUpdate(update));
    // pushLocalDocument 中は UI が既に正なので投影しない。Undo は投影する
    if (!pushingLocal) {
      notifyProjection();
    }
  };

  // Undo 後の投影を確実にするため update を購読
  doc.on("update", onDocUpdate);

  const onAwarenessUpdate = (
    {
      added,
      updated,
      removed,
    }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (destroyed) return;
    if (origin === COLLAB_REMOTE_WS_ORIGIN) return;
    const changed = added.concat(updated, removed);
    if (changed.length === 0) return;
    options.send(encodeCollabAwarenessUpdate(awareness, changed));
  };
  awareness.on("update", onAwarenessUpdate);

  return {
    doc,
    undo,

    handleMessage(data, send) {
      if (destroyed) return;
      const kind = classifyCollabMessage(data);
      if (kind === "sync") {
        const reply = handleCollabSyncMessage(doc, data);
        if (reply) send(reply);
        return;
      }
      if (kind === "awareness") {
        handleCollabAwarenessMessage(awareness, data);
      }
    },

    pushLocalDocument(document) {
      if (destroyed) return false;
      pushingLocal = true;
      try {
        const result = applyMapDocumentToYDoc(doc, document, COLLAB_LOCAL_ORIGIN);
        return result.ok;
      } finally {
        pushingLocal = false;
      }
    },

    readDocument() {
      const result = yDocToMapDocument(doc);
      return result.ok ? result.value : null;
    },

    setLocalAwareness(input) {
      if (destroyed) return;
      const color = collabParticipantColor(input.userId);
      awareness.setLocalState({
        userId: input.userId,
        displayName: input.displayName,
        color,
        selectedNodeIds: [...input.selectedNodeIds],
        viewportCenter: input.viewportCenter,
      } satisfies CollabAwarenessFields & {
        selectedNodeIds: number[];
        viewportCenter: { x: number; y: number };
      });
    },

    readParticipants() {
      const states = new Map<number, CollabAwarenessFields | null>();
      for (const [clientId, state] of awareness.getStates()) {
        states.set(clientId, (state ?? null) as CollabAwarenessFields | null);
      }
      return collabParticipantsFromAwarenessStates(states);
    },

    readPresenceMaps(excludeUserId) {
      const states = new Map<number, CollabAwarenessFields | null>();
      for (const [clientId, state] of awareness.getStates()) {
        states.set(clientId, (state ?? null) as CollabAwarenessFields | null);
      }
      return buildPresenceMaps(
        remotePresencesFromAwarenessStates(states, { excludeUserId }),
      );
    },

    onRemoteOrUndoDocument(listener) {
      remoteListeners.add(listener);
      return () => {
        remoteListeners.delete(listener);
      };
    },

    destroy() {
      destroyed = true;
      remoteListeners.clear();
      doc.off("update", onDocUpdate);
      awareness.off("update", onAwarenessUpdate);
      awareness.destroy();
      undo.destroy();
      doc.destroy();
    },
  };
}
