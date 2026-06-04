# ⚡ SparkIdea

> Capture fleeting development ideas while you code — without breaking flow.

SparkIdea is a **CLI + Claude Code skill** that lets you jot down a thought, refactor idea, or
"碎碎念" mid-task and keep going. The assistant analyses the idea **with your current
conversation context**, distils a label and a context-resolved summary, stores everything in a
single global SQLite file, and replies with just one line. Search it all back later — by keyword,
label, project, or category — and turn past ideas into a plan.

```
You:  /idea 把這個 selector memoize 起來避免重算
Claude: [已記錄] #perf: memoize 該 selector 避免重算
```

That's it. No derailing, no expansion, no context bloat.

---

## Table of contents

- [Why](#why)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Install](#install)
- [Usage](#usage)
- [CLI reference](#cli-reference)
- [Data model](#data-model)
- [Design decisions](#design-decisions)
- [Development](#development)
- [Uninstall](#uninstall)
- [License](#license)

## Why

When you're deep in an AI-assisted coding session and a side-idea strikes ("we should add retry
backoff here", "this guard belongs in a shared module"), you face a bad choice: stop and chase
it (lose focus), or ignore it (lose the idea). SparkIdea gives you a third option — capture it in
one line and stay in flow. Because capture happens **in the conversation**, the assistant can
resolve what "this" and "here" actually mean before storing.

## How it works

```
CLI (sparkidea)   ── storage engine over ~/.ideas.db; also usable in a plain terminal
Skill             ── ~/.claude/skills/sparkidea/  (SKILL.md + a bundled copy of the script)
Slash commands    ── /idea   → analyse with conversation context, store, reply one line
                     /ideas  → run a search inline (results are wanted in context)
```

- **No MCP server, no long-running process.** The skill is self-contained and shells out to its
  bundled script, which writes directly to SQLite. The script depends only on Bun's built-in
  `bun:sqlite` — zero runtime dependencies.
- **Recording happens in the main thread** (not a blind subagent) so the semantic analysis can
  use the surrounding conversation. A strict one-line reply keeps the context footprint small.
- **Search uses an FTS5 `trigram` index** over `content` + `summary`, so substring and CJK
  queries work — and elliptical ideas are findable via their resolved summary.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1
- [Claude Code](https://claude.com/claude-code)

## Install

After any method below, **restart Claude Code** (or open a new session) so the skill and slash
commands load.

### Option A — `npx skills add` (no Bun package needed)

```bash
npx skills add -g RayChang/sparkidea
```

This installs the self-contained skill (with its bundled script) into `~/.claude/skills/`. The
skill works immediately via natural language ("幫我記一下…"). To also get the `/idea` and
`/ideas` slash commands, run the one-time follow-up:

```bash
bun run ~/.claude/skills/sparkidea/scripts/index.ts install
```

### Option B — Bun global package (adds the terminal CLI)

```bash
bun add -g sparkidea     # provides the `sparkidea` terminal CLI
sparkidea install        # installs the skill + /idea and /ideas commands
```

### Option C — from a local clone

```bash
git clone https://github.com/RayChang/sparkidea.git && cd sparkidea
bun install
bun link                                          # optional: global `sparkidea` CLI on PATH
bun run skills/sparkidea/scripts/index.ts install # installs the skill + slash commands
```

## Usage

### Capture — `/idea`

```
/idea ngrx selector 應該 memoize 避免重算
/idea #perf 把 dashboard 的 polling 換成 SSE      # an explicit #perf label
/idea 這個 guard 應該抽到 shared module            # "這個" resolved from context
```

The assistant derives these fields (each optional, never fabricated):

| Field      | Example                                  | Notes                                   |
| ---------- | ---------------------------------------- | --------------------------------------- |
| `label`    | `perf`                                   | explicit `#label`, or one keyword       |
| `summary`  | `把 dashboard 的輪詢改成 SSE 推送`        | pronouns/refs **resolved from context** |
| `context`  | `重構 bkw 的即時報表時`                    | what you were doing                     |
| `refs`     | `src/dashboard/poll.ts,src/sse/stream.ts`| files in play                           |
| `category` | `refactor`                               | bug / refactor / feature / perf / …     |

The reply is always exactly one line: `[已記錄] #<label>: <summary>`.

### Retrieve — `/ideas`

```
/ideas SSE              # fuzzy keyword search (content + summary, FTS5)
/ideas #refactor        # exact label filter
/ideas @bkw auth        # project filter + keyword
/ideas                  # list everything, newest first
```

`#word` → label, `@word` → project, the rest → keyword. After results come back, ask the
assistant to summarise, group, count, or turn them into a refactor plan.

You can also just speak naturally — "幫我記一下…" / "之前那些 perf 的點子" — and the skill
triggers on intent.

## CLI reference

The same engine is available directly in a terminal:

```bash
sparkidea add "<content>" [--label x] [--summary s] [--context c] \
                          [--refs "a.ts,b.ts"] [--category t] [--project p] [--json]
sparkidea search [keyword] [--label l] [--project p] [--category t] [--limit n] [--json]
sparkidea list [--limit n] [--json]

sparkidea install      # install skill (bundled script) + slash commands
sparkidea uninstall    # remove skill + managed slash commands (keeps your data)
sparkidea --version
sparkidea --help
```

Project name and git branch are auto-detected from the working directory at write time.

## Data model

All ideas live in one global database at `~/.ideas.db` (override with the `SPARKIDEA_DB` env var).

```sql
CREATE TABLE ideas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project    TEXT,        -- basename of process.cwd()
  branch     TEXT,        -- git branch --show-current (nullable)
  label      TEXT,        -- explicit or LLM-distilled keyword
  summary    TEXT,        -- context-resolved one-liner (pronouns/refs disambiguated)
  context    TEXT,        -- short "what we were doing" note
  refs       TEXT,        -- comma-separated file paths in play
  category   TEXT,        -- bug / refactor / feature / perf / question / …
  content    TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

`label`, `summary`, `context`, `refs` and `category` are derived by the assistant from the
**conversation context** at capture time; `content` stays the verbatim idea. A companion FTS5
(`trigram`) index over `content` + `summary` powers keyword search and is kept in sync by
triggers. Existing databases are migrated automatically on open (`ALTER TABLE` + index rebuild).

## Design decisions

- **CLI + skill, not MCP.** Once a CLI writes directly to SQLite, an MCP server adds a
  long-running process and registration for no benefit. The skill bundles the script and shells
  out to it.
- **Record in the main thread, not a subagent.** A subagent starts with a fresh, blind context
  and can't see the conversation — which is exactly the context the summary needs. Pollution is
  instead controlled by a single short CLI call + a strict one-line reply.
- **`trigram` over `unicode61`.** The default tokenizer segments CJK poorly; `trigram` gives true
  substring matching for both English and Chinese. A `LIKE` fallback covers 1–2 character
  keywords that trigram can't index.
- **Never fabricate fields.** The skill is told to omit any field it can't determine rather than
  invent one.

## Development

```bash
bun install
bun run skills/sparkidea/scripts/index.ts --help   # run the CLI from source
bun run typecheck                                   # tsc --noEmit
SPARKIDEA_DB=/tmp/dev.db bun run skills/sparkidea/scripts/index.ts add "test idea" --label demo
```

Source layout — the skill directory is the single source of truth (it ships as-is via
`npx skills add`, and the npm `bin` points into its `scripts/`):

```
skills/sparkidea/
  SKILL.md             behavioural contract (analyse with context → store → one line)
  commands/            /idea and /ideas slash command templates (travel with the skill)
  scripts/
    index.ts           CLI dispatcher (add / search / list / install / uninstall)
    actions.ts         add/search/list handlers + arg parsing
    db.ts              bun:sqlite schema, migration, FTS5
    context.ts         project name + git branch detection
    install.ts         install/uninstall skill + slash commands
```

## Uninstall

```bash
sparkidea uninstall      # removes the skill + /idea, /ideas (your ~/.ideas.db is kept)
bun remove -g sparkidea  # remove the package itself
```

## License

[MIT](./LICENSE) © Ray Chang
