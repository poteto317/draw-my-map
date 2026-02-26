import { useState } from "react";
import { RECT_WIDTH, RECT_HEIGHT } from "@/config/shapes";
import type { Rect } from "@/types/rect";

type UseRectsReturn = {
  rects: Rect[];
  addRect: (x: number, y: number) => void;
};

export function useRects(): UseRectsReturn {
  const [rects, setRects] = useState<Rect[]>([]);

  const addRect = (x: number, y: number) => {
    setRects((prev) => [
      ...prev,
      {
        id: Date.now(),
        x: x - RECT_WIDTH / 2,
        y: y - RECT_HEIGHT / 2,
        width: RECT_WIDTH,
        height: RECT_HEIGHT,
      },
    ]);
  };

  return { rects, addRect };
}
