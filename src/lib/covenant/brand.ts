/**
 * Centralized product identity.
 *
 * Covenant is the unified governed connection layer: a single call that
 * discovers, authorizes, executes, proves, and learns. Renaming the product
 * is a one-line change here — every surface reads from these constants.
 */

export const BRAND = {
  name: "Covenant",
  protocol: "Covenant Protocol",
  /** A single governed call through the protocol. */
  unit: "covenant",
  unitPlural: "covenants",
  version: "2.0.0",
  tagline: "The governed connection layer.",
  subtagline:
    "One call that discovers, authorizes, executes, proves, and learns. MCP asks what you can do. APIs do it. Covenant does both — and proves it.",
  ledgerName: "PGL",
  ledgerLongName: "Persistent Governance Ledger",
  ecosystem: "Veklom",
} as const;

export type Brand = typeof BRAND;
