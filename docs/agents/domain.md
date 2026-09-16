# Domain docs

Engineering skills should use the repository's domain vocabulary and durable architecture decisions when exploring or changing code.

## Before exploring, read these when present

- `CONTEXT.md` at the repository root
- Relevant ADRs under `docs/adr/`

If either location does not exist, proceed silently. Domain-modeling creates them lazily when a term or durable decision is actually resolved.

## Layout

This repository currently uses a single domain context:

```text
/
├── CONTEXT.md
├── docs/adr/
└── apps/ and packages/
```

The pnpm workspace separates deployable applications from reusable packages, but they still implement one industrial-monitoring domain. Do not create a `CONTEXT-MAP.md` until genuinely independent domain contexts appear.

## Vocabulary and decisions

- Use terms as defined in `CONTEXT.md` and avoid rejected synonyms.
- If a needed concept is missing, reconsider whether the term is being invented or note it for domain modeling.
- Surface conflicts with an existing ADR instead of silently overriding it.

