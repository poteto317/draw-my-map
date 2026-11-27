import { createSlidingWindowLimiter } from "../src/rateLimit";
import {
  COLLAB_AWARENESS_UPDATE_LIMIT,
  COLLAB_DOC_UPDATE_LIMIT,
} from "../src/constants";

describe("rateLimit", () => {
  it("文書・awareness の窓内上限を超えたら拒否", () => {
    const doc = createSlidingWindowLimiter(COLLAB_DOC_UPDATE_LIMIT);
    const aw = createSlidingWindowLimiter(COLLAB_AWARENESS_UPDATE_LIMIT);
    const now = 1_000;
    let docOk = 0;
    let awOk = 0;
    for (let i = 0; i < 100; i++) {
      if (doc.allow("u1", now)) docOk++;
      if (aw.allow("u1", now)) awOk++;
    }
    expect(docOk).toBe(COLLAB_DOC_UPDATE_LIMIT.limit);
    expect(awOk).toBe(COLLAB_AWARENESS_UPDATE_LIMIT.limit);
  });
});
