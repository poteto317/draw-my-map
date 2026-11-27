import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useSessionMock = jest.fn();
const signInMock = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
  signIn: (...args: unknown[]) => signInMock(...args),
}));

import { ShareViewerPage } from "@/app/share/[token]/ShareViewerPage";
import { mockNodePointerHandlers, pointer } from "@/components/map/testing/mapStageTestRuntime";
import type { ShareCommentThreadView } from "@/domain/share/shareComment";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import { createMapDocument, serializeMapDocument } from "@/domain/persistence/mapDocumentCodec";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

function documentJson(): string {
  return serializeMapDocument(
    createMapDocument(
      [
        createTestNode({
          id: 1,
          parentId: null,
          label: "公開根",
          x: 0,
          y: 0,
          width: 120,
          height: 48,
        }),
      ],
      "manual",
    ),
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("ShareViewerPage", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    useSessionMock.mockReset();
    signInMock.mockReset();
  });

  it("GET /api/share/view/[token] 成功で document を表示する", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/share/view/tok-abc");
      return jsonResponse({ ok: true, value: { documentJson: documentJson(), permission: "view" } });
    }) as typeof fetch;

    render(<ShareViewerPage token="tok-abc" />);
    expect(screen.getByRole("status")).toHaveTextContent(SHARE_MESSAGES.viewLoading);
    await waitFor(() => {
      expect(screen.getByTestId("share-map-view")).toBeInTheDocument();
    });
    // Pixi ラベルは DOM テキストに出ない。キャンバスが載っていることだけ見る
    expect(screen.getByTestId("share-map-view").querySelector("canvas")).toBeTruthy();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("404 / not-found は固定 viewNotFound（トークン非表示）", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ ok: false, reason: "not-found" }, 404),
    ) as typeof fetch;

    render(<ShareViewerPage token="secret-token-xyz" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SHARE_MESSAGES.viewNotFound);
    });
    expect(screen.queryByText("secret-token-xyz")).not.toBeInTheDocument();
    expect(screen.queryByText(SHARE_MESSAGES.viewEmpty)).not.toBeInTheDocument();
  });

  it("空ノード document は viewEmpty（loadError に倒さない）", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        ok: true,
        value: { documentJson: serializeMapDocument(createMapDocument([], "manual")), permission: "view" },
      }),
    ) as typeof fetch;

    render(<ShareViewerPage token="tok-empty" />);
    await waitFor(() => {
      expect(screen.getByText(SHARE_MESSAGES.viewEmpty)).toBeInTheDocument();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fetch reject は viewLoadFailed（loading のまま固めない）", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    render(<ShareViewerPage token="tok-reject" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SHARE_MESSAGES.viewLoadFailed);
    });
    expect(screen.queryByText(SHARE_MESSAGES.viewLoading)).not.toBeInTheDocument();
  });

  it("壊れた documentJson は viewLoadFailed", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ ok: true, value: { documentJson: "{", permission: "view" } }),
    ) as typeof fetch;

    render(<ShareViewerPage token="tok-bad-json" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(SHARE_MESSAGES.viewLoadFailed);
    });
    expect(screen.queryByText(SHARE_MESSAGES.viewEmpty)).not.toBeInTheDocument();
  });

  it("map / outline をページ内 state で切替える", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(async () =>
      jsonResponse({ ok: true, value: { documentJson: documentJson(), permission: "view" } }),
    ) as typeof fetch;

    render(<ShareViewerPage token="tok-mode" />);
    await waitFor(() => {
      expect(screen.getByTestId("share-map-view")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "アウトライン" }));
    expect(screen.getByTestId("share-outline-view")).toBeInTheDocument();
    expect(screen.getByText("公開根")).toBeInTheDocument();
  });

  describe("コメント（Phase 38）", () => {
    function twoNodeDocumentJson(): string {
      return serializeMapDocument(
        createMapDocument(
          [
            createTestNode({ id: 1, parentId: null, label: "公開根", x: 0, y: 0, width: 120, height: 48 }),
            createTestNode({ id: 2, parentId: 1, label: "公開子", x: 200, y: 0, width: 120, height: 48 }),
          ],
          "manual",
        ),
      );
    }

    function thread(overrides: Partial<ShareCommentThreadView> = {}): ShareCommentThreadView {
      return {
        id: "t1",
        nodeId: 2,
        nodeLabelSnapshot: "公開子",
        status: "open",
        resolvedByName: null,
        resolvedAt: null,
        createdAt: "2026-11-27T01:00:00.000Z",
        updatedAt: "2026-11-27T01:00:00.000Z",
        canResolve: false,
        comments: [
          { id: "c1", authorName: "<img src=x onerror=alert(1)>", body: "<b>本文</b>", createdAt: "2026-11-27T01:00:00.000Z", canDelete: false },
        ],
        ...overrides,
      };
    }

    type FetchCall = { url: string; method: string; body: unknown };

    function mockFetch(permission: "view" | "comment", signedIn: boolean) {
      const calls: FetchCall[] = [];
      global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (url === "/api/share/view/tok-c") {
          return jsonResponse({ ok: true, value: { documentJson: twoNodeDocumentJson(), permission } });
        }
        if (url === "/api/share/view/tok-c/comment-threads" && method === "GET") {
          return jsonResponse({
            ok: true,
            value: { threads: [thread()], viewer: { signedIn, canPost: signedIn, isOwner: false } },
          });
        }
        if (url === "/api/share/view/tok-c/comment-threads" && method === "POST") {
          return jsonResponse({
            ok: true,
            value: thread({
              id: "t2",
              nodeId: 1,
              nodeLabelSnapshot: "公開根",
              createdAt: "2026-11-27T02:00:00.000Z",
              comments: [{ id: "c2", authorName: "山田", body: "新規", createdAt: "2026-11-27T02:00:00.000Z", canDelete: true }],
            }),
          });
        }
        return jsonResponse({ ok: false, reason: "not-found" }, 404);
      }) as typeof fetch;
      return calls;
    }

    function signIn() {
      useSessionMock.mockReturnValue({
        data: { user: { id: "sub-1", name: "山田" }, expires: "2099-01-01T00:00:00.000Z" },
        status: "authenticated",
      });
    }

    it("view リンクではコメント UI が 0 件で、コメント API を呼ばない（V-C-UM1）", async () => {
      signIn();
      const user = userEvent.setup();
      const calls = mockFetch("view", true);
      render(<ShareViewerPage token="tok-c" />);
      await waitFor(() => expect(screen.getByTestId("share-map-view")).toBeInTheDocument());
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByTestId("share-comments-panel")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "アウトライン" }));
      expect(screen.queryByRole("button", { name: /コメント/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/^コメント/)).not.toBeInTheDocument();
      expect(calls.map((call) => call.url)).toEqual(["/api/share/view/tok-c"]);
    });

    it("comment リンクではパネルと一覧が出て、本文・表示名はテキストのまま描く", async () => {
      const calls = mockFetch("comment", false);
      render(<ShareViewerPage token="tok-c" />);
      const panel = await screen.findByTestId("share-comments-panel");
      await within(panel).findByText("<b>本文</b>");
      expect(within(panel).getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
      expect(panel.querySelector("img, b")).toBeNull();
      expect(calls.some((call) => call.url === "/api/share/view/tok-c/comment-threads" && call.method === "GET")).toBe(true);
      expect(within(panel).getByRole("button", { name: SHARE_COMMENT_MESSAGES.loginButton })).toBeInTheDocument();
    });

    it("セッション loading 中は一覧を取りに行かず、投稿系もログイン導線も出さない", async () => {
      useSessionMock.mockReturnValue({ data: undefined, status: "loading" });
      const calls = mockFetch("comment", false);
      render(<ShareViewerPage token="tok-c" />);
      const panel = await screen.findByTestId("share-comments-panel");
      expect(within(panel).getByText(SHARE_COMMENT_MESSAGES.sessionLoading)).toBeInTheDocument();
      expect(within(panel).queryByRole("button", { name: SHARE_COMMENT_MESSAGES.loginButton })).not.toBeInTheDocument();
      expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();
      expect(calls.map((call) => call.url)).toEqual(["/api/share/view/tok-c"]);
    });

    it("アウトラインの件数と「コメント」ボタンでノードを選び、ログイン済みなら投稿できる", async () => {
      signIn();
      const user = userEvent.setup();
      const calls = mockFetch("comment", true);
      render(<ShareViewerPage token="tok-c" />);
      const panel = await screen.findByTestId("share-comments-panel");
      await within(panel).findByText("<b>本文</b>");
      await user.click(screen.getByRole("button", { name: "アウトライン" }));
      expect(screen.getByText(`${SHARE_COMMENT_MESSAGES.title} 1`)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: `${SHARE_COMMENT_MESSAGES.title}（公開根）` }));
      expect(within(panel).getByTestId("share-comments-selected-node")).toHaveTextContent("公開根");
      await user.type(within(panel).getByRole("textbox", { name: `${SHARE_COMMENT_MESSAGES.title}（公開根）` }), "新規");
      await user.click(within(panel).getByRole("button", { name: SHARE_COMMENT_MESSAGES.submit }));
      await within(panel).findByText("新規");
      expect(calls.find((call) => call.method === "POST")).toEqual({
        url: "/api/share/view/tok-c/comment-threads",
        method: "POST",
        body: { nodeId: 1, body: "新規" },
      });
    });

    it("マップでノードをタップすると選ばれる", async () => {
      mockFetch("comment", true);
      signIn();
      render(<ShareViewerPage token="tok-c" />);
      const panel = await screen.findByTestId("share-comments-panel");
      await within(panel).findByText("<b>本文</b>");
      const canvas = screen.getByTestId("share-map-view").querySelector("canvas");
      if (!canvas) throw new Error("canvas not mounted");
      const fire = (type: "pointerdown" | "pointerup") => {
        const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 5, clientY: 5 });
        Object.defineProperty(event, "pointerId", { value: 1 });
        act(() => {
          canvas.dispatchEvent(event);
        });
      };
      fire("pointerdown");
      mockNodePointerHandlers.at(-1)?.pointerdown?.(pointer(0, 0));
      fire("pointerup");
      expect(within(panel).getByTestId("share-comments-selected-node")).toHaveTextContent("公開子");
    });

    it("折りたたみで隠れたノードのスレッドを選んでも展開しない", async () => {
      const user = userEvent.setup();
      mockFetch("comment", false);
      render(<ShareViewerPage token="tok-c" />);
      const panel = await screen.findByTestId("share-comments-panel");
      await within(panel).findByText("<b>本文</b>");
      await user.click(screen.getByRole("button", { name: "アウトライン" }));
      await user.click(screen.getByRole("button", { name: `公開根を${SHARE_MESSAGES.viewCollapse}` }));
      const outline = screen.getByTestId("share-outline-view");
      expect(within(outline).queryByText("公開子")).not.toBeInTheDocument();

      await user.click(within(panel).getByRole("button", { name: `${SHARE_COMMENT_MESSAGES.selectThreadNode}（公開子）` }));
      expect(within(panel).getByTestId("share-comments-selected-node")).toHaveTextContent("公開子");
      expect(within(outline).queryByText("公開子")).not.toBeInTheDocument();
    });
  });
});
