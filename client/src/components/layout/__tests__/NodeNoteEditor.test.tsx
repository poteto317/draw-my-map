import { act, fireEvent, render, screen } from "@testing-library/react";
import { NodeNoteEditor } from "@/components/layout/NodeNoteEditor";
import { createMapHistoryLeaseSpy } from "@/testing/createTestMapHistoryLease";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup(note?: string) {
  const onPreviewNote = jest.fn<boolean, [number, string]>(() => true);
  const spy = createMapHistoryLeaseSpy();
  const view = render(
    <NodeNoteEditor
      node={{ id: 5, label: "対象", note }}
      selectionCount={1}
      onPreviewNote={onPreviewNote}
      onBeginNoteEdit={spy.onBeginNodeMove}
    />,
  );
  const box = () => screen.getByRole("textbox", { name: "詳細メモ" }) as HTMLTextAreaElement;
  return { ...view, onPreviewNote, spy, box };
}

function advance(ms: number) {
  act(() => { jest.advanceTimersByTime(ms); });
}

describe("NodeNoteEditor", () => {
  it("フォーカスで履歴グループを始め、入力から 300ms 後に反映する", () => {
    const { box, onPreviewNote, spy } = setup();
    act(() => box().focus());
    expect(spy.onBeginNodeMove).toHaveBeenCalledTimes(1);

    fireEvent.change(box(), { target: { value: "abc" } });
    expect(box()).toHaveValue("abc");
    advance(299);
    expect(onPreviewNote).not.toHaveBeenCalled();
    advance(1);
    expect(onPreviewNote).toHaveBeenLastCalledWith(5, "abc");
  });

  it("compositionstart〜compositionend の間は反映せず、compositionend の 300ms 後に反映する", () => {
    const { box, onPreviewNote } = setup();
    act(() => box().focus());
    fireEvent.compositionStart(box());
    fireEvent.change(box(), { target: { value: "日本" } });
    advance(1000);
    expect(onPreviewNote).not.toHaveBeenCalled();

    fireEvent.compositionEnd(box());
    advance(300);
    expect(onPreviewNote).toHaveBeenLastCalledWith(5, "日本");
  });

  it("blur ですぐ反映し、グループを閉じる", () => {
    const { box, onPreviewNote, spy } = setup();
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "即時" } });

    act(() => box().blur());

    expect(onPreviewNote).toHaveBeenCalledTimes(1);
    expect(onPreviewNote).toHaveBeenLastCalledWith(5, "即時");
    expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(onPreviewNote).toHaveBeenCalledTimes(1);
  });

  it("Escape でフォーカスした時点のメモへ戻して欄から出る。続く blur では反映しない", () => {
    const { box, onPreviewNote, spy } = setup("元のメモ");
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "書き換え" } });
    advance(300);

    fireEvent.keyDown(box(), { key: "Escape" });

    expect(onPreviewNote.mock.calls).toEqual([[5, "書き換え"], [5, "元のメモ"]]);
    expect(document.activeElement).not.toBe(box());
    expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    expect(box()).toHaveValue("元のメモ");
  });

  it("IME 変換中の Escape（keyCode 229）は取り消さない", () => {
    const { box, onPreviewNote } = setup("元のメモ");
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "へんかん" } });

    fireEvent.keyDown(box(), { key: "Escape", keyCode: 229 });

    expect(onPreviewNote).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box());
  });

  it("blur を起こさずに外れても（アンマウント）、下書きを反映してからグループを閉じる", () => {
    const { box, onPreviewNote, spy, unmount } = setup();
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "下書き" } });

    unmount();

    expect(onPreviewNote).toHaveBeenCalledTimes(1);
    expect(onPreviewNote).toHaveBeenLastCalledWith(5, "下書き");
    expect(spy.lease.finish).toHaveBeenCalledTimes(1);
  });

  it("文書の入れ替えでグループが失効していれば、アンマウントでも反映しない（L-588）", () => {
    const { box, onPreviewNote, spy, unmount } = setup();
    act(() => box().focus());
    fireEvent.change(box(), { target: { value: "古い下書き" } });
    spy.expire();

    unmount();

    expect(onPreviewNote).not.toHaveBeenCalled();
  });
});
