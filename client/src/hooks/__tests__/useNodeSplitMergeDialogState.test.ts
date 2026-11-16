import { act, renderHook } from "@testing-library/react";
import { NODE_SEPARATOR_CUSTOM_ID } from "@/domain/nodes/nodeSeparator";
import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
import { useNodeSplitMergeDialogState } from "@/hooks/useNodeSplitMergeDialogState";

type Props = { mapId: string; documentRevision: number };

const openedTarget = { kind: "split", nodeId: 1 } as const;

function setup(initial: Props = { mapId: "a", documentRevision: 0 }) {
  return renderHook((props: Props) => useNodeSplitMergeDialogState(props), { initialProps: initial });
}

function openDialog(view: ReturnType<typeof setup>, revision = 0, mapId = "a") {
  act(() => {
    view.result.current.open({ target: openedTarget, defaultSeparator: "、", revision, mapId });
  });
}

describe("useNodeSplitMergeDialogState", () => {
  it("開く前は閉じていて、フォーカスも要求しない", () => {
    const view = setup();

    expect(view.result.current).toMatchObject({
      isOpen: false,
      stale: false,
      focusRequest: null,
      error: { message: null },
    });
  });

  it("開くと開いた状態になり、区切り文字の入力へフォーカスを求める", () => {
    const view = setup();

    openDialog(view);

    expect(view.result.current).toMatchObject({
      isOpen: true,
      stale: false,
      focusRequest: "separator",
      separator: "、",
    });
  });

  it("マップが変わると閉じ、ヘッダーへフォーカスを求めない", () => {
    const view = setup();
    openDialog(view);

    view.rerender({ mapId: "b", documentRevision: 0 });

    expect(view.result.current.isOpen).toBe(false);
    expect(view.result.current.focusRequest).toBeNull();
    expect(view.result.current.state.screen).toBe("closed");
  });

  it("マップが変わって閉じたあと、元のマップへ戻っても開き直さない", () => {
    const view = setup();
    openDialog(view);
    view.rerender({ mapId: "b", documentRevision: 0 });

    view.rerender({ mapId: "a", documentRevision: 0 });

    expect(view.result.current.isOpen).toBe(false);
  });

  it("documentRevision が変わると stale になり、誤りとして更新を促す文言を返す", () => {
    const view = setup();
    openDialog(view);

    view.rerender({ mapId: "a", documentRevision: 1 });

    expect(view.result.current.isOpen).toBe(true);
    expect(view.result.current.stale).toBe(true);
    expect(view.result.current.error.message).toBe(STALE_DIALOG_MESSAGE);
  });

  it("stale 中に fail を呼んでも、stale の誤りが優先される", () => {
    const view = setup();
    openDialog(view);
    view.rerender({ mapId: "a", documentRevision: 1 });

    act(() => { view.result.current.fail("失敗しました"); });

    expect(view.result.current.stale).toBe(true);
    expect(view.result.current.error.message).toBe(STALE_DIALOG_MESSAGE);
  });

  it("開いていなければ documentRevision が変わっても stale にならない", () => {
    const view = setup();

    view.rerender({ mapId: "a", documentRevision: 5 });

    expect(view.result.current.stale).toBe(false);
    expect(view.result.current.error.message).toBeNull();
  });

  it("区切り文字をプリセットと「その他」の入力で変えられる", () => {
    const view = setup();
    openDialog(view);

    act(() => { view.result.current.setSeparatorPreset(NODE_SEPARATOR_CUSTOM_ID); });
    act(() => { view.result.current.setCustomSeparator("／"); });

    expect(view.result.current.separatorPreset).toBe(NODE_SEPARATOR_CUSTOM_ID);
    expect(view.result.current.customSeparator).toBe("／");
    expect(view.result.current.separator).toBe("／");
  });

  it("close は閉じて、ヘッダーへフォーカスを求める", () => {
    const view = setup();
    openDialog(view);

    act(() => { view.result.current.close(); });

    expect(view.result.current.isOpen).toBe(false);
    expect(view.result.current.focusRequest).toBe("header");
  });

  it("consumeFocusRequest はフォーカスの要求を消す", () => {
    const view = setup();
    openDialog(view);

    act(() => { view.result.current.consumeFocusRequest(); });

    expect(view.result.current.focusRequest).toBeNull();
  });

  it("fail は誤りの文言を残し、入力の変更で消える", () => {
    const view = setup();
    openDialog(view);

    act(() => { view.result.current.fail("失敗しました"); });
    expect(view.result.current.error.message).toBe("失敗しました");

    act(() => { view.result.current.setCustomSeparator("x"); });
    expect(view.result.current.error.message).toBeNull();
  });
});
