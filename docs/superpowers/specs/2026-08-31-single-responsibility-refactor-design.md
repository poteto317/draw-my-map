# Single-Responsibility Refactor Design

## Context

The `codex/phase2-keyboard-nodes` branch adds node editing, selection, dragging,
tree relationships, edge rendering, keyboard creation, and recursive deletion.
The behavior is covered by 64 passing tests, but the implementation concentrates
unrelated responsibilities in `MapStage.tsx` and `useNodes.ts`. Their tests mirror
that concentration: one component test covers DOM editing, PixiJS lifecycle,
rendering, pointer interaction, keyboard commands, and hook integration, while the
hook test mixes state transitions with placement and tree algorithms.

This refactor applies only to files changed between `main` and
`codex/phase2-keyboard-nodes`. It preserves the public contracts and observable
behavior of `MapStage` and `useNodes`.

## Goals

- Give each production unit one cohesive reason to change.
- Keep `MapStage` as a composition boundary rather than an implementation hub.
- Keep `useNodes` responsible for React state orchestration rather than geometry
  or tree traversal.
- Move deterministic calculations into pure functions with direct unit tests.
- Separate PixiJS lifecycle, scene rendering, and pointer interaction.
- Expand coverage for currently under-tested drag, geometry, cancellation, and
  malformed-data paths.
- Keep every existing user interaction and layout rule unchanged.

## Non-goals

- Changing `MapStageProps` or the `UseNodesReturn` API.
- Changing node dimensions, spacing, colors, labels, edge shape, or keyboard
  bindings.
- Introducing a reducer, state-management library, dependency-injection framework,
  or new runtime dependency.
- Implementing mouse-based connection of existing nodes, collision-avoiding
  automatic layout, or descendant batch movement.
- Refactoring files that were not changed from `main`, except when a test runner or
  import path requires a mechanical update.
- Automatically committing any change.

## Reviewed diff scope

### Refactor targets

- `client/src/components/map/MapStage.tsx`
- `client/src/components/map/__tests__/MapStage.test.tsx`
- `client/src/hooks/useNodes.ts`
- `client/src/hooks/__tests__/useNodes.test.ts`

### Reviewed but structurally unchanged

- `client/src/app/page.tsx` remains the application composition root.
- `client/src/config/shapes.ts` remains the shape and spacing constants module.
- `client/src/types/node.ts` remains the node data contract.
- `ROADMAP.md` and `docs/backlog/phase1-node-basics.md` remain project documents.
- Deleted `Rect` and `useRects` files need no replacement beyond the existing
  `Node` and `useNodes` migration.

## Chosen approach

Use responsibility-level extraction while preserving existing public APIs. This
is intentionally between a minimal helper-only extraction, which would leave
`MapStage` overloaded, and a full reducer/domain-service rewrite, which would add
unnecessary abstraction and behavioral risk.

## Production structure and responsibilities

```text
client/src/
├── components/map/
│   ├── MapStage.tsx
│   ├── NodeLabelEditor.tsx
│   ├── mapGeometry.ts
│   ├── useNodeEditing.ts
│   ├── useNodeKeyboardShortcuts.ts
│   └── pixi/
│       ├── pixiTypes.ts
│       ├── clearMapScene.ts
│       ├── renderMapEdges.ts
│       ├── renderMapNodes.ts
│       ├── usePixiApplication.ts
│       ├── renderMapScene.ts
│       └── stageInteractions.ts
├── domain/nodes/
│   ├── nodeIdGenerator.ts
│   ├── nodePlacement.ts
│   └── nodeTree.ts
└── hooks/
    └── useNodes.ts
```

### `MapStage.tsx`

Owns composition only:

- creates the DOM container;
- composes the PixiJS lifecycle, interaction, editing, and keyboard units;
- translates a DOM double-click into a relative point;
- routes a node hit to editing and a blank hit to `onDoubleClick`;
- renders `NodeLabelEditor` when an editable node exists;
- triggers scene projection when nodes, selection, editing, or Pixi readiness
  changes.

The existing `MapStageProps` contract remains unchanged.

### `NodeLabelEditor.tsx`

Owns only the HTML input presentation and input event mapping. It receives a node,
the current draft, and callbacks for draft change, commit, and cancel. Enter and
blur commit, Escape cancels, and double-click propagation is stopped so the stage
does not restart editing.

### `useNodeEditing.ts`

Owns editing state and transitions:

- editing node ID;
- draft text;
- start with the current label or a supplied empty draft for a newly created node;
- commit through `onUpdateLabel` and reset state;
- cancel and reset state;
- derive the currently edited node from the latest `nodes` array.

It contains no DOM or PixiJS code.

### `useNodeKeyboardShortcuts.ts`

