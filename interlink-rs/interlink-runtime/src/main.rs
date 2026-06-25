use std::sync::Arc;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use interlink_mcpapi::{Tool, RiskLevel};
use crate::router::{AppState, create_router};
use crate::safety::SafetyEnforcer;
use crate::intelligence::IntelligenceLayer;
use crate::governance::GovernanceManager;

mod safety;
mod intelligence;
mod governance;
mod router;
mod webmcp;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize Amphoteric Observability (AgentOps + Web Performance)
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 2026 Sovereign Tool Catalog
    // Tools are shared across API, MCP, and WebMCP personas
    let tools = vec![
        Tool {
            name: "submit_feedback".to_string(),
            description: "Submits user feedback to the edge node (WebMCP Declarative)".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": { "feedback": { "type": "string" } }
            }),
            output_schema: None,
            risk_level: RiskLevel::Low,
            toolset: "feedback".to_string(),
        },
        Tool {
            name: "get_edge_diagnostics".to_string(),
            description: "Retrieves local sensor data from the Quinte West edge node (WebMCP Imperative)".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": { "include_telemetry": { "type": "boolean" } }
            }),
            output_schema: None,
            risk_level: RiskLevel::Medium,
            toolset: "diagnostics".to_string(),
        },
        Tool {
            name: "sync_v2_data".to_string(),
            description: "Synchronizes data between Backends (MCP Persona)".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": { "payload": { "type": "string" } }
            }),
            output_schema: None,
            risk_level: RiskLevel::High,
            toolset: "admin".to_string(),
        },
    ];

    // Initialize Unified Amphoteric Layers
    let state = Arc::new(AppState {
        safety: SafetyEnforcer::new(tools),
        intelligence: IntelligenceLayer::new(),
        governance: GovernanceManager::new(),
    });

    // Build the Amphoteric Router (Unifying Web, API, and MCP)
    let app = create_router(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    tracing::info!(
        runtime = "Amphoteric",
        location = "Quinte West Edge",
        infrastructure = "Starlink / Execulink Hybrid",
        address = %addr,
        "Sovereign Agentic Runtime Initialized"
    );

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
