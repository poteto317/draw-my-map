"use client";

import { clampViewportScale, MAX_VIEWPORT_SCALE, MIN_VIEWPORT_SCALE } from "@/types/viewport";

export const ZOOM_FACTOR = 1.25;

const buttonClassName =
  "flex h-8 w-8 items-center justify-center rounded-md bg-white/90 text-lg leading-none text-zinc-800 shadow-sm transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-800/90 dark:text-zinc-100 dark:hover:bg-zinc-800";

type MapViewportZoomControlsProps = {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function MapViewportZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
}: MapViewportZoomControlsProps) {
  const zoomInDisabled = clampViewportScale(scale * ZOOM_FACTOR) === scale || scale >= MAX_VIEWPORT_SCALE;
  const zoomOutDisabled = clampViewportScale(scale / ZOOM_FACTOR) === scale || scale <= MIN_VIEWPORT_SCALE;

  return (
    <div
      role="group"
      aria-label="ズーム"
      className="pointer-events-auto absolute bottom-3 right-3 z-10 flex flex-col gap-1"
    >
      <button
        type="button"
        className={buttonClassName}
        aria-label="拡大"
        disabled={zoomInDisabled}
        onClick={onZoomIn}
      >
        +
      </button>
      <button
        type="button"
        className={buttonClassName}
        aria-label="縮小"
        disabled={zoomOutDisabled}
        onClick={onZoomOut}
      >
        −
      </button>
    </div>
  );
}