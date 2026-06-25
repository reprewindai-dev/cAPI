use interlink_mcpapi::{ElicitationRecord, ElicitationStatus, ToolCallRequest};
use dashmap::DashMap;
use uuid::Uuid;
use chrono::Utc;
use std::sync::Arc;

pub struct GovernanceManager {
    pending_elicits: Arc<DashMap<Uuid, ElicitationRecord>>,
}

impl GovernanceManager {
    pub fn new() -> Self {
        Self {
            pending_elicits: Arc::new(DashMap::new()),
        }
    }

    /// Creates a new elicitation request and returns its ID
    pub fn create_elicitation(&self, request: ToolCallRequest) -> Uuid {
        let id = Uuid::new_v4();
        let record = ElicitationRecord {
            id,
            tool_call: request,
            status: ElicitationStatus::Pending,
            created_at: Utc::now(),
            justification: None,
        };
        self.pending_elicits.insert(id, record);
        id
    }

    /// Approves or Denies an elicitation
    pub fn resolve_elicitation(&self, id: Uuid, approved: bool, justification: Option<String>) -> Result<(), String> {
        let mut record = self.pending_elicits.get_mut(&id)
            .ok_or_else(|| "Elicitation not found".to_string())?;

        record.status = if approved { ElicitationStatus::Approved } else { ElicitationStatus::Denied };
        record.justification = justification;
        Ok(())
    }

    pub fn get_status(&self, id: Uuid) -> Option<ElicitationStatus> {
        self.pending_elicits.get(&id).map(|r| r.status.clone())
    }

    pub fn get_record(&self, id: Uuid) -> Option<ElicitationRecord> {
        self.pending_elicits.get(&id).map(|r| r.clone())
    }
}
