import { TextDecoder, TextEncoder } from "util";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMapEditorCollab } from "@/hooks/useMapEditorCollab";
import type { CollabApiClient } from "@/services/collab/collabApiClient";
import type { CollabWsTransport } from "@/services/collab/collabWsSession";
import { COLLAB_RECONNECT_GRACE_MS } from "@/domain/collab/collabConnectionTypes";

Object.assign(globalThis, { TextEncoder, TextDecoder });

const mockDocumentSessionDestroy = jest.fn();
const mockSetLocalAwareness = jest.fn();
const mockReadParticipants = jest.fn(
  (): readonly { userId: string; displayName: string; color: string }[] => [],
);
const mockReadPresenceMaps = jest.fn(() => ({
  remoteSelections: new Map<string, readonly number[]>(),
  remoteViewports: new Map<string, { x: number; y: number }>(),
}));

jest.mock("@/services/collab/collabDocumentSession", () => {
  const undo = {
    undo: jest.fn(() => false),
    redo: jest.fn(() => false),
    canUndo: jest.fn(() => false),
    canRedo: jest.fn(() => false),
    destroy: jest.fn(),
  };
  return {
    createCollabDocumentSession: () => ({
      doc: {},
      undo,
      handleMessage: jest.fn(),
      pushLocalDocument: jest.fn(() => true),
      readDocument: jest.fn(() => null),
      setLocalAwareness: mockSetLocalAwareness,
      readParticipants: mockReadParticipants,
      readPresenceMaps: mockReadPresenceMaps,
      onRemoteOrUndoDocument: jest.fn(() => () => {}),
      destroy: mockDocumentSessionDestroy,
    }),
  };
});

function createApi(overrides: Partial<CollabApiClient> = {}): CollabApiClient {
  return {
    startSession: jest.fn(async () => ({
      ok: true as const,
      value: { sessionId: "s1", ticket: "t1", wsUrl: "wss://example.test/collab/s1" },
    })),
    joinSession: jest.fn(async () => ({
      ok: true as const,
      value: { sessionId: "s1", ticket: "t1", wsUrl: "wss://example.test/collab/s1" },
    })),
    endSession: jest.fn(async () => ({
      ok: true as const,
      value: { documentJson: "{\"version\":3,\"layoutMode\":\"manual\",\"nodes\":[]}" },
    })),
    getSession: jest.fn(async () => ({
      ok: true as const,
      value: {
        id: "s1",
        localMapId: "m1",
        sharedMapId: null,
        status: "active" as const,
        hasArtifact: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        endedAt: null,
      },
    })),
    reissueTicket: jest.fn(async () => ({
      ok: true as const,
      value: { sessionId: "s1", ticket: "t-reissued", wsUrl: "wss://example.test/collab/s1" },
    })),
    leaveSession: jest.fn(async () => ({ ok: true as const, value: undefined })),
    ...overrides,
  };
}

function createTransport(): CollabWsTransport & {
  handlers: {
    onOpen?: () => void;
    onMessage?: (data: Uint8Array) => void;
    onClose?: () => void;
    onError?: (message: string) => void;
  };
} {
  const handlers: {
    onOpen?: () => void;
    onMessage?: (data: Uint8Array) => void;
    onClose?: () => void;
    onError?: (message: string) => void;
  } = {};
  return {
    handlers,
    connect(_url, h) {
      handlers.onOpen = h.onOpen;
      handlers.onMessage = h.onMessage;
      handlers.onClose = h.onClose;
      handlers.onError = h.onError;
    },
    send() {},
    close() {
      handlers.onClose?.();
    },
  };
}

const baseGuard = {
  isProtectedMode: false,
  learningActive: false,
  playingPresentation: false,
  voiceListening: false,
  hasMapConflict: false,
  isMapExternallyDeleted: false,
};

