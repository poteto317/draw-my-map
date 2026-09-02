# Single-Responsibility Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor every responsibility-mixed area changed from `main` into focused, independently tested units without changing public APIs or user-visible behavior.

**Architecture:** `MapStage` becomes a composition boundary over focused editing, keyboard, geometry, PixiJS lifecycle, rendering, and pointer-interaction units. `useNodes` remains the public React state hook while delegating placement and subtree discovery to pure domain functions.

**Tech Stack:** TypeScript 5, React 19, Next.js 16, PixiJS 8, Jest 30, Testing Library, ESLint, Tailwind CSS CLI

**Spec:** `docs/superpowers/specs/2026-08-31-single-responsibility-refactor-design.md`

## Global Constraints

- Scope is `main...codex/phase2-keyboard-nodes`; do not refactor unrelated files.
- Preserve `MapStageProps`, `UseNodesReturn`, dimensions, spacing, colors, labels, edge geometry, keyboard bindings, and interaction behavior.
- Add no dependency and no out-of-scope feature.
- Placement updates must use the latest functional `prev` state.
- Follow RED → GREEN → adjacent regression tests for every extraction.
- Do not create any git commit automatically. Commit steps are intentionally omitted.

## Locked File Map

**Create:**

- `client/src/domain/nodes/nodePlacement.ts` — pure construction and placement.
- `client/src/domain/nodes/__tests__/nodePlacement.test.ts` — placement unit tests.
- `client/src/domain/nodes/nodeIdGenerator.ts` — monotonic ID generation policy.
- `client/src/domain/nodes/__tests__/nodeIdGenerator.test.ts` — ID policy unit tests.
- `client/src/domain/nodes/nodeTree.ts` — pure subtree traversal.
- `client/src/domain/nodes/__tests__/nodeTree.test.ts` — traversal unit tests.
- `client/src/components/map/mapGeometry.ts` — point, hit, and edge calculations.
- `client/src/components/map/__tests__/mapGeometry.test.ts` — geometry unit tests.
- `client/src/components/map/pixi/pixiTypes.ts` — shared Pixi contracts.
- `client/src/components/map/pixi/clearMapScene.ts` — previous-projection cleanup.
- `client/src/components/map/pixi/renderMapEdges.ts` — edge projection.
- `client/src/components/map/pixi/renderMapNodes.ts` — node projection.
- `client/src/components/map/pixi/renderMapScene.ts` — scene projection ordering.
- `client/src/components/map/pixi/stageInteractions.ts` — Pixi selection and dragging.
- `client/src/components/map/pixi/usePixiApplication.ts` — Pixi lifecycle.
- `client/src/components/map/pixi/testing/pixiTestHarness.ts` — shared mock fixture kept outside `__tests__` to avoid Jest empty-suite discovery.
- `client/src/components/map/pixi/__tests__/renderMapScene.test.ts` — renderer tests.
- `client/src/components/map/pixi/__tests__/clearMapScene.test.ts` — cleanup tests.
- `client/src/components/map/pixi/__tests__/renderMapEdges.test.ts` — edge tests.
- `client/src/components/map/pixi/__tests__/renderMapNodes.test.ts` — node tests.
- `client/src/components/map/pixi/__tests__/stageInteractions.test.ts` — pointer tests.
- `client/src/components/map/pixi/__tests__/usePixiApplication.test.tsx` — lifecycle tests.
- `client/src/components/map/useNodeEditing.ts` — editing state transitions.
- `client/src/components/map/__tests__/useNodeEditing.test.ts` — editing-hook tests.
- `client/src/components/map/NodeLabelEditor.tsx` — label input presentation.
- `client/src/components/map/__tests__/NodeLabelEditor.test.tsx` — editor tests.
- `client/src/components/map/useNodeKeyboardShortcuts.ts` — keyboard routing.
- `client/src/components/map/__tests__/useNodeKeyboardShortcuts.test.tsx` — shortcut tests.

**Modify:**

- `client/src/hooks/useNodes.ts` — delegate deterministic domain work.
- `client/src/hooks/__tests__/useNodes.test.ts` — retain public hook contracts.
- `client/src/components/map/MapStage.tsx` — compose extracted units.
- `client/src/components/map/__tests__/MapStage.test.tsx` — retain boundary integration.

**Review without structural changes:**

- `client/src/app/page.tsx`
- `client/src/config/shapes.ts`
- `client/src/types/node.ts`
- `ROADMAP.md`
- `docs/backlog/phase1-node-basics.md`

---

