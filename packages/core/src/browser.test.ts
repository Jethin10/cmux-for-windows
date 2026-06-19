import { describe, expect, it } from "vitest";
import { createBrowserSurface, normalizeBrowserUrl } from "./browser.js";

describe("browser surface URL normalization", () => {
  it("defaults bare hosts to https", () => {
    expect(normalizeBrowserUrl("example.com/path")).toBe("https://example.com/path");
  });

  it("allows http and https only and strips credentials", () => {
    expect(normalizeBrowserUrl("https://user:pass@example.com/")).toBe("https://example.com/");
    expect(() => normalizeBrowserUrl("file:///C:/secret.txt")).toThrow(/Unsupported/);
  });

  it("creates browser surfaces with safe titles", () => {
    expect(createBrowserSurface("browser-1", { url: "https://example.com" })).toEqual({
      id: "browser-1",
      url: "https://example.com/",
      title: "example.com",
    });
  });
});
