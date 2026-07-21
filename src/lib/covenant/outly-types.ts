export interface ActorIdentity {
  actor_id: string;
  actor_type: 'agent' | 'user' | 'service';
  public_key?: string | null;
}

export interface RequestedSideEffect {
  action: string;
  description: string;
  lane: 1 | 2 | 3;
  amount_minor?: number | null;
  currency?: string | null;
  parameters?: any;
}

export interface ProposedActionV1 {
  workspace_id: string;
  tenant_id: string;
  connection_id: string;
  connection_version: string;
  action_id: string;
  execution_id: string;
  actor_identity: ActorIdentity;
  capability_id: string;
  capability_version: string;
  policy_version: string;
  nonce: string;
  idempotency_key: string;
  timestamp: string;
  expires_at: string;
  requested_side_effect: RequestedSideEffect;
}

export interface DecisionModification {
  field: string;
  value?: any;
  reason: string;
}

export interface CappoAuthorizationReference {
  authorization_id: string;
  lane: 1 | 2 | 3;
  decision_hash?: string | null;
}

export interface EvidenceReference {
  evidence_id: string;
  entry_hash: string;
  ledger: string;
}

export interface DecisionV1 {
  workspace_id: string;
  tenant_id: string;
  connection_id: string;
  connection_version: string;
  action_id: string;
  execution_id: string;
  capability_id: string;
  capability_version: string;
  policy_version: string;
  nonce: string;
  idempotency_key: string;
  decision: 'ALLOW' | 'DENY' | 'MODIFY' | 'HUMAN_REVIEW';
  modifications?: DecisionModification[];
  human_review_required: boolean;
  cappo_authorization_reference?: CappoAuthorizationReference | null;
  evidence_reference: EvidenceReference | null;
  timestamp: string;
  expires_at: string;
}

export interface ResultReference {
  output_hash?: string | null;
  error_code?: string | null;
}

export interface ActionOutcomeV1 {
  workspace_id: string;
  tenant_id: string;
  connection_id: string;
  connection_version: string;
  action_id: string;
  execution_id: string;
  capability_id: string;
  capability_version: string;
  decision: 'ALLOW' | 'DENY' | 'MODIFY' | 'HUMAN_REVIEW';
  outcome_status: 'SUCCEEDED' | 'FAILED' | 'PARTIALLY_SUCCEEDED' | 'NOT_EXECUTED';
  idempotency_key: string;
  nonce: string;
  evidence_reference: EvidenceReference;
  timestamp: string;
  result_reference?: ResultReference | null;
}
