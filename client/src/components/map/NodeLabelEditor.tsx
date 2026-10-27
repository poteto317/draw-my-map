"use client";

import { useRef } from "react";
import type { Viewport } from "@/components/map/mapViewport";
import { getNodeLabelEditorLayout } from "@/components/map/nodeLabelEditorLayout";
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

  const layout = getNodeLabelEditorLayout(node, viewport);

  return (
    <input
      data-testid="node-label-input"
      type="text"
      aria-label="ノードのラベル"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        // 入力欄が開く前から押し続けていた Enter のリピートで確定しない（押し続けで追加と確定が繰り返されるのを防ぐ）
        if (event.key === "Enter" && event.repeat) {
          event.preventDefault();
          return;
        }
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
      style={layout}
    />
  );
}
