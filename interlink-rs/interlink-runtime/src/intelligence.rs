use interlink_mcpapi::{ToolCallRequest, RiskLevel};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub enum PolicyDecision {
    Allow,
    Deny { reason: String },
    RequireGovernance { message: String },
}

pub struct IntelligenceLayer {
    // In production, this might hold a Cedar PolicySet or a reference to an OPA agent
}

impl IntelligenceLayer {
    pub fn new() -> Self {
        Self {}
    }

    /// Evaluates the risk and policy for a given tool call
    pub fn evaluate(&self, request: &ToolCallRequest, risk_level: RiskLevel) -> PolicyDecision {
        // 1. Contextual Risk Scoring
        let score = self.calculate_risk_score(request, risk_level);

        // 2. Policy Enforcement
        // Example logic:
        // - If Critical risk -> Always require governance
        // - If Prod environment and High risk -> Require governance
        // - If Dev and Low risk -> Allow

        match (request.context.environment.as_str(), risk_level) {
            (_, RiskLevel::Critical) => PolicyDecision::RequireGovernance {
                message: "Critical risk action requires explicit oversight".to_string()
            },
            ("prod", RiskLevel::High) => PolicyDecision::RequireGovernance {
                message: "High risk action in Production requires approval".to_string()
            },
            ("prod", RiskLevel::Medium) => PolicyDecision::RequireGovernance {
                message: "Medium risk in Production gated by policy".to_string()
            },
            ("dev", RiskLevel::High) => PolicyDecision::Allow, // Dev is more permissive
            (_, _) if score > 80 => PolicyDecision::Deny {
                reason: "Contextual risk score exceeds safety threshold".to_string()
            },
            _ => PolicyDecision::Allow,
        }
    }

    fn calculate_risk_score(&self, _request: &ToolCallRequest, risk_level: RiskLevel) -> u8 {
        // Real implementation would look at:
        // - Agent reputation
        // - Recent anomaly patterns (e.g. rapid fire calls)
        // - Resource sensitivity
        match risk_level {
            RiskLevel::Low => 10,
            RiskLevel::Medium => 40,
            RiskLevel::High => 70,
            RiskLevel::Critical => 95,
        }
    }
}