### Task 1: Extract Pure Node Placement

**Files:**
- Create: `client/src/domain/nodes/nodePlacement.ts`
- Create: `client/src/domain/nodes/__tests__/nodePlacement.test.ts`

**Interfaces:**
- Consumes: `Node` and existing shape/spacing constants.
- Produces:
  - `createRootNode(id: number, centerX: number, centerY: number): Node`
  - `createChildNode(nodes: readonly Node[], parentId: number, id: number): Node | null`
  - `createSiblingNode(nodes: readonly Node[], sourceId: number, id: number): Node | null`

- [ ] **Step 1: Write failing placement tests**

Cover root centering, first child, lowest-of-several child placement independent of array order, missing parent, sibling, root sibling, missing source, fixed dimensions, and empty initial label.

```ts
expect(createRootNode(10, 200, 150)).toEqual({
  id: 10, parentId: null,
  x: 200 - RECT_WIDTH / 2,
  y: 150 - RECT_HEIGHT / 2,
  width: RECT_WIDTH, height: RECT_HEIGHT, label: "",
});
expect(createChildNode([parent], parent.id, 2)).toMatchObject({
  id: 2,
  parentId: parent.id,
  x: parent.x + parent.width + CHILD_HORIZONTAL_GAP,
  y: parent.y,
});
expect(createChildNode([parent], 999, 2)).toBeNull();
expect(createSiblingNode([parent], 999, 2)).toBeNull();
```

Use siblings at `y = 310` and `y = 170` in reverse visual order. Expect `310 + RECT_HEIGHT + SIBLING_VERTICAL_GAP`.

- [ ] **Step 2: Verify RED**

Run from `client/`:

```bash
npm test -- --runInBand src/domain/nodes/__tests__/nodePlacement.test.ts
```

Expected: FAIL because the placement module does not exist.

- [ ] **Step 3: Implement the minimum pure functions**

```ts
function createNode(id: number, parentId: number | null, x: number, y: number): Node {
  return { id, parentId, x, y, width: RECT_WIDTH, height: RECT_HEIGHT, label: "" };
}

export function createRootNode(id: number, centerX: number, centerY: number): Node {
  return createNode(id, null, centerX - RECT_WIDTH / 2, centerY - RECT_HEIGHT / 2);
}
```

`createChildNode` aligns the first child with its parent and puts later children below the greatest `y + height`. `createSiblingNode` includes the source among candidates and preserves `source.parentId` and `source.x`.

```ts
export function createChildNode(nodes: readonly Node[], parentId: number, id: number): Node | null {
  const parent = nodes.find((node) => node.id === parentId);
  if (!parent) return null;
  const siblings = nodes.filter((node) => node.parentId === parentId);
  const y = siblings.length === 0
    ? parent.y
    : Math.max(...siblings.map((node) => node.y + node.height)) + SIBLING_VERTICAL_GAP;
  return createNode(id, parentId, parent.x + parent.width + CHILD_HORIZONTAL_GAP, y);
}

export function createSiblingNode(nodes: readonly Node[], sourceId: number, id: number): Node | null {
  const source = nodes.find((node) => node.id === sourceId);
  if (!source) return null;
  const siblings = nodes.filter((node) => node.parentId === source.parentId);
  const y = Math.max(...siblings.map((node) => node.y + node.height)) + SIBLING_VERTICAL_GAP;
  return createNode(id, source.parentId, source.x, y);
}
```

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- --runInBand src/domain/nodes/__tests__/nodePlacement.test.ts
npm run typecheck
```

Expected: PASS.

---

### Task 2: Extract Map Geometry

**Files:**
- Create: `client/src/components/map/mapGeometry.ts`
- Create: `client/src/components/map/__tests__/mapGeometry.test.ts`

**Interfaces:**
- Produces:
  - `type Point = { x: number; y: number }`
  - `type EdgeCurve = { start: Point; control1: Point; control2: Point; end: Point }`
  - `toLocalPoint(clientX: number, clientY: number, bounds: Pick<DOMRect, "left" | "top">): Point`
  - `findNodeAtPoint(nodes: readonly Node[], point: Point): Node | undefined`
  - `getEdgeCurve(parent: Node, child: Node): EdgeCurve`

- [ ] **Step 1: Write failing geometry tests**

```ts
expect(toLocalPoint(310, 220, { left: 100, top: 50 })).toEqual({ x: 210, y: 170 });
expect(findNodeAtPoint([target], { x: target.x, y: target.y })).toBe(target);
expect(findNodeAtPoint([target], {
  x: target.x + target.width,
  y: target.y + target.height,
})).toBe(target);
expect(findNodeAtPoint([target], { x: target.x - 1, y: target.y })).toBeUndefined();
expect(getEdgeCurve(parent, child)).toEqual({
  start: { x: 150, y: 60 },
  control1: { x: 210, y: 60 },
  control2: { x: 210, y: 120 },
  end: { x: 270, y: 120 },
});
```

Test all four inclusive rectangle boundaries and differing parent/child y-coordinates.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --runInBand src/components/map/__tests__/mapGeometry.test.ts
```

