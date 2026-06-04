import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

/** A single captured idea row as stored in SQLite. */
export interface Idea {
  id: number;
  project: string | null;
  branch: string | null;
  label: string | null;
  /** Context-disambiguated one-line summary (pronouns/references resolved). */
  summary: string | null;
  /** Short "what I was doing" note derived from the conversation. */
  context: string | null;
  /** Comma-separated file paths the idea relates to. */
  refs: string | null;
  /** Coarse type: bug / refactor / feature / perf / question / … */
  category: string | null;
  content: string;
  created_at: string;
}

/** Filters accepted by {@link queryIdeas}. All optional, combined with AND. */
export interface QueryFilters {
  keyword?: string;
  label?: string;
  project?: string;
  category?: string;
}

/** Columns added after v0.1; migrated onto existing databases via ALTER TABLE. */
const EXTRA_COLUMNS = ["summary", "context", "refs", "category"] as const;

/**
 * The trigram FTS5 tokenizer can only index/match runs of 3+ characters.
 * Shorter keywords (very common in CJK, e.g. 重構/驗證) must fall back to LIKE.
 */
const FTS_MIN_LEN = 3;

function resolveDbPath(): string {
  return process.env.SPARKIDEA_DB ?? join(homedir(), ".ideas.db");
}

let db: Database | null = null;

/** Lazily open the database and ensure schema + FTS index exist. */
export function getDb(): Database {
  if (db) return db;
  db = new Database(resolveDbPath(), { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ideas (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project    TEXT,
      branch     TEXT,
      label      TEXT,
      summary    TEXT,
      context    TEXT,
      refs       TEXT,
      category   TEXT,
      content    TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  migrateColumns(db);
  ensureFts(db);
  return db;
}

/** Add any post-v0.1 columns missing from an existing database. */
function migrateColumns(database: Database): void {
  const existing = new Set(
    database.query<{ name: string }, []>("PRAGMA table_info(ideas)").all().map((r) => r.name),
  );
  for (const col of EXTRA_COLUMNS) {
    if (!existing.has(col)) database.exec(`ALTER TABLE ideas ADD COLUMN ${col} TEXT`);
  }
}

/**
 * Create/upgrade the FTS5 trigram index over (content, summary) plus sync
 * triggers, backfilling when the index is first introduced or its shape
 * changes. External-content table (content='ideas') stores only the index.
 */
function ensureFts(database: Database): void {
  const ftsExisted = database
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ideas_fts'",
    )
    .get();

  // If an older single-column index exists, drop it so we can index summary too.
  let hasSummaryCol = false;
  if (ftsExisted) {
    hasSummaryCol = database
      .query<{ name: string }, []>("PRAGMA table_info(ideas_fts)")
      .all()
      .some((r) => r.name === "summary");
    if (!hasSummaryCol) {
      database.exec(`
        DROP TRIGGER IF EXISTS ideas_ai;
        DROP TRIGGER IF EXISTS ideas_ad;
        DROP TRIGGER IF EXISTS ideas_au;
        DROP TABLE IF EXISTS ideas_fts;
      `);
    }
  }

  const freshIndex = !ftsExisted || !hasSummaryCol;

  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ideas_fts USING fts5(
      content,
      summary,
      content='ideas',
      content_rowid='id',
      tokenize='trigram'
    );

    CREATE TRIGGER IF NOT EXISTS ideas_ai AFTER INSERT ON ideas BEGIN
      INSERT INTO ideas_fts(rowid, content, summary) VALUES (new.id, new.content, new.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS ideas_ad AFTER DELETE ON ideas BEGIN
      INSERT INTO ideas_fts(ideas_fts, rowid, content, summary)
        VALUES ('delete', old.id, old.content, old.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS ideas_au AFTER UPDATE ON ideas BEGIN
      INSERT INTO ideas_fts(ideas_fts, rowid, content, summary)
        VALUES ('delete', old.id, old.content, old.summary);
      INSERT INTO ideas_fts(rowid, content, summary) VALUES (new.id, new.content, new.summary);
    END;
  `);

  if (freshIndex) {
    const rows = database.query<{ n: number }, []>("SELECT count(*) AS n FROM ideas").get();
    if (rows && rows.n > 0) {
      database.exec("INSERT INTO ideas_fts(ideas_fts) VALUES ('rebuild');");
    }
  }
}

/** Insert a new idea and return the persisted row. */
export function insertIdea(input: {
  project: string | null;
  branch: string | null;
  label: string | null;
  summary?: string | null;
  context?: string | null;
  refs?: string | null;
  category?: string | null;
  content: string;
}): Idea {
  const stmt = getDb().query<Idea, (string | null)[]>(
    `INSERT INTO ideas (project, branch, label, summary, context, refs, category, content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *;`,
  );
  const row = stmt.get(
    input.project,
    input.branch,
    input.label,
    input.summary ?? null,
    input.context ?? null,
    input.refs ?? null,
    input.category ?? null,
    input.content,
  );
  if (!row) throw new Error("Failed to insert idea");
  return row;
}

/** Wrap a user keyword as a single FTS5 string literal (escaping quotes). */
function toFtsQuery(keyword: string): string {
  return `"${keyword.replace(/"/g, '""')}"`;
}

/**
 * Query ideas with optional keyword, label, project and category filters;
 * newest-first. Keyword search is hybrid: 3+ char keywords use the FTS5 trigram
 * index over content+summary; shorter keywords fall back to LIKE over both.
 */
export function queryIdeas(filters: QueryFilters): Idea[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  const keyword = filters.keyword?.trim();
  const useFts = !!keyword && keyword.length >= FTS_MIN_LEN;

  const from = useFts ? "ideas i JOIN ideas_fts ON ideas_fts.rowid = i.id" : "ideas i";

  if (keyword) {
    if (useFts) {
      clauses.push("ideas_fts MATCH ?");
      params.push(toFtsQuery(keyword));
    } else {
      clauses.push("(i.content LIKE ? OR i.summary LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
  }
  if (filters.label) {
    clauses.push("i.label = ?");
    params.push(filters.label);
  }
  if (filters.project) {
    clauses.push("i.project = ?");
    params.push(filters.project);
  }
  if (filters.category) {
    clauses.push("i.category = ?");
    params.push(filters.category);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const sql = `SELECT i.* FROM ${from} ${where} ORDER BY i.created_at DESC, i.id DESC;`;
  return getDb()
    .query<Idea, (string | number)[]>(sql)
    .all(...params);
}
