/**
 * Verifiable execution evidence with canonical encoding, server signatures,
 * and independent per-agent chain linkage.
 *
 * Evidence signing keys are read from COVENANT_EVIDENCE_SIGNING_KEY in
 * production. Development-only ephemeral keys are isolated to non-production
 * environments and are never used as a production fallback.
 */

import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
} from "node:crypto";
import {
  generateKeyPair,
  sha256,
  signMessage,
  verifyMessage,
} from "./crypto";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type AuthorizationDecision = "authorized" | "denied" | "quarantined";
export type ExecutionStatus = "success" | "error" | "pending";

export interface ExecutionEvidence {
  evidence_id: string;
  evidence_version: "1.0";
  request_commitment: {
    hash_algorithm: "sha256";
    hash_value: string;
    canonicalized_request: string;
  };
  authorization: {
    decision: AuthorizationDecision;
    policy_id: string;
    decision_reason: string;
    timestamp_utc: string;
  };
  execution: {
    status: ExecutionStatus;
    result_commitment: {
      hash_algorithm: "sha256";
      hash_value: string;
    };
    duration_ms: number;
    timestamp_utc: string;
  };
  actor: {
    agent_id: string;
    agent_public_key: string;
    server_id: string;
    server_public_key: string;
  };
  chain: {
    previous_evidence_hash?: string;
    chain_depth: number;
    agent_chain_id: string;
  };
  signatures: {
    server_signature: {
      algorithm: "Ed25519";
      value: string;
      public_key: string;
    };
    envelope_hash: {
      algorithm: "sha256";
      value: string;
    };
  };
  intermediaries?: Array<{
    intermediary_id: string;
    decision: "forwarded" | "cached" | "denied" | "transformed";
    decision_reason: string;
    timestamp_utc: string;
    signature: {
      algorithm: "Ed25519";
      value: string;
    };
  }>;
  compliance: {
    regulatory_category?: string;
    retention_years?: number;
    immutable: true;
    tamper_evident: true;
  };
}

export interface GenerateEvidenceParams {
  agent_id: string;
  agent_public_key: string;
  request: JsonObject;
  authorization_decision: AuthorizationDecision;
  policy_id: string;
  decision_reason: string;
  execution_status: Exclude<ExecutionStatus, "pending">;
  execution_result: JsonValue;
  duration_ms: number;
  intermediaries?: ExecutionEvidence["intermediaries"];
  regulatory_category?: string;
  retention_years?: number;
}

export interface EvidenceVerification {
  valid: boolean;
  reason?: string;
}

interface UnsignedEvidence {
  evidence_id: string;
  evidence_version: "1.0";
  request_commitment: ExecutionEvidence["request_commitment"];
  authorization: ExecutionEvidence["authorization"];
  execution: ExecutionEvidence["execution"];
  actor: ExecutionEvidence["actor"];
  chain: ExecutionEvidence["chain"];
  intermediaries?: ExecutionEvidence["intermediaries"];
  compliance: ExecutionEvidence["compliance"];
}

export interface SigningKeyPair {
  privateKeyB64: string;
  publicKeyB64: string;
}

let ephemeralKeyPair: SigningKeyPair | undefined;
let warnedAboutEphemeralKey = false;
let configuredKeyPair: SigningKeyPair | undefined;
let configuredKeyMaterial: string | undefined;

function signingKeyPairFromPrivateKey(privateKeyB64: string): SigningKeyPair {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const publicKeyB64 = createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .toString("base64");
  return { privateKeyB64, publicKeyB64 };
}

export function resolveSigningKeyPair(): SigningKeyPair {
  const configuredKey = process.env.COVENANT_EVIDENCE_SIGNING_KEY?.trim();
  if (configuredKey) {
    if (configuredKeyMaterial !== configuredKey || !configuredKeyPair) {
      configuredKeyPair = signingKeyPairFromPrivateKey(configuredKey);
      configuredKeyMaterial = configuredKey;
    }
    return configuredKeyPair;
  }

  if (process.env.NODE_ENV === "production") {
    if (!configuredKey || !process.env.COVENANT_EVIDENCE_KEY_ID?.trim()) {
      throw new Error(
        "COVENANT_EVIDENCE_SIGNING_KEY and COVENANT_EVIDENCE_KEY_ID are required in production; refusing to use an ephemeral evidence signing key."
      );
    }
    if (configuredKey.length !== 64 && configuredKey.length !== 44 && configuredKey.length !== 88) {
      throw new Error(
        "COVENANT_EVIDENCE_SIGNING_KEY must be exactly 64 characters (or valid Base64 equivalent) in production."
      );
    }
  }

  if (!ephemeralKeyPair) {
    ephemeralKeyPair = generateKeyPair();
  }
  if (!warnedAboutEphemeralKey) {
    console.warn(
      "COVENANT_EVIDENCE_SIGNING_KEY is not configured; evidence signatures are ephemeral and development-only.",
    );
    warnedAboutEphemeralKey = true;
  }
  return ephemeralKeyPair;
}

