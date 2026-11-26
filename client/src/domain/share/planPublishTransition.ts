/** 公開スナップショットの current_revision_id 差し替え計画（検証→R2→ポインタの最終段） */
export function planPublishTransition(input: {
  currentRevisionId: string | null;
  nextRevisionId: string;
}): { nextCurrentRevisionId: string } {
  return { nextCurrentRevisionId: input.nextRevisionId };
}
