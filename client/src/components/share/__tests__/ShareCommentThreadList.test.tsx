import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useMemo, useRef, useState } from "react";
import {
  ShareCommentThreadList,
  type ShareCommentThreadListProps,
} from "@/components/share/ShareCommentThreadList";
import type { ShareCommentThreadSections } from "@/components/share/shareCommentThreadSections";
import type {
  ShareCommentDeleteValue,
  ShareCommentThreadView,
  ShareCommentView,
} from "@/domain/share/shareComment";
import { removeCommentFromList, replaceThreadInList } from "@/domain/share/shareCommentListMutations";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import type { ShareResult } from "@/domain/share/shareResult";

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

const EMPTY_SECTIONS: ShareCommentThreadSections = { open: [], resolved: [], orphaned: [] };

function okResult<T>(value: T): Promise<ShareResult<T>> {
  return Promise.resolve({ ok: true, value });
}

function createProps(overrides: Partial<ShareCommentThreadListProps> = {}): ShareCommentThreadListProps {
  return {
    sections: EMPTY_SECTIONS,
    nodeLabelById: new Map([[1, "根ノード"], [2, "子ノード"], [3, "孫ノード"]]),
    canPost: true,
    busy: false,
    listHeadingRef: createRef<HTMLElement>(),
    onSelectThreadNode: null,
    onReply: jest.fn((threadId: string) => okResult(thread({ id: threadId }))),
    onResolve: jest.fn((threadId: string) => okResult(thread({ id: threadId, status: "resolved" }))),
    onReopen: jest.fn((threadId: string) => okResult(thread({ id: threadId }))),
    onDeleteComment: jest.fn((_threadId: string, commentId: string) =>
      okResult<ShareCommentDeleteValue>({ commentId, threadDeleted: false }),
    ),
    ...overrides,
  };
}