Expected: FAIL because the geometry module does not exist.

- [ ] **Step 3: Implement pure geometry**

```ts
export function toLocalPoint(clientX: number, clientY: number, bounds: Pick<DOMRect, "left" | "top">): Point {
  return { x: clientX - bounds.left, y: clientY - bounds.top };
}

export function findNodeAtPoint(nodes: readonly Node[], point: Point): Node | undefined {
  return nodes.find((node) =>
    point.x >= node.x && point.x <= node.x + node.width
    && point.y >= node.y && point.y <= node.y + node.height
  );
}
```

For `getEdgeCurve`, use the parent right-center, child left-center, and midpoint `controlX`.

```ts
export function getEdgeCurve(parent: Node, child: Node): EdgeCurve {
  const start = { x: parent.x + parent.width, y: parent.y + parent.height / 2 };
  const end = { x: child.x, y: child.y + child.height / 2 };
  const controlX = (start.x + end.x) / 2;
  return {
    start,
    control1: { x: controlX, y: start.y },
    control2: { x: controlX, y: end.y },
    end,
  };
}
```

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- --runInBand src/components/map/__tests__/mapGeometry.test.ts
npm run typecheck
```

Expected: PASS.

---

### Task 3: Extract Pixi Scene Projection

**Files:**
- Create: `client/src/components/map/pixi/renderMapScene.ts`
- Create: `client/src/components/map/pixi/testing/pixiTestHarness.ts` outside `__tests__` to avoid Jest empty-suite discovery.
- Create: `client/src/components/map/pixi/__tests__/renderMapScene.test.ts`

**Interfaces:**
- Consumes a Pixi `Application`, `Graphics`/`Text`/`Container` constructors, nodes, selected ID, editing ID, and `onNodePointerDown`.
- Initially produces `RenderMapSceneOptions` and
  `renderMapScene(app, constructors, options): void`. The post-review split in Task
  12 moves shared contracts and projection details into focused units while
  preserving this entry point.

- [ ] **Step 1: Create the reusable Pixi test fixture**

Build an observable stage and fluent constructor mocks. The fixture contains no test blocks.

```ts
export function createPixiTestHarness() {
  const children: unknown[] = [];
  const stage = {
    removeChildren: jest.fn(() => children.splice(0)),
    addChild: jest.fn((child: unknown) => children.push(child)),
  };
  const Graphics = jest.fn().mockImplementation(() => ({
    rect: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    bezierCurveTo: jest.fn().mockReturnThis(),
    destroy: jest.fn(),
  }));
  return { children, stage, Graphics };
}
```

The returned fixture shape must also include `Text`, `Container`, `constructors`, `app`, and `containerHandlers`. `Container` stores each registered callback in `containerHandlers`, while `Text` exposes `anchor.set`, `x`, and `y`; this is the only shared mock contract used by renderer tests.

- [ ] **Step 2: Write failing scene tests**

Cover empty nodes, rectangle/text creation, default label, selected styling, hidden text while editing, pointer registration, valid edge geometry/order, orphan skipping, current-coordinate rerender, and destruction of every removed child.

```ts
renderMapScene(app, constructors, {
  nodes: connectedNodes,
  selectedNodeId: 1,
  editingNodeId: null,
  onNodePointerDown,
});
expect(stage.addChild).toHaveBeenCalledTimes(3);
expect(stage.addChild.mock.calls[0][0]).toBe(edgeGraphics);
expect(edgeGraphics.moveTo).toHaveBeenCalledWith(150, 60);
expect(edgeGraphics.bezierCurveTo).toHaveBeenCalledWith(210, 60, 210, 60, 270, 60);
```

- [ ] **Step 3: Verify RED**

```bash
npm test -- --runInBand src/components/map/pixi/__tests__/renderMapScene.test.ts
```

Expected: FAIL because the renderer does not exist.

- [ ] **Step 4: Implement scene projection**

Destroy `app.stage.removeChildren()` results with `{ children: true, context: true }`. Use Task 2 `getEdgeCurve`. Lazily create one edge graphic only after the first valid relationship, stroke once, and add it before nodes. Move the existing node colors, stroke widths, text wrapping, anchor, and positions without visual changes.

```ts
for (const child of app.stage.removeChildren()) {
  child.destroy({ children: true, context: true });
}

