import { BRANCH_SUMMARY_TASK } from "@/server/aiAssist/aiAssistTasks";
import { createAiTextGenerator } from "@/server/aiAssist/createAiTextGenerator";
import { handleAiAssistRequest } from "@/server/aiAssist/handleAiAssistRequest";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleAiAssistRequest(request, BRANCH_SUMMARY_TASK, {
    env: process.env,
    createGenerator: createAiTextGenerator,
  });
}
