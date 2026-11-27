import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import {
  MapCommentsDialog,
  type MapCommentsDialogProps,
} from "@/components/layout/MapCommentsDialog";
import type {
  ShareCommentDeleteValue,
  ShareCommentListValue,
  ShareCommentThreadView,
  ShareCommentView,
} from "@/domain/share/shareComment";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import { shareCommentOperationFailureMessage } from "@/domain/share/shareCommentOperationMessages";
import type { ShareResult } from "@/domain/share/shareResult";
import type { ShareSession } from "@/domain/share/shareSession";
import { useMapEditorComments, type MapEditorComments } from "@/hooks/useMapEditorComments";
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
const OWNER: ShareSession = { userId: "user-1", email: "owner@example.com", displayName: null };

/** L-060: 必須 props が型上省略不可であることをコンパイル時に担保する参照 */
const REQUIRED_MAP_COMMENTS_DIALOG_PROP_KEYS = [
  "comments",
  "nodeLabelById",
  "selectedNodeId",
  "initialFilter",
  "shareSession",
  "shareSessionStatus",
  "onLogin",
  "onClose",
  "dialogMouseClickedAtRef",
] as const satisfies ReadonlyArray<keyof MapCommentsDialogProps>;

function listResult(threads: readonly ShareCommentThreadView[]): ShareResult<ShareCommentListValue> {
  return { ok: true, value: { threads, viewer: { signedIn: true, canPost: true, isOwner: true } } };
}

/** サーバーの代わりに一覧を持つ API（書込みの応答と次の一覧が食い違わない） */
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
  shareSession?: ShareSession;
  shareSessionStatus?: "loading" | "ready";
  initialFilter?: "selected" | "all";
  initialSelectedNodeId?: number | null;
  onLogin?: () => void;
  onClose?: () => void;
};

/** MapEditor と同じ組み立て（hook → ダイアログ） */
function Harness({
  api,
  shareSession = OWNER,
  shareSessionStatus = "ready",
  initialFilter = "all",
  initialSelectedNodeId = null,
  onLogin = jest.fn(),
  onClose = jest.fn(),
}: HarnessProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(initialSelectedNodeId);
  const nodeIds = useMemo(() => new Set(NODE_LABELS.keys()), []);
  const comments = useMapEditorComments({
    mapId: "map-1",
    sharedMapId: "shared-1",
    shareSession,
    shareSessionStatus,
    dialogOpen: true,
    nodeIds,
    api,
  });
  return (
    <div>
      <button type="button" onClick={() => setSelectedNodeId(1)}>test-select-1</button>
      <button type="button" onClick={() => setSelectedNodeId(2)}>test-select-2</button>
      <MapCommentsDialog
        comments={comments}
        nodeLabelById={NODE_LABELS}
        selectedNodeId={selectedNodeId}
        initialFilter={initialFilter}
        shareSession={shareSession}
        shareSessionStatus={shareSessionStatus}
        onLogin={onLogin}
        onClose={onClose}
        dialogMouseClickedAtRef={{ current: null }}
      />
    </div>
  );
}

async function renderReady(props: HarnessProps) {
  render(<Harness {...props} />);
  await waitFor(() => expect(props.api.list).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText(SHARE_COMMENT_MESSAGES.loading)).not.toBeInTheDocument());
}

function dialog() {
  return screen.getByTestId("map-comments-dialog");
}

function newThreadBox(label: string): HTMLTextAreaElement {
  return within(dialog()).getByRole("textbox", { name: `${SHARE_COMMENT_MESSAGES.title}（${label}）` }) as HTMLTextAreaElement;
}