let edges: Graphics | null = null;
for (const child of options.nodes) {
  if (child.parentId === null) continue;
  const parent = options.nodes.find((node) => node.id === child.parentId);
  if (!parent) continue;
  const curve = getEdgeCurve(parent, child);
  edges ??= new constructors.Graphics();
  edges.moveTo(curve.start.x, curve.start.y).bezierCurveTo(
    curve.control1.x, curve.control1.y,
    curve.control2.x, curve.control2.y,
    curve.end.x, curve.end.y,
  );
}
if (edges) {
  edges.stroke({ width: 2, color: 0x64748b });
  app.stage.addChild(edges);
}
```

After the edge block, create one container per node, register `pointerdown` as `(event) => options.onNodePointerDown(node.id, event)`, and copy the existing rectangle and text construction verbatim.

- [ ] **Step 5: Verify renderer and geometry**

```bash
npm test -- --runInBand src/components/map/pixi/__tests__/renderMapScene.test.ts src/components/map/__tests__/mapGeometry.test.ts
npm run typecheck
```

Expected: PASS.

---

### Task 4: Extract Pixi Stage Interactions

**Files:**
- Create: `client/src/components/map/pixi/stageInteractions.ts`
- Create: `client/src/components/map/pixi/__tests__/stageInteractions.test.ts`

**Interfaces:**
- Produces `LatestValue<T> = { readonly current: T }` and `createStageInteractions(options)`.
- The controller returns `bind(stage): () => void` and `handleNodePointerDown(nodeId, event): void`.

```ts
type StageInteractionOptions = {
  nodesRef: LatestValue<readonly Node[]>;
  onSelectNodeRef: LatestValue<(id: number | null) => void>;
  onMoveNodeRef: LatestValue<(id: number, x: number, y: number) => void>;
  dragThreshold?: number;
};
```

- [ ] **Step 1: Write failing direct interaction tests**

Use a fake stage with `on`/`off` handler maps. Cover direct-stage selection clearing, non-stage targets, node selection, latest position lookup, below-threshold movement, threshold crossing, displacement, latest callback use, missing nodes, both pointer-up variants, and listener removal.

```ts
controller.handleNodePointerDown(1, pointer(100, 60));
handlers.pointermove(pointer(103, 63));
expect(onMoveNode).not.toHaveBeenCalled();
handlers.pointermove(pointer(104, 64));
expect(onMoveNode).toHaveBeenCalledWith(1, node.x + 4, node.y + 4);
cleanup();
expect(stage.off).toHaveBeenCalledWith("pointermove", handlers.pointermove);
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --runInBand src/components/map/pixi/__tests__/stageInteractions.test.ts
```

Expected: FAIL because the interaction controller does not exist.

- [ ] **Step 3: Implement closure-owned drag state**

Default the threshold to `4`. Select first on node pointer-down, then capture pointer/node origins from `nodesRef.current`. Begin moving when either absolute delta reaches the threshold. Read callback refs at invocation time. `bind` registers direct-stage down, move, up, and up-outside handlers and returns exact `off` calls for all four.

```ts
const handlePointerMove = (event: FederatedPointerEvent) => {
  if (!dragState) return;
  const dx = event.globalX - dragState.startX;
  const dy = event.globalY - dragState.startY;
  if (!dragState.dragging) {
    if (Math.abs(dx) < dragThreshold && Math.abs(dy) < dragThreshold) return;
    dragState.dragging = true;
  }
  onMoveNodeRef.current(
    dragState.nodeId,
    dragState.nodeStartX + dx,
    dragState.nodeStartY + dy,
  );
};
```

Both up handlers assign `dragState = null`. Cleanup calls `stage.off` with the same four handler references used by `stage.on`.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- --runInBand src/components/map/pixi/__tests__/stageInteractions.test.ts
npm run typecheck
```

Expected: PASS.

---

### Task 5: Extract Pixi Application Lifecycle

**Files:**
- Create: `client/src/components/map/pixi/usePixiApplication.ts`
- Create: `client/src/components/map/pixi/__tests__/usePixiApplication.test.tsx`

