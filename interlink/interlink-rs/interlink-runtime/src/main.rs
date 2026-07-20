use std::sync::Arc;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use interlink_mcpapi::{Capability, RiskLevel};
use interlink_runtime::{router::{AppState, create_router}, safety::SafetyEnforcer, governance::GovernanceBroker, ledger::PglClient};

// No local mod declarations needed, using interlink_runtime lib

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize AgentOps Telemetry
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Unified Registration Surface: Deriving MCP and API contracts from a single source
    let capabilities = vec![
        Capability {
            id: "github.get_repo".into(),
            title: "Get Repository Details".into(),
            description: "Retrieves metadata for a specific repository.".into(),
            tags: vec!["github".into(), "read".into()],
            risk: RiskLevel::Low,
            scopes: vec!["repo:read".into()],
            input_schema: serde_json::json!({
                "type": "object",
                "properties": { "repo": { "type": "string" } },
                "required": ["repo"]
            }),
            output_schema: serde_json::json!({ "type": "object" }),
            toolset: "github".into(),
        },
        Capability {
            id: "github.create_issue".into(),
            title: "Create Issue".into(),
            description: "Creates a new issue in the target repository.".into(),
            tags: vec!["github".into(), "write".into()],
            risk: RiskLevel::Medium,
            scopes: vec!["repo:write".into()],
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "repo": { "type": "string" },
                    "title": { "type": "string" },
                    "body": { "type": "string" }
                },
                "required": ["repo", "title"]
            }),
            output_schema: serde_json::json!({ "type": "object" }),
            toolset: "github".into(),
        },
        Capability {
            id: "admin.delete_all".into(),
            title: "CRITICAL: Delete All Data".into(),
            description: "Wipes the entire tenant database. IRREVERSIBLE.".into(),
            tags: vec!["admin".into(), "destructive".into()],
            risk: RiskLevel::Critical,
            scopes: vec!["admin:all".into()],
            input_schema: serde_json::json!({ "type": "object" }),
            output_schema: serde_json::json!({ "type": "object" }),
            toolset: "admin".into(),
        },
    ];

    // Initialize Amphoteric State
    let state = Arc::new(AppState {
        safety: SafetyEnforcer::new(capabilities),
        governance: GovernanceBroker::new(),
        ledger: crate::ledger::PglClient::new(),
    });

    let app = create_router(state);

    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(
        category = "Unified MCP-API Runtime",
        runtime = "Amphoteric",
        governance = "MCPAPI v2.0",
        address = %addr,
        "Interlink Gateway Initialized"
    );

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
