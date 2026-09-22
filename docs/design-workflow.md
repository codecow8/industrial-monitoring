# UI Design Workflow

## Source of truth

- One mutable HTML prototype is the UI design source.
- Vue is the executable product implementation.
- An approved prototype is required before any visible UI implementation begins.
- Git history records previous approved states without duplicate prototype files.

## Required flow for every UI change

This flow applies to complete screens and small changes such as context-menu items, buttons, copy, spacing, hover states, and icons.

1. Update `industrial-editor.html`, `prototype.jsx`, and `方案说明.md` in place.
2. Add realistic interactions and every visible state affected by the change.
3. Serve the prototype over HTTP and verify it in a real browser.
4. Record the prototype as `needs-review` in `_d_meta.json`.
5. Wait for explicit user approval.
6. Implement the approved behavior in Vue using TDD at the agreed public seam.
7. Compare the rendered implementation with the approved prototype before resolving the issue.

If implementation reveals a design change, update the same prototype and get approval again; do not silently let code become the design source.

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
