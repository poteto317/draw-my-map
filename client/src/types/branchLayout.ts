// Phase 29・065。NodeMapState.branchLayouts（欠落＝空）。公開: useNodes.setBranchLayout
// ノード属性には載せない（文書級）。radial 中は配置に使わない（値保持）
// prune / remap / rewrite / append は domain/map/branchLayoutLifecycle
export type BranchLayoutDirection = "lr" | "rl" | "tb" | "bt";

export type BranchLayout = {
  nodeId: number;
  direction: BranchLayoutDirection;
};

const BRANCH_LAYOUT_DIRECTIONS = new Set<BranchLayoutDirection>(["lr", "rl", "tb", "bt"]);

function isBranchLayoutDirection(value: unknown): value is BranchLayoutDirection {
  return typeof value === "string" && BRANCH_LAYOUT_DIRECTIONS.has(value as BranchLayoutDirection);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function parseBranchLayout(
  raw: unknown,
  nodeIdSet: ReadonlySet<number>,
  seenNodeIds: ReadonlySet<number>,
): BranchLayout | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const { nodeId, direction } = record;
  if (!isPositiveSafeInteger(nodeId)) return null;
  if (!nodeIdSet.has(nodeId)) return null;
  if (seenNodeIds.has(nodeId)) return null;
  if (!isBranchLayoutDirection(direction)) return null;
  return { nodeId, direction };
}

// 不正エントリ・未知 direction・存在しない nodeId・同一 nodeId 重複は除去（先勝ち）。空は undefined
export function normalizeBranchLayouts(
  raw: unknown,
  nodeIdSet: ReadonlySet<number>,
): readonly BranchLayout[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed: BranchLayout[] = [];
  const seenNodeIds = new Set<number>();
  for (const entry of raw) {
    const layout = parseBranchLayout(entry, nodeIdSet, seenNodeIds);
    if (layout === null) continue;
    seenNodeIds.add(layout.nodeId);
    parsed.push(layout);
  }
  return parsed.length === 0 ? undefined : parsed;
}

export function projectBranchLayouts(
  layouts: readonly BranchLayout[] | undefined,
): { branchLayouts?: readonly BranchLayout[] } {
  return layouts === undefined || layouts.length === 0 ? {} : { branchLayouts: layouts };
}

export function areBranchLayoutsEqual(
  a: readonly BranchLayout[] | undefined,
  b: readonly BranchLayout[] | undefined,
): boolean {
  const left = [...(a ?? [])].sort((x, y) => x.nodeId - y.nodeId);
  const right = [...(b ?? [])].sort((x, y) => x.nodeId - y.nodeId);
  if (left.length !== right.length) return false;
  return left.every(
    (entry, index) =>
      entry.nodeId === right[index]!.nodeId && entry.direction === right[index]!.direction,
  );
}