function stubComments(overrides: Partial<MapEditorComments> = {}): MapEditorComments {
  return {
    listState: "ready",
    value: { threads: [], viewer: { signedIn: true, canPost: true, isOwner: true } },
    classified: { attached: new Map(), orphaned: [] },
    openCountByNode: new Map(),
    summaryForNode: () => ({ open: 0, resolved: 0 }),
    reload: jest.fn(async () => {}),
    createThread: jest.fn(async () => ({ ok: false, reason: "not-found" }) as ShareResult<ShareCommentThreadView>),
    reply: jest.fn(async () => ({ ok: false, reason: "not-found" }) as ShareResult<ShareCommentThreadView>),
    resolve: jest.fn(async () => ({ ok: false, reason: "not-found" }) as ShareResult<ShareCommentThreadView>),
    reopen: jest.fn(async () => ({ ok: false, reason: "not-found" }) as ShareResult<ShareCommentThreadView>),
    deleteComment: jest.fn(async () => ({ ok: false, reason: "not-found" }) as ShareResult<ShareCommentDeleteValue>),
    notice: null,
    noticeSequence: 0,
    busy: false,
    clearNotice: jest.fn(),
    ...overrides,
  };
}

function stubProps(overrides: Partial<MapCommentsDialogProps> = {}): MapCommentsDialogProps {
  return {
    comments: stubComments(),
    nodeLabelById: NODE_LABELS,
    selectedNodeId: null,
    initialFilter: "all",
    shareSession: OWNER,
    shareSessionStatus: "ready",
    onLogin: jest.fn(),
    onClose: jest.fn(),
    dialogMouseClickedAtRef: { current: null },
    ...overrides,
  };
}