**Interfaces:**
- Consumes `RefObject<HTMLDivElement | null>`.
- Produces `PixiRuntime = { app: Application; constructors: PixiConstructors }` and `usePixiApplication(containerRef): PixiRuntime | null`.

- [ ] **Step 1: Write failing lifecycle tests**

Mock `pixi.js`. Cover successful initialization/canvas insertion, exact init options, absolute positioning, zero-DPR fallback, unmount after readiness, unmount during pending init, and unmount before import continuation.

```ts
expect(mockInit).toHaveBeenCalledWith({
  backgroundAlpha: 0,
  resizeTo: container,
  antialias: true,
  resolution: window.devicePixelRatio || 1,
  autoDensity: true,
});
expect(container).toContainElement(canvas);
expect(canvas.style.position).toBe("absolute");
expect(canvas.style.inset).toBe("0px");
```

For pending init, resolve a deferred promise after unmount and expect exactly one `destroy(true, { children: true, context: true })` call.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --runInBand src/components/map/pixi/__tests__/usePixiApplication.test.tsx
```

Expected: FAIL because the lifecycle hook does not exist.

- [ ] **Step 3: Implement cancellation-safe initialization**

Use one effect, `cancelled`, and `destroyed` flags. Do not construct after an already-cancelled import. Await `init`; if cancelled, destroy once and do not append/publish. Otherwise style/append the canvas and publish `{ app, constructors }`. Cleanup destroys a ready app once; the async continuation owns destruction when init is still pending.

```ts
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;
  let cancelled = false;
  let initialized = false;
  let destroyed = false;
  let app: Application | null = null;
  const destroy = () => {
    if (app && !destroyed) {
      destroyed = true;
      app.destroy(true, { children: true, context: true });
    }
  };

  void (async () => {
    const pixi = await import("pixi.js");
    if (cancelled) return;
    const createdApp = new pixi.Application();
    app = createdApp;
    await createdApp.init({
      backgroundAlpha: 0,
      resizeTo: container,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    initialized = true;
    if (cancelled) return destroy();
    createdApp.canvas.style.position = "absolute";
    createdApp.canvas.style.inset = "0";
    container.appendChild(createdApp.canvas);
    setRuntime({
      app: createdApp,
      constructors: {
        Graphics: pixi.Graphics,
        Text: pixi.Text,
        Container: pixi.Container,
      },
    });
  })();

  return () => {
    cancelled = true;
    if (initialized) destroy();
  };
}, [containerRef]);
```

- [ ] **Step 4: Verify lifecycle behavior**

```bash
npm test -- --runInBand src/components/map/pixi/__tests__/usePixiApplication.test.tsx
npm run typecheck
```

Expected: PASS without state-update-after-unmount warnings.

### Task 6: Extract Editing State and Editor Presentation

**Files:**
- Create: `client/src/components/map/useNodeEditing.ts`
- Create: `client/src/components/map/__tests__/useNodeEditing.test.ts`
- Create: `client/src/components/map/NodeLabelEditor.tsx`
- Create: `client/src/components/map/__tests__/NodeLabelEditor.test.tsx`

**Interfaces:**
- `useNodeEditing(nodes, onUpdateLabel)` returns `editingNodeId`, `editingNode`, `editingText`, `setEditingText`, `startEditing`, `commitEditing`, and `cancelEditing`.
- `startEditing(nodeId: number, initialText?: string): void` loads the current label when text is omitted and uses supplied text directly otherwise.
- `NodeLabelEditor` receives `node`, `value`, `onChange`, `onCommit`, and `onCancel`.

- [ ] **Step 1: Write failing editing-hook tests**

Cover existing-label start, supplied empty draft, missing-node no-op without supplied text, commit callback and reset, and cancellation without callback.

```ts
act(() => result.current.startEditing(1));
expect(result.current.editingText).toBe("既存ラベル");
act(() => result.current.setEditingText("更新"));
act(() => result.current.commitEditing());
expect(onUpdateLabel).toHaveBeenCalledWith(1, "更新");
expect(result.current.editingNodeId).toBeNull();
```

- [ ] **Step 2: Verify hook RED**

```bash
npm test -- --runInBand src/components/map/__tests__/useNodeEditing.test.ts
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement editing transitions**

Use `useState`; derive `editingNode` from current nodes. `commitEditing` calls the update callback only for a non-null ID and then resets ID/text. `cancelEditing` only resets. `startEditing` without explicit text first finds the node and no-ops when absent.

```ts
const startEditing = useCallback((nodeId: number, initialText?: string) => {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (initialText === undefined && !node) return;
  setEditingNodeId(nodeId);
  setEditingText(initialText ?? node!.label);
}, [nodes]);
```

