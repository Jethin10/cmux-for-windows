import { describe, expect, it } from "vitest";
import { initialMigrations, MemorySqlExecutor, MigrationRunner } from "./index.js";

describe("MigrationRunner", () => {
  it("applies migrations once in order", async () => {
    const db = new MemorySqlExecutor();
    const runner = new MigrationRunner(db);

    await expect(runner.apply(initialMigrations)).resolves.toEqual([1, 2]);
    await expect(runner.apply(initialMigrations)).resolves.toEqual([]);
    expect(
      db.statements.some((statement) =>
        statement.includes("CREATE TABLE IF NOT EXISTS workspaces"),
      ),
    ).toBe(true);
    expect(
      db.statements.some((statement) =>
        statement.includes("CREATE TABLE IF NOT EXISTS approval_requests"),
      ),
    ).toBe(true);
    expect(
      db.statements.some((statement) =>
        statement.includes("CREATE TABLE IF NOT EXISTS transcript_records"),
      ),
    ).toBe(true);
  });
});
