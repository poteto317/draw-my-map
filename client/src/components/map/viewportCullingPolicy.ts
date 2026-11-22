let viewportCullingEnabled = true;

export function setViewportCullingEnabled(enabled: boolean): void {
  viewportCullingEnabled = enabled;
}

export function isViewportCullingEnabled(): boolean {
  return viewportCullingEnabled;
}