import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  describe("編集・プレビューのタブ切り替え", () => {
    function setupStateful(initialNote?: string) {
      const spy = createMapHistoryLeaseSpy();
      const onPreviewNote = jest.fn<boolean, [number, string]>(() => true);

      function Wrapper() {
        const [note, setNote] = useState<string | undefined>(initialNote);
        const handlePreviewNote = (id: number, nextNote: string) => {
          onPreviewNote(id, nextNote);
          setNote(nextNote);
          return true;
        };
        return (
          <NodeNoteEditor
            node={{ id: 5, label: "対象", note }}
            selectionCount={1}
            onPreviewNote={handlePreviewNote}
            onBeginNoteEdit={spy.onBeginNodeMove}
          />
        );
      }

      const view = render(<Wrapper />);
      const box = () => screen.getByRole("textbox", { name: "詳細メモ", hidden: true }) as HTMLTextAreaElement;
      return { ...view, spy, onPreviewNote, box };
    }

    it("入力直後（300ms 未満）にプレビュータブをクリックすると即時確定して見出しが表示され、編集タブへ戻しても値が残る（L-473・L-737）", async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const { box, onPreviewNote, spy } = setupStateful();

      await user.click(box());
      await user.type(box(), "# 見出し");
      expect(onPreviewNote).not.toHaveBeenCalled();

      await user.click(screen.getByRole("tab", { name: "プレビュー" }));

      expect(onPreviewNote).toHaveBeenCalledTimes(1);
      expect(onPreviewNote).toHaveBeenLastCalledWith(5, "# 見出し");
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("heading", { level: 1, name: "見出し" })).toBeVisible();

      await user.click(screen.getByRole("tab", { name: "編集" }));
      expect(box()).toHaveValue("# 見出し");
    });

    it("fireEvent.click で textarea にフォーカスが残ったままプレビュータブを押しても、フォールバック経路で即時確定してプレビューが表示される", () => {
      const { box, onPreviewNote, spy } = setupStateful();

      act(() => box().focus());
      fireEvent.change(box(), { target: { value: "# フォールバック" } });
      expect(document.activeElement).toBe(box());

      fireEvent.click(screen.getByRole("tab", { name: "プレビュー" }));

      expect(onPreviewNote).toHaveBeenCalledTimes(1);
      expect(onPreviewNote).toHaveBeenLastCalledWith(5, "# フォールバック");
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("heading", { level: 1, name: "フォールバック" })).toBeVisible();
    });
  });
});