- [ ] **Step 4: Write failing editor component tests**

```tsx
render(<NodeLabelEditor
  node={node}
  value="下書き"
  onChange={onChange}
  onCommit={onCommit}
  onCancel={onCancel}
/>);
const input = screen.getByTestId("node-label-input");
fireEvent.change(input, { target: { value: "変更" } });
expect(onChange).toHaveBeenCalledWith("変更");
fireEvent.keyDown(input, { key: "Enter" });
expect(onCommit).toHaveBeenCalledTimes(1);
```

Also test blur commit, Escape cancel, unrelated keys, stopped double-click propagation, autofocus, and exact position/size styles.

- [ ] **Step 5: Verify component RED**

```bash
npm test -- --runInBand src/components/map/__tests__/NodeLabelEditor.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 6: Move the input markup unchanged**

Use the existing test ID, classes, absolute style, and `autoFocus`. Map Enter to `onCommit`, Escape to `onCancel`, blur to `onCommit`, change to `onChange(event.target.value)`, and double-click to `stopPropagation()`.

- [ ] **Step 7: Verify both editing units**

```bash
npm test -- --runInBand src/components/map/__tests__/useNodeEditing.test.ts src/components/map/__tests__/NodeLabelEditor.test.tsx
npm run typecheck
```

Expected: PASS.

---

### Task 7: Extract Keyboard Command Routing

**Files:**
- Create: `client/src/components/map/useNodeKeyboardShortcuts.ts`
- Create: `client/src/components/map/__tests__/useNodeKeyboardShortcuts.test.tsx`

**Interfaces:**
- Consumes `selectedNodeId`, `isEditing`, existing add/delete callbacks, and `onStartEditing(nodeId: number, initialText: string)`.
- Produces `useNodeKeyboardShortcuts(options): void`.

- [ ] **Step 1: Write failing shortcut tests**

Cover Tab, Enter, Delete, Backspace, no selection, editing suppression, null creation result, prevent-default behavior, and listener removal on unmount.

```ts
const event = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
window.dispatchEvent(event);
expect(event.defaultPrevented).toBe(true);
expect(onAddChildNode).toHaveBeenCalledWith(1);
expect(onStartEditing).toHaveBeenCalledWith(2, "");
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --runInBand src/components/map/__tests__/useNodeKeyboardShortcuts.test.tsx
```

Expected: FAIL because the shortcut hook does not exist.

- [ ] **Step 3: Implement one effect-scoped listener**

Return early for editing or null selection. Prevent default only for handled keys. Tab calls child creation, Enter calls sibling creation, Delete/Backspace call deletion, and only a non-null created ID starts editing. Remove the identical listener function in effect cleanup.

```ts
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (isEditing || selectedNodeId === null) return;
    let createdId: number | null = null;
    if (event.key === "Tab") {
      event.preventDefault();
      createdId = onAddChildNode(selectedNodeId);
    } else if (event.key === "Enter") {
      event.preventDefault();
      createdId = onAddSiblingNode(selectedNodeId);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDeleteNode(selectedNodeId);
    }
    if (createdId !== null) onStartEditing(createdId, "");
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [
  selectedNodeId, isEditing, onAddChildNode, onAddSiblingNode,
  onDeleteNode, onStartEditing,
]);
```

- [ ] **Step 4: Verify unit and legacy integration coverage**

```bash
npm test -- --runInBand src/components/map/__tests__/useNodeKeyboardShortcuts.test.tsx src/components/map/__tests__/MapStage.test.tsx
npm run typecheck
```

Expected: PASS; `MapStage` is not rewired until Task 10.

---

### Task 8: Extract Safe Subtree Traversal

**Files:**
- Create: `client/src/domain/nodes/nodeTree.ts`
- Create: `client/src/domain/nodes/__tests__/nodeTree.test.ts`

**Interfaces:**
- Produces: `collectSubtreeIds(nodes: readonly Node[], rootId: number): Set<number>`.

- [ ] **Step 1: Write failing traversal tests**

Cover no descendants, a deep chain, branching, unrelated roots, an orphan, and a malformed cycle.

```ts
expect(collectSubtreeIds([], 10)).toEqual(new Set([10]));
expect(collectSubtreeIds([
  node(1, null), node(2, 1), node(3, 2), node(4, 1), node(9, null),
], 1)).toEqual(new Set([1, 2, 3, 4]));
expect(collectSubtreeIds([
  node(1, 3), node(2, 1), node(3, 2),
], 1)).toEqual(new Set([1, 2, 3]));
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- --runInBand src/domain/nodes/__tests__/nodeTree.test.ts
```

Expected: FAIL because the tree module does not exist.

- [ ] **Step 3: Implement iterative traversal**

```ts
export function collectSubtreeIds(nodes: readonly Node[], rootId: number): Set<number> {
  const ids = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId !== null && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }
  return ids;
}
```

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- --runInBand src/domain/nodes/__tests__/nodeTree.test.ts
npm run typecheck
```

