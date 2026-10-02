export function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea") !== null;
}
