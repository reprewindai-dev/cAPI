use axum::{
    extract::{State, Path, FromRequestParts},
    routing::{post, get},
    Json, Router,
    http::{StatusCode, request::Parts},
    response::Html,
};
use std::sync::Arc;
use uuid::Uuid;
use crate::safety::SafetyEnforcer;
use crate::intelligence::{PolicyEngine, PolicyDecision};
use crate::governance::GovernanceBroker;
use crate::webmcp::WEBMCP_UI;
use crate::ledger::PglClient;
use interlink_mcpapi::{
    InvocationRequest, RuntimeResponse, ElicitationStatus,
    JsonRpcRequest, JsonRpcResponse, CapabilityContext, TransportType, JsonRpcError
};
use chrono::{DateTime, Utc};
use tracing::{info, warn};

pub struct AppState {
    pub safety: SafetyEnforcer,
    pub governance: GovernanceBroker,
    pub ledger: PglClient,
}

pub struct Claims {
    pub sub: String,
    pub tenant: String,
}

#[async_trait::async_trait]
impl<S> FromRequestParts<S> for Claims
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, Json<String>);

    async fn from_request_parts(parts: &Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts.headers.get("Authorization")
            .and_then(|h| h.to_str().ok());

        match auth_header {
            Some(h) if h.starts_with("Bearer ") => Ok(Claims {
                sub: "actor-789".to_string(),
                tenant: "enterprise-alpha".to_string(),
            }),
            _ => Err((StatusCode::UNAUTHORIZED, Json("Missing OIDC/JWT Authorization".into()))),
        }
    }
}

pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        // API Face (REST/Typed)
        .route("/api/v2/invoke", post(handle_api_invocation))

        // MCP Face (JSON-RPC/Agentic)
        .route("/mcp/rpc", post(handle_mcp_rpc))

        // Web Face (Sovereign UI)
        .route("/ui", get(|| async { Html(WEBMCP_UI) }))

        // Audit API (Veklom Standard)
        .route("/api/audit", get(handle_audit_query))

        // Governance Plane
        .route("/governance/status/:id", get(check_gov))
        .route("/governance/resolve/:id", post(resolve_gov))
        .with_state(state)
}

/// The Unified Execution Core: Collapses MCP and API into one logic path
async fn execute_capability(
    state: &Arc<AppState>,
    req: InvocationRequest,
) -> RuntimeResponse {
    // 1. Safety Plane: Validation, Toolset Slicing, Lockdown Mode, Schema
    let cap = match state.safety.validate_invocation(&req) {
        Ok(c) => c,
        Err(e) => {
            let pgl_hash = state.ledger.seal_evidence(&req, &format!("SafetyViolation: {}", e)).await;
            return RuntimeResponse::SafetyViolation { reason: e, pgl_hash: Some(pgl_hash) };
        }
    };

    // 2. Policy Plane: Scope checks, Risk evaluation
    match PolicyEngine::evaluate(&req, cap) {
        PolicyDecision::Deny { reason } => {
            warn!(trace_id = %req.context.trace_id, capability = %cap.id, reason = %reason, "Policy Denied");
            let pgl_hash = state.ledger.seal_evidence(&req, &format!("PolicyDenied: {}", reason)).await;
            RuntimeResponse::PolicyDenied { reason, pgl_hash: Some(pgl_hash) }
        },
        PolicyDecision::RequireApproval { message } => {
            let pgl_hash = state.ledger.seal_evidence(&req, "GovernanceRequired").await;
            let id = state.governance.request_approval(req);
            info!(elicitation_id = %id, "Approval workflow triggered");
            RuntimeResponse::GovernanceRequired { elicitation_id: id, message, pgl_hash: Some(pgl_hash) }
        },
        PolicyDecision::Allow => {
            // 3. Execution Plane: In-memory handler execution
            info!(trace_id = %req.context.trace_id, capability = %cap.id, "Executing capability");

            // Mocking execution based on capability ID
            let mut result = match cap.id.as_str() {
                "github.get_repo" => serde_json::json!({ "name": "interlink-rs", "visibility": "private", "owner": "veklom" }),
                "github.create_issue" => serde_json::json!({ "issue_no": 42, "status": "created", "internal_token": "SENSITIVE_123" }),
                _ => serde_json::json!({ "status": "completed" }),
            };

            // 4. Post-Execution: Output Sanitization (Redaction)
            state.safety.sanitize_output(&mut result);

            let pgl_hash = state.ledger.seal_evidence(&req, "Success").await;
            RuntimeResponse::Success { result, trace_id: req.context.trace_id, pgl_hash: Some(pgl_hash) }
        }
    }
}

