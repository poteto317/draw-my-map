// 「ホスト名」または「[IPv6]」に、任意のポートが続く形だけを読む。userinfo・パス・空白などを含む値は null
const HOST_PATTERN = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i;
const BARE_IPV6_PATTERN = /^[0-9a-f]*:[0-9a-f:.]*:[0-9a-f:.]*$/i;

// Host ヘッダーや許可リストの項目から、比較に使うホスト名（小文字、IPv6 は角かっこ付き）を取り出す
export function aiAssistHostName(value: string): string | null {
  const trimmed = value.trim();
  // 角かっこの無い IPv6（例: ::1）は、ポートと区別できないため全体をアドレスとみなす
  const candidate = BARE_IPV6_PATTERN.test(trimmed) ? `[${trimmed}]` : trimmed;
  const match = HOST_PATTERN.exec(candidate);
  return match === null ? null : match[1].toLowerCase();
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

// サーバー側の秘密（API キー）を消費する API を、別のサイトや想定外の形のリクエストから使わせない（L-1034）。
// Host は許可リストと照合する。Origin と Host の一致だけでは、DNS rebinding（攻撃者の名前を 127.0.0.1 へ向ける）や
// LAN 内の別端末からの呼び出しを防げないため。Origin・Sec-Fetch-Site の無い呼び出し（curl など）は、Host が許可されていれば通す
export function checkAiAssistRequestOrigin(
  request: Request,
  method: "GET" | "POST",
  allowedHosts: ReadonlySet<string>,
): boolean {
  const host = request.headers.get("host");
  if (host === null) return false;
  const hostName = aiAssistHostName(host);
  if (hostName === null || !allowedHosts.has(hostName)) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const fromHost = originHost(origin); // "null" や URL として読めない値は null。URL は小文字にそろえる
    if (fromHost === null || fromHost !== host.trim().toLowerCase()) return false;
  }
  if (method === "POST") {
    // 事前確認なしで別サイトから送れる text/plain などを拒む
    const mediaType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json") return false;
  }
  return true;
}
