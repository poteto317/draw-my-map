import * as Y from "yjs";

export const COLLAB_LOCAL_ORIGIN = "local";

export type CollabUndoManager = {
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  destroy: () => void;
};

/**
 * 自操作のみ追跡する Yjs UndoManager（設計 決めたこと 8）。
 * 他者 origin / 無 origin の更新は Undo 対象にしない。
 */
export function createCollabUndoManager(doc: Y.Doc): CollabUndoManager {
  const nodes = doc.getMap("nodes");
  const meta = doc.getMap("meta");
  const manager = new Y.UndoManager([nodes, meta], {
    trackedOrigins: new Set([COLLAB_LOCAL_ORIGIN]),
  });

  return {
    undo() {
      if (manager.undoStack.length === 0) return false;
      manager.undo();
      return true;
    },
    redo() {
      if (manager.redoStack.length === 0) return false;
      manager.redo();
      return true;
    },
    canUndo() {
      return manager.undoStack.length > 0;
    },
    canRedo() {
      return manager.redoStack.length > 0;
    },
    destroy() {
      manager.destroy();
    },
  };
}

/** 自操作として Yjs に書く（Undo 対象） */
export function collabLocalTransact(doc: Y.Doc, fn: () => void): void {
  doc.transact(fn, COLLAB_LOCAL_ORIGIN);
}
