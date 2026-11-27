/**
 * userId から安定した参加色を決める（awareness と一覧で同一にする）。
 * ポインタ軌跡は出さない（設計 決めたこと 6）。
 */
const PALETTE = [
  "#c2410c", // orange-700
  "#0369a1", // sky-700
  "#15803d", // green-700
  "#a21caf", // fuchsia-700
  "#b45309", // amber-700
  "#0f766e", // teal-700
  "#b91c1c", // red-700
  "#4338ca", // indigo-700
] as const;

function hashUserId(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function collabParticipantColor(userId: string): string {
  return PALETTE[hashUserId(userId) % PALETTE.length]!;
}
