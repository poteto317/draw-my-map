/** @jest-environment node */

import { issueCollabTicket } from "@/server/collab/collabTicket";
import { COLLAB_MAX_CONNECTIONS } from "@/server/collab/collabRoomClient";
import { createMemoryCollabRoomClient } from "@/server/collab/testing/memoryCollabRoomClient";
import { COLLAB_RECONNECT_GRACE_MS } from "@/domain/collab/collabConnectionTypes";
import { COLLAB_EMPTY_ROOM_TTL_MS } from "@/domain/collab/collabRoomPolicy";
import * as Y from "yjs";

const SECRET = "test-ticket-secret";
const SESSION = "session-1";

function ticketFor(
  userId: string,
  nowMs: number,
  sessionId: string = SESSION,
): string {
  return issueCollabTicket({ sessionId, userId }, SECRET, nowMs, 60);
}

function yUpdate(label = "root"): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap("meta").set("title", label);
  return Y.encodeStateAsUpdate(doc);
}

describe("memoryCollabRoomClient（Task 3 契約）", () => {
  it("seed → export で同一 update を返す", async () => {
    const room = createMemoryCollabRoomClient({ ticketSecret: SECRET });
    const update = yUpdate();
    expect(await room.seed(SESSION, update)).toEqual({ ok: true });
    const exported = await room.exportYjsUpdate(SESSION);
    expect(exported.ok).toBe(true);
    if (exported.ok) {
      expect(Buffer.from(exported.value)).toEqual(Buffer.from(update));
    }
  });

  it("未 seed の export は export-empty", async () => {
    const room = createMemoryCollabRoomClient({ ticketSecret: SECRET });
    expect(await room.exportYjsUpdate(SESSION)).toEqual({
      ok: false,
      reason: "export-empty",
    });
  });

  it("ticket 検証後に接続でき、不正 ticket は拒否する", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
    });
    await room.seed(SESSION, yUpdate());

    const bad = await room.connect(SESSION, "not-a-ticket");
    expect(bad).toEqual({ ok: false, reason: "invalid-ticket" });
    expect(bad).not.toEqual(
      expect.objectContaining({ reason: expect.stringContaining("not-a-ticket") }),
    );

    const ok = await room.connect(SESSION, ticketFor("u1", nowMs));
    expect(ok).toEqual({ ok: true, userId: "u1" });
    expect(await room.getConnectionCount(SESSION)).toEqual({ ok: true, value: 1 });
  });

  it("sessionId 不一致の ticket は拒否する", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
    });
    await room.seed(SESSION, yUpdate());
    const other = ticketFor("u1", nowMs, "other-session");
    expect(await room.connect(SESSION, other)).toEqual({
      ok: false,
      reason: "invalid-ticket",
    });
  });

  it("期限切れ ticket（60 秒固定の帰結）は接続拒否する", async () => {
    let nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
    });
    await room.seed(SESSION, yUpdate());
    const ticket = ticketFor("u1", nowMs);
    nowMs += 61_000;
    expect(await room.connect(SESSION, ticket)).toEqual({
      ok: false,
      reason: "invalid-ticket",
    });
  });

  it("同時接続 8 を超えると 429", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
    });
    await room.seed(SESSION, yUpdate());

    for (let i = 0; i < COLLAB_MAX_CONNECTIONS; i++) {
      const r = await room.connect(SESSION, ticketFor(`u${i}`, nowMs));
      expect(r.ok).toBe(true);
    }
    expect(await room.getConnectionCount(SESSION)).toEqual({ ok: true, value: COLLAB_MAX_CONNECTIONS });

    const over = await room.connect(SESSION, ticketFor("u-over", nowMs));
    expect(over).toEqual({ ok: false, reason: "too-many-connections", status: 429 });
  });

  it("所有者切断後も他者は継続できる", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
      ownerUserId: "owner",
    });
    await room.seed(SESSION, yUpdate());
    await room.connect(SESSION, ticketFor("owner", nowMs));
    await room.connect(SESSION, ticketFor("editor", nowMs));

    room.disconnect(SESSION, "owner");
    expect(room.isActiveParticipant(SESSION, "editor")).toBe(true);
    expect(room.isActiveParticipant(SESSION, "owner")).toBe(false);
    // occupiedSlots = editor(active) + owner(grace)
    expect(await room.getConnectionCount(SESSION)).toEqual({ ok: true, value: 2 });
  });

  it("同一 userId の二重 connect は参照カウントし、片方 disconnect では TTL に入らない", async () => {
    let nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const evacuated: string[] = [];
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
      onEvacuate: async (sessionId) => {
        evacuated.push(sessionId);
      },
    });
    await room.seed(SESSION, yUpdate());
    await room.connect(SESSION, ticketFor("u1", nowMs));
    await room.connect(SESSION, ticketFor("u1", nowMs));
    expect(await room.getConnectionCount(SESSION)).toEqual({ ok: true, value: 1 });

    room.disconnect(SESSION, "u1");
    expect(room.isActiveParticipant(SESSION, "u1")).toBe(true);
    nowMs += COLLAB_EMPTY_ROOM_TTL_MS + 1;
    await room.tick();
    expect(evacuated).toHaveLength(0);

    room.disconnect(SESSION, "u1");
    expect(room.isActiveParticipant(SESSION, "u1")).toBe(false);
    // 完全切断後は grace で occupied=1
    expect(await room.getConnectionCount(SESSION)).toEqual({ ok: true, value: 1 });
  });

  it("getConnectionCount は grace 中も枠を数える", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
    });
    await room.seed(SESSION, yUpdate());
    await room.connect(SESSION, ticketFor("u1", nowMs));
    room.disconnect(SESSION, "u1");
    expect(room.isActiveParticipant(SESSION, "u1")).toBe(false);
    expect(await room.getConnectionCount(SESSION)).toEqual({ ok: true, value: 1 });
  });

  it("2 分以内の再接続は復帰し、2 分超は脱落する", async () => {
    let nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
    });
    await room.seed(SESSION, yUpdate());
    await room.connect(SESSION, ticketFor("u1", nowMs));
    room.disconnect(SESSION, "u1");

    nowMs += COLLAB_RECONNECT_GRACE_MS - 1;
    const within = await room.connect(SESSION, ticketFor("u1", nowMs));
    expect(within).toEqual({ ok: true, userId: "u1" });

    room.disconnect(SESSION, "u1");
    nowMs += COLLAB_RECONNECT_GRACE_MS + 1;
    // 猶予切れで脱落 → 再 connect は新規扱い（枠があれば可）。脱落済みフラグを確認
    expect(room.wasDroppedForGrace(SESSION, "u1")).toBe(true);
    const again = await room.connect(SESSION, ticketFor("u1", nowMs));
    expect(again).toEqual({ ok: true, userId: "u1" });
  });

  it("全員切断後 TTL 5 分で成果物退避する", async () => {
    let nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const evacuated: Array<{ sessionId: string; bytes: number }> = [];
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
      onEvacuate: async (sessionId, update) => {
        evacuated.push({ sessionId, bytes: update.byteLength });
      },
    });
    const update = yUpdate("ttl");
    await room.seed(SESSION, update);
    await room.connect(SESSION, ticketFor("u1", nowMs));
    room.disconnect(SESSION, "u1");

    nowMs += COLLAB_EMPTY_ROOM_TTL_MS - 1;
    await room.tick();
    expect(evacuated).toHaveLength(0);

    nowMs += 2;
    await room.tick();
    expect(evacuated).toEqual([{ sessionId: SESSION, bytes: update.byteLength }]);
    expect(room.getEvacuatedArtifact(SESSION)?.byteLength).toBe(update.byteLength);
  });

  it("TTL 退避失敗でも空文書を正本にしない（失敗≠空 MapDocument 成功）", async () => {
    let nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const logs: string[] = [];
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
      onEvacuate: async () => {
        throw new Error("r2-unavailable");
      },
      log: (msg) => logs.push(msg),
    });
    const update = yUpdate("keep");
    await room.seed(SESSION, update);
    await room.connect(SESSION, ticketFor("u1", nowMs));
    room.disconnect(SESSION, "u1");

    nowMs += COLLAB_EMPTY_ROOM_TTL_MS + 1;
    await room.tick();

    expect(logs).toContain("evacuate-failed");
    // 失敗時は成果物成功扱いにしない（空バイト列の正本化もしない）
    expect(room.getEvacuatedArtifact(SESSION)).toBeNull();
    const exported = await room.exportYjsUpdate(SESSION);
    expect(exported.ok).toBe(false);
    expect(exported).not.toEqual({ ok: true, value: new Uint8Array() });
  });

  it("awareness / 文書更新にレート制限が効く", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
    });
    await room.seed(SESSION, yUpdate());
    await room.connect(SESSION, ticketFor("u1", nowMs));

    let docRejected = 0;
    for (let i = 0; i < 100; i++) {
      const r = room.acceptDocUpdate(SESSION, "u1");
      if (!r.ok) docRejected++;
    }
    expect(docRejected).toBeGreaterThan(0);

    let awarenessRejected = 0;
    for (let i = 0; i < 100; i++) {
      const r = room.acceptAwarenessUpdate(SESSION, "u1");
      if (!r.ok) awarenessRejected++;
    }
    expect(awarenessRejected).toBeGreaterThan(0);
  });

  it("destroy 後は接続拒否（end 後の DO 残留防止）", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
    });
    await room.seed(SESSION, yUpdate());
    expect(await room.connect(SESSION, ticketFor("u1", nowMs))).toEqual({
      ok: true,
      userId: "u1",
    });
    await room.destroy(SESSION);
    expect(await room.connect(SESSION, ticketFor("u2", nowMs))).toEqual({
      ok: false,
      reason: "room-gone",
    });
    expect(await room.getConnectionCount(SESSION)).toEqual({ ok: true, value: 0 });
  });

  it("ログ用メッセージに ticket 平文を含めない", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const logs: string[] = [];
    const room = createMemoryCollabRoomClient({
      ticketSecret: SECRET,
      nowMs: () => nowMs,
      log: (msg) => logs.push(msg),
    });
    await room.seed(SESSION, yUpdate());
    const t = ticketFor("u1", nowMs);
    await room.connect(SESSION, t);
    await room.connect(SESSION, "garbage." + t);
    expect(logs.join("\n")).not.toContain(t);
  });
});
