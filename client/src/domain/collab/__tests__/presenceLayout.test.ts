import { collabParticipantColor } from "@/domain/collab/collabParticipantColor";
import {
  buildPresenceLayout,
  PRESENCE_VIEWPORT_FRAME_HEIGHT_PX,
  PRESENCE_VIEWPORT_FRAME_WIDTH_PX,
} from "@/domain/collab/presenceLayout";
import type { Node } from "@/types/node";

const node: Node = {
  id: 1,
  label: "根",
  x: 100,
  y: 50,
  width: 120,
  height: 40,
  parentId: null,
  importance: "medium",
};

describe("buildPresenceLayout", () => {
  it("選択輪郭とビューポート枠を画面座標へ写す。空選択は出さない", () => {
    const layout = buildPresenceLayout({
      remoteSelections: new Map([
        ["u1", [1]],
        ["u2", []],
      ]),
      remoteViewports: new Map([["u1", { x: 200, y: 100 }]]),
      participants: [{ userId: "u1", displayName: "Alice", color: "#abc" }],
      nodes: [node],
      viewport: { offsetX: 10, offsetY: 20, scale: 2 },
    });

    expect(layout.selectionOutlines).toHaveLength(1);
    expect(layout.selectionOutlines[0]).toMatchObject({
      userId: "u1",
      nodeId: 1,
      left: 100 * 2 + 10,
      top: 50 * 2 + 20,
      width: 120 * 2,
      height: 40 * 2,
      color: "#abc",
      label: "Aliceの選択",
    });
    expect(layout.viewportFrames).toHaveLength(1);
    expect(layout.viewportFrames[0]).toMatchObject({
      userId: "u1",
      left: 200 * 2 + 10 - PRESENCE_VIEWPORT_FRAME_WIDTH_PX / 2,
      top: 100 * 2 + 20 - PRESENCE_VIEWPORT_FRAME_HEIGHT_PX / 2,
      name: "Alice",
      label: "Aliceの視点",
    });
  });

  it("参加者欠落時は色フォールバック・表示名 null（userId をラベルに出さない）", () => {
    const layout = buildPresenceLayout({
      remoteSelections: new Map([["ghost", [1]]]),
      remoteViewports: new Map([["ghost", { x: 0, y: 0 }]]),
      participants: [],
      nodes: [node],
      viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    });
    expect(layout.selectionOutlines[0]?.color).toBe(collabParticipantColor("ghost"));
    expect(layout.selectionOutlines[0]?.label).toBe("他の参加者の選択");
    expect(layout.viewportFrames[0]?.name).toBeNull();
    expect(layout.viewportFrames[0]?.label).toBe("他の参加者の視点");
  });
});
