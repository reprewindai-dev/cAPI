use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

/// MCPAPI v2.0 Governance Specification
pub const GOVERNANCE_SPEC: &str = "2.0.0";

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
    },
    SafetyViolation {
        reason: String,
    },
    GovernanceRequired {
        elicitation_id: Uuid,
        message: String,
    },
    PolicyDenied {
        reason: String,
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
