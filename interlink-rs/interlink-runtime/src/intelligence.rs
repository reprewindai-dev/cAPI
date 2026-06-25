use interlink_mcpapi::{InvocationRequest, Capability, RiskLevel};

#[derive(Debug)]
pub enum PolicyDecision {
    Allow,
    Deny { reason: String },
    RequireApproval { message: String },
}

pub struct PolicyEngine;

impl PolicyEngine {
    /// Evaluates capability semantics and context to reach a decision
    pub fn evaluate(req: &InvocationRequest, cap: &Capability) -> PolicyDecision {
        // 1. Scope Validation
        // In a real system, we'd check req.context.scopes against cap.scopes
        // Here we simulate a "missing scope" check for demonstration
        if cap.id == "admin.delete_all" {
             return PolicyDecision::Deny { reason: "Actor lacks required scope: admin:write".to_string() };
        }

        // 2. Environment-Aware Policy
        match (req.context.environment.as_str(), cap.risk) {
            // High risk in prod always requires approval
            ("prod", RiskLevel::High) => PolicyDecision::RequireApproval {
                message: format!("Operation '{}' on production requires human authorization.", cap.title)
            },
            // Critical risk always requires approval regardless of env
            (_, RiskLevel::Critical) => PolicyDecision::RequireApproval {
                message: "Critical operation requires senior operator oversight.".to_string()
            },
            // Specific block for untrusted content + medium risk (Enhanced Lockdown)
            (_, RiskLevel::Medium) if req.context.is_untrusted_content => PolicyDecision::RequireApproval {
                message: "Elevated risk while processing untrusted content requires verification.".to_string()
            },
            _ => PolicyDecision::Allow,
        }
    }
}
