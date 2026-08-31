import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class OutboundTargetError extends Error {
  constructor(
    public readonly code: string,
    message = "Outbound target is not allowed",
  ) {
    super(message);
    this.name = "OutboundTargetError";
  }
}

type Resolver = (hostname: string) => Promise<string[]>;

export interface OutboundTargetOptions {
  allowedHosts?: string[];
  production?: boolean;
  resolver?: Resolver;
  resolverTimeoutMs?: number;
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function configuredAllowedHosts(): string[] {
  return (process.env.CAPI_MCP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function ipv4Octets(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").map(Number);
}

export function isUnsafeOutboundAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const octets = ipv4Octets(normalized);

  if (octets) {
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && octets[2] === 0) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && octets[2] === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && octets[2] === 100) ||
      (a === 203 && b === 0 && octets[2] === 113) ||
      a >= 224
    );
  }

  if (isIP(normalized) === 6) {
    const value = normalized.toLowerCase();
    return (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      /^fe[89ab]/.test(value) ||
      /^fe[cdef]/.test(value) ||
      value.startsWith("ff") ||
      value.startsWith("::ffff:")
    );
  }

  return false;
}

function isForbiddenHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  );
}

async function resolveWithTimeout(
  resolver: Resolver,
  hostname: string,
  timeoutMs: number,
): Promise<string[]> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new OutboundTargetError("OUTBOUND_DNS_TIMEOUT");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolver(hostname),
      new Promise<string[]>((_, reject) => {
        timer = setTimeout(
          () => reject(new OutboundTargetError("OUTBOUND_DNS_TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function validateOutboundTarget(
  input: string,
  options: OutboundTargetOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new OutboundTargetError("OUTBOUND_URL_INVALID");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new OutboundTargetError("OUTBOUND_SCHEME_FORBIDDEN");
  }
  if (url.username || url.password) {
    throw new OutboundTargetError("OUTBOUND_CREDENTIALS_FORBIDDEN");
  }
  if (url.hash) {
    throw new OutboundTargetError("OUTBOUND_FRAGMENT_FORBIDDEN");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || isForbiddenHostname(hostname)) {
    throw new OutboundTargetError("OUTBOUND_HOST_FORBIDDEN");
  }

  const production = options.production ?? process.env.NODE_ENV === "production";
  const allowedHosts = (options.allowedHosts ?? configuredAllowedHosts()).map(normalizeHostname);
  if (production && allowedHosts.length === 0) {
    throw new OutboundTargetError("OUTBOUND_ALLOWLIST_UNCONFIGURED");
  }
  if (allowedHosts.length > 0 && !allowedHosts.includes(hostname)) {
    throw new OutboundTargetError("OUTBOUND_HOST_NOT_ALLOWLISTED");
  }

  const resolver = options.resolver ?? defaultResolver;
  const resolverTimeoutMs = options.resolverTimeoutMs ?? 5_000;
  let addresses: string[];
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = await resolveWithTimeout(resolver, hostname, resolverTimeoutMs);
    } catch (error) {
      if (error instanceof OutboundTargetError) throw error;
      throw new OutboundTargetError("OUTBOUND_DNS_UNAVAILABLE");
    }
  }

  if (addresses.length === 0) {
    throw new OutboundTargetError("OUTBOUND_DNS_EMPTY");
  }
  if (addresses.some(isUnsafeOutboundAddress)) {
    throw new OutboundTargetError("OUTBOUND_ADDRESS_FORBIDDEN");
  }

  return url;
}
