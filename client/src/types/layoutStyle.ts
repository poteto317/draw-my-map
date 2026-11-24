// Phase 29・064。NodeMapState.layoutStyle（欠落＝orthogonal）。公開: useNodes.setLayoutStyle
export type LayoutStyle = "orthogonal" | "radial";

// 未知・欠落は undefined（文書既定＝orthogonal）。文書失敗にはしない
export function normalizeLayoutStyle(raw: unknown): LayoutStyle | undefined {
  if (raw === "orthogonal" || raw === "radial") return raw;
  return undefined;
}

export function projectLayoutStyle(
  style: LayoutStyle | undefined,
): { layoutStyle?: LayoutStyle } {
  if (style === "radial") return { layoutStyle: "radial" };
  return {};
}

export function areLayoutStylesEqual(
  a: LayoutStyle | undefined,
  b: LayoutStyle | undefined,
): boolean {
  return (a ?? "orthogonal") === (b ?? "orthogonal");
}
