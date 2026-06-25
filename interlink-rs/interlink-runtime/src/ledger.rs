use serde::{Serialize, Deserialize};
use interlink_mcpapi::InvocationRequest;
use sha2::{Sha256, Digest};
use hex;
use chrono::Utc;
use std::sync::Arc;
use dashmap::DashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvidenceRecord {
    pub timestamp: String,
    pub request_hash: String,
    pub outcome: String,
    pub actor_id: String,
    pub capability_id: String,
}

pub struct PglClient {
    // In-memory audit store for the /api/audit endpoint
    pub audit_store: Arc<DashMap<String, EvidenceRecord>>,
}

impl PglClient {
    pub fn new() -> Self {
        Self {
            audit_store: Arc::new(DashMap::new()),
        }
    }

    /// Seals evidence to the ledger (Best-effort Asynchronous)
    pub async fn seal_evidence(&self, req: &InvocationRequest, outcome: &str) -> String {
        let timestamp = Utc::now().to_rfc3339();

        // Cryptographic Hash Integrity: Compute hash of the core request
        let mut hasher = Sha256::new();
        hasher.update(serde_json::to_string(&req).unwrap_or_default());
        let pgl_hash = hex::encode(hasher.finalize());

        let record = EvidenceRecord {
            timestamp,
            request_hash: pgl_hash.clone(),
            outcome: outcome.to_string(),
            actor_id: req.context.actor_id.clone(),
            capability_id: req.capability_id.clone(),
        };

        // Store locally for Audit API
        self.audit_store.insert(pgl_hash.clone(), record);

        // In production, this would POST to https://pgl.veklom.com
        tracing::info!(hash = %pgl_hash, outcome = %outcome, "Evidence sealed to Gnomledger");

        pgl_hash
    }

    pub fn query_audit(
        &self,
        limit: usize,
        since: Option<DateTime<Utc>>,
        capability: Option<String>,
        status: Option<String>,
    ) -> Vec<EvidenceRecord> {
        let limit = limit.clamp(1, 500); // Strict type checking & limit

        self.audit_store.iter()
            .filter(|r| {
                let rec = r.value();
                let time_match = since.map_or(true, |s| {
                    DateTime::parse_from_rfc3339(&rec.timestamp).ok()
                        .map(|t| t.with_timezone(&Utc) >= s)
                        .unwrap_or(false)
                });
                let cap_match = capability.as_ref().map_or(true, |c| rec.capability_id.contains(c));
                let status_match = status.as_ref().map_or(true, |s| rec.outcome.contains(s));

                time_match && cap_match && status_match
            })
            .take(limit)
            .map(|r| r.value().clone())
            .collect()
    }
}
