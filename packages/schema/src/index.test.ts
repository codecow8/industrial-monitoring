import { describe, expect, it } from "vitest";
import { createSeedPageSchema, isPageSchema, validatePageSchema } from "./index";

describe("PageSchema", () => {
  it("accepts the shared seed fixture", () => {
    expect(isPageSchema(createSeedPageSchema())).toBe(true);
  });

  it("rejects an unknown component type", () => {
    const invalid = createSeedPageSchema() as unknown as {
      components: Array<{ type: string }>;
    };
    invalid.components[0].type = "line-chart";

    const result = validatePageSchema(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.instancePath.endsWith("/type"))).toBe(true);
  });

  it("rejects metric cards smaller than the contract", () => {
    const invalid = createSeedPageSchema();
    invalid.components[0].size.width = 120;

    expect(validatePageSchema(invalid).valid).toBe(false);
  });
});

