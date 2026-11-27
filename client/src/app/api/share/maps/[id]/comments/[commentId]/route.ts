import {
  createShareApiDepsFromEnv,
  notConfiguredResponse,
} from "@/server/share/createShareApiDeps";
import { handleDeleteComment } from "@/server/share/handleShareCommentsApi";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; commentId: string }> },
): Promise<Response> {
  const deps = createShareApiDepsFromEnv(process.env, request);
  if (!deps) return notConfiguredResponse();
  const { id, commentId } = await context.params;
  return handleDeleteComment(request, { kind: "owner", sharedMapId: id }, commentId, deps);
}
