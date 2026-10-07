import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("retired ops/validate probe", () => {
  it("answers 410 instead of claiming an evidence commitment it cannot make", async () => {
    const response = POST();
    expect(response.status).toBe(410);
    expect((await response.json()).error).toBe("OPS_VALIDATE_RETIRED");
  });
});
