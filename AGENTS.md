# AGENTS.md

## Agent skills

### Issue tracker

Issues and specs are tracked as local Markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

This repository uses a single domain context. Read the root `CONTEXT.md` and relevant records under `docs/adr/` when they exist. See `docs/agents/domain.md`.

### UI design source

`designs/industrial-monitoring-v1/industrial-editor.html` and `prototype.jsx` are the canonical UI design source. Every visible UI change, including small controls, context menus, button adjustments, and component states, must first update these files in place and be reviewed by the user. Only after explicit prototype approval may the corresponding Vue implementation begin.

Do not create numbered prototype copies. Git history provides design history; the working tree keeps only the current prototype. Record its current review status in `_d_meta.json`.

### Intent interpretation

Treat user examples as clues to the desired outcome, not automatically as literal specifications. Before changing naming, versioning, workflow, architecture, or scope, compare the request with the current project lineage and propose the convention that best preserves continuity. Ask only when competing interpretations would materially change the result.

Do not infer or introduce UI prototype version numbers for this project.
