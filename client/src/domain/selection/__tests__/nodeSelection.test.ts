import {
  addMarquee,
  addRange,
  clear,
  pruneMissing,
  replaceWithMarquee,
  selectOnly,
  toggle,
  type NodeSelectionState,
} from "@/domain/selection/nodeSelection";

function idsOf(state: NodeSelectionState): number[] {
  return [...state.selectedIds];
}

describe("nodeSelection", () => {
  describe("selectOnly / clear", () => {
    it("selectOnly はその ID だけの単一選択にする", () => {
      expect(selectOnly(3)).toEqual({
        selectedIds: new Set([3]),
        primaryId: 3,
        anchorId: 3,
      });
    });

    it("clear は空選択にする", () => {
      expect(clear()).toEqual({
        selectedIds: new Set(),
        primaryId: null,
        anchorId: null,
      });
    });
  });

  describe("toggle", () => {
    it("未選択なら追加し primary と anchor をその ID にする", () => {
      const state = selectOnly(1);
      const next = toggle(state, 2, [1, 2, 3]);

      expect(idsOf(next).sort()).toEqual([1, 2]);
      expect(next.primaryId).toBe(2);
      expect(next.anchorId).toBe(2);
    });

    it("選択済みを外す。非主選択なら primary は維持し anchor は primary に合わせる", () => {
      const state = toggle(selectOnly(1), 2, [1, 2]);
      const next = toggle(state, 1, [1, 2]);

      expect(idsOf(next)).toEqual([2]);
      expect(next.primaryId).toBe(2);
      expect(next.anchorId).toBe(2);
    });

    it("主選択を外すと残りの配列順先頭を主選択にし anchor も合わせる", () => {
      const withTwo = toggle(selectOnly(1), 2, [1, 2, 3]);
      const withThree = toggle(withTwo, 3, [1, 2, 3]);
      const next = toggle(withThree, 3, [1, 2, 3]);

      expect(idsOf(next)).toEqual([1, 2]);
      expect(next.primaryId).toBe(1);
      expect(next.anchorId).toBe(1);
    });

    it("主選択の付け替えは Set 反復順ではなく orderedNodeIds で決める", () => {
      const state: NodeSelectionState = {
        selectedIds: new Set([10, 20, 30]),
        primaryId: 10,
        anchorId: 10,
      };
      const next = toggle(state, 10, [30, 20, 10]);

      expect(idsOf(next).sort()).toEqual([20, 30]);
      expect(next.primaryId).toBe(30);
      expect(next.anchorId).toBe(30);
    });

    it("最後の1件を外すと全解除する", () => {
      expect(toggle(selectOnly(5), 5, [5])).toEqual(clear());
    });
  });

  describe("addRange", () => {
    const visible = [10, 20, 30, 40, 50] as const;

    it("アンカー欠落なら selectOnly(target) になる", () => {
      expect(addRange(clear(), 30, visible)).toEqual(selectOnly(30));
    });

    it("アンカーが表示列に無いなら selectOnly(target) になる", () => {
      const state = selectOnly(99);
      expect(addRange(state, 30, visible)).toEqual(selectOnly(30));
    });

    it("アンカー〜target の区間を加算し primary=target・anchor は維持する", () => {
      const state = selectOnly(20);
      const next = addRange(state, 40, visible);

      expect(idsOf(next).sort()).toEqual([20, 30, 40]);
      expect(next.primaryId).toBe(40);
      expect(next.anchorId).toBe(20);
    });

    it("target がアンカーより前でも両端含む区間を加算する", () => {
      const state = selectOnly(40);
      const next = addRange(state, 20, visible);

      expect(idsOf(next).sort()).toEqual([20, 30, 40]);
      expect(next.primaryId).toBe(20);
      expect(next.anchorId).toBe(40);
    });

    it("既存の選択を置換せず加算する", () => {
      const state: NodeSelectionState = {
        selectedIds: new Set([10, 50]),
        primaryId: 50,
        anchorId: 10,
      };
      const next = addRange(state, 30, visible);

      expect(idsOf(next).sort()).toEqual([10, 20, 30, 50]);
      expect(next.primaryId).toBe(30);
      expect(next.anchorId).toBe(10);
    });
  });

  describe("replaceWithMarquee / addMarquee", () => {
    it("replaceWithMarquee は呼び出し側の配列順を保ち末尾を primary+anchor にする", () => {
      const next = replaceWithMarquee([3, 1, 2]);

      expect(idsOf(next)).toEqual([3, 1, 2]);
      expect(next.primaryId).toBe(2);
      expect(next.anchorId).toBe(2);
    });

    it("replaceWithMarquee の 0 件は clear", () => {
      expect(replaceWithMarquee([])).toEqual(clear());
    });

    it("addMarquee は既存へ加算し末尾を primary+anchor にする", () => {
      const state = selectOnly(9);
      const next = addMarquee(state, [3, 1]);

      expect(idsOf(next).sort()).toEqual([1, 3, 9]);
      expect(next.primaryId).toBe(1);
      expect(next.anchorId).toBe(1);
    });

    it("addMarquee の 0 件は clear", () => {
      expect(addMarquee(selectOnly(1), [])).toEqual(clear());
    });
  });

  describe("pruneMissing", () => {
    it("残存 ID だけ残し、消えた primary は orderedNodeIds 上の先頭を新 primary にする", () => {
      const state: NodeSelectionState = {
        selectedIds: new Set([1, 3, 5]),
        primaryId: 1,
        anchorId: 1,
      };
      const next = pruneMissing(state, new Set([3, 5, 7]), [7, 5, 3, 1]);

      expect(idsOf(next).sort()).toEqual([3, 5]);
      expect(next.primaryId).toBe(5);
      expect(next.anchorId).toBe(5);
    });

    it("primary が残っていれば維持し、消えた anchor だけ primary に合わせる", () => {
      const state: NodeSelectionState = {
        selectedIds: new Set([1, 2, 3]),
        primaryId: 2,
        anchorId: 1,
      };
      const next = pruneMissing(state, new Set([2, 3]), [1, 2, 3]);

      expect(idsOf(next).sort()).toEqual([2, 3]);
      expect(next.primaryId).toBe(2);
      expect(next.anchorId).toBe(2);
    });

    it("すべて消えたら clear する", () => {
      expect(pruneMissing(selectOnly(1), new Set([2, 3]), [2, 3])).toEqual(clear());
    });

    it("Set 反復順ではなく orderedNodeIds で新 primary を決める", () => {
      const state: NodeSelectionState = {
        selectedIds: new Set([10, 20, 30]),
        primaryId: 10,
        anchorId: 10,
      };
      const next = pruneMissing(state, new Set([20, 30]), [30, 20, 10]);

      expect(next.primaryId).toBe(30);
      expect(next.anchorId).toBe(30);
    });
  });
});