#[derive(serde::Deserialize)]
struct AuditQuery {
    limit: Option<usize>,
    since: Option<DateTime<Utc>>,
    capability: Option<String>,
    status: Option<String>,
}

async fn handle_audit_query(
    State(state): State<Arc<AppState>>,
    axum::extract::Query(query): axum::extract::Query<AuditQuery>,
) -> Json<Vec<crate::ledger::EvidenceRecord>> {
    Json(state.ledger.query_audit(
        query.limit.unwrap_or(100),
        query.since,
        query.capability,
        query.status,
    ))
}

async fn handle_api_invocation(
    State(state): State<Arc<AppState>>,
    _claims: Claims,
    Json(mut req): Json<InvocationRequest>,
) -> Json<RuntimeResponse> {
    req.context.actor_id = _claims.sub;
    req.context.tenant_id = _claims.tenant;
    req.context.transport = TransportType::Http;

    Json(execute_capability(&state, req).await)
}

async fn handle_mcp_rpc(
    State(state): State<Arc<AppState>>,
    Json(rpc): Json<JsonRpcRequest>,
) -> Json<JsonRpcResponse> {
    let req = InvocationRequest {
        capability_id: rpc.method.clone(),
        arguments: rpc.params,
        context: CapabilityContext {
            tenant_id: "mcp-tenant".into(),
            actor_id: "mcp-agent".into(),
            transport: TransportType::Mcp,
            trace_id: format!("mcp-{}", Uuid::new_v4()),
            environment: "prod".into(),
            is_untrusted_content: false,
            enabled_toolsets: vec!["github".into()],
            approval_status: None,
        },
    };

    let response = execute_capability(&state, req).await;

    let (result, error) = match response {
        RuntimeResponse::Success { result, .. } => (Some(result), None),
        RuntimeResponse::SafetyViolation { reason } => (None, Some(JsonRpcError { code: -32602, message: reason, data: None })),
        RuntimeResponse::PolicyDenied { reason } => (None, Some(JsonRpcError { code: -32000, message: reason, data: None })),
        RuntimeResponse::GovernanceRequired { message, elicitation_id } => {
            let mut data = serde_json::Map::new();
            data.insert("elicitation_id".into(), serde_json::json!(elicitation_id));
            (None, Some(JsonRpcError { code: -32001, message, data: Some(serde_json::Value::Object(data)) }))
        },
        RuntimeResponse::Error { message } => (None, Some(JsonRpcError { code: -32603, message, data: None })),
    };

    Json(JsonRpcResponse {
        jsonrpc: "2.0".into(),
        result,
        error,
        id: rpc.id.unwrap_or(serde_json::Value::Null),
    })
}

async fn check_gov(State(state): State<Arc<AppState>>, Path(id): Path<Uuid>) -> Json<Option<ElicitationStatus>> {
    Json(state.governance.get_status(id))
}

#[derive(serde::Deserialize)]
struct Resolve { approved: bool, justification: Option<String> }

async fn resolve_gov(State(state): State<Arc<AppState>>, Path(id): Path<Uuid>, Json(res): Json<Resolve>) -> StatusCode {
    if state.governance.resolve(id, res.approved, res.justification).is_ok() {
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}
