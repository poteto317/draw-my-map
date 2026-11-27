import {
  COLLAB_EMPTY_ROOM_TTL_MS,
  COLLAB_MAX_CONNECTIONS,
  COLLAB_RECONNECT_GRACE_MS,
} from "../src/constants";
import { RoomConnectionCore } from "../src/roomCore";

describe("RoomConnectionCore", () => {
  it("同時接続 8 超は 429", () => {
    const now = { t: 1_000 };
    const core = new RoomConnectionCore(() => now.t);
    for (let i = 0; i < COLLAB_MAX_CONNECTIONS; i++) {
      expect(core.connect(`u${i}`).ok).toBe(true);
    }
    expect(core.connect("over")).toEqual({
      ok: false,
      reason: "too-many-connections",
      status: 429,
    });
  });

  it("所有者切断後も他者は残る", () => {
    const core = new RoomConnectionCore(() => 1_000);
    core.connect("owner");
    core.connect("editor");
    core.disconnect("owner");
    expect(core.isConnected("editor")).toBe(true);
    expect(core.activeCount()).toBe(1);
  });

  it("2 分以内再接続可・2 分超で脱落フラグ", () => {
    const now = { t: 10_000 };
    const core = new RoomConnectionCore(() => now.t);
    core.connect("u1");
    core.disconnect("u1");
    now.t += COLLAB_RECONNECT_GRACE_MS - 1;
    expect(core.connect("u1")).toEqual({
      ok: true,
      userId: "u1",
      reconnecting: true,
    });
    core.disconnect("u1");
    now.t += COLLAB_RECONNECT_GRACE_MS + 1;
    expect(core.wasDroppedForGrace("u1")).toBe(true);
  });

  it("全員切断後 TTL で shouldEvacuate", () => {
    const now = { t: 0 };
    const core = new RoomConnectionCore(() => now.t);
    core.connect("u1");
    core.disconnect("u1");
    now.t += COLLAB_EMPTY_ROOM_TTL_MS - 1;
    expect(core.shouldEvacuate()).toBe(false);
    now.t += 2;
    expect(core.shouldEvacuate()).toBe(true);
  });

  it("同一 userId の複数接続は参照カウントし、片方切断では空室にならない", () => {
    const now = { t: 0 };
    const core = new RoomConnectionCore(() => now.t);
    expect(core.connect("u1").ok).toBe(true);
    expect(core.connect("u1").ok).toBe(true);
    expect(core.occupiedSlots()).toBe(1);
    expect(core.activeCount()).toBe(1);

    core.disconnect("u1");
    expect(core.isConnected("u1")).toBe(true);
    expect(core.activeCount()).toBe(1);
    now.t += COLLAB_EMPTY_ROOM_TTL_MS + 1;
    expect(core.shouldEvacuate()).toBe(false);

    core.disconnect("u1");
    expect(core.isConnected("u1")).toBe(false);
    expect(core.activeCount()).toBe(0);
  });

  it("occupiedSlots は grace 枠を含む", () => {
    const now = { t: 1_000 };
    const core = new RoomConnectionCore(() => now.t);
    core.connect("u1");
    core.disconnect("u1");
    expect(core.activeCount()).toBe(0);
    expect(core.occupiedSlots()).toBe(1);
  });
});