Owns the window-level keydown subscription and command routing. It ignores commands
when editing or when no node is selected. Tab creates a child, Enter creates a
sibling, and Delete or Backspace deletes the selected subtree. A successfully
created node is handed to the editing controller with an empty draft.

### `mapGeometry.ts`

Owns deterministic map calculations:

- conversion from viewport coordinates to container-relative coordinates;
- inclusive rectangular node hit-testing;
- edge endpoints and the shared horizontal Bezier control coordinate.

It has no React, DOM listener, or PixiJS object lifecycle responsibility.

### `pixi/usePixiApplication.ts`

Owns PixiJS application lifecycle:

- dynamic import of PixiJS;
- application construction and initialization;
- resolution fallback, transparent background, resize target, antialiasing, and
  auto-density configuration;
- canvas positioning and insertion;
- readiness publication;
- safe cleanup when unmounted before import, during initialization, or after
  initialization;
- destruction with `{ children: true, context: true }`.

It returns the initialized Pixi runtime needed by scene rendering without exposing
lifecycle mutations to consumers.

### `pixi/pixiTypes.ts`

Owns the shared `PixiConstructors` and `PixiRuntime` contracts. It contains no
runtime behavior, so application lifecycle and scene rendering do not depend on
one another merely to share types.

### `pixi/clearMapScene.ts`

Owns removal and destruction of objects from the previous projection, including
the exact `{ children: true, context: true }` destruction options.

### `pixi/renderMapEdges.ts`

Owns edge projection only. It draws valid parent-child curves, skips relationships
whose parent is missing, and avoids allocating unused graphics.

### `pixi/renderMapNodes.ts`

Owns node projection only. It draws selected and unselected rectangles and labels,
hides text for the node edited by the HTML overlay, and attaches the supplied
node-pointer handler to each node container.

### `pixi/renderMapScene.ts`

Owns projection order only: clear the old projection, render edges, then render
nodes. Cleanup policy, edge drawing, and node drawing remain in their focused units.

### `pixi/stageInteractions.ts`

Owns PixiJS pointer interaction state and handlers:

- clear selection only when the pointer target is the stage itself;
- select a node and capture its latest position on node pointer-down;
- ignore movement below the four-pixel drag threshold;
- translate pointer displacement into `onMoveNode` calls after the threshold;
- end dragging on `pointerup` and `pointerupoutside`;
- use the latest nodes and callbacks rather than captured stale values;
- detach listeners or allow application destruction to release them during
  cleanup.

### `domain/nodes/nodePlacement.ts`

Owns construction and placement rules for new nodes:

- root nodes are centered on the supplied map coordinate;
- the first child aligns vertically with its parent and is placed to its right;
- later children are placed below the lowest existing sibling;
- siblings preserve the source parent and x-coordinate and are placed below the
  lowest sibling;
- root siblings retain `parentId: null`;
- missing source or parent IDs return `null`;
- dimensions, gaps, and empty initial labels use the existing constants and values.

All functions are pure and receive the generated node ID explicitly.

### `domain/nodes/nodeTree.ts`

Owns iterative subtree discovery. It returns the root ID plus every reachable
descendant ID, terminates for malformed cyclic input, and does not include unrelated
or orphan nodes.

### `domain/nodes/nodeIdGenerator.ts`

Owns monotonic numeric ID generation. It accepts an injectable clock, returns the
first clock value unchanged, increments the previous ID when the clock repeats or
moves backward, and follows a later forward clock value. It has no React state or
node-construction responsibility.

### `hooks/useNodes.ts`

Owns React node and selection state. It owns the lifetime of an ID generator and
requests IDs from it, delegates construction and tree discovery to the domain
modules, applies updates with functional state setters, and preserves the current
API and return-value behavior. Functional updates must use the latest `prev` array
so two additions in one React batch retain sibling spacing.

## Data flow

1. A blank-stage double-click is converted to a relative point and sent to
   `addNode`.
2. A node double-click starts label editing instead of creating a node.
3. Window keyboard events are routed by `useNodeKeyboardShortcuts`; successful
   child or sibling creation starts editing the returned node ID.
4. PixiJS node pointer-down selects the node and seeds drag state from the latest
   node coordinates.
5. PixiJS stage movement crosses the threshold before issuing coordinate updates.
6. `useNodes` requests a monotonic ID, updates React state, and delegates deterministic
   placement or subtree discovery to pure domain modules.
7. Updated nodes cause `renderMapScene` to orchestrate cleanup, edge projection, and
   node projection through their focused units.
8. Label commit updates state through the existing callback; cancel only closes the
   editor and discards the draft.

## Defensive behavior

- Async PixiJS cancellation never appends or retains an application after unmount.
- Reprojection destroys removed display objects and owned contexts exactly once per
  removed stage child.
