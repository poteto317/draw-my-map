import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";

const signInMock = jest.fn();

jest.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

import { useShareViewerComments } from "@/app/share/[token]/useShareViewerComments";
import { ShareCommentsPanel } from "@/components/share/ShareCommentsPanel";
import { classifyShareCommentThreads } from "@/domain/share/classifyShareCommentThreads";
import type {
  ShareCommentDeleteValue,
  ShareCommentListValue,
  ShareCommentThreadView,
  ShareCommentView,
} from "@/domain/share/shareComment";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
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

const NODE_LABELS: ReadonlyMap<number, string> = new Map([[1, "根ノード"], [2, "子ノード"]]);

function listResult(
  threads: readonly ShareCommentThreadView[],
  viewer: ShareCommentListValue["viewer"] = { signedIn: true, canPost: true, isOwner: false },
): ShareResult<ShareCommentListValue> {
  return { ok: true, value: { threads, viewer } };
}

function createApi(threads: readonly ShareCommentThreadView[] = []): jest.Mocked<ShareCommentsApiClient> {
  let current = [...threads];
  const find = (threadId: string) => {
    const found = current.find((item) => item.id === threadId);
    if (!found) throw new Error("missing thread");
    return found;
  };
  const save = (next: ShareCommentThreadView): ShareResult<ShareCommentThreadView> => {
    current = current.map((item) => (item.id === next.id ? next : item));
    return { ok: true, value: next };
  };
  return {
    list: jest.fn(async () => listResult(current)),
    createThread: jest.fn(async (_scope, input) => {
      const created = thread({
        id: `t-${current.length + 1}`,
        nodeId: input.nodeId,
        createdAt: "2026-11-27T03:00:00.000Z",
        comments: [comment({ id: `c-${current.length + 1}`, body: input.body })],
      });
      current = [...current, created];
      return { ok: true, value: created } as ShareResult<ShareCommentThreadView>;
    }),
    reply: jest.fn(async (_scope, threadId, input) =>
      save({ ...find(threadId), comments: [...find(threadId).comments, comment({ id: "c-reply", body: input.body })] })),
    resolve: jest.fn(async (_scope, threadId) =>
      save({ ...find(threadId), status: "resolved", resolvedByName: "山田", resolvedAt: "2026-11-27T04:00:00.000Z" })),
    reopen: jest.fn(async (_scope, threadId) =>
      save({ ...find(threadId), status: "open", resolvedByName: null, resolvedAt: null })),
    deleteComment: jest.fn(async (_scope, commentId) => {
      const owner = current.find((item) => item.comments.some((entry) => entry.id === commentId));
      const remaining = owner?.comments.filter((entry) => entry.id !== commentId) ?? [];
      const threadDeleted = remaining.length === 0;
      current = threadDeleted
        ? current.filter((item) => item !== owner)
        : current.map((item) => (item === owner ? { ...item, comments: remaining } : item));
      return { ok: true, value: { commentId, threadDeleted } } as ShareResult<ShareCommentDeleteValue>;
    }),
  } as unknown as jest.Mocked<ShareCommentsApiClient>;
}

type HarnessProps = {
  api: ShareCommentsApiClient;
  sessionStatus?: "loading" | "ready";
  signedIn?: boolean;
  initialSelectedNodeId?: number | null;
};

/** ShareViewerPage と同じ組み立て（hook → classify → パネル） */
function Harness({ api, sessionStatus = "ready", signedIn = true, initialSelectedNodeId = null }: HarnessProps) {
  const comments = useShareViewerComments({
    token: "tok-1",
    enabled: true,
    commenterUserId: signedIn ? "user-1" : null,
    sessionStatus,
    api,
  });
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(initialSelectedNodeId);
  const nodeIds = useMemo(() => new Set(NODE_LABELS.keys()), []);
  const threads = comments.value?.threads;
  const classified = useMemo(
    () => classifyShareCommentThreads(threads ?? [], nodeIds),
    [threads, nodeIds],
  );
  return (
    <div>
      <button type="button" onClick={() => setSelectedNodeId(1)}>test-select-1</button>
      <button type="button" onClick={() => setSelectedNodeId(2)}>test-select-2</button>
      <ShareCommentsPanel
        comments={comments}
        sessionStatus={sessionStatus}
        signedIn={signedIn}
        classified={classified}
        nodeLabelById={NODE_LABELS}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
      />
    </div>
  );
}

