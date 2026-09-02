"use client";

import { useRef } from "react";
import type { Node } from "@/types/node";

type NodeLabelEditorProps = {
  node: Node;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export function NodeLabelEditor({ node, value, onChange, onCommit, onCancel }: NodeLabelEditorProps) {
  const actionHandledRef = useRef(false);

  const handleBlur = () => {
    if (actionHandledRef.current) return;
    actionHandledRef.current = true;
    onCommit();
  };

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
      className="absolute z-10 border-2 border-blue-500 bg-white px-2 text-center text-sm text-zinc-800 outline-none"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        lineHeight: `${node.height}px`,
      }}
    />
  );
}