function threadHeading(threadId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-thread-id="${threadId}"]`);
  if (!element) throw new Error(`heading ${threadId} not found`);
  return element;
}

const NODE_LABELS = new Map([[1, "根ノード"], [2, "子ノード"], [3, "孫ノード"]]);

function toSections(threads: readonly ShareCommentThreadView[]): ShareCommentThreadSections {
  const attached = threads.filter((item) => NODE_LABELS.has(item.nodeId));
  return {
    open: attached.filter((item) => item.status === "open"),
    resolved: attached.filter((item) => item.status === "resolved"),
    orphaned: threads.filter((item) => !NODE_LABELS.has(item.nodeId)),
  };
}

/** 書込みの結果で一覧を差し替える呼び出し元（hook 相当）を模した外側 */
function Harness({ initial }: { initial: readonly ShareCommentThreadView[] }) {
  const [threads, setThreads] = useState<readonly ShareCommentThreadView[]>(initial);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const sections = useMemo(() => toSections(threads), [threads]);
  const update = (next: ShareCommentThreadView): Promise<ShareResult<ShareCommentThreadView>> => {
    setThreads((prev) => replaceThreadInList(prev, next));
    return okResult(next);
  };
  const find = (threadId: string) => {
    const found = threads.find((item) => item.id === threadId);
    if (!found) throw new Error("missing thread");
    return found;
  };
  return (
    <div>
      <h2 ref={listHeadingRef} tabIndex={-1}>
        {SHARE_COMMENT_MESSAGES.title}
      </h2>
      <ShareCommentThreadList
        sections={sections}
        nodeLabelById={NODE_LABELS}
        canPost
        busy={false}
        listHeadingRef={listHeadingRef}
        onSelectThreadNode={null}
        onReply={(threadId) => okResult(find(threadId))}
        onResolve={(threadId) =>
          update({
            ...find(threadId),
            status: "resolved",
            resolvedByName: "所有者",
            resolvedAt: "2026-11-27T02:00:00.000Z",
          })
        }
        onReopen={(threadId) =>
          update({ ...find(threadId), status: "open", resolvedByName: null, resolvedAt: null })
        }
        onDeleteComment={(threadId, commentId) => {
          setThreads((prev) => removeCommentFromList(prev, threadId, commentId, false));
          return okResult({ commentId, threadDeleted: false });
        }}
      />
    </div>
  );
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>, deleteButton: HTMLElement) {
  await user.click(deleteButton);
  await user.click(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.deleteConfirmYes }));
}

describe("ShareCommentThreadList", () => {
  describe("スレッド見出しのラベル", () => {
    it("attached で現ラベルと nodeLabelSnapshot が同じなら現ラベルだけ", () => {
      render(<ShareCommentThreadList {...createProps({ sections: { ...EMPTY_SECTIONS, open: [thread()] } })} />);
      const heading = threadHeading("t1");
      expect(heading).toHaveTextContent("根ノード");
      expect(heading).not.toHaveTextContent(SHARE_COMMENT_MESSAGES.snapshotPrefix);
    });

    it("attached で異なれば現ラベルと「コメント時: <snapshot>」を併記する", () => {
      render(
        <ShareCommentThreadList
          {...createProps({
            sections: { ...EMPTY_SECTIONS, open: [thread({ nodeLabelSnapshot: "古いラベル" })] },
          })}
        />,
      );
      const heading = threadHeading("t1");
      expect(heading).toHaveTextContent("根ノード");
      expect(heading).toHaveTextContent(`${SHARE_COMMENT_MESSAGES.snapshotPrefix}古いラベル`);
    });

    it("現ラベルを正規化した値が snapshot と同じなら併記しない（改行を含むラベル）", () => {
      render(
        <ShareCommentThreadList
          {...createProps({
            nodeLabelById: new Map([[1, "根\nノード"]]),
            sections: { ...EMPTY_SECTIONS, open: [thread({ nodeLabelSnapshot: "根 ノード" })] },
          })}
        />,
      );
      expect(threadHeading("t1")).not.toHaveTextContent(SHARE_COMMENT_MESSAGES.snapshotPrefix);
    });

    it("orphaned は「削除されたノード: <snapshot>」だけ", () => {
      render(
        <ShareCommentThreadList
          {...createProps({
            sections: {
              ...EMPTY_SECTIONS,
              orphaned: [thread({ id: "t9", nodeId: 99, nodeLabelSnapshot: "消えたノード" })],
            },
          })}
        />,
      );
      const heading = threadHeading("t9");
      expect(heading).toHaveTextContent(`${SHARE_COMMENT_MESSAGES.orphanedPrefix}消えたノード`);
      expect(heading).not.toHaveTextContent(SHARE_COMMENT_MESSAGES.snapshotPrefix);
      expect(screen.getByRole("heading", { name: `${SHARE_COMMENT_MESSAGES.orphanedSection}（1）` })).toBeInTheDocument();
    });

    it("現ラベルが空白だけなら正規化した「（無題）」を見出しと aria-label に使う", () => {
      render(
        <ShareCommentThreadList
          {...createProps({
            nodeLabelById: new Map([[1, "   "]]),
            sections: { ...EMPTY_SECTIONS, open: [thread({ nodeLabelSnapshot: "（無題）" })] },
          })}
        />,
      );
      expect(threadHeading("t1")).toHaveTextContent("（無題）");
      expect(threadHeading("t1")).not.toHaveTextContent(SHARE_COMMENT_MESSAGES.snapshotPrefix);
      expect(screen.getByRole("button", { name: "解決（（無題））" })).toBeInTheDocument();
    });

    it("「削除されたノード」節のスレッド見出しは節見出し（h3）の下の h4", () => {
      render(
        <ShareCommentThreadList
          {...createProps({
            sections: { open: [thread()], resolved: [], orphaned: [thread({ id: "t9", nodeId: 99 })] },
          })}
        />,
      );
      expect(threadHeading("t1").tagName).toBe("H3");
      expect(threadHeading("t9").tagName).toBe("H4");
      expect(screen.getByRole("heading", { level: 3, name: `${SHARE_COMMENT_MESSAGES.orphanedSection}（1）` })).toBeInTheDocument();
    });

    it("見出しは tabIndex=-1 でフォーカスできる", () => {
      render(<ShareCommentThreadList {...createProps({ sections: { ...EMPTY_SECTIONS, open: [thread()] } })} />);
      expect(threadHeading("t1")).toHaveAttribute("tabindex", "-1");
    });
  });

  it("本文・表示名・ラベルの HTML を文字列のまま出し、img / b 要素を作らない", () => {
    const html = "<img src=x onerror=alert(1)>";
    const { container } = render(
      <ShareCommentThreadList
        {...createProps({
          nodeLabelById: new Map([[1, `<b>ラベル</b>${html}`]]),
          sections: {
            ...EMPTY_SECTIONS,
            open: [
              thread({
                nodeLabelSnapshot: "<b>旧</b>",
                comments: [comment({ authorName: `<b>名前</b>${html}`, body: `${html}<b>太字</b>` })],
              }),
            ],
          },
        })}
      />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("b")).toHaveLength(0);
    expect(screen.getByText(`${html}<b>太字</b>`)).toBeInTheDocument();
    expect(screen.getByText(`<b>名前</b>${html}`)).toBeInTheDocument();
    expect(threadHeading("t1")).toHaveTextContent(`<b>ラベル</b>${html}`);
  });

  it("本文は whitespace-pre-wrap と break-words で描く", () => {
    render(
      <ShareCommentThreadList
        {...createProps({
          sections: { ...EMPTY_SECTIONS, open: [thread({ comments: [comment({ body: "1 行目\n2 行目" })] })] },
        })}
      />,
    );
    const body = screen.getByText((_, element) => element?.textContent === "1 行目\n2 行目" && element.tagName === "P");
    expect(body).toHaveClass("whitespace-pre-wrap", "break-words");
  });

  it("解決済みは <details> にまとめ、解決者と解決日時を出す", () => {
    const resolvedAt = "2026-11-27T02:00:00.000Z";
    render(
      <ShareCommentThreadList
        {...createProps({
          sections: {
            ...EMPTY_SECTIONS,
            resolved: [thread({ status: "resolved", resolvedByName: "所有者", resolvedAt })],
          },
        })}
      />,
    );
    const details = threadHeading("t1").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    const formatted = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(resolvedAt),
    );
    const article = threadHeading("t1").closest("article") as HTMLElement;
    expect(within(article).getByText(SHARE_COMMENT_MESSAGES.statusResolved)).toBeInTheDocument();
    expect(article).toHaveTextContent(`${SHARE_COMMENT_MESSAGES.resolvedBy}所有者`);
    expect(article).toHaveTextContent(formatted);
  });

  describe("能力によるボタンの出し分け", () => {
    it("canResolve で解決、canDelete で削除、canPost かつ open で返信欄を出す", () => {
      render(<ShareCommentThreadList {...createProps({ sections: { ...EMPTY_SECTIONS, open: [thread()] } })} />);
      expect(screen.getByRole("button", { name: /^解決（/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^削除（/ })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /^返信（/ })).toBeInTheDocument();
    });

    it("canResolve・canDelete が false ならボタンを出さない", () => {
      render(
        <ShareCommentThreadList
          {...createProps({
            sections: {
              ...EMPTY_SECTIONS,
              open: [thread({ canResolve: false, comments: [comment({ canDelete: false })] })],
            },
          })}
        />,
      );
      expect(screen.queryByRole("button", { name: /^解決（/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^削除（/ })).not.toBeInTheDocument();
    });

    it("canPost が false なら返信欄を出さない", () => {
      render(
        <ShareCommentThreadList
          {...createProps({ canPost: false, sections: { ...EMPTY_SECTIONS, open: [thread()] } })}
        />,
      );
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("解決済みのスレッドは返信欄を出さず、canResolve なら再開を出す", () => {
      render(
        <ShareCommentThreadList
          {...createProps({ sections: { ...EMPTY_SECTIONS, resolved: [thread({ status: "resolved" })] } })}
        />,
      );
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^再開（/, hidden: true })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^解決（/, hidden: true })).not.toBeInTheDocument();
    });

    it("onSelectThreadNode が非 null なら attached にだけ「このノードを選択」を出す", async () => {
      const user = userEvent.setup();
      const onSelectThreadNode = jest.fn();
      render(
        <ShareCommentThreadList
          {...createProps({
            onSelectThreadNode,
            sections: {
              ...EMPTY_SECTIONS,
              open: [thread({ nodeId: 2 })],
              orphaned: [thread({ id: "t9", nodeId: 99 })],
            },
          })}
        />,
      );
      const buttons = screen.getAllByRole("button", { name: /^このノードを選択/ });
      expect(buttons).toHaveLength(1);
      await user.click(buttons[0]);
      expect(onSelectThreadNode).toHaveBeenCalledWith(2);
    });

    it("onSelectThreadNode が null なら「このノードを選択」を出さない", () => {
      render(<ShareCommentThreadList {...createProps({ sections: { ...EMPTY_SECTIONS, open: [thread()] } })} />);
      expect(screen.queryByRole("button", { name: /^このノードを選択/ })).not.toBeInTheDocument();
    });

    it("busy のときは操作ボタンと返信欄が無効", () => {
      render(
        <ShareCommentThreadList {...createProps({ busy: true, sections: { ...EMPTY_SECTIONS, open: [thread()] } })} />,
      );
      expect(screen.getByRole("button", { name: /^解決（/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^削除（/ })).toBeDisabled();
      expect(screen.getByRole("textbox", { name: /^返信（/ })).toBeDisabled();
    });
  });

  describe("削除の確認", () => {
    it("削除ボタンでは確定せず、確認の表示中はフォーカスが「キャンセル」にある", async () => {
      const user = userEvent.setup();
      const props = createProps({ sections: { ...EMPTY_SECTIONS, open: [thread()] } });
      render(<ShareCommentThreadList {...props} />);
      await user.click(screen.getByRole("button", { name: /^削除（/ }));
      expect(props.onDeleteComment).not.toHaveBeenCalled();
      expect(screen.getByText(SHARE_COMMENT_MESSAGES.deleteConfirm)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.deleteConfirmNo })).toHaveFocus();
    });

    it("「キャンセル」で確認を閉じ、削除ボタンへフォーカスを戻す", async () => {
      const user = userEvent.setup();
      const props = createProps({ sections: { ...EMPTY_SECTIONS, open: [thread()] } });
      render(<ShareCommentThreadList {...props} />);
      const deleteButton = screen.getByRole("button", { name: /^削除（/ });
      await user.click(deleteButton);
      await user.click(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.deleteConfirmNo }));
      expect(props.onDeleteComment).not.toHaveBeenCalled();
      expect(screen.queryByText(SHARE_COMMENT_MESSAGES.deleteConfirm)).not.toBeInTheDocument();
      expect(deleteButton).toHaveFocus();
    });

    it("「削除する」で onDeleteComment をスレッド ID とコメント ID で呼ぶ", async () => {
      const user = userEvent.setup();
      const props = createProps({ sections: { ...EMPTY_SECTIONS, open: [thread()] } });
      render(<ShareCommentThreadList {...props} />);
      await confirmDelete(user, screen.getByRole("button", { name: /^削除（/ }));
      expect(props.onDeleteComment).toHaveBeenCalledTimes(1);
      expect(props.onDeleteComment).toHaveBeenCalledWith("t1", "c1");
    });

    it("確認の両ボタンでリピートの Enter / Space の既定動作を止める", async () => {
      const user = userEvent.setup();
      const props = createProps({ sections: { ...EMPTY_SECTIONS, open: [thread()] } });
      render(<ShareCommentThreadList {...props} />);
      await user.click(screen.getByRole("button", { name: /^削除（/ }));
      for (const name of [SHARE_COMMENT_MESSAGES.deleteConfirmNo, SHARE_COMMENT_MESSAGES.deleteConfirmYes]) {
        const button = screen.getByRole("button", { name });
        expect(fireEvent.keyDown(button, { key: "Enter", repeat: true })).toBe(false);
        expect(fireEvent.keyDown(button, { key: " ", repeat: true })).toBe(false);
        expect(fireEvent.keyDown(button, { key: "Enter", repeat: false })).toBe(true);
      }
    });

    it("削除ボタンで Enter を押したまま（キーリピート）でも確定もキャンセルもしない", () => {
      const props = createProps({ sections: { ...EMPTY_SECTIONS, open: [thread()] } });
      render(<ShareCommentThreadList {...props} />);
      screen.getByRole("button", { name: /^削除（/ }).focus();
      // ブラウザはボタン上の Enter の keydown（リピートを含む）で click を合成し、既定動作を止めると合成しない
      const pressEnter = (repeat: boolean) => {
        const target = document.activeElement as HTMLElement;
        act(() => {
          if (fireEvent.keyDown(target, { key: "Enter", repeat })) fireEvent.click(target);
        });
      };
      pressEnter(false);
      for (let i = 0; i < 5; i += 1) pressEnter(true);
      expect(props.onDeleteComment).not.toHaveBeenCalled();
      expect(screen.getByText(SHARE_COMMENT_MESSAGES.deleteConfirm)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.deleteConfirmNo })).toHaveFocus();
    });

    it("削除の失敗では確認を残す", async () => {
      const user = userEvent.setup();
      const props = createProps({
        sections: { ...EMPTY_SECTIONS, open: [thread()] },
        onDeleteComment: jest.fn(() => Promise.resolve<ShareResult<ShareCommentDeleteValue>>({ ok: false, reason: "not-found" })),
      });
      render(<ShareCommentThreadList {...props} />);
      await confirmDelete(user, screen.getByRole("button", { name: /^削除（/ }));
      expect(screen.getByText(SHARE_COMMENT_MESSAGES.deleteConfirm)).toBeInTheDocument();
    });
  });

  describe("返信の下書き", () => {
    it("sections を差し替えても他スレッドの下書きは残り、消えたスレッドの下書きは捨てる", async () => {
      const user = userEvent.setup();
      const threadA = thread({ id: "tA", nodeId: 1 });
      const threadB = thread({ id: "tB", nodeId: 2, createdAt: "2026-11-27T01:30:00.000Z" });
      const props = createProps({ sections: { ...EMPTY_SECTIONS, open: [threadA, threadB] } });
      const { rerender } = render(<ShareCommentThreadList {...props} />);
      const replyA = () => within(threadHeading("tA").closest("article") as HTMLElement).getByRole("textbox");
      const replyB = () => within(threadHeading("tB").closest("article") as HTMLElement).getByRole("textbox");
      await user.type(replyA(), "A の下書き");
      await user.type(replyB(), "B の下書き");

      // 書込み応答で A を差し替え、B が一覧から消える
      rerender(
        <ShareCommentThreadList
          {...props}
          sections={{ ...EMPTY_SECTIONS, open: [{ ...threadA, updatedAt: "2026-11-27T03:00:00.000Z" }] }}
        />,
      );
      expect(replyA()).toHaveValue("A の下書き");

      // B が戻っても、捨てた下書きは復元しない
      rerender(<ShareCommentThreadList {...props} sections={{ ...EMPTY_SECTIONS, open: [threadA, threadB] }} />);
      expect(replyA()).toHaveValue("A の下書き");
      expect(replyB()).toHaveValue("");
    });

    it("スレッドが別の節へ移っても下書きは残る", async () => {
      const user = userEvent.setup();
      const threadA = thread({ id: "tA" });
      const props = createProps({ sections: { ...EMPTY_SECTIONS, open: [threadA] } });
      const { rerender } = render(<ShareCommentThreadList {...props} />);
      await user.type(screen.getByRole("textbox"), "下書き");
      rerender(<ShareCommentThreadList {...props} sections={{ ...EMPTY_SECTIONS, orphaned: [threadA] }} />);
      expect(screen.getByRole("textbox")).toHaveValue("下書き");
    });

    it("返信の成功でそのスレッドの下書きを空にし、失敗では残す", async () => {
      const user = userEvent.setup();
      const onReply = jest
        .fn<Promise<ShareResult<ShareCommentThreadView>>, [string, string]>()
        .mockResolvedValueOnce({ ok: false, reason: "rate-limited" })
        .mockResolvedValueOnce({ ok: true, value: thread() });
      render(
        <ShareCommentThreadList {...createProps({ onReply, sections: { ...EMPTY_SECTIONS, open: [thread()] } })} />,
      );
      await user.type(screen.getByRole("textbox"), "返信本文");
      await user.click(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.reply }));
      expect(onReply).toHaveBeenLastCalledWith("t1", "返信本文");
      expect(screen.getByRole("textbox")).toHaveValue("返信本文");
      await user.click(screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.reply }));
      expect(onReply).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("textbox")).toHaveValue("");
    });
  });

  describe("操作後のフォーカス", () => {
    it("削除でスレッドが残れば同じスレッドの見出しへ", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initial={[
            thread({ id: "tA", comments: [comment({ id: "c1" }), comment({ id: "c2", body: "2 件目" })] }),
            thread({ id: "tB", nodeId: 2, createdAt: "2026-11-27T01:30:00.000Z", comments: [comment({ id: "cB" })] }),
          ]}
        />,
      );
      const article = threadHeading("tA").closest("article") as HTMLElement;
      await confirmDelete(user, within(article).getAllByRole("button", { name: /^削除（/ })[0]);
      expect(threadHeading("tA")).toHaveFocus();
    });

    it("削除でスレッドごと消えたら次のスレッドの見出しへ", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initial={[
            thread({ id: "tA" }),
            thread({ id: "tB", nodeId: 2, createdAt: "2026-11-27T01:30:00.000Z", comments: [comment({ id: "cB" })] }),
            thread({ id: "tC", nodeId: 3, createdAt: "2026-11-27T01:40:00.000Z", comments: [comment({ id: "cC" })] }),
          ]}
        />,
      );
      const article = threadHeading("tB").closest("article") as HTMLElement;
      await confirmDelete(user, within(article).getByRole("button", { name: /^削除（/ }));
      expect(document.querySelector('[data-thread-id="tB"]')).toBeNull();
      expect(threadHeading("tC")).toHaveFocus();
    });

    it("削除で消えたスレッドが最後なら前のスレッドの見出しへ", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initial={[
            thread({ id: "tA" }),
            thread({ id: "tB", nodeId: 2, createdAt: "2026-11-27T01:30:00.000Z", comments: [comment({ id: "cB" })] }),
          ]}
        />,
      );
      const article = threadHeading("tB").closest("article") as HTMLElement;
      await confirmDelete(user, within(article).getByRole("button", { name: /^削除（/ }));
      expect(threadHeading("tA")).toHaveFocus();
    });

    it("削除で一覧が空になれば一覧の見出しへ", async () => {
      const user = userEvent.setup();
      render(<Harness initial={[thread({ id: "tA" })]} />);
      await confirmDelete(user, screen.getByRole("button", { name: /^削除（/ }));
      expect(screen.getByRole("heading", { name: SHARE_COMMENT_MESSAGES.title })).toHaveFocus();
    });

    it("解決は元の位置の次のスレッドの見出しへ", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initial={[thread({ id: "tA" }), thread({ id: "tB", nodeId: 2, createdAt: "2026-11-27T01:30:00.000Z" })]}
        />,
      );
      const article = threadHeading("tA").closest("article") as HTMLElement;
      await user.click(within(article).getByRole("button", { name: /^解決（/ }));
      expect(threadHeading("tA").closest("details")).not.toBeNull();
      expect(threadHeading("tB")).toHaveFocus();
    });

    it("解決で次のスレッドが無ければ（折りたたまれた解決済みは除く）一覧の見出しへ", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initial={[
            thread({ id: "tA" }),
            thread({ id: "tR", nodeId: 2, status: "resolved", createdAt: "2026-11-27T01:30:00.000Z" }),
          ]}
        />,
      );
      await user.click(screen.getByRole("button", { name: /^解決（/ }));
      expect(screen.getByRole("heading", { name: SHARE_COMMENT_MESSAGES.title })).toHaveFocus();
    });

    it("削除されたノードの未解決スレッドを解決したら、節に留まるそのスレッドの見出しへ", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initial={[
            thread({ id: "tX", nodeId: 99 }),
            thread({ id: "tY", nodeId: 98, createdAt: "2026-11-27T01:30:00.000Z" }),
          ]}
        />,
      );
      const article = threadHeading("tX").closest("article") as HTMLElement;
      await user.click(within(article).getByRole("button", { name: /^解決（/ }));
      expect(within(threadHeading("tX").closest("article") as HTMLElement).getByText(SHARE_COMMENT_MESSAGES.statusResolved)).toBeInTheDocument();
      expect(threadHeading("tX")).toHaveFocus();
    });

    it("解決の失敗では押した解決ボタンへフォーカスを戻す", async () => {
      const user = userEvent.setup();
      let finish!: (result: ShareResult<ShareCommentThreadView>) => void;
      const onResolve = jest.fn(
        () => new Promise<ShareResult<ShareCommentThreadView>>((resolve) => {
          finish = resolve;
        }),
      );
      render(<ShareCommentThreadList {...createProps({ onResolve, sections: { ...EMPTY_SECTIONS, open: [thread()] } })} />);
      const button = screen.getByRole("button", { name: /^解決（/ });
      await user.click(button);
      // 送信中に busy で無効化されるとブラウザはフォーカスを外す
      act(() => button.blur());
      await act(async () => finish({ ok: false, reason: "not-found" }));
      expect(button).toHaveFocus();
    });

    it("削除の失敗では「削除する」へフォーカスを戻す", async () => {
      const user = userEvent.setup();
      let finish!: (result: ShareResult<ShareCommentDeleteValue>) => void;
      const onDeleteComment = jest.fn(
        () => new Promise<ShareResult<ShareCommentDeleteValue>>((resolve) => {
          finish = resolve;
        }),
      );
      render(
        <ShareCommentThreadList {...createProps({ onDeleteComment, sections: { ...EMPTY_SECTIONS, open: [thread()] } })} />,
      );
      await confirmDelete(user, screen.getByRole("button", { name: /^削除（/ }));
      const yes = screen.getByRole("button", { name: SHARE_COMMENT_MESSAGES.deleteConfirmYes });
      act(() => yes.blur());
      await act(async () => finish({ ok: false, reason: "not-found" }));
      expect(yes).toHaveFocus();
    });

    it("再開は未解決の節へ移ったそのスレッドの見出しへ", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initial={[
            thread({ id: "tA" }),
            thread({ id: "tR", nodeId: 2, status: "resolved", createdAt: "2026-11-27T01:30:00.000Z" }),
          ]}
        />,
      );
      const details = threadHeading("tR").closest("details") as HTMLDetailsElement;
      act(() => {
        details.open = true;
      });
      await user.click(screen.getByRole("button", { name: /^再開（/ }));
      expect(threadHeading("tR").closest("details")).toBeNull();
      expect(threadHeading("tR")).toHaveFocus();
    });
  });
});
