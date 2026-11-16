import { act, renderHook } from "@testing-library/react";
import { planNodeSplit, type NodeSplitPlan, type SplitNodeResult } from "@/domain/nodes/nodeSplit";
import { useNodeSplitDialog } from "@/hooks/useNodeSplitDialog";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

type Props = {
  mapId?: string;
  nodes?: readonly Node[];
  selectedNodeId?: number | null;
  visibleNodeIds?: ReadonlySet<number>;
  documentRevision?: number;
};

// 1: 分割できる、2: 区切りが無い、3: 非表示（表示の集合に入れない）、4: 空のラベル
const baseNodes = [
  createTestNode({ id: 1, label: "りんご、みかん、ぶどう" }),
  createTestNode({ id: 2, label: "バナナ" }),
  createTestNode({ id: 3, label: "いちご、もも" }),
  createTestNode({ id: 4, label: "" }),
];
const baseVisible: ReadonlySet<number> = new Set([1, 2, 4]);

function setup(initial: Props = {}) {
  const splitNode = jest.fn<SplitNodeResult, [number, string, ReadonlySet<number>, NodeSplitPlan]>(
    () => ({ ok: true, insertedIds: [11, 12] }),
  );
  const publishNotice = jest.fn();
  const view = renderHook(
    (props: Props) => useNodeSplitDialog({
      mapId: props.mapId ?? "a",
      nodes: props.nodes ?? baseNodes,
      selectedNodeId: props.selectedNodeId === undefined ? 1 : props.selectedNodeId,
      visibleNodeIds: props.visibleNodeIds ?? baseVisible,
      documentRevision: props.documentRevision ?? 0,
      splitNode,
      publishNotice,
    }),
    { initialProps: initial },
  );
  return { ...view, splitNode, publishNotice };
}