describe("MapCommentsDialog", () => {
  it("必須 props の一覧を型で固定する（L-060）", () => {
    expect(REQUIRED_MAP_COMMENTS_DIALOG_PROP_KEYS).toHaveLength(9);
  });

  it("role=dialog・aria-modal で、見出し「コメント」に名前が付き、最初の操作できる要素にフォーカスする", () => {
    render(<MapCommentsDialog {...stubProps()} />);
    const root = screen.getByRole("dialog", { name: SHARE_COMMENT_MESSAGES.title });
    expect(root).toBe(dialog());
    expect(root).toHaveAttribute("aria-modal", "true");
    expect(root.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(root);
  });

  describe("状態別表示（棚卸し §2.4）", () => {
    it("C3-L: 読込中は読込中表示で、0 件案内・投稿欄・書込みボタンを出さない", () => {
      render(<MapCommentsDialog {...stubProps({
        comments: stubComments({ listState: "loading", value: null, classified: null }),
        initialFilter: "selected",
        selectedNodeId: 1,
      })} />);
      expect(within(dialog()).getByText(SHARE_COMMENT_MESSAGES.loading)).toBeInTheDocument();
      expect(within(dialog()).queryByText(SHARE_COMMENT_MESSAGES.empty)).not.toBeInTheDocument();
      expect(within(dialog()).queryByRole("textbox")).not.toBeInTheDocument();
      expect(within(dialog()).queryByRole("button", { name: SHARE_COMMENT_MESSAGES.submit })).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: SHARE_COMMENT_MESSAGES.reload })).toBeDisabled();
    });

    it("C3-R: ready で 0 件なら 0 件案内", () => {
      render(<MapCommentsDialog {...stubProps()} />);
      expect(within(dialog()).getByText(SHARE_COMMENT_MESSAGES.empty)).toBeInTheDocument();
    });

    it("C3-E: error は固定文言と「再読み込み」で、0 件案内を出さない（L-002）", async () => {
      const user = userEvent.setup();
      const reload = jest.fn(async () => {});
      render(<MapCommentsDialog {...stubProps({
        comments: stubComments({ listState: "error", value: null, classified: null, reload }),
      })} />);
      expect(within(dialog()).getByRole("alert")).toHaveTextContent(SHARE_COMMENT_MESSAGES.loadFailed);
      expect(within(dialog()).queryByText(SHARE_COMMENT_MESSAGES.empty)).not.toBeInTheDocument();
      await user.click(within(dialog()).getByRole("button", { name: SHARE_COMMENT_MESSAGES.reload }));
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("C3-S: セッション確認中は確認中表示だけで、ログイン導線・一覧・投稿欄を出さない（L-463）", () => {
      render(<MapCommentsDialog {...stubProps({
        comments: stubComments({ listState: "idle", value: null, classified: null }),
        shareSession: null,
        shareSessionStatus: "loading",
        initialFilter: "selected",
        selectedNodeId: 1,
      })} />);
      expect(within(dialog()).getByText(SHARE_COMMENT_MESSAGES.sessionLoading)).toBeInTheDocument();
      expect(within(dialog()).queryByRole("button", { name: SHARE_COMMENT_MESSAGES.loginButton })).not.toBeInTheDocument();
      expect(within(dialog()).queryByRole("textbox")).not.toBeInTheDocument();
      expect(within(dialog()).queryByText(SHARE_COMMENT_MESSAGES.loading)).not.toBeInTheDocument();
      expect(within(dialog()).getByRole("button", { name: SHARE_COMMENT_MESSAGES.reload })).toBeDisabled();
    });

    it("ログイン済みで idle（未共有）なら未共有の案内で、読込中・0 件案内と取り違えない", () => {
      render(<MapCommentsDialog {...stubProps({
        comments: stubComments({ listState: "idle", value: null, classified: null }),
      })} />);
      expect(within(dialog()).getByText(SHARE_COMMENT_MESSAGES.notSharedDisabled)).toBeInTheDocument();
      expect(within(dialog()).queryByText(SHARE_COMMENT_MESSAGES.loading)).not.toBeInTheDocument();
      expect(within(dialog()).queryByText(SHARE_COMMENT_MESSAGES.empty)).not.toBeInTheDocument();
    });

    it("未ログインはログイン導線だけを出し、押すと onLogin を呼ぶ", async () => {
      const user = userEvent.setup();
      const onLogin = jest.fn();
      render(<MapCommentsDialog {...stubProps({
        comments: stubComments({ listState: "idle", value: null, classified: null }),
        shareSession: null,
        onLogin,
      })} />);
      expect(within(dialog()).getByText(SHARE_COMMENT_MESSAGES.loginRequired)).toBeInTheDocument();
      expect(within(dialog()).queryByText(SHARE_COMMENT_MESSAGES.loading)).not.toBeInTheDocument();
      await user.click(within(dialog()).getByRole("button", { name: SHARE_COMMENT_MESSAGES.loginButton }));
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
  });

  describe("絞り込み", () => {
    const THREADS = [
      thread({ id: "t1", nodeId: 1, comments: [comment({ body: "根の本文" })] }),
      thread({ id: "t2", nodeId: 2, nodeLabelSnapshot: "子ノード", createdAt: "2026-11-27T02:00:00.000Z", comments: [comment({ id: "c2", body: "子の本文" })] }),
    ];

    it("initialFilter が all なら全スレッド、選択中のノードへ切り替えるとそのノードのスレッドだけ", async () => {
      const user = userEvent.setup();
      await renderReady({ api: createApi(THREADS), initialFilter: "all", initialSelectedNodeId: 2 });
      expect(within(dialog()).getByRole("radio", { name: SHARE_COMMENT_MESSAGES.filterAll })).toBeChecked();
      expect(within(dialog()).getByText("根の本文")).toBeInTheDocument();
      expect(within(dialog()).getByText("子の本文")).toBeInTheDocument();
      // 「すべて」では新規スレッドの投稿欄を出さない
      expect(within(dialog()).queryByRole("textbox", { name: `${SHARE_COMMENT_MESSAGES.title}（子ノード）` })).not.toBeInTheDocument();

      await user.click(within(dialog()).getByRole("radio", { name: SHARE_COMMENT_MESSAGES.filterSelected }));
      expect(within(dialog()).queryByText("根の本文")).not.toBeInTheDocument();
      expect(within(dialog()).getByText("子の本文")).toBeInTheDocument();
      expect(newThreadBox("子ノード")).toBeInTheDocument();
    });

    it("initialFilter が selected なら選択中のノードで始まり、未選択なら案内文だけで投稿欄を出さない", async () => {
      await renderReady({ api: createApi(THREADS), initialFilter: "selected", initialSelectedNodeId: null });
      expect(within(dialog()).getByRole("radio", { name: SHARE_COMMENT_MESSAGES.filterSelected })).toBeChecked();
      expect(within(dialog()).getByText(SHARE_COMMENT_MESSAGES.selectNodeHint)).toBeInTheDocument();
      expect(within(dialog()).queryByRole("textbox")).not.toBeInTheDocument();
      expect(within(dialog()).queryByText(SHARE_COMMENT_MESSAGES.empty)).not.toBeInTheDocument();
      expect(within(dialog()).queryByText("根の本文")).not.toBeInTheDocument();
    });

    it("絞り込みの radio のまとまりに固定文言の名前が付く", () => {
      render(<MapCommentsDialog {...stubProps()} />);
      expect(within(dialog()).getByRole("group", { name: SHARE_COMMENT_MESSAGES.filterLegend })).toBeInTheDocument();
    });

    it("「すべて」では削除されたノード節も出る", async () => {
      await renderReady({ api: createApi([thread({ id: "t-gone", nodeId: 99, nodeLabelSnapshot: "消えた" })]) });
      expect(within(dialog()).getByText(`${SHARE_COMMENT_MESSAGES.orphanedSection}（1）`)).toBeInTheDocument();
      expect(within(dialog()).getByText(`${SHARE_COMMENT_MESSAGES.orphanedPrefix}消えた`)).toBeInTheDocument();
    });
  });

  it("名前の注意文は新規スレッドの投稿欄より上にある", async () => {
    await renderReady({ api: createApi(), initialFilter: "selected", initialSelectedNodeId: 1 });
    const notice = within(dialog()).getByText(SHARE_COMMENT_MESSAGES.nameVisibilityNotice);
    expect(notice.compareDocumentPosition(newThreadBox("根ノード")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("invalid-node の失敗は固定文言を通知に出し、下書きを残す", async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.createThread.mockResolvedValueOnce({ ok: false, reason: "invalid-node" });
    await renderReady({ api, initialFilter: "selected", initialSelectedNodeId: 1 });
    await user.type(newThreadBox("根ノード"), "新しいノード");
    await user.click(within(dialog()).getByRole("button", { name: SHARE_COMMENT_MESSAGES.submit }));
    expect(await within(dialog()).findByText(shareCommentOperationFailureMessage("invalid-node"))).toBeInTheDocument();
    expect(newThreadBox("根ノード").value).toBe("新しいノード");
  });

  it("「ノードへ移動」系（このノードを選択）のボタンが無い", async () => {
    await renderReady({ api: createApi([thread(), thread({ id: "t2", nodeId: 2, nodeLabelSnapshot: "子ノード" })]) });
    expect(within(dialog()).queryByRole("button", { name: /このノードを選択|移動/ })).not.toBeInTheDocument();
  });

  it("新規スレッドの下書きはノードごとに残り、一覧の差し替えで消えず、送信成功で空になる", async () => {
    const user = userEvent.setup();
    const api = createApi([thread()]);
    await renderReady({ api, initialFilter: "selected", initialSelectedNodeId: 1 });

    await user.type(newThreadBox("根ノード"), "A の下書き");
    await user.click(screen.getByRole("button", { name: "test-select-2" }));
    expect(newThreadBox("子ノード").value).toBe("");
    await user.click(screen.getByRole("button", { name: "test-select-1" }));
    expect(newThreadBox("根ノード").value).toBe("A の下書き");

    await user.click(within(dialog()).getByRole("button", { name: SHARE_COMMENT_MESSAGES.reload }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(newThreadBox("根ノード").value).toBe("A の下書き");

    await user.click(within(dialog()).getByRole("button", { name: SHARE_COMMENT_MESSAGES.submit }));
    await waitFor(() => expect(newThreadBox("根ノード").value).toBe(""));
    expect(api.createThread).toHaveBeenCalledWith({ kind: "owner", sharedMapId: "shared-1" }, { nodeId: 1, body: "A の下書き" });
    expect(await within(dialog()).findByText(SHARE_COMMENT_MESSAGES.createSuccess)).toBeInTheDocument();
  });

  describe("操作後のフォーカス（L-397）", () => {
    it("解決すると次のスレッドの見出しへ、無ければダイアログの見出しへ", async () => {
      const user = userEvent.setup();
      await renderReady({
        api: createApi([thread({ id: "t1" }), thread({ id: "t2", nodeId: 2, nodeLabelSnapshot: "子ノード", createdAt: "2026-11-27T02:00:00.000Z" })]),
      });
      await user.click(within(dialog()).getByRole("button", { name: `${SHARE_COMMENT_MESSAGES.resolve}（根ノード）` }));
      await waitFor(() => expect(document.activeElement).toHaveAttribute("data-thread-id", "t2"));

      await user.click(within(dialog()).getByRole("button", { name: `${SHARE_COMMENT_MESSAGES.resolve}（子ノード）` }));
      await waitFor(() =>
        expect(document.activeElement).toBe(within(dialog()).getByRole("heading", { name: SHARE_COMMENT_MESSAGES.title })));
    });

    it("再開するとそのスレッドの見出しへ", async () => {
      const user = userEvent.setup();
      await renderReady({ api: createApi([thread({ id: "t1", status: "resolved", resolvedByName: "山田" })]) });
      await user.click(within(dialog()).getByText(`${SHARE_COMMENT_MESSAGES.resolvedSection}（1）`));
      await user.click(within(dialog()).getByRole("button", { name: `${SHARE_COMMENT_MESSAGES.reopen}（根ノード）` }));
      await waitFor(() => expect(document.activeElement).toHaveAttribute("data-thread-id", "t1"));
    });

    it("削除でスレッドが残ればその見出し、消えたらダイアログの見出しへ", async () => {
      const user = userEvent.setup();
      await renderReady({
        api: createApi([thread({ id: "t1", comments: [comment({ id: "c1" }), comment({ id: "c2", authorName: "佐藤" })] })]),
      });
      await user.click(within(dialog()).getByRole("button", { name: /^削除（佐藤/ }));
      await user.click(within(dialog()).getByRole("button", { name: SHARE_COMMENT_MESSAGES.deleteConfirmYes }));
      await waitFor(() => expect(document.activeElement).toHaveAttribute("data-thread-id", "t1"));

      await user.click(within(dialog()).getByRole("button", { name: /^削除（山田/ }));
      await user.click(within(dialog()).getByRole("button", { name: SHARE_COMMENT_MESSAGES.deleteConfirmYes }));
      await waitFor(() =>
        expect(document.activeElement).toBe(within(dialog()).getByRole("heading", { name: SHARE_COMMENT_MESSAGES.title })));
    });
  });

  it("同一文言の通知でも noticeSequence が進むと読み上げ直す（一度消えて再び出る）", async () => {
    const notice = { kind: "status", message: SHARE_COMMENT_MESSAGES.resolveSuccess } as const;
    const { rerender } = render(<MapCommentsDialog {...stubProps({ comments: stubComments({ notice, noticeSequence: 1 }) })} />);
    expect(await within(dialog()).findByText(notice.message)).toBeInTheDocument();

    rerender(<MapCommentsDialog {...stubProps({ comments: stubComments({ notice, noticeSequence: 2 }) })} />);
    expect(within(dialog()).queryByText(notice.message)).not.toBeInTheDocument();
    expect(await within(dialog()).findByText(notice.message)).toBeInTheDocument();
  });

  it("Escape で通知をクリアしてから onClose を呼ぶ", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const clearNotice = jest.fn(() => calls.push("clearNotice"));
    const onClose = jest.fn(() => calls.push("onClose"));
    render(<MapCommentsDialog {...stubProps({ comments: stubComments({ clearNotice }), onClose })} />);
    await user.keyboard("{Escape}");
    expect(calls).toEqual(["clearNotice", "onClose"]);
  });

  it("「閉じる」でも通知をクリアして onClose を呼ぶ", async () => {
    const user = userEvent.setup();
    const clearNotice = jest.fn();
    const onClose = jest.fn();
    render(<MapCommentsDialog {...stubProps({ comments: stubComments({ clearNotice }), onClose })} />);
    await user.click(within(dialog()).getByRole("button", { name: "閉じる" }));
    expect(clearNotice).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ダイアログ内のマウスのクリックを dialogMouseClickedAtRef に記録する", async () => {
    const user = userEvent.setup();
    const dialogMouseClickedAtRef = { current: null as number | null };
    render(<MapCommentsDialog {...stubProps({ dialogMouseClickedAtRef })} />);
    await act(async () => {
      await user.click(within(dialog()).getByRole("radio", { name: SHARE_COMMENT_MESSAGES.filterSelected }));
    });
    expect(dialogMouseClickedAtRef.current).not.toBeNull();
  });
});
