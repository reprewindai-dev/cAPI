use interlink_mcpapi::{ElicitationRecord, ElicitationStatus, InvocationRequest};
use dashmap::DashMap;
use uuid::Uuid;
use chrono::Utc;
use std::sync::Arc;

pub struct GovernanceBroker {
    pending: Arc<DashMap<Uuid, ElicitationRecord>>,
}

impl GovernanceBroker {
    pub fn new() -> Self {
        Self {
            pending: Arc::new(DashMap::new()),
        }
    }

    pub fn request_approval(&self, req: InvocationRequest) -> Uuid {
        let id = Uuid::new_v4();
        let record = ElicitationRecord {
            id,
            request: req,
            status: ElicitationStatus::Pending,
            created_at: Utc::now(),
            justification: None,
        };
        self.pending.insert(id, record);
        id
    }

    pub fn resolve(&self, id: Uuid, approved: bool, justification: Option<String>) -> Result<(), String> {
        let mut record = self.pending.get_mut(&id)
            .ok_or_else(|| "Elicitation record not found".to_string())?;

        record.status = if approved { ElicitationStatus::Approved } else { ElicitationStatus::Denied };
        record.justification = justification;
        Ok(())
    }

    pub fn get_status(&self, id: Uuid) -> Option<ElicitationStatus> {
        self.pending.get(&id).map(|r| r.status)
    }
}
