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

function decodeCanonicalEd25519Signature(signature: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature) || signature.length % 4 !== 0) {
    return null;
  }
  try {
    const decoded = Buffer.from(signature, 'base64');
    if (decoded.length !== 64 || decoded.toString('base64') !== signature) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
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
  const signatureBytes = decodeCanonicalEd25519Signature(signature);
  if (!signatureBytes) return false;
  try {
    return crypto.verify(null, Buffer.from(hash), publicKey, signatureBytes);
  } catch {
    return false;
  }
}
