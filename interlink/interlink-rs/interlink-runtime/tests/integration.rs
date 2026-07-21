use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt;
use std::sync::Arc;
use interlink_mcpapi::{Capability, RiskLevel};
use interlink_runtime::{router::{AppState, create_router}, safety::SafetyEnforcer, governance::GovernanceBroker, ledger::PglClient};

#[tokio::test]
async fn test_amphoteric_api_persona() {
    let capabilities = vec![
        Capability {
            id: "test.tool".into(),
            title: "Test Tool".into(),
            description: "A tool for testing".into(),
            tags: vec!["test".into()],
            risk: RiskLevel::Low,
            scopes: vec!["test:read".into()],
            input_schema: serde_json::json!({ "type": "object" }),
            output_schema: serde_json::json!({ "type": "object" }),
            toolset: "test".into(),
        },
    ];

    let state = Arc::new(AppState {
        safety: SafetyEnforcer::new(capabilities),
        governance: GovernanceBroker::new(),
        ledger: PglClient::new(),
    });

    let app = create_router(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v2/invoke")
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer mock-token")
                .body(Body::from(serde_json::to_string(&serde_json::json!({
                    "capability_id": "test.tool",
                    "arguments": {},
                    "context": {
                        "tenant_id": "test",
                        "actor_id": "test",
                        "transport": "Http",
                        "trace_id": "test-trace",
                        "environment": "dev",
                        "is_untrusted_content": false,
                        "enabled_toolsets": ["test"]
                    }
                })).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}
