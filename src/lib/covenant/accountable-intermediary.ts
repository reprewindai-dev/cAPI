/**
 * Signed accountability receipts for MCP gateways and intermediaries.
 *
 * Each receipt commits to the received request, intermediary decision, and
 * resulting action. Keys and signatures use base64 DER/base64 primitives.
 */

import { randomUUID } from "node:crypto";
import { canonicalEncode } from "./evidence-standard";
import { sha256, signMessage, verifyMessage } from "./crypto";
import type { JsonObject, JsonValue } from "./evidence-standard";

export interface IntermediaryReceipt {
  receipt_id: string;
  receipt_version: "1.0";
  intermediary_id: string;
  intermediary_public_key: string;
  received_request: {
    request_id: string;
    request_hash: { algorithm: "sha256"; value: string };
    received_at_utc: string;
  };
  decision: {
    type: "forwarded" | "cached" | "denied" | "transformed" | "queued";
    reason: string;
    timestamp_utc: string;
  };
  action: {
    forwarded_to?: {
      server_id: string;
      server_endpoint: string;
      timestamp_sent_utc: string;
    };
    denial_reason?: string;
    denial_code?: number;
    cache_key?: string;
    cache_ttl_seconds?: number;
    cache_hit?: boolean;
    transformations?: Array<{
      type: "header_added" | "header_removed" | "body_modified";
      field?: string;
      reason?: string;
    }>;
    processing_duration_ms: number;
  };
  downstream?: {
    downstream_receipt_hash?: string;
    response_hash?: { algorithm: "sha256"; value: string };
  };
  signature: { algorithm: "Ed25519"; value: string };
  receipt_hash: { algorithm: "sha256"; value: string };
  chain: {
    previous_intermediary_receipt_hash?: string;
    position_in_path: number;
  };
}

interface UnsignedReceipt {
  receipt_id: string;
  receipt_version: "1.0";
  intermediary_id: string;
  intermediary_public_key: string;
  received_request: IntermediaryReceipt["received_request"];
  decision: IntermediaryReceipt["decision"];
  action: IntermediaryReceipt["action"];
  downstream?: IntermediaryReceipt["downstream"];
  chain: IntermediaryReceipt["chain"];
}

function unsignedReceipt(receipt: IntermediaryReceipt): UnsignedReceipt {
  return {
    receipt_id: receipt.receipt_id,
    receipt_version: receipt.receipt_version,
    intermediary_id: receipt.intermediary_id,
    intermediary_public_key: receipt.intermediary_public_key,
    received_request: receipt.received_request,
    decision: receipt.decision,
    action: receipt.action,
    ...(receipt.downstream === undefined ? {} : { downstream: receipt.downstream }),
    chain: receipt.chain,
  };
}

export class ManagedIntermediary {
  private readonly receipts = new Map<string, IntermediaryReceipt>();
  private downstreamServer?: { id: string; endpoint: string };

  constructor(
    private readonly intermediaryId: string,
    private readonly intermediaryPrivateKeyB64: string,
    readonly intermediaryPublicKey: string,
  ) {}

  connectDownstream(serverId: string, serverEndpoint: string): void {
    this.downstreamServer = { id: serverId, endpoint: serverEndpoint };
  }

