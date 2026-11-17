import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { NODE_NOTE_MAX_LENGTH } from "@/domain/nodes/nodeNote";
import { useNodeNoteEditing } from "@/hooks/useNodeNoteEditing";
import { createMapHistoryLeaseSpy } from "@/testing/createTestMapHistoryLease";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function setup(note: string | undefined = undefined) {
  const previewNote = jest.fn<boolean, [number, string]>(() => true);
  const spy = createMapHistoryLeaseSpy();
  const view = renderHook(
    (props: { note: string | undefined }) => useNodeNoteEditing({
      nodeId: 7,
      note: props.note,
      previewNote,
      beginGroup: spy.onBeginNodeMove,
    }),
    { initialProps: { note } },
  );
  return { ...view, previewNote, spy };
}

function advance(ms: number) {
  act(() => { jest.advanceTimersByTime(ms); });
}

function keyEvent(key: string, options: { isComposing?: boolean; keyCode?: number } = {}) {
  const blur = jest.fn();
  const event = {
    key,
    keyCode: options.keyCode ?? 0,
    nativeEvent: { isComposing: options.isComposing ?? false },
    currentTarget: { blur },
  } as unknown as KeyboardEvent<HTMLTextAreaElement>;
  return { event, blur };
}

describe("useNodeNoteEditing", () => {
  describe("表示する値", () => {
    it("下書きが無い間は現在のメモ（無ければ空文字）を出し、文字数は length", () => {
      const { result, rerender } = setup("abc");
      expect(result.current).toMatchObject({ value: "abc", length: 3, isAtLimit: false });

      rerender({ note: undefined });
      expect(result.current).toMatchObject({ value: "", length: 0 });
    });

    it("入力中は下書きを出す", () => {
      const { result } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("下書き"); });

      expect(result.current.value).toBe("下書き");
    });

    it("絵文字は 2 文字分。上限ちょうどで isAtLimit が真、1 少なければ偽", () => {
      const { result } = setup();
      act(() => { result.current.onFocus(); result.current.onChange("😀"); });
      expect(result.current.length).toBe(2);

      act(() => { result.current.onChange("a".repeat(NODE_NOTE_MAX_LENGTH - 1)); });
      expect(result.current.isAtLimit).toBe(false);
      act(() => { result.current.onChange("a".repeat(NODE_NOTE_MAX_LENGTH)); });
      expect(result.current.isAtLimit).toBe(true);
    });
  });

  describe("途中反映（デバウンス）", () => {
    it("フォーカスで履歴グループを 1 回始め、入力が 300ms 止まったら反映する", () => {
      const { result, previewNote, spy } = setup();
      act(() => { result.current.onFocus(); });
      expect(spy.onBeginNodeMove).toHaveBeenCalledTimes(1);

      act(() => { result.current.onChange("abc"); });
      advance(299);
      expect(previewNote).not.toHaveBeenCalled();
      advance(1);
      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "abc");
      expect(spy.lease.finish).not.toHaveBeenCalled();
    });

    it("入力が続く間はタイマーを張り直し、最後の入力から 300ms 後に最新の下書きで 1 回だけ反映する", () => {
      const { result, previewNote } = setup();
      act(() => { result.current.onFocus(); result.current.onChange("a"); });
      advance(200);
      act(() => { result.current.onChange("ab"); });
      advance(200);
      expect(previewNote).not.toHaveBeenCalled();
      advance(100);
      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "ab");
    });

    it("入力が続いても、直前の反映の後の最初の入力から 2 秒を超えて先送りしない（L-399）", () => {
      const { result, previewNote } = setup();
      act(() => { result.current.onFocus(); });
      // 0, 250, ..., 1500ms に入力する（どの間隔も 300ms 未満）
      for (let index = 0; index < 7; index += 1) {
        act(() => { result.current.onChange(`v${index}`); });
        advance(250);
      }
      // 1750ms の入力。打ち切りが無ければ 2050ms まで先送りされる
      act(() => { result.current.onChange("v7"); });
      advance(249);
      expect(previewNote).not.toHaveBeenCalled();
      advance(1);
      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "v7");

      // 反映の後は打ち切りの起点を新しくし、次の入力は 300ms の待ちに戻る
      act(() => { result.current.onChange("v8"); });
      advance(299);
      expect(previewNote).toHaveBeenCalledTimes(1);
      advance(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "v8");
    });
  });

  describe("blur", () => {
    it("残りの下書きをすぐ反映してグループを閉じ、以後のタイマーでは反映しない（二重確定しない）", () => {
      const { result, previewNote, spy, rerender } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("確定"); });

      act(() => { result.current.onBlur(); });
      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "確定");
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);

      advance(1000);
      expect(previewNote).toHaveBeenCalledTimes(1);
      // 下書きを捨て、現在のメモ（反映後の値）を出す
      rerender({ note: "確定" });
      expect(result.current.value).toBe("確定");
    });

    it("入力が無ければ反映せず、グループだけを閉じる", () => {
      const { result, previewNote, spy } = setup("元");
      act(() => { result.current.onFocus(); });

      act(() => { result.current.onBlur(); });

      expect(previewNote).not.toHaveBeenCalled();
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    });

    it("反映済みの後の blur では、同じ下書きをもう一度反映するだけで、グループは 1 回だけ閉じる", () => {
      const { result, previewNote, spy } = setup();
      act(() => { result.current.onFocus(); result.current.onChange("abc"); });
      advance(300);

      act(() => { result.current.onBlur(); });

      expect(previewNote.mock.calls).toEqual([[7, "abc"], [7, "abc"]]);
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    });
  });

  describe("Escape", () => {
    it("フォーカスを入れた時点の内容へ戻して欄から出る。その後の blur では何も反映しない（L-473）", () => {
      const { result, previewNote, spy, rerender } = setup("元のメモ");
      act(() => { result.current.onFocus(); result.current.onChange("書き換え"); });
      advance(300);
      rerender({ note: "書き換え" });
      const { event, blur } = keyEvent("Escape");

      act(() => { result.current.onKeyDown(event); });
      expect(previewNote).toHaveBeenLastCalledWith(7, "元のメモ");
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
      expect(blur).toHaveBeenCalledTimes(1);

      act(() => { result.current.onBlur(); });
      advance(1000);
      expect(previewNote).toHaveBeenCalledTimes(2);
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    });

    it("メモが無かったノードでは、空文字へ戻す", () => {
      const { result, previewNote } = setup(undefined);
      act(() => { result.current.onFocus(); result.current.onChange("書いた"); });

      act(() => { result.current.onKeyDown(keyEvent("Escape").event); });

      expect(previewNote).toHaveBeenLastCalledWith(7, "");
    });

    it("保留中のタイマーを止める", () => {
      const { result, previewNote } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("途中"); });

      act(() => { result.current.onKeyDown(keyEvent("Escape").event); });
      advance(1000);

      expect(previewNote.mock.calls).toEqual([[7, "元"]]);
    });

    it.each([
      ["compositionstart の後", { composing: true, event: keyEvent("Escape") }],
      ["isComposing が真", { composing: false, event: keyEvent("Escape", { isComposing: true }) }],
      ["keyCode 229", { composing: false, event: keyEvent("Escape", { keyCode: 229 }) }],
    ])("IME 変換中（%s）の Escape は取り消さない", (_name, { composing, event }) => {
      const { result, previewNote, spy } = setup("元");
      act(() => { result.current.onFocus(); });
      if (composing) act(() => { result.current.onCompositionStart(); });
      act(() => { result.current.onChange("へんかん"); });

      act(() => { result.current.onKeyDown(event.event); });

      expect(previewNote).not.toHaveBeenCalled();
      expect(spy.lease.finish).not.toHaveBeenCalled();
      expect(event.blur).not.toHaveBeenCalled();
      expect(result.current.value).toBe("へんかん");
    });

    it("Escape 以外のキーでは何もしない", () => {
      const { result, previewNote } = setup("元");
      act(() => { result.current.onFocus(); });
      const { event, blur } = keyEvent("Enter");

      act(() => { result.current.onKeyDown(event); });

      expect(previewNote).not.toHaveBeenCalled();
      expect(blur).not.toHaveBeenCalled();
    });
  });

  describe("IME（L-474）", () => {
    it("変換中は途中反映のタイマーを張らず、compositionend の 300ms 後に反映する", () => {
      const { result, previewNote } = setup();
      act(() => { result.current.onFocus(); result.current.onCompositionStart(); });
      act(() => { result.current.onChange("にほん"); });
      act(() => { result.current.onChange("日本"); });
      advance(3000);
      expect(previewNote).not.toHaveBeenCalled();
      expect(result.current.value).toBe("日本");

      act(() => { result.current.onCompositionEnd(); });
      advance(299);
      expect(previewNote).not.toHaveBeenCalled();
      advance(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "日本");
    });

    it("変換を始めたら、変換前の入力で張ったタイマーを止める（変換中の文字をマップへ入れない）", () => {
      const { result, previewNote } = setup();
      act(() => { result.current.onFocus(); result.current.onChange("a"); });
      act(() => { result.current.onCompositionStart(); result.current.onChange("aに"); });
      advance(1000);

      expect(previewNote).not.toHaveBeenCalled();
    });
  });

  describe("アンマウント", () => {
    it("blur を起こさずに外れても（キャンバスで別のノードを選んだ）、有効なグループの下書きを反映してから閉じる", () => {
      const { result, previewNote, spy, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("下書き"); });

      unmount();

      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "下書き");
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
      advance(1000);
      expect(previewNote).toHaveBeenCalledTimes(1);
    });

    it("文書の入れ替えでグループが失効していれば、古い下書きを書かない（L-588）", () => {
      const { result, previewNote, spy, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("古い下書き"); });
      spy.expire();

      unmount();
      advance(1000);

      expect(previewNote).not.toHaveBeenCalled();
    });

    it("アンマウントの後に blur が届いても、下書きを書かない（L-473・L-588）", () => {
      const { result, previewNote, spy, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("古い下書き"); });
      const { onBlur } = result.current;
      spy.expire();

      unmount();
      act(() => onBlur());
      advance(3000);

      expect(previewNote).not.toHaveBeenCalled();
    });

    it("有効なグループのアンマウントの後に blur が届いても、二重に反映しない（L-473）", () => {
      const { result, previewNote, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("下書き"); });
      const { onBlur } = result.current;

      unmount();
      act(() => onBlur());
      advance(3000);

      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(previewNote).toHaveBeenLastCalledWith(7, "下書き");
    });

    it("フォーカスしていなければ何もしない", () => {
      const { previewNote, spy, unmount } = setup("元");

      unmount();

      expect(previewNote).not.toHaveBeenCalled();
      expect(spy.lease.finish).not.toHaveBeenCalled();
    });

    it("blur の後のアンマウントでは、二重に反映しない", () => {
      const { result, previewNote, spy, unmount } = setup("元");
      act(() => { result.current.onFocus(); result.current.onChange("確定"); result.current.onBlur(); });

      unmount();

      expect(previewNote).toHaveBeenCalledTimes(1);
      expect(spy.lease.finish).toHaveBeenCalledTimes(1);
    });
  });
});
