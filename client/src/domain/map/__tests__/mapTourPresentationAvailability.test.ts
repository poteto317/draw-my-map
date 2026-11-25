import {
  resolveTourPresentationGuards,
  type TourPresentationGuardInput,
} from "@/domain/map/mapTourPresentationAvailability";

const clear: TourPresentationGuardInput = {
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
};

describe("resolveTourPresentationGuards", () => {
  it("通常時は編集・再生開始とも有効", () => {
    expect(resolveTourPresentationGuards(clear)).toEqual({
      tourEditDisabled: false,
      presentationStartBlocked: false,
    });
  });

  it("保護モードでは編集のみ無効", () => {
    expect(resolveTourPresentationGuards({ ...clear, isProtectedMode: true })).toEqual({
      tourEditDisabled: true,
      presentationStartBlocked: false,
    });
  });

  it("競合・外部削除では編集と再生開始を止める", () => {
    expect(resolveTourPresentationGuards({ ...clear, hasConflict: true })).toEqual({
      tourEditDisabled: true,
      presentationStartBlocked: true,
    });
    expect(resolveTourPresentationGuards({ ...clear, isExternallyDeleted: true })).toEqual({
      tourEditDisabled: true,
      presentationStartBlocked: true,
    });
  });
});