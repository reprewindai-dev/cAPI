import { createPublicKey, verify } from "crypto";
import { describe, expect, it } from "vitest";

import { generateKeyPair } from "../src/lib/covenant/crypto";
import { signCappoExecutionRequest } from "../src/lib/covenant/http-message-signatures";

describe("CAPPO RFC 9421 request profile", () => {
  it("binds POST target URI and Content-Digest with the configured Ed25519 key", () => {
    const keys = generateKeyPair();
    const body = '{"prompt":"governed"}';
    const target = "https://cappo.veklom.com/v1/exec";
    const headers = signCappoExecutionRequest(target, body, keys.privateKeyB64, "capi-gateway-1", 1_700_000_000);
    const signatureBase = [
      '"@method": POST',
      `"@target-uri": ${target}`,
      `"content-digest": ${headers["Content-Digest"]}`,
      '"@signature-params": ("@method" "@target-uri" "content-digest");created=1700000000;keyid="capi-gateway-1"',
    ].join("\n");
    const signature = Buffer.from(headers.Signature.slice("sig1=:".length, -1), "base64");

    expect(headers["Content-Digest"]).toMatch(/^sha-256=:.+:$/);
    expect(verify(null, Buffer.from(signatureBase), createPublicKey({ key: Buffer.from(keys.publicKeyB64, "base64"), format: "der", type: "spki" }), signature)).toBe(true);
  });
});
