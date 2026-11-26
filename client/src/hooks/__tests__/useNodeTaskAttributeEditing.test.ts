import { renderHook } from "@testing-library/react";
import { nodeTagKey } from "@/domain/nodes/nodeTag";
import { useNodeTaskAttributeEditing } from "@/hooks/useNodeTaskAttributeEditing";

const applyTask = jest.fn(() => ({ ok: true as const, changed: true }));
const applyCustomAttribute = jest.fn(() => ({ ok: true as const, changed: true }));

describe("useNodeTaskAttributeEditing", () => {
  beforeEach(() => {
    applyTask.mockClear();
    applyCustomAttribute.mockClear();
  });

  it("選択が変わったあと古い commitTask を呼ぶと反映しない", () => {
    const { result, rerender } = renderHook(
      ({ nodeId, documentRevision, disabled }) =>
        useNodeTaskAttributeEditing(nodeId, documentRevision, disabled, applyTask, applyCustomAttribute),
      { initialProps: { nodeId: 1, documentRevision: 0, disabled: false } },
    );
    const staleCommit = result.current.commitTask;
    rerender({ nodeId: 2, documentRevision: 0, disabled: false });

    expect(staleCommit({ nodeId: 1, documentRevision: 0 }, undefined, { completed: true }))
      .toEqual({ ok: false, reason: "編集対象が変わりました。" });
    expect(applyTask).not.toHaveBeenCalled();
  });

  it("documentRevision が一致しない target は拒否する", () => {
    const { result, rerender } = renderHook(
      ({ nodeId, documentRevision, disabled }) =>
        useNodeTaskAttributeEditing(nodeId, documentRevision, disabled, applyTask, applyCustomAttribute),
      { initialProps: { nodeId: 1, documentRevision: 0, disabled: false } },
    );
    const staleCommit = result.current.commitTask;
    rerender({ nodeId: 1, documentRevision: 2, disabled: false });

    expect(staleCommit({ nodeId: 1, documentRevision: 0 }, undefined, { completed: true }))
      .toEqual({ ok: false, reason: "編集対象が変わりました。" });
    expect(applyTask).not.toHaveBeenCalled();
  });

  it("disabled になったあとの commitTask は拒否する", () => {
    const { result, rerender } = renderHook(
      ({ nodeId, documentRevision, disabled }) =>
        useNodeTaskAttributeEditing(nodeId, documentRevision, disabled, applyTask, applyCustomAttribute),
      { initialProps: { nodeId: 1, documentRevision: 0, disabled: false } },
    );
    const staleCommit = result.current.commitTask;
    rerender({ nodeId: 1, documentRevision: 0, disabled: true });

    expect(staleCommit({ nodeId: 1, documentRevision: 0 }, undefined, { completed: true }))
      .toEqual({ ok: false, reason: "現在の状態では編集できません。" });
    expect(applyTask).not.toHaveBeenCalled();
  });

  it("削除で世代が一致しない要求を拒否する", () => {
    const { result } = renderHook(() =>
      useNodeTaskAttributeEditing(1, 0, false, applyTask, applyCustomAttribute),
    );
  const attr = { name: "件数", type: "number" as const, value: 1 };
    applyCustomAttribute.mockReturnValueOnce({ ok: true, changed: true });
    result.current.commitCustomAttribute({ nodeId: 1, documentRevision: 0 }, null, null, attr);
    expect(
      result.current.commitCustomAttribute(
        { nodeId: 1, documentRevision: 0 },
        nodeTagKey("件数"),
        attr,
        null,
        0,
      ),
    ).toEqual({ ok: false, reason: "カスタム属性が更新されたか、現在の状態では編集できません。" });
  });

  it("getAttributeEditRejection と commitTask の可否が一致する", () => {
    const { result } = renderHook(() =>
      useNodeTaskAttributeEditing(3, 1, false, applyTask, applyCustomAttribute),
    );

    expect(result.current.getAttributeEditRejection({ nodeId: 2, documentRevision: 1 }))
      .toBe("編集対象が変わりました。");
    expect(
      result.current.commitTask({ nodeId: 2, documentRevision: 1 }, undefined, { completed: false }),
    ).toEqual({ ok: false, reason: "編集対象が変わりました。" });
  });

  it("選択が変わったあと古い commitCustomAttribute を呼ぶと反映しない", () => {
    const attr = { name: "件数", type: "number" as const, value: 1 };
    const { result, rerender } = renderHook(
      ({ nodeId, documentRevision, disabled }) =>
        useNodeTaskAttributeEditing(nodeId, documentRevision, disabled, applyTask, applyCustomAttribute),
      { initialProps: { nodeId: 1, documentRevision: 0, disabled: false } },
    );
    const staleCommit = result.current.commitCustomAttribute;
    rerender({ nodeId: 2, documentRevision: 0, disabled: false });

    expect(staleCommit({ nodeId: 1, documentRevision: 0 }, null, null, attr))
      .toEqual({ ok: false, reason: "編集対象が変わりました。" });
    expect(applyCustomAttribute).not.toHaveBeenCalled();
  });

  it("documentRevision が一致しない commitCustomAttribute は拒否する", () => {
    const attr = { name: "件数", type: "number" as const, value: 1 };
    const { result, rerender } = renderHook(
      ({ nodeId, documentRevision, disabled }) =>
        useNodeTaskAttributeEditing(nodeId, documentRevision, disabled, applyTask, applyCustomAttribute),
      { initialProps: { nodeId: 1, documentRevision: 0, disabled: false } },
    );
    const staleCommit = result.current.commitCustomAttribute;
    rerender({ nodeId: 1, documentRevision: 2, disabled: false });

    expect(staleCommit({ nodeId: 1, documentRevision: 0 }, null, null, attr))
      .toEqual({ ok: false, reason: "編集対象が変わりました。" });
    expect(applyCustomAttribute).not.toHaveBeenCalled();
  });

  it("disabled になったあと commitCustomAttribute は拒否する", () => {
    const attr = { name: "件数", type: "number" as const, value: 1 };
    const { result, rerender } = renderHook(
      ({ nodeId, documentRevision, disabled }) =>
        useNodeTaskAttributeEditing(nodeId, documentRevision, disabled, applyTask, applyCustomAttribute),
      { initialProps: { nodeId: 1, documentRevision: 0, disabled: false } },
    );
    const staleCommit = result.current.commitCustomAttribute;
    rerender({ nodeId: 1, documentRevision: 0, disabled: true });

    expect(staleCommit({ nodeId: 1, documentRevision: 0 }, null, null, attr))
      .toEqual({ ok: false, reason: "現在の状態では編集できません。" });
    expect(applyCustomAttribute).not.toHaveBeenCalled();
  });

  it("値変更後に古い世代の削除要求を拒否する", () => {
    const attr = { name: "件数", type: "number" as const, value: 1 };
    const updated = { name: "件数", type: "number" as const, value: 2 };
    const { result } = renderHook(() =>
      useNodeTaskAttributeEditing(1, 0, false, applyTask, applyCustomAttribute),
    );
    const editKey = nodeTagKey("件数");
    applyCustomAttribute.mockReturnValue({ ok: true, changed: true });
    result.current.commitCustomAttribute({ nodeId: 1, documentRevision: 0 }, null, null, attr);
    result.current.commitCustomAttribute({ nodeId: 1, documentRevision: 0 }, editKey, attr, updated);

    expect(
      result.current.commitCustomAttribute(
        { nodeId: 1, documentRevision: 0 },
        editKey,
        updated,
        null,
        1,
      ),
    ).toEqual({ ok: false, reason: "カスタム属性が更新されたか、現在の状態では編集できません。" });
    expect(applyCustomAttribute).toHaveBeenCalledTimes(2);
  });

  it("削除後に同名同値を再追加したあと古い削除要求を拒否する", () => {
    const attr = { name: "件数", type: "number" as const, value: 1 };
    const { result } = renderHook(() =>
      useNodeTaskAttributeEditing(1, 0, false, applyTask, applyCustomAttribute),
    );
    const editKey = nodeTagKey("件数");
    applyCustomAttribute.mockReturnValue({ ok: true, changed: true });
    result.current.commitCustomAttribute({ nodeId: 1, documentRevision: 0 }, null, null, attr);
    const staleGeneration = result.current.getAttributeGeneration(editKey);
    result.current.commitCustomAttribute(
      { nodeId: 1, documentRevision: 0 },
      editKey,
      attr,
      null,
      staleGeneration,
    );
    result.current.commitCustomAttribute({ nodeId: 1, documentRevision: 0 }, null, null, attr);

    expect(
      result.current.commitCustomAttribute(
        { nodeId: 1, documentRevision: 0 },
        editKey,
        attr,
        null,
        staleGeneration,
      ),
    ).toEqual({ ok: false, reason: "カスタム属性が更新されたか、現在の状態では編集できません。" });
  });

  it("getAttributeEditRejection と commitCustomAttribute の可否が一致する", () => {
    const attr = { name: "件数", type: "number" as const, value: 1 };
    const { result } = renderHook(() =>
      useNodeTaskAttributeEditing(3, 1, false, applyTask, applyCustomAttribute),
    );

    expect(result.current.getAttributeEditRejection({ nodeId: 2, documentRevision: 1 }))
      .toBe("編集対象が変わりました。");
    expect(result.current.commitCustomAttribute({ nodeId: 2, documentRevision: 1 }, null, null, attr))
      .toEqual({ ok: false, reason: "編集対象が変わりました。" });
  });
});