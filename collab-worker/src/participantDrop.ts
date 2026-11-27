/**
 * grace 脱落時に Next の drop-participant へ通知する。
 * 失敗は呼び出し側でログし、DO 側の枠解放は既に完了している前提（best-effort）。
 */
export async function postParticipantDrop(options: {
  url: string;
  serviceSecret: string;
  sessionId: string;
  userId: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(options.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.serviceSecret}`,
        "x-collab-session-id": options.sessionId,
        "x-collab-user-id": options.userId,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