/** Return the public key corresponding to the configured evidence signer. */
export function getServerPublicKey(): string {
  return resolveSigningKeyPair().publicKeyB64;
}

function assertJsonValue(value: unknown): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot encode non-finite numbers.");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertJsonValue);
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach(assertJsonValue);
    return;
  }
  throw new TypeError(`Canonical JSON cannot encode ${typeof value}.`);
}

/**
 * Encode JSON recursively with lexicographically sorted object keys and no
 * insignificant whitespace. String contents are preserved verbatim.
 */
export function canonicalEncode(value: unknown): string {
  assertJsonValue(value);

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalEncode).join(",")}]`;
  }

  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalEncode(value[key])}`);
  return `{${entries.join(",")}}`;
}

function unsignedEvidence(evidence: ExecutionEvidence): UnsignedEvidence {
  const {
    evidence_id,
    evidence_version,
    request_commitment,
    authorization,
    execution,
    actor,
    chain,
    intermediaries,
    compliance,
  } = evidence;
  return {
    evidence_id,
    evidence_version,
    request_commitment,
    authorization,
    execution,
    actor,
    chain,
    ...(intermediaries === undefined ? {} : { intermediaries }),
    compliance,
  };
}

function hashUnsignedEvidence(evidence: ExecutionEvidence): string {
  return sha256(canonicalEncode(unsignedEvidence(evidence)));
}

export class AgentEvidenceChain {
  private chainHead: string | null = null;
  private chainDepth = 0;
  private readonly chainId: string;

  constructor(public readonly agentId: string) {
    this.chainId = `chain:${agentId}:${randomUUID()}`;
  }

  getChainHead(): string | null {
    return this.chainHead;
  }

  getChainMetadata(): ExecutionEvidence["chain"] {
    return {
      ...(this.chainHead === null ? {} : { previous_evidence_hash: this.chainHead }),
      chain_depth: this.chainDepth,
      agent_chain_id: this.chainId,
    };
  }

  recordEvidence(evidence: ExecutionEvidence): void {
    if (evidence.actor.agent_id !== this.agentId) {
      throw new Error("Evidence agent does not match this evidence chain.");
    }
    this.chainHead = evidence.signatures.envelope_hash.value;
    this.chainDepth += 1;
  }
}

export class EvidenceGenerator {
  private readonly serverId: string;
  private readonly serverPrivateKey: string;
  readonly serverPublicKey: string;
  private readonly agentChains = new Map<string, AgentEvidenceChain>();
  private readonly evidenceStore = new Map<string, ExecutionEvidence>();

  constructor(serverId: string) {
    const keyPair = resolveSigningKeyPair();
    this.serverId = serverId;
    this.serverPrivateKey = keyPair.privateKeyB64;
    this.serverPublicKey = keyPair.publicKeyB64;
  }

  getServerPublicKey(): string {
    return this.serverPublicKey;
  }

