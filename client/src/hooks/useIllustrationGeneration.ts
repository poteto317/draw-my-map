import { useCallback } from "react";

// イラスト生成の入口。画像生成APIとの連携は、Phase 7の後続項目で、この関数を置き換えて実装する。
export function useIllustrationGeneration() {
  const generateIllustration = useCallback((nodeId: number) => {
    void nodeId;
  }, []);

  return { generateIllustration };
}
