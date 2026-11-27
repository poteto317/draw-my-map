import { CollabRoom, type CollabEnv } from "./CollabRoom.js";

export { CollabRoom };

/**
 * Worker エントリ。
 * `/collab/:sessionId` → DO WebSocket
 * `/rooms/:sessionId/{seed,export,connections,destroy}` → DO 管理 HTTP（SERVICE_SECRET）
 */
export default {
  async fetch(request: Request, env: CollabEnv): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const sessionId =
      (parts[0] === "collab" || parts[0] === "rooms") && parts[1]
        ? parts[1]
        : null;

    if (!sessionId) {
      return new Response("Not Found", { status: 404 });
    }

    const id = env.COLLAB_ROOM.idFromName(sessionId);
    const stub = env.COLLAB_ROOM.get(id);
    return stub.fetch(request);
  },
};
