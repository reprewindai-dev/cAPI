import { createPublicKey, verify } from "crypto";
import { describe, expect, it } from "vitest";

import { generateKeyPair } from "../src/lib/covenant/crypto";
import { signCappoExecutionRequest } from "../src/lib/covenant/http-message-signatures";

describe("CAPPO RFC 9421 request profile", () => {
  it("binds the exact CAPPO request and trust-bearing headers with Ed25519", () => {
    const keys = generateKeyPair();
    const body = '{"prompt":"governed"}';
    const target = "https://cappo.veklom.com/v1/exec";
    const coveredHeaders = {
      "workload-identity": "wit-value",
      "execution-context": "ect-value",
      "workload-proof": "wpt-value",
      "veklom-authority": "authority-value",
      "x-veklom-actor": "actor-1",
      "x-veklom-nonce": "nonce-1",
    };
    const headers = signCappoExecutionRequest(
      target,
      body,
      keys.privateKeyB64,
      "capi-gateway-1",
      { coveredHeaders, created: 1_700_000_000 },
    );
    const sortedHeaderNames = Object.keys(coveredHeaders).sort();
    const components = ["@method", "@target-uri", "content-digest", ...sortedHeaderNames];
    const componentList = components.map((name) => `"${name}"`).join(" ");
    const signatureParams = `(${componentList});created=1700000000;keyid="capi-gateway-1"`;
    const signatureBase = [
      '"@method": POST',
      `"@target-uri": ${target}`,
      `"content-digest": ${headers["Content-Digest"]}`,
      ...sortedHeaderNames.map(
        (name) => `"${name}": ${coveredHeaders[name as keyof typeof coveredHeaders]}`,
      ),
      `"@signature-params": ${signatureParams}`,
    ].join("\n");
    const signature = Buffer.from(headers.Signature.slice("sig1=:".length, -1), "base64");

    expect(headers["Content-Digest"]).toMatch(/^sha-256=:.+:$/);
    expect(headers["Signature-Input"]).toBe(`sig1=${signatureParams}`);
    for (const name of sortedHeaderNames) {
      expect(headers["Signature-Input"]).toContain(`"${name}"`);
    }
    expect(
      verify(
        null,
        Buffer.from(signatureBase),
        createPublicKey({
          key: Buffer.from(keys.publicKeyB64, "base64"),
          format: "der",
          type: "spki",
        }),
        signature,
      ),
    ).toBe(true);
  });
});
