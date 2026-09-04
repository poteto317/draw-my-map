"use client";

import { useRef } from "react";
import type { Viewport } from "@/components/map/mapViewport";
import { worldToScreen } from "@/components/map/mapViewport";
import type { Node } from "@/types/node";

type NodeLabelEditorProps = {
  node: Node;
  viewport: Viewport;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export function NodeLabelEditor({ node, viewport, value, onChange, onCommit, onCancel }: NodeLabelEditorProps) {
  const actionHandledRef = useRef(false);

  const handleBlur = () => {
    if (actionHandledRef.current) return;
    actionHandledRef.current = true;
    onCommit();
  };

  const position = worldToScreen({ x: node.x, y: node.y }, viewport);
  const width = node.width * viewport.scale;
  const height = node.height * viewport.scale;

  return (
    <input
      data-testid="node-label-input"
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          actionHandledRef.current = true;
          onCancel();
        }
      }}
      onBlur={handleBlur}
      autoFocus
      className="absolute z-10 border-2 border-blue-500 bg-white px-2 text-center text-zinc-800 outline-none"
      style={{
        left: position.x,
        top: position.y,
        width,
        height,
        lineHeight: `${height}px`,
        fontSize: 14 * viewport.scale,
      }}
    />
  );
}