function newThreadBox(label: string): HTMLTextAreaElement {
  return screen.getByRole("textbox", { name: `${SHARE_COMMENT_MESSAGES.title}（${label}）` }) as HTMLTextAreaElement;
}

async function renderReady(props: HarnessProps) {
  render(<Harness {...props} />);
  await waitFor(() => expect(props.api.list).toHaveBeenCalled());
  // 一覧の応答が反映される（読込中表示が消える）まで待つ
  await waitFor(() => expect(screen.queryByText(SHARE_COMMENT_MESSAGES.loading)).not.toBeInTheDocument());
}

describe("ShareCommentsPanel", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("未選択では案内文、選択するとノードのラベルを出す", async () => {
    const user = userEvent.setup();
    await renderReady({ api: createApi() });
    const panel = screen.getByTestId("share-comments-panel");
    expect(within(panel).getByText(SHARE_COMMENT_MESSAGES.selectNodeHint)).toBeInTheDocument();
    expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "test-select-2" }));
    expect(within(panel).queryByText(SHARE_COMMENT_MESSAGES.selectNodeHint)).not.toBeInTheDocument();
    expect(within(panel).getByTestId("share-comments-selected-node")).toHaveTextContent("子ノード");
    expect(newThreadBox("子ノード")).toBeInTheDocument();
  });

  it("新規スレッドの下書きはノードごとに残り、一覧の差し替えで消えず、送信成功で空になる", async () => {
    const user = userEvent.setup();
    const api = createApi([thread()]);
    await renderReady({ api, initialSelectedNodeId: 1 });

    await user.type(newThreadBox("根ノード"), "A の下書き");
    await user.click(screen.getByRole("button", { name: "test-select-2" }));
    expect(newThreadBox("子ノード").value).toBe("");
    await user.click(screen.getByRole("button", { name: "test-select-1" }));
    expect(newThreadBox("根ノード").value).toBe("A の下書き");

    await user.click(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.reload }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(newThreadBox("根ノード").value).toBe("A の下書き");

    await user.click(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.submit }));
    await waitFor(() => expect(newThreadBox("根ノード").value).toBe(""));
    expect(api.createThread).toHaveBeenCalledWith({ kind: "token", token: "tok-1" }, { nodeId: 1, body: "A の下書き" });
    expect(await screen.findByText(SHARE_COMMENT_MESSAGES.createSuccess)).toBeInTheDocument();
  });

  it("送信が失敗したら新規スレッドの下書きを残す", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createThread.mockResolvedValueOnce({ ok: false, reason: "invalid-node" });
    await renderReady({ api, initialSelectedNodeId: 1 });
    await user.type(newThreadBox("根ノード"), "残る");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(api.createThread).toHaveBeenCalledTimes(1));
    expect(newThreadBox("根ノード").value).toBe("残る");
  });

  it("読込中は読込中表示、失敗は error で 0 件案内を出さない（L-002）", async () => {
    let finish!: (result: ShareResult<ShareCommentListValue>) => void;
    const api = createApi();
    api.list.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
    }));
    render(<Harness api={api} />);
    await waitFor(() => expect(screen.getByText(SHARE_COMMENT_MESSAGES.loading)).toBeInTheDocument());
    expect(screen.queryByText(SHARE_COMMENT_MESSAGES.empty)).not.toBeInTheDocument();

    await act(async () => {
      finish({ ok: false, reason: "storage-error" });
    });
    expect(screen.getByText(SHARE_COMMENT_MESSAGES.loadFailed)).toBeInTheDocument();
    expect(screen.queryByText(SHARE_COMMENT_MESSAGES.empty)).not.toBeInTheDocument();
  });

  it("ready で 0 件なら 0 件案内", async () => {
    await renderReady({ api: createApi() });
    expect(screen.getByText(SHARE_COMMENT_MESSAGES.empty)).toBeInTheDocument();
  });

  it("セッション loading 中は確認中表示だけで、投稿系とログイン導線を出さない（L-463）", async () => {
    render(<Harness api={createApi([thread()])} sessionStatus="loading" signedIn={false} initialSelectedNodeId={1} />);
    expect(screen.getByText(SHARE_COMMENT_MESSAGES.sessionLoading)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SHARE_COMMENT_MESSAGES.loginButton })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SHARE_COMMENT_MESSAGES.submit })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.reload })).toBeDisabled();
  });

  it("未ログインはログイン導線で、現在のパスへ戻る signIn を呼ぶ（投稿欄は出さない）", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/share/tok-1");
    const api = createApi([thread()]);
    api.list.mockResolvedValue(listResult([thread()], { signedIn: false, canPost: false, isOwner: false }));
    await renderReady({ api, signedIn: false, initialSelectedNodeId: 1 });

    expect(screen.getByText(SHARE_COMMENT_MESSAGES.loginRequired)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.loginButton }));
    expect(signInMock).toHaveBeenCalledWith("google", { redirectTo: "/share/tok-1" });
    window.history.pushState({}, "", "/");
  });

  it("ログイン済みで viewer.canPost が false なら投稿欄を出さない", async () => {
    const api = createApi([thread()]);
    api.list.mockResolvedValue(listResult([thread()], { signedIn: true, canPost: false, isOwner: false }));
    await renderReady({ api, initialSelectedNodeId: 1 });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("名前の注意文は新規スレッドの投稿欄より上にある", async () => {
    await renderReady({ api: createApi(), initialSelectedNodeId: 1 });
    const notice = screen.getByText(SHARE_COMMENT_MESSAGES.nameVisibilityNotice);
    const box = newThreadBox("根ノード");
    expect(notice.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("削除されたノードのスレッドは「削除されたノード」節に出る", async () => {
    await renderReady({ api: createApi([thread({ id: "t-gone", nodeId: 99, nodeLabelSnapshot: "消えた" })]) });
    expect(screen.getByText(`${SHARE_COMMENT_MESSAGES.orphanedSection}（1）`)).toBeInTheDocument();
    expect(screen.getByText(`${SHARE_COMMENT_MESSAGES.orphanedPrefix}消えた`)).toBeInTheDocument();
  });

  it("スレッドの「このノードを選択」で onSelectNode に nodeId を渡す", async () => {
    const user = userEvent.setup();
    await renderReady({ api: createApi([thread({ id: "t2", nodeId: 2, nodeLabelSnapshot: "子ノード" })]) });
    await user.click(screen.getByRole("button", { name: `${SHARE_COMMENT_MESSAGES.selectThreadNode}（子ノード）` }));
    expect(screen.getByTestId("share-comments-selected-node")).toHaveTextContent("子ノード");
  });

  describe("操作後のフォーカス（L-397）", () => {
    it("解決すると次のスレッドの見出しへ、無ければ一覧の見出しへ", async () => {
      const user = userEvent.setup();
      await renderReady({
        api: createApi([thread({ id: "t1" }), thread({ id: "t2", nodeId: 2, createdAt: "2026-11-27T02:00:00.000Z" })]),
      });
      await user.click(screen.getByRole("button", { name: `${SHARE_COMMENT_MESSAGES.resolve}（根ノード）` }));
      await waitFor(() => expect(document.activeElement).toHaveAttribute("data-thread-id", "t2"));

      await user.click(screen.getByRole("button", { name: `${SHARE_COMMENT_MESSAGES.resolve}（子ノード）` }));
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole("heading", { name: SHARE_COMMENT_MESSAGES.title })));
    });

    it("再開するとそのスレッドの見出しへ", async () => {
      const user = userEvent.setup();
      await renderReady({ api: createApi([thread({ id: "t1", status: "resolved", resolvedByName: "山田" })]) });
      await user.click(screen.getByText(`${SHARE_COMMENT_MESSAGES.resolvedSection}（1）`));
      await user.click(screen.getByRole("button", { name: `${SHARE_COMMENT_MESSAGES.reopen}（根ノード）` }));
      await waitFor(() => expect(document.activeElement).toHaveAttribute("data-thread-id", "t1"));
    });

    it("削除でスレッドが残ればその見出し、消えたら一覧の見出しへ", async () => {
      const user = userEvent.setup();
      await renderReady({
        api: createApi([thread({ id: "t1", comments: [comment({ id: "c1" }), comment({ id: "c2", authorName: "佐藤" })] })]),
      });
      await user.click(screen.getByRole("button", { name: /^削除（佐藤/ }));
      await user.click(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.deleteConfirmYes }));
      await waitFor(() => expect(document.activeElement).toHaveAttribute("data-thread-id", "t1"));

      await user.click(screen.getByRole("button", { name: /^削除（山田/ }));
      await user.click(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.deleteConfirmYes }));
      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByRole("heading", { name: SHARE_COMMENT_MESSAGES.title })));
    });
  });
});
