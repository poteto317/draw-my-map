export const NARROW_VIEWPORT_MAX_PX = 767;

export function narrowViewportMediaQuery(): string {
  return `(max-width: ${NARROW_VIEWPORT_MAX_PX}px)`;
}