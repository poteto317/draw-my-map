import { act, renderHook, waitFor } from "@testing-library/react";
import { useShareViewerComments } from "@/app/share/[token]/useShareViewerComments";
import type {
  ShareCommentDeleteValue,
  ShareCommentListValue,
  ShareCommentThreadView,
  ShareCommentView,
} from "@/domain/share/shareComment";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import { shareCommentOperationFailureMessage } from "@/domain/share/shareCommentOperationMessages";
import type { ShareResult } from "@/domain/share/shareResult";
import type { ShareCommentsApiClient } from "@/services/share/shareCommentsApiClient";

function comment(overrides: Partial<ShareCommentView> = {}): ShareCommentView {
  return {
    id: "c1",
    authorName: "山田",
    body: "本文",
    createdAt: "2026-11-27T01:00:00.000Z",
    canDelete: true,
    ...overrides,
  };
}

function thread(overrides: Partial<ShareCommentThreadView> = {}): ShareCommentThreadView {
  return {
    id: "t1",
    nodeId: 1,
    nodeLabelSnapshot: "根ノード",
    status: "open",
    resolvedByName: null,
    resolvedAt: null,
    createdAt: "2026-11-27T01:00:00.000Z",
    updatedAt: "2026-11-27T01:00:00.000Z",
    canResolve: true,
    comments: [comment()],
    ...overrides,
  };
}

