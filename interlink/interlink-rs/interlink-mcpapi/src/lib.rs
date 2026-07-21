use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use std::collections::BTreeMap;

/// MCPAPI v2.0 Governance Specification
pub const GOVERNANCE_SPEC: &str = "2.0.0";
pub const TRUST_CONNECTION_CONTRACT_VERSION: &str = "veklom.trust_connection.v1";
pub const CONNECTION_CONTEXT_CONTRACT_VERSION: &str = "veklom.connection_context.v1";
pub const CONNECTION_REQUIREMENTS_CONTRACT_VERSION: &str = "veklom.connection_requirements.v1";
pub const ROUTE_SNAPSHOT_CONTRACT_VERSION: &str = "veklom.connection.route_snapshot.v1";
pub const AMPHOTERIC_CONTEXT_CONTRACT_VERSION: &str = "veklom.amphoteric_context.v1";
pub const EXECUTION_IDENTITY_CONTRACT_VERSION: &str = "veklom.execution_identity.v1";
pub const EXECUTION_AUTHORIZATION_CONTRACT_VERSION: &str = "veklom.execution_authorization.v1";
pub const SOURCE_ATTESTATION_CONTRACT_VERSION: &str = "veklom.source_attestation.v1";
pub const PGL_RECEIPT_CONTRACT_VERSION: &str = "veklom.pgl_receipt.v1";
pub const REPLAY_PACKET_CONTRACT_VERSION: &str = "veklom.replay_packet.v1";
pub const ERROR_ENVELOPE_CONTRACT_VERSION: &str = "veklom.error_envelope.v1";

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// Unified Capability Definition (The Shared Root)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Capability {
    pub id: String,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub risk: RiskLevel,
    pub scopes: Vec<String>,
    pub input_schema: serde_json::Value,
    pub output_schema: serde_json::Value,
    pub toolset: String, // For toolset slicing
}

