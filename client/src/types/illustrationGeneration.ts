// generating・succeeded の label は、生成を始めた時点のノードのテキスト（生の値）。
// ノードのテキストが変わったかを見分けるために持つ。
export type IllustrationGenerationState =
  | { status: "idle" }
  | { status: "generating"; nodeId: number; label: string }
  | { status: "succeeded"; nodeId: number; label: string; dataUrl: string }
  | { status: "failed"; nodeId: number; message: string };