- Missing parents produce nodes without edges and never create unused edge graphics.
- Creation from a missing parent or source returns `null` and leaves state unchanged.
- Subtree traversal terminates even if malformed input contains a cycle.
- Keyboard commands are ignored during editing and when nothing is selected.
- Node interaction does not clear selection through the subsequent stage/canvas
  event; only a direct stage target clears it.

## Test structure

```text
client/src/
├── components/map/__tests__/
│   ├── MapStage.test.tsx
│   ├── NodeLabelEditor.test.tsx
│   ├── mapGeometry.test.ts
│   ├── useNodeEditing.test.ts
│   └── useNodeKeyboardShortcuts.test.tsx
├── components/map/pixi/
│   ├── testing/
│   │   └── pixiTestHarness.ts
│   └── __tests__/
│       ├── clearMapScene.test.ts
│       ├── renderMapEdges.test.ts
│       ├── renderMapNodes.test.ts
│       ├── renderMapScene.test.ts
│       ├── stageInteractions.test.ts
│       └── usePixiApplication.test.tsx
├── domain/nodes/__tests__/
│   ├── nodeIdGenerator.test.ts
│   ├── nodePlacement.test.ts
│   └── nodeTree.test.ts
└── hooks/__tests__/
    └── useNodes.test.ts
```

`pixiTestHarness.ts` is a test fixture, not a test suite. It lives in `pixi/testing/`
outside `__tests__` so Jest does not discover it as an empty suite. It provides
focused mock objects and observable handlers so Pixi lifecycle, rendering, and
interaction tests do not duplicate one large global mock.

### Pure unit coverage

- Root, first-child, subsequent-child, sibling, and root-sibling placement.
- Sequential placement against the latest node array.
- Missing parent and source handling.
- Single-node, deep, branching, unrelated, orphan, and cyclic subtree data.
- Relative point conversion with non-zero container offsets.
- Hit tests inside, outside, and exactly on each rectangle boundary.
- Edge endpoint and Bezier control calculations for differing x and y positions.
- Monotonic IDs for repeated, backward-moving, and forward-moving clock values.

### Component and hook coverage

- Editing starts with an existing label or an empty new-node draft.
- Enter and blur commit; Escape cancels; input double-click preserves the draft.
- Editing suppresses creation and deletion shortcuts.
- Tab and Enter route to the correct creation callback and start editing only for a
  non-null returned ID.
- Delete and Backspace route to deletion only while selected and not editing.
- `useNodes` retains its public state-transition behavior while domain calculations
  are tested independently.

### PixiJS coverage

- Initial options and device-pixel-ratio fallback.
- Unmount before dynamic import, during initialization, and after initialization.
- Previous-projection destruction with the required owned-resource options.
- Edge geometry, orphan handling, and lazy edge-layer allocation.
- Node styling, label visibility, and pointer callback mapping.
- Scene orchestration order: cleanup, edges, then nodes.
- Direct-stage selection clearing versus node-event propagation.
- Drag movement below threshold, threshold crossing, displacement calculation,
  latest-node lookup, `pointerup`, and `pointerupoutside`.

### Integration coverage

`MapStage.test.tsx` retains only boundary-level tests: container rendering,
double-click routing, connection of editing overlay to stage events, and the existing
`MapStage` plus `useNodes` keyboard-creation flow. Unit-specific assertions move to
the extracted module tests rather than being duplicated.

## TDD and verification

Each extraction follows a red-green-refactor cycle:

1. Add or move focused tests that define the new unit's contract.
2. Run the focused test and confirm it fails for the intended missing boundary.
3. Implement the smallest extraction that preserves behavior.
4. Run the focused test and adjacent integration tests.
5. Continue only after the task is green.

Final verification runs from `client/`:

```bash
npm run tailwind:scan
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
```

## Acceptance criteria

- Every file changed from `main` has been reviewed and classified as refactored or
  intentionally unchanged.
- `MapStage.tsx` contains composition logic and no embedded PixiJS construction,
  scene drawing algorithm, drag algorithm, global shortcut algorithm, or label input
  markup.
- `useNodes.ts` contains no ID-generation policy, subtree traversal, or node
  placement algorithm.
- `renderMapScene.ts` contains orchestration only; cleanup, edge projection, and node
  projection remain separate responsibilities.
- Shared Pixi runtime and constructor contracts do not create a dependency between
  lifecycle and rendering implementations.
- The `MapStageProps` and `UseNodesReturn` public contracts remain unchanged.
- All existing behaviors remain covered and passing.
- New unit tests cover the pure domain, geometry, Pixi lifecycle, rendering, drag,
  keyboard, and editing boundaries described above.
- Tailwind scan, lint, typecheck, Jest, and production build all pass.
- No dependency is added and no commit is created automatically.
