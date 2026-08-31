# ADR 0025: Privacy-Safe Feedback Diagnostic Snapshots

## Status

Accepted

## Context

Approved in-game bug-report surfaces need enough renderer health context to
identify severe release regressions. Existing renderer snapshots are far too
rich: they may contain exact dimensions, positions, asset state, warning text,
device diagnostics, or other facts that must never cross the feedback privacy
boundary. Captured pixels are also explicitly prohibited.

## Decision

The renderer exports a separate, explicit
`createFeedbackGameDiagnosticSnapshot(...)` helper.

- It never consumes a renderer object or existing general snapshot.
- It requires a trusted default-off flag decision, capability decision and
  literal user consent.
- It accepts only the exact fields needed for immediate coarse bucketing and
  closed allowlists.
- It returns `null` before reading observations when any gate is false.
- It derives surface provenance from the focused
  `@plasius/gpu-shared/feedback-diagnostics` contract rather than caller input.
- It delegates final packet validation to the shared contract.
- It snapshots enabled input data properties once and converts failures to one
  fixed, non-identifying error.
- It retains no exact measurement or state and its diagnostics module has no
  capture, transport, storage, log or analytics operation.
- It is never called automatically by the renderer lifecycle.

Only `site.generator` and `site.gpu-demo` are registered. `/player-system`
remains excluded. Reconstruction is a later server-side operation over curated
public assets and is never represented as a user screenshot.

## Consequences

- Renderer diagnostics are much less detailed than conventional telemetry, by
  design.
- Consumers cannot attach an existing renderer snapshot and must deliberately
  choose allowlisted safe facts.
- Numeric threshold changes and new surfaces require contract review.
- Turning off the feature flag safely falls back to structured-only reporting.

## Alternatives considered

- Capture or upload the canvas: rejected because pixels can carry player,
  account or narrative information.
- Filter an existing renderer snapshot: rejected because the rich shape can
  grow and silently leak new fields.
- Let the viewer build the packet directly: rejected because renderer-owned
  bucketing and shared validation provide stronger invariants and reuse.
