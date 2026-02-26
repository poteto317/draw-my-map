"use client";

import { useRects } from "@/hooks/useRects";
import { AppHeader } from "@/components/layout/AppHeader";
import { MapStage } from "@/components/map/MapStage";

export default function Home() {
  const { rects, addRect } = useRects();

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      <AppHeader />
      <main className="flex-1">
        <MapStage rects={rects} onDoubleClick={addRect} />
      </main>
    </div>
  );
}
