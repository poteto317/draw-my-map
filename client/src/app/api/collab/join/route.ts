import {
  createCollabApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/collab/createCollabApiDeps";
import { handleCollabJoin } from "@/server/collab/handleCollabApi";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const deps = createCollabApiDepsFromEnv(process.env);
  if (!deps) return notConfiguredResponse();
  return handleCollabJoin(request, deps);
}
