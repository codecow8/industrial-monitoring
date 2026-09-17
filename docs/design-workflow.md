# UI Design Workflow

## Source of truth

- Versioned HTML prototypes are the UI design source.
- Vue is the executable product implementation.
- An approved prototype is required before any visible UI implementation begins.
- Previously approved prototype versions are immutable review records.

## Required flow for every UI change

This flow applies to complete screens and small changes such as context-menu items, buttons, copy, spacing, hover states, and icons.

1. Create the next HTML/JSX prototype version under `designs/industrial-monitoring-v1/`.
2. Add realistic interactions and every visible state affected by the change.
3. Serve the prototype over HTTP and verify it in a real browser.
4. Record the version as `needs-review` in `_d_meta.json`.
5. Wait for explicit user approval.
6. Implement the approved behavior in Vue using TDD at the agreed public seam.
7. Compare the rendered implementation with the approved prototype before resolving the issue.

If implementation reveals a design change, update a new prototype version and get approval again; do not silently let code become the design source.

## Versioning

- The approved historical v4 prototype is normalized as the `v4.0.0` UI baseline.
- Visual corrections without a new capability increment the patch version: `v4.0.1`, `v4.0.2`.
- Backward-compatible UI capabilities increment the minor version: `v4.1.0`, `v4.2.0`.
- A substantial redesign of the application shell, information architecture, or overall visual system increments the major version: `v5.0.0`.
- Historical files v1–v4 keep their existing filenames; do not rename approved records retroactively.

## What belongs in the prototype

- Application screens, dialogs, drawers, overlays, menus, buttons, and icons
- Default, hover, focus, disabled, warning, stale, and empty states
- Interaction intent, component positioning, drag/resize affordances, and visible transitions
- Representative simulated data for real-time states

## What belongs only in code and tests

- WebSocket and reconnection mechanics
- Telemetry sampling timers
- PageSchema validation and persistence
- Database and backend authorization behavior

The prototype simulates the visible result of these mechanics without becoming a second production implementation.