/// Execution Context for a Capability
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CapabilityContext {
    pub tenant_id: String,
    pub actor_id: String,
    pub transport: TransportType,
    pub trace_id: String,
    pub environment: String, // dev, staging, prod
    pub is_untrusted_content: bool, // Triggers "Lockdown Mode"
    pub enabled_toolsets: Vec<String>, // Toolset Slicing
    pub approval_status: Option<ElicitationStatus>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
pub enum TransportType {
    Mcp,
    Http,
    Grpc,
}

/// Standard Request for Capability Invocation
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InvocationRequest {
    pub capability_id: String,
    pub arguments: serde_json::Value,
    pub context: CapabilityContext,
}

/// JSON-RPC 2.0 Primitives (MCP Persona)
#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: serde_json::Value,
    pub id: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub result: Option<serde_json::Value>,
    pub error: Option<JsonRpcError>,
    pub id: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

/// Unified Runtime Responses
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RuntimeResponse {
    Success {
        result: serde_json::Value,
        trace_id: String,
        pgl_hash: Option<String>, // Hash from Gnomledger/PGL
    },
    SafetyViolation {
        reason: String,
        pgl_hash: Option<String>,
    },
    GovernanceRequired {
        elicitation_id: Uuid,
        message: String,
        pgl_hash: Option<String>,
    },
    PolicyDenied {
        reason: String,
        pgl_hash: Option<String>,
    },
    Error {
        message: String,
    },
}

/// Governance / Elicitation
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ElicitationRecord {
    pub id: Uuid,
    pub request: InvocationRequest,
    pub status: ElicitationStatus,
    pub created_at: DateTime<Utc>,
    pub justification: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
pub enum ElicitationStatus {
    Pending,
    Approved,
    Denied,
    TimedOut,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TrustConnectionStatus {
    Planning,
    Active,
    Paused,
    Revoked,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionTransport {
    Rest,
    Mcp,
    WebMcp,
    Ui,
    Internal,
    Queue,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceMode {
    Consequential,
    Full,
    PointerOnly,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FailureBehavior {
    FailClosed,
    FailOpenAsyncQueued,
    DegradeToGeneric,
    ReturnChallenge,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FailureClass {
    Timeout,
    ServiceDown,
    SignatureInvalid,
    CacheStale,
    RequirementsResolutionFailed,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CappoSurface {
    Edge,
    Inside,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HandlerSelectionStrategy {
    DeclaredPriority,
    RegionThenPriority,
    LowestObservedLatency,
    Weighted,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttestationState {
    Pending,
    Approved,
    Rejected,
    Revoked,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReplayPacketState {
    Queued,
    Assembling,
    Ready,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorSeverity {
    Info,
    Warning,
    Error,
    Critical,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ParticipantRef {
    pub participant_type: String,
    pub identity_ref: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionParticipants {
    pub initiator: ParticipantRef,
    pub counterparty: Option<ParticipantRef>,
    pub agents: Vec<ParticipantRef>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionIdentity {
    pub pgl_refs: Vec<String>,
    pub assurance_level: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionProtocol {
    pub detected: ConnectionTransport,
    pub negotiated: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionPolicy {
    pub profile_ref: String,
    pub mode: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionSourceIntegrity {
    pub repogate_attestation_ref: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionExecution {
    pub authority: String,
    pub runtime: String,
    pub cappo_surface: CappoSurface,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionPayment {
    pub scheme: Option<String>,
    pub required: bool,
    pub settlement_ref: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionEvidence {
    pub pgl_receipt_refs: Vec<String>,
    pub replay_ref: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionRevocation {
    pub revoked_at: String,
    pub revoked_by: String,
    pub reason: String,
    pub receipt_ref: Option<String>,
}

/// Canonical product object. Backends may hold projections, but the connection
/// fabric must preserve this connection id and lineage across every lane.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct TrustConnection {
    pub contract_version: String,
    pub connection_id: String,
    pub version: String,
    pub workspace_id: String,
    pub status: TrustConnectionStatus,
    pub participants: ConnectionParticipants,
    pub identity: ConnectionIdentity,
    pub capabilities: Vec<String>,
    pub protocol: ConnectionProtocol,
    pub policy: ConnectionPolicy,
    pub source_integrity: ConnectionSourceIntegrity,
    pub execution: ConnectionExecution,
    pub payment: ConnectionPayment,
    pub evidence: ConnectionEvidence,
    pub created_at: String,
    pub updated_at: String,
    pub revocation: Option<ConnectionRevocation>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionContext {
    pub contract_version: String,
    pub connection_id: String,
    pub operation_id: String,
    pub request_id: String,
    pub workspace_id: String,
    pub actor_id: String,
    pub agent_id: Option<String>,
    pub transport: ConnectionTransport,
    pub protocol_version: Option<String>,
    pub intent: String,
    pub idempotency_key: String,
    pub deadline_at: Option<String>,
    pub trace_id: String,
    pub traceparent: Option<String>,
    pub tracestate: Option<String>,
    pub service_identity_ref: Option<String>,
    pub source_attestation_ref: Option<String>,
    pub policy_profile_ref: Option<String>,
    pub evidence_mode: EvidenceMode,
}

impl ConnectionContext {
    pub fn required_id_fields_present(&self) -> bool {
        !self.connection_id.is_empty()
            && !self.operation_id.is_empty()
            && !self.request_id.is_empty()
            && !self.workspace_id.is_empty()
            && !self.actor_id.is_empty()
            && !self.intent.is_empty()
            && !self.idempotency_key.is_empty()
            && !self.trace_id.is_empty()
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct AmphotericContext {
    pub contract_version: String,
    pub detected_transport: ConnectionTransport,
    pub detected_participant_type: String,
    pub protocol_version: Option<String>,
    pub accepted_response_envelopes: Vec<String>,
    pub requested_capabilities: Vec<String>,
    pub user_agent: Option<String>,
    pub authenticated_identity_ref: Option<String>,
    pub service_identity_ref: Option<String>,
    pub spoofing_warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct LaneRequirement {
    pub lane: String,
    pub scheme: String,
    pub required: bool,
    pub minimum_state: Option<String>,
    pub assurance: Option<String>,
    pub failure_behavior: FailureBehavior,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct PreLaneFailureRule {
    pub intent: String,
    pub failure_class: FailureClass,
    pub behavior: FailureBehavior,
    pub maximum_cache_ttl_seconds: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ConnectionRequirements {
    pub contract_version: String,
    pub connection_id: String,
    pub operation_id: String,
    pub policy_version: String,
    pub issued_at: String,
    pub expires_at: Option<String>,
    pub requirements_hash: String,
    pub pre_lane_failure_rules: Vec<PreLaneFailureRule>,
    pub lanes: Vec<LaneRequirement>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct LaneFailurePolicy {
    pub lane: String,
    pub timeout: FailureBehavior,
    pub service_down: FailureBehavior,
    pub signature_invalid: FailureBehavior,
    pub cache_stale: FailureBehavior,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct LaneHandlerRegistration {
    pub name: String,
    pub version: String,
    pub lane: String,
    pub supported_intents: Vec<String>,
    pub supported_schemes: Vec<String>,
    pub selection_strategy: HandlerSelectionStrategy,
    pub precedence: u32,
    pub timeout_ms: u64,
    pub assurance: String,
    pub fail_policy: LaneFailurePolicy,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct LaneRegistrySnapshot {
    pub registry_version: String,
    pub issued_at: String,
    pub handlers: Vec<LaneHandlerRegistration>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RouteTarget {
    pub resource: String,
    pub tenant: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RouteEndpoint {
    pub handler: String,
    pub endpoint: String,
    pub method: String,
    pub region: Option<String>,
    pub timeout_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RouteIntegrity {
    pub issuer: String,
    pub format: String,
    pub key_id: String,
    pub signature: String,
}

/// Signed projection of authority-owned truths. It does not replace PGL,
/// CAPPO, RepoGate, x402, Replay, or BYOS as native authorities.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct RouteSnapshot {
    pub snapshot_type: String,
    pub version: String,
    pub snapshot_id: String,
    pub workspace_id: String,
    pub connection_id: String,
    pub operation_id: String,
    pub issued_at: String,
    pub expires_at: String,
    pub policy_version: String,
    pub requirements_hash: String,
    pub source: ParticipantRef,
    pub target: RouteTarget,
    pub route: RouteEndpoint,
    pub requirements: BTreeMap<String, String>,
    pub proof: BTreeMap<String, String>,
    pub links: BTreeMap<String, String>,
    pub integrity: RouteIntegrity,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HandlerDecision {
    Verified,
    Challenge,
    Denied,
    Deferred,
    Error,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct HandlerResult {
    pub handler: String,
    pub lane: String,
    pub decision: HandlerDecision,
    pub connection_id: String,
    pub operation_id: String,
    pub evidence_refs: Vec<String>,
    pub retryable: bool,
    pub error_code: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ExecutionIdentity {
    pub contract_version: String,
    pub execution_id: String,
    pub workspace_id: String,
    pub connection_id: String,
    pub operation_id: String,
    pub subject_identity_ref: String,
    pub agent_id: Option<String>,
    pub genome_hash: Option<String>,
    pub source_attestation_ref: Option<String>,
    pub issued_at: String,
    pub expires_at: String,
    pub issuer: String,
    pub key_id: String,
    pub signature: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ExecutionAuthorization {
    pub contract_version: String,
    pub authorization_id: String,
    pub execution_id: String,
    pub workspace_id: String,
    pub connection_id: String,
    pub operation_id: String,
    pub audience: String,
    pub subject_identity_ref: String,
    pub target_resource: String,
    pub capability: String,
    pub method: String,
    pub policy_version: String,
    pub source_attestation_digest: Option<String>,
    pub maximum_side_effects: BTreeMap<String, String>,
    pub issued_at: String,
    pub not_before: String,
    pub expires_at: String,
    pub nonce: String,
    pub single_use: bool,
    pub issuer: String,
    pub key_id: String,
    pub signature: String,
}

impl ExecutionAuthorization {
    pub fn is_sensitive_single_use(&self) -> bool {
        self.single_use
            || self.method.eq_ignore_ascii_case("delete")
            || self.method.eq_ignore_ascii_case("deploy")
            || self.maximum_side_effects.contains_key("payment")
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct SourceAttestation {
    pub contract_version: String,
    pub attestation_id: String,
    pub workspace_id: String,
    pub repository: String,
    pub commit_sha: String,
    pub branch_or_tag: Option<String>,
    pub build_artifact_digest: Option<String>,
    pub container_digest: Option<String>,
    pub policy_findings: Vec<String>,
    pub approval_state: AttestationState,
    pub human_approvals: Vec<String>,
    pub scan_version: String,
    pub slsa_level: Option<String>,
    pub dsse_envelope_ref: Option<String>,
    pub issued_at: String,
    pub attestation_hash: String,
    pub verification_endpoint: String,
    pub issuer: String,
    pub key_id: String,
    pub signature: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct PglReceipt {
    pub contract_version: String,
    pub receipt_id: String,
    pub workspace_id: String,
    pub connection_id: String,
    pub operation_id: String,
    pub execution_id: Option<String>,
    pub subject_identity_ref: String,
    pub native_evidence_refs: Vec<String>,
    pub result_hash: Option<String>,
    pub previous_receipt_hash: Option<String>,
    pub receipt_hash: String,
    pub issued_at: String,
    pub issuer: String,
    pub key_id: String,
    pub signature: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ReplaySegmentRef {
    pub segment_id: String,
    pub content_hash: String,
    pub event_count: u64,
    pub starts_at: String,
    pub ends_at: String,
    pub retrieval_uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ReplayPacket {
    pub contract_version: String,
    pub replay_id: String,
    pub workspace_id: String,
    pub connection_id: String,
    pub operation_id: String,
    pub state: ReplayPacketState,
    pub summary_hash: String,
    pub pgl_receipt_refs: Vec<String>,
    pub cappo_decision_refs: Vec<String>,
    pub repogate_attestation_refs: Vec<String>,
    pub settlement_refs: Vec<String>,
    pub segments: Vec<ReplaySegmentRef>,
    pub verification_endpoint: String,
    pub cursor: Option<String>,
    pub issued_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ErrorEnvelope {
    pub contract_version: String,
    pub error_id: String,
    pub workspace_id: Option<String>,
    pub connection_id: Option<String>,
    pub operation_id: Option<String>,
    pub request_id: Option<String>,
    pub trace_id: Option<String>,
    pub lane: Option<String>,
    pub handler: Option<String>,
    pub code: String,
    pub severity: ErrorSeverity,
    pub message: String,
    pub retryable: bool,
    pub fail_behavior: FailureBehavior,
    pub evidence_ref: Option<String>,
    pub occurred_at: String,
}

#[cfg(test)]
mod trust_connection_contract_tests {
    use super::*;

    #[test]
    fn connection_context_keeps_canonical_ids_explicit() {
        let context = ConnectionContext {
            contract_version: CONNECTION_CONTEXT_CONTRACT_VERSION.to_string(),
            connection_id: "tc_123".to_string(),
            operation_id: "op_123".to_string(),
            request_id: "req_123".to_string(),
            workspace_id: "ws_123".to_string(),
            actor_id: "pgl://human/operator".to_string(),
            agent_id: Some("pgl://agent/procurement".to_string()),
            transport: ConnectionTransport::Mcp,
            protocol_version: Some("mcp/2026-01".to_string()),
            intent: "agent.execute".to_string(),
            idempotency_key: "idem_123".to_string(),
            deadline_at: Some("2026-07-12T00:00:30Z".to_string()),
            trace_id: "trace_123".to_string(),
            traceparent: Some("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01".to_string()),
            tracestate: None,
            service_identity_ref: Some("spiffe://veklom.local/interlink-capi".to_string()),
            source_attestation_ref: Some("rg_123".to_string()),
            policy_profile_ref: Some("policy_123".to_string()),
            evidence_mode: EvidenceMode::Consequential,
        };

        assert!(context.required_id_fields_present());
        let json = serde_json::to_value(&context).expect("context serializes");
        assert_eq!(json["connection_id"], "tc_123");
        assert_eq!(json["operation_id"], "op_123");
        assert_eq!(json["transport"], "mcp");
        assert_eq!(json["service_identity_ref"], "spiffe://veklom.local/interlink-capi");
    }

    #[test]
    fn route_snapshot_is_a_projection_not_a_native_authority() {
        let mut requirements = BTreeMap::new();
        requirements.insert("identity".to_string(), "pgl_verified".to_string());
        requirements.insert("authorization".to_string(), "cappo_eat_v1".to_string());

        let mut proof = BTreeMap::new();
        proof.insert("execution_receipt".to_string(), "pgl_required".to_string());
        proof.insert("source_attestation".to_string(), "repogate_required".to_string());

        let mut links = BTreeMap::new();
        links.insert("receipt_verify".to_string(), "/api/v1/pgl/receipts/verify".to_string());

        let snapshot = RouteSnapshot {
            snapshot_type: ROUTE_SNAPSHOT_CONTRACT_VERSION.to_string(),
            version: "v1".to_string(),
            snapshot_id: "rs_123".to_string(),
            workspace_id: "ws_123".to_string(),
            connection_id: "tc_123".to_string(),
            operation_id: "op_123".to_string(),
            issued_at: "2026-07-12T00:00:00Z".to_string(),
            expires_at: "2026-07-12T00:00:30Z".to_string(),
            policy_version: "pol_123".to_string(),
            requirements_hash: "sha256:abc".to_string(),
            source: ParticipantRef {
                participant_type: "agent".to_string(),
                identity_ref: "pgl://agent/procurement".to_string(),
                display_name: Some("Procurement Agent".to_string()),
            },
            target: RouteTarget {
                resource: "api://supplier-service".to_string(),
                tenant: "ws_123".to_string(),
                status: "available".to_string(),
            },
            route: RouteEndpoint {
                handler: "cappo.exec".to_string(),
                endpoint: "https://api.veklom.com/api/v1/cappo/exec".to_string(),
                method: "POST".to_string(),
                region: Some("us-east".to_string()),
                timeout_ms: 3000,
            },
            requirements,
            proof,
            links,
            integrity: RouteIntegrity {
                issuer: "pgl://service/interlink-capi".to_string(),
                format: "jws".to_string(),
                key_id: "did:web:api.veklom.com#connection-key-1".to_string(),
                signature: "sig".to_string(),
            },
        };

        let json = serde_json::to_value(&snapshot).expect("snapshot serializes");
        assert_eq!(json["snapshot_type"], ROUTE_SNAPSHOT_CONTRACT_VERSION);
        assert_eq!(json["requirements"]["authorization"], "cappo_eat_v1");
        assert_eq!(json["proof"]["source_attestation"], "repogate_required");
    }

    #[test]
    fn requirements_declare_prelane_and_lane_failure_behavior() {
        let requirements = ConnectionRequirements {
            contract_version: CONNECTION_REQUIREMENTS_CONTRACT_VERSION.to_string(),
            connection_id: "tc_123".to_string(),
            operation_id: "op_123".to_string(),
            policy_version: "pol_123".to_string(),
            issued_at: "2026-07-12T00:00:00Z".to_string(),
            expires_at: Some("2026-07-12T00:00:30Z".to_string()),
            requirements_hash: "sha256:requirements".to_string(),
            pre_lane_failure_rules: vec![PreLaneFailureRule {
                intent: "agent.execute".to_string(),
                failure_class: FailureClass::RequirementsResolutionFailed,
                behavior: FailureBehavior::FailClosed,
                maximum_cache_ttl_seconds: Some(30),
            }],
            lanes: vec![LaneRequirement {
                lane: "governance".to_string(),
                scheme: "cappo_eat_v1".to_string(),
                required: true,
                minimum_state: Some("authorized".to_string()),
                assurance: Some("verified".to_string()),
                failure_behavior: FailureBehavior::FailClosed,
            }],
        };

        let json = serde_json::to_value(&requirements).expect("requirements serialize");
        assert_eq!(json["pre_lane_failure_rules"][0]["behavior"], "fail_closed");
        assert_eq!(json["lanes"][0]["failure_behavior"], "fail_closed");
    }

    #[test]
    fn execution_authorization_binds_operation_and_side_effect_scope() {
        let mut maximum_side_effects = BTreeMap::new();
        maximum_side_effects.insert("payment".to_string(), "1000000:USDC_BASE".to_string());

        let authorization = ExecutionAuthorization {
            contract_version: EXECUTION_AUTHORIZATION_CONTRACT_VERSION.to_string(),
            authorization_id: "eat_123".to_string(),
            execution_id: "exec_123".to_string(),
            workspace_id: "ws_123".to_string(),
            connection_id: "tc_123".to_string(),
            operation_id: "op_123".to_string(),
            audience: "byos.runtime".to_string(),
            subject_identity_ref: "pgl://agent/procurement".to_string(),
            target_resource: "api://supplier-service".to_string(),
            capability: "purchase.propose".to_string(),
            method: "post".to_string(),
            policy_version: "pol_123".to_string(),
            source_attestation_digest: Some("sha256:source".to_string()),
            maximum_side_effects,
            issued_at: "2026-07-12T00:00:00Z".to_string(),
            not_before: "2026-07-12T00:00:00Z".to_string(),
            expires_at: "2026-07-12T00:00:30Z".to_string(),
            nonce: "nonce_123".to_string(),
            single_use: false,
            issuer: "did:web:cappo.veklom.com".to_string(),
            key_id: "did:web:cappo.veklom.com#eat-key-1".to_string(),
            signature: "sig".to_string(),
        };

        assert!(authorization.is_sensitive_single_use());
        let json = serde_json::to_value(&authorization).expect("authorization serializes");
        assert_eq!(json["connection_id"], "tc_123");
        assert_eq!(json["operation_id"], "op_123");
        assert_eq!(json["maximum_side_effects"]["payment"], "1000000:USDC_BASE");
    }

    #[test]
    fn replay_packet_is_pointer_first_and_segment_addressable() {
        let packet = ReplayPacket {
            contract_version: REPLAY_PACKET_CONTRACT_VERSION.to_string(),
            replay_id: "replay_123".to_string(),
            workspace_id: "ws_123".to_string(),
            connection_id: "tc_123".to_string(),
            operation_id: "op_123".to_string(),
            state: ReplayPacketState::Ready,
            summary_hash: "sha256:summary".to_string(),
            pgl_receipt_refs: vec!["pgl_receipt_123".to_string()],
            cappo_decision_refs: vec!["cappo_attestation_123".to_string()],
            repogate_attestation_refs: vec!["rg_123".to_string()],
            settlement_refs: vec!["x402_settlement_123".to_string()],
            segments: vec![ReplaySegmentRef {
                segment_id: "segment_1".to_string(),
                content_hash: "sha256:segment".to_string(),
                event_count: 12,
                starts_at: "2026-07-12T00:00:00Z".to_string(),
                ends_at: "2026-07-12T00:00:01Z".to_string(),
                retrieval_uri: "/api/v1/replay/replay_123/segments/segment_1".to_string(),
            }],
            verification_endpoint: "/api/v1/replay/replay_123/verify".to_string(),
            cursor: Some("cursor_123".to_string()),
            issued_at: "2026-07-12T00:00:02Z".to_string(),
        };

        let json = serde_json::to_value(&packet).expect("packet serializes");
        assert_eq!(json["segments"][0]["content_hash"], "sha256:segment");
        assert_eq!(json["verification_endpoint"], "/api/v1/replay/replay_123/verify");
    }
}
