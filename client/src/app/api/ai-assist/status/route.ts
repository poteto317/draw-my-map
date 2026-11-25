import { handleAiAssistStatusRequest } from "@/server/aiAssist/handleAiAssistRequest";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return handleAiAssistStatusRequest(request, { env: process.env });
}
