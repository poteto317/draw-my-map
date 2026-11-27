import {
  createCollabApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/collab/createCollabApiDeps";
import { handleCollabEvacuate } from "@/server/collab/handleCollabApi";
import { readCollabEnvConfig } from "@/server/collab/collabConfig";

export const dynamic = "force-dynamic";

/**
 * Worker TTL 退避 ingest。
 * Authorization: Bearer CF_COLLAB_SERVICE_SECRET
 * Header: x-collab-session-id
 * Body: yjs update（octet-stream）。空は拒否。
 */
export async function POST(request: Request): Promise<Response> {
  const config = readCollabEnvConfig(process.env);
  if (!config?.serviceSecret) return notConfiguredResponse();
  const deps = createCollabApiDepsFromEnv(process.env);
  if (!deps) return notConfiguredResponse();
  return handleCollabEvacuate(request, {
    ...deps,
    serviceSecret: config.serviceSecret,
  });
}
