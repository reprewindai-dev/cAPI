import { createHash, generateKeyPairSync } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prepareCappoExecution } from "../src/lib/covenant/cappo-preparer";

const originalEnv = { ...process.env };

function b64Json(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Record<string, unknown>;
}

describe("prepareCappoExecution", () => {
  beforeEach(() => {
    const { privateKey } = generateKeyPairSync("ed25519");
    process.env.CAPPO_EXECUTION_URL = "https://cappo.veklom.com/v1/exec";
    process.env.COVENANT_HTTP_SIGNING_PRIVATE_KEY = privateKey
      .export({ type: "pkcs8", format: "der" })
      .toString("base64");
    process.env.COVENANT_HTTP_SIGNING_KEY_ID = "capi-test-1";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("overrides caller identity, strips caller ALLOW, and binds the lease execution id", () => {
    const prepared = prepareCappoExecution({
      executionId: "exec-trusted",
      workspaceId: "workspace-trusted",
      actorId: "operator-trusted",
      body: {
        prompt: "activation",
        action: "activation.read",
        workspace_id: "workspace-attacker",
        pgl_id: "operator-attacker",
        directive: "ALLOW",
        security: { nonce: "attacker", signature: "attacker" },
        capability_lease: {
          mount_id: "mnt-1",
          token_id: "tok-1",
          nonce: "lease-nonce",
          execution_id: "exec-attacker",
        },
      },
    });

    const body = JSON.parse(prepared.body) as Record<string, unknown>;
    expect(body.workspace_id).toBe("workspace-trusted");
    expect(body.pgl_id).toBe("operator-trusted");
    expect(body).not.toHaveProperty("directive");
    expect(body.security).not.toEqual({ nonce: "attacker", signature: "attacker" });
    expect(body.capability_lease).toMatchObject({ execution_id: "exec-trusted" });
    expect(prepared.targetUri).toBe("https://cappo.veklom.com/v1/exec");
  });

  it("binds WPT to the exact final body and signs every trust-bearing header", () => {
    const prepared = prepareCappoExecution({
      executionId: "exec-1",
      workspaceId: "workspace-1",
      actorId: "operator-1",
      body: {
        prompt: "activation",
        action: "activation.read",
        capability_lease: {
          mount_id: "mnt-1",
          token_id: "tok-1",
          nonce: "lease-nonce",
          execution_id: "exec-1",
        },
      },
    });

    const wpt = b64Json(prepared.headers["workload-proof"]);
    expect(wpt.body_hash).toBe(createHash("sha256").update(prepared.body).digest("hex"));

    const signatureInput = prepared.headers["Signature-Input"];
    for (const component of [
      "@method",
      "@target-uri",
      "content-digest",
      "workload-identity",
      "execution-context",
      "workload-proof",
      "veklom-authority",
      "x-veklom-actor",
      "x-veklom-nonce",
    ]) {
      expect(signatureInput).toContain(`\"${component}\"`);
    }
    expect(prepared.headers["x-veklom-actor"]).toBe("operator-1");
    expect(prepared.headers["x-veklom-nonce"]).toBeTruthy();
  });

  it("fails closed when the execution target is not the canonical CAPPO endpoint", () => {
    process.env.CAPPO_EXECUTION_URL = "https://cappo.veklom.com/v1/other";

    expect(() =>
      prepareCappoExecution({
        executionId: "exec-1",
        workspaceId: "workspace-1",
        actorId: "operator-1",
        body: {
          prompt: "activation",
          action: "activation.read",
          capability_lease: {
            mount_id: "mnt-1",
            token_id: "tok-1",
            nonce: "lease-nonce",
            execution_id: "exec-1",
          },
        },
      }),
    ).toThrow("CAPPO_EXECUTION_URL must terminate at /v1/exec");
  });
});
