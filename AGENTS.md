# AGENTS.md

## Agent skills

### Issue tracker

Issues and specs are tracked as local Markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

This repository uses a single domain context. Read the root `CONTEXT.md` and relevant records under `docs/adr/` when they exist. See `docs/agents/domain.md`.

### UI design source

HTML prototypes under `designs/industrial-monitoring-v1/` are the canonical UI design source. Every visible UI change, including small controls, context menus, button adjustments, and component states, must first be added as a new prototype version and reviewed by the user. Only after explicit prototype approval may the corresponding Vue implementation begin.

Preserve approved prototype versions. Treat the approved v4 artifact as UI `v4.0.0`. Use semantic versioning for subsequent prototypes and record every review status in `_d_meta.json`.

### Intent interpretation

Treat user examples as clues to the desired outcome, not automatically as literal specifications. Before changing naming, versioning, workflow, architecture, or scope, compare the request with the current project lineage and propose the convention that best preserves continuity. Ask only when competing interpretations would materially change the result.

For UI prototype versions, treat the approved v4 artifact as `v4.0.0`: use a patch increment for visual fixes (`v4.0.1`), a minor increment for backward-compatible UI capabilities (`v4.1.0`), and a major increment for a substantial redesign (`v5.0.0`).
