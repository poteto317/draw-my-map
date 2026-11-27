import {
  collabParticipantsFromAwarenessStates,
  parseCollabAwarenessParticipant,
} from "@/domain/collab/collabAwarenessParticipants";
import { collabParticipantColor } from "@/domain/collab/collabParticipantColor";

describe("parseCollabAwarenessParticipant", () => {
  it("必須欠落は null（成功の空に倒さない・L-002）", () => {
    expect(parseCollabAwarenessParticipant({})).toBeNull();
    expect(parseCollabAwarenessParticipant({ userId: "u1" })).toBeNull();
    expect(
      parseCollabAwarenessParticipant({ userId: "u1", displayName: "" }),
    ).toBeNull();
  });

  it("color 欠落時は userId から安定色を補完する", () => {
    const p = parseCollabAwarenessParticipant({
      userId: "u1",
      displayName: "太郎",
    });
    expect(p).toEqual({
      userId: "u1",
      displayName: "太郎",
      color: collabParticipantColor("u1"),
    });
  });

  it("明示 color は一覧にそのまま使う（awareness と一致）", () => {
    const p = parseCollabAwarenessParticipant({
      userId: "u1",
      displayName: "太郎",
      color: "#ff00aa",
    });
    expect(p?.color).toBe("#ff00aa");
  });
});

describe("collabParticipantsFromAwarenessStates", () => {
  it("空 Map は ready かつ 0 件（欠落と混同しない）", () => {
    expect(collabParticipantsFromAwarenessStates(new Map())).toEqual([]);
  });

  it("同一 userId は1件にまとめる", () => {
    const states = new Map([
      [1, { userId: "u1", displayName: "A", color: "#111" }],
      [2, { userId: "u1", displayName: "A", color: "#111" }],
      [3, { userId: "u2", displayName: "B", color: "#222" }],
    ]);
    expect(collabParticipantsFromAwarenessStates(states)).toEqual([
      { userId: "u1", displayName: "A", color: "#111" },
      { userId: "u2", displayName: "B", color: "#222" },
    ]);
  });
});
