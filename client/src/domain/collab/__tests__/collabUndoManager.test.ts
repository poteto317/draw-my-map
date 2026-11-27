import * as Y from "yjs";
import {
  COLLAB_LOCAL_ORIGIN,
  collabLocalTransact,
  createCollabUndoManager,
} from "@/domain/collab/collabUndoManager";

describe("createCollabUndoManager", () => {
  it("自操作だけ Undo し、他者操作は消さない", () => {
    const doc = new Y.Doc();
    const nodes = doc.getMap<Y.Map<unknown>>("nodes");
    const undo = createCollabUndoManager(doc);

    collabLocalTransact(doc, () => {
      const node = new Y.Map();
      node.set("label", "自分");
      nodes.set("1", node);
    });
    expect(nodes.get("1")?.get("label")).toBe("自分");

    // 他者 origin
    doc.transact(() => {
      const node = new Y.Map();
      node.set("label", "他者");
      nodes.set("2", node);
    }, "remote-user");

    expect(nodes.has("2")).toBe(true);
    expect(undo.canUndo()).toBe(true);
    expect(undo.undo()).toBe(true);

    // 自操作（1）だけ消え、他者（2）は残る
    expect(nodes.has("1")).toBe(false);
    expect(nodes.has("2")).toBe(true);
    expect(nodes.get("2")?.get("label")).toBe("他者");

    undo.destroy();
  });

  it("trackedOrigins 外の更新は Undo スタックに載せない", () => {
    const doc = new Y.Doc();
    const nodes = doc.getMap("nodes");
    const undo = createCollabUndoManager(doc);

    doc.transact(() => {
      nodes.set("x", "remote");
    }, "other");
    expect(undo.canUndo()).toBe(false);

    doc.transact(() => {
      nodes.set("y", "local");
    }, COLLAB_LOCAL_ORIGIN);
    expect(undo.canUndo()).toBe(true);

    undo.destroy();
  });
});