describe("useNodeSplitDialog", () => {
  it("開くと、主選択のラベルを既定の区切り文字「、」で分けたプレビューが出て、確定できる", () => {
    const view = setup();

    act(() => { view.result.current.open(); });

    expect(view.result.current).toMatchObject({
      screen: "open",
      targetLabel: "りんご、みかん、ぶどう",
      separatorPreset: "ja-comma",
      fragments: ["りんご", "みかん", "ぶどう"],
      statusText: "3件に分割します（2件を追加）",
      canSubmit: true,
      focusRequest: "separator",
    });
  });

  describe("ボタンの有効判定と開く条件", () => {
    it.each([
      ["主選択が無い", { selectedNodeId: null }],
      ["主選択が表示されていない", { selectedNodeId: 3 }],
      ["主選択が配列に無い", { selectedNodeId: 99 }],
    ])("%sときは canOpen が偽で、開かない", (_name, props) => {
      const view = setup(props);

      act(() => { view.result.current.open(); });

      expect(view.result.current.canOpen).toBe(false);
      expect(view.result.current.screen).toBe("closed");
      expect(view.result.current.disabledReason).toBe("分割できるノードが選択されていません。");
    });

    it("主選択のラベルが分けられなくても、canOpen は真（断片数は区切り文字しだい）で、開いたあとに理由を示す", () => {
      const view = setup({ selectedNodeId: 2 });

      act(() => { view.result.current.open(); });

      expect(view.result.current.canOpen).toBe(true);
      expect(view.result.current.screen).toBe("open");
      expect(view.result.current.fragments).toEqual([]);
      expect(view.result.current.statusText).toBe("区切り文字で 2 つ以上に分けられません。");
      expect(view.result.current.canSubmit).toBe(false);
    });
  });

  it("区切り文字を替えると、プレビューと状態文言が即時に変わる", () => {
    const view = setup({ nodes: [createTestNode({ id: 1, label: "a/b・c/d" })], visibleNodeIds: new Set([1]) });
    act(() => { view.result.current.open(); });
    expect(view.result.current.statusText).toBe("区切り文字で 2 つ以上に分けられません。");

    act(() => { view.result.current.setSeparatorPreset("slash"); });
    expect(view.result.current.fragments).toEqual(["a", "b・c", "d"]);
    expect(view.result.current.statusText).toBe("3件に分割します（2件を追加）");

    act(() => { view.result.current.setSeparatorPreset("middle-dot"); });
    expect(view.result.current.fragments).toEqual(["a/b", "c/d"]);
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("「その他」は入力した文字列で分け、空のままなら区切り文字を求めて確定できない", () => {
    const view = setup({ nodes: [createTestNode({ id: 1, label: "a->b->c" })], visibleNodeIds: new Set([1]) });
    act(() => { view.result.current.open(); });

    act(() => { view.result.current.setSeparatorPreset("custom"); });
    expect(view.result.current.statusText).toBe("区切り文字を入力してください。");
    expect(view.result.current.canSubmit).toBe(false);

    act(() => { view.result.current.setCustomSeparator("->"); });
    expect(view.result.current.fragments).toEqual(["a", "b", "c"]);
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("断片が 200 件を超えるときは、件数の上限を示して確定できない", () => {
    const label = Array.from({ length: 201 }, (_, index) => `項目${index}`).join("、");
    const view = setup({ nodes: [createTestNode({ id: 1, label })], visibleNodeIds: new Set([1]) });

    act(() => { view.result.current.open(); });

    expect(view.result.current.statusText).toBe("分割できるのは 200 件までです。");
    expect(view.result.current.canSubmit).toBe(false);
  });

  it("開き直すと、前回の区切り文字を持ち越さず既定に戻る", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    act(() => { view.result.current.setSeparatorPreset("custom"); });
    act(() => { view.result.current.setCustomSeparator("x"); });
    act(() => { view.result.current.close(); });

    act(() => { view.result.current.open(); });

    expect(view.result.current).toMatchObject({ separatorPreset: "ja-comma", customSeparator: "" });
  });

  it("開いた後に主選択が変わっても、対象は開いた時点の主選択のままにする", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    view.rerender({ selectedNodeId: 2 });

    expect(view.result.current.targetLabel).toBe("りんご、みかん、ぶどう");
    expect(view.result.current.fragments).toHaveLength(3);
  });

  it("確定は、開いた後に主選択が変わっても、開いた時点の主選択を対象にして splitNode を呼ぶ", () => {
    const view = setup({ selectedNodeId: 1 });
    act(() => { view.result.current.open(); });

    view.rerender({ selectedNodeId: 2 });
    act(() => { view.result.current.submit(); });

    expect(view.splitNode).toHaveBeenCalledTimes(1);
    const [nodeId, , , expected] = view.splitNode.mock.calls[0];
    expect(nodeId).toBe(1);
    expect(expected).toEqual(planNodeSplit(baseNodes, 1, "、", baseVisible));
  });

  it("プレビューは最新の nodes から作る（開いた後にラベルが変わると、断片も変わる）", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    view.rerender({ nodes: [createTestNode({ id: 1, label: "もも、いちご" }), ...baseNodes.slice(1)] });

    expect(view.result.current.fragments).toEqual(["もも", "いちご"]);
  });

  describe("確定", () => {
    it("splitNode を 1 回、現在のプレビューの計画を expected として呼び、通知して閉じる", () => {
      const view = setup();
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.splitNode).toHaveBeenCalledTimes(1);
      const [nodeId, separator, visibleNodeIds, expected] = view.splitNode.mock.calls[0];
      expect(nodeId).toBe(1);
      expect(separator).toBe("、");
      expect(visibleNodeIds).toBe(baseVisible);
      expect(expected).toEqual(planNodeSplit(baseNodes, 1, "、", baseVisible));
      expect(view.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "ノードを 3 件に分割しました。" });
      expect(view.result.current.screen).toBe("closed");
      expect(view.result.current.focusRequest).toBe("header");
    });

    it("成功の通知の件数は、元のノードと追加した断片の合計", () => {
      const view = setup();
      view.splitNode.mockReturnValueOnce({ ok: true, insertedIds: [11, 12, 13, 14] });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "ノードを 5 件に分割しました。" });
    });

    it("同じ処理での 2 回目の確定は何もしない", () => {
      const view = setup();
      act(() => { view.result.current.open(); });

      act(() => {
        view.result.current.submit();
        view.result.current.submit();
      });

      expect(view.splitNode).toHaveBeenCalledTimes(1);
      expect(view.publishNotice).toHaveBeenCalledTimes(1);
    });

    it("計画が失敗しているとき（確定できないとき）は splitNode を呼ばない", () => {
      const view = setup({ selectedNodeId: 2 });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.splitNode).not.toHaveBeenCalled();
    });

    it("開いていないときは splitNode を呼ばない", () => {
      const view = setup();

      act(() => { view.result.current.submit(); });

      expect(view.splitNode).not.toHaveBeenCalled();
    });

    it("splitNode が失敗したら閉じず、その reason の文言をエラーに出して通知しない。直したあとにもう一度確定できる", () => {
      const view = setup();
      view.splitNode.mockReturnValueOnce({ ok: false, reason: "plan-changed" });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.result.current.screen).toBe("open");
      expect(view.result.current.error.message).toBe("分割の内容が変わりました。もう一度確認してください。");
      expect(view.publishNotice).not.toHaveBeenCalled();

      act(() => { view.result.current.submit(); });
      expect(view.splitNode).toHaveBeenCalledTimes(2);
      expect(view.result.current.screen).toBe("closed");
    });

    it.each([
      ["placement-failed", "ノードを分割できませんでした。"],
      ["id-conflict", "ノードを分割できませんでした。"],
    ] as const)("%s の失敗は「%s」を出す", (reason, message) => {
      const view = setup();
      view.splitNode.mockReturnValueOnce({ ok: false, reason });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.result.current.error.message).toBe(message);
    });
  });

  it("開いた後に documentRevision が変わると stale になり、確定できず、状態文言とエラーが更新を促す", () => {
    const view = setup({ documentRevision: 0 });
    act(() => { view.result.current.open(); });

    view.rerender({ documentRevision: 1 });

    expect(view.result.current.canSubmit).toBe(false);
    expect(view.result.current.statusText).toBe("マップが更新されました。閉じてから開き直してください。");
    expect(view.result.current.error.message).toBe("マップが更新されました。閉じてから開き直してください。");
    act(() => { view.result.current.submit(); });
    expect(view.splitNode).not.toHaveBeenCalled();
  });

  it("mapId が変わると閉じた扱いになり、ヘッダーへのフォーカスは求めない（元のマップへ戻っても復活しない）", () => {
    const view = setup({ mapId: "a" });
    act(() => { view.result.current.open(); });

    view.rerender({ mapId: "b" });
    expect(view.result.current.screen).toBe("closed");
    expect(view.result.current.focusRequest).toBeNull();

    view.rerender({ mapId: "a" });
    expect(view.result.current.screen).toBe("closed");
  });

  it("フォーカス要求は consumeFocusRequest で消える", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    expect(view.result.current.focusRequest).toBe("separator");

    act(() => { view.result.current.consumeFocusRequest(); });

    expect(view.result.current.focusRequest).toBeNull();
  });
});
