import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import {
  CHILD_HORIZONTAL_GAP,
  SIBLING_VERTICAL_GAP,
} from "@/config/shapes";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

function node(
  id: number,
  parentId: number | null,
  x = 0,
  y = 0,
  width = 100,
  height = 60,
  extras: Partial<Node> = {},
): Node {
  return createTestNode({
    id,
    parentId,
    x,
    y,
    width,
    height,
    label: `node-${id}`,
    ...extras,
  });
}

function center(n: Node): { x: number; y: number } {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleOf(point: { x: number; y: number }, origin: { x: number; y: number }): number {
  return Math.atan2(point.y - origin.y, point.x - origin.x);
}

const spacing = { childGap: CHILD_HORIZONTAL_GAP, siblingGap: SIBLING_VERTICAL_GAP };

describe("layoutNodeForest radial", () => {
  it("単一ルートはルート中心を原点にし、子が childGap 半径付近に等角配置される", () => {
    const root = node(1, null, 10, 20);
    const childA = node(2, 1, 900, 900);
    const childB = node(3, 1, 800, 800);
    const result = layoutNodeForest([root, childA, childB], {
      direction: "lr",
      spacing,
      layoutStyle: "radial",
    })!;

    const r = result.find((n) => n.id === 1)!;
    const a = result.find((n) => n.id === 2)!;
    const b = result.find((n) => n.id === 3)!;
    expect(r).toMatchObject({ x: 10, y: 20 });

    const origin = center(r);
    const ca = center(a);
    const cb = center(b);
    expect(dist(ca, origin)).toBeGreaterThanOrEqual(spacing.childGap - 1e-6);
    expect(dist(cb, origin)).toBeGreaterThanOrEqual(spacing.childGap - 1e-6);
    expect(dist(ca, cb)).toBeGreaterThanOrEqual(spacing.siblingGap - 1e-6);

    // 文書順で等角（2子 → セクタ内で 180° 差）
    const angA = angleOf(ca, origin);
    const angB = angleOf(cb, origin);
    let delta = angB - angA;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    expect(Math.abs(Math.abs(delta) - Math.PI)).toBeLessThan(1e-6);
  });

  it("多ルート: 非ピンは非ピン数で360等分（開始0=+X）、セクタ幅はルート総数、ピンルート固定", () => {
    // 配置前ルート中心: (50,30), (250,30), (150,230) → 幾何平均 C=(150, 96.666...)
    const rootA = node(1, null, 0, 0);
    const rootB = node(2, null, 200, 0, 100, 60, { layoutPinned: true });
    const rootC = node(3, null, 100, 200);
    const beforeC = {
      x: (50 + 250 + 150) / 3,
      y: (30 + 30 + 230) / 3,
    };

    const result = layoutNodeForest([rootA, rootB, rootC], {
      direction: "lr",
      spacing,
      layoutStyle: "radial",
    })!;

    const a = result.find((n) => n.id === 1)!;
    const b = result.find((n) => n.id === 2)!;
    const c = result.find((n) => n.id === 3)!;

    // ピンルートは動かない
    expect(b).toMatchObject({ x: 200, y: 0 });

    const ca = center(a);
    const cc = center(c);
    // 非ピン2つ → 0 と π（文書順 A, C）
    expect(angleOf(ca, beforeC)).toBeCloseTo(0, 5);
    expect(Math.abs(angleOf(cc, beforeC))).toBeCloseTo(Math.PI, 5);
    expect(dist(ca, beforeC)).toBeCloseTo(spacing.childGap, 5);
    expect(dist(cc, beforeC)).toBeCloseTo(spacing.childGap, 5);

    // セクタ幅 = 360/3。子を1つ持つルートでセクタ中心がルート偏角に合うことを確認
    const childOfA = node(4, 1);
    const withChild = layoutNodeForest(
      [rootA, rootB, rootC, childOfA],
      { direction: "lr", spacing, layoutStyle: "radial" },
    )!;
    const placedA = withChild.find((n) => n.id === 1)!;
    const placedChild = withChild.find((n) => n.id === 4)!;
    const origin = beforeC;
    const rootAngle = angleOf(center(placedA), origin);
    const childAngle = angleOf(center(placedChild), center(placedA));
    // 単一子はセクタ中央＝ルート偏角
    expect(childAngle).toBeCloseTo(rootAngle, 5);
  });

  it("ピン兄弟のノード box 中心角を予約角として弦長に含める（予約なしでは siblingGap 未満）", () => {
    // 非ピン2つはセクタ内等角（フル円なら ±π/2）。ピンを第1非ピン角のごく近くに置く。
    // 予約なし: 半径≈childGap のまま → ピンとの距離 ≪ siblingGap。
    // 予約あり: 微小角セパレーションから半径が増え、弦 ≥ siblingGap。
    const parent = node(1, null, 0, 0);
    const parentCenter = { x: 50, y: 30 };
    const firstNonPinAngle = -Math.PI / 2;
    const pinAngle = firstNonPinAngle + 0.05; // ~2.9°
    const pinRadius = spacing.childGap;
    const pinCx = parentCenter.x + pinRadius * Math.cos(pinAngle);
    const pinCy = parentCenter.y + pinRadius * Math.sin(pinAngle);
    const pin = node(
      2,
      1,
      pinCx - 50,
      pinCy - 30,
      100,
      60,
      { layoutPinned: true },
    );
    const a = node(3, 1, 900, 900);
    const c = node(4, 1, 800, 800);

    const result = layoutNodeForest([parent, a, pin, c], {
      direction: "lr",
      spacing,
      layoutStyle: "radial",
    })!;

    const placedPin = result.find((n) => n.id === 2)!;
    const placedA = result.find((n) => n.id === 3)!;
    expect(placedPin).toMatchObject({ x: pin.x, y: pin.y });

    const d = dist(center(placedA), center(placedPin));
    expect(d).toBeGreaterThanOrEqual(spacing.siblingGap - 1e-6);

    // 予約なしなら距離 ≈ childGap * 0.05 ≈ 6 < siblingGap(40)
    const withoutReservationDist = spacing.childGap * 0.05;
    expect(withoutReservationDist).toBeLessThan(spacing.siblingGap);
    expect(d).toBeGreaterThan(withoutReservationDist + 1);
  });

  it("多ルート子セクタでピン atan2 角が ±π をまたいでも siblingGap 弦長が保たれる", () => {
    // 非ピン3ルート → 文書順角 0, 2π/3, 4π/3。第3ルートの子セクタ中心は 4π/3（>π）。
    // 非ピン子の配置角は未正規化で >π、ピンをそのごく近くに置くと atan2 は負角になる。
    // 弦長前に [0,2π) へ揃えないと minSep≈2π 扱いになり半径が増えず siblingGap 未満になる。
    const rootA = node(1, null, 0, 0);
    const rootB = node(2, null, 200, 0);
    const rootC = node(3, null, 100, 200);
    const beforeC = {
      x: (50 + 250 + 150) / 3,
      y: (30 + 30 + 230) / 3,
    };
    // 配置後の rootC 中心（非ピン3つ目 → 角 4π/3、半径 childGap）
    const rootCAngle = (2 * 2 * Math.PI) / 3;
    const parentCenter = {
      x: beforeC.x + spacing.childGap * Math.cos(rootCAngle),
      y: beforeC.y + spacing.childGap * Math.sin(rootCAngle),
    };
    // 子セクタ: center=4π/3, width=2π/3 → start=π。非ピン2 → スロット π/3。
    // 第1非ピン角 = π + 0.5*(π/3) = 7π/6。ピンを +0.05 rad。
    const firstNonPinAngle = Math.PI + Math.PI / 6;
    const pinAngle = firstNonPinAngle + 0.05;
    const pinRadius = spacing.childGap;
    const pinCx = parentCenter.x + pinRadius * Math.cos(pinAngle);
    const pinCy = parentCenter.y + pinRadius * Math.sin(pinAngle);
    // atan2 は (-π,π] なので pinAngle(≈3.72) → 負角（±π またぎ）
    expect(Math.atan2(pinCy - parentCenter.y, pinCx - parentCenter.x)).toBeLessThan(0);

    const pin = node(4, 3, pinCx - 50, pinCy - 30, 100, 60, { layoutPinned: true });
    const childA = node(5, 3, 900, 900);
    const childB = node(6, 3, 800, 800);

    const result = layoutNodeForest(
      [rootA, rootB, rootC, pin, childA, childB],
      { direction: "lr", spacing, layoutStyle: "radial" },
    )!;

    const placedPin = result.find((n) => n.id === 4)!;
    const placedA = result.find((n) => n.id === 5)!;
    expect(placedPin).toMatchObject({ x: pin.x, y: pin.y });

    const d = dist(center(placedA), center(placedPin));
    expect(d).toBeGreaterThanOrEqual(spacing.siblingGap - 1e-6);
    expect(d).toBeGreaterThan(spacing.childGap * 0.05 + 1);
  });

  it("radial では branchLayouts を使わない", () => {
    const nodes = [node(1, null, 0, 0), node(2, 1, 900, 900)];
    const without = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      layoutStyle: "radial",
    })!;
    const withBranch = layoutNodeForest(nodes, {
      direction: "lr",
      spacing,
      layoutStyle: "radial",
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    })!;
    expect(withBranch.find((n) => n.id === 2)).toMatchObject({
      x: without.find((n) => n.id === 2)!.x,
      y: without.find((n) => n.id === 2)!.y,
    });
  });

  it("layoutSpacing の childGap / siblingGap が放射半径・弦に効く", () => {
    const nodes = [node(1, null, 0, 0), node(2, 1), node(3, 1)];
    const tight = layoutNodeForest(nodes, {
      direction: "lr",
      spacing: { childGap: 80, siblingGap: 40 },
      layoutStyle: "radial",
    })!;
    const wide = layoutNodeForest(nodes, {
      direction: "lr",
      spacing: { childGap: 200, siblingGap: 40 },
      layoutStyle: "radial",
    })!;
    const origin = center(tight.find((n) => n.id === 1)!);
    const tightR = dist(center(tight.find((n) => n.id === 2)!), origin);
    const wideR = dist(center(wide.find((n) => n.id === 2)!), origin);
    expect(wideR).toBeGreaterThan(tightR);
  });
});