Expected: PASS, including finite completion for cyclic input.

---

### Task 9: Make `useNodes` a State Orchestrator

**Files:**
- Modify: `client/src/hooks/useNodes.ts`
- Modify: `client/src/hooks/__tests__/useNodes.test.ts`

**Interfaces:**
- Consumes: Task 1 placement functions and Task 8 traversal.
- Produces: unchanged `UseNodesReturn` behavior.

- [ ] **Step 1: Establish the characterization baseline**

```bash
npm test -- --runInBand src/hooks/__tests__/useNodes.test.ts
```

Expected: PASS before changing production code.

- [ ] **Step 2: Delegate construction and traversal**

```ts
const generateNodeIdRef = useRef<(() => number) | null>(null);
generateNodeIdRef.current ??= createMonotonicIdGenerator();
const generateNodeId = generateNodeIdRef.current;

const addNode = (x: number, y: number) => {
  const id = generateNodeId();
  setNodes((prev) => [...prev, createRootNode(id, x, y)]);
  return id;
};

const addChildNode = useCallback((parentId: number) => {
  if (!nodes.some((node) => node.id === parentId)) return null;
  const id = generateNodeId();
  setNodes((prev) => {
    const child = createChildNode(prev, parentId, id);
    return child ? [...prev, child] : prev;
  });
  setSelectedNodeId(id);
  return id;
}, [nodes]);
```

Apply the same functional pattern to siblings. Import `collectSubtreeIds` and delete its local implementation. Keep update, movement, selection, deletion, return IDs, and missing-source results unchanged.

- [ ] **Step 3: Refocus hook tests**

Keep tests for initial state, IDs, accumulation, selection, label update, movement, recursive deletion, selection clearing, missing sources, and same-batch additions. Remove duplicate geometry matrices now covered by Task 1, but retain one child and one sibling integration assertion.

- [ ] **Step 4: Verify the domain and hook boundary**

```bash
npm test -- --runInBand src/domain/nodes src/hooks/__tests__/useNodes.test.ts
npm run typecheck
```

Expected: PASS.

---

### Task 10: Recompose `MapStage`

**Files:**
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- Consumes Tasks 2–7.
- Produces the unchanged `MapStage` component and props contract.

- [ ] **Step 1: Lock boundary-level characterization coverage**

Keep tests for container rendering, relative blank double-click, node double-click editing, draft preservation, real `useNodes` Tab/Enter creation and editing, no-selection suppression, and editing suppression. Before deleting a legacy assertion, confirm its replacement unit test passes. Move lifecycle, scene, drag, geometry, keyboard-routing, and input-only assertions to their focused suites.

- [ ] **Step 2: Run the pre-rewire map baseline**

```bash
npm test -- --runInBand src/components/map
```

Expected: PASS.

- [ ] **Step 3: Rewrite `MapStage` as composition**

Retain only refs, focused hook composition, scene effects, double-click routing, and the editor component.

```ts
const containerRef = useRef<HTMLDivElement>(null);
const runtime = usePixiApplication(containerRef);
const editing = useNodeEditing(nodes, onUpdateLabel);

const nodesRef = useRef<readonly Node[]>(nodes);
nodesRef.current = nodes;
const onSelectNodeRef = useRef(onSelectNode);
onSelectNodeRef.current = onSelectNode;
const onMoveNodeRef = useRef(onMoveNode);
onMoveNodeRef.current = onMoveNode;
```

Create the stage interaction controller once from these refs. Bind it when runtime exists and return its cleanup. Project the scene when runtime, nodes, selection, or editing ID changes. Call the shortcut hook with `editing.editingNodeId !== null` and `editing.startEditing`.

```ts
const point = toLocalPoint(e.clientX, e.clientY, container.getBoundingClientRect());
const clickedNode = findNodeAtPoint(nodes, point);
if (clickedNode) editing.startEditing(clickedNode.id);
else onDoubleClick(point.x, point.y);
```

