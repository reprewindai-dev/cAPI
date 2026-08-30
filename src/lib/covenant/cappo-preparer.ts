import { createHash, randomBytes, randomUUID } from "crypto";

import {
  canonicalJson,
  signCanonicalCapiEnvelope,
  signCappoExecutionRequest,
} from "./http-message-signatures";

export interface PrepareCappoExecutionInput {
  body: Record<string, unknown>;
  executionId: string;
  workspaceId: string;
  actorId: string;
}

export interface PreparedCappoExecution {
  targetUri: string;
  body: string;
  headers: Record<string, string>;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Match Python json.dumps(..., sort_keys=True) for the ASCII identity records. */
function pythonSortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pythonSortedJson).join(", ")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}: ${pythonSortedJson(record[key])}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

function hashPythonSorted(value: unknown): string {
  return sha256Hex(pythonSortedJson(value));
}

function safeWimseSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9.-]/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new Error("WIMSE identity segment is empty after normalization");
  return normalized.slice(0, 96);
}

function base64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function requireConfig(name: string): string {
  const value = process.env[name]?.trim() || "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function prepareCappoExecution(input: PrepareCappoExecutionInput): PreparedCappoExecution {
  const targetUri = requireConfig("CAPPO_EXECUTION_URL");
  const privateKey = requireConfig("COVENANT_HTTP_SIGNING_PRIVATE_KEY");
  const keyId = requireConfig("COVENANT_HTTP_SIGNING_KEY_ID");
  if (!targetUri.endsWith("/v1/exec")) {
    throw new Error("CAPPO_EXECUTION_URL must terminate at /v1/exec");
  }
  if (process.env.NODE_ENV === "production" && !targetUri.startsWith("https://")) {
    throw new Error("CAPPO_EXECUTION_URL must use HTTPS in production");
  }
  if (!input.executionId || !input.workspaceId || !input.actorId) {
    throw new Error("executionId, workspaceId and actorId are required");
  }

  const action = typeof input.body.action === "string" ? input.body.action.trim() : "";
  if (!action) throw new Error("CAPPO request action is required");
  const lease = input.body.capability_lease;
  if (!lease || typeof lease !== "object") throw new Error("capability_lease is required");

  const unsignedBody: Record<string, unknown> = {
    ...input.body,
    workspace_id: input.workspaceId,
    pgl_id: input.actorId,
    capability_lease: {
      ...(lease as Record<string, unknown>),
      execution_id: input.executionId,
    },
  };
  // A caller cannot self-declare CAPPO's decision. The kernel sets its internal
  // ALLOW directive only after the lease-backed consequence evaluator succeeds.
  delete unsignedBody.directive;
  delete unsignedBody.security;

  const nonce = randomBytes(24).toString("base64url");
  const securityPayload = {
    actor_id: input.actorId,
    action,
    data_hash: sha256Hex(canonicalJson(unsignedBody)),
    nonce,
  };
  const security = {
    nonce,
    signature: signCanonicalCapiEnvelope(securityPayload, privateKey),
  };
  const finalObject = { ...unsignedBody, security };
  const body = JSON.stringify(finalObject);
  const bodyHash = sha256Hex(body);

  const now = Math.floor(Date.now() / 1000);
  const expires = now + 60;
  const workload = `wimse://veklom/control-plane/${safeWimseSegment(input.workspaceId)}/execution/${safeWimseSegment(input.executionId)}`;
  const confirmation = { method: "capi-http-signature", key_id: keyId };
  const candidateActHash = sha256Hex(canonicalJson({
    action,
    execution_id: input.executionId,
    workspace_id: input.workspaceId,
    scope: unsignedBody.scope ?? {},
  }));

  const wit = {
    iss: "https://capi.veklom.com",
    sub: workload,
    aud: "https://cappo.veklom.com",
    exp: expires,
    iat: now,
    jti: randomUUID(),
    cnf: confirmation,
    trust_domain: "veklom.com",
    profile_id: input.actorId,
  };
  const ect = {
    iss: "https://capi.veklom.com",
    sub: workload,
    aud: "https://cappo.veklom.com",
    exp: expires,
    iat: now,
    jti: randomUUID(),
    ephemeral_execution_id: input.executionId,
    candidate_act_hash: candidateActHash,
    cnf: confirmation,
    intent_hash: sha256Hex(canonicalJson(unsignedBody)),
    p5_operation_id: input.executionId,
  };
  const authority = {
    authority_id: `authority:${input.executionId}`,
    ephemeral_execution_id: input.executionId,
    scope_hash: sha256Hex(canonicalJson((unsignedBody.scope as Record<string, unknown>) ?? {})),
    policy_decision_hash: sha256Hex(canonicalJson({ decision: "candidate", source: "capi-gatekeeper" })),
    candidate_act_hash: candidateActHash,
    // CAPPO currently normalizes the canonical /v1/exec destination to this
    // fixed digest-domain marker before the preauthorization check.
    destination_hash: "target_hash",
    rights: [action],
    issued_at: now,
    expires_at: expires,
    proof_of_possession: sha256Hex(canonicalJson({
      execution_id: input.executionId,
      workspace_id: input.workspaceId,
      nonce,
    })),
    inbound_truth_state: "ADMISSIBLE",
    required_truth_state: "ADMISSIBLE",
  };
  const wpt = {
    htm: "POST",
    htu: "/v1/exec",
    body_hash: bodyHash,
    wit_hash: hashPythonSorted(wit),
    ect_hash: hashPythonSorted(ect),
    authority_hash: hashPythonSorted(authority),
    jti: randomUUID(),
    cnf: confirmation,
    exp: expires,
  };

  const identityHeaders: Record<string, string> = {
    "workload-identity": base64Json(wit),
    "execution-context": base64Json(ect),
    "workload-proof": base64Json(wpt),
    "veklom-authority": base64Json(authority),
    "x-veklom-actor": input.actorId,
    "x-veklom-nonce": nonce,
  };
  const signatureHeaders = signCappoExecutionRequest(targetUri, body, privateKey, keyId, {
    coveredHeaders: identityHeaders,
  });

  return {
    targetUri,
    body,
    headers: {
      "content-type": "application/json",
      ...identityHeaders,
      ...signatureHeaders,
    },
  };
}
