"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Node } from "@/types/node";
import type { Application, Graphics as GraphicsType, Text as TextType, Container as ContainerType, FederatedPointerEvent } from "pixi.js";

const DRAG_THRESHOLD = 4;

type MapStageProps = {
  nodes: Node[];
  selectedNodeId: number | null;
  onDoubleClick: (x: number, y: number) => void;
  onAddChildNode: (parentId: number) => number | null;
  onAddSiblingNode: (nodeId: number) => number | null;
  onSelectNode: (id: number | null) => void;
  onUpdateLabel: (id: number, label: string) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
  onDeleteNode: (id: number) => void;
};

export function MapStage({ nodes, selectedNodeId, onDoubleClick, onAddChildNode, onAddSiblingNode, onSelectNode, onUpdateLabel, onMoveNode, onDeleteNode }: MapStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const GraphicsClassRef = useRef<typeof GraphicsType | null>(null);
  const TextClassRef = useRef<typeof TextType | null>(null);
  const ContainerClassRef = useRef<typeof ContainerType | null>(null);
  const [appReady, setAppReady] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  // 最新のコールバックを ref で保持（PixiJS イベント内で参照するため）
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const onMoveNodeRef = useRef(onMoveNode);
  onMoveNodeRef.current = onMoveNode;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // ドラッグ状態の管理
  const dragStateRef = useRef<{
    nodeId: number;
    startX: number;
    startY: number;
    nodeStartX: number;
    nodeStartY: number;
    dragging: boolean;
  } | null>(null);

  // PixiJS アプリの初期化
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const pixi = await import("pixi.js");
      if (cancelled) return;

      GraphicsClassRef.current = pixi.Graphics;
      TextClassRef.current = pixi.Text;
      ContainerClassRef.current = pixi.Container;

      const app = new pixi.Application();
      await app.init({
        backgroundAlpha: 0,
        resizeTo: containerRef.current!,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (cancelled) {
        app.destroy(true, { children: true, context: true });
        return;
      }

      // stage レベルのイベントを有効化（pointermove / pointerup の受信用）
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;

      app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
        if (e.target === app.stage) {
          onSelectNodeRef.current(null);
        }
      });

      app.stage.on("pointermove", (e: FederatedPointerEvent) => {
        const state = dragStateRef.current;
        if (!state) return;

        const dx = e.globalX - state.startX;
        const dy = e.globalY - state.startY;

        if (!state.dragging) {
          if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
          state.dragging = true;
        }

        onMoveNodeRef.current(state.nodeId, state.nodeStartX + dx, state.nodeStartY + dy);
      });

      app.stage.on("pointerup", () => {
        dragStateRef.current = null;
      });

      app.stage.on("pointerupoutside", () => {
        dragStateRef.current = null;
      });

      const canvas = app.canvas;
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      containerRef.current!.appendChild(canvas);
      appRef.current = app;
      setAppReady(true);
    })();

    return () => {
      cancelled = true;
      appRef.current?.destroy(true, { children: true, context: true });
      appRef.current = null;
      setAppReady(false);
    };
  }, []);

  // 選択中のノードをキーボードで作成・削除する
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNodeId !== null) return; // テキスト編集中は無視
      if (selectedNodeId === null) return;

      let createdNodeId: number | null = null;
      if (e.key === "Tab") {
        e.preventDefault();
        createdNodeId = onAddChildNode(selectedNodeId);
      } else if (e.key === "Enter") {
        e.preventDefault();
        createdNodeId = onAddSiblingNode(selectedNodeId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDeleteNode(selectedNodeId);
      }

      if (createdNodeId !== null) {
        setEditingNodeId(createdNodeId);
        setEditingText("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, editingNodeId, onAddChildNode, onAddSiblingNode, onDeleteNode]);

  // nodes の変化を PixiJS に反映
  useEffect(() => {
    const app = appRef.current;
    const Graphics = GraphicsClassRef.current;
    const TextClass = TextClassRef.current;
    const ContainerClass = ContainerClassRef.current;
    if (!app || !Graphics || !TextClass || !ContainerClass) return;

    const removedChildren = app.stage.removeChildren();
    for (const child of removedChildren) {
      child.destroy({ children: true, context: true });
    }

    let edgeGraphics: GraphicsType | null = null;

    for (const child of nodes) {
      if (child.parentId === null) continue;
      const parent = nodes.find((node) => node.id === child.parentId);
      if (!parent) continue;

      const startX = parent.x + parent.width;
      const startY = parent.y + parent.height / 2;
      const endX = child.x;
      const endY = child.y + child.height / 2;
      const controlX = (startX + endX) / 2;

      edgeGraphics ??= new Graphics();
      edgeGraphics
        .moveTo(startX, startY)
        .bezierCurveTo(controlX, startY, controlX, endY, endX, endY);
    }

    if (edgeGraphics) {
      edgeGraphics.stroke({ width: 2, color: 0x64748b });
      app.stage.addChild(edgeGraphics);
    }

    for (const node of nodes) {
      const isEditing = node.id === editingNodeId;
      const isSelected = node.id === selectedNodeId;
      const container = new ContainerClass();
      container.eventMode = "static";
      container.cursor = "pointer";

      container.on("pointerdown", (e: FederatedPointerEvent) => {
        onSelectNodeRef.current(node.id);
        const currentNode = nodesRef.current.find((n) => n.id === node.id);
        if (!currentNode) return;
        dragStateRef.current = {
          nodeId: node.id,
          startX: e.globalX,
          startY: e.globalY,
          nodeStartX: currentNode.x,
          nodeStartY: currentNode.y,
          dragging: false,
        };
      });

      const g = new Graphics();
      g.rect(node.x, node.y, node.width, node.height)
        .fill({ color: isSelected ? 0xeff6ff : 0xffffff })
        .stroke({ width: isSelected ? 3 : 2, color: isSelected ? 0x2563eb : 0x3b82f6 });
      container.addChild(g);

      if (!isEditing) {
        const displayLabel = node.label || "新しいノード";
        const text = new TextClass({
          text: displayLabel,
          style: {
            fontSize: 14,
            fill: 0x27272a,
            wordWrap: true,
            wordWrapWidth: node.width - 16,
            align: "center",
          },
        });
        text.anchor.set(0.5);
        text.x = node.x + node.width / 2;
        text.y = node.y + node.height / 2;
        container.addChild(text);
      }

      app.stage.addChild(container);
    }
  }, [nodes, selectedNodeId, editingNodeId, appReady]);

  const startEditing = useCallback(
    (nodeId: number) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setEditingNodeId(nodeId);
      setEditingText(node.label);
    },
    [nodes],
  );

  const commitEdit = useCallback(() => {
    if (editingNodeId !== null) {
      onUpdateLabel(editingNodeId, editingText);
      setEditingNodeId(null);
      setEditingText("");
    }
  }, [editingNodeId, editingText, onUpdateLabel]);

  const cancelEdit = useCallback(() => {
    setEditingNodeId(null);
    setEditingText("");
  }, []);

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bounds = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;

    const clickedNode = nodes.find(
      (n) => x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height,
    );

    if (clickedNode) {
      startEditing(clickedNode.id);
    } else {
      onDoubleClick(x, y);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const editingNode = editingNodeId !== null ? nodes.find((n) => n.id === editingNodeId) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-crosshair"
      style={{ minHeight: "calc(100vh - 52px)" }}
      onDoubleClick={handleDoubleClick}
    >
      {editingNode && (
        <input
          data-testid="node-label-input"
          type="text"
          value={editingText}
          onChange={(e) => setEditingText(e.target.value)}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={handleInputKeyDown}
          onBlur={commitEdit}
          autoFocus
          className="absolute z-10 border-2 border-blue-500 bg-white px-2 text-center text-sm text-zinc-800 outline-none"
          style={{
            left: editingNode.x,
            top: editingNode.y,
            width: editingNode.width,
            height: editingNode.height,
            lineHeight: `${editingNode.height}px`,
          }}
        />
      )}
    </div>
  );
}
