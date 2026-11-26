import { requireOwner, toShareSession } from "@/domain/share/shareSession";
import type { ShareSession } from "@/domain/share/shareSession";

describe("toShareSession", () => {
  it("id と email があるとき ShareOwner を返す", () => {
    expect(toShareSession({ id: "google-sub-1", email: "owner@example.com" })).toEqual({
      userId: "google-sub-1",
      email: "owner@example.com",
    });
  });

  it("user 無し・id/email 欠落・空は null", () => {
    expect(toShareSession(undefined)).toBeNull();
    expect(toShareSession(null)).toBeNull();
    expect(toShareSession({ id: "u1", email: null })).toBeNull();
    expect(toShareSession({ id: "", email: "a@example.com" })).toBeNull();
    expect(toShareSession({ email: "a@example.com" })).toBeNull();
  });
});

describe("requireOwner", () => {
  it("セッション無しでは失敗する（未ログインは成功扱いにしない）", () => {
    const session: ShareSession = null;
    const result = requireOwner(session);
    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("userId が空文字なら unauthenticated で失敗する", () => {
    const session: ShareSession = { userId: "", email: "owner@example.com" };
    const result = requireOwner(session);
    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("email が空文字なら unauthenticated で失敗する", () => {
    const session: ShareSession = { userId: "google-sub-1", email: "" };
    const result = requireOwner(session);
    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("ログイン済みセッションでは所有者を返す", () => {
    const session: ShareSession = {
      userId: "google-sub-1",
      email: "owner@example.com",
    };
    const result = requireOwner(session);
    expect(result).toEqual({
      ok: true,
      value: { userId: "google-sub-1", email: "owner@example.com" },
    });
  });
});