function listValue(threads: readonly ShareCommentThreadView[]): ShareCommentListValue {
  return { threads, viewer: { signedIn: true, canPost: true, isOwner: false } };
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createApi(overrides: Partial<ShareCommentsApiClient> = {}): jest.Mocked<ShareCommentsApiClient> {
  return {
    list: jest.fn(async () => ({ ok: true, value: listValue([thread()]) }) as ShareResult<ShareCommentListValue>),
    createThread: jest.fn(async (_scope, input) => ({
      ok: true,
      value: thread({ id: "t-new", nodeId: input.nodeId, createdAt: "2026-11-27T02:00:00.000Z" }),
    }) as ShareResult<ShareCommentThreadView>),
    reply: jest.fn(async (_scope, threadId) => ({
      ok: true,
      value: thread({ id: threadId, comments: [comment(), comment({ id: "c2", body: "返信" })] }),
    }) as ShareResult<ShareCommentThreadView>),
    resolve: jest.fn(async (_scope, threadId) => ({
      ok: true,
      value: thread({ id: threadId, status: "resolved", resolvedByName: "山田" }),
    }) as ShareResult<ShareCommentThreadView>),
    reopen: jest.fn(async (_scope, threadId) => ({
      ok: true,
      value: thread({ id: threadId }),
    }) as ShareResult<ShareCommentThreadView>),
    deleteComment: jest.fn(async (_scope, commentId) => ({
      ok: true,
      value: { commentId, threadDeleted: true },
    }) as ShareResult<ShareCommentDeleteValue>),
    ...overrides,
  } as jest.Mocked<ShareCommentsApiClient>;
}

type Options = Parameters<typeof useShareViewerComments>[0];

function renderComments(initial: Partial<Options> & { api: ShareCommentsApiClient }) {
  return renderHook((props: Options) => useShareViewerComments(props), {
    initialProps: {
      token: "tok-1",
      enabled: true,
      commenterUserId: "user-1",
      sessionStatus: "ready",
      ...initial,
    },
  });
}

describe("useShareViewerComments", () => {
  it("enabled false では API を呼ばず idle のまま", async () => {
    const api = createApi();
    const { result } = renderComments({ api, enabled: false });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.list).not.toHaveBeenCalled();
    expect(result.current.listState).toBe("idle");
    expect(result.current.value).toBeNull();
  });

  it("セッション loading 中は取得せず、ready になってから token 経路で 1 回取得する", async () => {
    const api = createApi();
    const { result, rerender } = renderComments({ api, sessionStatus: "loading", commenterUserId: null });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.list).not.toHaveBeenCalled();
    rerender({ token: "tok-1", enabled: true, commenterUserId: "user-1", sessionStatus: "ready", api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledWith({ kind: "token", token: "tok-1" });
    expect(result.current.value?.threads.map((item) => item.id)).toEqual(["t1"]);
  });

  it("取得中は loading、失敗は error で value は null（0 件と混同しない・L-002）", async () => {
    const pending = deferred<ShareResult<ShareCommentListValue>>();
    const api = createApi({ list: jest.fn(() => pending.promise) });
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("loading"));
    await act(async () => {
      pending.resolve({ ok: false, reason: "storage-error" });
    });
    expect(result.current.listState).toBe("error");
    expect(result.current.value).toBeNull();
  });

  it("成功でも threads が配列でない応答は error（L-002）", async () => {
    const api = createApi({
      list: jest.fn(async () => ({ ok: true }) as unknown as ShareResult<ShareCommentListValue>),
    });
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("error"));
    expect(result.current.value).toBeNull();
  });

  it("再読み込み中に書込みが成功し、後から届いた古い一覧は捨てる（L-040 / L-883）", async () => {
    const api = createApi();
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    const stale = deferred<ShareResult<ShareCommentListValue>>();
    api.list.mockImplementationOnce(() => stale.promise);
    let reloadPromise!: Promise<void>;
    act(() => {
      reloadPromise = result.current.reload();
    });
    await act(async () => {
      await result.current.resolve("t1");
    });
    expect(result.current.value?.threads[0]?.status).toBe("resolved");

    await act(async () => {
      stale.resolve({ ok: true, value: listValue([thread()]) });
      await reloadPromise;
    });
    expect(result.current.value?.threads[0]?.status).toBe("resolved");
    expect(result.current.listState).toBe("ready");
  });

  it("並行した 2 回の取得で古い方が後から届いても新しい方が残る", async () => {
    const api = createApi();
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    const first = deferred<ShareResult<ShareCommentListValue>>();
    const second = deferred<ShareResult<ShareCommentListValue>>();
    api.list.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    let firstPromise!: Promise<void>;
    let secondPromise!: Promise<void>;
    act(() => {
      firstPromise = result.current.reload();
    });
    act(() => {
      secondPromise = result.current.reload();
    });
    await act(async () => {
      second.resolve({ ok: true, value: listValue([thread({ id: "t-new-list" })]) });
      await secondPromise;
    });
    await act(async () => {
      first.resolve({ ok: true, value: listValue([thread({ id: "t-old-list" })]) });
      await firstPromise;
    });
    expect(result.current.value?.threads.map((item) => item.id)).toEqual(["t-new-list"]);
  });

  it("commenterUserId が変わると一覧が空に戻り、前の主体の応答を捨てる（L-037 / L-1037）", async () => {
    const pending = deferred<ShareResult<ShareCommentListValue>>();
    const api = createApi({ list: jest.fn(() => pending.promise) });
    const { result, rerender } = renderComments({ api });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));

    const next = deferred<ShareResult<ShareCommentListValue>>();
    api.list.mockImplementationOnce(() => next.promise);
    rerender({ token: "tok-1", enabled: true, commenterUserId: "user-2", sessionStatus: "ready", api });
    expect(result.current.value).toBeNull();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));

    await act(async () => {
      pending.resolve({ ok: true, value: listValue([thread({ id: "t-user-1" })]) });
    });
    expect(result.current.value).toBeNull();
    expect(result.current.listState).toBe("loading");

    await act(async () => {
      next.resolve({ ok: true, value: listValue([thread({ id: "t-user-2" })]) });
    });
    expect(result.current.value?.threads.map((item) => item.id)).toEqual(["t-user-2"]);
  });

  it("主体が変わった後に届いた書込み応答は一覧に適用しない", async () => {
    const pendingWrite = deferred<ShareResult<ShareCommentThreadView>>();
    const api = createApi({ resolve: jest.fn(() => pendingWrite.promise) });
    const { result, rerender } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    let writePromise!: Promise<ShareResult<ShareCommentThreadView>>;
    act(() => {
      writePromise = result.current.resolve("t1");
    });
    api.list.mockImplementationOnce(async () => ({ ok: true, value: listValue([thread({ id: "t-other" })]) }));
    rerender({ token: "tok-1", enabled: true, commenterUserId: "user-2", sessionStatus: "ready", api });
    await waitFor(() => expect(result.current.value?.threads[0]?.id).toBe("t-other"));

    let writeResult!: ShareResult<ShareCommentThreadView>;
    await act(async () => {
      pendingWrite.resolve({ ok: true, value: thread({ id: "t1", status: "resolved" }) });
      writeResult = await writePromise;
    });
    expect(writeResult.ok).toBe(false);
    expect(result.current.value?.threads.map((item) => item.id)).toEqual(["t-other"]);
    expect(result.current.notice).toBeNull();
  });

  it("書込み成功で該当スレッドだけ差し替え、成功文言を出す", async () => {
    const api = createApi({
      list: jest.fn(async () => ({ ok: true, value: listValue([thread(), thread({ id: "t2", nodeId: 2 })]) }) as ShareResult<ShareCommentListValue>),
    });
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    const before = result.current.value?.threads[1];

    await act(async () => {
      await result.current.reply("t1", "返信");
    });
    expect(api.reply).toHaveBeenCalledWith({ kind: "token", token: "tok-1" }, "t1", { body: "返信" });
    expect(result.current.value?.threads[0]?.comments).toHaveLength(2);
    expect(result.current.value?.threads[1]).toBe(before);
    expect(result.current.notice).toEqual({ kind: "status", message: SHARE_COMMENT_MESSAGES.replySuccess });
  });

  it("スレッド作成・解決・再開・削除が一覧に反映され、それぞれの成功文言を出す", async () => {
    const api = createApi();
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    await act(async () => {
      await result.current.createThread(2, "新規");
    });
    expect(api.createThread).toHaveBeenCalledWith({ kind: "token", token: "tok-1" }, { nodeId: 2, body: "新規" });
    expect(result.current.value?.threads.map((item) => item.id)).toEqual(["t1", "t-new"]);
    expect(result.current.notice?.message).toBe(SHARE_COMMENT_MESSAGES.createSuccess);

    await act(async () => {
      await result.current.resolve("t1");
    });
    expect(result.current.value?.threads[0]?.status).toBe("resolved");
    expect(result.current.notice?.message).toBe(SHARE_COMMENT_MESSAGES.resolveSuccess);

    await act(async () => {
      await result.current.reopen("t1");
    });
    expect(result.current.value?.threads[0]?.status).toBe("open");
    expect(result.current.notice?.message).toBe(SHARE_COMMENT_MESSAGES.reopenSuccess);

    await act(async () => {
      await result.current.deleteComment("t1", "c1");
    });
    expect(api.deleteComment).toHaveBeenCalledWith({ kind: "token", token: "tok-1" }, "c1");
    expect(result.current.value?.threads.map((item) => item.id)).toEqual(["t-new"]);
    expect(result.current.notice?.message).toBe(SHARE_COMMENT_MESSAGES.deleteSuccess);
  });

  it("書込み失敗は notice の error で、一覧は変えない", async () => {
    const api = createApi({
      reply: jest.fn(async () => ({ ok: false, reason: "thread-resolved" }) as ShareResult<ShareCommentThreadView>),
    });
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    const before = result.current.value;

    let writeResult!: ShareResult<ShareCommentThreadView>;
    await act(async () => {
      writeResult = await result.current.reply("t1", "返信");
    });
    expect(writeResult).toEqual({ ok: false, reason: "thread-resolved" });
    expect(result.current.value).toBe(before);
    expect(result.current.notice).toEqual({
      kind: "error",
      message: shareCommentOperationFailureMessage("thread-resolved"),
    });
  });

  it("書込み成功でも値の形が違えば invalid-response の error にして一覧を変えない（L-002）", async () => {
    const api = createApi({
      resolve: jest.fn(async () => ({ ok: true }) as unknown as ShareResult<ShareCommentThreadView>),
      deleteComment: jest.fn(async () => ({ ok: true, value: {} }) as unknown as ShareResult<ShareCommentDeleteValue>),
    });
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    const before = result.current.value;

    let resolveResult!: ShareResult<ShareCommentThreadView>;
    await act(async () => {
      resolveResult = await result.current.resolve("t1");
    });
    expect(resolveResult).toEqual({ ok: false, reason: "invalid-response" });
    expect(result.current.value).toBe(before);
    expect(result.current.notice?.kind).toBe("error");

    let deleteResult!: ShareResult<ShareCommentDeleteValue>;
    await act(async () => {
      deleteResult = await result.current.deleteComment("t1", "c1");
    });
    expect(deleteResult).toEqual({ ok: false, reason: "invalid-response" });
    expect(result.current.value).toBe(before);
  });

  it("API を呼ぶ直前に前の通知を消す（L-166）", async () => {
    const pendingWrite = deferred<ShareResult<ShareCommentThreadView>>();
    const api = createApi();
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    await act(async () => {
      await result.current.resolve("t1");
    });
    expect(result.current.notice).not.toBeNull();

    api.reopen.mockImplementationOnce(() => pendingWrite.promise);
    let writePromise!: Promise<unknown>;
    act(() => {
      writePromise = result.current.reopen("t1");
    });
    expect(result.current.notice).toBeNull();
    expect(result.current.busy).toBe(true);
    await act(async () => {
      pendingWrite.resolve({ ok: true, value: thread() });
      await writePromise;
    });
    expect(result.current.busy).toBe(false);
  });

  it("送信前の検証（空本文・二重送信）で止めた経路は API を呼ばず、前の通知を消さない（L-931）", async () => {
    const pendingWrite = deferred<ShareResult<ShareCommentThreadView>>();
    const api = createApi();
    const { result } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    await act(async () => {
      await result.current.resolve("t1");
    });
    const previousNotice = result.current.notice;
    expect(previousNotice).not.toBeNull();

    let emptyResult!: ShareResult<ShareCommentThreadView>;
    await act(async () => {
      emptyResult = await result.current.reply("t1", "  \n ");
    });
    expect(emptyResult.ok).toBe(false);
    expect(api.reply).not.toHaveBeenCalled();
    expect(result.current.notice).toBe(previousNotice);

    api.reopen.mockImplementationOnce(() => pendingWrite.promise);
    let firstPromise!: Promise<unknown>;
    act(() => {
      firstPromise = result.current.reopen("t1");
    });
    let secondResult!: ShareResult<ShareCommentThreadView>;
    await act(async () => {
      secondResult = await result.current.createThread(1, "二重");
    });
    expect(secondResult.ok).toBe(false);
    expect(api.createThread).not.toHaveBeenCalled();
    await act(async () => {
      pendingWrite.resolve({ ok: true, value: thread() });
      await firstPromise;
    });
    expect(api.reopen).toHaveBeenCalledTimes(1);
  });

  it("token / commenterUserId の変更で通知をクリアする", async () => {
    const api = createApi();
    const { result, rerender } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));
    await act(async () => {
      await result.current.resolve("t1");
    });
    expect(result.current.notice).not.toBeNull();

    rerender({ token: "tok-1", enabled: true, commenterUserId: null, sessionStatus: "ready", api });
    expect(result.current.notice).toBeNull();
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    await act(async () => {
      await result.current.resolve("t1");
    });
    expect(result.current.notice).not.toBeNull();
    rerender({ token: "tok-2", enabled: true, commenterUserId: null, sessionStatus: "ready", api });
    expect(result.current.notice).toBeNull();
  });

  it("セッション loading 中の reload は何もしない", async () => {
    const api = createApi();
    const { result } = renderComments({ api, sessionStatus: "loading", commenterUserId: null });
    await act(async () => {
      await result.current.reload();
    });
    expect(api.list).not.toHaveBeenCalled();
    expect(result.current.listState).toBe("idle");
  });

  it("主体が変わると busy を解除し、前の主体の書込みが残っていても新しい主体は書き込める", async () => {
    const pendingWrite = deferred<ShareResult<ShareCommentThreadView>>();
    const api = createApi({ resolve: jest.fn(() => pendingWrite.promise) });
    const { result, rerender } = renderComments({ api });
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    let oldWrite!: Promise<ShareResult<ShareCommentThreadView>>;
    act(() => {
      oldWrite = result.current.resolve("t1");
    });
    expect(result.current.busy).toBe(true);

    rerender({ token: "tok-1", enabled: true, commenterUserId: "user-2", sessionStatus: "ready", api });
    expect(result.current.busy).toBe(false);
    await waitFor(() => expect(result.current.listState).toBe("ready"));

    let newResult!: ShareResult<ShareCommentThreadView>;
    await act(async () => {
      newResult = await result.current.reply("t1", "新しい主体");
    });
    expect(newResult.ok).toBe(true);
    expect(api.reply).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingWrite.resolve({ ok: true, value: thread({ status: "resolved" }) });
      await oldWrite;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.value?.threads[0]?.status).toBe("open");
  });
});
