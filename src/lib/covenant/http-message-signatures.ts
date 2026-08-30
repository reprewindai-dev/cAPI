/** RFC 9421 request-signature helpers for CAPPO's sole execution boundary. */

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

export interface CappoSignatureOptions {
  coveredHeaders?: Record<string, string>;
  created?: number;
}

/**
 * Sign the exact CAPPO request bytes plus every trust-bearing identity header.
 * Header names are normalized to lower-case because RFC 9421 component names
 * are case-insensitive while the signature base is deterministic.
 */
export function signCappoExecutionRequest(
  targetUri: string,
  body: string,
  privateKeyB64: string,
  keyId: string,
  options: CappoSignatureOptions = {},
): Record<string, string> {
  if (!privateKeyB64 || !keyId) {
    throw new Error("COVENANT_HTTP_SIGNING_PRIVATE_KEY and COVENANT_HTTP_SIGNING_KEY_ID are required");
  }
  if (!targetUri.startsWith("https://") && process.env.NODE_ENV === "production") {
    throw new Error("CAPPO execution target must use HTTPS in production");
  }

  const created = options.created ?? Math.floor(Date.now() / 1000);
  const contentDigest = `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;
  const normalizedHeaders = Object.fromEntries(
    Object.entries(options.coveredHeaders ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const covered = ["@method", "@target-uri", "content-digest", ...Object.keys(normalizedHeaders).sort()];
  const componentList = covered.map((name) => `"${name}"`).join(" ");
  const params = `;created=${created};keyid="${keyId}"`;
  const signatureInput = `sig1=(${componentList})${params}`;
  const signatureBaseLines = [
    '"@method": POST',
    `"@target-uri": ${targetUri}`,
    `"content-digest": ${contentDigest}`,
    ...Object.keys(normalizedHeaders).sort().map((name) => `"${name}": ${normalizedHeaders[name]}`),
    `"@signature-params": (${componentList})${params}`,
  ];

  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signature = sign(null, Buffer.from(signatureBaseLines.join("\n"), "utf8"), privateKey)
    .toString("base64");

  return {
    "Content-Digest": contentDigest,
    "Signature-Input": signatureInput,
    Signature: `sig1=:${signature}:`,
  };
}
