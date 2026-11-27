import {
  createShareApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/share/createShareApiDeps";
import {
  handleCreateCommentThread,
  handleListCommentThreads,
} from "@/server/share/handleShareCommentsApi";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const deps = createShareApiDepsFromEnv(process.env, request);
  if (!deps) return notConfiguredResponse();
  const { token } = await context.params;
  return handleListCommentThreads(request, { kind: "token", token }, deps);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const deps = createShareApiDepsFromEnv(process.env, request);
  if (!deps) return notConfiguredResponse();
  const { token } = await context.params;
  return handleCreateCommentThread(request, { kind: "token", token }, deps);
}
