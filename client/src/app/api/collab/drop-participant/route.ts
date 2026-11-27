import {
  createCollabApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/collab/createCollabApiDeps";
import { handleCollabDropParticipant } from "@/server/collab/handleCollabApi";
import { readCollabEnvConfig } from "@/server/collab/collabConfig";

export const dynamic = "force-dynamic";

/**
 * Worker grace 脱落 → D1 参加者削除。
 * Authorization: Bearer CF_COLLAB_SERVICE_SECRET
 * Headers: x-collab-session-id, x-collab-user-id
 */
export async function POST(request: Request): Promise<Response> {
  const config = readCollabEnvConfig(process.env);
  if (!config?.serviceSecret) return notConfiguredResponse();
  const deps = createCollabApiDepsFromEnv(process.env);
  if (!deps) return notConfiguredResponse();
  return handleCollabDropParticipant(request, {
    ...deps,
    serviceSecret: config.serviceSecret,
  });
}
