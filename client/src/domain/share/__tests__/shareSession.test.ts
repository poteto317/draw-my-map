import {
  requireCommenter,
  requireOwner,
  toShareCommenter,
  toShareSession,
} from "@/domain/share/shareSession";
import type { ShareSession } from "@/domain/share/shareSession";

describe("toShareSession", () => {
  it("id と email があるとき ShareOwner を返す（displayName は toShareCommenter の name 経路）", () => {
    expect(
      toShareSession({ id: "google-sub-1", email: "owner@example.com", name: "山田" }),
    ).toEqual({
      userId: "google-sub-1",
      email: "owner@example.com",
      displayName: "山田",
    });
  });

  it("name 欠落時は displayName: null（email を表示名にしない）", () => {
    expect(toShareSession({ id: "google-sub-1", email: "owner@example.com" })).toEqual({
      userId: "google-sub-1",
      email: "owner@example.com",
      displayName: null,
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
    const session: ShareSession = { userId: "", email: "owner@example.com", displayName: null };
    const result = requireOwner(session);
    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("email が空文字なら unauthenticated で失敗する", () => {
    const session: ShareSession = { userId: "google-sub-1", email: "", displayName: null };
    const result = requireOwner(session);
    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("ログイン済みセッションでは所有者を返す", () => {
    const session: ShareSession = {
      userId: "google-sub-1",
      email: "owner@example.com",
      displayName: "山田",
    };
    const result = requireOwner(session);
    expect(result).toEqual({
      ok: true,
      value: {
        userId: "google-sub-1",
        email: "owner@example.com",
        displayName: "山田",
      },
    });
  });
});

describe("toShareCommenter", () => {
  it("id と name があるとき ShareCommenter を返す", () => {
    expect(toShareCommenter({ id: "google-sub-1", name: "山田" })).toEqual({
      userId: "google-sub-1",
      displayName: "山田",
    });
  });

  it("user 無し・id 欠落・空は null", () => {
    expect(toShareCommenter(undefined)).toBeNull();
    expect(toShareCommenter(null)).toBeNull();
    expect(toShareCommenter({ name: "山田" })).toBeNull();
    expect(toShareCommenter({ id: null, name: "山田" })).toBeNull();
    expect(toShareCommenter({ id: "", name: "山田" })).toBeNull();
  });

  it("name 欠落・null・空は displayName: null", () => {
    expect(toShareCommenter({ id: "u1" })).toEqual({ userId: "u1", displayName: null });
    expect(toShareCommenter({ id: "u1", name: null })).toEqual({ userId: "u1", displayName: null });
    expect(toShareCommenter({ id: "u1", name: "" })).toEqual({ userId: "u1", displayName: null });
  });
});

describe("requireCommenter", () => {
  it("null は unauthenticated で失敗する", () => {
    expect(requireCommenter(null)).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("投稿者があれば成功する", () => {
    const commenter = { userId: "u1", displayName: null };
    expect(requireCommenter(commenter)).toEqual({ ok: true, value: commenter });
  });
});
