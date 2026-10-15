import type { ResolutionLevel } from "@/types/nodeResolution";

export const RESOLUTION_LEVEL_LABELS: Readonly<Record<ResolutionLevel, string>> = {
  high: "高のみ",
  medium: "中以上",
  all: "すべて",
};
