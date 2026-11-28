import { resolveDockOverflowPrimaryCount } from "@/domain/dock/resolveDockOverflowPrimaryCount";

describe("resolveDockOverflowPrimaryCount", () => {
  it("幅に収まる分だけ primary にし、残りはその他候補になる", () => {
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 100,
        slotWidths: [60, 60, 60],
      }),
    ).toBe(1);
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 200,
        slotWidths: [60, 60, 60],
      }),
    ).toBe(3);
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 0,
        slotWidths: [60],
      }),
    ).toBe(1);
  });

  it("はみ出すときは「その他」trigger 幅を控除して primary を決める", () => {
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 200,
        slotWidths: [90, 90, 90],
      }),
    ).toBe(2);
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 200,
        slotWidths: [90, 90, 90],
        overflowTriggerWidth: 50,
      }),
    ).toBe(1);
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 270,
        slotWidths: [90, 90, 90],
        overflowTriggerWidth: 50,
      }),
    ).toBe(3);
  });

  it("空の slotWidths は 0", () => {
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 200,
        slotWidths: [],
      }),
    ).toBe(0);
  });

  it("合計がコンテナ以内なら全件数", () => {
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 180,
        slotWidths: [60, 60, 60],
        overflowTriggerWidth: 50,
      }),
    ).toBe(3);
  });

  it("slotGapPx をスロット間と「その他」trigger 前から控除する", () => {
    // 90+8+90=188 ≤ 200 → 全表示（gap 込み）
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 200,
        slotWidths: [90, 90],
        slotGapPx: 8,
      }),
    ).toBe(2);

    // gap 無し: available=200-10=190 → 95+95=190 で primary 2
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 200,
        slotWidths: [95, 95, 95],
        overflowTriggerWidth: 10,
        slotGapPx: 0,
      }),
    ).toBe(2);

    // gap あり: available=200-10-8=182 → 2 件目は +8+95=198 > 182 で primary 1
    expect(
      resolveDockOverflowPrimaryCount({
        containerWidth: 200,
        slotWidths: [95, 95, 95],
        overflowTriggerWidth: 10,
        slotGapPx: 8,
      }),
    ).toBe(1);
  });
});
