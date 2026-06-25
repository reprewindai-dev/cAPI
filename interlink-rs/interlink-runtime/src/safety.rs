use interlink_mcpapi::{Capability, InvocationRequest, RiskLevel};
use jsonschema::JSONSchema;
use serde_json::Value;

pub struct SafetyEnforcer {
    pub registry: Vec<Capability>,
}

impl SafetyEnforcer {
    pub fn new(capabilities: Vec<Capability>) -> Self {
        Self { registry: capabilities }
    }

    /// Primary entry point for capability-aware enforcement
    pub fn validate_invocation(&self, req: &InvocationRequest) -> Result<&Capability, String> {
        // 1. Discovery & Toolset Slicing
        let cap = self.registry.iter()
            .find(|c| c.id == req.capability_id)
            .ok_or_else(|| format!("Capability '{}' not found in registry", req.capability_id))?;

        if !req.context.enabled_toolsets.contains(&cap.toolset) {
            return Err(format!("Toolset '{}' is not enabled for this agent session", cap.toolset));
        }

        // 2. Lockdown Mode: Restrict action-taking while processing untrusted content
        if req.context.is_untrusted_content && cap.risk >= RiskLevel::High {
            return Err("Lockdown Mode: High-risk action blocked during untrusted content analysis".to_string());
        }

        // 3. Schema Enforcement (Shared Source of Truth)
        let schema = JSONSchema::compile(&cap.input_schema)
            .map_err(|e| format!("Invalid capability schema: {}", e))?;

        if let Err(errors) = schema.validate(&req.arguments) {
            let error_msgs: Vec<String> = errors.map(|e| e.to_string()).collect();
            return Err(format!("Input validation failed: {}", error_msgs.join(", ")));
        }

        // 4. Push Protection (Secret Detection)
        self.detect_secrets(&req.arguments)?;

        Ok(cap)
    }

    fn detect_secrets(&self, args: &Value) -> Result<(), String> {
        let args_str = args.to_string();
        if args_str.contains("ghp_") || args_str.contains("sk-") {
            return Err("Security Violation: Credentials detected in tool arguments (Push Protection)".to_string());
        }
        Ok(())
    }

    /// Output Sanitization: Redacts PII/Secrets before returning to the model
    pub fn sanitize_output(&self, result: &mut Value) {
        if let Some(obj) = result.as_object_mut() {
            for (key, value) in obj.iter_mut() {
                let lower_key = key.to_lowercase();
                if lower_key.contains("secret") || lower_key.contains("token") || lower_key.contains("password") {
                    *value = Value::String("[REDACTED]".to_string());
                }
                // Recursive redaction for nested objects
                if value.is_object() || value.is_array() {
                    self.sanitize_output(value);
                }
            }
        } else if let Some(arr) = result.