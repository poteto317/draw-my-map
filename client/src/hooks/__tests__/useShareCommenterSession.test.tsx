import { renderHook } from "@testing-library/react";

const useSessionMock = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
}));

import { useShareCommenterSession } from "@/hooks/useShareCommenterSession";

describe("useShareCommenterSession", () => {
  afterEach(() => {
    useSessionMock.mockReset();
  });

  it("loading 中は status=loading で commenter は null（未ログインと混同しない・L-463）", () => {
    useSessionMock.mockReturnValue({ data: undefined, status: "loading" });
    const { result } = renderHook(() => useShareCommenterSession());
    expect(result.current).toEqual({ status: "loading", commenter: null });
  });

  it("未ログインは ready + null", () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    const { result } = renderHook(() => useShareCommenterSession());
    expect(result.current).toEqual({ status: "ready", commenter: null });
  });

  it("ログイン済みは ready + commenter（email は使わない）", () => {
    useSessionMock.mockReturnValue({
      data: {
        user: { id: "google-sub-1", email: "user@example.com", name: "山田" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      status: "authenticated",
    });
    const { result } = renderHook(() => useShareCommenterSession());
    expect(result.current).toEqual({
      status: "ready",
      commenter: { userId: "google-sub-1", displayName: "山田" },
    });
  });

  it("name が無くても ready + commenter（displayName は null）", () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: "google-sub-2" }, expires: "2099-01-01T00:00:00.000Z" },
      status: "authenticated",
    });
    const { result } = renderHook(() => useShareCommenterSession());
    expect(result.current).toEqual({
      status: "ready",
      commenter: { userId: "google-sub-2", displayName: null },
    });
  });
});
