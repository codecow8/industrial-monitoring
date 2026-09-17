# Versioned HTML Prototypes

This folder is the canonical UI design source for the industrial monitoring project.

- Preserve approved versions as review records.
- Treat approved v4 as the `v4.0.0` baseline. Use `v4.0.x` for visual fixes, `v4.x.0` for backward-compatible UI capabilities, and `v5.0.0` for a substantial redesign.
- Serve prototypes over HTTP; do not review multi-file prototypes through `file://`.
- Update `_d_meta.json` with `needs-review`, `approved`, or `changes-requested`.
- Begin Vue implementation only after explicit prototype approval.

See [`docs/design-workflow.md`](../../docs/design-workflow.md).
