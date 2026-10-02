import { createCloudflareImageGenerator } from "@/server/illustration/cloudflareImageGenerator";
import { createCloudflareTranslator } from "@/server/illustration/cloudflareTranslator";
import { handleIllustrationRequest } from "@/server/illustration/handleIllustrationRequest";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleIllustrationRequest(request, {
    env: process.env,
    createGenerator: (config) => createCloudflareImageGenerator(config),
    createTranslator: (config) => createCloudflareTranslator(config),
  });
}
