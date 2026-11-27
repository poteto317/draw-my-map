import {
  planCollabNoticeClear,
  shouldClearNonStatusNotice,
} from "@/domain/collab/planCollabNoticeClear";

describe("planCollabNoticeClear", () => {
  it("同一状態・error 突入は noop。idle→connecting は clear", () => {
    expect(
      planCollabNoticeClear({ previousStatus: "idle", nextStatus: "idle" }),
    ).toEqual({ action: "noop" });
    expect(
      planCollabNoticeClear({ previousStatus: "active", nextStatus: "error" }),
    ).toEqual({ action: "noop" });
    expect(
      planCollabNoticeClear({ previousStatus: "idle", nextStatus: "connecting" }),
    ).toEqual({ action: "clear" });
  });

  it("idle / active 到達は status 以外を消す", () => {
    expect(
      planCollabNoticeClear({ previousStatus: "connecting", nextStatus: "active" }),
    ).toEqual({ action: "clear-unless-status" });
    expect(
      planCollabNoticeClear({ previousStatus: "active", nextStatus: "idle" }),
    ).toEqual({ action: "clear-unless-status" });
    expect(
      planCollabNoticeClear({ previousStatus: "connecting", nextStatus: "reconnecting" }),
    ).toEqual({ action: "noop" });
  });
});

describe("shouldClearNonStatusNotice", () => {
  it("status は残し、error / null はクリア対象", () => {
    expect(shouldClearNonStatusNotice({ kind: "status", message: "ok" })).toBe(false);
    expect(shouldClearNonStatusNotice({ kind: "error", message: "ng" })).toBe(true);
    expect(shouldClearNonStatusNotice(null)).toBe(true);
  });
});
