#!/usr/bin/env python3
"""Emit the versioned Trust Connection JSON Schemas (v1).

Canonical source for the language-neutral contracts. Run from the repo root:

    python3 contracts/scripts/emit-schemas.py

Writes contracts/schemas/v1/*.schema.json. Checked-in output must match.
"""
import json
import os

BASE = os.path.join(os.path.dirname(__file__), "..", "schemas", "v1")

def s(name, props, required=None, desc=""):
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": f"https://capi.veklom.com/contracts/schemas/v1/{name}.schema.json",
        "title": name,
        "description": desc,
        "type": "object",
        "additionalProperties": False,
        "required": required or list(props.keys()),
        "properties": props,
    }

STR = {"type": "string"}
OPT_STR = {"type": ["string", "null"]}
DT = {"type": "string", "format": "date-time"}
OPT_DT = {"type": ["string", "null"], "format": "date-time"}
INT = {"type": "integer"}
OPT_INT = {"type": ["integer", "null"]}
MONEY = {"type": "integer", "description": "Integer minor units. No floating-point monetary values."}
LANE = {"type": "integer", "enum": [1, 2, 3]}
JSON_OBJ = {"type": ["object", "null"]}

SCHEMAS = {
    "TrustConnectionV1": s("TrustConnectionV1", {
        "connection_id": STR,
        "connection_version": STR,
        "workspace_id": STR,
        "state": {"type": "string", "enum": ["proposed", "active", "suspended", "terminated"]},
        "schema_version": STR,
        "policy_version": STR,
        "participants": {"type": "array", "items": {"$ref": "ConnectionParticipantV1.schema.json"}},
        "created_at": DT,
        "updated_at": DT,
        "terminated_at": OPT_DT,
    }, desc="A governed Trust Connection between participants in a workspace."),
    "ConnectionParticipantV1": s("ConnectionParticipantV1", {
        "participant_id": STR,
        "identity_id": STR,
        "role": STR,
        "display_name": OPT_STR,
        "public_key_id": OPT_STR,
    }, desc="A participant identity bound to a Trust Connection."),
    "ConnectionCapabilityGrantV1": s("ConnectionCapabilityGrantV1", {
        "grant_id": STR,
        "connection_id": STR,
        "capability_id": STR,
        "capability_version": STR,
        "lane": LANE,
        "granted_at": DT,
        "expires_at": OPT_DT,
        "revoked_at": OPT_DT,
        "constraints": JSON_OBJ,
    }, desc="A capability granted to a connection, pinned to a lane."),
    "ConnectionCapabilityTokenV1": s("ConnectionCapabilityTokenV1", {
        "token_id": STR,
        "connection_id": STR,
        "grant_id": STR,
        "capability_id": STR,
        "subject_identity_id": STR,
        "issued_at": DT,
        "expires_at": DT,
        "nonce": STR,
        "key_id": STR,
        "signature": STR,
    }, desc="A short-lived, signed capability token (EAT-style) presented per invocation."),
    "ConnectionOperationV1": s("ConnectionOperationV1", {
        "workspace_id": STR,
        "connection_id": STR,
        "connection_version": STR,
        "operation_id": STR,
        "attempt_id": STR,
        "capability_id": STR,
        "capability_version": STR,
        "operation_hash": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"},
        "schema_version": STR,
        "subject_identity": {"$ref": "ExecutionIdentityV1.schema.json"},
        "target_resource": STR,
        "issued_at": DT,
        "expires_at": DT,
        "nonce": STR,
        "idempotency_key": STR,
        "trace_id": STR,
        "policy_version": STR,
    }, desc="The envelope every governed operation must carry. All fields required."),
    "OperationResultV1": s("OperationResultV1", {
        "operation_id": STR,
        "attempt_id": STR,
        "execution_id": STR,
        "state": {"type": "string", "enum": ["pending", "awaiting_approval", "authorized", "executing", "completed", "failed", "denied"]},
        "lane": LANE,
        "result_hash": OPT_STR,
        "error_code": OPT_STR,
        "receipts": {"type": "array", "items": {"$ref": "PGLReceiptReferenceV1.schema.json"}},
        "completed_at": OPT_DT,
    }, desc="Typed result of a governed operation."),
    "ExecutionIdentityV1": s("ExecutionIdentityV1", {
        "identity_id": STR,
        "principal_id": STR,
        "delegation_chain": {"type": "array", "items": STR},
    }, desc="Verified identity under which an operation executes."),
    "RouteSnapshotV1": s("RouteSnapshotV1", {
        "route_snapshot_id": STR,
        "resolved_at": DT,
        "candidate_count": INT,
        "ttl_seconds": INT,
    }, desc="Frozen route resolution used for an execution."),
    "ApprovalReceiptV1": s("ApprovalReceiptV1", {
        "approval_id": STR,
        "execution_id": STR,
        "approver_identity_id": STR,
        "approved_at": DT,
        "signature_key_id": STR,
        "signature": STR,
    }, desc="Signed record of a human/agent approval decision."),
    "PGLReceiptReferenceV1": s("PGLReceiptReferenceV1", {
        "receipt_id": STR,
        "ledger": STR,
        "entry_hash": {"type": "string", "pattern": "^sha256:[0-9a-f]{64}$"},
        "anchored_at": OPT_DT,
    }, desc="Reference to a PGL evidence-chain entry."),
    "MeasurementReferenceV1": s("MeasurementReferenceV1", {
        "measurement_id": STR,
        "window_id": OPT_STR,
        "recorded_at": DT,
    }, desc="Reference to a VNP measurement record."),
    "SettlementReferenceV1": s("SettlementReferenceV1", {
        "settlement_id": STR,
        "amount_minor": MONEY,
        "currency": STR,
        "network": OPT_STR,
        "tx_hash": OPT_STR,
        "settled_at": OPT_DT,
    }, desc="Reference to an x402/CAPPO settlement. Money in integer minor units."),
    "ConnectionEventV1": s("ConnectionEventV1", {
        "event_id": STR,
        "connection_id": STR,
        "event_type": {"type": "string", "enum": [
            "connection_proposed", "connection_activated", "capability_granted",
            "capability_revoked", "execution_requested", "execution_approved",
            "execution_completed", "execution_failed", "receipt_issued",
            "measurement_recorded", "settlement_recorded", "connection_terminated",
        ]},
        "occurred_at": DT,
        "operation_id": OPT_STR,
        "execution_id": OPT_STR,
        "payload": JSON_OBJ,
        "cursor": STR,
    }, desc="Ordered event on a connection timeline / subscription stream."),
}

def main():
    os.makedirs(BASE, exist_ok=True)
    for name, schema in SCHEMAS.items():
        path = os.path.join(BASE, f"{name}.schema.json")
        with open(path, "w") as f:
            json.dump(schema, f, indent=2)
            f.write("\n")
        print(f"wrote {path}")

if __name__ == "__main__":
    main()
