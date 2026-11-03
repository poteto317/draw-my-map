import { act, renderHook } from "@testing-library/react";
import { useOutlineLabelDraft } from "@/hooks/useOutlineLabelDraft";
import { createTestNode } from "@/testing/createTestNode";
function setup() {
    const props = { nodes: [createTestNode({ id: 1, label: "元" })], documentRevision: 0, enabled: true, duplicateIds: false, updateNodeLabel: jest.fn(), publishNotice: jest.fn() };
    return { props, ...renderHook(useOutlineLabelDraft, { initialProps: props }) };
}
it("生文字列を保持し同期commit二回でも保存は一回", () => {
    const h = setup();
    act(() => { h.result.current.begin(1); h.result.current.setText(" \t本文\n次行 "); });
    expect(h.result.current.draft?.text).toBe(" \t本文\n次行 ");
    expect(h.props.updateNodeLabel).not.toHaveBeenCalled();
    act(() => { expect(h.result.current.commit()).toBe(1); expect(h.result.current.commit()).toBeNull(); });
    expect(h.props.updateNodeLabel).toHaveBeenCalledTimes(1);
    expect(h.props.updateNodeLabel).toHaveBeenCalledWith(1, " \t本文\n次行 ");
});
it("変更なしとcancel後のblurは保存しない", () => {
    const h = setup();
    act(() => { h.result.current.begin(1); h.result.current.commit(); h.result.current.begin(1); h.result.current.setText("変更"); expect(h.result.current.cancel()).toBe(1); h.result.current.commit(); });
    expect(h.props.updateNodeLabel).not.toHaveBeenCalled();
});
it.each(["revision", "削除", "元ラベル"])("%s変更で失効して通知", kind => {
    const h = setup();
    act(() => { h.result.current.begin(1); h.result.current.setText("変更"); });
    const commit = h.result.current.commit;
    h.rerender({ ...h.props, documentRevision: kind === "revision" ? 1 : 0, nodes: kind === "削除" ? [] : [createTestNode({ id: 1, label: kind === "元ラベル" ? "新" : "元" })] });
    act(() => { expect(commit()).toBeNull(); });
    expect(h.props.updateNodeLabel).not.toHaveBeenCalled();
    expect(h.props.publishNotice).toHaveBeenCalledTimes(1);
    expect(h.result.current.draft).toBeNull();
});
it("失敗Undo相当のrevision不変では保存できる", () => {
    const h = setup();
    act(() => { h.result.current.begin(1); h.result.current.setText("変更"); });
    h.rerender({ ...h.props });
    act(() => h.result.current.commit());
    expect(h.props.updateNodeLabel).toHaveBeenCalledWith(1, "変更");
});
it("disabledとunmountで後着commitは保存しない", () => {
    const h = setup();
    act(() => { h.result.current.begin(1); h.result.current.setText("変更"); });
    const commit = h.result.current.commit;
    h.rerender({ ...h.props, enabled: false });
    act(() => commit());
    h.unmount();
    commit();
    expect(h.props.updateNodeLabel).not.toHaveBeenCalled();
});
it("新IDは直後に未反映でも空draftを持ち、存在が反映されれば確定できる", () => {
    const h = setup();
    act(() => h.result.current.begin(2, ""));
    expect(h.result.current.draft?.nodeId).toBe(2);
    h.rerender({ ...h.props, nodes: [...h.props.nodes, createTestNode({ id: 2 })] });
    act(() => { h.result.current.setText("新ラベル"); h.result.current.commit(); });
    expect(h.props.updateNodeLabel).toHaveBeenCalledWith(2, "新ラベル");
});
it("新IDが次の正本に存在しなければ失効する", () => {
    const h = setup();
    act(() => h.result.current.begin(2, ""));
    h.rerender({ ...h.props, nodes: [...h.props.nodes] });
    expect(h.result.current.draft).toBeNull();
    expect(h.props.publishNotice).toHaveBeenCalledTimes(1);
});
