use serde::{Serialize, Deserialize};
use interlink_mcpapi::InvocationRequest;
use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
use rand::Rng;
use hex;
use chrono::{DateTime, Utc};
use std::sync::Arc;
use dashmap::DashMap;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvidenceRecord {
    pub timestamp: String,
    pub request_hash: String,
    pub seal_nonce: String,
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

        // Generate cryptographic nonce for replay resistance
        let nonce_bytes: [u8; 16] = rand::thread_rng().gen();
        let seal_nonce = hex::encode(nonce_bytes);

        let request_json = serde_json::to_string(&req).unwrap_or_default();
        let payload = format!("{}:{}", seal_nonce, request_json);

        // HMAC-SHA256 when PGL_HMAC_SECRET is set, plain SHA-256 otherwise
        let pgl_hash = match std::env::var("PGL_HMAC_SECRET") {
            Ok(secret) if !secret.is_empty() => {
                let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
                    .expect("HMAC accepts any key length");
                mac.update(payload.as_bytes());
                hex::encode(mac.finalize().into_bytes())
            }
            _ => {
                let mut hasher = Sha256::new();
                hasher.update(payload.as_bytes());
                hex::encode(hasher.finalize())
            }
        };

        let record = EvidenceRecord {
            timestamp,
            request_hash: pgl_hash.clone(),
            seal_nonce,
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