  async generateEvidence(params: GenerateEvidenceParams): Promise<ExecutionEvidence> {
    const evidenceId = randomUUID();
    const now = new Date().toISOString();
    const chain = this.agentChains.get(params.agent_id) ?? new AgentEvidenceChain(params.agent_id);
    this.agentChains.set(params.agent_id, chain);

    const canonicalRequest = canonicalEncode(params.request);
    const unsigned: ExecutionEvidence = {
      evidence_id: evidenceId,
      evidence_version: "1.0",
      request_commitment: {
        hash_algorithm: "sha256",
        hash_value: sha256(canonicalRequest),
        canonicalized_request: canonicalRequest,
      },
      authorization: {
        decision: params.authorization_decision,
        policy_id: params.policy_id,
        decision_reason: params.decision_reason,
        timestamp_utc: now,
      },
      execution: {
        status: params.execution_status,
        result_commitment: {
          hash_algorithm: "sha256",
          hash_value: sha256(canonicalEncode(params.execution_result)),
        },
        duration_ms: params.duration_ms,
        timestamp_utc: now,
      },
      actor: {
        agent_id: params.agent_id,
        agent_public_key: params.agent_public_key,
        server_id: this.serverId,
        server_public_key: this.serverPublicKey,
      },
      chain: chain.getChainMetadata(),
      ...(params.intermediaries === undefined ? {} : { intermediaries: params.intermediaries }),
      compliance: {
        ...(params.regulatory_category === undefined
          ? {}
          : { regulatory_category: params.regulatory_category }),
        ...(params.retention_years === undefined
          ? {}
          : { retention_years: params.retention_years }),
        immutable: true,
        tamper_evident: true,
      },
      signatures: {
        server_signature: {
          algorithm: "Ed25519",
          value: "",
          public_key: this.serverPublicKey,
        },
        envelope_hash: {
          algorithm: "sha256",
          value: "",
        },
      },
    };

    const envelopeHash = hashUnsignedEvidence(unsigned);
    unsigned.signatures.envelope_hash.value = envelopeHash;
    unsigned.signatures.server_signature.value = signMessage(
      Buffer.from(envelopeHash, "utf8"),
      this.serverPrivateKey,
    );

    this.evidenceStore.set(evidenceId, unsigned);
    chain.recordEvidence(unsigned);
    return unsigned;
  }

  verifyEvidence(evidence: ExecutionEvidence): EvidenceVerification {
    try {
      if (evidence.signatures.server_signature.algorithm !== "Ed25519") {
        return { valid: false, reason: "Unsupported evidence signature algorithm." };
      }
      if (evidence.signatures.envelope_hash.algorithm !== "sha256") {
        return { valid: false, reason: "Unsupported evidence hash algorithm." };
      }
      if (
        evidence.actor.server_public_key !==
        evidence.signatures.server_signature.public_key
      ) {
        return { valid: false, reason: "Evidence server public key mismatch." };
      }

      const recomputedHash = hashUnsignedEvidence(evidence);
      if (recomputedHash !== evidence.signatures.envelope_hash.value) {
        return { valid: false, reason: "Evidence envelope hash mismatch." };
      }

      const valid = verifyMessage(
        Buffer.from(recomputedHash, "utf8"),
        evidence.signatures.server_signature.value,
        evidence.signatures.server_signature.public_key,
      );
      return valid
        ? { valid: true }
        : { valid: false, reason: "Ed25519 evidence signature verification failed." };
    } catch (error: unknown) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : "Evidence verification failed.",
      };
    }
  }

  getEvidenceChain(evidenceId: string): ExecutionEvidence[] {
    const chain: ExecutionEvidence[] = [];
    let current = this.evidenceStore.get(evidenceId);

    while (current) {
      chain.unshift(current);
      const previousHash = current.chain.previous_evidence_hash;
      if (!previousHash) break;
      current = Array.from(this.evidenceStore.values()).find(
        (candidate) => candidate.signatures.envelope_hash.value === previousHash,
      );
    }
    return chain;
  }

  queryEvidenceByAgent(agentId: string): ExecutionEvidence[] {
    return Array.from(this.evidenceStore.values())
      .filter((evidence) => evidence.actor.agent_id === agentId)
      .sort(
        (a, b) =>
          new Date(a.authorization.timestamp_utc).getTime() -
          new Date(b.authorization.timestamp_utc).getTime(),
      );
  }

  queryEvidenceByTime(startUtc: string, endUtc: string): ExecutionEvidence[] {
    const start = new Date(startUtc).getTime();
    const end = new Date(endUtc).getTime();
    return Array.from(this.evidenceStore.values())
      .filter((evidence) => {
        const timestamp = new Date(evidence.authorization.timestamp_utc).getTime();
        return timestamp >= start && timestamp <= end;
      })
      .sort(
        (a, b) =>
          new Date(a.authorization.timestamp_utc).getTime() -
          new Date(b.authorization.timestamp_utc).getTime(),
      );
  }
}