  async processRequest(params: {
    request_id: string;
    request: JsonObject;
    rate_limit_check?: () => { allowed: boolean; reason?: string };
    policy_check?: () => { allowed: boolean; reason?: string };
    cache_check?: () => { cached: boolean; response?: JsonValue; reason?: string };
  }): Promise<{
    receipt: IntermediaryReceipt;
    forwarded_to_backend?: { endpoint: string };
    cached_response?: JsonValue;
  }> {
    const receiptId = randomUUID();
    const now = new Date().toISOString();
    const startTime = Date.now();
    const requestHash = sha256(canonicalEncode(params.request));
    const rateCheck = params.rate_limit_check?.() ?? { allowed: true };
    if (!rateCheck.allowed) {
      return {
        receipt: this.createReceipt({
          receipt_id: receiptId,
          decision_type: "denied",
          decision_reason: rateCheck.reason ?? "rate_limit_exceeded",
          request_id: params.request_id,
          request_hash: requestHash,
          denial_code: 429,
          processing_duration_ms: Date.now() - startTime,
          now,
        }),
      };
    }

    const policyCheck = params.policy_check?.() ?? { allowed: true };
    if (!policyCheck.allowed) {
      return {
        receipt: this.createReceipt({
          receipt_id: receiptId,
          decision_type: "denied",
          decision_reason: policyCheck.reason ?? "policy_denied",
          request_id: params.request_id,
          request_hash: requestHash,
          denial_code: 403,
          processing_duration_ms: Date.now() - startTime,
          now,
        }),
      };
    }

    const cacheCheck = params.cache_check?.();
    if (cacheCheck?.cached && cacheCheck.response !== undefined) {
      return {
        receipt: this.createReceipt({
          receipt_id: receiptId,
          decision_type: "cached",
          decision_reason: cacheCheck.reason ?? "cache_hit",
          request_id: params.request_id,
          request_hash: requestHash,
          response_hash: sha256(canonicalEncode(cacheCheck.response)),
          processing_duration_ms: Date.now() - startTime,
          now,
        }),
        cached_response: cacheCheck.response,
      };
    }

    if (this.downstreamServer) {
      const forwardedTo = {
        server_id: this.downstreamServer.id,
        server_endpoint: this.downstreamServer.endpoint,
        timestamp_sent_utc: new Date().toISOString(),
      };
      return {
        receipt: this.createReceipt({
          receipt_id: receiptId,
          decision_type: "forwarded",
          decision_reason: "within_limits_and_policy",
          request_id: params.request_id,
          request_hash: requestHash,
          forwarded_to: forwardedTo,
          processing_duration_ms: Date.now() - startTime,
          now,
        }),
        forwarded_to_backend: { endpoint: this.downstreamServer.endpoint },
      };
    }
    return {
      receipt: this.createReceipt({
        receipt_id: receiptId,
        decision_type: "queued",
        decision_reason: "no_downstream_configured",
        request_id: params.request_id,
        request_hash: requestHash,
        processing_duration_ms: Date.now() - startTime,
        now,
      }),
    };
  }

  private createReceipt(params: {
    receipt_id: string;
    decision_type: IntermediaryReceipt["decision"]["type"];
    decision_reason: string;
    request_id: string;
    request_hash: string;
    denial_code?: number;
    response_hash?: string;
    forwarded_to?: NonNullable<IntermediaryReceipt["action"]["forwarded_to"]>;
    processing_duration_ms: number;
    now: string;
  }): IntermediaryReceipt {
    const unsigned: UnsignedReceipt = {
      receipt_id: params.receipt_id,
      receipt_version: "1.0",
      intermediary_id: this.intermediaryId,
      intermediary_public_key: this.intermediaryPublicKey,
      received_request: {
        request_id: params.request_id,
        request_hash: { algorithm: "sha256", value: params.request_hash },
        received_at_utc: params.now,
      },
      decision: {
        type: params.decision_type,
        reason: params.decision_reason,
        timestamp_utc: params.now,
      },
      action: {
        ...(params.forwarded_to === undefined ? {} : { forwarded_to: params.forwarded_to }),
        ...(params.denial_code === undefined
          ? {}
          : { denial_code: params.denial_code, denial_reason: params.decision_reason }),
        processing_duration_ms: params.processing_duration_ms,
      },
      chain: { position_in_path: 0 },
      ...(params.response_hash === undefined
        ? {}
        : {
            downstream: {
              response_hash: { algorithm: "sha256", value: params.response_hash },
            },
          }),
    };
    const receiptHash = sha256(canonicalEncode(unsigned));
    const receipt: IntermediaryReceipt = {
      ...unsigned,
      signature: {
        algorithm: "Ed25519",
        value: signMessage(Buffer.from(receiptHash, "utf8"), this.intermediaryPrivateKeyB64),
      },
      receipt_hash: { algorithm: "sha256", value: receiptHash },
    };
    this.receipts.set(receipt.receipt_id, receipt);
    return receipt;
  }

  verifyReceipt(receipt: IntermediaryReceipt): { valid: boolean; reason?: string } {
    try {
      if (receipt.signature.algorithm !== "Ed25519") {
        return { valid: false, reason: "Unsupported signature algorithm" };
      }
      if (receipt.receipt_hash.algorithm !== "sha256") {
        return { valid: false, reason: "Unsupported hash algorithm" };
      }
      if (receipt.intermediary_public_key !== this.intermediaryPublicKey) {
        return { valid: false, reason: "Intermediary public key mismatch" };
      }
      const recomputedHash = sha256(canonicalEncode(unsignedReceipt(receipt)));
      if (recomputedHash !== receipt.receipt_hash.value) {
        return { valid: false, reason: "Receipt hash mismatch" };
      }
      return verifyMessage(
        Buffer.from(recomputedHash, "utf8"),
        receipt.signature.value,
        receipt.intermediary_public_key,
      )
        ? { valid: true }
        : { valid: false, reason: "Signature verification failed" };
    } catch (error: unknown) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : "Receipt verification failed",
      };
    }
  }

  getReceipts(): IntermediaryReceipt[] {
    return Array.from(this.receipts.values());
  }
}