Render `NodeLabelEditor` only for `editing.editingNode`. Remove embedded Pixi construction, scene loops, drag state, global key listeners, and input markup.

- [ ] **Step 4: Run all map tests**

```bash
npm test -- --runInBand src/components/map
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Check responsibility boundaries mechanically**

```bash
rg -n 'new (Graphics|Text|Container)|bezierCurveTo|pointermove|addEventListener\("keydown"|<input' src/components/map/MapStage.tsx
rg -n 'function collectSubtreeIds|Math\.max|CHILD_HORIZONTAL_GAP|SIBLING_VERTICAL_GAP' src/hooks/useNodes.ts
```

Expected: no matches. Imports and calls to extracted modules are allowed.

---

### Task 11: Audit and Verify the Complete Refactor

**Files:**
- Review every path from `git diff --name-status main...HEAD`.
- Modify only if verification finds an in-scope responsibility or test defect.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified, uncommitted working tree.

- [ ] **Step 1: Re-run the changed-file inventory**

```bash
git diff --name-status main...HEAD
git status --short
```

Confirm every production file changed from `main` is either refactored or listed as intentionally unchanged. Confirm the spec, plan, modules, and tests remain uncommitted.

- [ ] **Step 2: Run all tests**

```bash
npm test -- --runInBand
```

Expected: every existing and new test passes without open handles or React warnings.

- [ ] **Step 3: Run static checks**

```bash
npm run tailwind:scan
npm run lint
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: Next.js production build exits 0.

- [ ] **Step 5: Check patch hygiene and scope**

```bash
git diff --check
git diff --stat
git status --short
```

Expected: no whitespace errors, no unrelated files, and no commit. Report the exact test count and verification commands.

---

### Task 12: Post-review SRP Audit Loop

**Files:**
- Create: `client/src/domain/nodes/nodeIdGenerator.ts`
- Create: `client/src/domain/nodes/__tests__/nodeIdGenerator.test.ts`
- Create: `client/src/components/map/pixi/pixiTypes.ts`
- Create: `client/src/components/map/pixi/clearMapScene.ts`
- Create: `client/src/components/map/pixi/renderMapEdges.ts`
- Create: `client/src/components/map/pixi/renderMapNodes.ts`
- Create focused tests for each behavior-bearing Pixi unit.
- Modify: `client/src/hooks/useNodes.ts`
- Modify: `client/src/components/map/pixi/renderMapScene.ts`
- Refocus: `client/src/components/map/pixi/__tests__/renderMapScene.test.ts`

**Audit lenses:** cohesion, reasons to change, state ownership, side-effect
boundaries, dependency direction, and test responsibility.

- [x] **Step 1: Audit and record findings**

Found two implementation responsibilities that remained mixed: ID-generation
policy in `useNodes`, and cleanup plus edge and node projection in
`renderMapScene`. Shared Pixi contracts also created an unnecessary type-only
dependency from lifecycle to rendering.

- [x] **Step 2: Establish RED with focused missing-module tests**

```bash
npm test -- --runInBand \
  src/domain/nodes/__tests__/nodeIdGenerator.test.ts \
  src/components/map/pixi/__tests__/clearMapScene.test.ts \
  src/components/map/pixi/__tests__/renderMapEdges.test.ts \
  src/components/map/pixi/__tests__/renderMapNodes.test.ts
```

Expected and observed before implementation: four suites fail because their
focused modules do not exist.

- [x] **Step 3: Split the responsibilities and verify focused behavior**

`nodeIdGenerator` owns monotonic policy; `useNodes` owns generator lifetime.
`pixiTypes` owns shared contracts. `clearMapScene`, `renderMapEdges`, and
`renderMapNodes` own their individual effects; `renderMapScene` owns ordering only.

```bash
npm test -- --runInBand src/components/map/pixi src/domain/nodes \
  src/hooks/__tests__/useNodes.test.ts
npm run typecheck
```

Expected and observed: 10 suites and 51 tests pass; typecheck passes.

- [x] **Step 4: Repeat the same audit until a complete pass produces zero findings**

The next complete pass found zero remaining responsibility-boundary issues across
cohesion, reasons to change, state ownership, side-effect boundaries, dependency
direction, test responsibility, and durable design documentation.

- [x] **Step 5: Run the complete verification matrix without committing**

Observed: Tailwind scan, ESLint, TypeScript, 16 Jest suites with 89 tests, and the
Next.js production build pass. The build required execution outside the filesystem
sandbox because Turbopack binds a local worker port. `git diff --check` passes and
the working tree remains uncommitted.
