import { describe, expect, it } from "vitest";
import { assertValidTerminalSize } from "./index.js";

describe("assertValidTerminalSize", () => {
  it("rejects zero-size terminals", () => {
    expect(() => assertValidTerminalSize(0, 24)).toThrow(/0x0/);
    expect(() => assertValidTerminalSize(80, 0)).toThrow(/0x0/);
  });
});
