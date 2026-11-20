export type CommandPaletteCloseReason =
  | "dismiss"
  | "execute-immediate"
  | "execute-dialog"
  | "stale";

export type CommandPaletteFocusRequest =
  | { readonly kind: "restore-opener" }
  | null;

export type CommandPaletteState = {
  readonly screen: "closed" | "open";
  readonly query: string;
  readonly activeIndex: number;
  readonly openedMapId: string | null;
  readonly openedRevision: number;
  readonly closeReason: CommandPaletteCloseReason | null;
  readonly focusRequest: CommandPaletteFocusRequest;
  readonly rejectMessage: string | null;
  readonly rejectSequence: number;
};

function focusRequestForClose(reason: CommandPaletteCloseReason): CommandPaletteFocusRequest {
  return reason === "dismiss" || reason === "stale"
    ? { kind: "restore-opener" }
    : null;
}

export function createCommandPaletteState(): CommandPaletteState {
  return {
    screen: "closed",
    query: "",
    activeIndex: 0,
    openedMapId: null,
    openedRevision: 0,
    closeReason: null,
    focusRequest: null,
    rejectMessage: null,
    rejectSequence: 0,
  };
}

export function openCommandPalette(
  state: CommandPaletteState,
  opened: { mapId: string; revision: number },
): CommandPaletteState {
  return {
    ...state,
    screen: "open",
    query: "",
    activeIndex: 0,
    openedMapId: opened.mapId,
    openedRevision: opened.revision,
    closeReason: null,
    focusRequest: null,
    rejectMessage: null,
  };
}

export function closeCommandPalette(
  state: CommandPaletteState,
  reason: CommandPaletteCloseReason,
): CommandPaletteState {
  return {
    ...state,
    screen: "closed",
    closeReason: reason,
    focusRequest: focusRequestForClose(reason),
  };
}

export function setCommandPaletteQuery(
  state: CommandPaletteState,
  query: string,
): CommandPaletteState {
  return {
    ...state,
    query,
    activeIndex: 0,
    rejectMessage: null,
  };
}

export function moveCommandPaletteHighlight(
  state: CommandPaletteState,
  action: "up" | "down" | "home" | "end",
  itemCount: number,
): CommandPaletteState {
  if (itemCount <= 0) {
    return state.activeIndex === 0 ? state : { ...state, activeIndex: 0 };
  }

  const last = itemCount - 1;
  let next = state.activeIndex;
  switch (action) {
    case "up":
      next = Math.max(0, state.activeIndex - 1);
      break;
    case "down":
      next = Math.min(last, state.activeIndex + 1);
      break;
    case "home":
      next = 0;
      break;
    case "end":
      next = last;
      break;
  }
  return next === state.activeIndex ? state : { ...state, activeIndex: next };
}

export function setCommandPaletteReject(
  state: CommandPaletteState,
  message: string,
): CommandPaletteState {
  return {
    ...state,
    rejectMessage: message,
    rejectSequence: state.rejectSequence + 1,
  };
}

export function consumeCommandPaletteFocusRequest(
  state: CommandPaletteState,
): CommandPaletteState {
  return state.focusRequest === null ? state : { ...state, focusRequest: null };
}

export function markCommandPaletteStaleIfNeeded(
  state: CommandPaletteState,
  current: { mapId: string; revision: number },
): CommandPaletteState {
  if (state.screen !== "open") return state;
  if (state.openedMapId === current.mapId && state.openedRevision === current.revision) {
    return state;
  }
  return closeCommandPalette(state, "stale");
}
