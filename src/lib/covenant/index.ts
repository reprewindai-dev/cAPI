/**
 * Covenant barrel — re-exports every module in src/lib/covenant/.
 *
 * Import from '@/lib/covenant' instead of deep relative paths:
 *   import { GovernanceLayer, forwardEvidence, ToolRegistry } from '@/lib/covenant'
 */

export * from './types';
export * from './governance';
export * from './pgl-ledger';
export * from './tool-registry';
export * from './dynamic-mcp';
export * from './mcp-bridge';
export * from './runtime';
export * from './safety';
export * from './intelligence';
export * from './engine';
export * from './crypto';
export * from './brand';
export * from './api';
export * from './seed';
