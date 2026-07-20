import crypto from 'crypto';

// In a real production system, this key pair would be securely managed by a KMS or Vault.
// For this runtime prototype, we generate an ephemeral Ed25519 key pair for signing snapshots.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

export interface CapabilitySnapshot {
  agent_id: string | null;
  timestamp: number;
  capabilities: any[];
  hash: string;
}

export function generateSnapshot(capabilities: any[], agentId: string | null): { snapshot: CapabilitySnapshot, signature: string } {
  const timestamp = Date.now();
  
  // Stable stringify for deterministic hashing
  const payload = JSON.stringify({ agent_id: agentId, timestamp, capabilities });
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  
  const snapshot: CapabilitySnapshot = {
    agent_id: agentId,
    timestamp,
    capabilities,
    hash
  };

  const signature = crypto.sign(null, Buffer.from(hash), privateKey).toString('base64');
  
  return { snapshot, signature };
}

export function verifySnapshot(hash: string, signature: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(hash), publicKey, Buffer.from(signature, 'base64'));
  } catch (err) {
    return false;
  }
}
