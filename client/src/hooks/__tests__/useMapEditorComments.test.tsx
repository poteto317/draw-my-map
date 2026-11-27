import { act, renderHook, waitFor } from "@testing-library/react";
import type { ShareCommentsPanelComments } from "@/components/share/ShareCommentsPanel";
import type {
  ShareCommentDeleteValue,
  ShareCommentListValue,
  ShareCommentThreadView,
  ShareCommentView,
} from "@/domain/share/shareComment";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import { shareCommentOperationFailureMessage } from "@/domain/share/shareCommentOperationMessages";
import type { ShareResult } from "@/domain/share/shareResult";
import {
  useMapEditorComments,
  type MapEditorComments,
  type UseMapEditorCommentsOptions,
} from "@/hooks/useMapEditorComments";
import type { ShareCommentsApiClient } from "@/services/share/shareCommentsApiClient";

// 所有者側の戻り値は閲覧パネルの props 型も構造的に満たす（部品の共有のため）
type AssertAssignable<T extends ShareCommentsPanelComments> = T;
export type MapEditorCommentsSatisfiesPanel = AssertAssignable<MapEditorComments>;

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
  return { threads, viewer: { signedIn: true, canPost: true, isOwner: true } };
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

const OWNER = { userId: "user-1", email: "owner@example.com" };
const NODE_IDS: ReadonlySet<number> = new Set([1, 2]);
const OWNER_SCOPE = { kind: "owner", sharedMapId: "shared-1" } as const;

function renderComments(initial: Partial<UseMapEditorCommentsOptions> & { api: ShareCommentsApiClient }) {
  const initialProps: UseMapEditorCommentsOptions = {
    mapId: "map-1",
    sharedMapId: "shared-1",
    shareSession: OWNER,
    shareSessionStatus: "ready",
    dialogOpen: false,
    nodeIds: NODE_IDS,
    ...initial,
  };
  const hook = renderHook((props: UseMapEditorCommentsOptions) => useMapEditorComments(props), { initialProps });
  let props = initialProps;
  const update = (patch: Partial<UseMapEditorCommentsOptions>) => {
    props = { ...props, ...patch };
    hook.rerender(props);
  };
  return { ...hook, update };
}

