import { collabParticipantColor } from "@/domain/collab/collabParticipantColor";
import {
  buildPresenceMaps,
  parseRemotePresence,
  remotePresencesFromAwarenessStates,
  type RemotePresence,
} from "@/domain/collab/collabRemotePresence";

describe("parseRemotePresence", () => {
  it("必須欠落は null（成功の空に倒さない・L-002）", () => {
    expect(parseRemotePresence({})).toBeNull();
    expect(parseRemotePresence({ userId: "u1", displayName: "太郎" })).toBeNull();
    expect(
      parseRemotePresence({
        userId: "u1",
        displayName: "太郎",
        selectedNodeIds: [1],
      }),
    ).toBeNull();
    expect(
      parseRemotePresence({
        userId: "u1",
        displayName: "太郎",
        viewportCenter: { x: 0, y: 0 },
      }),
    ).toBeNull();
    expect(
      parseRemotePresence({
        userId: "u1",
        displayName: "",
        selectedNodeIds: [],
        viewportCenter: { x: 1, y: 2 },
      }),
    ).toBeNull();
  });

  it("selectedNodeIds が配列でない・数値以外を含むときは null（空配列成功に倒さない）", () => {
    expect(
      parseRemotePresence({
        userId: "u1",
        displayName: "太郎",
        selectedNodeIds: "1",
        viewportCenter: { x: 0, y: 0 },
      }),
    ).toBeNull();
    expect(
      parseRemotePresence({
        userId: "u1",
        displayName: "太郎",
        selectedNodeIds: [1, "2"],
        viewportCenter: { x: 0, y: 0 },
      }),
    ).toBeNull();
  });

  it("viewportCenter が不正なら null（null 埋めしない）", () => {
    expect(
      parseRemotePresence({
        userId: "u1",
        displayName: "太郎",
        selectedNodeIds: [],
        viewportCenter: null,
      }),
    ).toBeNull();
    expect(
      parseRemotePresence({
        userId: "u1",
        displayName: "太郎",
        selectedNodeIds: [],
        viewportCenter: { x: Number.NaN, y: 0 },
      }),
    ).toBeNull();
  });

  it("必須が揃えば RemotePresence を返す（空選択 [] は明示的な未選択）", () => {
    const presence = parseRemotePresence({
      userId: "u1",
      displayName: "太郎",
      selectedNodeIds: [],
      viewportCenter: { x: 10, y: 20 },
    });
    expect(presence).toEqual({
      userId: "u1",
      displayName: "太郎",
      color: collabParticipantColor("u1"),
      selectedNodeIds: [],
      viewportCenter: { x: 10, y: 20 },
    } satisfies RemotePresence);
  });

  it("明示 color はそのまま使う", () => {
    const presence = parseRemotePresence({
      userId: "u1",
      displayName: "太郎",
      color: "#ff00aa",
      selectedNodeIds: [3, 4],
      viewportCenter: { x: 1, y: 2 },
    });
    expect(presence?.color).toBe("#ff00aa");
    expect(presence?.selectedNodeIds).toEqual([3, 4]);
  });
});

describe("remotePresencesFromAwarenessStates / buildPresenceMaps", () => {
  it("空 Map は 0 件（欠落と混同しない）", () => {
    expect(remotePresencesFromAwarenessStates(new Map())).toEqual([]);
    const maps = buildPresenceMaps([]);
    expect(maps.remoteSelections.size).toBe(0);
    expect(maps.remoteViewports.size).toBe(0);
  });

  it("excludeUserId の自分は落とす", () => {
    const states = new Map([
      [
        1,
        {
          userId: "me",
          displayName: "自分",
          selectedNodeIds: [1],
          viewportCenter: { x: 0, y: 0 },
        },
      ],
      [
        2,
        {
          userId: "other",
          displayName: "相手",
          color: "#111",
          selectedNodeIds: [9],
          viewportCenter: { x: 5, y: 6 },
        },
      ],
    ]);
    const remotes = remotePresencesFromAwarenessStates(states, { excludeUserId: "me" });
    expect(remotes).toHaveLength(1);
    expect(remotes[0]?.userId).toBe("other");
  });

  it("Map キー欠落 ≠ 空選択。空選択はキーあり + []", () => {
    const withEmptySelection: RemotePresence = {
      userId: "a",
      displayName: "A",
      color: "#aaa",
      selectedNodeIds: [],
      viewportCenter: { x: 1, y: 1 },
    };
    const maps = buildPresenceMaps([withEmptySelection]);
    expect(maps.remoteSelections.has("a")).toBe(true);
    expect(maps.remoteSelections.get("a")).toEqual([]);
    expect(maps.remoteViewports.get("a")).toEqual({ x: 1, y: 1 });
    expect(maps.remoteSelections.has("missing")).toBe(false);
    expect(maps.remoteViewports.has("missing")).toBe(false);
  });

  it("必須欠落エントリは Maps に載せない（成功の空に倒さない）", () => {
    const states = new Map([
      [1, { userId: "bad", displayName: "欠落" }],
      [
        2,
        {
          userId: "ok",
          displayName: "OK",
          color: "#222",
          selectedNodeIds: [2],
          viewportCenter: { x: 3, y: 4 },
        },
      ],
    ]);
    const remotes = remotePresencesFromAwarenessStates(states);
    const maps = buildPresenceMaps(remotes);
    expect(maps.remoteSelections.has("bad")).toBe(false);
    expect(maps.remoteViewports.has("bad")).toBe(false);
    expect(maps.remoteSelections.get("ok")).toEqual([2]);
    expect(maps.remoteViewports.get("ok")).toEqual({ x: 3, y: 4 });
  });
});
