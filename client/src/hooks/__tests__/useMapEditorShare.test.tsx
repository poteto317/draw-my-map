import { act, renderHook, waitFor } from "@testing-library/react";
import { encodeShareLocalMetaStore } from "@/domain/share/shareLocalMeta";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import { useMapEditorShare } from "@/hooks/useMapEditorShare";
import {
  SHARE_LOCAL_META_STORAGE_KEY,
  readShareLocalMeta,
} from "@/services/persistence/shareLocalMetaStorage";
import type { ShareApiClient, ShareListItemClient } from "@/services/share/shareApiClient";
import { createRecordingStorage } from "@/testing/mapLibraryTestStorage";

const EXISTING_META = {
  sharedMapId: "sm-1",
  lastPublishedAt: "2026-11-01T00:00:00.000Z",
  linkActive: true,
};

function createApi(overrides: Partial<ShareApiClient> = {}): ShareApiClient {
  const base: ShareApiClient = {
    listMaps: async () => ({ ok: true, value: [] as ShareListItemClient[] }),
    createShare: async () => ({
      ok: true,
      value: {
        sharedMapId: "sm-new",
        link: { linkId: "l1", url: "https://example.com/share/t", token: "t", permission: "view" },
      },
    }),
    publish: async () => ({ ok: true, value: { revisionId: "r1" } }),
    createLink: async () => ({
      ok: true,
      value: { linkId: "l2", url: "https://example.com/share/t2", token: "t2", permission: "view" },
    }),
    revokeLink: async () => ({ ok: true, value: undefined }),
    reissueLink: async () => ({
      ok: true,
      value: { linkId: "l3", url: "https://example.com/share/t3", token: "t3", permission: "view" },
    }),
    deleteShare: async () => ({ ok: true, value: undefined }),
    viewByToken: async () => ({
      ok: true,
      value: { documentJson: "{\"version\":3,\"layoutMode\":\"manual\",\"nodes\":[]}" },
    }),
  };
  return {
    listMaps: jest.fn(base.listMaps),
    createShare: jest.fn(base.createShare),
    publish: jest.fn(base.publish),
    createLink: jest.fn(base.createLink),
    revokeLink: jest.fn(base.revokeLink),
    reissueLink: jest.fn(base.reissueLink),
    deleteShare: jest.fn(base.deleteShare),
    viewByToken: jest.fn(base.viewByToken),
    ...overrides,
  };
}

