/**
 * grace 脱落時に Next の drop-participant へ通知する。
 * 失敗は呼び出し側でログし、DO 側の枠解放は既に完了している前提（best-effort）。
 */

export type ParticipantDropTarget =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; reason: "participant-drop-misconfigured" };

/** URL / sessionId 欠落は無言スキップせず、呼び出し側が reason をログする。 */
export function resolveParticipantDropTarget(options: {
  url: string | undefined;
  sessionId: string | null;
}): ParticipantDropTarget {
  if (!options.url || !options.sessionId) {
    return { ok: false, reason: "participant-drop-misconfigured" };
  }
  return { ok: true, url: options.url, sessionId: options.sessionId };
}

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
