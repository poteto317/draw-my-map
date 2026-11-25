import { isDocumentBlocked, type DocumentEditGuardInput } from "@/domain/map/mapDocumentEditGuards";

export type TourPresentationGuardInput = DocumentEditGuardInput;

export type TourPresentationGuardResult = {
  tourEditDisabled: boolean;
  presentationStartBlocked: boolean;
};

/** ツアー編集・プレゼン開始の無効化（保護時は編集のみ止め、再生は競合・外部削除時のみ） */
export function resolveTourPresentationGuards(
  input: TourPresentationGuardInput,
): TourPresentationGuardResult {
  const tourEditDisabled = isDocumentBlocked(input);
  const presentationStartBlocked = input.hasConflict || input.isExternallyDeleted;
  return { tourEditDisabled, presentationStartBlocked };
}