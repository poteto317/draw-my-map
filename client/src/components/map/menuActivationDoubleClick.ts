export const MENU_ACTIVATION_DOUBLE_CLICK_WINDOW_MS = 500;

export function isDoubleClickFromMenuActivation(
  activatedAt: number | null,
  now: number,
): boolean {
  return activatedAt !== null
    && now >= activatedAt
    && now - activatedAt < MENU_ACTIVATION_DOUBLE_CLICK_WINDOW_MS;
}
