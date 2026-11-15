/**
 * navigator.platform 相当の文字列から Apple 系かどうかを判定する。
 * 本番は引数省略で navigator.platform、テストは注入で切替。
 */
export function isApplePlatform(platform: string = navigator.platform): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}