describe("useMapEditorComments", () => {
  describe("idle 条件", () => {
    it("未共有（sharedMapId が null）では取得せず idle で、バッジは空・summary は null", async () => {
      const api = createApi();
      const { result } = renderComments({ api, sharedMapId: null });
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.list).not.toHaveBeenCalled();
      expect(result.current.listState).toBe("idle");
      expect(result.current.value).toBeNull();
      expect(result.current.classified).toBeNull();
      expect(result.current.openCountByNode.size).toBe(0);
      expect(result.current.summaryForNode(1)).toBeNull();
    });

    it("api 省略でも idle の間は既定の API クライアントを作らない（fetch の無い環境で描画できる）", async () => {
      const originalFetch = globalThis.fetch;
      delete (globalThis as { fetch?: typeof fetch }).fetch;
      try {
        const { result } = renderHook(() => useMapEditorComments({
          mapId: "map-1",
          sharedMapId: null,
          shareSession: null,
          shareSessionStatus: "ready",
          dialogOpen: false,
          nodeIds: NODE_IDS,
        }));
        await act(async () => {
          await Promise.resolve();
        });
        expect(result.current.listState).toBe("idle");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("未ログインでは取得せず idle", async () => {
      const api = createApi();
      const { result } = renderComments({ api, shareSession: null });
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.list).not.toHaveBeenCalled();
      expect(result.current.listState).toBe("idle");
    });

    it("セッション loading 中は取得せず idle、reload も何もしない（L-463）", async () => {
      const api = createApi();
      const { result } = renderComments({ api, shareSessionStatus: "loading" });
      await act(async () => {
        await result.current.reload();
      });
      expect(api.list).not.toHaveBeenCalled();
      expect(result.current.listState).toBe("idle");
    });

    it("idle の間の書込みは API を呼ばずに失敗を返す", async () => {
      const api = createApi();
      const { result } = renderComments({ api, sharedMapId: null });
      let writeResult!: ShareResult<ShareCommentThreadView>;
      await act(async () => {
        writeResult = await result.current.resolve("t1");
      });
      expect(writeResult.ok).toBe(false);
      expect(api.resolve).not.toHaveBeenCalled();
    });
  });

  describe("取得の契機", () => {
    it("mapId・sharedMapId・userId が揃ったとき所有者経路で 1 回取得する", async () => {
      const api = createApi();
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(api.list).toHaveBeenCalledWith(OWNER_SCOPE);
      expect(result.current.value?.threads.map((item) => item.id)).toEqual(["t1"]);
    });

    it("セッションが loading から ready になってから取得する", async () => {
      const api = createApi();
      const { result, update } = renderComments({ api, shareSessionStatus: "loading" });
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.list).not.toHaveBeenCalled();
      update({ shareSessionStatus: "ready" });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(api.list).toHaveBeenCalledTimes(1);
    });

    it("dialogOpen が false → true で取り直し、開いたままの再描画や閉じるでは取り直さない", async () => {
      const api = createApi();
      const { result, update } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(api.list).toHaveBeenCalledTimes(1);

      update({ dialogOpen: true });
      await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
      update({ nodeIds: new Set([1, 2, 3]) });
      update({ dialogOpen: false });
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.list).toHaveBeenCalledTimes(2);
      // ready のまま取り直すので一覧は出したまま
      expect(result.current.listState).toBe("ready");
    });

    it("最初から dialogOpen が true でも取得は 1 回", async () => {
      const api = createApi();
      const { result } = renderComments({ api, dialogOpen: true });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.list).toHaveBeenCalledTimes(1);
    });

    it("reload で取り直す", async () => {
      const api = createApi();
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      await act(async () => {
        await result.current.reload();
      });
      expect(api.list).toHaveBeenCalledTimes(2);
    });
  });

  describe("世代と要求番号（L-037 / L-040 / L-883 / L-571 / L-1037）", () => {
    it("再読み込み中に書込みが成功し、後から届いた古い一覧は捨てる", async () => {
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
      expect(result.current.openCountByNode.size).toBe(0);
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

    it("mapId の切替中に届いた前のマップの応答は捨てる", async () => {
      const pending = deferred<ShareResult<ShareCommentListValue>>();
      const api = createApi({ list: jest.fn(() => pending.promise) });
      const { result, update } = renderComments({ api });
      await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));

      const next = deferred<ShareResult<ShareCommentListValue>>();
      api.list.mockImplementationOnce(() => next.promise);
      update({ mapId: "map-2", sharedMapId: "shared-2" });
      expect(result.current.value).toBeNull();
      await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
      expect(api.list).toHaveBeenLastCalledWith({ kind: "owner", sharedMapId: "shared-2" });

      await act(async () => {
        pending.resolve({ ok: true, value: listValue([thread({ id: "t-map-1" })]) });
      });
      expect(result.current.value).toBeNull();
      expect(result.current.listState).toBe("loading");

      await act(async () => {
        next.resolve({ ok: true, value: listValue([thread({ id: "t-map-2" })]) });
      });
      expect(result.current.value?.threads.map((item) => item.id)).toEqual(["t-map-2"]);
    });

    it("同じ sharedMapId でも mapId が変われば世代を進めて取り直す", async () => {
      const api = createApi();
      const { result, update } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      update({ mapId: "map-2" });
      expect(result.current.value).toBeNull();
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(api.list).toHaveBeenCalledTimes(2);
    });

    it("A → B → A とアカウントが戻っても、最初の A の取得中の応答は捨てる（L-571）", async () => {
      const firstA = deferred<ShareResult<ShareCommentListValue>>();
      const api = createApi({ list: jest.fn(() => firstA.promise) });
      const { result, update } = renderComments({ api });
      await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));

      const forB = deferred<ShareResult<ShareCommentListValue>>();
      const secondA = deferred<ShareResult<ShareCommentListValue>>();
      api.list.mockImplementationOnce(() => forB.promise).mockImplementationOnce(() => secondA.promise);
      update({ shareSession: { userId: "user-2", email: "other@example.com" } });
      await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
      update({ shareSession: OWNER });
      await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));

      await act(async () => {
        firstA.resolve({ ok: true, value: listValue([thread({ id: "t-old-a" })]) });
      });
      expect(result.current.value).toBeNull();
      await act(async () => {
        secondA.resolve({ ok: true, value: listValue([thread({ id: "t-new-a" })]) });
      });
      expect(result.current.value?.threads.map((item) => item.id)).toEqual(["t-new-a"]);
    });

    it("A → B → A と戻っても、最初の A の書込みで busy が残らない（L-571）", async () => {
      const pendingWrite = deferred<ShareResult<ShareCommentThreadView>>();
      const api = createApi({ resolve: jest.fn(() => pendingWrite.promise) });
      const { result, update } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));

      let oldWrite!: Promise<unknown>;
      act(() => {
        oldWrite = result.current.resolve("t1");
      });
      expect(result.current.busy).toBe(true);
      update({ shareSession: { userId: "user-2", email: "other@example.com" } });
      update({ shareSession: OWNER });
      expect(result.current.busy).toBe(false);
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(result.current.busy).toBe(false);

      await act(async () => {
        pendingWrite.resolve({ ok: true, value: thread({ status: "resolved" }) });
        await oldWrite;
      });
      expect(result.current.busy).toBe(false);
    });

    it("ログアウトで一覧とバッジが空になり idle に戻る", async () => {
      const api = createApi();
      const { result, update } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(result.current.openCountByNode.get(1)).toBe(1);

      update({ shareSession: null });
      expect(result.current.listState).toBe("idle");
      expect(result.current.value).toBeNull();
      expect(result.current.classified).toBeNull();
      expect(result.current.openCountByNode.size).toBe(0);
      expect(result.current.summaryForNode(1)).toBeNull();
    });

    it("書込み中に mapId が変わったら、届いた書込み応答を新しいマップの一覧に適用しない", async () => {
      const pendingWrite = deferred<ShareResult<ShareCommentThreadView>>();
      const api = createApi({ resolve: jest.fn(() => pendingWrite.promise) });
      const { result, update } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));

      let writePromise!: Promise<ShareResult<ShareCommentThreadView>>;
      act(() => {
        writePromise = result.current.resolve("t1");
      });
      expect(result.current.busy).toBe(true);
      update({ mapId: "map-2", sharedMapId: "shared-2" });
      expect(result.current.busy).toBe(false);
      await waitFor(() => expect(result.current.listState).toBe("ready"));

      let writeResult!: ShareResult<ShareCommentThreadView>;
      await act(async () => {
        pendingWrite.resolve({ ok: true, value: thread({ id: "t1", status: "resolved" }) });
        writeResult = await writePromise;
      });
      expect(writeResult.ok).toBe(false);
      expect(result.current.value?.threads[0]?.status).toBe("open");
      expect(result.current.notice).toBeNull();
    });
  });

  describe("一覧の状態（L-002）", () => {
    it("取得中は loading でバッジ空、失敗は error で value・バッジ・classified を残さない", async () => {
      const api = createApi();
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(result.current.openCountByNode.get(1)).toBe(1);

      api.list.mockResolvedValueOnce({ ok: false, reason: "storage-error" });
      // error から取り直すと loading（前回の値を出さない）
      await act(async () => {
        await result.current.reload();
      });
      expect(result.current.listState).toBe("error");
      expect(result.current.value).toBeNull();
      expect(result.current.classified).toBeNull();
      expect(result.current.openCountByNode.size).toBe(0);
      expect(result.current.summaryForNode(1)).toBeNull();

      const pending = deferred<ShareResult<ShareCommentListValue>>();
      api.list.mockImplementationOnce(() => pending.promise);
      let reloadPromise!: Promise<void>;
      act(() => {
        reloadPromise = result.current.reload();
      });
      expect(result.current.listState).toBe("loading");
      expect(result.current.openCountByNode.size).toBe(0);
      await act(async () => {
        pending.resolve({ ok: true, value: listValue([]) });
        await reloadPromise;
      });
      expect(result.current.listState).toBe("ready");
    });

    it("成功でも threads が配列でない応答は error", async () => {
      const api = createApi({
        list: jest.fn(async () => ({ ok: true }) as unknown as ShareResult<ShareCommentListValue>),
      });
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("error"));
      expect(result.current.value).toBeNull();
    });
  });

  describe("振り分け・件数・summaryForNode", () => {
    it("ローカルのノード ID 集合で振り分け、未解決数をノードごとに数える（削除されたノードは数えない）", async () => {
      const api = createApi({
        list: jest.fn(async () => ({
          ok: true,
          value: listValue([
            thread({ id: "a", nodeId: 1 }),
            thread({ id: "b", nodeId: 1 }),
            thread({ id: "c", nodeId: 2, status: "resolved" }),
            thread({ id: "d", nodeId: 99 }),
          ]),
        }) as ShareResult<ShareCommentListValue>),
      });
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(result.current.classified?.orphaned.map((item) => item.id)).toEqual(["d"]);
      expect([...result.current.openCountByNode]).toEqual([[1, 2]]);
      expect(result.current.summaryForNode(1)).toEqual({ open: 2, resolved: 0 });
      expect(result.current.summaryForNode(2)).toEqual({ open: 0, resolved: 1 });
    });

    it("ready で 0 件のノードは { open: 0, resolved: 0 }", async () => {
      const api = createApi({
        list: jest.fn(async () => ({ ok: true, value: listValue([]) }) as ShareResult<ShareCommentListValue>),
      });
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(result.current.summaryForNode(1)).toEqual({ open: 0, resolved: 0 });
      expect(result.current.openCountByNode.size).toBe(0);
    });

    it("nodeIds が変わると振り分けし直す", async () => {
      const api = createApi({
        list: jest.fn(async () => ({
          ok: true,
          value: listValue([thread({ id: "a", nodeId: 3 })]),
        }) as ShareResult<ShareCommentListValue>),
      });
      const { result, update } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      expect(result.current.classified?.orphaned).toHaveLength(1);
      update({ nodeIds: new Set([1, 2, 3]) });
      expect(result.current.classified?.orphaned).toHaveLength(0);
      expect(result.current.openCountByNode.get(3)).toBe(1);
      expect(api.list).toHaveBeenCalledTimes(1);
    });
  });

  describe("書込み", () => {
    it("所有者経路で書込み、応答で該当スレッドだけ差し替えて成功文言を出す", async () => {
      const api = createApi({
        list: jest.fn(async () => ({
          ok: true,
          value: listValue([thread(), thread({ id: "t2", nodeId: 2 })]),
        }) as ShareResult<ShareCommentListValue>),
      });
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      const before = result.current.value?.threads[1];

      await act(async () => {
        await result.current.reply("t1", "返信");
      });
      expect(api.reply).toHaveBeenCalledWith(OWNER_SCOPE, "t1", { body: "返信" });
      expect(result.current.value?.threads[0]?.comments).toHaveLength(2);
      expect(result.current.value?.threads[1]).toBe(before);
      expect(result.current.notice).toEqual({ kind: "status", message: SHARE_COMMENT_MESSAGES.replySuccess });
    });

    it("作成・解決・再開・削除が一覧と件数に反映される", async () => {
      const api = createApi();
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));

      await act(async () => {
        await result.current.createThread(2, "新規");
      });
      expect(api.createThread).toHaveBeenCalledWith(OWNER_SCOPE, { nodeId: 2, body: "新規" });
      expect(result.current.openCountByNode.get(2)).toBe(1);
      expect(result.current.notice?.message).toBe(SHARE_COMMENT_MESSAGES.createSuccess);

      await act(async () => {
        await result.current.resolve("t1");
      });
      expect(result.current.summaryForNode(1)).toEqual({ open: 0, resolved: 1 });
      expect(result.current.notice?.message).toBe(SHARE_COMMENT_MESSAGES.resolveSuccess);

      await act(async () => {
        await result.current.reopen("t1");
      });
      expect(result.current.summaryForNode(1)).toEqual({ open: 1, resolved: 0 });
      expect(result.current.notice?.message).toBe(SHARE_COMMENT_MESSAGES.reopenSuccess);

      await act(async () => {
        await result.current.deleteComment("t1", "c1");
      });
      expect(api.deleteComment).toHaveBeenCalledWith(OWNER_SCOPE, "c1");
      expect(result.current.summaryForNode(1)).toEqual({ open: 0, resolved: 0 });
      expect(result.current.notice?.message).toBe(SHARE_COMMENT_MESSAGES.deleteSuccess);
    });

    it("失敗は notice の error（invalid-node の文言）で、一覧は変えない", async () => {
      const api = createApi({
        createThread: jest.fn(async () => ({ ok: false, reason: "invalid-node" }) as ShareResult<ShareCommentThreadView>),
      });
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      const before = result.current.value;

      let writeResult!: ShareResult<ShareCommentThreadView>;
      await act(async () => {
        writeResult = await result.current.createThread(1, "新規");
      });
      expect(writeResult).toEqual({ ok: false, reason: "invalid-node" });
      expect(result.current.value).toBe(before);
      expect(result.current.notice).toEqual({
        kind: "error",
        message: shareCommentOperationFailureMessage("invalid-node"),
      });
    });

    it("成功でも値の形が違えば invalid-response の error にして一覧を変えない（L-002）", async () => {
      const api = createApi({
        reopen: jest.fn(async () => ({ ok: true }) as unknown as ShareResult<ShareCommentThreadView>),
        deleteComment: jest.fn(async () => ({ ok: true, value: {} }) as unknown as ShareResult<ShareCommentDeleteValue>),
      });
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      const before = result.current.value;

      let reopenResult!: ShareResult<ShareCommentThreadView>;
      await act(async () => {
        reopenResult = await result.current.reopen("t1");
      });
      expect(reopenResult).toEqual({ ok: false, reason: "invalid-response" });
      expect(result.current.value).toBe(before);
      expect(result.current.notice?.kind).toBe("error");

      let deleteResult!: ShareResult<ShareCommentDeleteValue>;
      await act(async () => {
        deleteResult = await result.current.deleteComment("t1", "c1");
      });
      expect(deleteResult).toEqual({ ok: false, reason: "invalid-response" });
      expect(result.current.value).toBe(before);
    });
  });

  describe("通知（L-166 / L-931）", () => {
    it("API を呼ぶ直前に前の通知を消し、書込み中は busy", async () => {
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

    it("送信前の検証（空本文・二重送信）で止めた経路は API を呼ばず、前の通知を消さない", async () => {
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
        emptyResult = await result.current.createThread(1, "  \n ");
      });
      expect(emptyResult.ok).toBe(false);
      expect(api.createThread).not.toHaveBeenCalled();
      expect(result.current.notice).toBe(previousNotice);

      api.reopen.mockImplementationOnce(() => pendingWrite.promise);
      let firstPromise!: Promise<unknown>;
      act(() => {
        firstPromise = result.current.reopen("t1");
      });
      let secondResult!: ShareResult<ShareCommentThreadView>;
      await act(async () => {
        secondResult = await result.current.reply("t1", "二重");
      });
      expect(secondResult.ok).toBe(false);
      expect(api.reply).not.toHaveBeenCalled();
      await act(async () => {
        pendingWrite.resolve({ ok: true, value: thread() });
        await firstPromise;
      });
      expect(api.reopen).toHaveBeenCalledTimes(1);
    });

    it("clearNotice で通知を消す", async () => {
      const api = createApi();
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      await act(async () => {
        await result.current.resolve("t1");
      });
      const sequence = result.current.noticeSequence;
      act(() => {
        result.current.clearNotice();
      });
      expect(result.current.notice).toBeNull();
      expect(result.current.noticeSequence).toBeGreaterThan(sequence);
    });

    it.each([
      ["mapId", { mapId: "map-2" }],
      ["sharedMapId", { sharedMapId: "shared-2" }],
      ["userId", { shareSession: { userId: "user-2", email: "other@example.com" } }],
    ] as const)("%s の変更で通知をクリアする", async (_label, patch) => {
      const api = createApi();
      const { result, update } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      await act(async () => {
        await result.current.resolve("t1");
      });
      expect(result.current.notice).not.toBeNull();
      update(patch);
      expect(result.current.notice).toBeNull();
      await waitFor(() => expect(result.current.listState).toBe("ready"));
    });

    it("書込み中にダイアログを閉じ、閉じた後に届いた応答の通知は次に開いたとき消える（L-166）", async () => {
      const pendingWrite = deferred<ShareResult<ShareCommentThreadView>>();
      const api = createApi({ resolve: jest.fn(() => pendingWrite.promise) });
      const { result, update } = renderComments({ api, dialogOpen: true });
      await waitFor(() => expect(result.current.listState).toBe("ready"));

      let writePromise!: Promise<unknown>;
      act(() => {
        writePromise = result.current.resolve("t1");
      });
      act(() => {
        result.current.clearNotice();
      });
      update({ dialogOpen: false });
      await act(async () => {
        pendingWrite.resolve({ ok: true, value: thread({ status: "resolved" }) });
        await writePromise;
      });
      expect(result.current.notice).not.toBeNull();

      update({ dialogOpen: true });
      expect(result.current.notice).toBeNull();
      await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    });

    it("同一文言の成功が続いても noticeSequence が進む", async () => {
      const api = createApi();
      const { result } = renderComments({ api });
      await waitFor(() => expect(result.current.listState).toBe("ready"));
      await act(async () => {
        await result.current.resolve("t1");
      });
      const first = result.current.noticeSequence;
      await act(async () => {
        await result.current.resolve("t1");
      });
      expect(result.current.notice?.message).toBe(SHARE_COMMENT_MESSAGES.resolveSuccess);
      expect(result.current.noticeSequence).toBeGreaterThan(first);
    });
  });
});
