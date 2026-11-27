/** @jest-environment node */

import {
  readCollabEnvConfig,
  resolveCollabWsOrigin,
} from "@/server/collab/collabConfig";

const baseShareEnv = {
  AUTH_SECRET: "auth-secret",
  CF_SHARE_ACCOUNT_ID: "acct",
  CF_SHARE_API_TOKEN: "token",
  CF_SHARE_D1_DATABASE_ID: "db",
  CF_SHARE_R2_ACCESS_KEY_ID: "ak",
  CF_SHARE_R2_SECRET_ACCESS_KEY: "sk",
  CF_SHARE_R2_BUCKET: "bucket",
  CF_SHARE_R2_ENDPOINT: "https://r2.example",
};

describe("collabConfig", () => {
  it("CF_COLLAB_WS_ORIGIN を origin 正本にする", () => {
    const config = readCollabEnvConfig({
      ...baseShareEnv,
      CF_COLLAB_TICKET_SECRET: "ticket",
      CF_COLLAB_WS_ORIGIN: "wss://collab.example.test/path",
    });
    expect(config?.wsOrigin).toBe("wss://collab.example.test");
    expect(config?.serviceSecret).toBeNull();
    expect(
      resolveCollabWsOrigin({
        ...baseShareEnv,
        CF_COLLAB_TICKET_SECRET: "ticket",
        CF_COLLAB_WS_ORIGIN: "wss://collab.example.test",
      }),
    ).toBe("wss://collab.example.test");
  });

  it("CF_COLLAB_SERVICE_SECRET を読む", () => {
    const config = readCollabEnvConfig({
      ...baseShareEnv,
      CF_COLLAB_TICKET_SECRET: "ticket",
      CF_COLLAB_WS_ORIGIN: "wss://collab.example.test",
      CF_COLLAB_SERVICE_SECRET: "svc",
    });
    expect(config?.serviceSecret).toBe("svc");
  });

  it("WS origin 欠落時は null（request host にフォールバックしない）", () => {
    expect(
      readCollabEnvConfig({
        ...baseShareEnv,
        CF_COLLAB_TICKET_SECRET: "ticket",
      }),
    ).toBeNull();
  });
});
