import {
  createCollabApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/collab/createCollabApiDeps";
import { handleGetCollabSession } from "@/server/collab/handleCollabApi";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const deps = createCollabApiDepsFromEnv(process.env);
  if (!deps) return notConfiguredResponse();
  const { id } = await context.params;
  return handleGetCollabSession(request, id, deps);
}
