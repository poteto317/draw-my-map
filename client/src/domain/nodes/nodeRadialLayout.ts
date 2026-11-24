import type { IndexedNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import type { LayoutPoint } from "@/domain/nodes/nodeLayoutPlacement";
import { isLayoutPinned } from "@/domain/nodes/nodeLayoutPlacementShared";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { Node } from "@/types/node";

const TWO_PI = Math.PI * 2;
const FULL_CIRCLE_EPS = 1e-9;
const isPinned = isLayoutPinned;

/** 弦長比較用に偏角を [0, 2π) へ揃える（atan2 とセクタ角の ±π またぎを防ぐ） */
function normalizeAngleToTwoPi(angle: number): number {
  const mod = angle % TWO_PI;
  return mod < 0 ? mod + TWO_PI : mod;
}

function nodeCenter(node: Node, point?: LayoutPoint): { x: number; y: number } {
  const topLeft = point ?? { x: node.x, y: node.y };
  return { x: topLeft.x + node.width / 2, y: topLeft.y + node.height / 2 };
}

function topLeftFromCenter(
  node: Node,
  cx: number,
  cy: number,
): LayoutPoint {
  return { x: cx - node.width / 2, y: cy - node.height / 2 };
}

/**
 * 連続角（ソート済み）の弦長が siblingGap 以上になる最小半径。
 * wrapAround なら先頭・末尾も隣接とみなす。
 */
function radiusForSiblingGap(
  baseRadius: number,
  angles: readonly number[],
  siblingGap: number,
  wrapAround: boolean,
): number {
  if (angles.length < 2) return baseRadius;
  const sorted = angles.map(normalizeAngleToTwoPi).sort((a, b) => a - b);
  let minSep = Infinity;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    minSep = Math.min(minSep, sorted[i + 1]! - sorted[i]!);
  }
  if (wrapAround) {
    minSep = Math.min(minSep, TWO_PI - (sorted[sorted.length - 1]! - sorted[0]!));
  }
  if (!(minSep > FULL_CIRCLE_EPS) || !Number.isFinite(minSep)) {
    // 角が実質一致 → 有限半径では弦を満たせない。base を返して配置は続行（重なり許容に近い）
    return baseRadius;
  }
  // chord = 2 r sin(sep/2) >= siblingGap
  const needed = siblingGap / (2 * Math.sin(minSep / 2));
  if (!Number.isFinite(needed)) return baseRadius;
  return Math.max(baseRadius, needed);
}

type ChildPlacement = {
  child: Node;
  angle: number;
  pinned: boolean;
};

function placeChildrenRadial(
  parent: Node,
  parentPoint: LayoutPoint,
  forest: IndexedNodeForest,
  spacing: LayoutSpacing,
  sectorCenter: number,
  sectorWidth: number,
  positions: Map<number, LayoutPoint>,
): boolean {
  const children = forest.childrenByParent.get(parent.id) ?? [];
  if (children.length === 0) return true;

  const parentCenter = nodeCenter(parent, parentPoint);
  const n = children.length;
  // 子セクタ幅は兄弟総数（ピン含む）で等分。非ピンの配置角は非ピン数でセクタ内等分
  const childSectorWidth = sectorWidth / n;
  const sectorStart = sectorCenter - sectorWidth / 2;
  const wrapAround = sectorWidth >= TWO_PI - FULL_CIRCLE_EPS;

  const nonPinned = children.filter((child) => !isPinned(child));
  const nonPinnedCount = nonPinned.length;
  const nonPinnedSlot = nonPinnedCount === 0 ? 0 : sectorWidth / nonPinnedCount;

  const placements: ChildPlacement[] = [];
  let nonPinnedIndex = 0;
  for (const child of children) {
    if (isPinned(child)) {
      const pinCenter = nodeCenter(child);
      const reserved = Math.atan2(
        pinCenter.y - parentCenter.y,
        pinCenter.x - parentCenter.x,
      );
      placements.push({ child, angle: reserved, pinned: true });
      positions.set(child.id, { x: child.x, y: child.y });
    } else {
      // 文書順の非ピンをセクタ内で等角（中央寄せ）。フル円なら開始を sector に合わせる
      const angle = nonPinnedCount === 0
        ? sectorCenter
        : sectorStart + (nonPinnedIndex + 0.5) * nonPinnedSlot;
      nonPinnedIndex += 1;
      placements.push({ child, angle, pinned: false });
    }
  }

  // 弦長: ピンのノード box 中心角を予約角として含める（span 角は使わない）
  const chordAngles = placements.map((p) => p.angle);
  const radius = radiusForSiblingGap(
    spacing.childGap,
    chordAngles,
    spacing.siblingGap,
    wrapAround,
  );

  for (const placement of placements) {
    if (placement.pinned) continue;
    const cx = parentCenter.x + radius * Math.cos(placement.angle);
    const cy = parentCenter.y + radius * Math.sin(placement.angle);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
    positions.set(placement.child.id, topLeftFromCenter(placement.child, cx, cy));
  }

  for (const placement of placements) {
    const childPoint = positions.get(placement.child.id)!;
    // 各子のセクタ中心はその子の偏角。幅は兄弟総数等分
    if (!placeChildrenRadial(
      placement.child,
      childPoint,
      forest,
      spacing,
      placement.angle,
      childSectorWidth,
      positions,
    )) {
      return false;
    }
  }
  return true;
}

