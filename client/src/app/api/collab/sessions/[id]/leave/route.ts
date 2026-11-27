import {
  createCollabApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/collab/createCollabApiDeps";
import { handleLeaveCollabSession } from "@/server/collab/handleCollabApi";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const deps = createCollabApiDepsFromEnv(process.env);
  if (!deps) return notConfiguredResponse();
  const { id } = await context.params;
  return handleLeaveCollabSession(request, id, deps);
}
