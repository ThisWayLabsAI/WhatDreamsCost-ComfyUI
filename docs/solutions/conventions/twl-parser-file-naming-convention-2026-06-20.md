---
title: TWL Parser File Naming Convention
date: 2026-06-20
track: knowledge
problem_type: conventions
applies_when: Renaming project files to align with an established naming convention,
  especially when files are referenced across source code, tests, and documentation.
tags:
  - twl
  - file-rename
  - naming-convention
  - ltx-director
  - upstream-merges
---

## Context

TWL-owned Shot List parser files were renamed with a `twl` prefix to align with the project's naming convention. The integration strategy at `docs/twl-upstream-integration-strategy.md` already prescribed that "new TWL-specific UI files should include `twl` in the filename so ownership is obvious during future diffs and merges," but listed the parser files as exceptions ("can remain generic"). The rename enforced the convention and removed the exception.

Three files were renamed:

- `js/ltx_director_shot_script.js` → `js/ltx_director_twl_shot_script.js`
- `js/ltx_director_shot_script.d.ts` → `js/ltx_director_twl_shot_script.d.ts`
- `tests/ltx_director_shot_script.test.js` → `tests/ltx_director_twl_shot_script.test.js`

Fourteen references across five files (require paths in source and tests, doc file-path references) were updated in tandem.

## Guidance

When renaming files that have internal cross-references, use a systematic workflow:

1. **Catalog** — `grep` the entire repo for every reference to the old filename before making any changes
2. **Rename** — use filesystem commands (e.g., `Rename-Item` on Windows, `mv` on Unix) to rename the source files
3. **Update** — apply targeted edits to all require/import paths and documentation references
4. **Verify** — re-grep to confirm zero stale references remain to the old filename
5. **Test** — run the full test suite to validate correctness

When a convention has documented exceptions, assess whether the exceptions are worth keeping or if removing them simplifies the rule and reduces confusion during future upstream merges.

## Why This Matters

Consistent naming conventions make file ownership obvious during upstream diffs and merges. A reviewer or merge tool can immediately tell which files are TWL-owned (`twl` in the filename) versus upstream-owned. Keeping exceptions to the convention undermines this value — every exception is a question a future developer has to answer again.

A methodical rename workflow prevents the most common failure modes: broken imports, stale doc references, and silent test-skips from require() paths that fail but are caught by the test runner.

## When to Apply

- When renaming any project file to align with an established naming convention
- When the project's strategy or convention doc lists exceptions — assess whether they are still justified
- When files are referenced across multiple layers: source code, tests, and documentation

## Examples

**TWL parser rename (this doc):**

Before — 14 references to three files across JS source, JS tests, and markdown docs:

```
js/ltx_director_shot_script.js
js/ltx_director_shot_script.d.ts
tests/ltx_director_shot_script.test.js
```

After — all files and references updated:

```
js/ltx_director_twl_shot_script.js
js/ltx_director_twl_shot_script.d.ts
tests/ltx_director_twl_shot_script.test.js
```

Each require path was updated (e.g., `require("./ltx_director_shot_script.js")` → `require("./ltx_director_twl_shot_script.js")`) and every doc reference was updated. The strategy doc's "exceptions" section was removed. All 27 tests passed — zero stale references confirmed by grep.

**Evaluating convention exceptions:**

A strategy doc says "all TWL-owned files should include `twl` in their filename" but lists an exception. Before removing the exception, verify: (a) is there a technical reason for the exception? (b) would removing it create naming conflicts with upstream? (c) do any external tools expect the old filename? In this case the answer to all three was "no."
