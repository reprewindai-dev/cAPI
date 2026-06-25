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
use crate::intelligence::{IntelligenceLayer, PolicyDecision};
use crate::governance::GovernanceManager;
use crate::webmcp::WEBMCP_UI;
use interlink_mcpapi::{ToolCallRequest, RuntimeResponse, ElicitationStatus, JsonRpcRequest, JsonRpcResponse, CallContext};
use tracing::{info, warn, error};

pub struct AppState {
    pub safety: SafetyEnforcer,
    pub intelligence: IntelligenceLayer,
    pub governance: GovernanceManager,
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
        // Simplified auth for Amphoteric persona detection
        let auth_header = parts.headers.get("Authorization")
            .and_then(|h| h.to_str().ok());

        match auth_header {
            Some(h) if h.starts_with("Bearer ") => Ok(Claims {
                sub: "sovereign-agent-01".to_string(),
                tenant: "quinte-west-node".to_string(),
            }),
            _ => Err((StatusCode::UNAUTHORIZED, Json("Missing or invalid Authorization for Amphoteric Runtime".into()))),
        }
    }
}

pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        // API Persona (Traditional REST/JSON)
        .route("/v2/call", post(handle_tool_call))

        // MCP Persona (JSON-RPC 2.0 / Agentic)
        .route("/mcp", post(handle_mcp_rpc))

        // Web Persona (WebMCP UI)
        .route("/ui", get(handle_ui))

        // Governance
        .route("/v2/governance/:id", get(check_governance))
        .route("/v2/governance/:id/resolve", post(resolve_governance))
        .with_state(state)
}

/// The Web Persona: Serving the WebMCP instrumented UI
async fn handle_ui() -> Html<&'static str> {
    Html(WEBMCP_UI)
}

/// The API Persona: Handles structured tool calls with governance
async fn handle_tool_call(
    State(state): State<Arc<AppState>>,
    _claims: Claims,
    Json(mut request): Json<ToolCallRequest>,
) -> (StatusCode, Json<RuntimeResponse>) {
    info!(persona = "API", tool = request.tool_name, "Amphoteric request received");

    request.context.agent_id = _claims.sub;
    request.context.tenant_id = _claims.tenant;

    let tool = match state.safety.validate_call(&request) {
        Ok(t) => t,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(RuntimeResponse::SafetyViolation { reason: e })),
    };

    match state.intelligence.evaluate(&request, tool.risk_level) {
        PolicyDecision::Deny { reason } => (StatusCode::FORBIDDEN, Json(RuntimeResponse::PolicyDenied { reason })),
        PolicyDecision::RequireGovernance { message } => {
            let id = state.governance.create_elicitation(request);
            (StatusCode::ACCEPTED, Json(RuntimeResponse::GovernanceRequired { elicitation_id: id, message }))
        }
        PolicyDecision::Allow => {
            let mut result = serde_json::json!({ "status": "success", "persona": "API", "data": "Sovereign execution complete" });
            state.safety.redact_result(&mut result);
            (StatusCode::OK, Json(RuntimeResponse::Success { result, trace_id: request.context.trace_id }))
        }
    }
}

/// The MCP Persona: Handles JSON-RPC 2.0 requests
async fn handle_mcp_rpc(
    State(state): State<Arc<AppState>>,
    Json(rpc_req): Json<JsonRpcRequest>,
) -> (StatusCode, Json<JsonRpcResponse>) {
    info!(persona = "MCP", method = rpc_req.method, "Amphoteric JSON-RPC received");

    // Map JSON-RPC to internal ToolCallRequest
    let tool_call = ToolCallRequest {
        session_id: Uuid::new_v4(),
        tool_name: rpc_req.method.clone(),
        arguments: rpc_req.params,
        context: CallContext {
            agent_id: "mcp-agent".to_string(),
            tenant_id: "default".to_string(),
            environment: "edge".to_string(),
            trace_id: "rpc-trace".to_string(),
            is_untrusted_content: false,
            enabled_toolsets: vec!["repo".to_string(), "admin".to_string()],
        },
    };

    // Use unified safety/intelligence layers
    let tool = match state.safety.validate_call(&tool_call) {
        Ok(t) => t,
        Err(e) => return (StatusCode::OK, Json(JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(interlink_mcpapi::JsonRpcError { code: -32602, message: e, data: None }),
            id: rpc_req.id.unwrap_or(serde_json::Value::Null),
        })),
    };

    match state.intelligence.evaluate(&tool_call, tool.risk_level) {
        PolicyDecision::Allow => {
            let result = serde_json::json!({ "status": "executed", "persona": "MCP" });
            (StatusCode::OK, Json(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                result: Some(result),
                error: None,
                id: rpc_req.id.unwrap_or(serde_json::Value::Null),
            }))
        }
        _ => (StatusCode::OK, Json(JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(interlink_mcpapi::JsonRpcError { code: -32000, message: "Governance or Policy block in MCP persona".into(), data: None }),
            id: rpc_req.id.unwrap_or(serde_json::Value::Null),
        })),
    }
}

async fn check_governance(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> Json<Option<ElicitationStatus>> {
    Json(state.governance.get_status(id))
}

#[derive(serde::Deserialize)]
struct ResolveRequest {
    approved: bool,
    justification: Option<String>,
}

async fn resolve_governance(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Json(res): Json<ResolveRequest>,
) -> StatusCode {
    if state.governance.resolve_elicitation(id, res.approved, res.justification).is_ok() {
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}
