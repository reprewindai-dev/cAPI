/** RFC 9421 request-signature helper for CAPPO's sole execution boundary. */

import { createHash, createPrivateKey, sign } from "crypto";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function signCanonicalCapiEnvelope(payload: object, privateKeyB64: string): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return sign(null, Buffer.from(canonicalJson(payload), "utf8"), privateKey)
    .toString("base64url");
}

export function signCappoExecutionRequest(
  targetUri: string,
  body: string,
  privateKeyB64: string,
  keyId: string,
  created = Math.floor(Date.now() / 1000),
): Record<string, string> {
  if (!privateKeyB64 || !keyId) {
    throw new Error("COVENANT_HTTP_SIGNING_PRIVATE_KEY and COVENANT_HTTP_SIGNING_KEY_ID are required");
  }
  const contentDigest = `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;
  const params = `;created=${created};keyid="${keyId}"`;
  const signatureInput = `sig1=("@method" "@target-uri" "content-digest")${params}`;
  const signatureBase = [
    '"@method": POST',
    `"@target-uri": ${targetUri}`,
    `"content-digest": ${contentDigest}`,
    `"@signature-params": ("@method" "@target-uri" "content-digest")${params}`,
  ].join("\n");
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signature = sign(null, Buffer.from(signatureBase, "utf8"), privateKey).toString("base64");
  return {
    "Content-Digest": contentDigest,
    "Signature-Input": signatureInput,
    Signature: `sig1=:${signature}:`,
  };
}
