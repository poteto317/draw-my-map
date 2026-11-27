import {
  createShareApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/share/createShareApiDeps";
import { handleReplyCommentThread } from "@/server/share/handleShareCommentsApi";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; threadId: string }> },
): Promise<Response> {
  const deps = createShareApiDepsFromEnv(process.env, request);
  if (!deps) return notConfiguredResponse();
  const { id, threadId } = await context.params;
  return handleReplyCommentThread(request, { kind: "owner", sharedMapId: id }, threadId, deps);
}
