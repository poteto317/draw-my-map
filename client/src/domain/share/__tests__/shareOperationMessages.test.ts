import { shareOperationFailureMessage } from "@/domain/share/shareOperationMessages";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";

describe("shareOperationFailureMessage", () => {
  it("unauthenticated とその他を区別する", () => {
    expect(shareOperationFailureMessage("unauthenticated")).toBe(SHARE_MESSAGES.unauthenticated);
    expect(shareOperationFailureMessage("storage-error")).toBe(SHARE_MESSAGES.operationFailed);
    expect(shareOperationFailureMessage("")).toBe(SHARE_MESSAGES.operationFailed);
  });
});