describe("useMapEditorShare", () => {
  it("listState=error のときローカルメタを未共有へ書き換えない（L-002）", async () => {
    const { storage } = createRecordingStorage({
      initial: {
        [SHARE_LOCAL_META_STORAGE_KEY]: encodeShareLocalMetaStore({
          version: 1,
          byMapId: { "map-1": EXISTING_META },
        }),
      },
    });
    const api = createApi({
      listMaps: jest.fn(async (): Promise<{ ok: false; reason: string }> => ({
        ok: false,
        reason: "storage-error",
      })),
    });
    const getStorage = () => storage;

    const { result } = renderHook(() =>
      useMapEditorShare({
        mapId: "map-1",
        mapTitle: "タイトル",
        shareSession: { userId: "u1", email: "a@example.com" },
        documentRevision: 1,
        shareDialogOpen: true,
        getDocumentJson: () => "{}",
        api,
        getStorage,
      }),
    );

    await waitFor(() => expect(result.current.listState).toBe("error"));
    expect(result.current.localMeta).toEqual({
      status: "present",
      value: EXISTING_META,
    });
    expect(readShareLocalMeta(storage, "map-1")).toEqual({
      status: "present",
      value: EXISTING_META,
    });
  });

  it("未ログインの createShare は成功扱いにせず notice を出す", async () => {
    const { storage } = createRecordingStorage();
    const api = createApi();
    const getStorage = () => storage;
    const { result } = renderHook(() =>
      useMapEditorShare({
        mapId: "map-1",
        mapTitle: "タイトル",
        shareSession: null,
        documentRevision: 1,
        shareDialogOpen: true,
        getDocumentJson: () => "{}",
        api,
        getStorage,
      }),
    );

    let outcome: Awaited<ReturnType<typeof result.current.onCreateShare>> | undefined;
    await act(async () => {
      outcome = await result.current.onCreateShare();
    });
    expect(outcome).toEqual({ ok: false, reason: "unauthenticated" });
    expect(api.createShare).not.toHaveBeenCalled();
    expect(result.current.notice).toEqual({
      kind: "error",
      message: SHARE_MESSAGES.unauthenticated,
    });
    expect(readShareLocalMeta(storage, "map-1")).toEqual({ status: "missing" });
  });

  it("L-166: 再試行開始でクリアし成功が error を置換する", async () => {
    const { storage } = createRecordingStorage();
    const createShare = jest.fn()
      .mockResolvedValueOnce({ ok: false as const, reason: "storage-error" })
      .mockResolvedValueOnce({
        ok: true as const,
        value: {
          sharedMapId: "sm-new",
          link: { linkId: "l1", url: "https://example.com/share/t", token: "t", permission: "view" },
        },
      });
    const api = createApi({
      listMaps: jest.fn(async () => ({ ok: true as const, value: [] })),
      createShare,
    });
    const getStorage = () => storage;

    const { result } = renderHook(() =>
      useMapEditorShare({
        mapId: "map-1",
        mapTitle: "タイトル",
        shareSession: { userId: "u1", email: "a@example.com" },
        documentRevision: 1,
        shareDialogOpen: false,
        getDocumentJson: () => "{}",
        api,
        getStorage,
      }),
    );

    await act(async () => {
      await result.current.onCreateShare();
    });
    expect(result.current.notice?.kind).toBe("error");
    const errorSequence = result.current.noticeSequence;

    await act(async () => {
      await result.current.onCreateShare();
    });
    expect(result.current.notice).toEqual({
      kind: "status",
      message: SHARE_MESSAGES.createShareSuccess,
    });
    expect(result.current.noticeSequence).toBeGreaterThan(errorSequence);
  });

  it("L-166: documentRevision 変化で成功 status を消す", async () => {
    const { storage } = createRecordingStorage();
    const api = createApi();
    const getStorage = () => storage;

    const { result, rerender } = renderHook(
      (props: { revision: number }) =>
        useMapEditorShare({
          mapId: "map-1",
          mapTitle: "タイトル",
          shareSession: { userId: "u1", email: "a@example.com" },
          documentRevision: props.revision,
          shareDialogOpen: false,
          getDocumentJson: () => "{}",
          api,
          getStorage,
        }),
      { initialProps: { revision: 1 } },
    );

    await act(async () => {
      await result.current.onCreateShare();
    });
    expect(result.current.notice?.kind).toBe("status");

    rerender({ revision: 2 });
    expect(result.current.notice).toBeNull();
  });

  it("L-166: ダイアログ閉鎖で通知をクリアする", async () => {
    const { storage } = createRecordingStorage();
    const api = createApi();
    const getStorage = () => storage;

    const { result, rerender } = renderHook(
      (props: { open: boolean }) =>
        useMapEditorShare({
          mapId: "map-1",
          mapTitle: "タイトル",
          shareSession: { userId: "u1", email: "a@example.com" },
          documentRevision: 1,
          shareDialogOpen: props.open,
          getDocumentJson: () => "{}",
          api,
          getStorage,
        }),
      { initialProps: { open: false } },
    );

    await act(async () => {
      await result.current.onCreateShare();
    });
    expect(result.current.notice?.kind).toBe("status");

    rerender({ open: true });
    rerender({ open: false });
    expect(result.current.notice).toBeNull();
  });

  it("L-166: mapId 変更で通知をクリアする", async () => {
    const { storage } = createRecordingStorage();
    const api = createApi();
    const getStorage = () => storage;

    const { result, rerender } = renderHook(
      (props: { mapId: string }) =>
        useMapEditorShare({
          mapId: props.mapId,
          mapTitle: "タイトル",
          shareSession: { userId: "u1", email: "a@example.com" },
          documentRevision: 1,
          shareDialogOpen: false,
          getDocumentJson: () => "{}",
          api,
          getStorage,
        }),
      { initialProps: { mapId: "map-1" } },
    );

    await act(async () => {
      await result.current.onCreateShare();
    });
    expect(result.current.notice?.kind).toBe("status");

    rerender({ mapId: "map-2" });
    expect(result.current.notice).toBeNull();
  });

  it("createShare 成功後も localStorage に平文 token / issued URL を残さない", async () => {
    const { storage } = createRecordingStorage();
    const issuedUrl = "https://example.com/share/secret-token-plain";
    const issuedToken = "secret-token-plain";
    const api = createApi({
      createShare: jest.fn(async () => ({
        ok: true as const,
        value: {
          sharedMapId: "sm-new",
          link: { linkId: "l1", url: issuedUrl, token: issuedToken, permission: "view" as const },
        },
      })),
    });
    const getStorage = () => storage;

    const { result } = renderHook(() =>
      useMapEditorShare({
        mapId: "map-1",
        mapTitle: "タイトル",
        shareSession: { userId: "u1", email: "a@example.com" },
        documentRevision: 1,
        shareDialogOpen: false,
        getDocumentJson: () => "{}",
        api,
        getStorage,
      }),
    );

    await act(async () => {
      await result.current.onCreateShare();
    });
    expect(result.current.lastIssuedLink?.token).toBe(issuedToken);
    expect(result.current.localMeta).toEqual({
      status: "present",
      value: {
        sharedMapId: "sm-new",
        lastPublishedAt: expect.any(String),
        linkActive: true,
      },
    });

    const raw = storage.getItem(SHARE_LOCAL_META_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain(issuedToken);
    expect(raw).not.toContain(issuedUrl);
    expect(raw).not.toContain("\"token\"");
    expect(raw).not.toContain("\"url\"");
  });

  it("writeMeta が skipped-read-error のとき present に偽倒しせず read-error を維持する", async () => {
    const { storage } = createRecordingStorage({
      initial: { [SHARE_LOCAL_META_STORAGE_KEY]: "{broken" },
    });
    const api = createApi();
    const getStorage = () => storage;

    const { result } = renderHook(() =>
      useMapEditorShare({
        mapId: "map-1",
        mapTitle: "タイトル",
        shareSession: { userId: "u1", email: "a@example.com" },
        documentRevision: 1,
        shareDialogOpen: false,
        getDocumentJson: () => "{}",
        api,
        getStorage,
      }),
    );

    expect(result.current.localMeta.status).toBe("read-error");

    await act(async () => {
      await result.current.onCreateShare();
    });

    expect(result.current.localMeta).toEqual({
      status: "read-error",
      error: "corrupt",
    });
    expect(result.current.notice).toEqual({
      kind: "error",
      message: SHARE_MESSAGES.localMetaWriteFailed,
    });
    expect(storage.getItem(SHARE_LOCAL_META_STORAGE_KEY)).toBe("{broken");
  });

  it("revoke 1 本では残リンクがあれば linkActive を true のままにする", async () => {
    const { storage } = createRecordingStorage({
      initial: {
        [SHARE_LOCAL_META_STORAGE_KEY]: encodeShareLocalMetaStore({
          version: 1,
          byMapId: { "map-1": EXISTING_META },
        }),
      },
    });
    const getStorage = () => storage;
    const listItem: ShareListItemClient = {
      id: "sm-1",
      localMapId: "map-1",
      title: "タイトル",
      currentRevisionId: "r1",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      links: [
        {
          id: "l-a",
          permission: "view",
          createdAt: "2026-11-01T00:00:00.000Z",
          revokedAt: null,
          expiresAt: null,
        },
        {
          id: "l-b",
          permission: "view",
          createdAt: "2026-11-02T00:00:00.000Z",
          revokedAt: null,
          expiresAt: null,
        },
      ],
    };
    const api = createApi({
      listMaps: jest.fn(async () => ({ ok: true as const, value: [listItem] })),
    });

    const { result } = renderHook(() =>
      useMapEditorShare({
        mapId: "map-1",
        mapTitle: "タイトル",
        shareSession: { userId: "u1", email: "a@example.com" },
        documentRevision: 1,
        shareDialogOpen: true,
        getDocumentJson: () => "{}",
        api,
        getStorage,
      }),
    );

    await waitFor(() => expect(result.current.listState).toBe("ready"));
    expect(result.current.shareList[0]?.links).toHaveLength(2);

    await act(async () => {
      await result.current.onRevokeLink("l-a");
    });

    expect(result.current.localMeta).toEqual({
      status: "present",
      value: {
        sharedMapId: "sm-1",
        lastPublishedAt: expect.any(String),
        linkActive: true,
      },
    });
    expect(readShareLocalMeta(storage, "map-1")).toEqual({
      status: "present",
      value: expect.objectContaining({ linkActive: true }),
    });
  });

  it("revoke で有効リンクが 0 になると linkActive は false", async () => {
    const { storage } = createRecordingStorage({
      initial: {
        [SHARE_LOCAL_META_STORAGE_KEY]: encodeShareLocalMetaStore({
          version: 1,
          byMapId: { "map-1": EXISTING_META },
        }),
      },
    });
    const getStorage = () => storage;
    const listItem: ShareListItemClient = {
      id: "sm-1",
      localMapId: "map-1",
      title: "タイトル",
      currentRevisionId: "r1",
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      links: [
        {
          id: "l-only",
          permission: "view",
          createdAt: "2026-11-01T00:00:00.000Z",
          revokedAt: null,
          expiresAt: null,
        },
      ],
    };
    const api = createApi({
      listMaps: jest.fn(async () => ({ ok: true as const, value: [listItem] })),
    });

    const { result } = renderHook(() =>
      useMapEditorShare({
        mapId: "map-1",
        mapTitle: "タイトル",
        shareSession: { userId: "u1", email: "a@example.com" },
        documentRevision: 1,
        shareDialogOpen: true,
        getDocumentJson: () => "{}",
        api,
        getStorage,
      }),
    );

    await waitFor(() => expect(result.current.listState).toBe("ready"));

    await act(async () => {
      await result.current.onRevokeLink("l-only");
    });

    expect(result.current.localMeta).toEqual({
      status: "present",
      value: expect.objectContaining({ linkActive: false }),
    });
  });
});
