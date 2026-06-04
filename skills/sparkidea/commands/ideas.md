---
description: 🔍 Search and review ideas captured in SparkIdea
argument-hint: "[keyword] [#label] [@project] — all optional"
allowed-tools: Bash(bun run*)
---
<!-- sparkidea-managed: do not edit; reinstalled by `sparkidea install` -->

Retrieve captured ideas and help the user make sense of them.

Parse this request into search arguments:

$ARGUMENTS

Parsing rules:
- A `#word` token → `--label word` (exact match).
- A `@word` token → `--project word` (exact match).
- Any remaining free text → the keyword positional (fuzzy content search).
- If the request is empty, run with no filters to list everything (newest first).

Then run the bundled SparkIdea script in the main context (no subagent — the results are
wanted here):

```bash
bun run "$HOME/.claude/skills/sparkidea/scripts/index.ts" search "<keyword>" --label <label> --project <project>
```

Omit any flag that wasn't provided. After it returns, present the rows concisely (date, branch,
label, content). You may summarise, group, count, or expand them into a refactor plan as asked.
