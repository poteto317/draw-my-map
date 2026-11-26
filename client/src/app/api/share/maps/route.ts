import {
  createShareApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/share/createShareApiDeps";
import {
  handleCreateShareMap,
  handleListShareMaps,
} from "@/server/share/handleShareApi";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const deps = createShareApiDepsFromEnv(process.env, request);
  if (!deps) return notConfiguredResponse();
  return handleListShareMaps(request, deps);
}

export async function POST(request: Request): Promise<Response> {
  const deps = createShareApiDepsFromEnv(process.env, request);
  if (!deps) return notConfiguredResponse();
  return handleCreateShareMap(request, deps);
}
