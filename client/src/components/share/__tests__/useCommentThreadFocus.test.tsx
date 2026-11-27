import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { useCommentThreadFocus } from "@/components/share/useCommentThreadFocus";

function heading(threadId: string, parent: HTMLElement = document.body): HTMLElement {
  const element = document.createElement("h3");
  element.tabIndex = -1;
  element.dataset.threadId = threadId;
  parent.append(element);
  return element;
}

function setup(initialBusy = false) {
  const listHeadingRef = createRef<HTMLElement>();
  const listHeading = document.createElement("h2");
  listHeading.tabIndex = -1;
  document.body.append(listHeading);
  (listHeadingRef as { current: HTMLElement | null }).current = listHeading;
  const hook = renderHook(
    ({ busy }: { busy: boolean }) => useCommentThreadFocus({ busy, listHeadingRef }),
    { initialProps: { busy: initialBusy } },
  );
  return { ...hook, listHeading };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("useCommentThreadFocus", () => {
  it("thread は候補を順に試し、最初に見つかった見出しへ移す", () => {
    const { result } = setup();
    const second = heading("t2");
    act(() => result.current.registerHeading("t2")(second));
    act(() => result.current.requestFocus({ kind: "thread", candidates: ["t1", "t2"] }));
    expect(document.activeElement).toBe(second);
  });

  it("折りたたまれた details の中の見出しは飛ばす", () => {
    const { result } = setup();
    const details = document.createElement("details");
    document.body.append(details);
    const hidden = heading("t1", details);
    const visible = heading("t2");
    act(() => {
      result.current.registerHeading("t1")(hidden);
      result.current.registerHeading("t2")(visible);
    });
    act(() => result.current.requestFocus({ kind: "thread", candidates: ["t1", "t2"] }));
    expect(document.activeElement).toBe(visible);
  });

  it("候補がどれも無ければ一覧の見出しへ移す", () => {
    const { result, listHeading } = setup();
    act(() => result.current.requestFocus({ kind: "thread", candidates: ["missing"] }));
    expect(document.activeElement).toBe(listHeading);
  });

  it("登録を外した見出しは候補にならない", () => {
    const { result, listHeading } = setup();
    const element = heading("t1");
    act(() => result.current.registerHeading("t1")(element));
    act(() => result.current.registerHeading("t1")(null));
    act(() => result.current.requestFocus({ kind: "thread", candidates: ["t1"] }));
    expect(document.activeElement).toBe(listHeading);
  });

  it("delete-button は登録済みの削除ボタンへ移す", () => {
    const { result } = setup();
    const button = document.createElement("button");
    document.body.append(button);
    act(() => result.current.registerDeleteButton("c1")(button));
    act(() => result.current.requestFocus({ kind: "delete-button", commentId: "c1" }));
    expect(document.activeElement).toBe(button);
  });

  it("element は無効な間は保留し、busy が解けて有効に戻った描画で戻す", () => {
    const { result, rerender } = setup(true);
    const button = document.createElement("button");
    button.disabled = true;
    document.body.append(button);
    act(() => result.current.requestFocus({ kind: "element", element: button }));
    expect(document.activeElement).not.toBe(button);
    button.disabled = false;
    rerender({ busy: false });
    expect(document.activeElement).toBe(button);
  });
});
