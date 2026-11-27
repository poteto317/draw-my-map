import { TextDecoder, TextEncoder } from "util";
import { applyMapDocumentToYDoc } from "@/domain/collab/mapDocumentYjs";
import { createCollabDocumentSession } from "@/services/collab/collabDocumentSession";
import { COLLAB_REMOTE_WS_ORIGIN } from "@/services/collab/collabYjsProtocol";
import type { MapDocumentV3 } from "@/types/mapDocument";

Object.assign(globalThis, { TextEncoder, TextDecoder });

const baseDoc: MapDocumentV3 = {
  version: 3,
  layoutMode: "manual",
  nodes: [
    {
      id: 1,
      parentId: null,
      label: "ルート",
      importance: "high",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    },
  ],
};

describe("createCollabDocumentSession", () => {
  it("自操作は Undo でき、リモート origin の変更は消さない", () => {
    const session = createCollabDocumentSession({ send: () => {} });

    expect(session.pushLocalDocument(baseDoc)).toBe(true);
    expect(session.undo.canUndo()).toBe(true);

    session.pushLocalDocument({
      ...baseDoc,
      nodes: [{ ...baseDoc.nodes[0]!, label: "自分" }],
    });

    applyMapDocumentToYDoc(
      session.doc,
      {
        ...baseDoc,
        nodes: [
          { ...baseDoc.nodes[0]!, label: "自分" },
          {
            id: 2,
            parentId: 1,
            label: "他者",
            importance: "low",
            x: 1,
            y: 1,
            width: 10,
            height: 10,
          },
        ],
      },
      COLLAB_REMOTE_WS_ORIGIN,
    );

    expect(session.readDocument()?.nodes.some((n) => n.id === 2)).toBe(true);
    expect(session.undo.undo()).toBe(true);
    const after = session.readDocument();
    // 自操作（label=自分）の Undo で前のローカル状態へ。他者ノードはリモート origin のため残る
    expect(after?.nodes.some((n) => n.id === 2)).toBe(true);

    session.destroy();
  });

  it("awareness から参加者を読む", () => {
    const session = createCollabDocumentSession({ send: () => {} });
    session.setLocalAwareness({
      userId: "u1",
      displayName: "太郎",
      selectedNodeIds: [1],
      viewportCenter: { x: 0, y: 0 },
    });
    const participants = session.readParticipants();
    expect(participants).toEqual([
      expect.objectContaining({ userId: "u1", displayName: "太郎" }),
    ]);
    expect(participants[0]?.color).toMatch(/^#/);
    session.destroy();
  });

  it("readPresenceMaps は excludeUserId の自分を落とし、選択とビューポートを載せる", () => {
    const session = createCollabDocumentSession({ send: () => {} });
    session.setLocalAwareness({
      userId: "me",
      displayName: "自分",
      selectedNodeIds: [1],
      viewportCenter: { x: 10, y: 20 },
    });
    const selfOnly = session.readPresenceMaps("me");
    expect(selfOnly.remoteSelections.size).toBe(0);
    expect(selfOnly.remoteViewports.size).toBe(0);

    const asOther = session.readPresenceMaps("other");
    expect(asOther.remoteSelections.get("me")).toEqual([1]);
    expect(asOther.remoteViewports.get("me")).toEqual({ x: 10, y: 20 });
    session.destroy();
  });
});
