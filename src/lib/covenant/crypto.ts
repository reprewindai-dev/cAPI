/**
 * Cryptographic primitives for Covenant.
 *
 * Real Ed25519 signing/verification and SHA-256 hashing — no stubs. Agent
 * identities carry Ed25519 public keys; requests are signed over a canonical
 * message; evidence is hash-chained with SHA-256.
 */

import {
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createHash,
  createHmac,
  createPublicKey,
  createPrivateKey,
  randomBytes,
  KeyObject,
} from "crypto";

export interface KeyPair {
  publicKeyB64: string; // SPKI DER, base64
  privateKeyB64: string; // PKCS8 DER, base64
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyB64: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKeyB64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

function publicKeyFromB64(b64: string): KeyObject {
  return createPublicKey({
    key: Buffer.from(b64, "base64"),
    format: "der",
    type: "spki",
  });
}

function privateKeyFromB64(b64: string): KeyObject {
  return createPrivateKey({
    key: Buffer.from(b64, "base64"),
    format: "der",
    type: "pkcs8",
  });
}

/**
 * Canonical message bound by an agent signature. Any field tamper invalidates
 * the signature, which is exactly the replay/integrity guarantee we want.
 */
export function canonicalRequestMessage(fields: {
  connection_id: string;
  agent_id: string;
  capability_id: string;
  action: string;
  input: Record<string, unknown>;
  timestamp: string;
}): Buffer {
  return Buffer.from(
    [
      fields.connection_id,
      fields.agent_id,
      fields.capability_id,
      fields.action,
      JSON.stringify(fields.input),
      fields.timestamp,
    ].join("\n"),
    "utf-8",
  );
}

export function signMessage(message: Buffer, privateKeyB64: string): string {
  // Ed25519 ignores the digest algorithm argument; pass null.
  return edSign(null, message, privateKeyFromB64(privateKeyB64)).toString("base64");
}

export function verifyMessage(
  message: Buffer,
  signatureB64: string,
  publicKeyB64: string,
): boolean {
  try {
    return edVerify(
      null,
      message,
      publicKeyFromB64(publicKeyB64),
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}

export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Deterministic content hash used for evidence + chain links. */
export function hashObject(obj: unknown): string {
  return sha256(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
// HMAC-hardened evidence hashing
// ---------------------------------------------------------------------------

const PGL_HMAC_SECRET = process.env.PGL_HMAC_SECRET ?? "";

/** Generate a cryptographic nonce (hex-encoded). */
export function generateNonce(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * HMAC-SHA256 hash of canonical JSON with embedded nonce.
 * Falls back to plain SHA-256 when PGL_HMAC_SECRET is unset so the
 * pipeline never breaks in dev environments.
 */
export function hmacHashObject(obj: unknown, nonce: string): string {
  const canonical = JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
  const payload = `${nonce}:${canonical}`;
  if (PGL_HMAC_SECRET.length > 0) {
    return createHmac("sha256", PGL_HMAC_SECRET).update(payload).digest("hex");
  }
  return createHash("sha256").update(payload).digest("hex");
}
