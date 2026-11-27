import { renderHook } from "@testing-library/react";

const useSessionMock = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
}));

import { useShareSession } from "@/hooks/useShareSession";

describe("useShareSession", () => {
  afterEach(() => {
    useSessionMock.mockReset();
  });

  it("loading 中は status=loading で session は null（未ログインと混同しない）", () => {
    useSessionMock.mockReturnValue({ data: undefined, status: "loading" });
    const { result } = renderHook(() => useShareSession());
    expect(result.current).toEqual({ status: "loading", session: null });
  });

  it("セッション無しでは ready + null を返す", () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    const { result } = renderHook(() => useShareSession());
    expect(result.current).toEqual({ status: "ready", session: null });
  });

  it("userId と email があるとき ready + ShareSession を返す", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: { id: "google-sub-1", email: "owner@example.com", name: "Owner" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      status: "authenticated",
    });
    const { result } = renderHook(() => useShareSession());
    expect(result.current).toEqual({
      status: "ready",
      session: {
        userId: "google-sub-1",
        email: "owner@example.com",
        displayName: "Owner",
      },
    });
  });

  it("name 欠落時は displayName: null（email を表示名にしない）", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: { id: "google-sub-1", email: "owner@example.com" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      status: "authenticated",
    });
    const { result } = renderHook(() => useShareSession());
    expect(result.current).toEqual({
      status: "ready",
      session: {
        userId: "google-sub-1",
        email: "owner@example.com",
        displayName: null,
      },
    });
  });

  it("email 欠落のセッションは未ログイン扱い（ready + null）", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: { id: "google-sub-1", email: null },
        expires: "2099-01-01T00:00:00.000Z",
      },
      status: "authenticated",
    });
    const { result } = renderHook(() => useShareSession());
    expect(result.current).toEqual({ status: "ready", session: null });
  });

  it("id 欠落のセッションは未ログイン扱い（ready + null）", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: { email: "owner@example.com", name: "Owner" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      status: "authenticated",
    });
    const { result } = renderHook(() => useShareSession());
    expect(result.current).toEqual({ status: "ready", session: null });
  });
});
