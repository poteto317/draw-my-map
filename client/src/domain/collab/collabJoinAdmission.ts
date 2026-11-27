/**
 * join 時の枠上限判定（接続数・参加者数）。I/O 後の純判定。
 */
export function isCollabJoinAtCapacity(input: {
  connectionCount: number;
  participantCount: number;
  maxConnections: number;
}): boolean {
  const { connectionCount, participantCount, maxConnections } = input;
  return connectionCount >= maxConnections || participantCount >= maxConnections;
}
