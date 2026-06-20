export interface SqlExecutor {
  execute(sql: string): Promise<void> | void;
  query<T>(sql: string): Promise<T[]> | T[];
  transaction<T>(fn: () => Promise<T> | T): Promise<T> | T;
}

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const initialMigrations: readonly Migration[] = [
  {
    id: 1,
    name: "initial-domain-schema",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        trusted INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        active_session_id TEXT,
        git_summary TEXT,
        unread_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        prompt TEXT,
        provider TEXT NOT NULL,
        template_id TEXT,
        terminal_session_id TEXT,
        cwd TEXT NOT NULL,
        status TEXT NOT NULL,
        status_reason TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        last_activity_at TEXT NOT NULL,
        last_notification_id TEXT,
        resume_command TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS terminal_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        agent_session_id TEXT,
        profile_id TEXT NOT NULL,
        command TEXT NOT NULL,
        args_json TEXT NOT NULL,
        cwd TEXT NOT NULL,
        cols INTEGER NOT NULL,
        rows INTEGER NOT NULL,
        status TEXT NOT NULL,
        pid INTEGER,
        exit_code INTEGER,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(agent_session_id) REFERENCES agent_sessions(id)
      );

      CREATE TABLE IF NOT EXISTS domain_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        workspace_id TEXT,
        agent_session_id TEXT,
        terminal_session_id TEXT,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `,
  },
  {
    id: 2,
    name: "supervisor-persistence-schema",
    sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        agent_session_id TEXT,
        terminal_session_id TEXT,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(agent_session_id) REFERENCES agent_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_workspace_read_created
        ON notifications(workspace_id, read, created_at);

      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        agent_session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        risk TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(agent_session_id) REFERENCES agent_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_approval_requests_workspace_status_created
        ON approval_requests(workspace_id, status, created_at);

      CREATE TABLE IF NOT EXISTS pane_layouts (
        workspace_id TEXT PRIMARY KEY,
        layout_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS transcript_records (
        terminal_session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        workspace_id TEXT NOT NULL,
        agent_session_id TEXT,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        PRIMARY KEY(terminal_session_id, sequence),
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(agent_session_id) REFERENCES agent_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_transcript_records_workspace_created
        ON transcript_records(workspace_id, created_at);
    `,
  },
];

interface AppliedMigrationRow {
  id: number;
}

export class MigrationRunner {
  constructor(private readonly db: SqlExecutor) {}

  async apply(migrations: readonly Migration[]): Promise<number[]> {
    const applied: number[] = [];
    await this.db.transaction(async () => {
      await this.db.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);",
      );
      const rows = await this.db.query<AppliedMigrationRow>("SELECT id FROM schema_migrations");
      const appliedIds = new Set(rows.map((row) => row.id));
      for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
        if (appliedIds.has(migration.id)) continue;
        await this.db.execute(migration.sql);
        await this.db.execute(
          `INSERT INTO schema_migrations (id, name) VALUES (${migration.id}, '${escapeSql(migration.name)}');`,
        );
        applied.push(migration.id);
      }
    });
    return applied;
  }
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

export class MemorySqlExecutor implements SqlExecutor {
  readonly statements: string[] = [];
  private readonly migrations = new Set<number>();

  execute(sql: string): void {
    this.statements.push(sql);
    const match = /INSERT INTO schema_migrations \(id, name\) VALUES \((\d+),/.exec(sql);
    if (match?.[1]) this.migrations.add(Number(match[1]));
  }

  query<T>(_sql: string): T[] {
    return [...this.migrations].map((id) => ({ id }) as T);
  }

  transaction<T>(fn: () => T): T {
    return fn();
  }
}