function placeRootsMulti(
  roots: readonly Node[],
  origin: { x: number; y: number },
  spacing: LayoutSpacing,
  positions: Map<number, LayoutPoint>,
): { sectorCenterByRootId: Map<number, number> } {
  const nonPinned = roots.filter((root) => !isPinned(root));
  const nonPinnedCount = nonPinned.length;
  const sectorCenterByRootId = new Map<number, number>();

  let nonPinnedIndex = 0;
  for (const root of roots) {
    if (isPinned(root)) {
      positions.set(root.id, { x: root.x, y: root.y });
      const c = nodeCenter(root);
      sectorCenterByRootId.set(
        root.id,
        Math.atan2(c.y - origin.y, c.x - origin.x),
      );
      continue;
    }
    const angle = nonPinnedCount === 0
      ? 0
      : (nonPinnedIndex * TWO_PI) / nonPinnedCount;
    nonPinnedIndex += 1;
    const cx = origin.x + spacing.childGap * Math.cos(angle);
    const cy = origin.y + spacing.childGap * Math.sin(angle);
    positions.set(root.id, topLeftFromCenter(root, cx, cy));
    sectorCenterByRootId.set(root.id, angle);
  }

  return { sectorCenterByRootId };
}

/**
 * 放射状配置。失敗時 null。
 * - 単一ルート: ルート中心が原点、ルート座標は維持
 * - 多ルート: 配置前ルート中心の幾何平均を C、非ピンは非ピン数で 360 等分（0=+X）
 * - 各ルートの子セクタ幅 = 360 / ルート総数（ピン含む）
 * - ピンは固定。同階層ピン兄弟の box 中心角は弦長の予約角
 */
export function calculateRadialPositions(
  nodes: readonly Node[],
  spacing: LayoutSpacing,
): ReadonlyMap<number, LayoutPoint> | null {
  const forest = indexNodeForest(nodes);
  if (!forest) return null;
  if (forest.nodes.length === 0) return new Map();

  const positions = new Map<number, LayoutPoint>();
  const { roots } = forest;

  if (roots.length === 1) {
    const root = roots[0]!;
    positions.set(root.id, { x: root.x, y: root.y });
    if (!placeChildrenRadial(
      root,
      positions.get(root.id)!,
      forest,
      spacing,
      0,
      TWO_PI,
      positions,
    )) {
      return null;
    }
    return positions;
  }

  let sumX = 0;
  let sumY = 0;
  for (const root of roots) {
    const c = nodeCenter(root);
    sumX += c.x;
    sumY += c.y;
  }
  const origin = { x: sumX / roots.length, y: sumY / roots.length };
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null;

  const sectorWidth = TWO_PI / roots.length;
  const { sectorCenterByRootId } = placeRootsMulti(roots, origin, spacing, positions);

  for (const root of roots) {
    const rootPoint = positions.get(root.id)!;
    const sectorCenter = sectorCenterByRootId.get(root.id) ?? 0;
    if (!placeChildrenRadial(
      root,
      rootPoint,
      forest,
      spacing,
      sectorCenter,
      sectorWidth,
      positions,
    )) {
      return null;
    }
  }

  return positions;
}
