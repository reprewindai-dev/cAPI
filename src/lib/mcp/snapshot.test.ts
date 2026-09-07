import { describe, it, expect } from 'vitest';
import { generateSnapshot, verifySnapshot } from './snapshot';

describe('Capability Snapshot Signatures (x402 Fail-Closed)', () => {
  it('generates a valid snapshot and signature', () => {
    const caps = [{ id: 'test', name: 'read' }];
    const result = generateSnapshot(caps, 'agent-123');
    
    expect(result.snapshot.agent_id).toBe('agent-123');
    expect(result.snapshot.capabilities).toEqual(caps);
    expect(result.signature).toBeDefined();
    
    // Verify the signature against the hash
    const isValid = verifySnapshot(result.snapshot.hash, result.signature);
    expect(isValid).toBe(true);
  });

  it('rejects tampered capability hashes', () => {
    const caps = [{ id: 'test', name: 'read' }];
    const result = generateSnapshot(caps, 'agent-123');
    
    // Tamper the hash but keep the original signature
    const tamperedHash = 'ffff' + result.snapshot.hash.substring(4);
    
    const isValid = verifySnapshot(tamperedHash, result.signature);
    expect(isValid).toBe(false);
  });
  
  it('rejects tampered capability signatures', () => {
    const caps = [{ id: 'test', name: 'read' }];
    const result = generateSnapshot(caps, 'agent-123');

    // Flip one actual signature byte so this test can never accidentally leave
    // the original signature unchanged because of a coincidentally equal text character.
    const tamperedBytes = Buffer.from(result.signature, 'base64');
    tamperedBytes[0] ^= 0x01;
    const tamperedSig = tamperedBytes.toString('base64');

    const isValid = verifySnapshot(result.snapshot.hash, tamperedSig);
    expect(isValid).toBe(false);
  });

  it('rejects noncanonical Base64 encodings', () => {
    const caps = [{ id: 'test', name: 'read' }];
    const result = generateSnapshot(caps, 'agent-123');
    const noncanonical = `${result.signature}\n`;

    expect(verifySnapshot(result.snapshot.hash, noncanonical)).toBe(false);
  });
});