describe("useMapEditorCollab（L-166）", () => {
  beforeEach(() => {
    mockDocumentSessionDestroy.mockClear();
    mockSetLocalAwareness.mockClear();
    mockReadParticipants.mockReset();
    mockReadParticipants.mockReturnValue([]);
    mockReadPresenceMaps.mockReset();
    mockReadPresenceMaps.mockReturnValue({
      remoteSelections: new Map(),
      remoteViewports: new Map(),
    });
  });

  it("再試行開始で通知をクリアし、成功が error を置換する", async () => {
    const api = createApi({
      startSession: jest
        .fn<Promise<{ ok: false; reason: string } | { ok: true; value: { sessionId: string; ticket: string; wsUrl: string } }>, []>()
        .mockResolvedValueOnce({ ok: false, reason: "seed-failed" })
        .mockResolvedValueOnce({
          ok: true,
          value: { sessionId: "s1", ticket: "t1", wsUrl: "wss://example.test/collab/s1" },
        }),
    });
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    expect(result.current.notice?.kind).toBe("error");
    const seqAfterError = result.current.noticeSequence;

    await act(async () => {
      await result.current.onRetryCollab();
    });
    expect(result.current.noticeSequence).toBeGreaterThan(seqAfterError);
    await waitFor(() => {
      expect(result.current.notice?.kind).toBe("status");
    });
  });

  it("mapId 変更で通知をクリアする", async () => {
    const api = createApi({
      startSession: jest.fn(async () => ({ ok: false as const, reason: "seed-failed" })),
    });
    const { result, rerender } = renderHook(
      ({ mapId }) =>
        useMapEditorCollab({
          mapId,
          shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
          getDocumentJson: () => "{}",
          getSharedMapId: () => null,
          getStartGuard: () => baseGuard,
          api,
          createTransport: () => createTransport(),
        }),
      { initialProps: { mapId: "m1" } },
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    expect(result.current.notice).not.toBeNull();

    rerender({ mapId: "m2" });
    expect(result.current.notice).toBeNull();
    expect(result.current.collabSession.status).toBe("idle");
  });

  it("同一文言でも sequence が進むと再読み上げ用に再表示できる", async () => {
    const api = createApi({
      startSession: jest.fn(async () => ({ ok: false as const, reason: "seed-failed" })),
    });
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => createTransport(),
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    const first = result.current.noticeSequence;
    const message = result.current.notice?.message;

    await act(async () => {
      await result.current.onRetryCollab();
    });
    expect(result.current.notice?.message).toBe(message);
    expect(result.current.noticeSequence).toBeGreaterThan(first);
  });

  it("L-166: 閉鎖（clearNotice）で通知をクリアする", async () => {
    const api = createApi({
      startSession: jest.fn(async () => ({ ok: false as const, reason: "seed-failed" })),
    });
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com", displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => createTransport(),
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    expect(result.current.notice?.kind).toBe("error");

    act(() => {
      result.current.clearNotice();
    });
    expect(result.current.notice).toBeNull();
  });

  it("L-166: セッション状態変化（idle→connecting）で前の通知をクリアする", async () => {
    const api = createApi();
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com", displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    await waitFor(() => {
      expect(result.current.collabSession.status).toBe("active");
    });

    await act(async () => {
      await result.current.onLeaveCollab();
    });
    expect(result.current.collabSession.status).toBe("idle");
    expect(result.current.notice?.kind).toBe("status");
    const leaveMessage = result.current.notice?.message;
    const leaveSeq = result.current.noticeSequence;

    await act(async () => {
      await result.current.onStartCollab();
    });
    // idle→connecting で前通知は消え、成功後は新しい status に置換される
    expect(result.current.noticeSequence).toBeGreaterThan(leaveSeq);
    expect(result.current.notice?.message).not.toBe(leaveMessage);
  });

  it("2 分超の reconnecting 失敗は UI error（idle にしない・再参加対象）", async () => {
    jest.useFakeTimers();
    let now = 1_000_000;
    const api = createApi({
      // 再発行を止め、grace 脱落だけを検証する
      reissueTicket: jest.fn(async () => ({ ok: false as const, reason: "storage-error" })),
    });
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
        nowMs: () => now,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    expect(result.current.collabSession.status).toBe("active");

    act(() => {
      transport.handlers.onClose?.();
    });
    expect(result.current.collabSession.status).toBe("reconnecting");

    now += COLLAB_RECONNECT_GRACE_MS + 1;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.collabSession).toEqual({
      status: "error",
      error: "dropped-grace",
    });
    expect(result.current.collabSession.status).not.toBe("idle");
    expect(result.current.notice?.kind).toBe("error");
    jest.useRealTimers();
  });

  it("leave 成功 → UI idle", async () => {
    const api = createApi();
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com", displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    await waitFor(() => {
      expect(result.current.collabSession.status).toBe("active");
    });

    const leaveResult = await act(async () => result.current.onLeaveCollab());
    expect(leaveResult).toEqual({ ok: true, value: undefined });
    expect(api.leaveSession).toHaveBeenCalledWith("s1");
    expect(result.current.collabSession).toEqual({ status: "idle" });
  });

  it("end 成功 → UI idle", async () => {
    const api = createApi();
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com", displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    await waitFor(() => {
      expect(result.current.collabSession.status).toBe("active");
    });

    const endResult = await act(async () => result.current.onEndCollab());
    expect(endResult).toEqual({ ok: true, value: undefined });
    expect(result.current.collabSession).toEqual({ status: "idle" });
  });

  it("reconnecting 中は ticket 再発行してから WS 再接続する", async () => {
    const api = createApi();
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    expect(result.current.collabSession.status).toBe("active");

    act(() => {
      transport.handlers.onClose?.();
    });
    expect(result.current.collabSession.status).toBe("reconnecting");

    await waitFor(() => {
      expect(api.reissueTicket).toHaveBeenCalledWith("s1");
    });

    await waitFor(() => {
      expect(result.current.collabSession.status).toBe("reconnecting");
    });

    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    await waitFor(() => {
      expect(result.current.collabSession.status).toBe("active");
    });
  });

  it("アンマウントで document.destroy を呼び WS/Y.Doc を解放する", async () => {
    mockDocumentSessionDestroy.mockClear();
    const api = createApi();
    const transport = createTransport();
    const { result, unmount } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
    });
    expect(mockDocumentSessionDestroy).not.toHaveBeenCalled();

    unmount();
    expect(mockDocumentSessionDestroy).toHaveBeenCalledTimes(1);
  });

  it("active 中の transport error は reconnecting（runtime は保持）", async () => {
    mockDocumentSessionDestroy.mockClear();
    const api = createApi();
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    await waitFor(() => {
      expect(result.current.collabSession.status).toBe("active");
    });
    mockDocumentSessionDestroy.mockClear();

    act(() => {
      transport.handlers.onError?.("boom");
    });
    expect(result.current.collabSession.status).toBe("reconnecting");
    expect(mockDocumentSessionDestroy).not.toHaveBeenCalled();
  });

  it("初回 ticket 未受理の切断は connection-error（idle に潰さない）", async () => {
    const api = createApi();
    const handlers: {
      onOpen?: () => void;
      onMessage?: (data: Uint8Array) => void;
      onClose?: () => void;
      onError?: (message: string) => void;
    } = {};
    const transport: CollabWsTransport & { handlers: typeof handlers } = {
      handlers,
      connect(_url, h) {
        handlers.onOpen = h.onOpen;
        handlers.onMessage = h.onMessage;
        handlers.onClose = h.onClose;
        handlers.onError = h.onError;
      },
      send() {},
      close() {
        // 意図的に同期 onClose しない
      },
    };
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    // ticket 受理前に切断 = auth 失敗 → error
    act(() => {
      handlers.onOpen?.();
      handlers.onClose?.();
    });
    expect(result.current.collabSession).toEqual({
      status: "error",
      error: "connection-error",
    });

    // tearDown→disconnect 後に遅れて届く closed（実 WS の非同期 close）
    act(() => {
      handlers.onClose?.();
    });
    expect(result.current.collabSession).toEqual({
      status: "error",
      error: "connection-error",
    });
  });

  it("dropped-grace 後の非同期 WS close で idle に潰さない", async () => {
    jest.useFakeTimers();
    let now = 1_000_000;
    const api = createApi({
      reissueTicket: jest.fn(async () => ({ ok: false as const, reason: "storage-error" })),
    });
    const handlers: {
      onOpen?: () => void;
      onMessage?: (data: Uint8Array) => void;
      onClose?: () => void;
      onError?: (message: string) => void;
    } = {};
    const transport: CollabWsTransport & { handlers: typeof handlers } = {
      handlers,
      connect(_url, h) {
        handlers.onOpen = h.onOpen;
        handlers.onMessage = h.onMessage;
        handlers.onClose = h.onClose;
        handlers.onError = h.onError;
      },
      send() {},
      close() {},
    };
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
        nowMs: () => now,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      handlers.onOpen?.();
      handlers.onMessage?.(new Uint8Array([1]));
    });
    expect(result.current.collabSession.status).toBe("active");

    act(() => {
      handlers.onClose?.();
    });
    expect(result.current.collabSession.status).toBe("reconnecting");

    now += COLLAB_RECONNECT_GRACE_MS + 1;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.collabSession).toEqual({
      status: "error",
      error: "dropped-grace",
    });

    act(() => {
      handlers.onClose?.();
    });
    expect(result.current.collabSession).toEqual({
      status: "error",
      error: "dropped-grace",
    });
    jest.useRealTimers();
  });

  it("end 成功かつ共有中なら onAskPublishAfterEnd を呼ぶ（自動 publish しない）", async () => {
    const onAskPublishAfterEnd = jest.fn();
    const onApplyEndedDocument = jest.fn();
    const api = createApi();
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => "sm-1",
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
        onAskPublishAfterEnd,
        onApplyEndedDocument,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    await waitFor(() => {
      expect(result.current.collabSession.status).toBe("active");
    });

    await act(async () => {
      await result.current.onEndCollab();
    });
    expect(onApplyEndedDocument).toHaveBeenCalled();
    expect(onAskPublishAfterEnd).toHaveBeenCalledTimes(1);
    expect(api.endSession).toHaveBeenCalledWith("s1");
  });

  it("awareness の remote Maps が hook 結果へ伝播する", async () => {
    mockReadPresenceMaps.mockReturnValue({
      remoteSelections: new Map([["u2", [1, 2]]]),
      remoteViewports: new Map([["u2", { x: 40, y: 50 }]]),
    });
    mockReadParticipants.mockReturnValue([
      { userId: "u2", displayName: "相手", color: "#c2410c" },
    ]);
    const api = createApi();
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
        getAwarenessProfile: () => ({ userId: "u1", displayName: "自分" }),
        getAwarenessSelection: () => ({
          selectedNodeIds: [],
          viewportCenter: { x: 1, y: 2 },
        }),
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    await waitFor(() => {
      expect(result.current.collabSession.status).toBe("active");
    });
    expect(result.current.remoteSelections.get("u2")).toEqual([1, 2]);
    expect(result.current.remoteViewports.get("u2")).toEqual({ x: 40, y: 50 });
    expect(result.current.remoteSelections.has("missing")).toBe(false);
  });

  it("getAwarenessSelection が null のとき {0,0} を捏造して publish しない（L-002）", async () => {
    const api = createApi();
    const transport = createTransport();
    const { result } = renderHook(() =>
      useMapEditorCollab({
        mapId: "m1",
        shareSession: { userId: "u1", email: "a@example.com" , displayName: null },
        getDocumentJson: () => "{}",
        getSharedMapId: () => null,
        getStartGuard: () => baseGuard,
        api,
        createTransport: () => transport,
        getAwarenessProfile: () => ({ userId: "u1", displayName: "自分" }),
        getAwarenessSelection: () => null,
      }),
    );

    await act(async () => {
      await result.current.onStartCollab();
    });
    act(() => {
      transport.handlers.onOpen?.();
      transport.handlers.onMessage?.(new Uint8Array([1]));
    });
    await waitFor(() => {
      expect(result.current.collabSession.status).toBe("active");
    });
    expect(mockSetLocalAwareness).not.toHaveBeenCalled();
  });
});
