export type RegistryAuthCheck = {
  ok: boolean;
  authenticated: boolean;
  configurationError: boolean;
};

const UNAUTHENTICATED_REGISTRY_ENVIRONMENTS = new Set(["local", "development", "test"]);

/**
 * Apply the registry's one authentication policy to every mutating registry route.
 * Local, development, and test may opt into explicitly unauthenticated registration
 * only when no registry token is configured; all other environments fail closed.
 */
export function checkRegistryAuth(request: Request): RegistryAuthCheck {
  const expected = process.env.CAPI_REGISTRY_TOKEN?.trim();
  const header = request.headers.get("authorization")?.trim() ?? "";
  const presented = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  if (!expected) {
    const environment = process.env.NODE_ENV?.trim().toLowerCase() ?? "";
    if (!UNAUTHENTICATED_REGISTRY_ENVIRONMENTS.has(environment)) {
      return { ok: false, authenticated: false, configurationError: true };
    }
    return { ok: true, authenticated: false, configurationError: false };
  }

  if (presented && presented === expected) {
    return { ok: true, authenticated: true, configurationError: false };
  }

  return { ok: false, authenticated: false, configurationError: false };
}
