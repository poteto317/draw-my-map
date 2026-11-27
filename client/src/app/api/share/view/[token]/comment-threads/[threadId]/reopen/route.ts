import {
  createShareApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/share/createShareApiDeps";
import { handleReopenCommentThread } from "@/server/share/handleShareCommentsApi";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string; threadId: string }> },
): Promise<Response> {
  const deps = createShareApiDepsFromEnv(process.env, request);
  if (!deps) return notConfiguredResponse();
  const { token, threadId } = await context.params;
  return handleReopenCommentThread(request, { kind: "token", token }, threadId, deps);
}
