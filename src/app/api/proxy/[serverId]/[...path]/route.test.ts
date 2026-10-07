import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH, POST, PUT } from "./route";

// The proxy used to forward any method to a registered MCP server, bypassing
// CAPPO, whenever BYOS_INTERNAL_API_KEY was set. It must stay closed even then.
describe("retired transparent proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([["GET", GET], ["POST", POST], ["PUT", PUT], ["PATCH", PATCH], ["DELETE", DELETE]])(
    "%s answers 410 and never reaches a target, even with the old key configured",
    async (_method, handler) => {
      vi.stubEnv("BYOS_INTERNAL_API_KEY", "would-have-unlocked-it");
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const response = handler();
      expect(response.status).toBe(410);
      expect((await response.json()).error).toBe("LEGACY_EXECUTION_ENTRYPOINT_RETIRED");
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});
