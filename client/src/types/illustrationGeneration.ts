export type IllustrationGenerationState =
  | { status: "idle" }
  | { status: "generating"; nodeId: number }
  | { status: "succeeded"; nodeId: number; dataUrl: string }
  | { status: "failed"; nodeId: number; message: string };
