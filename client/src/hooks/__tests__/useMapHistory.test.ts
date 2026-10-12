import { act, renderHook } from "@testing-library/react";
import { useMapHistory } from "@/hooks/useMapHistory";
import { createTestNode } from "@/testing/createTestNode";
import type { NodeMapState } from "@/types/nodeMapState";

function state(label: string): NodeMapState {
  return { layoutMode: "manual", nodes: [createTestNode({ id: 1, label })] };
}

const a = state("a");
const b = state("b");
const c = state("c");
const d = state("d");

describe("useMapHistory", () => {
  it("同一act内のcommit->undo->redoが順に反映される", () => {
    const { result } = renderHook(() => useMapHistory(a));
    const results: boolean[] = [];

    act(() => {
      results.push(result.current.commit(b));
      results.push(result.current.undo());
      expect(result.current.getPresent()).toEqual(a);
      results.push(result.current.redo());
    });

    expect(results).toEqual([true, true, true]);
    expect(result.current.present).toEqual(b);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("実際に変わらない操作はfalseを返す", () => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      expect(result.current.commit(state("a"))).toBe(false);
      expect(result.current.preview(state("a"))).toBe(false);
      expect(result.current.undo()).toBe(false);
      expect(result.current.redo()).toBe(false);
    });
    expect(result.current.canUndo).toBe(false);
  });

  it("関数参照は再描画しても安定している", () => {
    const { result, rerender } = renderHook(() => useMapHistory(a));
    const first = result.current;

    act(() => {
      result.current.commit(b);
    });
    rerender();

    for (const key of ["getPresent", "commit", "preview", "beginGroup", "reset", "undo", "redo"] as const) {
      expect(result.current[key]).toBe(first[key]);
    }
  });

  it("グループ内のpreviewは終了時に1操作としてUndoされる", () => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      const lease = result.current.beginGroup();
      result.current.preview(b);
      result.current.preview(c);
      expect(lease.isActive()).toBe(true);
      lease.finish();
      expect(lease.isActive()).toBe(false);
      lease.finish();
    });
    expect(result.current.present).toEqual(c);

    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toEqual(a);
  });

  it("reset後の古いleaseのfinishは何も変えない", () => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      const lease = result.current.beginGroup();
      result.current.preview(b);
      result.current.reset(c);
      expect(lease.isActive()).toBe(false);
      lease.finish();
    });
    expect(result.current.present).toEqual(c);
    expect(result.current.canUndo).toBe(false);
  });

  it("undo後の古いleaseのfinishは何も変えない", () => {
    const { result } = renderHook(() => useMapHistory(c));

    act(() => {
      const lease = result.current.beginGroup();
      result.current.preview(d);
      expect(result.current.undo()).toBe(true);
      expect(lease.isActive()).toBe(false);
      lease.finish();
    });
    expect(result.current.present).toEqual(c);
    expect(result.current.canRedo).toBe(true);
  });

  it("次グループ中の古いleaseのfinishは進行中のグループを閉じない", () => {
    const { result } = renderHook(() => useMapHistory(c));

    act(() => {
      const old = result.current.beginGroup();
      const next = result.current.beginGroup();
      expect(old.isActive()).toBe(false);
      result.current.preview(b);
      old.finish();
      expect(next.isActive()).toBe(true);
      next.finish();
    });
    expect(result.current.present).toEqual(b);
    expect(result.current.canUndo).toBe(true);
  });

  it("undoがfalseでも終了済みgroupのleaseは失効する", () => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      const lease = result.current.beginGroup();
      expect(result.current.undo()).toBe(false);
      expect(lease.isActive()).toBe(false);
    });
  });

  it("commitは進行中グループを閉じてleaseを失効させる", () => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      const lease = result.current.beginGroup();
      result.current.preview(b);
      result.current.commit(c);
      expect(lease.isActive()).toBe(false);
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toEqual(b);
  });

  it("redoは進行中グループを閉じてleaseを失効させる", () => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      result.current.commit(b);
      result.current.undo();
      const lease = result.current.beginGroup();
      expect(result.current.redo()).toBe(true);
      expect(lease.isActive()).toBe(false);
      lease.finish();
    });
    expect(result.current.present).toEqual(b);
    expect(result.current.canRedo).toBe(false);
  });

  it("グループ内のpreviewはleaseを失効させない", () => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      const lease = result.current.beginGroup();
      result.current.preview(b);
      result.current.preview(a);
      expect(lease.isActive()).toBe(true);
      lease.finish();
    });
    expect(result.current.canUndo).toBe(false);
  });

  it.each<[string, (history: ReturnType<typeof useMapHistory>) => void]>([
    ["変化のないグループ中", () => {}],
    ["previewで元に戻したグループ中", (history) => {
      history.preview(b);
      history.preview(a);
    }],
  ])("%sの同値commitは履歴を変えずにleaseを失効させる", (_, setup) => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      const lease = result.current.beginGroup();
      setup(result.current);
      expect(result.current.commit(a)).toBe(false);
      expect(lease.isActive()).toBe(false);
      result.current.preview(b);
      lease.finish();
    });
    expect(result.current.present).toEqual(b);
    expect(result.current.canUndo).toBe(true);
    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toEqual(a);
    expect(result.current.canUndo).toBe(false);
  });

  it("redoがfalseでも進行中グループのleaseは失効する", () => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      const lease = result.current.beginGroup();
      expect(result.current.redo()).toBe(false);
      expect(lease.isActive()).toBe(false);
    });
  });

  it("finishは冪等で、2回目以降は後続のグループを閉じない", () => {
    const { result } = renderHook(() => useMapHistory(a));

    act(() => {
      const lease = result.current.beginGroup();
      result.current.preview(b);
      lease.finish();
      lease.finish();
      const next = result.current.beginGroup();
      result.current.preview(c);
      lease.finish();
      expect(next.isActive()).toBe(true);
      next.finish();
    });
    expect(result.current.present).toEqual(c);
    act(() => {
      result.current.undo();
    });
    expect(result.current.present).toEqual(b);
  });
});
